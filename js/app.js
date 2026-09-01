import * as calc from "./calc.js";
import { caricaSquadra, salvaSquadra, elencoSquadre, eliminaSquadra } from "./storage.js";

let stato = null;   // stato della squadra corrente, in memoria
let nickCorrente = null;
let elencoAltreSquadreCache = null; // cache dei nomi delle altre squadre, per i menu "Controparte"/"Comprato da"
let squadraCacheAcquistoFuoriAsta = null; // { nickname, rosa } scaricata per "Acquisti fuori asta"
let squadraCachePrestitoGiocatore = null; // { nickname, rosa } scaricata per "Prestiti giocatori"
let tabAttiva = "anagrafica";
let salvataggioTimer = null;

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
  target.style.display = "block";
}

// ---------- ACCESSO ----------
const ADMIN_NICKNAME = "ADMIN";

document.getElementById("btn-entra").addEventListener("click", async () => {
  const nickname = document.getElementById("input-nickname").value.trim();
  const pin = document.getElementById("input-pin").value.trim();
  const errEl = document.getElementById("errore-accesso");
  errEl.hidden = true;

  if (!nickname) { errEl.textContent = "Inserisci il nome della tua squadra."; errEl.hidden = false; return; }
  if (!/^\d{4}$/.test(pin)) { errEl.textContent = "Il PIN deve avere 4 cifre."; errEl.hidden = false; return; }

  if (nickname.toUpperCase() === ADMIN_NICKNAME) {
    await entraComeAdmin(pin, errEl);
    return;
  }

  let dati;
  try {
    dati = await caricaSquadra(nickname);
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

async function entraComeAdmin(pin, errEl) {
  let admin;
  try {
    admin = await caricaSquadra("_presidente");
  } catch (e) {
    errEl.textContent = "Errore: " + (e && e.message ? e.message : e);
    errEl.hidden = false;
    return;
  }
  if (!admin) {
    // primo accesso in assoluto: il PIN che scrivi ora diventa quello dell'admin
    await salvaSquadra("_presidente", { pin });
    admin = { pin };
  } else if (admin.pin !== pin) {
    errEl.textContent = "PIN ADMIN non corretto.";
    errEl.hidden = false;
    return;
  }
  await renderAdmin();
}

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
}

// Scarica l'elenco delle altre squadre subito all'ingresso, non solo quando apri Mercato —
// così quando arrivi su Mercato il menu "Controparte" è già una tendina vera, non testo libero in attesa.
function precaricaElencoAltreSquadre() {
  if (elencoAltreSquadreCache !== null) return; // già fatto o già in corso
  elencoAltreSquadreCache = [];
  elencoSquadre().then(squadre => {
    elencoAltreSquadreCache = squadre
      .filter(s => s.nickname !== nickCorrente && s.nickname !== "_presidente")
      .map(s => ({ nickname: s.nickname, nomeSquadra: s.nomeSquadra || s.nickname }));
    if (tabAttiva === "mercato") renderTab("mercato");
  }).catch(() => { elencoAltreSquadreCache = []; });
}

// ---------- Salvataggio automatico (con piccolo ritardo, per non scrivere ad ogni tasto) ----------
function programmaSalvataggio() {
  if (salvataggioTimer) clearTimeout(salvataggioTimer);
  salvataggioTimer = setTimeout(async () => {
    if (nickCorrente) await salvaSquadra(nickCorrente, stato);
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
  else if (tab === "mercato") el.innerHTML = renderMercato();
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
  const righe = lista.map(p => {
    const fisso = calc.impattoFissoPrestito(p);
    const variabile = p.tipo === "Secco" ? null : (p.costoRiscatto || 0);
    return `<tr>
      <td>${p.nome}</td><td>${p.direzione}</td><td>${p.controparte || ""}</td><td>${p.tipo || ""}</td>
      <td class="cifra">${(p.costoPrestito || 0).toFixed(1)}</td>
      <td class="cifra">${(p.stipendioACarico || 0).toFixed(1)}</td>
      <td class="cifra">${fisso.toFixed(1)}</td>
      <td class="cifra">${variabile === null ? "—" : variabile.toFixed(1)}</td>
    </tr>`;
  }).join("");
  return `
  <div class="sezione">
    <h3>Prestiti in corso (riepilogo)</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Fisso = quello che paghi/incassi comunque. Variabile = riscatto (solo con Diritto, conta nel bilancio solo quando confermi). Solo per vedere tutto insieme mentre guardi la Rosa — si modifica da Mercato.</p>
    <div class="tabella-scroll"><table class="tabella-rosa">
      <thead><tr><th>Nome</th><th>Direzione</th><th>Controparte</th><th>Tipo</th><th>Costo prestito</th><th>Stipendio</th><th>Impatto fisso</th><th>Impatto variabile</th></tr></thead>
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

function renderMercato() {
  // Se non ho ancora l'elenco delle altre squadre per il menu "Controparte" (es. arrivato qui senza
  // passare da entraNellaSquadra, caso raro), lo carico ora.
  precaricaElencoAltreSquadre();

  const righeAcquistiAsta = (stato.acquistiAsta || []).map((a, i) => `
    <tr><td>${a.ruolo}</td><td>${a.nome}</td><td class="cifra">${(a.costo || 0).toFixed(1)}</td><td>${formattaStagione(a.annoInizio)} - ${formattaStagione(a.annoFine)}</td>
    <td><button class="btn-testo aa-rimuovi" data-i="${i}">✕</button></td></tr>`).join("");

  const righeAcquistiFuoriAsta = (stato.acquistiFuoriAsta || []).map((a, i) => `
    <tr><td>${a.ruolo || ""}</td><td>${a.nome}</td><td>${a.compratoDa || ""}</td><td class="cifra">${(a.prezzo || 0).toFixed(1)}</td>
    <td><button class="btn-testo af-rimuovi" data-i="${i}">✕</button></td></tr>`).join("");

  const righeCessioni = (stato.cessioni || []).map((c, i) => `
    <tr><td>${c.nomeGiocatore}</td><td>${c.acquirente || ""}</td><td class="cifra">${(c.valoreResiduoAlMomento || 0).toFixed(1)}</td><td class="cifra">${(c.prezzoCessione || 0).toFixed(1)}</td>
    <td class="cifra">${((c.prezzoCessione || 0) - (c.valoreResiduoAlMomento || 0)).toFixed(1)}</td>
    <td><button class="btn-testo c-rimuovi" data-i="${i}">✕</button></td></tr>`).join("");

  const righeSvincoli = (stato.svincoli || []).map((s, i) => `
    <tr><td>${s.nomeGiocatore}</td><td>${s.motivo || ""}</td><td class="cifra">${(s.valoreResiduoAlMomento || 0).toFixed(1)}</td><td class="cifra">${(s.indennizzo || 0).toFixed(1)}</td>
    <td class="cifra">${((s.indennizzo || 0) - (s.valoreResiduoAlMomento || 0)).toFixed(1)}</td>
    <td><button class="btn-testo s-rimuovi" data-i="${i}">✕</button></td></tr>`).join("");

  const righeGiocatoriPrestito = (stato.prestitiGiocatori || []).map((p, i) => rigaPrestitoGiocatore(p, i)).join("");
  const altreSquadre = elencoAltreSquadreCache || [];
  const selettoreSquadre = (id) => altreSquadre.length > 0
    ? `<select id="${id}"><option value="">— scegli —</option>${altreSquadre.map(s => `<option value="${s.nickname}">${s.nomeSquadra}</option>`).join("")}</select>`
    : `<input type="text" id="${id}" placeholder="Nome squadra..." />`;
  const campoControparteNuovo = selettoreSquadre("pg-nuovo-controparte");
  const campoAcquirenteCessione = selettoreSquadre("c-acquirente");
  const campoDaSquadraAcquisto = selettoreSquadre("fa-da-squadra");

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
    <h3>Acquisti fuori asta</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Finisce subito in Rosa.</p>
    <div class="griglia-2">
      <div class="campo"><label>Comprato da</label>${campoDaSquadraAcquisto}</div>
      <div class="campo" id="fa-giocatore-wrap">
        <label>Giocatore della loro rosa</label>
        <select id="fa-giocatore-controparte"><option value="">— scegli prima la squadra —</option></select>
      </div>
    </div>
    <p style="font-size:11px;color:var(--gesso-ombra);margin:-6px 0 10px">Scegli sopra per caricare da solo nome e ruolo — il Prezzo lo scrivi sempre tu (è quanto hai negoziato, può essere diverso dal suo valore attuale).</p>
    <div class="griglia-3">
      <div class="campo"><label>Ruolo</label><select id="fa-ruolo">${opzRuolo}</select></div>
      <div class="campo"><label>Nome</label><input type="text" id="fa-nome" /></div>
      <div class="campo"><label>Prezzo (mln)</label><input type="number" id="fa-prezzo" value="0" /></div>
      <div class="campo"><label>Stagione inizio</label><select id="fa-anno-inizio">${opzioniStagioni(stato.stagioneCorrente)}</select></div>
      <div class="campo"><label>Durata (anni)</label>
        <select id="fa-durata"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select>
      </div>
      <div class="campo"><label>Quota stagione %</label><input type="number" id="fa-quota" value="100" min="0" max="100" step="5" /></div>
    </div>
    <button id="btn-agg-fuoriasta" class="btn-piccolo">+ Aggiungi (va in Rosa)</button>
    <details style="margin-top:10px">
      <summary>Storico (${(stato.acquistiFuoriAsta || []).length})</summary>
      <div class="tabella-scroll" style="margin-top:8px"><table class="tabella-rosa">
        <thead><tr><th>Ruolo</th><th>Nome</th><th>Comprato da</th><th>Prezzo</th><th></th></tr></thead>
        <tbody id="corpo-acquisti">${righeAcquistiFuoriAsta}</tbody>
      </table></div>
    </details>
  </div>

  <div class="sezione">
    <h3>Cessioni calciatori</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Scegli il giocatore dalla tua Rosa: valore residuo, plus/minusvalenza e uscita dalla Rosa sono automatici.</p>
    <div class="griglia-3">
      <div class="campo"><label>Giocatore</label><select id="c-giocatore">${opzGiocatoriRosa()}</select></div>
      <div class="campo"><label>Venduto a</label>${campoAcquirenteCessione}</div>
      <div class="campo"><label>Prezzo di cessione (mln)</label><input type="number" id="c-prezzo" value="0" /></div>
    </div>
    <button id="btn-agg-cessione" class="btn-piccolo">+ Registra cessione (esce dalla Rosa)</button>
    <details style="margin-top:10px">
      <summary>Storico (${(stato.cessioni || []).length})</summary>
      <div class="tabella-scroll" style="margin-top:8px"><table class="tabella-rosa">
        <thead><tr><th>Nome ceduto</th><th>Venduto a</th><th>Valore residuo</th><th>Prezzo</th><th>Plus/Minus</th><th></th></tr></thead>
        <tbody id="corpo-cessioni">${righeCessioni}</tbody>
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

  <div class="sezione">
    <h3>Prestiti giocatori tra squadre</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Negativo se paghi tu (di solito entrata), positivo se incassi/risparmi (di solito uscita). Il riscatto (solo con Diritto) conta solo quando premi "Conferma riscatto". Una volta registrato non si modifica più — se sbagli, cancella (✕) e ricrea.</p>
    <div class="griglia-2">
      <div class="campo"><label>Direzione</label><select id="pg-nuovo-direzione"><option value="In entrata">In entrata</option><option value="In uscita">In uscita</option></select></div>
      <div class="campo"><label>Controparte</label>${campoControparteNuovo}</div>
    </div>
    <div class="campo" id="pg-nuovo-giocatore-wrap">
      <label>Giocatore della loro rosa</label>
      <select id="pg-nuovo-giocatore-controparte"><option value="">— scegli prima la squadra —</option></select>
      <p style="font-size:11px;color:var(--gesso-ombra);margin:4px 0 0">Scegli qui per caricare da solo nome, ruolo e stipendio vero — oppure scrivili a mano sotto.</p>
    </div>
    <div class="griglia-3">
      <div class="campo"><label>Ruolo</label><select id="pg-nuovo-ruolo"><option value="P">P</option><option value="D">D</option><option value="C">C</option><option value="A" selected>A</option></select></div>
      <div class="campo" id="pg-nuovo-nome-wrap"><label>Nome</label><input type="text" id="pg-nuovo-nome" /></div>
      <div class="campo"><label>Tipo</label><select id="pg-nuovo-tipo"><option value="Secco">Secco</option><option value="Diritto di riscatto">Diritto di riscatto</option></select></div>
    </div>
    <div class="griglia-3">
      <div class="campo"><label>Costo prestito</label><input type="number" id="pg-nuovo-costo-prestito" value="0" /></div>
      <div class="campo"><label>Costo riscatto</label><input type="number" id="pg-nuovo-costo-riscatto" value="0" /></div>
      <div class="campo"><label>Costo stipendio annuo</label><input type="number" id="pg-nuovo-stipendio" value="0" min="0" /></div>
    </div>
    <div class="campo" style="max-width:120px">
      <label>Quota %</label>
      <select id="pg-nuovo-quota"><option value="100">100%</option><option value="50">50%</option><option value="0">0%</option></select>
    </div>
    <button id="btn-agg-prestito-giocatore" class="btn-piccolo">+ Aggiungi prestito giocatore</button>
    <div class="tabella-scroll" style="margin-top:14px"><table class="tabella-rosa">
      <thead><tr><th>Nome</th><th>Direz.</th><th>Controparte</th><th>Tipo</th><th>Prestito</th><th>Stipendio</th><th>Fisso</th><th>Variabile</th><th></th><th></th></tr></thead>
      <tbody id="corpo-prestiti-giocatori">${righeGiocatoriPrestito}</tbody>
    </table></div>
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
    <p style="font-size:12px;color:var(--gesso-ombra)">Tassi: 1a 10%(15%) · 2a 25%(35%) · 3a 40%(50%). Max 150 mln.</p>
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
  } else if (tab === "mercato") {
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
      programmaSalvataggio(); renderTab("mercato");
    });

    // Quando scegli la squadra "Comprato da", carico la sua rosa vera per popolare "Giocatore".
    const selDaSquadra = document.getElementById("fa-da-squadra");
    if (selDaSquadra && selDaSquadra.tagName === "SELECT") {
      selDaSquadra.addEventListener("change", async () => {
        const nickname = selDaSquadra.value;
        const selGiocatore = document.getElementById("fa-giocatore-controparte");
        if (!nickname) { selGiocatore.innerHTML = `<option value="">— scegli prima la squadra —</option>`; return; }
        selGiocatore.innerHTML = `<option value="">Carico la rosa...</option>`;
        try {
          const statoAltro = await caricaSquadra(nickname);
          const rosaAltro = (statoAltro && statoAltro.rosa) || [];
          squadraCacheAcquistoFuoriAsta = { nickname, rosa: rosaAltro };
          selGiocatore.innerHTML = rosaAltro.length === 0
            ? `<option value="">Rosa vuota o non trovata</option>`
            : `<option value="">— scegli il giocatore —</option>` +
              rosaAltro.map((p, idx) => `<option value="${idx}">${p.nome} — ${p.ruolo}, costo ${(p.costo || 0).toFixed(1)}</option>`).join("");
        } catch {
          selGiocatore.innerHTML = `<option value="">Errore nel caricamento</option>`;
        }
      });
    }
    const selGiocatoreFa = document.getElementById("fa-giocatore-controparte");
    if (selGiocatoreFa) {
      selGiocatoreFa.addEventListener("change", () => {
        const idx = selGiocatoreFa.value;
        if (idx === "" || !squadraCacheAcquistoFuoriAsta) return;
        const player = squadraCacheAcquistoFuoriAsta.rosa[parseInt(idx)];
        if (!player) return;
        document.getElementById("fa-nome").value = player.nome || "";
        document.getElementById("fa-ruolo").value = player.ruolo || "A";
        // Il Prezzo NON si riempie da solo apposta: è quanto hai negoziato tu per comprarlo,
        // può essere diverso dal suo valore attuale — lo scrivi tu.
      });
    }

    document.getElementById("btn-agg-fuoriasta").addEventListener("click", () => {
      const nome = document.getElementById("fa-nome").value.trim();
      if (!nome) { alert("Inserisci il nome del giocatore."); return; }
      const id = nuovoId();
      const annoInizioFa = parseInt(document.getElementById("fa-anno-inizio").value) || stato.stagioneCorrente;
      const durataFa = parseInt(document.getElementById("fa-durata").value) || 1;
      const compratoDa = leggiNomeSquadraDaCampo("fa-da-squadra");
      const nuovo = {
        id,
        ruolo: document.getElementById("fa-ruolo").value,
        nome,
        costo: parseFloat(document.getElementById("fa-prezzo").value) || 0,
        annoInizio: annoInizioFa, annoFine: annoInizioFa + durataFa - 1,
        quotaStagione: (parseFloat(document.getElementById("fa-quota").value) || 100) / 100,
        rinnovi: 0, gruppo: "Titolare",
      };
      stato.rosa.push(nuovo);
      stato.acquistiFuoriAsta = stato.acquistiFuoriAsta || [];
      stato.acquistiFuoriAsta.push({
        id, ruolo: nuovo.ruolo, nome: nuovo.nome, compratoDa, prezzo: nuovo.costo,
      });
      registraModifica("Acquisto fuori asta", `${nuovo.nome} (${nuovo.ruolo}), prezzo ${nuovo.costo}, contratto ${nuovo.annoInizio}-${nuovo.annoFine}`);
      programmaSalvataggio(); renderTab("mercato");
    });

    document.getElementById("btn-agg-cessione").addEventListener("click", () => {
      const idx = document.getElementById("c-giocatore").value;
      if (idx === "") { alert("Scegli un giocatore dalla Rosa."); return; }
      const player = stato.rosa[parseInt(idx)];
      const valoreResiduoAlMomento = calc.valoreResiduo(player, stato.stagioneCorrente);
      const prezzoCessione = parseFloat(document.getElementById("c-prezzo").value) || 0;
      const acquirente = leggiNomeSquadraDaCampo("c-acquirente");
      stato.cessioni = stato.cessioni || [];
      stato.cessioni.push({ nomeGiocatore: player.nome, acquirente, valoreResiduoAlMomento, prezzoCessione });
      stato.rosa.splice(parseInt(idx), 1);
      registraModifica("Cessione", `${player.nome} ceduto a ${prezzoCessione}${acquirente ? " (" + acquirente + ")" : ""} (valore residuo era ${valoreResiduoAlMomento.toFixed(1)})`);
      programmaSalvataggio(); renderTab("mercato");
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
      programmaSalvataggio(); renderTab("mercato");
    });

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
      programmaSalvataggio(); renderTab("mercato");
    });

    // Se scegli "In uscita", il Nome diventa una tendina con i giocatori della tua Rosa (eviti errori di battitura).
    document.getElementById("pg-nuovo-direzione").addEventListener("change", (e) => {
      const wrap = document.getElementById("pg-nuovo-nome-wrap");
      wrap.innerHTML = e.target.value === "In uscita"
        ? `<label>Nome</label><select id="pg-nuovo-nome">${opzNomiRosa("")}</select>`
        : `<label>Nome</label><input type="text" id="pg-nuovo-nome" />`;
      // Il campo "Giocatore della loro rosa" ha senso solo quando prendi IN ENTRATA (loro rosa, non la tua).
      document.getElementById("pg-nuovo-giocatore-wrap").style.display = e.target.value === "In entrata" ? "" : "none";
    });

    // Quando scegli la Controparte (e sei IN ENTRATA), carico davvero la sua rosa per popolare "Giocatore".
    const selControparte = document.getElementById("pg-nuovo-controparte");
    if (selControparte && selControparte.tagName === "SELECT") {
      selControparte.addEventListener("change", async () => {
        const nickname = selControparte.value;
        const selGiocatore = document.getElementById("pg-nuovo-giocatore-controparte");
        if (!nickname) { selGiocatore.innerHTML = `<option value="">— scegli prima la squadra —</option>`; return; }
        selGiocatore.innerHTML = `<option value="">Carico la rosa...</option>`;
        try {
          const statoAltro = await caricaSquadra(nickname);
          const rosaAltro = (statoAltro && statoAltro.rosa) || [];
          squadraCachePrestitoGiocatore = { nickname, rosa: rosaAltro };
          if (rosaAltro.length === 0) {
            selGiocatore.innerHTML = `<option value="">Rosa vuota o non trovata</option>`;
          } else {
            selGiocatore.innerHTML = `<option value="">— scegli il giocatore —</option>` +
              rosaAltro.map((p, idx) => `<option value="${idx}">${p.nome} — ${p.ruolo}, costo ${(p.costo || 0).toFixed(1)}</option>`).join("");
          }
        } catch {
          selGiocatore.innerHTML = `<option value="">Errore nel caricamento</option>`;
        }
      });
    }

    // Quando scegli il Giocatore, riempio da solo Nome, Ruolo e Stipendio (calcolato vero, non a caso).
    const selGiocatoreControparte = document.getElementById("pg-nuovo-giocatore-controparte");
    if (selGiocatoreControparte) {
      selGiocatoreControparte.addEventListener("change", () => {
        const idx = selGiocatoreControparte.value;
        if (idx === "" || !squadraCachePrestitoGiocatore) return;
        const player = squadraCachePrestitoGiocatore.rosa[parseInt(idx)];
        if (!player) return;
        const nomeInput = document.getElementById("pg-nuovo-nome");
        if (nomeInput) nomeInput.value = player.nome || "";
        const ruoloSel = document.getElementById("pg-nuovo-ruolo");
        if (ruoloSel) ruoloSel.value = player.ruolo || "A";
        const stipendioInput = document.getElementById("pg-nuovo-stipendio");
        if (stipendioInput) stipendioInput.value = Math.abs(calc.stipendio(player)).toFixed(1);
      });
    }

    document.getElementById("btn-agg-prestito-giocatore").addEventListener("click", () => {
      const nome = document.getElementById("pg-nuovo-nome").value.trim();
      if (!nome) { alert("Inserisci il nome del giocatore."); return; }
      const controparte = leggiNomeSquadraDaCampo("pg-nuovo-controparte");
      const nuovo = {
        ruolo: document.getElementById("pg-nuovo-ruolo").value,
        nome,
        controparte,
        direzione: document.getElementById("pg-nuovo-direzione").value,
        tipo: document.getElementById("pg-nuovo-tipo").value,
        costoPrestito: parseFloat(document.getElementById("pg-nuovo-costo-prestito").value) || 0,
        costoRiscatto: parseFloat(document.getElementById("pg-nuovo-costo-riscatto").value) || 0,
        stipendioACarico: parseFloat(document.getElementById("pg-nuovo-stipendio").value) || 0,
        quotaPercento: parseInt(document.getElementById("pg-nuovo-quota").value) || 100,
        gruppo: "Extra",
      };
      stato.prestitiGiocatori = stato.prestitiGiocatori || [];
      stato.prestitiGiocatori.push(nuovo);
      registraModifica("Prestito giocatore registrato", `${nuovo.nome} (${nuovo.direzione}, ${nuovo.tipo})`);
      programmaSalvataggio(); renderTab("mercato");
    });

    // Pulsanti "✕" nello storico Cessioni/Svincoli: tolgono solo il ricordo scritto (sono movimenti veri già avvenuti).
    const rimuoviStorico = (selettore, stateArray) => {
      document.querySelectorAll(selettore).forEach(btn => {
        btn.addEventListener("click", () => {
          const i = parseInt(btn.dataset.i);
          stato[stateArray].splice(i, 1);
          programmaSalvataggio(); renderTab("mercato");
        });
      });
    };
    rimuoviStorico(".c-rimuovi", "cessioni");
    rimuoviStorico(".s-rimuovi", "svincoli");
    rimuoviStorico(".pg-rimuovi", "prestitiGiocatori");

    // Pulsanti "✕" nello storico Acquisti: qui invece è una correzione di errore, non un movimento vero —
    // tolgono la riga di storico E il giocatore corrispondente dalla Rosa (annullano l'acquisto per intero).
    const annullaAcquisto = (selettore, stateArray) => {
      document.querySelectorAll(selettore).forEach(btn => {
        btn.addEventListener("click", () => {
          const i = parseInt(btn.dataset.i);
          const voce = stato[stateArray][i];
          if (!confirm(`Annullare l'acquisto di "${voce.nome}"? Verrà tolto anche dalla Rosa.`)) return;
          const idxRosa = stato.rosa.findIndex(p => p.id === voce.id);
          if (idxRosa !== -1) stato.rosa.splice(idxRosa, 1);
          stato[stateArray].splice(i, 1);
          registraModifica("Annullamento acquisto", `${voce.nome} tolto dalla Rosa (acquisto corretto/annullato)`);
          programmaSalvataggio(); renderTab("mercato");
        });
      });
    };
    annullaAcquisto(".aa-rimuovi", "acquistiAsta");
    annullaAcquisto(".af-rimuovi", "acquistiFuoriAsta");

    const righeCampo = (selettoreTr, stateArray, mapConfig, classRimuovi, renderTabName) => {
      document.querySelectorAll(selettoreTr).forEach(tr => {
        const i = parseInt(tr.dataset.i);
        for (const [cls, key, tipo] of mapConfig) {
          const el = tr.querySelector(cls);
          const leggi = () => {
            stato[stateArray][i][key] = tipo === "number" ? (parseFloat(el.value) || 0) : el.value;
            programmaSalvataggio();
          };
          el.addEventListener("input", leggi);
          el.addEventListener("change", () => { leggi(); renderTab(renderTabName); });
        }
        tr.querySelector(classRimuovi).addEventListener("click", () => {
          stato[stateArray].splice(i, 1); programmaSalvataggio(); renderTab(renderTabName);
        });
      });
    };

    document.querySelectorAll(".pg-conferma-riscatto").forEach(btn => {
      const tr = btn.closest("tr");
      const i = parseInt(tr.dataset.i);
      btn.addEventListener("click", () => {
        const p = stato.prestitiGiocatori[i];
        if (!confirm(`Confermare il riscatto di "${p.nome}" per ${p.costoRiscatto || 0} mln? Il prestito verrà chiuso.`)) return;

        if (p.direzione === "In uscita") {
          // Il giocatore lascia la Rosa per sempre: lo tratto come una vera Cessione (stessa tabella, stesso storico).
          const idxRosa = stato.rosa.findIndex(r => r.nome === p.nome);
          let valoreResiduoAlMomento = 0;
          if (idxRosa !== -1) {
            valoreResiduoAlMomento = calc.valoreResiduo(stato.rosa[idxRosa], stato.stagioneCorrente);
            stato.rosa.splice(idxRosa, 1);
          } else {
            alert(`"${p.nome}" non risulta nella tua Rosa — il riscatto viene comunque registrato come ricavo, ma senza plus/minusvalenza reale.`);
          }
          stato.cessioni = stato.cessioni || [];
          stato.cessioni.push({ nomeGiocatore: p.nome, valoreResiduoAlMomento, prezzoCessione: p.costoRiscatto || 0 });
          registraModifica("Riscatto esercitato (in uscita)", `${p.nome} ceduto definitivamente per ${p.costoRiscatto || 0} mln`);
        } else {
          // In entrata: il giocatore diventa tuo per sempre, va aggiunto in Rosa come un vero acquisto.
          const ruolo = ["P", "D", "C", "A"].includes(p.ruolo) ? p.ruolo : "A";
          const annoFineInput = prompt(`Contratto di "${p.nome}" fino a che anno?`, String(stato.stagioneCorrente + 3));
          const annoFine = parseInt(annoFineInput) || stato.stagioneCorrente;
          const id = nuovoId();
          const costoRiscattoAssoluto = Math.abs(p.costoRiscatto || 0); // in Rosa il Costo è sempre positivo, anche se qui l'hai scritto negativo perché "lo paghi tu"
          const nuovo = {
            id, ruolo, nome: p.nome, costo: costoRiscattoAssoluto,
            annoInizio: stato.stagioneCorrente, annoFine, quotaStagione: 1, rinnovi: 0, gruppo: "Titolare",
          };
          stato.rosa.push(nuovo);
          stato.acquistiFuoriAsta = stato.acquistiFuoriAsta || [];
          stato.acquistiFuoriAsta.push({ id, ruolo, nome: p.nome, compratoDa: p.controparte, prezzo: costoRiscattoAssoluto });
          registraModifica("Riscatto esercitato (in entrata)", `${p.nome} acquistato definitivamente per ${costoRiscattoAssoluto} mln`);
        }
        stato.prestitiGiocatori.splice(i, 1);
        programmaSalvataggio(); renderTab("mercato");
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
  stato.cessioni = []; stato.svincoli = []; stato.acquistiFuoriAsta = []; stato.prestitiGiocatori = [];
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
    squadre = await elencoSquadre();
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
    squadre = await elencoSquadre();
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
    statoAltro = await caricaSquadra(nickname);
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

function renderIstruzioni() {
  mostraSchermata("schermata-istruzioni");
  const el = document.getElementById("contenuto-istruzioni");

  const tabFasce = `<table class="istr-tabella"><tr><th>Fascia di costo (mln)</th><th>Stipendio (mln)</th></tr>
    <tr><td>1 - 5</td><td>3</td></tr>
    <tr><td>6 - 10</td><td>4</td></tr>
    <tr><td>11 - 20</td><td>5</td></tr>
    <tr><td>21 - 30</td><td>6</td></tr>
    <tr><td>31 - 40</td><td>7</td></tr>
    <tr><td>41 - 50</td><td>8</td></tr>
    <tr><td>51 - 60</td><td>9</td></tr>
    <tr><td>61 - 70</td><td>10</td></tr>
    <tr><td>71 - 80</td><td>11</td></tr>
    <tr><td>81 - 90</td><td>12</td></tr>
    <tr><td>91 - 100</td><td>13</td></tr>
    <tr><td>101 - 150</td><td>14</td></tr>
    <tr><td>151 e oltre</td><td>15</td></tr></table>`;

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
    Il sito ha 7 sezioni (le trovi come schede in alto): <b>Anagrafica</b>, <b>Stadio</b>, <b>Sponsor & Premi</b>, <b>Rosa</b>, <b>Mercato</b>, <b>Prestiti</b>, <b>Conto Economico</b> — più il pulsante <b>Chiudi stagione</b> in fondo al Conto Economico. Accanto a "Esci" trovi anche <b>👥 Altre squadre</b>: mostra la rosa di chiunque altro nella lega (solo in lettura, Titolari/Under 21/Extra con anni di contratto rimasti). Chi entra come <b>ADMIN</b> vede invece una schermata separata con i bilanci di tutte le squadre.
    Tutto è in <b>milioni</b>, senza nessuna conversione da fare. Tutto quello che scrivi si salva da solo dopo circa mezzo secondo che smetti di scrivere — non serve nessun pulsante "salva".
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
    <b>Ammortamento annuo</b> = costo pieno ÷ anni di contratto × quota stagione — sempre il 100% del costo, uguale per tutti i gruppi (Under 21 compreso, nessuna fascia, nessuno sconto) — si azzera da solo a contratto scaduto.<br>
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

  ${sezioneIstr("🔁 Mercato — Acquisti, Cessioni, Svincoli, Rinnovi, Prestiti giocatori", `
    <b>Acquisti in asta</b> e <b>Acquisti fuori asta</b>: compili ruolo, nome, costo, contratto — il giocatore finisce automaticamente nella tua Rosa, non serve inserirlo due volte. In "Acquisti fuori asta" puoi anche scegliere prima la squadra "Comprato da" e poi il giocatore vero della sua rosa: ruolo e costo si riempiono da soli. Se sbagli qualcosa, il tasto ✕ nello Storico qui sotto annulla l'acquisto per intero — toglie sia la riga di storico sia il giocatore dalla Rosa, come se non l'avessi mai comprato (chiede conferma prima di farlo).<br>
    <b>Cessioni</b> e <b>Svincoli</b>: scegli il giocatore da un menu (solo quelli davvero in Rosa, niente possibilità di sbagliare il nome) — in Cessioni scegli anche la squadra a cui vendi. Il Valore residuo si calcola da solo nel momento in cui lo registri, il giocatore esce subito dalla Rosa, e plus/minusvalenza vanno dritte nel Conto Economico. In Svincoli l'Indennizzo si calcola da solo in base al Motivo: <b>Ritiro</b> = ricevi il 50% del Valore residuo, <b>Serie B</b> o <b>Trasferimento estero</b> = ricevi il 100%, <b>Risoluzione consensuale</b> = paghi tu il 100% (indennizzo negativo). Qui il tasto ✕ nello Storico toglie solo il ricordo scritto (sono movimenti già avvenuti per davvero, non si annullano).<br>
    <b>Rinnovo contratto</b>: mostra da solo la lista di chi ha il contratto in scadenza questa stagione — spunta chi vuoi rinnovare, scegli il nuovo anno per ognuno, conferma tutti insieme.<br>
    Ogni categoria ha anche uno <b>Storico</b> a tendina, per tenere traccia dei movimenti senza affollare la pagina.<br>
    <b>Prestiti giocatori tra squadre</b>: si registrano nel modulo, poi restano in un elenco di sola lettura come tutti gli altri — se sbagli, cancella (✕) e ricrea, non si modifica direttamente. Due tipi soltanto: <b>Secco</b> (finisce e basta, il giocatore torna al proprietario da solo) o <b>Diritto di riscatto</b> (puoi tenerlo per sempre pagando in più). Se scegli IN ENTRATA, seleziona prima la squadra Controparte poi il "Giocatore della loro rosa": nome, ruolo e stipendio vero si riempiono da soli (stipendio già negativo, perché lo pagheresti tu) — comodo e senza errori, ma resta possibile scrivere tutto a mano se preferisci. Non aggiungerlo in Rosa con un costo vero (o mettilo a 0), il vero impatto lo scrivi qui. "Costo prestito" e "Stipendio annuo" contano sempre subito nel Conto Economico (colonna "Fisso"): <b>negativo</b> se li paghi tu (di solito IN ENTRATA), <b>positivo</b> se li incassi/risparmi tu (di solito IN USCITA). "Costo riscatto" invece — possibile solo con Diritto — non conta mai in automatico (resta nella colonna "Variabile"): conta solo nel momento in cui premi "Conferma riscatto" (il tasto compare solo su Diritto), e a quel punto, se era IN USCITA diventa una vera Cessione, se era IN ENTRATA il giocatore entra davvero in Rosa — con "Quota %" a 100/50/0 in base a quanta stagione copre lo stipendio.<br>
    In fondo alla pagina, il <b>Registro movimenti</b> segna data e ora di ogni acquisto/cessione/svincolo/rinnovo — visibile anche all'ADMIN.
  `)}

  ${sezioneIstr("🏦 Banca", `
    Registra descrizione, capitale (massimo 150 mln a richiesta), anni (1/2/3) ed eventuale richiesta "per risanare un rosso" (tasso più alto). La colonna "Stato" ti dice da sola quando un prestito è ripagato per intero ("✅ Estinto") — a quel punto smette di pesare sul bilancio da solo, non serve fare nulla (puoi anche rimuoverlo con ✕ se vuoi).
    ${(function(){
      const righe = [[1,"10%","15%"],[2,"25%","35%"],[3,"40%","50%"]];
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
    squadre = await elencoSquadre();
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
      stato = await caricaSquadra(nick);
      nickCorrente = nick;
      entraNellaSquadra();
    });
  });

  document.querySelectorAll(".pres-elimina").forEach(btn => {
    btn.addEventListener("click", async () => {
      const nick = btn.dataset.nick;
      const conferma = confirm(`Eliminare definitivamente la squadra "${nick}"? Non si può annullare.`);
      if (!conferma) return;
      await eliminaSquadra(nick);
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
    const esistente = await caricaSquadra(nick);
    if (esistente) { err.textContent = "Esiste già una squadra con questo nome."; err.hidden = false; return; }
    await salvaSquadra(nick, statoVuoto(nick, pin));
    await renderAdmin();
  });
}

document.getElementById("btn-admin-esci").addEventListener("click", () => {
  stato = null; nickCorrente = null;
  mostraSchermata("schermata-accesso");
});
