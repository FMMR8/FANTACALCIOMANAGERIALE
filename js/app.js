import * as calc from "./calc.js";
import {
  caricaSquadra, salvaSquadra, elencoSquadre, eliminaSquadra, creaProposta, elencoProposte, aggiornaProposta, eliminaProposta,
  caricaLega, creaLega, elencoLeghe, eliminaLega, caricaSuperAdmin, creaSuperAdmin,
  inviaSupporto, elencoSupporto, eliminaSupporto,
} from "./storage.js";

let stato = null;   // stato della squadra corrente, in memoria
let nickCorrente = null;
let legaCorrente = null; // id della lega in cui si è entrati (slug del nome), tutto vive dentro questa
let legaDatiCorrente = null; // { nomeLega, pinAdmin, dataCreazione } della lega in cui si è entrati
let adminVenutoDaSuperAdmin = false; // per sapere dove torna "Esci" dalla schermata Admin
let elencoAltreSquadreCache = null; // cache dei nomi delle altre squadre, per i menu "Controparte"/"Comprato da"
let squadraCacheAcquistoFuoriAsta = null; // { nickname, rosa } scaricata per "Acquisti fuori asta"
let squadraCachePrestitoGiocatore = null; // { nickname, rosa } scaricata per "Prestiti giocatori"
let tabAttiva = "anagrafica";
let mercatoSottoTab = "sfoglia"; // "sfoglia" | "offerte" | "completate", dentro la schermata Mercato
let mercatoSquadraScelta = null; // { nickname, rosa } della squadra che si sta sfogliando in "Proposte"
let mercatoOffertaAperta = null; // indice del giocatore per cui è aperto il modulo offerta, in "sfoglia"
let salvataggioTimer = null;

// ---------- Tutti i campi testo del sito si scrivono in MAIUSCOLO ----------
// Delegazione sul document: copre anche i campi aggiunti dopo (tab renderizzate dinamicamente),
// senza dover toccare ogni singolo input. Il PIN (numerico) non viene toccato, è innocuo comunque.
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el && el.tagName === "INPUT" && el.type === "text") {
    const inizio = el.selectionStart, fine = el.selectionEnd;
    el.value = el.value.toUpperCase();
    if (inizio !== null) el.setSelectionRange(inizio, fine); // non perde la posizione del cursore
  }
});

// ---------- Stato iniziale per una squadra nuova ----------
function statoVuoto(nickname, pin) {
  return {
    nickname, pin,
    nomeSquadra: nickname, allenatore: "", presidente: "",
    stagioneCorrente: new Date().getFullYear(),
    capitaleIniziale: 500, capitaleAsta: 0,
    stadioIdx: 0, investitoQuestAnno: false,
    partiteCasa: 0, vittorieCasa: 0, pareggiCasa: 0,
    bonusCampionatoScorso: false, bonusChampionsScorso: false, bonusCoppaScorso: false,
    piazzamentoCampionato: null, piazzamentoCoppa: null, risultatoChampions: null,
    rosa: [],
    acquistiAsta: [], cessioni: [], svincoli: [], acquistiFuoriAsta: [], prestitiBancari: [], prestitiGiocatori: [],
    aumentiCapitale: 0, costiVari: 0, multe: 0,
    storicoStagioni: [], registroModifiche: [],
  };
}

// ---------- Navigazione tra schermate ----------
function mostraSchermata(id) {
  // Forzo sia l'attributo "hidden" sia lo stile in linea, per essere sicuri
  // che la schermata precedente sparisca davvero anche se qualche CSS in conflitto interferisse.
  for (const s of document.querySelectorAll(".schermata")) {
    s.hidden = true;
    s.style.display = "none";
  }
  const target = document.getElementById(id);
  target.hidden = false;
  target.style.display = ""; // toglie il "none" e lascia decidere al CSS (es. flex per centrare)
}

// ---------- ACCESSO (scegli lega -> crea/cerca -> nickname+PIN dentro quella lega) ----------
const ADMIN_NICKNAME = "ADMIN";
const SUPERADMIN_KEYWORD = "RAITIRAITIRAITI";

function slugLega(nome) {
  return nome.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // toglie accenti
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

document.getElementById("btn-vai-crea-lega").addEventListener("click", () => mostraSchermata("schermata-crea-lega"));
document.getElementById("btn-vai-cerca-lega").addEventListener("click", () => mostraSchermata("schermata-cerca-lega"));
document.getElementById("btn-crea-lega-torna").addEventListener("click", () => mostraSchermata("schermata-scegli-lega"));
document.getElementById("btn-cerca-lega-torna").addEventListener("click", () => mostraSchermata("schermata-scegli-lega"));
document.getElementById("btn-accesso-torna").addEventListener("click", () => { legaCorrente = null; legaDatiCorrente = null; mostraSchermata("schermata-scegli-lega"); });

document.getElementById("btn-apri-supporto").addEventListener("click", () => {
  document.getElementById("supp-nome").value = "";
  document.getElementById("supp-messaggio").value = "";
  document.getElementById("errore-supporto").hidden = true;
  document.getElementById("successo-supporto").hidden = true;
  mostraSchermata("schermata-supporto");
});
document.getElementById("btn-supporto-torna").addEventListener("click", () => mostraSchermata("schermata-scegli-lega"));
document.getElementById("btn-invia-supporto").addEventListener("click", async () => {
  const nome = document.getElementById("supp-nome").value.trim();
  const contatto = document.getElementById("supp-contatto").value.trim();
  const messaggio = document.getElementById("supp-messaggio").value.trim();
  const errEl = document.getElementById("errore-supporto");
  const okEl = document.getElementById("successo-supporto");
  errEl.hidden = true; okEl.hidden = true;
  if (!nome) { errEl.textContent = "Scrivi il tuo nome."; errEl.hidden = false; return; }
  if (!contatto) { errEl.textContent = "Scrivi come farti ricontattare (email o telefono)."; errEl.hidden = false; return; }
  if (!messaggio) { errEl.textContent = "Scrivi il problema che hai."; errEl.hidden = false; return; }
  try {
    await inviaSupporto({ nome, contatto, messaggio, dataInvio: new Date().toISOString(), risolto: false });
    document.getElementById("supp-nome").value = "";
    document.getElementById("supp-contatto").value = "";
    document.getElementById("supp-messaggio").value = "";
    okEl.hidden = false;
  } catch (e) {
    errEl.textContent = "Errore: " + (e && e.message ? e.message : e);
    errEl.hidden = false;
  }
});

document.getElementById("btn-crea-lega").addEventListener("click", async () => {
  const nomeLega = document.getElementById("cl-nome-lega").value.trim();
  const pinAdmin = document.getElementById("cl-pin-admin").value.trim();
  const errEl = document.getElementById("errore-crea-lega");
  errEl.hidden = true;
  if (!nomeLega) { errEl.textContent = "Scrivi un nome per la lega."; errEl.hidden = false; return; }
  if (!/^\d{4}$/.test(pinAdmin)) { errEl.textContent = "Il PIN deve avere 4 cifre."; errEl.hidden = false; return; }
  const legaId = slugLega(nomeLega);
  if (!legaId) { errEl.textContent = "Nome lega non valido."; errEl.hidden = false; return; }
  try {
    const esistente = await caricaLega(legaId);
    if (esistente) { errEl.textContent = "Esiste già una lega con questo nome (o troppo simile)."; errEl.hidden = false; return; }
    await creaLega(legaId, { nomeLega, pinAdmin, dataCreazione: new Date().toISOString() });
    legaCorrente = legaId;
    legaDatiCorrente = { nomeLega, pinAdmin };
    adminVenutoDaSuperAdmin = false;
    await renderAdmin();
  } catch (e) {
    errEl.textContent = "Errore: " + (e && e.message ? e.message : e);
    errEl.hidden = false;
  }
});

document.getElementById("btn-cerca-lega").addEventListener("click", async () => {
  const testo = document.getElementById("cerca-nome-lega").value.trim();
  const errEl = document.getElementById("errore-cerca-lega");
  errEl.hidden = true;
  if (!testo) { errEl.textContent = "Scrivi il nome della lega."; errEl.hidden = false; return; }

  if (testo.toUpperCase() === SUPERADMIN_KEYWORD) {
    const pin = prompt("PIN super-admin (4 cifre):");
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) { errEl.textContent = "Il PIN deve avere 4 cifre."; errEl.hidden = false; return; }
    try {
      let sa = await caricaSuperAdmin();
      if (!sa) { await creaSuperAdmin(pin); sa = { pin }; }
      else if (sa.pin !== pin) { errEl.textContent = "PIN super-admin non corretto."; errEl.hidden = false; return; }
      await renderSuperAdmin();
    } catch (e) {
      errEl.textContent = "Errore: " + (e && e.message ? e.message : e);
      errEl.hidden = false;
    }
    return;
  }

  try {
    const leghe = await elencoLeghe();
    const trovata = leghe.find(l => (l.nomeLega || "").trim().toLowerCase() === testo.toLowerCase());
    if (!trovata) { errEl.textContent = "Lega non trovata."; errEl.hidden = false; return; }
    legaCorrente = trovata.legaId;
    legaDatiCorrente = trovata;
    document.getElementById("accesso-nome-lega").textContent = `Lega: ${trovata.nomeLega}`;
    document.getElementById("input-nickname").value = "";
    document.getElementById("input-pin").value = "";
    mostraSchermata("schermata-accesso");
  } catch (e) {
    errEl.textContent = "Errore: " + (e && e.message ? e.message : e);
    errEl.hidden = false;
  }
});

document.getElementById("btn-entra").addEventListener("click", async () => {
  const nickname = document.getElementById("input-nickname").value.trim();
  const pin = document.getElementById("input-pin").value.trim();
  const errEl = document.getElementById("errore-accesso");
  errEl.hidden = true;

  if (!nickname) { errEl.textContent = "Inserisci il nome della tua squadra."; errEl.hidden = false; return; }
  if (!/^\d{4}$/.test(pin)) { errEl.textContent = "Il PIN deve avere 4 cifre."; errEl.hidden = false; return; }

  if (nickname.toUpperCase() === ADMIN_NICKNAME) {
    if (!legaDatiCorrente || legaDatiCorrente.pinAdmin !== pin) {
      errEl.textContent = "PIN ADMIN non corretto.";
      errEl.hidden = false;
      return;
    }
    adminVenutoDaSuperAdmin = false;
    await renderAdmin();
    return;
  }

  let dati;
  try {
    dati = await caricaSquadra(legaCorrente, nickname);
  } catch (e) {
    errEl.textContent = "Errore: " + (e && e.message ? e.message : e);
    errEl.hidden = false;
    return;
  }

  if (!dati) {
    errEl.textContent = "Squadra non trovata. Chiedi all'ADMIN di lega di crearla.";
    errEl.hidden = false;
    return;
  }
  if (dati.pin !== pin) {
    errEl.textContent = "PIN non corretto per questa squadra.";
    errEl.hidden = false;
    return;
  }
  stato = dati;
  nickCorrente = nickname;
  entraNellaSquadra();
});

document.getElementById("btn-superadmin-esci").addEventListener("click", () => {
  mostraSchermata("schermata-scegli-lega");
});

document.getElementById("btn-torna-squadra").addEventListener("click", () => {

  if (stato) { mostraSchermata("schermata-squadra"); } else { mostraSchermata("schermata-accesso"); }
});
document.getElementById("btn-istruzioni").addEventListener("click", () => renderIstruzioni());
document.getElementById("btn-istruzioni-torna").addEventListener("click", () => {
  if (stato) { mostraSchermata("schermata-squadra"); } else { mostraSchermata("schermata-accesso"); }
});
document.getElementById("btn-altre-squadre").addEventListener("click", () => renderAltreSquadre());
document.getElementById("btn-altre-squadre-torna").addEventListener("click", () => {
  if (stato) { mostraSchermata("schermata-squadra"); } else { mostraSchermata("schermata-accesso"); }
});
document.getElementById("btn-mercato").addEventListener("click", () => renderProposte());
document.getElementById("btn-proposte-torna").addEventListener("click", () => {
  if (stato) { mostraSchermata("schermata-squadra"); renderTab(tabAttiva); } else { mostraSchermata("schermata-accesso"); }
});
// Tutto il testo scritto (nomi squadra, giocatori, allenatore, ecc.) diventa maiuscolo da solo,
// qualunque cosa scrivi — un solo ascoltatore globale, vale per ogni casella di testo del sito.
document.addEventListener("input", (e) => {
  if (e.target.tagName === "INPUT" && e.target.type === "text") {
    const inizio = e.target.selectionStart, fine = e.target.selectionEnd;
    e.target.value = e.target.value.toUpperCase();
    e.target.setSelectionRange(inizio, fine); // il cursore resta dove era, non salta in fondo
  }
});

document.getElementById("btn-esci").addEventListener("click", () => {
  stato = null; nickCorrente = null;
  document.getElementById("input-nickname").value = "";
  document.getElementById("input-pin").value = "";
  mostraSchermata("schermata-accesso");
});

function entraNellaSquadra() {
  document.getElementById("nome-squadra-titolo").textContent = stato.nomeSquadra || nickCorrente;
  mostraSchermata("schermata-squadra");
  renderTab(tabAttiva);
  precaricaElencoAltreSquadre();
  aggiornaBadgeProposte();
}

// Conta le proposte che richiedono un'azione tua (tocca a te rispondere, o accettata ma non ancora
// completata dal tuo lato) e aggiorna il numeretto piccolo sul tasto "Mercato".
function aggiornaBadgeProposte() {
  elencoProposte(legaCorrente).then(proposte => {
    const azionabili = proposte.filter(p => {
      const sonoProponente = p.proponenteNickname === nickCorrente;
      const sonoProprietario = p.proprietarioNickname === nickCorrente;
      if (!sonoProponente && !sonoProprietario) return false;
      if (p.stato === "in_trattativa") {
        if (sonoProponente && p.turnoDi === "proponente") return true;
        if (sonoProprietario && p.turnoDi === "proprietario") return true;
      }
      if (p.stato === "accettato") {
        if (sonoProponente && !p.completatoDaProponente) return true;
        if (sonoProprietario && !p.completatoDaProprietario) return true;
      }
      return false;
    });
    const badge = document.getElementById("badge-proposte");
    if (azionabili.length > 0) { badge.textContent = azionabili.length; badge.hidden = false; }
    else { badge.hidden = true; }
  }).catch(() => {});
}

// Scarica l'elenco delle altre squadre subito all'ingresso, non solo quando apri Mercato —
// così quando arrivi su Mercato il menu "Controparte" è già una tendina vera, non testo libero in attesa.
function precaricaElencoAltreSquadre() {
  if (elencoAltreSquadreCache !== null) return; // già fatto o già in corso
  elencoAltreSquadreCache = [];
  elencoSquadre(legaCorrente).then(squadre => {
    elencoAltreSquadreCache = squadre
      .filter(s => s.nickname !== nickCorrente && s.nickname !== "_presidente")
      .map(s => ({ nickname: s.nickname, nomeSquadra: s.nomeSquadra || s.nickname }));
    if (tabAttiva === "gestione-rosa") renderTab("gestione-rosa");
  }).catch(() => { elencoAltreSquadreCache = []; });
}

// ---------- Salvataggio automatico (con piccolo ritardo, per non scrivere ad ogni tasto) ----------
function programmaSalvataggio() {
  if (salvataggioTimer) clearTimeout(salvataggioTimer);
  salvataggioTimer = setTimeout(async () => {
    if (nickCorrente) await salvaSquadra(legaCorrente, nickCorrente, stato);
  }, 600);
}

// ---------- Tab navigation ----------
for (const btn of document.querySelectorAll(".tab-btn")) {
  btn.addEventListener("click", () => {
    document.querySelector(".tab-btn.attivo")?.classList.remove("attivo");
    btn.classList.add("attivo");
    tabAttiva = btn.dataset.tab;
    renderTab(tabAttiva);
  });
}

function renderTab(tab) {
  const el = document.getElementById("contenuto-tab");
  if (tab === "anagrafica") el.innerHTML = renderAnagrafica();
  else if (tab === "stadio") el.innerHTML = renderStadio();
  else if (tab === "sponsor") el.innerHTML = renderSponsor();
  else if (tab === "rosa") el.innerHTML = renderRosa();
  else if (tab === "gestione-rosa") el.innerHTML = renderGestioneRosa();
  else if (tab === "prestiti") el.innerHTML = renderPrestiti();
  else if (tab === "bilancio") el.innerHTML = renderBilancio();
  agganciaEventi(tab);
}

// ============================================================
// TAB: ANAGRAFICA
// ============================================================
function renderAnagrafica() {
  return `
  <div class="sezione">
    <h3>Anagrafica società</h3>
    <div class="griglia-2">
      <div class="campo">
        <label>Nome società</label>
        <input type="text" id="f-nome-squadra" value="${stato.nomeSquadra || ""}" />
      </div>
      <div class="campo">
        <label>Presidente</label>
        <input type="text" id="f-presidente" value="${stato.presidente || ""}" />
      </div>
      <div class="campo">
        <label>Allenatore</label>
        <input type="text" id="f-allenatore" value="${stato.allenatore || ""}" />
      </div>
      <div class="campo">
        <label>Stagione corrente</label>
        <select id="f-stagione">
          ${Array.from({ length: 15 }, (_, i) => 2026 + i).map(anno =>
            `<option value="${anno}" ${anno === stato.stagioneCorrente ? "selected" : ""}>${anno}/${String(anno + 1).slice(-2)}</option>`
          ).join("")}
        </select>
      </div>
    </div>
  </div>`;
}

// ============================================================
// TAB: STADIO
// ============================================================
function renderStadio() {
  const opzioni = calc.STADI.map((s, i) =>
    `<option value="${i}" ${stato.stadioIdx === i ? "selected" : ""}>${s.nome}</option>`).join("");
  const stadioSel = calc.STADI[stato.stadioIdx];
  const investNota = stadioSel.investimento
    ? `Investimento per salire dal livello attuale al successivo: <b>${calc.STADI[stato.stadioIdx + 1]?.investimento ?? "—"}</b> mln (una tantum)`
    : `Investimento per salire al livello successivo: <b>${calc.STADI[1].investimento}</b> mln (una tantum)`;

  return `
  <div class="sezione">
    <h3>Stadio</h3>
    <div class="campo">
      <label>Capienza</label>
      <select id="f-stadio-idx">${opzioni}</select>
    </div>
    <p style="font-size:13px;color:var(--gesso-ombra)">
      Costo annuale: <b style="color:var(--gesso)">${stadioSel.costo} mln</b> —
      Sconfitta ${stadioSel.sconfitta.toFixed(2)} · Pareggio ${stadioSel.pareggio.toFixed(2)} · Vittoria ${stadioSel.vittoria.toFixed(2)} (per partita)
    </p>
    <p style="font-size:13px;color:var(--gesso-ombra)">${investNota}</p>
    <div class="riga-check">
      <input type="checkbox" id="f-investito" ${stato.investitoQuestAnno ? "checked" : ""} />
      <label for="f-investito" style="margin:0">Ho investito per salire di livello quest'anno</label>
    </div>
  </div>
  <div class="sezione">
    <h3>Andamento in casa di questa stagione</h3>
    <div class="griglia-3">
      <div class="campo"><label>Partite in casa giocate (max 19)</label>
        <input type="number" id="f-partite-casa" value="${stato.partiteCasa}" /></div>
      <div class="campo"><label>di cui vittorie</label>
        <input type="number" id="f-vittorie-casa" value="${stato.vittorieCasa}" /></div>
      <div class="campo"><label>di cui pareggi</label>
        <input type="number" id="f-pareggi-casa" value="${stato.pareggiCasa}" /></div>
    </div>
    <p style="font-size:13px;color:var(--gesso-ombra)">
      Ricavo totale stadio finora: <b style="color:var(--ambra); font-family:var(--font-cifre)">
      ${calc.ricavoStadio(stato.stadioIdx, stato.partiteCasa, stato.vittorieCasa, stato.pareggiCasa).toFixed(1)} mln</b>
    </p>
  </div>`;
}

// ============================================================
// TAB: SPONSOR & PREMI
// ============================================================
function renderSponsor() {
  const opzioniPiazz = (sel) => Array.from({ length: 8 }, (_, i) => i + 1)
    .map(n => `<option value="${n}" ${sel === n ? "selected" : ""}>${n}°</option>`).join("");
  const opzioniChampions = Object.keys(calc.PREMIO_CHAMPIONS)
    .map(r => `<option value="${r}" ${stato.risultatoChampions === r ? "selected" : ""}>${r}</option>`).join("");

  const ricSponsor = calc.ricavoSponsor(stato.bonusCampionatoScorso, stato.bonusChampionsScorso, stato.bonusCoppaScorso);

  return `
  <div class="sezione">
    <h3>Sponsor (base 100, + bonus stagione scorsa)</h3>
    <div class="riga-check"><input type="checkbox" id="f-bonus-campionato" ${stato.bonusCampionatoScorso ? "checked" : ""}/>
      <label for="f-bonus-campionato" style="margin:0">Ho vinto il Campionato la stagione scorsa (+5%)</label></div>
    <div class="riga-check"><input type="checkbox" id="f-bonus-champions" ${stato.bonusChampionsScorso ? "checked" : ""}/>
      <label for="f-bonus-champions" style="margin:0">Ho vinto la Champions League la stagione scorsa (+3%)</label></div>
    <div class="riga-check"><input type="checkbox" id="f-bonus-coppa" ${stato.bonusCoppaScorso ? "checked" : ""}/>
      <label for="f-bonus-coppa" style="margin:0">Ho vinto la Coppa la stagione scorsa (+2%)</label></div>
    <p style="font-size:13px;color:var(--gesso-ombra)">Ricavo sponsor: <b style="color:var(--ambra); font-family:var(--font-cifre)">${ricSponsor.toFixed(1)} mln</b></p>
  </div>
  <div class="sezione">
    <h3>Campionato</h3>
    <div class="campo"><label>Piazzamento stagione corrente</label>
      <select id="f-piazz-campionato"><option value="">— non ancora noto —</option>${opzioniPiazz(stato.piazzamentoCampionato)}</select></div>
  </div>
  <div class="sezione">
    <h3>Coppa</h3>
    <div class="campo"><label>Piazzamento in classifica Coppa</label>
      <select id="f-piazz-coppa"><option value="">— non ancora noto —</option>${opzioniPiazz(stato.piazzamentoCoppa)}</select></div>
  </div>
  <div class="sezione">
    <h3>Champions League</h3>
    <div class="campo"><label>Risultato raggiunto</label>
      <select id="f-risultato-champions"><option value="">— non ancora noto —</option>${opzioniChampions}</select></div>
  </div>`;
}

// ============================================================
// TAB: ROSA
// ============================================================
function renderRosa() {
  const gruppi = [
    { chiave: "Titolare", etichetta: "Titolari" },
    { chiave: "U21", etichetta: "Under 21" },
    { chiave: "Extra", etichetta: "Extra" },
  ];
  const entrataList = (stato.prestitiGiocatori || [])
    .map((pg, idxPg) => ({ pg, idxPg }))
    .filter(({ pg }) => pg.direzione === "In entrata");
  const ordineRuoli = { P: 0, D: 1, C: 2, A: 3 };
  // Un giocatore dato in prestito in uscita conta come Extra a tutti gli effetti (anche se il suo gruppo
  // "vero" resta salvato invariato, per quando il prestito finisce e torna ad essere quello di prima).
  const gruppoEffettivo = (p) => {
    const inUscita = (stato.prestitiGiocatori || []).some(pg => pg.direzione === "In uscita" && pg.nome === p.nome);
    return inUscita ? "Extra" : (p.gruppo || "Titolare");
  };

  const titolariRosa = stato.rosa.filter(p => gruppoEffettivo(p) === "Titolare");
  const titolariEntrata = entrataList.filter(({ pg }) => (pg.gruppo || "Extra") === "Titolare").map(({ pg }) => pg);
  const comp = calc.composizioneRuoli([...titolariRosa, ...titolariEntrata]);
  const compOk = comp.ok;
  const compTestoBreve = `P:${comp.P}/3 D:${comp.D}/8 C:${comp.C}/8 A:${comp.A}/6`;

  const totaleU21 = stato.rosa.filter(p => gruppoEffettivo(p) === "U21").length
    + entrataList.filter(({ pg }) => (pg.gruppo || "Extra") === "U21").length;
  const u21Ok = totaleU21 <= 5;

  const sezioni = gruppi.map(({ chiave, etichetta }) => {
    const giocatoriRosa = stato.rosa.map((p, idx) => ({ p, idx }))
      .filter(({ p }) => gruppoEffettivo(p) === chiave)
      .sort((a, b) => (ordineRuoli[a.p.ruolo] ?? 9) - (ordineRuoli[b.p.ruolo] ?? 9));
    const righeRosa = giocatoriRosa.map(({ p, idx }) => rigaRosa(p, idx)).join("");
    // I giocatori presi in prestito (in entrata) possono stare solo in U21 o Extra, mai tra i Titolari veri.
    const entrataGruppo = entrataList.filter(({ pg }) => (pg.gruppo || "Extra") === chiave)
      .sort((a, b) => (ordineRuoli[a.pg.ruolo] ?? 9) - (ordineRuoli[b.pg.ruolo] ?? 9));
    const righeEntrata = entrataGruppo.map(({ pg, idxPg }) => rigaRosaPrestitoEntrata(pg, idxPg)).join("");
    const conteggio = giocatoriRosa.length + entrataGruppo.length;
    const righe = righeRosa + righeEntrata;
    // Piccola conta accanto al titolo, solo per Titolari (composizione ruoli) e Under 21 (limite 5).
    let notaPiccola = "";
    if (chiave === "Titolare") {
      notaPiccola = ` <span style="font-size:11px;font-weight:400;color:${compOk ? "var(--ok)" : "var(--rosso-cartellino)"}">(${compOk ? "✅" : "⚠️"} ${compTestoBreve})</span>`;
    } else if (chiave === "U21") {
      notaPiccola = ` <span style="font-size:11px;font-weight:400;color:${u21Ok ? "var(--ok)" : "var(--rosso-cartellino)"}">(${u21Ok ? "✅" : "⚠️"} max 5)</span>`;
    }
    return `
    <p style="font-size:13px;font-weight:600;color:var(--ambra);margin:16px 0 6px">${etichetta} — ${conteggio}${notaPiccola}</p>
    <div class="tabella-scroll"><table class="tabella-rosa">
      <thead><tr><th>Ruolo</th><th>Nome</th><th>Costo</th><th>Inizio</th><th>Fine</th><th>Anni rim.</th><th>Stipendio</th><th>Quota%</th><th>Ammort.</th><th>Rinnovi</th><th>Val. res.</th><th>Sposta a</th></tr></thead>
      <tbody>${righe || `<tr><td colspan="12" style="text-align:center;color:var(--gesso-ombra);font-size:12px;padding:10px">— nessuno —</td></tr>`}</tbody>
    </table></div>`;
  }).join("");

  const tot = calc.totaliRosa(stato.rosa, stato.stagioneCorrente);

  return `
  <div class="sezione">
    <h3>Rosa calciatori</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Report — si modifica da Mercato. Sposta un giocatore tra Titolari/Under 21/Extra col menu a destra di ogni riga. Riga <span style="color:var(--rosso-cartellino)">rossa</span> = dato in prestito in uscita. Riga <span style="color:var(--ok)">verde</span> = preso in prestito da un'altra squadra (solo U21/Extra, non pesa su costo/ammortamento).</p>
    ${sezioni}
    <p style="margin-top:14px;font-size:13px">
      Totale costo: <b class="cifra">${tot.costo.toFixed(1)}</b> ·
      Totale stipendi: <b class="cifra">${tot.stipendi.toFixed(1)}</b> ·
      Totale ammortamenti: <b class="cifra">${tot.ammortamenti.toFixed(1)}</b>
    </p>
  </div>
  ${renderPrestitiGiocatoriResoconto()}`;
}

function rigaRosa(p, idx) {
  const anniRim = calc.anniRimanenti(p, stato.stagioneCorrente);
  const stip = calc.stipendio(p);
  const amm = calc.ammortamentoAnnuo(p, stato.stagioneCorrente);
  const val = calc.valoreResiduo(p, stato.stagioneCorrente);
  const gruppoAttuale = p.gruppo || "Titolare";
  const inPrestitoUscita = (stato.prestitiGiocatori || []).some(pg => pg.direzione === "In uscita" && pg.nome === p.nome);
  // Chi è dato in prestito in uscita può stare solo in Extra (non è realmente disponibile per la squadra).
  const opzioniGruppo = inPrestitoUscita ? ["Extra"] : ["Titolare", "U21", "Extra"];
  const opz = opzioniGruppo.map(g => `<option value="${g}" ${g === gruppoAttuale ? "selected" : ""}>${g}</option>`).join("");
  return `<tr${inPrestitoUscita ? ' class="riga-in-prestito-uscita"' : ""}>
    <td>${p.ruolo}</td>
    <td>${p.nome || ""}</td>
    <td class="cifra">${(p.costo || 0).toFixed(1)}</td>
    <td>${formattaStagione(p.annoInizio)}</td>
    <td>${formattaStagione(p.annoFine)}</td>
    <td class="cifra">${anniRim}</td>
    <td class="cifra">${stip.toFixed(1)}</td>
    <td><select class="rosa-quota" data-idx="${idx}">
      <option value="100" ${(p.quotaStagione ?? 1) === 1 ? "selected" : ""}>100%</option>
      <option value="50" ${p.quotaStagione === 0.5 ? "selected" : ""}>50%</option>
      <option value="0" ${p.quotaStagione === 0 ? "selected" : ""}>0%</option>
    </select></td>
    <td class="cifra">${amm.toFixed(1)}</td>
    <td class="cifra">${p.rinnovi || 0}</td>
    <td class="cifra">${val.toFixed(1)}</td>
    <td><select class="rosa-sposta" data-idx="${idx}">${opz}</select></td>
  </tr>`;
}

// Righe "finte" per i giocatori presi IN ENTRATA in prestito: non sono nella Rosa vera (niente costo/contratto/ammortamento
// con la tua squadra), ma li mostro qui in verde solo per farli vedere a colpo d'occhio insieme al resto della squadra.
function rigaRosaPrestitoEntrata(p, idxPg) {
  const gruppoAttuale = p.gruppo || "Extra";
  const opz = ["Titolare", "U21", "Extra"].map(g => `<option value="${g}" ${g === gruppoAttuale ? "selected" : ""}>${g}</option>`).join("");
  return `<tr class="riga-in-prestito-entrata">
    <td>${p.ruolo || "?"}</td>
    <td>${p.nome || ""} <span style="font-size:11px">(da ${p.controparte || "?"})</span></td>
    <td class="cifra">${(p.costoPrestito || 0).toFixed(1)}</td>
    <td>—</td><td>—</td><td>—</td>
    <td class="cifra">${(p.stipendioACarico || 0).toFixed(1)}</td>
    <td class="cifra">${p.quotaPercento ?? 100}</td>
    <td>—</td><td>—</td><td>—</td>
    <td><select class="prestito-entrata-sposta" data-idx="${idxPg}">${opz}</select></td>
  </tr>`;
}

// Riepilogo in sola lettura (non modificabile da qui) di chi è in prestito, per vederlo mentre guardi la Rosa.
function renderPrestitiGiocatoriResoconto() {
  const lista = stato.prestitiGiocatori || [];
  if (lista.length === 0) return "";
  const righe = lista.map((p, i) => {
    const fisso = calc.impattoFissoPrestito(p);
    const variabile = p.tipo === "Secco" ? null : (p.costoRiscatto || 0);
    const puoRiscattare = p.tipo === "Diritto di riscatto";
    return `<tr>
      <td>${p.nome}</td><td>${p.direzione}</td><td>${p.controparte || ""}</td><td>${p.tipo || ""}</td>
      <td class="cifra">${(p.costoPrestito || 0).toFixed(1)}</td>
      <td class="cifra">${(p.stipendioACarico || 0).toFixed(1)}</td>
      <td class="cifra">${fisso.toFixed(1)}</td>
      <td class="cifra">${variabile === null ? "—" : variabile.toFixed(1)}</td>
      <td>${puoRiscattare ? `<button class="btn-testo pgr-riscatto" data-i="${i}" style="font-size:11px">Conferma riscatto</button>` : ""}</td>
    </tr>`;
  }).join("");
  return `
  <div class="sezione">
    <h3>Prestiti in corso (riepilogo)</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Fisso = quello che paghi/incassi comunque. Variabile = riscatto (solo con Diritto, conta nel bilancio solo quando confermi). Per registrare nuovi prestiti, vai su Mercato.</p>
    <div class="tabella-scroll"><table class="tabella-rosa">
      <thead><tr><th>Nome</th><th>Direzione</th><th>Controparte</th><th>Tipo</th><th>Costo prestito</th><th>Stipendio</th><th>Impatto fisso</th><th>Impatto variabile</th><th></th></tr></thead>
      <tbody>${righe}</tbody>
    </table></div>
  </div>`;
}

// ---------- Registro modifiche (audit log): chi ha fatto cosa e quando ----------
// Identificatore stabile per collegare una riga di storico Acquisti al giocatore corrispondente in Rosa,
// così il tasto ✕ può annullare l'acquisto per intero (non solo il ricordo scritto).
let contatoreId = 0;
function nuovoId() { return `${Date.now()}-${contatoreId++}`; }

// Legge il valore di un campo "squadra" (tendina con nickname come valore, o testo libero di riserva)
// e restituisce sempre il nome squadra vero da mostrare/salvare, mai il nickname tecnico.
function leggiNomeSquadraDaCampo(elId) {
  const el = document.getElementById(elId);
  if (!el) return "";
  if (el.tagName === "SELECT" && elencoAltreSquadreCache) {
    const trovata = elencoAltreSquadreCache.find(s => s.nickname === el.value);
    return trovata ? trovata.nomeSquadra : "";
  }
  return el.value.trim();
}

function registraModifica(tipo, dettagli) {
  stato.registroModifiche = stato.registroModifiche || [];
  stato.registroModifiche.push({ data: new Date().toISOString(), tipo, dettagli });
}

function renderRegistroMovimenti() {
  const log = stato.registroModifiche || [];
  const righe = [...log].reverse().map(r => {
    const d = new Date(r.data);
    const dataTxt = d.toLocaleDateString("it-IT") + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return `<tr><td style="white-space:nowrap">${dataTxt}</td><td>${r.tipo}</td><td>${r.dettagli}</td></tr>`;
  }).join("");
  return `
  <div class="sezione">
    <h3>Registro movimenti</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Data/ora di ogni acquisto, cessione, svincolo, rinnovo — visibile anche all'ADMIN.</p>
    <details ${log.length > 0 ? "" : "style='display:none'"}>
      <summary>Vedi registro (${log.length})</summary>
      <div class="tabella-scroll" style="margin-top:8px"><table class="tabella-rosa">
        <thead><tr><th>Quando</th><th>Cosa</th><th>Dettagli</th></tr></thead>
        <tbody>${righe}</tbody>
      </table></div>
    </details>
    ${log.length === 0 ? '<p style="font-size:12px;color:var(--gesso-ombra)">Nessun movimento ancora.</p>' : ""}
  </div>`;
}

// ============================================================
// TAB: MERCATO (Acquisti in asta/fuori asta, Cessioni, Svincoli, Prestiti giocatori)
// ============================================================
function renderScadenzeRinnovo() {
  const inScadenza = stato.rosa
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => calc.anniRimanenti(p, stato.stagioneCorrente) === 1);
  if (inScadenza.length === 0) {
    return `<p style="font-size:13px;color:var(--gesso-ombra)">Nessun giocatore in scadenza questa stagione (${stato.stagioneCorrente}).</p>`;
  }
  const righe = inScadenza.map(({ p, idx }) => `
    <tr>
      <td><input type="checkbox" class="rn-check" data-idx="${idx}" /></td>
      <td>${p.nome}</td>
      <td>${p.ruolo}</td>
      <td class="cifra">${(p.costo || 0).toFixed(1)}</td>
      <td>${p.annoFine}/${String(p.annoFine + 1).slice(-2)}</td>
      <td><select class="rn-durata" data-idx="${idx}"><option value="1">+1</option><option value="2">+2</option><option value="3">+3</option><option value="4">+4</option><option value="5">+5</option></select></td>
    </tr>`).join("");
  return `
    <div class="tabella-scroll"><table class="tabella-rosa">
      <thead><tr><th></th><th>Nome</th><th>Ruolo</th><th>Costo</th><th>Scade a fine</th><th>Rinnova per (anni)</th></tr></thead>
      <tbody>${righe}</tbody>
    </table></div>
    <button id="btn-conferma-rinnovi" class="btn-piccolo">Conferma rinnovi selezionati</button>`;
}

// Tendina "Stagione XX/YY" riusabile ovunque serva scegliere un anno di inizio contratto senza fare calcoli a mente.
function opzioniStagioni(selezionata) {
  return Array.from({ length: 15 }, (_, i) => 2026 + i)
    .map(anno => `<option value="${anno}" ${anno === selezionata ? "selected" : ""}>${anno}/${String(anno + 1).slice(-2)}</option>`)
    .join("");
}

// Formatta un anno come stagione "2026/27" — riusabile ovunque va mostrato un anno di contratto.
function formattaStagione(anno) {
  return `${anno}/${String(anno + 1).slice(-2)}`;
}

function renderGestioneRosa() {
  const righeAcquistiAsta = (stato.acquistiAsta || []).map((a, i) => `
    <tr><td>${a.ruolo}</td><td>${a.nome}</td><td class="cifra">${(a.costo || 0).toFixed(1)}</td><td>${formattaStagione(a.annoInizio)} - ${formattaStagione(a.annoFine)}</td>
    <td><button class="btn-testo aa-rimuovi" data-i="${i}">✕</button></td></tr>`).join("");

  const righeSvincoli = (stato.svincoli || []).map((s, i) => `
    <tr><td>${s.nomeGiocatore}</td><td>${s.motivo || ""}</td><td class="cifra">${(s.valoreResiduoAlMomento || 0).toFixed(1)}</td><td class="cifra">${(s.indennizzo || 0).toFixed(1)}</td>
    <td class="cifra">${((s.indennizzo || 0) - (s.valoreResiduoAlMomento || 0)).toFixed(1)}</td>
    <td><button class="btn-testo s-rimuovi" data-i="${i}">✕</button></td></tr>`).join("");

  const opzRuolo = `<option value="P">P</option><option value="D">D</option><option value="C">C</option><option value="A">A</option>`;
  const opzGiocatoriRosa = () => `<option value="">— scegli —</option>` + stato.rosa.map((p, idx) =>
    `<option value="${idx}">${p.nome || "(senza nome)"} — ${p.ruolo}, val.res. ${calc.valoreResiduo(p, stato.stagioneCorrente).toFixed(1)}</option>`
  ).join("");

  return `
  <div class="sezione">
    <h3>Acquisti in asta</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Finisce subito in Rosa.</p>
    <div class="griglia-3">
      <div class="campo"><label>Ruolo</label><select id="asta-ruolo">${opzRuolo}</select></div>
      <div class="campo"><label>Nome</label><input type="text" id="asta-nome" /></div>
      <div class="campo"><label>Costo (mln)</label><input type="number" id="asta-costo" value="0" /></div>
      <div class="campo"><label>Stagione inizio</label><select id="asta-anno-inizio">${opzioniStagioni(stato.stagioneCorrente)}</select></div>
      <div class="campo"><label>Durata (anni)</label>
        <select id="asta-durata"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select>
      </div>
      <div class="campo"><label>Quota stagione %</label><input type="number" id="asta-quota" value="100" min="0" max="100" /></div>
    </div>
    <button id="btn-agg-asta" class="btn-piccolo">+ Aggiungi</button>
    <details style="margin-top:10px">
      <summary>Storico (${(stato.acquistiAsta || []).length})</summary>
      <div class="tabella-scroll" style="margin-top:8px"><table class="tabella-rosa">
        <thead><tr><th>Ruolo</th><th>Nome</th><th>Costo</th><th>Contratto</th><th></th></tr></thead>
        <tbody id="corpo-acquisti-asta">${righeAcquistiAsta}</tbody>
      </table></div>
    </details>
  </div>

  <div class="sezione">
    <h3>Svincoli calciatori</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Indennizzo calcolato da solo dal Valore residuo in base al Motivo — positivo se lo ricevi, negativo se lo paghi. Il giocatore esce dalla Rosa in automatico.</p>
    <div class="griglia-3">
      <div class="campo"><label>Giocatore</label><select id="s-giocatore">${opzGiocatoriRosa()}</select></div>
      <div class="campo"><label>Motivo</label>
        <select id="s-motivo">
          <option>Ritiro</option><option>Serie B</option><option>Trasferimento estero</option><option>Risoluzione consensuale</option>
        </select>
      </div>
      <div class="campo"><label>Indennizzo (mln)</label><input type="number" id="s-indennizzo" value="0" /></div>
    </div>
    <button id="btn-agg-svincolo" class="btn-piccolo">+ Registra svincolo (esce dalla Rosa)</button>
    <details style="margin-top:10px">
      <summary>Storico (${(stato.svincoli || []).length})</summary>
      <div class="tabella-scroll" style="margin-top:8px"><table class="tabella-rosa">
        <thead><tr><th>Nome svincolato</th><th>Motivo</th><th>Valore residuo</th><th>Indennizzo</th><th>Minus/Plus</th><th></th></tr></thead>
        <tbody id="corpo-svincoli">${righeSvincoli}</tbody>
      </table></div>
    </details>
  </div>

  <div class="sezione">
    <h3>Rinnovo contratto</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">In scadenza questa stagione — spunta, scegli il nuovo anno, conferma.</p>
    ${renderScadenzeRinnovo()}
  </div>
  ${renderRegistroMovimenti()}`;
}

// ============================================================
// TAB: PRESTITI (bancari + giocatori)
// ============================================================
function renderPrestiti() {
  const righeBanca = (stato.prestitiBancari || []).map((p, i) => rigaPrestitoBancario(p, i)).join("");

  return `
  <div class="sezione">
    <h3>Prestiti bancari</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Tassi: 1a 10%(15%) · 2a 20%(30%) · 3a 30%(50%). Max 150 mln.</p>
    <div class="tabella-scroll">
      <table class="tabella-rosa">
        <thead><tr><th>Descrizione</th><th>Capitale</th><th>Anni</th><th>Per risanare</th><th>Incassato quest'anno</th><th>Stato</th><th></th></tr></thead>
        <tbody id="corpo-prestiti-banca">${righeBanca}</tbody>
      </table>
    </div>
    <button id="btn-agg-prestito-banca" class="btn-piccolo" style="margin-top:10px">+ Aggiungi prestito</button>
  </div>`;
}

function rigaPrestitoBancario(p, i) {
  const trascorsi = calc.anniTrascorsiPrestito(p, stato.stagioneCorrente);
  const estinto = calc.prestitoEstinto(p, stato.stagioneCorrente);
  const stato_testo = estinto
    ? `<span style="color:var(--ok)">✅ Estinto</span>`
    : `${(p.anni || 0) - trascorsi} anni rimasti`;
  return `<tr data-i="${i}">
    <td><input class="pb-descr" type="text" value="${p.descrizione || ""}" /></td>
    <td><input class="pb-capitale cifra" type="number" min="10" max="150" value="${p.capitale || 0}" /></td>
    <td><select class="pb-anni"><option value="1" ${p.anni===1?"selected":""}>1</option><option value="2" ${p.anni===2?"selected":""}>2</option><option value="3" ${p.anni===3?"selected":""}>3</option></select></td>
    <td><input class="pb-risanare" type="checkbox" ${p.perRisanare ? "checked" : ""} /></td>
    <td><input class="pb-incassato" type="checkbox" ${p.incassatoQuestAnno ? "checked" : ""} /></td>
    <td class="cifra" style="font-size:12px">${stato_testo}</td>
    <td><button class="btn-testo pb-rimuovi">✕</button></td>
  </tr>`;
}
// Tendina con i nomi della Rosa attuale (per "In uscita" nei Prestiti giocatori: il valore è il NOME, non l'indice,
// perché la riga resta leggibile anche se nel frattempo la Rosa cambia posizione).
function opzNomiRosa(selezionato) {
  const opts = stato.rosa.map(pl => `<option value="${pl.nome}" ${pl.nome === selezionato ? "selected" : ""}>${pl.nome} — ${pl.ruolo}</option>`).join("");
  return `<option value="">— scegli —</option>${opts}`;
}

function rigaPrestitoGiocatore(p, i) {
  const puoRiscattare = p.tipo === "Diritto di riscatto";
  const fisso = calc.impattoFissoPrestito(p);
  const variabile = p.tipo === "Secco" ? null : (p.costoRiscatto || 0);
  return `<tr data-i="${i}">
    <td>${p.nome || ""}</td>
    <td>${p.direzione === "In uscita" ? "Uscita" : "Entrata"}</td>
    <td>${p.controparte || ""}</td>
    <td>${p.tipo || ""}</td>
    <td class="cifra">${(p.costoPrestito || 0).toFixed(1)}</td>
    <td class="cifra">${(p.stipendioACarico || 0).toFixed(1)}</td>
    <td class="cifra">${fisso.toFixed(1)}</td>
    <td class="cifra">${variabile === null ? "—" : variabile.toFixed(1)}</td>
    <td>${puoRiscattare ? `<button class="btn-piccolo pg-conferma-riscatto" style="margin:0;padding:4px 8px;font-size:11px">Conferma riscatto</button>` : ""}</td>
    <td><button class="btn-testo pg-rimuovi">✕</button></td>
  </tr>`;
}


function renderBilancio() {
  const ce = calc.calcolaContoEconomico(stato);
  const classeBil = ce.chiusura >= 0 ? "positivo" : "negativo";
  const classeCap = ce.capitaleProvvisorio >= 0 ? "positivo" : "negativo";

  return `
  <div class="scoreboard">
    <div class="scoreboard-cella"><div class="etichetta">Capitale Sociale Iniziale</div><div class="valore positivo">${(stato.capitaleIniziale || 0).toFixed(1)}</div></div>
    <div class="scoreboard-cella"><div class="etichetta">Capitale Speso in Asta</div><div class="valore positivo">${(stato.acquistiAsta || []).reduce((s, a) => s + (a.costo || 0), 0).toFixed(1)}</div></div>
  </div>
  <div class="scoreboard">
    <div class="scoreboard-cella"><div class="etichetta">Chiusura Bilancio</div><div class="valore ${classeBil}">${ce.chiusura.toFixed(1)}</div></div>
    <div class="scoreboard-cella"><div class="etichetta">Capitale Provvisorio</div><div class="valore ${classeCap}">${ce.capitaleProvvisorio.toFixed(1)}</div></div>
  </div>
  <div class="sezione">
    <h3>Ricavi</h3>
    <p style="font-size:13px;line-height:1.9">
      Aumenti di capitale: <b class="cifra">${(stato.aumentiCapitale || 0).toFixed(1)}</b> ·
      Sponsor: <b class="cifra">${ce.ricSponsor.toFixed(1)}</b> ·
      Premio classifica: <b class="cifra">${ce.ricPremio.toFixed(1)}</b> ·
      Coppa: <b class="cifra">${ce.ricCoppa.toFixed(1)}</b> ·
      Champions: <b class="cifra">${ce.ricChampions.toFixed(1)}</b> ·
      Stadio: <b class="cifra">${ce.ricStadio.toFixed(1)}</b> ·
      Vendite calciatori: <b class="cifra">${ce.ricVenditeCalciatori.toFixed(1)}</b> ·
      Prestito bancario incassato: <b class="cifra">${ce.ricPrestitoBancario.toFixed(1)}</b> ·
      Prestiti giocatori (guadagno/risparmio): <b class="cifra">${ce.ricPrestitiGiocatoriPositivo.toFixed(1)}</b><br>
      <span style="font-size:15px">TOTALE RICAVI:</span> <b class="cifra" style="font-family:var(--font-cifre);font-size:22px;color:var(--ambra)">${ce.totRicavi.toFixed(1)}</b>
    </p>
  </div>
  <div class="sezione">
    <h3>Costi</h3>
    <p style="font-size:13px;line-height:1.9">
      Costi vari: <b class="cifra">${(stato.costiVari || 0).toFixed(1)}</b> ·
      Multe: <b class="cifra">${(stato.multe || 0).toFixed(1)}</b> ·
      Stipendi: <b class="cifra">${ce.stipendi.toFixed(1)}</b> ·
      Ammortamenti: <b class="cifra">${ce.ammortamenti.toFixed(1)}</b> ·
      Costo stadio: <b class="cifra">${ce.costoStadio.toFixed(1)}</b> ·
      Investimento stadio: <b class="cifra">${ce.investimentoStadio.toFixed(1)}</b> ·
      Rata prestito bancario: <b class="cifra">${ce.rataPrestitoBancario.toFixed(1)}</b> ·
      Prestiti giocatori (costo): <b class="cifra">${ce.costoPrestitiGiocatoriNegativo.toFixed(1)}</b><br>
      <span style="font-size:15px">TOTALE COSTI:</span> <b class="cifra" style="font-family:var(--font-cifre);font-size:22px;color:var(--ambra)">${ce.totCosti.toFixed(1)}</b>
    </p>
  </div>
  <div class="sezione">
    <h3>Risultato</h3>
    <p style="font-size:13px;line-height:1.9">
      Risultato ante plus/minusvalenze: <b class="cifra">${ce.risultatoAnte.toFixed(1)}</b><br>
      Plusvalenze: <b class="cifra">${ce.plusvalenze.toFixed(1)}</b> · Minusvalenze: <b class="cifra">${ce.minusvalenze.toFixed(1)}</b><br>
      <span style="font-size:15px">CHIUSURA BILANCIO:</span> <b class="cifra" style="font-family:var(--font-cifre);font-size:22px;color:var(--ambra)">${ce.chiusura.toFixed(1)}</b>
    </p>
  </div>
  <div class="sezione" style="border:1px solid var(--rosso-cartellino)">
    <h3 style="color:var(--ambra)">Chiusura stagione ${formattaStagione(stato.stagioneCorrente)}</h3>
    <p style="font-size:13px;color:var(--gesso-ombra);line-height:1.7">
      Passa alla stagione ${formattaStagione(stato.stagioneCorrente + 1)}. Non si può annullare.<br>
      <span style="font-size:15px">CAPITALE INIZIALE NUOVO:</span> <b class="cifra" style="font-family:var(--font-cifre);font-size:22px;color:var(--ambra)">${ce.capitaleProvvisorio.toFixed(1)}</b>
    </p>
    <button id="btn-chiudi-stagione" class="btn-primario" style="width:auto;padding:10px 20px">Chiudi stagione e passa alla ${formattaStagione(stato.stagioneCorrente + 1)}</button>
  </div>
  ${renderStoricoStagioni()}`;
}

function renderStoricoStagioni() {
  const storico = stato.storicoStagioni || [];
  if (storico.length === 0) {
    return `
    <div class="sezione">
      <h3>Registro bilanci passati</h3>
      <p style="font-size:12px;color:var(--gesso-ombra)">Appare qui non appena chiudi la prima stagione.</p>
      <p style="font-size:13px;color:var(--gesso-ombra)">Nessuna stagione chiusa ancora.</p>
    </div>`;
  }
  const righe = storico.map(s => `
    <tr>
      <td>${s.anno}</td>
      <td class="cifra">${s.chiusuraBilancio.toFixed(1)}</td>
      <td class="cifra">${s.capitaleProvvisorio.toFixed(1)}</td>
      <td>${s.piazzamentoCampionato ? s.piazzamentoCampionato + "°" : "—"}</td>
      <td>${s.piazzamentoCoppa ? s.piazzamentoCoppa + "°" : "—"}</td>
      <td>${s.risultatoChampions || "—"}</td>
      <td>${s.stadio}</td>
    </tr>`).join("");
  return `
  <div class="sezione">
    <h3>Registro bilanci passati</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Copia non modificabile, archivio permanente.</p>
    <div class="tabella-scroll">
      <table class="tabella-rosa">
        <thead><tr><th>Anno</th><th>Chiusura Bilancio</th><th>Capitale Provv.</th><th>Campionato</th><th>Coppa</th><th>Champions</th><th>Stadio</th></tr></thead>
        <tbody>${righe}</tbody>
      </table>
    </div>
  </div>`;
}

// ============================================================
// EVENTI per tab (letti/scritti sullo stato + salvataggio)
// ============================================================
function agganciaEventi(tab) {
  // "input" aggiorna solo il dato (mai un redraw, altrimenti perdi il focus mentre scrivi).
  // "change" (quando lasci la casella) fa il redraw per aggiornare i valori calcolati collegati.
  const bind = (id, campo, tipo = "text") => {
    const el = document.getElementById(id);
    if (!el) return;
    const leggi = () => {
      let v = el.value;
      if (tipo === "number") v = v === "" ? 0 : parseFloat(v);
      if (tipo === "checkbox") v = el.checked;
      stato[campo] = v;
      programmaSalvataggio();
    };
    el.addEventListener("input", leggi);
    el.addEventListener("change", () => { leggi(); renderTab(tabAttiva); });
  };

  if (tab === "anagrafica") {
    bind("f-nome-squadra", "nomeSquadra");
    bind("f-allenatore", "allenatore");
    bind("f-presidente", "presidente");
    bind("f-stagione", "stagioneCorrente", "number");
  } else if (tab === "stadio") {
    bind("f-stadio-idx", "stadioIdx", "number");
    bind("f-investito", "investitoQuestAnno", "checkbox");
    bind("f-partite-casa", "partiteCasa", "number");
    bind("f-vittorie-casa", "vittorieCasa", "number");
    bind("f-pareggi-casa", "pareggiCasa", "number");
  } else if (tab === "sponsor") {
    bind("f-bonus-campionato", "bonusCampionatoScorso", "checkbox");
    bind("f-bonus-champions", "bonusChampionsScorso", "checkbox");
    bind("f-bonus-coppa", "bonusCoppaScorso", "checkbox");
    // Piazzamenti: sempre numeri 1-8
    const bindSelNumero = (id, campo) => {
      const el = document.getElementById(id);
      el.addEventListener("change", () => {
        stato[campo] = el.value ? parseInt(el.value) : null;
        programmaSalvataggio();
      });
    };
    // Risultato Champions: resta SEMPRE testo (es. "4° posto") — MAI passare da parseInt,
    // altrimenti "4° posto" diventa il numero 4 e il premio corrispondente sparisce.
    const bindSelTesto = (id, campo) => {
      const el = document.getElementById(id);
      el.addEventListener("change", () => {
        stato[campo] = el.value || null;
        programmaSalvataggio();
      });
    };
    bindSelNumero("f-piazz-campionato", "piazzamentoCampionato");
    bindSelNumero("f-piazz-coppa", "piazzamentoCoppa");
    bindSelTesto("f-risultato-champions", "risultatoChampions");
  } else if (tab === "rosa") {
    // Conferma riscatto di un prestito con Diritto: chiude il prestito e lo trasforma in movimento vero.
    document.querySelectorAll(".pgr-riscatto").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.i);
        const p = stato.prestitiGiocatori[i];
        if (!confirm(`Confermare il riscatto di "${p.nome}" per ${p.costoRiscatto || 0} mln? Il prestito verrà chiuso.`)) return;
        if (p.direzione === "In uscita") {
          const idxRosa = stato.rosa.findIndex(r => r.nome === p.nome);
          let valoreResiduoAlMomento = 0;
          if (idxRosa !== -1) {
            valoreResiduoAlMomento = calc.valoreResiduo(stato.rosa[idxRosa], stato.stagioneCorrente);
            stato.rosa.splice(idxRosa, 1);
          }
          stato.cessioni = stato.cessioni || [];
          stato.cessioni.push({ nomeGiocatore: p.nome, acquirente: p.controparte, valoreResiduoAlMomento, prezzoCessione: p.costoRiscatto || 0 });
          registraModifica("Riscatto esercitato (in uscita)", `${p.nome} ceduto definitivamente per ${p.costoRiscatto || 0} mln`);
        } else {
          const ruolo = ["P", "D", "C", "A"].includes(p.ruolo) ? p.ruolo : "A";
          const durataInput = prompt(`Contratto di "${p.nome}": durata in anni? (1-5)`, "3");
          const durata = Math.min(5, Math.max(1, parseInt(durataInput) || 3));
          const annoFine = stato.stagioneCorrente + durata - 1;
          const quotaInput = prompt(`Quota stagione per "${p.nome}" (100, 50 o 0)?`, "100");
          const quota = [100, 50, 0].includes(parseInt(quotaInput)) ? parseInt(quotaInput) / 100 : 1;
          const id = nuovoId();
          const costoRiscattoAssoluto = Math.abs(p.costoRiscatto || 0);
          stato.rosa.push({ id, ruolo, nome: p.nome, costo: costoRiscattoAssoluto, annoInizio: stato.stagioneCorrente, annoFine, quotaStagione: quota, rinnovi: 0, gruppo: "Titolare" });
          stato.acquistiFuoriAsta = stato.acquistiFuoriAsta || [];
          stato.acquistiFuoriAsta.push({ id, ruolo, nome: p.nome, compratoDa: p.controparte, prezzo: costoRiscattoAssoluto });
          registraModifica("Riscatto esercitato (in entrata)", `${p.nome} acquistato definitivamente per ${costoRiscattoAssoluto} mln`);
          alert(`Fatto: "${p.nome}" ora è tuo — contratto ${formattaStagione(stato.stagioneCorrente)} → ${formattaStagione(annoFine)} (${durata} anni).`);
        }
        stato.prestitiGiocatori.splice(i, 1);
        programmaSalvataggio(); renderTab("rosa");
      });
    });
    // L'unica cosa modificabile da qui: spostare un giocatore tra Titolare/U21/Extra, e la Quota stagione.
    document.querySelectorAll(".rosa-sposta").forEach(sel => {
      sel.addEventListener("change", () => {
        const idx = parseInt(sel.dataset.idx);
        const player = stato.rosa[idx];
        const vecchioGruppo = player.gruppo || "Titolare";
        const nuovoGruppo = sel.value;
        player.gruppo = nuovoGruppo;
        registraModifica("Spostamento gruppo", `${player.nome}: ${vecchioGruppo} → ${nuovoGruppo}`);
        programmaSalvataggio(); renderTab("rosa");
      });
    });
    document.querySelectorAll(".rosa-quota").forEach(sel => {
      sel.addEventListener("change", () => {
        const idx = parseInt(sel.dataset.idx);
        const player = stato.rosa[idx];
        const vecchiaQuota = Math.round((player.quotaStagione ?? 1) * 100);
        const nuovaQuota = parseInt(sel.value) / 100;
        player.quotaStagione = nuovaQuota;
        registraModifica("Quota stagione modificata", `${player.nome}: ${vecchiaQuota}% → ${sel.value}%`);
        programmaSalvataggio(); renderTab("rosa");
      });
    });
    // Stesso spostamento, ma per i giocatori in prestito IN ENTRATA (possono andare solo tra U21 ed Extra).
    document.querySelectorAll(".prestito-entrata-sposta").forEach(sel => {
      sel.addEventListener("change", () => {
        const idx = parseInt(sel.dataset.idx);
        const pg = stato.prestitiGiocatori[idx];
        const vecchioGruppo = pg.gruppo || "Extra";
        const nuovoGruppo = sel.value;
        pg.gruppo = nuovoGruppo;
        registraModifica("Spostamento gruppo", `${pg.nome} (in prestito): ${vecchioGruppo} → ${nuovoGruppo}`);
        programmaSalvataggio(); renderTab("rosa");
      });
    });
  } else if (tab === "gestione-rosa") {
    document.getElementById("btn-agg-asta").addEventListener("click", () => {
      const nome = document.getElementById("asta-nome").value.trim();
      if (!nome) { alert("Inserisci il nome del giocatore."); return; }
      const id = nuovoId();
      const annoInizio = parseInt(document.getElementById("asta-anno-inizio").value) || stato.stagioneCorrente;
      const durata = parseInt(document.getElementById("asta-durata").value) || 1;
      const nuovo = {
        id,
        ruolo: document.getElementById("asta-ruolo").value,
        nome,
        costo: parseFloat(document.getElementById("asta-costo").value) || 0,
        annoInizio, annoFine: annoInizio + durata - 1,
        quotaStagione: (parseFloat(document.getElementById("asta-quota").value) || 100) / 100,
        rinnovi: 0, gruppo: "Titolare",
      };
      stato.rosa.push(nuovo);
      stato.acquistiAsta = stato.acquistiAsta || [];
      stato.acquistiAsta.push({ id, ruolo: nuovo.ruolo, nome: nuovo.nome, costo: nuovo.costo, annoInizio: nuovo.annoInizio, annoFine: nuovo.annoFine });
      registraModifica("Acquisto in asta", `${nuovo.nome} (${nuovo.ruolo}), costo ${nuovo.costo}, contratto ${nuovo.annoInizio}-${nuovo.annoFine}`);
      programmaSalvataggio(); renderTab("gestione-rosa");
    });

    document.getElementById("btn-agg-svincolo").addEventListener("click", () => {
      const idx = document.getElementById("s-giocatore").value;
      if (idx === "") { alert("Scegli un giocatore dalla Rosa."); return; }
      const player = stato.rosa[parseInt(idx)];
      const valoreResiduoAlMomento = calc.valoreResiduo(player, stato.stagioneCorrente);
      const indennizzo = parseFloat(document.getElementById("s-indennizzo").value) || 0;
      const motivo = document.getElementById("s-motivo").value;
      stato.svincoli = stato.svincoli || [];
      stato.svincoli.push({ nomeGiocatore: player.nome, motivo, valoreResiduoAlMomento, indennizzo });
      stato.rosa.splice(parseInt(idx), 1);
      registraModifica("Svincolo", `${player.nome} (${motivo}), indennizzo ${indennizzo} (valore residuo era ${valoreResiduoAlMomento.toFixed(1)})`);
      programmaSalvataggio(); renderTab("gestione-rosa");
    });

    // L'Indennizzo si ricalcola da solo sia quando cambi il Giocatore sia quando cambi il Motivo
    // (Valore residuo del giocatore scelto × quota del motivo, con il segno giusto).
    const ricalcolaIndennizzo = () => {
      const idx = document.getElementById("s-giocatore").value;
      const indennizzoInput = document.getElementById("s-indennizzo");
      if (idx === "") { indennizzoInput.value = 0; return; }
      const player = stato.rosa[parseInt(idx)];
      const valoreResiduo = calc.valoreResiduo(player, stato.stagioneCorrente);
      const motivo = document.getElementById("s-motivo").value;
      const quota = calc.MOTIVI_SVINCOLO[motivo] ?? 0;
      indennizzoInput.value = (valoreResiduo * quota).toFixed(1);
    };
    document.getElementById("s-giocatore").addEventListener("change", ricalcolaIndennizzo);
    document.getElementById("s-motivo").addEventListener("change", ricalcolaIndennizzo);

    document.getElementById("btn-conferma-rinnovi")?.addEventListener("click", () => {
      const checks = document.querySelectorAll(".rn-check:checked");
      if (checks.length === 0) { alert("Spunta almeno un giocatore da rinnovare."); return; }
      const dettagli = [];
      checks.forEach(chk => {
        const idx = parseInt(chk.dataset.idx);
        const player = stato.rosa[idx];
        const selDurata = document.querySelector(`.rn-durata[data-idx="${idx}"]`);
        const durata = parseInt(selDurata.value) || 1;
        const vecchio = player.annoFine;
        player.annoFine = vecchio + durata;
        player.rinnovi = (player.rinnovi || 0) + 1;
        dettagli.push(`${player.nome} ${vecchio}→${player.annoFine} (rinnovo n.${player.rinnovi})`);
      });
      registraModifica("Rinnovo contratto", dettagli.join("; "));
      programmaSalvataggio(); renderTab("gestione-rosa");
    });

    // Pulsante "✕" nello storico Svincoli: toglie solo il ricordo scritto (movimento vero già avvenuto).
    document.querySelectorAll(".s-rimuovi").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.i);
        stato.svincoli.splice(i, 1);
        programmaSalvataggio(); renderTab("gestione-rosa");
      });
    });

    // Pulsante "✕" nello storico Acquisti in asta: correzione di errore — toglie sia la riga di storico
    // sia il giocatore dalla Rosa (annulla l'acquisto per intero).
    document.querySelectorAll(".aa-rimuovi").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.i);
        const voce = stato.acquistiAsta[i];
        if (!confirm(`Annullare l'acquisto di "${voce.nome}"? Verrà tolto anche dalla Rosa.`)) return;
        const idxRosa = stato.rosa.findIndex(p => p.id === voce.id);
        if (idxRosa !== -1) stato.rosa.splice(idxRosa, 1);
        stato.acquistiAsta.splice(i, 1);
        registraModifica("Annullamento acquisto", `${voce.nome} tolto dalla Rosa (acquisto corretto/annullato)`);
        programmaSalvataggio(); renderTab("gestione-rosa");
      });
    });
  } else if (tab === "prestiti") {
    document.getElementById("btn-agg-prestito-banca").addEventListener("click", () => {
      stato.prestitiBancari = stato.prestitiBancari || [];
      stato.prestitiBancari.push({ descrizione: "", capitale: 0, anni: 1, perRisanare: false, incassatoQuestAnno: true, annoErogazione: stato.stagioneCorrente });
      registraModifica("Richiesta prestito bancario", "Nuovo prestito creato in Banca (da compilare con capitale e anni)");
      programmaSalvataggio(); renderTab("prestiti");
    });
    document.querySelectorAll("#corpo-prestiti-banca tr").forEach(tr => {
      const i = parseInt(tr.dataset.i);
      const campo = (cls, key, tipo) => {
        const el = tr.querySelector(cls);
        const leggi = () => {
          let v = el.value;
          if (tipo === "number") v = v === "" ? 0 : Math.min(150, Math.max(0, parseFloat(v) || 0));
          if (tipo === "int") v = parseInt(v) || 1;
          if (tipo === "checkbox") v = el.checked;
          stato.prestitiBancari[i][key] = v;
          programmaSalvataggio();
        };
        const eventoVivo = tipo === "checkbox" || tipo === "int" ? "change" : "input";
        el.addEventListener(eventoVivo, leggi);
        el.addEventListener("change", () => { leggi(); renderTab("prestiti"); });
      };
      campo(".pb-descr", "descrizione"); campo(".pb-capitale", "capitale", "number"); campo(".pb-anni", "anni", "int");
      campo(".pb-risanare", "perRisanare", "checkbox"); campo(".pb-incassato", "incassatoQuestAnno", "checkbox");
      tr.querySelector(".pb-rimuovi").addEventListener("click", () => {
        stato.prestitiBancari.splice(i, 1); programmaSalvataggio(); renderTab("prestiti");
      });
    });
  } else if (tab === "bilancio") {
    document.getElementById("btn-chiudi-stagione").addEventListener("click", async () => {
      const mancanti = [];
      if (!stato.piazzamentoCampionato) mancanti.push("Piazzamento Campionato");
      if (!stato.piazzamentoCoppa) mancanti.push("Piazzamento Coppa");
      if (!stato.risultatoChampions) mancanti.push("Risultato Champions");
      if (mancanti.length > 0) {
        const procedereComunque = confirm(
          `Attenzione: non hai ancora scelto ${mancanti.join(", ")} — verranno contati come "niente" (il minimo). Sei sicuro di voler chiudere comunque? Vai su Sponsor & Premi per sistemarli prima, se hai sbagliato.`
        );
        if (!procedereComunque) return;
      }
      const conferma = confirm(
        `Chiudere la stagione ${formattaStagione(stato.stagioneCorrente)} e passare alla ${formattaStagione(stato.stagioneCorrente + 1)}? Non si può annullare.`
      );
      if (!conferma) return;
      const stagioneChiusa = stato.stagioneCorrente;
      chiudiStagione();
      registraModifica("Chiusura stagione", `Stagione ${stagioneChiusa} chiusa, si passa alla ${stato.stagioneCorrente}`);
      programmaSalvataggio();
      renderTab("bilancio");
    });
  }
}

// ---------- Passaggio da una stagione alla successiva ----------
function chiudiStagione() {
  const ce = calc.calcolaContoEconomico(stato);
  const vintoCampionato = stato.piazzamentoCampionato === 1;
  const vintoChampions = stato.risultatoChampions === "1° posto";
  const vintoCoppa = stato.piazzamentoCoppa === 1;

  // Chi ha il contratto che finisce esattamente questa stagione e non è stato rinnovato: il contratto
  // è ormai fatto per intero (valore residuo già a 0 da solo), quindi esce dalla Rosa come un vero svincolo
  // gratuito — non serve nessuna cessione/minusvalenza perché non c'è più nulla da scrivere a bilancio.
  const scadutiNonRinnovati = stato.rosa.filter(p => p.annoFine === stato.stagioneCorrente);
  if (scadutiNonRinnovati.length > 0) {
    stato.rosa = stato.rosa.filter(p => p.annoFine !== stato.stagioneCorrente);
    registraModifica("Contratti scaduti", `Usciti dalla Rosa a fine contratto (non rinnovati): ${scadutiNonRinnovati.map(p => p.nome).join(", ")}`);
  }

  // Copia non modificabile del bilancio della stagione che si chiude, per lo storico.
  stato.storicoStagioni = stato.storicoStagioni || [];
  stato.storicoStagioni.push({
    anno: stato.stagioneCorrente,
    chiusuraBilancio: Math.round(ce.chiusura * 100) / 100,
    capitaleProvvisorio: Math.round(ce.capitaleProvvisorio * 100) / 100,
    piazzamentoCampionato: stato.piazzamentoCampionato,
    piazzamentoCoppa: stato.piazzamentoCoppa,
    risultatoChampions: stato.risultatoChampions,
    stadio: calc.STADI[stato.stadioIdx].nome,
  });

  stato.stagioneCorrente += 1;
  stato.capitaleIniziale = Math.round(ce.capitaleProvvisorio * 100) / 100;
  stato.capitaleAsta = 0;
  stato.investitoQuestAnno = false;
  stato.partiteCasa = 0; stato.vittorieCasa = 0; stato.pareggiCasa = 0;
  stato.bonusCampionatoScorso = vintoCampionato;
  stato.bonusChampionsScorso = vintoChampions;
  stato.bonusCoppaScorso = vintoCoppa;
  stato.piazzamentoCampionato = null; stato.piazzamentoCoppa = null; stato.risultatoChampions = null;
  // La Rosa resta invariata: anni contratto, valore residuo e ammortamento si ricalcolano da soli
  // in base alla nuova Stagione corrente.
  stato.cessioni = []; stato.svincoli = []; stato.acquistiAsta = []; stato.acquistiFuoriAsta = []; stato.prestitiGiocatori = [];
  // I prestiti bancari pluriennali restano (vanno ancora restituiti), ma non sono più "incassati quest'anno".
  stato.prestitiBancari = (stato.prestitiBancari || []).map(p => ({ ...p, incassatoQuestAnno: false }));
  stato.aumentiCapitale = 0; stato.costiVari = 0; stato.multe = 0;
}

// ============================================================
// SCHERMATA LEGA — registro di tutte le squadre
// ============================================================
async function renderLega() {
  mostraSchermata("schermata-lega");
  const el = document.getElementById("contenuto-lega");
  el.innerHTML = "<p>Carico le squadre…</p>";
  let squadre;
  try {
    squadre = await elencoSquadre(legaCorrente);
  } catch (e) {
    el.innerHTML = "<p>Errore: " + (e && e.message ? e.message : e) + "</p>";
    return;
  }
  squadre = squadre.filter(sq => sq.nickname !== "_presidente");
  if (squadre.length === 0) {
    el.innerHTML = "<p>Nessuna squadra ha ancora salvato dati.</p>";
    return;
  }
  const cards = squadre.map(sq => {
    const ce = calc.calcolaContoEconomico(sq);
    return `<div class="card-squadra">
      <h4>${sq.nomeSquadra || sq.nickname}</h4>
      <div class="riga-dato"><span>Chiusura Bilancio</span><b>${ce.chiusura.toFixed(1)}</b></div>
      <div class="riga-dato"><span>Capitale Provvisorio</span><b>${ce.capitaleProvvisorio.toFixed(1)}</b></div>
      <div class="riga-dato"><span>Piazzamento</span><b>${sq.piazzamentoCampionato ? sq.piazzamentoCampionato + "°" : "—"}</b></div>
      <div class="riga-dato"><span>Stadio</span><b>${calc.STADI[sq.stadioIdx || 0].nome}</b></div>
    </div>`;
  }).join("");
  el.innerHTML = `<div class="griglia-lega">${cards}</div>`;
}

// ============================================================
// SCHERMATA ADMIN — crea squadre, apre qualunque squadra senza PIN
// ============================================================
// ============================================================
// SCHERMATA ALTRE SQUADRE — vedi la rosa di chiunque altro, in sola lettura
// ============================================================
async function renderAltreSquadre() {
  mostraSchermata("schermata-altre-squadre");
  const el = document.getElementById("contenuto-altre-squadre");
  el.innerHTML = "<p>Carico le squadre…</p>";
  let squadre;
  try {
    squadre = await elencoSquadre(legaCorrente);
  } catch (e) {
    el.innerHTML = "<p>Errore: " + (e && e.message ? e.message : e) + "</p>";
    return;
  }
  const altre = squadre.filter(s => s.nickname !== nickCorrente && s.nickname !== "_presidente");
  if (altre.length === 0) {
    el.innerHTML = `<div class="sezione"><p style="color:var(--gesso-ombra)">Non ci sono ancora altre squadre create.</p></div>`;
    return;
  }
  el.innerHTML = `
    <div class="sezione">
      <h3>Squadre della lega</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${altre.map(s => `<button class="btn-secondario altra-squadra-riga" data-nickname="${s.nickname}" style="text-align:left">${s.nomeSquadra || s.nickname}</button>`).join("")}
      </div>
    </div>
    <div id="dettaglio-altra-squadra"></div>`;
  document.querySelectorAll(".altra-squadra-riga").forEach(btn => {
    btn.addEventListener("click", () => renderRosaAltraSquadra(btn.dataset.nickname, btn.textContent));
  });
}

async function renderRosaAltraSquadra(nickname, nomeVisualizzato) {
  const el = document.getElementById("dettaglio-altra-squadra");
  el.innerHTML = "<p>Carico la rosa…</p>";
  let statoAltro;
  try {
    statoAltro = await caricaSquadra(legaCorrente, nickname);
  } catch (e) {
    el.innerHTML = "<p>Errore: " + (e && e.message ? e.message : e) + "</p>";
    return;
  }
  if (!statoAltro) { el.innerHTML = "<p>Squadra non trovata.</p>"; return; }
  const rosa = statoAltro.rosa || [];
  const stagioneAltro = statoAltro.stagioneCorrente;
  const ordineRuoli = { P: 0, D: 1, C: 2, A: 3 };
  const gruppi = [
    { chiave: "Titolare", etichetta: "Titolari" },
    { chiave: "U21", etichetta: "Under 21" },
    { chiave: "Extra", etichetta: "Extra" },
  ];
  const sezioni = gruppi.map(({ chiave, etichetta }) => {
    const giocatori = rosa.filter(p => (p.gruppo || "Titolare") === chiave)
      .sort((a, b) => (ordineRuoli[a.ruolo] ?? 9) - (ordineRuoli[b.ruolo] ?? 9));
    const righe = giocatori.map(p => `
      <tr><td style="text-align:center">${p.ruolo}</td><td style="text-align:center">${p.nome}</td><td style="text-align:center" class="cifra">${(p.costo || 0).toFixed(1)}</td><td style="text-align:center">${calc.anniRimanenti(p, stagioneAltro)}</td></tr>`).join("");
    return `
    <p style="font-size:13px;font-weight:600;color:var(--ambra);margin:14px 0 6px">${etichetta} — ${giocatori.length}</p>
    <div class="tabella-scroll"><table class="tabella-rosa">
      <thead><tr><th style="text-align:center">Ruolo</th><th style="text-align:center">Nome</th><th style="text-align:center">Costo acquisto</th><th style="text-align:center">Anni rimanenti</th></tr></thead>
      <tbody>${righe || `<tr><td colspan="4" style="text-align:center;color:var(--gesso-ombra);font-size:12px;padding:8px">— nessuno —</td></tr>`}</tbody>
    </table></div>`;
  }).join("");
  el.innerHTML = `
  <div class="sezione">
    <h3>${nomeVisualizzato}</h3>
    ${sezioni}
  </div>`;
}

// ============================================================
// SCHERMATA ISTRUZIONI — guida completa, sempre coerente con i valori veri
// ============================================================
function sezioneIstr(titolo, corpoHtml) {
  return `<div class="istr-sezione">
    <p class="istr-titolo">${titolo}</p>
    <div class="istr-corpo">${corpoHtml}</div>
  </div>`;
}

// ============================================================
// SCHERMATA MERCATO — Proposte / Offerte / Trattative completate
// ============================================================
// Una "proposta" (collezione Firestore "proposte") rappresenta una trattativa tra due squadre.
// Campi: tipo ("acquisto"|"prestito_secco"|"prestito_riscatto"|"scambio"),
// proponenteNickname/proponenteSquadra, proprietarioNickname/proprietarioSquadra,
// giocatore:{nome,ruolo,costoOriginale} (quello del proprietario, oggetto della trattativa),
// giocatoreScambio:{nome,ruolo,costoOriginale}|null (solo scambio: quello offerto dal proponente),
// prezzo (acquisto/prestito: prezzo pieno; scambio: eventuale conguaglio pagato dal proponente, può essere 0),
// prestitoCostoRiscatto, prestitoStipendio (solo prestiti),
// turnoDi ("proponente"|"proprietario": chi deve rispondere ora),
// stato ("in_trattativa"|"accettato"|"rifiutato"),
// completatoDaProponente, completatoDaProprietario (bool: chi ha già applicato l'effetto sulla propria Rosa),
// dataCreazione, dataUltimaModifica.

function renderProposte() {
  mostraSchermata("schermata-proposte");
  precaricaElencoAltreSquadre();
  document.querySelectorAll("#schermata-proposte .mtab-btn").forEach(btn => {
    btn.classList.toggle("attivo", btn.dataset.mtab === mercatoSottoTab);
    btn.onclick = () => { mercatoSottoTab = btn.dataset.mtab; mercatoSquadraScelta = null; mercatoOffertaAperta = null; renderProposte(); };
  });
  const el = document.getElementById("contenuto-proposte");
  el.innerHTML = `<p style="font-size:12px;color:var(--gesso-ombra)">Carico...</p>`;
  if (mercatoSottoTab === "sfoglia") renderMercatoSfoglia();
  else if (mercatoSottoTab === "offerte") renderMercatoOfferte();
  else renderMercatoCompletate();
}

// ---------- Sotto-pagina 1: Proposte (sfoglia rose avversarie, fai offerte) ----------
function renderMercatoSfoglia() {
  const el = document.getElementById("contenuto-proposte");
  const altreSquadre = elencoAltreSquadreCache || [];
  const opzSquadre = `<option value="">— scegli una squadra —</option>` +
    altreSquadre.map(s => `<option value="${s.nickname}">${s.nomeSquadra}</option>`).join("");

  const rosaHtml = () => {
    if (!mercatoSquadraScelta) return "";
    const righe = mercatoSquadraScelta.rosa.map((p, idx) => {
      const apertoQui = mercatoOffertaAperta === idx;
      return `
      <tr>
        <td>${p.ruolo}</td><td>${p.nome}</td><td class="cifra">${(p.costo || 0).toFixed(1)}</td>
        <td>${formattaStagione(p.annoFine)}</td>
        <td><button class="btn-testo ms-offri" data-idx="${idx}">${apertoQui ? "Chiudi" : "Fai un'offerta"}</button></td>
      </tr>
      ${apertoQui ? `<tr><td colspan="5">${formModuloOfferta(p)}</td></tr>` : ""}`;
    }).join("");
    return `
    <div class="tabella-scroll" style="margin-top:12px"><table class="tabella-rosa">
      <thead><tr><th>Ruolo</th><th>Nome</th><th style="text-align:right">Costo</th><th>Scadenza</th><th></th></tr></thead>
      <tbody>${righe}</tbody>
    </table></div>`;
  };

  el.innerHTML = `
  <div class="sezione">
    <h3>Sfoglia le rose avversarie</h3>
    <div class="campo" style="max-width:320px"><label>Squadra</label><select id="ms-squadra-sel">${opzSquadre}</select></div>
    <div id="ms-rosa-wrap">${rosaHtml()}</div>
  </div>`;

  document.getElementById("ms-squadra-sel").value = mercatoSquadraScelta?.nickname || "";
  document.getElementById("ms-squadra-sel").addEventListener("change", async (e) => {
    const nickname = e.target.value;
    mercatoOffertaAperta = null;
    if (!nickname) { mercatoSquadraScelta = null; document.getElementById("ms-rosa-wrap").innerHTML = ""; return; }
    document.getElementById("ms-rosa-wrap").innerHTML = `<p style="font-size:12px;color:var(--gesso-ombra)">Carico la rosa...</p>`;
    const statoAltro = await caricaSquadra(legaCorrente, nickname);
    const nomeSquadra = (altreSquadre.find(s => s.nickname === nickname) || {}).nomeSquadra || nickname;
    mercatoSquadraScelta = { nickname, nomeSquadra, rosa: (statoAltro && statoAltro.rosa) || [] };
    document.getElementById("ms-rosa-wrap").innerHTML = rosaHtml();
    agganciaEventiMercatoSfoglia();
  });
  agganciaEventiMercatoSfoglia();
}

function formModuloOfferta(giocatoreAltrui) {
  const mieiGiocatori = stato.rosa.map((p, idx) =>
    `<option value="${idx}">${p.nome} — ${p.ruolo}, costo ${(p.costo || 0).toFixed(1)}</option>`).join("");
  const stipendioAuto = calc.stipendio(giocatoreAltrui).toFixed(1); // stipendio vero che il giocatore ha ORA nell'altra squadra
  return `
  <div class="sezione" style="margin:8px 0;padding:12px;background:rgba(255,255,255,.03)">
    <div class="griglia-2">
      <div class="campo"><label>Tipo di offerta</label>
        <select id="of-tipo">
          <option value="acquisto">Acquisto definitivo</option>
          <option value="prestito_secco">Prestito secco</option>
          <option value="prestito_riscatto">Prestito con diritto di riscatto</option>
          <option value="scambio">Scambio</option>
        </select>
      </div>
      <div class="campo" id="of-prezzo-wrap"><label>Prezzo offerto (mln)</label><input type="number" id="of-prezzo" value="0" /></div>
    </div>
    <div class="griglia-2">
      <div class="campo" id="of-riscatto-wrap" hidden><label>Costo riscatto</label><input type="number" id="of-riscatto" value="0" /></div>
      <div class="campo" id="of-stipendio-wrap" hidden><label>Stipendio annuo (automatico, quello vero attuale)</label><input type="number" id="of-stipendio" value="${stipendioAuto}" readonly /></div>
    </div>
    <div class="campo" id="of-scambio-wrap" hidden>
      <label>Tuo giocatore da offrire in cambio</label>
      <select id="of-mio-giocatore"><option value="">— scegli —</option>${mieiGiocatori}</select>
      <p style="font-size:11px;color:var(--gesso-ombra);margin:4px 0 0">Il "Prezzo" sopra diventa un eventuale conguaglio in soldi che paghi tu in aggiunta (0 se scambio alla pari). Lo stipendio del giocatore ricevuto si calcola da solo più avanti, dal suo costo.</p>
    </div>
    <button class="btn-piccolo of-invia" data-idx="${mercatoOffertaAperta}">Invia offerta</button>
  </div>`;
}

function agganciaEventiMercatoSfoglia() {
  document.querySelectorAll(".ms-offri").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      mercatoOffertaAperta = mercatoOffertaAperta === idx ? null : idx;
      document.getElementById("ms-rosa-wrap").innerHTML = (function() {
        const righe = mercatoSquadraScelta.rosa.map((p, i) => {
          const apertoQui = mercatoOffertaAperta === i;
          return `<tr><td>${p.ruolo}</td><td>${p.nome}</td><td class="cifra">${(p.costo || 0).toFixed(1)}</td>
            <td>${formattaStagione(p.annoFine)}</td>
            <td><button class="btn-testo ms-offri" data-idx="${i}">${apertoQui ? "Chiudi" : "Fai un'offerta"}</button></td></tr>
            ${apertoQui ? `<tr><td colspan="5">${formModuloOfferta(p)}</td></tr>` : ""}`;
        }).join("");
        return `<div class="tabella-scroll" style="margin-top:12px"><table class="tabella-rosa">
          <thead><tr><th>Ruolo</th><th>Nome</th><th style="text-align:right">Costo</th><th>Scadenza</th><th></th></tr></thead>
          <tbody>${righe}</tbody></table></div>`;
      })();
      agganciaEventiMercatoSfoglia();
    });
  });

  const selTipo = document.getElementById("of-tipo");
  if (selTipo) {
    const aggiorna = () => {
      const t = selTipo.value;
      document.getElementById("of-riscatto-wrap").hidden = t !== "prestito_riscatto";
      document.getElementById("of-stipendio-wrap").hidden = !(t === "prestito_secco" || t === "prestito_riscatto");
      document.getElementById("of-scambio-wrap").hidden = t !== "scambio";
      document.getElementById("of-prezzo-wrap").querySelector("label").textContent =
        t === "scambio" ? "Conguaglio in soldi (0 se alla pari)" : t.startsWith("prestito") ? "Costo prestito" : "Prezzo offerto (mln)";
    };
    selTipo.addEventListener("change", aggiorna);
    aggiorna();
  }

  document.querySelectorAll(".of-invia").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.idx);
      const giocatore = mercatoSquadraScelta.rosa[idx];
      const tipo = document.getElementById("of-tipo").value;
      const prezzo = parseFloat(document.getElementById("of-prezzo").value) || 0;
      let giocatoreScambio = null;
      if (tipo === "scambio") {
        const idxMio = document.getElementById("of-mio-giocatore").value;
        if (idxMio === "") { alert("Scegli un tuo giocatore da offrire in cambio."); return; }
        const mio = stato.rosa[parseInt(idxMio)];
        giocatoreScambio = { nome: mio.nome, ruolo: mio.ruolo, costoOriginale: mio.costo || 0 };
      }
      const nuovaProposta = {
        tipo,
        proponenteNickname: nickCorrente, proponenteSquadra: stato.nomeSquadra || nickCorrente,
        proprietarioNickname: mercatoSquadraScelta.nickname, proprietarioSquadra: mercatoSquadraScelta.nomeSquadra,
        giocatore: { nome: giocatore.nome, ruolo: giocatore.ruolo, costoOriginale: giocatore.costo || 0 },
        giocatoreScambio,
        prezzo,
        prestitoCostoRiscatto: tipo === "prestito_riscatto" ? (parseFloat(document.getElementById("of-riscatto").value) || 0) : null,
        prestitoStipendio: tipo.startsWith("prestito") ? (parseFloat(document.getElementById("of-stipendio").value) || 0) : null,
        turnoDi: "proprietario",
        stato: "in_trattativa",
        completatoDaProponente: false, completatoDaProprietario: false,
        dataCreazione: new Date().toISOString(), dataUltimaModifica: new Date().toISOString(),
      };
      try {
        await creaProposta(legaCorrente, nuovaProposta);
        alert(`Offerta inviata a ${mercatoSquadraScelta.nomeSquadra} per ${giocatore.nome}.`);
        mercatoOffertaAperta = null;
        renderProposte();
      } catch (err) {
        alert(`Errore nell'invio dell'offerta: ${err.message || err}. Controlla di aver aggiunto la collezione "proposte" nelle Regole di Firestore (vedi README).`);
      }
    });
  });
}

// ---------- Sotto-pagina 2: Offerte (le mie, ricevute e inviate — accetta/rifiuta/controfferta) ----------
const ETICHETTE_TIPO = { acquisto: "Acquisto definitivo", prestito_secco: "Prestito secco", prestito_riscatto: "Prestito con riscatto", scambio: "Scambio" };

async function renderMercatoOfferte() {
  let tutte;
  try { tutte = await elencoProposte(legaCorrente); } catch (err) {
    document.getElementById("contenuto-proposte").innerHTML = `<div class="sezione"><p style="color:var(--rosso-cartellino)">Non riesco a leggere le offerte (${err.message || err}). Controlla le Regole di Firestore (vedi README, serve la collezione "proposte").</p></div>`;
    return;
  }
  // Se hai accettato un'offerta e nel frattempo chi l'aveva creata ha già completato la sua parte
  // (scelto il contratto), il tuo lato si applica ora, in automatico — non dovevi cliccare nulla.
  const daFinalizzareAutomaticamente = tutte.filter(p =>
    p.proprietarioNickname === nickCorrente && p.stato === "accettato" && p.completatoDaProponente && !p.completatoDaProprietario
  );
  if (daFinalizzareAutomaticamente.length > 0) {
    for (const p of daFinalizzareAutomaticamente) await completaTrasferimento(p.id, p);
    try { tutte = await elencoProposte(legaCorrente); } catch { /* uso comunque i dati che ho */ }
  }
  // Le trattative completate da ENTRAMBI i lati non stanno più qui — vanno solo in "Trattative completate".
  const mie = tutte.filter(p =>
    (p.proponenteNickname === nickCorrente || p.proprietarioNickname === nickCorrente) &&
    !(p.stato === "accettato" && p.completatoDaProponente && p.completatoDaProprietario)
  );
  const el = document.getElementById("contenuto-proposte");

  const rigaOfferta = (p) => {
    const sonoProponente = p.proponenteNickname === nickCorrente;
    const altraSquadra = sonoProponente ? p.proprietarioSquadra : p.proponenteSquadra;
    const tocca = p.stato === "in_trattativa" && ((sonoProponente && p.turnoDi === "proponente") || (!sonoProponente && p.turnoDi === "proprietario"));
    const daCompletare = p.stato === "accettato" && ((sonoProponente && !p.completatoDaProponente) || (!sonoProponente && !p.completatoDaProprietario));
    const scambioTxt = p.giocatoreScambio ? ` ↔ ${p.giocatoreScambio.nome} (${p.giocatoreScambio.ruolo})` : "";
    let statoTxt, azioni = "";
    if (p.stato === "rifiutato") statoTxt = `<span style="color:var(--rosso-cartellino)">Rifiutata</span>`;
    else if (daCompletare) { statoTxt = `<span style="color:var(--ok)">Accettata — completa il trasferimento</span>`; azioni = `<button class="btn-piccolo pr-completa" data-id="${p.id}">Completa trasferimento</button>`; }
    else if (p.stato === "accettato") {
      statoTxt = `In attesa che ${altraSquadra} completi`;
      // Tu (proprietario) hai già accettato, ma puoi ancora tirarti indietro finché lui non ha completato.
      if (!sonoProponente) azioni = `<button class="btn-testo pr-annulla" data-id="${p.id}">Annulla</button>`;
    }
    else if (tocca) { statoTxt = `<b>Tocca a te rispondere</b>`; azioni = `
      <button class="btn-piccolo pr-accetta" data-id="${p.id}">Accetta</button>
      <button class="btn-piccolo pr-rifiuta" data-id="${p.id}">Rifiuta</button>
      <input type="number" class="pr-controprezzo" data-id="${p.id}" placeholder="Nuovo prezzo" style="width:110px" />
      <button class="btn-piccolo pr-controfferta" data-id="${p.id}">Controfferta</button>`; }
    else statoTxt = `In attesa di ${altraSquadra}`;
    // Chi ha creato l'offerta può sempre annullarla, finché la trattativa è ancora aperta.
    if (sonoProponente && p.stato === "in_trattativa") {
      azioni += ` <button class="btn-testo pr-annulla" data-id="${p.id}">Annulla offerta</button>`;
    }
    return `<tr>
      <td>${p.giocatore.nome} (${p.giocatore.ruolo})${scambioTxt}</td>
      <td>${ETICHETTE_TIPO[p.tipo] || p.tipo}</td>
      <td>${altraSquadra}</td>
      <td class="cifra">${(p.prezzo || 0).toFixed(1)}</td>
      <td>${statoTxt}</td>
      <td>${azioni}</td>
    </tr>`;
  };

  el.innerHTML = `
  <div class="sezione">
    <h3>Le tue offerte</h3>
    ${mie.length === 0 ? `<p style="font-size:12px;color:var(--gesso-ombra)">Nessuna offerta in corso.</p>` : `
    <div class="tabella-scroll"><table class="tabella-rosa">
      <thead><tr><th>Giocatore</th><th>Tipo</th><th>Con</th><th style="text-align:right">Prezzo</th><th>Stato</th><th></th></tr></thead>
      <tbody>${mie.map(rigaOfferta).join("")}</tbody>
    </table></div>`}
  </div>`;

  document.querySelectorAll(".pr-accetta").forEach(btn => btn.addEventListener("click", () => rispondiOfferta(btn.dataset.id, "accetta")));
  document.querySelectorAll(".pr-rifiuta").forEach(btn => btn.addEventListener("click", () => rispondiOfferta(btn.dataset.id, "rifiuta")));
  document.querySelectorAll(".pr-annulla").forEach(btn => btn.addEventListener("click", () => {
    if (!confirm("Annullare questa offerta? Sparirà per entrambe le squadre.")) return;
    rispondiOfferta(btn.dataset.id, "annulla");
  }));
  document.querySelectorAll(".pr-controfferta").forEach(btn => btn.addEventListener("click", () => {
    const input = document.querySelector(`.pr-controprezzo[data-id="${btn.dataset.id}"]`);
    const nuovoPrezzo = parseFloat(input.value);
    if (isNaN(nuovoPrezzo)) { alert("Scrivi un prezzo per la controfferta."); return; }
    rispondiOfferta(btn.dataset.id, "controfferta", nuovoPrezzo);
  }));
  document.querySelectorAll(".pr-completa").forEach(btn => btn.addEventListener("click", () => completaTrasferimento(btn.dataset.id, tutte.find(p => p.id === btn.dataset.id))));
}

async function rispondiOfferta(id, azione, nuovoPrezzo) {
  try {
    const tutte = await elencoProposte(legaCorrente);
    const p = tutte.find(x => x.id === id);
    if (!p) return;
    const sonoProponente = p.proponenteNickname === nickCorrente;
    if (azione === "rifiuta") {
      await aggiornaProposta(legaCorrente, id, { stato: "rifiutato", dataUltimaModifica: new Date().toISOString() });
    } else if (azione === "annulla") {
      await eliminaProposta(legaCorrente, id);
    } else if (azione === "accetta") {
      // Accettare è la TUA unica azione: il tuo lato si applica da solo, ma solo più avanti,
      // quando anche chi ha creato l'offerta avrà scelto il contratto e completato la sua parte.
      await aggiornaProposta(legaCorrente, id, { stato: "accettato", dataUltimaModifica: new Date().toISOString() });
    } else if (azione === "controfferta") {
      await aggiornaProposta(legaCorrente, id, { prezzo: nuovoPrezzo, turnoDi: sonoProponente ? "proprietario" : "proponente", dataUltimaModifica: new Date().toISOString() });
    }
    renderMercatoOfferte();
    aggiornaBadgeProposte();
  } catch (err) {
    alert(`Errore: ${err.message || err}. Controlla la connessione o le Regole di Firestore.`);
  }
}

// Applica l'effetto della trattativa SOLO sul proprio stato (mai su quello dell'altra squadra) —
// una volta che entrambe le parti hanno completato, la trattativa passa in "Completate".
async function completaTrasferimento(id, proposta) {
  if (!proposta) { const tutte = await elencoProposte(legaCorrente); proposta = tutte.find(p => p.id === id); }
  if (!proposta) return;
  const sonoProponente = proposta.proponenteNickname === nickCorrente;
  const { tipo, giocatore, giocatoreScambio, prezzo, prestitoCostoRiscatto, prestitoStipendio, proponenteSquadra, proprietarioSquadra } = proposta;

  if (tipo === "prestito_secco" || tipo === "prestito_riscatto") {
    stato.prestitiGiocatori = stato.prestitiGiocatori || [];
    if (sonoProponente) {
      stato.prestitiGiocatori.push({
        ruolo: giocatore.ruolo, nome: giocatore.nome, controparte: proprietarioSquadra, direzione: "In entrata",
        tipo: tipo === "prestito_riscatto" ? "Diritto di riscatto" : "Secco",
        costoPrestito: prezzo, costoRiscatto: prestitoCostoRiscatto || 0, stipendioACarico: prestitoStipendio || 0,
        quotaPercento: 100, gruppo: "Extra",
      });
      registraModifica("Prestito da Mercato (in entrata)", `${giocatore.nome} da ${proprietarioSquadra}`);
    } else {
      stato.prestitiGiocatori.push({
        ruolo: giocatore.ruolo, nome: giocatore.nome, controparte: proponenteSquadra, direzione: "In uscita",
        tipo: tipo === "prestito_riscatto" ? "Diritto di riscatto" : "Secco",
        costoPrestito: prezzo, costoRiscatto: prestitoCostoRiscatto || 0, stipendioACarico: prestitoStipendio || 0,
        quotaPercento: 100, gruppo: "Extra",
      });
      registraModifica("Prestito da Mercato (in uscita)", `${giocatore.nome} a ${proponenteSquadra}`);
    }
  } else if (tipo === "acquisto") {
    if (sonoProponente) {
      const durataInput = prompt(`Contratto per "${giocatore.nome}": durata in anni? (1-5)`, "3");
      const durata = Math.min(5, Math.max(1, parseInt(durataInput) || 3));
      const annoFine = stato.stagioneCorrente + durata - 1;
      const quotaInput = prompt(`Quota stagione per "${giocatore.nome}" (100, 50 o 0)?`, "100");
      const quota = [100, 50, 0].includes(parseInt(quotaInput)) ? parseInt(quotaInput) / 100 : 1;
      const id2 = nuovoId();
      stato.rosa.push({ id: id2, ruolo: giocatore.ruolo, nome: giocatore.nome, costo: prezzo, annoInizio: stato.stagioneCorrente, annoFine, quotaStagione: quota, rinnovi: 0, gruppo: "Titolare" });
      stato.acquistiFuoriAsta = stato.acquistiFuoriAsta || [];
      stato.acquistiFuoriAsta.push({ id: id2, ruolo: giocatore.ruolo, nome: giocatore.nome, compratoDa: proprietarioSquadra, prezzo });
      registraModifica("Acquisto da Mercato", `${giocatore.nome} da ${proprietarioSquadra} per ${prezzo}`);
      alert(`Fatto: "${giocatore.nome}" ora è tuo — contratto ${formattaStagione(stato.stagioneCorrente)} → ${formattaStagione(annoFine)} (${durata} anni).`);
    } else {
      const idxRosa = stato.rosa.findIndex(r => r.nome === giocatore.nome);
      const valoreResiduoAlMomento = idxRosa !== -1 ? calc.valoreResiduo(stato.rosa[idxRosa], stato.stagioneCorrente) : 0;
      if (idxRosa !== -1) stato.rosa.splice(idxRosa, 1);
      stato.cessioni = stato.cessioni || [];
      stato.cessioni.push({ nomeGiocatore: giocatore.nome, acquirente: proponenteSquadra, valoreResiduoAlMomento, prezzoCessione: prezzo });
      registraModifica("Cessione da Mercato", `${giocatore.nome} a ${proponenteSquadra} per ${prezzo}`);
    }
  } else if (tipo === "scambio") {
    if (sonoProponente) {
      // Cedo il mio giocatore-scambio (prezzoCessione 0, il conguaglio è già nell'acquisto sotto)
      const idxMio = stato.rosa.findIndex(r => r.nome === giocatoreScambio.nome);
      const valRes = idxMio !== -1 ? calc.valoreResiduo(stato.rosa[idxMio], stato.stagioneCorrente) : 0;
      if (idxMio !== -1) stato.rosa.splice(idxMio, 1);
      stato.cessioni = stato.cessioni || [];
      stato.cessioni.push({ nomeGiocatore: giocatoreScambio.nome, acquirente: proprietarioSquadra, valoreResiduoAlMomento: valRes, prezzoCessione: 0 });
      // Ricevo il suo giocatore: imposto il contratto
      const durataInput = prompt(`Contratto per "${giocatore.nome}" (ricevuto in scambio): durata in anni? (1-5)`, "3");
      const durata = Math.min(5, Math.max(1, parseInt(durataInput) || 3));
      const annoFine = stato.stagioneCorrente + durata - 1;
      const quotaInput = prompt(`Quota stagione per "${giocatore.nome}" (100, 50 o 0)?`, "100");
      const quota = [100, 50, 0].includes(parseInt(quotaInput)) ? parseInt(quotaInput) / 100 : 1;
      const id2 = nuovoId();
      stato.rosa.push({ id: id2, ruolo: giocatore.ruolo, nome: giocatore.nome, costo: prezzo, annoInizio: stato.stagioneCorrente, annoFine, quotaStagione: quota, rinnovi: 0, gruppo: "Titolare" });
      stato.acquistiFuoriAsta = stato.acquistiFuoriAsta || [];
      stato.acquistiFuoriAsta.push({ id: id2, ruolo: giocatore.ruolo, nome: giocatore.nome, compratoDa: proprietarioSquadra, prezzo });
      registraModifica("Scambio da Mercato", `${giocatoreScambio.nome} ↔ ${giocatore.nome} con ${proprietarioSquadra} (conguaglio ${prezzo})`);
      alert(`Fatto: "${giocatore.nome}" ora è tuo — contratto ${formattaStagione(stato.stagioneCorrente)} → ${formattaStagione(annoFine)} (${durata} anni).`);
    } else {
      // Cedo il giocatore richiesto, ricevo prezzo come cessione
      const idxRichiesto = stato.rosa.findIndex(r => r.nome === giocatore.nome);
      const valRes = idxRichiesto !== -1 ? calc.valoreResiduo(stato.rosa[idxRichiesto], stato.stagioneCorrente) : 0;
      if (idxRichiesto !== -1) stato.rosa.splice(idxRichiesto, 1);
      stato.cessioni = stato.cessioni || [];
      stato.cessioni.push({ nomeGiocatore: giocatore.nome, acquirente: proponenteSquadra, valoreResiduoAlMomento: valRes, prezzoCessione: prezzo });
      // Ricevo il suo giocatore-scambio: imposto il contratto
      const durataInput = prompt(`Contratto per "${giocatoreScambio.nome}" (ricevuto in scambio): durata in anni? (1-5)`, "3");
      const durata = Math.min(5, Math.max(1, parseInt(durataInput) || 3));
      const annoFine = stato.stagioneCorrente + durata - 1;
      const quotaInput = prompt(`Quota stagione per "${giocatoreScambio.nome}" (100, 50 o 0)?`, "100");
      const quota = [100, 50, 0].includes(parseInt(quotaInput)) ? parseInt(quotaInput) / 100 : 1;
      const id2 = nuovoId();
      stato.rosa.push({ id: id2, ruolo: giocatoreScambio.ruolo, nome: giocatoreScambio.nome, costo: 0, annoInizio: stato.stagioneCorrente, annoFine, quotaStagione: quota, rinnovi: 0, gruppo: "Titolare" });
      stato.acquistiFuoriAsta = stato.acquistiFuoriAsta || [];
      stato.acquistiFuoriAsta.push({ id: id2, ruolo: giocatoreScambio.ruolo, nome: giocatoreScambio.nome, compratoDa: proponenteSquadra, prezzo: 0 });
      registraModifica("Scambio da Mercato", `${giocatore.nome} ↔ ${giocatoreScambio.nome} con ${proponenteSquadra} (conguaglio ${prezzo})`);
      alert(`Fatto: "${giocatoreScambio.nome}" ora è tuo — contratto ${formattaStagione(stato.stagioneCorrente)} → ${formattaStagione(annoFine)} (${durata} anni).`);
    }
  }

  const aggiornamento = sonoProponente ? { completatoDaProponente: true } : { completatoDaProprietario: true };
  try {
    await aggiornaProposta(legaCorrente, id, { ...aggiornamento, dataUltimaModifica: new Date().toISOString() });
  } catch (err) {
    alert(`Il trasferimento è stato applicato alla tua Rosa, ma non sono riuscito ad aggiornare lo stato della trattativa su Mercato (${err.message || err}). Riprova a premere "Completa trasferimento" per sincronizzarlo.`);
  }
  programmaSalvataggio();
  renderMercatoOfferte();
  aggiornaBadgeProposte();
}

// ---------- Sotto-pagina 3: Trattative completate (di tutta la lega) ----------
async function renderMercatoCompletate() {
  let tutte;
  try { tutte = await elencoProposte(legaCorrente); } catch (err) {
    document.getElementById("contenuto-proposte").innerHTML = `<div class="sezione"><p style="color:var(--rosso-cartellino)">Non riesco a leggere le trattative (${err.message || err}). Controlla le Regole di Firestore (vedi README, serve la collezione "proposte").</p></div>`;
    return;
  }
  const completate = tutte.filter(p => p.stato === "accettato" && p.completatoDaProponente && p.completatoDaProprietario);
  const el = document.getElementById("contenuto-proposte");
  const righe = completate.map(p => {
    const scambioTxt = p.giocatoreScambio ? ` ↔ ${p.giocatoreScambio.nome}` : "";
    return `<tr><td>${p.proprietarioSquadra}</td><td>${p.proponenteSquadra}</td><td>${p.giocatore.nome}${scambioTxt}</td><td>${ETICHETTE_TIPO[p.tipo] || p.tipo}</td><td class="cifra">${(p.prezzo || 0).toFixed(1)}</td></tr>`;
  }).join("");
  el.innerHTML = `
  <div class="sezione">
    <h3>Trattative completate (tutta la lega)</h3>
    ${completate.length === 0 ? `<p style="font-size:12px;color:var(--gesso-ombra)">Nessuna trattativa completata ancora.</p>` : `
    <div class="tabella-scroll"><table class="tabella-rosa">
      <thead><tr><th>Da</th><th>A</th><th>Giocatore</th><th>Tipo</th><th style="text-align:right">Costo</th></tr></thead>
      <tbody>${righe}</tbody>
    </table></div>`}
  </div>`;
}


function renderIstruzioni() {
  mostraSchermata("schermata-istruzioni");
  const el = document.getElementById("contenuto-istruzioni");

  const tabFasce = `<table class="istr-tabella"><tr><th>Fascia di costo (mln)</th><th>Stipendio (mln)</th></tr>
    <tr><td>1 - 5</td><td>2</td></tr>
    <tr><td>6 - 10</td><td>3</td></tr>
    <tr><td>11 - 20</td><td>4</td></tr>
    <tr><td>21 - 30</td><td>5</td></tr>
    <tr><td>31 - 40</td><td>6</td></tr>
    <tr><td>41 - 50</td><td>7</td></tr>
    <tr><td>51 - 60</td><td>8</td></tr>
    <tr><td>61 - 70</td><td>9</td></tr>
    <tr><td>71 - 80</td><td>10</td></tr>
    <tr><td>81 - 90</td><td>11</td></tr>
    <tr><td>91 - 100</td><td>12</td></tr>
    <tr><td>101 - 150</td><td>13</td></tr>
    <tr><td>151-oltre</td><td>15</td></tr></table>`;

  const tabStadio = `<table class="istr-tabella"><tr><th>Capienza</th><th>Costo/anno</th><th>Sconfitta</th><th>Pareggio</th><th>Vittoria</th><th>Investimento</th></tr>
    ${calc.STADI.map(s => `<tr><td>${s.nome}</td><td>${s.costo}</td><td>${s.sconfitta}</td><td>${s.pareggio}</td><td>${s.vittoria}</td><td>${s.investimento ?? "—"}</td></tr>`).join("")}
    </table>`;

  const tabPremio = `<table class="istr-tabella"><tr><th>Piazzamento</th><th>Premio campionato</th><th>Coppa</th></tr>
    ${calc.PREMIO_CAMPIONATO.map((v, i) => `<tr><td>${i + 1}°</td><td>${v}</td><td>${calc.PREMIO_COPPA[i]}</td></tr>`).join("")}
    </table>`;

  const tabChampions = `<table class="istr-tabella"><tr><th>Champions</th><th>Premio</th></tr>
    ${Object.entries(calc.PREMIO_CHAMPIONS).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}
    </table>`;

  const tabSanzioni = `<table class="istr-tabella"><tr><th>Perdita da</th><th>Perdita a</th><th>Punti</th></tr>
    ${calc.SANZIONI.map(s => `<tr><td>${s.da}</td><td>${s.a === Infinity ? "in su" : s.a}</td><td>${s.punti}</td></tr>`).join("")}
    </table>`;

  el.innerHTML = `
  ${sezioneIstr("📁 Come funziona il sito", `
    Il sito ora è organizzato in <b>leghe</b>: quando arrivi, scegli se crearne una nuova (tu diventi l'admin di quella lega) o cercarne una esistente per nome, poi entri con nickname e PIN della tua squadra dentro quella lega — ogni lega è separata dalle altre, squadre e mercato non si vedono tra leghe diverse.<br>
    Una volta dentro la tua squadra, il sito ha 7 sezioni (le trovi come schede in alto): <b>Anagrafica</b>, <b>Stadio</b>, <b>Sponsor & Premi</b>, <b>Rosa</b>, <b>Gestione Rosa</b>, <b>Banca</b>, <b>Conto Economico</b> — più il pulsante <b>Chiudi stagione</b> in fondo al Conto Economico. In alto trovi anche <b>🔄 Mercato</b> (le trattative con le altre squadre) e <b>👥 Altre squadre</b> (le rose altrui, solo in lettura). Chi entra come <b>ADMIN</b> vede invece una schermata separata con i bilanci di tutte le squadre della lega.<br>
    Tutto è in <b>milioni</b>, senza nessuna conversione da fare. Tutto quello che scrivi si salva da solo dopo circa mezzo secondo che smetti di scrivere — non serve nessun pulsante "salva". Tutti i campi di testo si scrivono da soli in maiuscolo.
  `)}

  ${sezioneIstr("📋 Anagrafica", `
    Nome società e Allenatore sono solo per riconoscerti. <b>Stagione corrente</b> è l'anno di gioco: serve a calcolare da sola quanti anni restano ai contratti dei giocatori e il loro valore residuo — aggiornala solo premendo il pulsante "Chiudi stagione", non a mano.
    <b>Capitale iniziale</b> è quanto avevi a inizio stagione (500 il primo anno, poi lo aggiorna da solo "Chiudi stagione", sola lettura). <b>Capitale speso in asta</b> si calcola da solo sommando gli Acquisti in asta in Mercato.
  `)}

  ${sezioneIstr("👕 Rosa calciatori", `
    Report: costo e contratto si modificano solo da Mercato. Da qui puoi spostare un giocatore tra <b>Titolare / Under 21 / Extra</b> e cambiare la <b>Quota stagione</b> (100/50/0%, utile se entra/esce a stagione in corso o va in prestito) — entrambe con un menu direttamente nella riga. Dentro ogni gruppo i giocatori sono ordinati P, D, C, A.<br><br>
    In Acquisti scegli <b>Stagione inizio</b> (es. 2026/27) e <b>Durata (anni)</b> — l'Anno fine si calcola da solo, non devi indovinare nessun numero. Un contratto "1 anno" che parte dalla stagione corrente scade infatti già a fine di questa stessa stagione.<br><br>
    <b>Titolari</b>: servono esattamente 3 portieri, 8 difensori, 8 centrocampisti, 6 attaccanti (avviso sopra la tabella se non torna). <b>Under 21</b>: massimo 5 (avviso se superato) — nessuno sconto, paga stipendio e ammortamento normali come tutti. <b>Extra</b>: nessuno sconto, nessun limite di numero.<br><br>
    <b>Stipendio</b> = fascia di costo (tabella sotto) × 1,10 per ogni rinnovo × quota stagione.<br>
    <b>Ammortamento annuo</b> = costo pieno ÷ anni di contratto — sempre pieno, mai scalato dalla quota (il costo di acquisto si consuma comunque, anche se lo dai in prestito o entra a stagione iniziata) — uguale per tutti i gruppi (Under 21 compreso, nessuna fascia, nessuno sconto) — si azzera da solo a contratto scaduto.<br>
    <b>Valore residuo</b> = costo pieno meno quanto già ammortizzato fin qui — scende della stessa identica cifra ogni anno e arriva esattamente a 0 alla fine naturale del contratto (mai prima). Conta quando vendi o svincoli.<br><br>
    <b>Colori</b>: riga <b>rossa</b> = dato in prestito in uscita — può stare solo in Extra (non conta più come Titolare/U21 mentre è via), resta comunque tuo, stipendio/ammortamento continuano. Riga <b>verde</b> = preso in prestito da un'altra squadra — può andare in uno qualunque dei 3 gruppi, Titolare compreso (conta nel controllo ruoli se lo metti lì); non ha costo/contratto/ammortamento con te, l'unico numero vero è lo stipendio a tuo carico (da Mercato → Prestiti giocatori).
    ${tabFasce}
  `)}

  ${sezioneIstr("🏟️ Stadio", `
    4 livelli di capienza, si parte tutti dal più piccolo. Il costo annuo si paga sempre; i ricavi dipendono da quante partite in casa vinci/pareggi/perdi (li inserisci tu, aggiornali quando vuoi). Per salire di livello, spunta "Ho investito per salire" e paghi una volta sola il costo di investimento — poi resti a quel livello pagando solo la quota annuale, finché non decidi di investire ancora.
    ${tabStadio}
  `)}

  ${sezioneIstr("🤝🏆 Sponsor, Premi, Coppa, Champions", `
    <b>Sponsor</b>: 100 fisso per tutti ogni stagione, più un bonus se la stagione SCORSA hai vinto qualcosa (+5% campionato, +3% Champions, +2% Coppa — si sommano tra loro, spuntali tu nella pagina Sponsor & Premi).<br>
    <b>Premio campionato</b> e <b>Coppa</b>: dipendono dal piazzamento di QUESTA stagione, li scegli tu da un menu quando sono noti.<br>
    <b>Champions</b>: dipende dal risultato raggiunto, anche solo partecipando (eliminato nei gironi) prendi qualcosa.
    ${tabPremio}
    ${tabChampions}
  `)}

  ${sezioneIstr("🛠️ Gestione Rosa — Acquisti in asta, Svincoli, Rinnovi", `
    Tutto quello che riguarda solo la tua squadra, senza coinvolgere nessun altro.<br>
    <b>Acquisti in asta</b>: compili ruolo, nome, costo, contratto — il giocatore finisce automaticamente nella tua Rosa, non serve inserirlo due volte. Se sbagli qualcosa, il tasto ✕ nello Storico annulla l'acquisto per intero — toglie sia la riga di storico sia il giocatore dalla Rosa (chiede conferma prima).<br>
    <b>Svincoli</b>: scegli il giocatore da un menu (solo quelli davvero in Rosa). Il Valore residuo si calcola da solo, il giocatore esce subito dalla Rosa, e la minus/plusvalenza va dritta nel Conto Economico. L'Indennizzo si calcola da solo in base al Motivo: <b>Ritiro</b> = ricevi il 50% del Valore residuo, <b>Serie B</b> o <b>Trasferimento estero</b> = ricevi il 100%, <b>Risoluzione consensuale</b> = paghi tu il 100% (indennizzo negativo). Qui il tasto ✕ toglie solo il ricordo scritto (è un movimento già avvenuto per davvero, non si annulla).<br>
    <b>Rinnovo contratto</b>: mostra da solo la lista di chi ha il contratto in scadenza questa stagione — spunta chi vuoi rinnovare, scegli il nuovo anno per ognuno, conferma tutti insieme.<br>
    In fondo, il <b>Registro movimenti</b> segna data e ora di ogni acquisto/svincolo/rinnovo — visibile anche all'ADMIN.
  `)}

  ${sezioneIstr("🔄 Mercato — trattative con le altre squadre", `
    Il bottone "🔄 Mercato" in alto apre una schermata a parte, con 3 pagine.<br>
    <b>Proposte</b>: scegli una squadra dal menu per sfogliare la sua Rosa, poi "Fai un'offerta" sul giocatore che vuoi — scegli il tipo (<b>Acquisto definitivo</b>, <b>Prestito secco</b>, <b>Prestito con diritto di riscatto</b>, o <b>Scambio</b> con un tuo giocatore + eventuale conguaglio) e il prezzo, poi Invia.<br>
    <b>Offerte</b>: qui vedi tutte le tue trattative — quelle che hai fatto tu e quelle ricevute. Quando tocca a te rispondere puoi <b>Accettare</b>, <b>Rifiutare</b>, o fare una <b>Controfferta</b> con un prezzo diverso (si può andare avanti finché uno dei due accetta o rifiuta). Una volta accettata, ognuna delle due squadre deve premere "Completa trasferimento" dal proprio lato — a quel punto soldi e giocatore si spostano davvero: chi riceve un giocatore (acquisto o scambio) sceglie il contratto (anni) in quel momento; per i prestiti non serve, i termini erano già decisi nell'offerta.<br>
    <b>Trattative completate</b>: l'elenco di tutti gli affari conclusi in tutta la lega (chi ha venduto, chi ha comprato, giocatore, costo) — niente contratti, solo per farsi un'idea del mercato.
  `)}

  ${sezioneIstr("🏦 Banca", `
    Registra descrizione, capitale (massimo 150 mln a richiesta), anni (1/2/3) ed eventuale richiesta "per risanare un rosso" (tasso più alto). La colonna "Stato" ti dice da sola quando un prestito è ripagato per intero ("✅ Estinto") — a quel punto smette di pesare sul bilancio da solo, non serve fare nulla (puoi anche rimuoverlo con ✕ se vuoi).
    ${(function(){
      const righe = [1,2,3].map(a => [a, `${(calc.tassoNormale(a)*100).toFixed(0)}%`, `${(calc.tassoRisanamento(a)*100).toFixed(0)}%`]);
      return `<table class="istr-tabella"><tr><th>Anni</th><th>Tasso normale</th><th>Tasso per risanamento</th></tr>${righe.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table>`;
    })()}
  `)}

  ${sezioneIstr("💰 Conto Economico", `
    Qui confluisce tutto quello inserito nelle altre pagine, già collegato in automatico — solo da guardare, niente da scrivere qui.<br>
    <b>TOTALE RICAVI − TOTALE COSTI</b> = risultato prima di plus/minusvalenze; poi si incrocia con le plus/minusvalenze di Cessioni e Svincoli per dare la <b>Chiusura Bilancio</b> finale.<br>
    Il <b>Capitale Provvisorio</b> è invece la cassa vera — conta la spesa reale all'asta, non l'ammortamento — e resta sempre visibile nei riquadri in cima alla pagina.<br>
    Se il bilancio chiude in rosso, scattano sanzioni la stagione successiva (da applicare a mano — il sito non lo fa da solo):
    ${tabSanzioni}
  `)}

  ${sezioneIstr("🔄 Chiudere la stagione", `
    In fondo al Conto Economico trovi il pulsante per passare alla stagione successiva. Cosa fa: il Capitale Provvisorio di oggi diventa il Capitale iniziale nuovo; chi ha il contratto in scadenza proprio questa stagione e <b>non</b> è stato rinnovato esce dalla Rosa da solo (valore residuo già a 0, nessun impatto sul bilancio); gli altri contratti restano invariati e si ricalcolano da soli; i prestiti bancari pluriennali restano; piazzamenti, partite in casa, Cessioni/Svincoli/Acquisti/Prestiti giocatori di questa stagione si azzerano; i bonus sponsor si aggiornano da soli in base a cosa hai vinto. Non si può annullare — controlla "Rinnovo contratto" prima di chiudere se vuoi tenere qualcuno in scadenza.<br>
    Subito sotto al pulsante resta per sempre un <b>Registro bilanci passati</b>: una copia non modificabile con anno, Chiusura Bilancio, Capitale Provvisorio e piazzamenti di ogni stagione già chiusa — così anche dopo che tutto si azzera, la storia della squadra resta consultabile.
  `)}
  `;
}

async function renderAdmin() {
  mostraSchermata("schermata-admin");
  const el = document.getElementById("contenuto-admin");
  el.innerHTML = "<p>Carico le squadre…</p>";
  let squadre;
  try {
    squadre = await elencoSquadre(legaCorrente);
  } catch (e) {
    el.innerHTML = "<p>Errore: " + (e && e.message ? e.message : e) + "</p>";
    return;
  }
  squadre = squadre.filter(sq => sq.nickname !== "_presidente");

  const righeSquadre = squadre.map(sq => {
    const ce = calc.calcolaContoEconomico(sq);
    return `
    <div class="card-squadra" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h4 style="margin:0">${sq.nomeSquadra || sq.nickname} <span style="opacity:.6;font-size:12px">(${sq.nickname})</span></h4>
        <div style="display:flex;gap:6px">
          <button class="btn-piccolo pres-apri" data-nick="${sq.nickname}">Apri e modifica</button>
          <button class="btn-piccolo pres-elimina" data-nick="${sq.nickname}" style="background:var(--rosso-cartellino);color:var(--gesso)">Elimina</button>
        </div>
      </div>
      <div class="riga-dato"><span>Chiusura Bilancio</span><b>${ce.chiusura.toFixed(1)}</b></div>
      <div class="riga-dato"><span>Capitale Provvisorio</span><b>${ce.capitaleProvvisorio.toFixed(1)}</b></div>
      <div class="riga-dato"><span>Piazzamento campionato</span><b>${sq.piazzamentoCampionato ? sq.piazzamentoCampionato + "°" : "—"}</b></div>
      <div class="riga-dato"><span>Stadio</span><b>${calc.STADI[sq.stadioIdx || 0].nome}</b></div>
    </div>`;
  }).join("") || "<p style='font-size:13px;color:var(--gesso-ombra)'>Nessuna squadra creata ancora.</p>";

  el.innerHTML = `
  <div class="sezione">    <h3>Squadre esistenti (${squadre.length}/8)</h3>
    ${righeSquadre}
  </div>
  <div class="sezione">
    <h3>Crea una nuova squadra</h3>
    <div class="griglia-3">
      <div class="campo"><label>Nome squadra (nickname di accesso)</label>
        <input type="text" id="pres-nuovo-nick" /></div>
      <div class="campo"><label>PIN a 4 cifre</label>
        <input type="text" id="pres-nuovo-pin" maxlength="4" inputmode="numeric" /></div>
      <div class="campo" style="display:flex;align-items:flex-end">
        <button id="pres-crea-btn" class="btn-primario" style="margin:0">Crea squadra</button>
      </div>
    </div>
    <p id="pres-errore" class="errore" hidden></p>
  </div>`;

  document.querySelectorAll(".pres-apri").forEach(btn => {
    btn.addEventListener("click", async () => {
      const nick = btn.dataset.nick;
      stato = await caricaSquadra(legaCorrente, nick);
      nickCorrente = nick;
      entraNellaSquadra();
    });
  });

  document.querySelectorAll(".pres-elimina").forEach(btn => {
    btn.addEventListener("click", async () => {
      const nick = btn.dataset.nick;
      const conferma = confirm(`Eliminare definitivamente la squadra "${nick}"? Non si può annullare.`);
      if (!conferma) return;
      await eliminaSquadra(legaCorrente, nick);
      await renderAdmin();
    });
  });

  document.getElementById("pres-crea-btn").addEventListener("click", async () => {
    const nick = document.getElementById("pres-nuovo-nick").value.trim();
    const pin = document.getElementById("pres-nuovo-pin").value.trim();
    const err = document.getElementById("pres-errore");
    err.hidden = true;
    if (!nick) { err.textContent = "Inserisci un nome squadra."; err.hidden = false; return; }
    if (!/^\d{4}$/.test(pin)) { err.textContent = "Il PIN deve avere 4 cifre."; err.hidden = false; return; }
    if (squadre.length >= 8) { err.textContent = "Hai già creato 8 squadre."; err.hidden = false; return; }
    const esistente = await caricaSquadra(legaCorrente, nick);
    if (esistente) { err.textContent = "Esiste già una squadra con questo nome."; err.hidden = false; return; }
    await salvaSquadra(legaCorrente, nick, statoVuoto(nick, pin));
    await renderAdmin();
  });
}

document.getElementById("btn-admin-esci").addEventListener("click", () => {
  stato = null; nickCorrente = null;
  if (adminVenutoDaSuperAdmin) { renderSuperAdmin(); } else { mostraSchermata("schermata-accesso"); }
});

// ============================================================
// SCHERMATA SUPER-ADMIN — vede tutte le leghe, entra in una come admin, o la elimina
// ============================================================
async function renderSuperAdmin() {
  mostraSchermata("schermata-superadmin");
  const el = document.getElementById("contenuto-superadmin");
  el.innerHTML = "<p>Carico le leghe…</p>";
  let leghe;
  try {
    leghe = await elencoLeghe();
  } catch (e) {
    el.innerHTML = "<p>Errore: " + (e && e.message ? e.message : e) + "</p>";
    return;
  }

  const righe = await Promise.all(leghe.map(async (l) => {
    let numSquadre = "?";
    try { numSquadre = (await elencoSquadre(l.legaId)).length; } catch { /* ignoro, mostro ? */ }
    return `
    <div class="card-squadra" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h4 style="margin:0">${l.nomeLega} <span style="opacity:.6;font-size:12px">(${l.legaId})</span></h4>
        <div style="display:flex;gap:6px">
          <button class="btn-piccolo sa-entra" data-id="${l.legaId}">Entra come admin</button>
          <button class="btn-piccolo sa-elimina" data-id="${l.legaId}" style="background:var(--rosso-cartellino);color:var(--gesso)">Elimina lega</button>
        </div>
      </div>
      <div class="riga-dato"><span>Squadre</span><b>${numSquadre}</b></div>
      <div class="riga-dato"><span>Creata il</span><b>${l.dataCreazione ? new Date(l.dataCreazione).toLocaleDateString("it-IT") : "—"}</b></div>
    </div>`;
  }));

  let messaggi = [];
  try { messaggi = await elencoSupporto(); } catch { /* se fallisce, semplicemente non mostro la sezione con dati */ }
  const daRisolvere = messaggi.filter(m => !m.risolto);
  const righeSupporto = daRisolvere.map(m => `
    <div class="card-squadra" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div>
          <b>${m.nome}</b> · <span style="color:var(--ambra)">${m.contatto || "—"}</span> <span style="opacity:.6;font-size:12px">${m.dataInvio ? new Date(m.dataInvio).toLocaleString("it-IT") : ""}</span>
          <p style="margin:6px 0 0;font-size:14px">${m.messaggio}</p>
        </div>
        <button class="btn-testo sup-risolvi" data-id="${m.id}" style="white-space:nowrap">Segna risolto</button>
      </div>
    </div>`).join("");

  el.innerHTML = `
  <div class="sezione">
    <h3>Messaggi di supporto ${daRisolvere.length > 0 ? `(${daRisolvere.length})` : ""}</h3>
    ${righeSupporto || "<p style='font-size:13px;color:var(--gesso-ombra)'>Nessun messaggio in attesa.</p>"}
  </div>
  <div class="sezione">
    <h3>Leghe esistenti (${leghe.length})</h3>
    ${righe.join("") || "<p style='font-size:13px;color:var(--gesso-ombra)'>Nessuna lega creata ancora.</p>"}
  </div>`;

  document.querySelectorAll(".sup-risolvi").forEach(btn => {
    btn.addEventListener("click", async () => {
      try { await eliminaSupporto(btn.dataset.id); await renderSuperAdmin(); }
      catch (e) { alert("Errore: " + (e && e.message ? e.message : e)); }
    });
  });

  document.querySelectorAll(".sa-entra").forEach(btn => {
    btn.addEventListener("click", async () => {
      const legaId = btn.dataset.id;
      legaCorrente = legaId;
      legaDatiCorrente = await caricaLega(legaId);
      adminVenutoDaSuperAdmin = true;
      await renderAdmin();
    });
  });
  document.querySelectorAll(".sa-elimina").forEach(btn => {
    btn.addEventListener("click", async () => {
      const legaId = btn.dataset.id;
      const l = leghe.find(x => x.legaId === legaId);
      if (!confirm(`Eliminare per intero la lega "${l ? l.nomeLega : legaId}"? Tutte le squadre e le trattative al suo interno spariranno per sempre. Non si può annullare.`)) return;
      try {
        await eliminaLega(legaId);
        await renderSuperAdmin();
      } catch (e) {
        alert("Errore nell'eliminazione: " + (e && e.message ? e.message : e));
      }
    });
  });
}

