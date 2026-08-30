import * as calc from "./calc.js";
import { caricaSquadra, salvaSquadra, elencoSquadre, eliminaSquadra } from "./storage.js";

let stato = null;   // stato della squadra corrente, in memoria
let nickCorrente = null;
let elencoAltreSquadreCache = null; // cache dei nomi delle altre squadre, per il menu "Controparte" in Prestiti giocatori
let tabAttiva = "anagrafica";
let salvataggioTimer = null;

// ---------- Stato iniziale per una squadra nuova ----------
function statoVuoto(nickname, pin) {
  return {
    nickname, pin,
    nomeSquadra: nickname, allenatore: "",
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
        <label>Allenatore/Presidente</label>
        <input type="text" id="f-allenatore" value="${stato.allenatore || ""}" />
      </div>
      <div class="campo">
        <label>Stagione corrente</label>
        <select id="f-stagione">
          ${Array.from({ length: 21 }, (_, i) => 2020 + i).map(anno =>
            `<option value="${anno}" ${anno === stato.stagioneCorrente ? "selected" : ""}>${anno}/${String(anno + 1).slice(-2)}</option>`
          ).join("")}
        </select>
      </div>
      <div class="campo">
        <label>Capitale sociale iniziale (mln)</label>
        <input type="number" id="f-capitale-iniziale" value="${stato.capitaleIniziale}" />
      </div>
      <div class="campo">
        <label>Capitale destinato all'asta (mln)</label>
        <input type="number" id="f-capitale-asta" value="${stato.capitaleAsta}" />
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
    <h3>Premio classifica campionato</h3>
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
    { chiave: "U21", etichetta: "Under 21 (solo stipendio dimezzato)" },
    { chiave: "Extra", etichetta: "Extra (nessuno sconto, nessun limite)" },
  ];
  const entrataList = (stato.prestitiGiocatori || [])
    .map((pg, idxPg) => ({ pg, idxPg }))
    .filter(({ pg }) => pg.direzione === "In entrata");

  const sezioni = gruppi.map(({ chiave, etichetta }) => {
    const giocatoriRosa = stato.rosa.map((p, idx) => ({ p, idx })).filter(({ p }) => (p.gruppo || "Titolare") === chiave);
    const righeRosa = giocatoriRosa.map(({ p, idx }) => rigaRosa(p, idx)).join("");
    // I giocatori presi in prestito (in entrata) possono stare solo in U21 o Extra, mai tra i Titolari veri.
    const entrataGruppo = chiave === "Titolare" ? [] : entrataList.filter(({ pg }) => (pg.gruppo || "Extra") === chiave);
    const righeEntrata = entrataGruppo.map(({ pg, idxPg }) => rigaRosaPrestitoEntrata(pg, idxPg)).join("");
    const conteggio = giocatoriRosa.length + entrataGruppo.length;
    const righe = righeRosa + righeEntrata;
    return `
    <p style="font-size:13px;font-weight:600;color:var(--ambra);margin:16px 0 6px">${etichetta} — ${conteggio}</p>
    <div class="tabella-scroll"><table class="tabella-rosa">
      <thead><tr><th>Ruolo</th><th>Nome</th><th>Costo</th><th>Inizio</th><th>Fine</th><th>Anni rim.</th><th>Stipendio</th><th>Quota%</th><th>Ammort.</th><th>Rinnovi</th><th>Val. res.</th><th>Sposta a</th></tr></thead>
      <tbody>${righe || `<tr><td colspan="12" style="text-align:center;color:var(--gesso-ombra);font-size:12px;padding:10px">— nessuno —</td></tr>`}</tbody>
    </table></div>`;
  }).join("");

  const titolariRosa = stato.rosa.filter(p => (p.gruppo || "Titolare") === "Titolare");
  const titolariEntrata = entrataList.filter(({ pg }) => (pg.gruppo || "Extra") === "Titolare").map(({ pg }) => pg);
  const comp = calc.composizioneRuoli([...titolariRosa, ...titolariEntrata]);
  const compClasse = comp.ok ? "riga-check-ok" : "riga-check-warn";
  const compTesto = comp.ok
    ? `✅ P:${comp.P}/3 D:${comp.D}/8 C:${comp.C}/8 A:${comp.A}/6`
    : `⚠️ P:${comp.P}/3 D:${comp.D}/8 C:${comp.C}/8 A:${comp.A}/6`;

  const tot = calc.totaliRosa(stato.rosa, stato.stagioneCorrente);

  return `
  <div class="sezione">
    <h3>Rosa calciatori</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Report — si modifica da Mercato. Sposta un giocatore tra Titolari/Under 21/Extra col menu a destra di ogni riga. Riga <span style="color:var(--rosso-cartellino)">rossa</span> = dato in prestito in uscita. Riga <span style="color:var(--ok)">verde</span> = preso in prestito da un'altra squadra (solo U21/Extra, non pesa su costo/ammortamento).</p>
    <p class="${compClasse}">${compTesto}</p>
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
    <td>${p.annoInizio}</td>
    <td>${p.annoFine}</td>
    <td class="cifra">${anniRim}</td>
    <td class="cifra">${stip.toFixed(1)}</td>
    <td class="cifra">${Math.round((p.quotaStagione ?? 1) * 100)}</td>
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
    const impatto = (p.costoPrestito || 0) + (p.costoRiscatto || 0) + (p.stipendioACarico || 0) * ((p.quotaPercento ?? 100) / 100);
    return `<tr>
      <td>${p.nome}</td><td>${p.direzione}</td><td>${p.controparte || ""}</td><td>${p.tipo || ""}</td>
      <td class="cifra">${(p.costoPrestito || 0).toFixed(1)}</td>
      <td class="cifra">${(p.costoRiscatto || 0).toFixed(1)}</td>
      <td class="cifra">${(p.stipendioACarico || 0).toFixed(1)}</td>
      <td class="cifra">${impatto.toFixed(1)}</td>
    </tr>`;
  }).join("");
  return `
  <div class="sezione">
    <h3>Prestiti in corso (riepilogo)</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Solo per vedere tutto insieme mentre guardi la Rosa — si modifica da Mercato.</p>
    <div class="tabella-scroll"><table class="tabella-rosa">
      <thead><tr><th>Nome</th><th>Direzione</th><th>Controparte</th><th>Tipo</th><th>Costo prestito</th><th>Costo riscatto</th><th>Stipendio</th><th>Impatto tot.</th></tr></thead>
      <tbody>${righe}</tbody>
    </table></div>
  </div>`;
}

// ---------- Registro modifiche (audit log): chi ha fatto cosa e quando ----------
// Identificatore stabile per collegare una riga di storico Acquisti al giocatore corrispondente in Rosa,
// così il tasto ✕ può annullare l'acquisto per intero (non solo il ricordo scritto).
let contatoreId = 0;
function nuovoId() { return `${Date.now()}-${contatoreId++}`; }

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
    .filter(({ p }) => calc.anniRimanenti(p, stato.stagioneCorrente) === 0);
  if (inScadenza.length === 0) {
    return `<p style="font-size:13px;color:var(--gesso-ombra)">Nessun giocatore in scadenza questa stagione (${stato.stagioneCorrente}).</p>`;
  }
  const righe = inScadenza.map(({ p, idx }) => `
    <tr>
      <td><input type="checkbox" class="rn-check" data-idx="${idx}" /></td>
      <td>${p.nome}</td>
      <td>${p.ruolo}</td>
      <td class="cifra">${(p.costo || 0).toFixed(1)}</td>
      <td>${p.annoFine}</td>
      <td><input type="number" class="rn-nuovo-anno" data-idx="${idx}" value="${stato.stagioneCorrente + 1}" style="width:80px" /></td>
    </tr>`).join("");
  return `
    <div class="tabella-scroll"><table class="tabella-rosa">
      <thead><tr><th></th><th>Nome</th><th>Ruolo</th><th>Costo</th><th>Scade a fine</th><th>Nuovo anno fine</th></tr></thead>
      <tbody>${righe}</tbody>
    </table></div>
    <button id="btn-conferma-rinnovi" class="btn-piccolo">Conferma rinnovi selezionati</button>`;
}

function renderMercato() {
  // Se non ho ancora l'elenco delle altre squadre per il menu "Controparte", lo carico in background
  // e ridisegno la pagina non appena è pronto (senza bloccare nel frattempo).
  if (elencoAltreSquadreCache === null) {
    elencoAltreSquadreCache = []; // placeholder per non richiederlo più volte mentre è in corso
    elencoSquadre().then(squadre => {
      elencoAltreSquadreCache = squadre
        .filter(s => s.nickname !== nickCorrente && s.nickname !== "_presidente")
        .map(s => s.nomeSquadra || s.nickname);
      if (tabAttiva === "mercato") renderTab("mercato");
    }).catch(() => { elencoAltreSquadreCache = []; });
  }

  const righeAcquistiAsta = (stato.acquistiAsta || []).map((a, i) => `
    <tr><td>${a.ruolo}</td><td>${a.nome}</td><td class="cifra">${(a.costo || 0).toFixed(1)}</td><td>${a.annoInizio}-${a.annoFine}</td>
    <td><button class="btn-testo aa-rimuovi" data-i="${i}">✕</button></td></tr>`).join("");

  const righeAcquistiFuoriAsta = (stato.acquistiFuoriAsta || []).map((a, i) => `
    <tr><td>${a.ruolo || ""}</td><td>${a.nome}</td><td>${a.compratoDa || ""}</td><td class="cifra">${(a.prezzo || 0).toFixed(1)}</td>
    <td><button class="btn-testo af-rimuovi" data-i="${i}">✕</button></td></tr>`).join("");

  const righeCessioni = (stato.cessioni || []).map((c, i) => `
    <tr><td>${c.nomeGiocatore}</td><td class="cifra">${(c.valoreResiduoAlMomento || 0).toFixed(1)}</td><td class="cifra">${(c.prezzoCessione || 0).toFixed(1)}</td>
    <td class="cifra">${((c.prezzoCessione || 0) - (c.valoreResiduoAlMomento || 0)).toFixed(1)}</td>
    <td><button class="btn-testo c-rimuovi" data-i="${i}">✕</button></td></tr>`).join("");

  const righeSvincoli = (stato.svincoli || []).map((s, i) => `
    <tr><td>${s.nomeGiocatore}</td><td>${s.motivo || ""}</td><td class="cifra">${(s.valoreResiduoAlMomento || 0).toFixed(1)}</td><td class="cifra">${(s.indennizzo || 0).toFixed(1)}</td>
    <td class="cifra">${((s.indennizzo || 0) - (s.valoreResiduoAlMomento || 0)).toFixed(1)}</td>
    <td><button class="btn-testo s-rimuovi" data-i="${i}">✕</button></td></tr>`).join("");

  const righeGiocatoriPrestito = (stato.prestitiGiocatori || []).map((p, i) => rigaPrestitoGiocatore(p, i)).join("");

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
      <div class="campo"><label>Anno inizio contratto</label><input type="number" id="asta-anno-inizio" value="${stato.stagioneCorrente}" /></div>
      <div class="campo"><label>Anno fine contratto</label><input type="number" id="asta-anno-fine" value="${stato.stagioneCorrente}" /></div>
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
    <details style="margin-top:14px">
      <summary>Importa una rosa intera in un colpo solo</summary>
      <div style="margin-top:8px">
        <p style="font-size:12px;color:var(--gesso-ombra)">Una riga per giocatore, separando con virgola: <b>Ruolo,Nome,Costo,AnnoInizio,AnnoFine</b> (quota resta 100%). Esempio: <code>A,Thuram,136,2026,2029</code></p>
        <textarea id="asta-import-testo" rows="8" style="width:100%;font-family:var(--font-cifre);font-size:12px;padding:10px;border-radius:8px;background:rgba(247,250,247,0.06);color:var(--gesso);border:1px solid rgba(247,250,247,0.2)" placeholder="P,Di Gennaro,1,2026,2028&#10;D,Bartesaghi,7,2026,2030&#10;..."></textarea>
        <button id="btn-import-asta" class="btn-piccolo">Importa tutti</button>
        <p id="import-asta-esito" style="font-size:12px;color:var(--ambra);margin-top:6px"></p>
      </div>
    </details>
  </div>

  <div class="sezione">
    <h3>Acquisti fuori asta</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Finisce subito in Rosa.</p>
    <div class="griglia-3">
      <div class="campo"><label>Ruolo</label><select id="fa-ruolo">${opzRuolo}</select></div>
      <div class="campo"><label>Nome</label><input type="text" id="fa-nome" /></div>
      <div class="campo"><label>Comprato da</label><input type="text" id="fa-da" /></div>
      <div class="campo"><label>Prezzo (mln)</label><input type="number" id="fa-prezzo" value="0" /></div>
      <div class="campo"><label>Anno inizio contratto</label><input type="number" id="fa-anno-inizio" value="${stato.stagioneCorrente}" /></div>
      <div class="campo"><label>Anno fine contratto</label><input type="number" id="fa-anno-fine" value="${stato.stagioneCorrente}" /></div>
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
    <div class="griglia-2">
      <div class="campo"><label>Giocatore</label><select id="c-giocatore">${opzGiocatoriRosa()}</select></div>
      <div class="campo"><label>Prezzo di cessione (mln)</label><input type="number" id="c-prezzo" value="0" /></div>
    </div>
    <button id="btn-agg-cessione" class="btn-piccolo">+ Registra cessione (esce dalla Rosa)</button>
    <details style="margin-top:10px">
      <summary>Storico (${(stato.cessioni || []).length})</summary>
      <div class="tabella-scroll" style="margin-top:8px"><table class="tabella-rosa">
        <thead><tr><th>Nome ceduto</th><th>Valore residuo</th><th>Prezzo</th><th>Plus/Minus</th><th></th></tr></thead>
        <tbody id="corpo-cessioni">${righeCessioni}</tbody>
      </table></div>
    </details>
  </div>

  <div class="sezione">
    <h3>Svincoli calciatori</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Indennizzo 0 se nessuno (il caso più comune). Il giocatore esce dalla Rosa in automatico.</p>
    <div class="griglia-3">
      <div class="campo"><label>Giocatore</label><select id="s-giocatore">${opzGiocatoriRosa()}</select></div>
      <div class="campo"><label>Motivo</label>
        <select id="s-motivo">
          <option>Si ritira</option><option>Si svincola dal club reale</option><option>Squadra retrocessa in B</option>
          <option>Doping/illecito sportivo</option><option>Deceduto</option><option>Altro</option>
        </select>
      </div>
      <div class="campo"><label>Indennizzo (mln) — 0 se nessuno, negativo se lo paghi tu</label><input type="number" id="s-indennizzo" value="0" /></div>
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
    <p style="font-size:12px;color:var(--gesso-ombra)">Negativo se paghi tu (di solito entrata), positivo se incassi/risparmi (di solito uscita). Riscatto conta solo con Obbligo.</p>
    <div id="corpo-prestiti-giocatori">${righeGiocatoriPrestito}</div>
    <button id="btn-agg-prestito-giocatore" class="btn-piccolo" style="margin-top:10px">+ Aggiungi prestito giocatore</button>
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
  const direzioni = ["In entrata", "In uscita"];
  const tipi = ["Secco", "Diritto di riscatto", "Obbligo di riscatto"];
  const opz = (arr, val) => arr.map(v => `<option value="${v}" ${val === v ? "selected" : ""}>${v}</option>`).join("");
  const puoRiscattare = p.tipo === "Diritto di riscatto" || p.tipo === "Obbligo di riscatto";
  // "In uscita": il giocatore è nella tua Rosa -> tendina. "In entrata": non è tuo -> resta testo libero.
  const campoNome = p.direzione === "In uscita"
    ? `<select class="pg-nome">${opzNomiRosa(p.nome)}</select>`
    : `<input class="pg-nome" type="text" value="${p.nome || ""}" />`;
  // Controparte: tendina con le altre squadre esistenti (se già caricate), altrimenti testo libero di riserva.
  const altreSquadre = elencoAltreSquadreCache || [];
  const campoControparte = altreSquadre.length > 0
    ? `<select class="pg-controparte"><option value="">— scegli —</option>${altreSquadre.map(n => `<option value="${n}" ${p.controparte === n ? "selected" : ""}>${n}</option>`).join("")}</select>`
    : `<input class="pg-controparte" type="text" value="${p.controparte || ""}" placeholder="Nome squadra..." />`;
  return `<div class="scheda-prestito" data-i="${i}">
    <div class="griglia-3">
      <div class="campo"><label>Ruolo</label><select class="pg-ruolo"><option value="P" ${p.ruolo === "P" ? "selected" : ""}>P</option><option value="D" ${p.ruolo === "D" ? "selected" : ""}>D</option><option value="C" ${p.ruolo === "C" ? "selected" : ""}>C</option><option value="A" ${p.ruolo === "A" || !p.ruolo ? "selected" : ""}>A</option></select></div>
      <div class="campo"><label>Nome</label>${campoNome}</div>
      <div class="campo"><label>Controparte</label>${campoControparte}</div>
    </div>
    <div class="griglia-2">
      <div class="campo"><label>Direzione</label><select class="pg-direzione">${opz(direzioni, p.direzione)}</select></div>
      <div class="campo"><label>Tipo</label><select class="pg-tipo">${opz(tipi, p.tipo)}</select></div>
    </div>
    <div class="griglia-3">
      <div class="campo"><label>Costo prestito</label><input class="pg-costo-prestito cifra" type="number" value="${p.costoPrestito || 0}" /></div>
      <div class="campo"><label>Costo riscatto</label><input class="pg-costo-riscatto cifra" type="number" value="${p.costoRiscatto || 0}" /></div>
      <div class="campo"><label>Stipendio annuo</label><input class="pg-stipendio cifra" type="number" value="${p.stipendioACarico || 0}" /></div>
    </div>
    <div class="campo" style="max-width:120px">
      <label>Quota %</label>
      <select class="pg-quota">
        <option value="100" ${(p.quotaPercento ?? 100) === 100 ? "selected" : ""}>100%</option>
        <option value="50" ${p.quotaPercento === 50 ? "selected" : ""}>50%</option>
        <option value="0" ${p.quotaPercento === 0 ? "selected" : ""}>0%</option>
      </select>
    </div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:6px">
      ${puoRiscattare ? `<button class="btn-piccolo pg-conferma-riscatto" style="margin:0">Conferma riscatto</button>` : ""}
      <button class="btn-testo pg-rimuovi">✕ rimuovi</button>
    </div>
  </div>`;
}


function renderBilancio() {
  const ce = calc.calcolaContoEconomico(stato);
  const classeBil = ce.chiusura >= 0 ? "positivo" : "negativo";
  const classeCap = ce.capitaleProvvisorio >= 0 ? "positivo" : "negativo";

  return `
  <div class="scoreboard">
    <div class="scoreboard-cella"><div class="etichetta">Chiusura Bilancio</div><div class="valore ${classeBil}">${ce.chiusura.toFixed(1)}</div></div>
    <div class="scoreboard-cella"><div class="etichetta">Capitale Provvisorio</div><div class="valore ${classeCap}">${ce.capitaleProvvisorio.toFixed(1)}</div></div>
  </div>
  <div class="sezione">
    <h3>Ricavi</h3>
    <div class="griglia-2">
      <div class="campo"><label>Aumenti di capitale sociale (mln)</label>
        <input type="number" id="f-aumenti-capitale" value="${stato.aumentiCapitale || 0}" /></div>
    </div>
    <p style="font-size:13px;line-height:1.9">
      Sponsor: <b class="cifra">${ce.ricSponsor.toFixed(1)}</b> ·
      Premio classifica: <b class="cifra">${ce.ricPremio.toFixed(1)}</b> ·
      Coppa: <b class="cifra">${ce.ricCoppa.toFixed(1)}</b> ·
      Champions: <b class="cifra">${ce.ricChampions.toFixed(1)}</b> ·
      Stadio: <b class="cifra">${ce.ricStadio.toFixed(1)}</b> ·
      Vendite calciatori: <b class="cifra">${ce.ricVenditeCalciatori.toFixed(1)}</b> ·
      Prestito bancario incassato: <b class="cifra">${ce.ricPrestitoBancario.toFixed(1)}</b> ·
      Saldo prestiti giocatori: <b class="cifra">${ce.ricPrestitiGiocatori.toFixed(1)}</b><br>
      <b>TOTALE RICAVI: ${ce.totRicavi.toFixed(1)}</b>
    </p>
  </div>
  <div class="sezione">
    <h3>Costi</h3>
    <div class="griglia-2">
      <div class="campo"><label>Costi vari (mln)</label>
        <input type="number" id="f-costi-vari" value="${stato.costiVari || 0}" /></div>
      <div class="campo"><label>Multe (mln)</label>
        <input type="number" id="f-multe" value="${stato.multe || 0}" /></div>
    </div>
    <p style="font-size:13px;line-height:1.9">
      Stipendi: <b class="cifra">${ce.stipendi.toFixed(1)}</b> ·
      Ammortamenti: <b class="cifra">${ce.ammortamenti.toFixed(1)}</b> ·
      Costo stadio: <b class="cifra">${ce.costoStadio.toFixed(1)}</b> ·
      Investimento stadio: <b class="cifra">${ce.investimentoStadio.toFixed(1)}</b> ·
      Rata prestito bancario: <b class="cifra">${ce.rataPrestitoBancario.toFixed(1)}</b><br>
      <b>TOTALE COSTI: ${ce.totCosti.toFixed(1)}</b>
    </p>
  </div>
  <div class="sezione">
    <h3>Risultato</h3>
    <p style="font-size:13px;line-height:1.9">
      Risultato ante plus/minusvalenze: <b class="cifra">${ce.risultatoAnte.toFixed(1)}</b><br>
      Plusvalenze: <b class="cifra">${ce.plusvalenze.toFixed(1)}</b> · Minusvalenze: <b class="cifra">${ce.minusvalenze.toFixed(1)}</b><br>
      <b>CHIUSURA BILANCIO: ${ce.chiusura.toFixed(1)}</b>
    </p>
  </div>
  <div class="sezione" style="border:1px solid var(--rosso-cartellino)">
    <h3 style="color:var(--gesso)">Chiusura stagione ${stato.stagioneCorrente}</h3>
    <p style="font-size:13px;color:var(--gesso-ombra);line-height:1.7">
      Passa alla stagione ${stato.stagioneCorrente + 1}. Capitale iniziale nuovo: <b class="cifra">${ce.capitaleProvvisorio.toFixed(1)}</b>. Non si può annullare.
    </p>
    <button id="btn-chiudi-stagione" class="btn-primario" style="width:auto;padding:10px 20px">Chiudi stagione e passa alla ${stato.stagioneCorrente + 1}</button>
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
    bind("f-stagione", "stagioneCorrente", "number");
    bind("f-capitale-iniziale", "capitaleIniziale", "number");
    bind("f-capitale-asta", "capitaleAsta", "number");
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
    // L'unica cosa modificabile da qui: spostare un giocatore tra Titolare/U21/Extra.
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
      const nuovo = {
        id,
        ruolo: document.getElementById("asta-ruolo").value,
        nome,
        costo: parseFloat(document.getElementById("asta-costo").value) || 0,
        annoInizio: parseInt(document.getElementById("asta-anno-inizio").value) || stato.stagioneCorrente,
        annoFine: parseInt(document.getElementById("asta-anno-fine").value) || stato.stagioneCorrente,
        quotaStagione: (parseFloat(document.getElementById("asta-quota").value) || 100) / 100,
        rinnovi: 0, gruppo: "Titolare",
      };
      stato.rosa.push(nuovo);
      stato.acquistiAsta = stato.acquistiAsta || [];
      stato.acquistiAsta.push({ id, ruolo: nuovo.ruolo, nome: nuovo.nome, costo: nuovo.costo, annoInizio: nuovo.annoInizio, annoFine: nuovo.annoFine });
      registraModifica("Acquisto in asta", `${nuovo.nome} (${nuovo.ruolo}), costo ${nuovo.costo}, contratto ${nuovo.annoInizio}-${nuovo.annoFine}`);
      programmaSalvataggio(); renderTab("mercato");
    });

    document.getElementById("btn-import-asta").addEventListener("click", () => {
      const testo = document.getElementById("asta-import-testo").value.trim();
      const esitoEl = document.getElementById("import-asta-esito");
      if (!testo) { esitoEl.textContent = "Incolla prima almeno una riga."; return; }
      const righeTesto = testo.split("\n").map(r => r.trim()).filter(r => r.length > 0);
      let aggiunti = 0;
      const righeSaltate = [];
      righeTesto.forEach((riga, idx) => {
        const parti = riga.split(",").map(p => p.trim());
        if (parti.length < 5) { righeSaltate.push(idx + 1); return; }
        const [ruoloRaw, nome, costoRaw, annoInizioRaw, annoFineRaw] = parti;
        const ruolo = ["P", "D", "C", "A"].includes(ruoloRaw.toUpperCase()) ? ruoloRaw.toUpperCase() : null;
        const costo = parseFloat(costoRaw);
        const annoInizio = parseInt(annoInizioRaw);
        const annoFine = parseInt(annoFineRaw);
        if (!ruolo || !nome || isNaN(costo) || isNaN(annoInizio) || isNaN(annoFine)) { righeSaltate.push(idx + 1); return; }
        const id = nuovoId();
        const nuovo = { id, ruolo, nome, costo, annoInizio, annoFine, quotaStagione: 1, rinnovi: 0, gruppo: "Titolare" };
        stato.rosa.push(nuovo);
        stato.acquistiAsta = stato.acquistiAsta || [];
        stato.acquistiAsta.push({ id, ruolo, nome, costo, annoInizio, annoFine });
        aggiunti++;
      });
      if (aggiunti > 0) {
        registraModifica("Importazione rosa", `${aggiunti} giocatori importati in blocco tramite Acquisti in asta`);
        programmaSalvataggio();
      }
      esitoEl.textContent = `Importati ${aggiunti} giocatori.` + (righeSaltate.length ? ` Righe saltate (formato non valido): ${righeSaltate.join(", ")}.` : "");
      if (aggiunti > 0) renderTab("mercato");
    });

    document.getElementById("btn-agg-fuoriasta").addEventListener("click", () => {
      const nome = document.getElementById("fa-nome").value.trim();
      if (!nome) { alert("Inserisci il nome del giocatore."); return; }
      const id = nuovoId();
      const nuovo = {
        id,
        ruolo: document.getElementById("fa-ruolo").value,
        nome,
        costo: parseFloat(document.getElementById("fa-prezzo").value) || 0,
        annoInizio: parseInt(document.getElementById("fa-anno-inizio").value) || stato.stagioneCorrente,
        annoFine: parseInt(document.getElementById("fa-anno-fine").value) || stato.stagioneCorrente,
        quotaStagione: (parseFloat(document.getElementById("fa-quota").value) || 100) / 100,
        rinnovi: 0, gruppo: "Titolare",
      };
      stato.rosa.push(nuovo);
      stato.acquistiFuoriAsta = stato.acquistiFuoriAsta || [];
      stato.acquistiFuoriAsta.push({
        id, ruolo: nuovo.ruolo, nome: nuovo.nome, compratoDa: document.getElementById("fa-da").value.trim(), prezzo: nuovo.costo,
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
      stato.cessioni = stato.cessioni || [];
      stato.cessioni.push({ nomeGiocatore: player.nome, valoreResiduoAlMomento, prezzoCessione });
      stato.rosa.splice(parseInt(idx), 1);
      registraModifica("Cessione", `${player.nome} ceduto a ${prezzoCessione} (valore residuo era ${valoreResiduoAlMomento.toFixed(1)})`);
      programmaSalvataggio(); renderTab("mercato");
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
      programmaSalvataggio(); renderTab("mercato");
    });

    document.getElementById("btn-conferma-rinnovi")?.addEventListener("click", () => {
      const checks = document.querySelectorAll(".rn-check:checked");
      if (checks.length === 0) { alert("Spunta almeno un giocatore da rinnovare."); return; }
      const dettagli = [];
      checks.forEach(chk => {
        const idx = parseInt(chk.dataset.idx);
        const player = stato.rosa[idx];
        const inputAnno = document.querySelector(`.rn-nuovo-anno[data-idx="${idx}"]`);
        const nuovoAnnoFine = parseInt(inputAnno.value);
        if (!nuovoAnnoFine || nuovoAnnoFine <= player.annoFine) return;
        const vecchio = player.annoFine;
        player.annoFine = nuovoAnnoFine;
        player.rinnovi = (player.rinnovi || 0) + 1;
        dettagli.push(`${player.nome} ${vecchio}→${nuovoAnnoFine} (rinnovo n.${player.rinnovi})`);
      });
      if (dettagli.length === 0) { alert("Nessun anno valido inserito (deve essere maggiore di quello attuale)."); return; }
      registraModifica("Rinnovo contratto", dettagli.join("; "));
      programmaSalvataggio(); renderTab("mercato");
    });

    document.getElementById("btn-agg-prestito-giocatore").addEventListener("click", () => {
      stato.prestitiGiocatori = stato.prestitiGiocatori || [];
      stato.prestitiGiocatori.push({ ruolo: "A", nome: "", controparte: "", direzione: "In entrata", tipo: "Secco", costoPrestito: 0, costoRiscatto: 0, stipendioACarico: 0, quotaPercento: 100, gruppo: "Extra" });
      registraModifica("Prestito giocatore aggiunto", "Nuova riga creata in Prestiti giocatori tra squadre (da compilare)");
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
    righeCampo("#corpo-prestiti-giocatori .scheda-prestito", "prestitiGiocatori",
      [[".pg-ruolo", "ruolo"], [".pg-nome", "nome"], [".pg-controparte", "controparte"], [".pg-direzione", "direzione"],
       [".pg-tipo", "tipo"], [".pg-costo-prestito", "costoPrestito", "number"], [".pg-costo-riscatto", "costoRiscatto", "number"],
       [".pg-stipendio", "stipendioACarico", "number"], [".pg-quota", "quotaPercento", "number"]], ".pg-rimuovi", "mercato");

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
          const ruoloInput = prompt(`Ruolo di "${p.nome}"? (P, D, C o A)`, "A");
          const ruolo = ["P", "D", "C", "A"].includes((ruoloInput || "").toUpperCase()) ? ruoloInput.toUpperCase() : "A";
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
          stato.acquistiFuoriAsta.push({ id, ruolo, nome: p.nome, compratoDa: p.controparte, prezzo: nuovo.costo });
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
    bind("f-aumenti-capitale", "aumentiCapitale", "number");
    bind("f-costi-vari", "costiVari", "number");
    bind("f-multe", "multe", "number");
    document.getElementById("btn-chiudi-stagione").addEventListener("click", async () => {
      const conferma = confirm(
        `Chiudere la stagione ${stato.stagioneCorrente} e passare alla ${stato.stagioneCorrente + 1}? Non si può annullare.`
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

  const tabFasce = `<table class="istr-tabella"><tr><th>Fascia di costo (mln)</th><th>Stipendio (mln)</th><th>% Ammortamento</th></tr>
    <tr><td>1 - 19</td><td>3</td><td>100%</td></tr>
    <tr><td>20 - 59</td><td>6</td><td>60%</td></tr>
    <tr><td>60 e oltre</td><td>10</td><td>40%</td></tr></table>`;

  const tabStadio = `<table class="istr-tabella"><tr><th>Capienza</th><th>Costo/anno</th><th>Sconfitta</th><th>Pareggio</th><th>Vittoria</th><th>Investimento</th></tr>
    ${calc.STADI.map(s => `<tr><td>${s.nome}</td><td>${s.costo}</td><td>${s.sconfitta}</td><td>${s.pareggio}</td><td>${s.vittoria}</td><td>${s.investimento ?? "—"}</td></tr>`).join("")}
    </table>`;

  const tabPremio = `<table class="istr-tabella"><tr><th>Piazzamento</th><th>Premio campionato</th><th>Coppa</th></tr>
    ${calc.PREMIO_CAMPIONATO.map((v, i) => `<tr><td>${i + 1}°</td><td>${v}</td><td>${calc.PREMIO_COPPA[i]}</td></tr>`).join("")}
    </table>`;

  const tabChampions = `<table class="istr-tabella"><tr><th>Risultato</th><th>Premio</th></tr>
    ${Object.entries(calc.PREMIO_CHAMPIONS).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}
    </table>`;

  const tabSanzioni = `<table class="istr-tabella"><tr><th>Perdita da</th><th>Perdita a</th><th>Punti</th><th>Rosa ridotta a</th></tr>
    ${calc.SANZIONI.map(s => `<tr><td>${s.da}</td><td>${s.a === Infinity ? "in su" : s.a}</td><td>${s.punti}</td><td>${s.rosa}</td></tr>`).join("")}
    </table>`;

  el.innerHTML = `
  ${sezioneIstr("📁 Come funziona il sito", `
    Il sito ha 7 sezioni (le trovi come schede in alto): <b>Anagrafica</b>, <b>Stadio</b>, <b>Sponsor & Premi</b>, <b>Rosa</b>, <b>Mercato</b>, <b>Prestiti</b>, <b>Conto Economico</b> — più il pulsante <b>Chiudi stagione</b> in fondo al Conto Economico. Chi entra come <b>ADMIN</b> vede una schermata separata con i bilanci di tutte le squadre.
    Tutto è in <b>milioni</b>, senza nessuna conversione da fare. Tutto quello che scrivi si salva da solo dopo circa mezzo secondo che smetti di scrivere — non serve nessun pulsante "salva".
  `)}

  ${sezioneIstr("📋 Anagrafica", `
    Nome società e Allenatore sono solo per riconoscerti. <b>Stagione corrente</b> è l'anno di gioco: serve a calcolare da sola quanti anni restano ai contratti dei giocatori e il loro valore residuo — aggiornala solo premendo il pulsante "Chiudi stagione", non a mano.
    <b>Capitale iniziale</b> è quanto avevi a inizio stagione (500 il primo anno, poi lo aggiorna da solo "Chiudi stagione"). <b>Capitale destinato all'asta</b> è quanto hai speso comprando giocatori — aggiornalo tu con la cifra vera.
  `)}

  ${sezioneIstr("👕 Rosa calciatori", `
    Report: i dati di ogni giocatore (costo, contratto, quota) si modificano solo da Mercato — l'unica cosa che fai qui è spostare un giocatore tra <b>Titolare / Under 21 / Extra</b> col menu a destra di ogni riga.<br><br>
    <b>Titolari</b>: servono esattamente 3 portieri, 8 difensori, 8 centrocampisti, 6 attaccanti (avviso sopra la tabella se non torna). <b>Under 21</b>: <b>solo lo stipendio</b> dimezzato rispetto al normale (l'ammortamento resta uguale a tutti) — pensato per i giocatori davvero U21, non un modo per risparmiare su chiunque. <b>Extra</b>: nessuno sconto, nessun limite di numero.<br><br>
    <b>Stipendio</b> = fascia di costo × 1,10 per ogni rinnovo × quota stagione × (0,5 se Under 21).<br>
    <b>Ammortamento annuo</b> = costo × % della fascia ÷ anni di contratto × quota stagione (uguale per tutti i gruppi, Under 21 compreso) — si azzera da solo a contratto scaduto.<br>
    <b>Valore residuo</b> = costo pieno diviso gli anni di contratto (mai dimezzato, anche per gli U21) — conta quando vendi o svincoli.<br><br>
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
    <b>Acquisti in asta</b> e <b>Acquisti fuori asta</b>: compili ruolo, nome, costo, contratto — il giocatore finisce automaticamente nella tua Rosa, non serve inserirlo due volte. Se sbagli qualcosa, il tasto ✕ nello Storico qui sotto annulla l'acquisto per intero — toglie sia la riga di storico sia il giocatore dalla Rosa, come se non l'avessi mai comprato (chiede conferma prima di farlo).<br>
    <b>Cessioni</b> e <b>Svincoli</b>: scegli il giocatore da un menu (solo quelli davvero in Rosa, niente possibilità di sbagliare il nome) — il Valore residuo si calcola da solo nel momento in cui lo registri, il giocatore esce subito dalla Rosa, e plus/minusvalenza vanno dritte nel Conto Economico. Qui il tasto ✕ nello Storico toglie solo il ricordo scritto (sono movimenti già avvenuti per davvero, non si annullano).<br>
    <b>Rinnovo contratto</b>: mostra da solo la lista di chi ha il contratto in scadenza questa stagione — spunta chi vuoi rinnovare, scegli il nuovo anno per ognuno, conferma tutti insieme.<br>
    Ogni categoria ha anche uno <b>Storico</b> a tendina, per tenere traccia dei movimenti senza affollare la pagina.<br>
    <b>Prestiti giocatori tra squadre</b>: diverso dagli altri — se lo prendi IN ENTRATA non aggiungerlo in Rosa con un costo vero (o mettilo a 0), il vero impatto lo scrivi qui. "Costo prestito": <b>negativo</b> se lo paghi tu per prenderlo (di solito IN ENTRATA), <b>positivo</b> se lo incassi tu per darlo (di solito IN USCITA). Per un prestito Secco basta questo, lascia "Costo riscatto" a 0 (non conta comunque). Con <b>Obbligo</b> di riscatto, "Costo riscatto" conta subito nel bilancio perché è certo che succederà. Con <b>Diritto</b> di riscatto invece NON conta ancora — è solo indicativo di quanto costerebbe, finché non lo eserciti davvero (a quel punto registra un Acquisto con costo = costo riscatto e togli la riga da qui). "Stipendio annuo" è il vero stipendio del giocatore (o la parte concordata): <b>negativo</b> se lo paghi tu (di solito IN ENTRATA), <b>positivo</b> se lo paga l'altra squadra ed è un risparmio per te (di solito IN USCITA) — con "Quota %" a 100/50/0 in base a quanta stagione copre. Con un prestito Secco il giocatore torna al proprietario da solo a fine prestito.<br>
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
    Qui confluisce tutto quello inserito nelle altre pagine, già collegato in automatico. Le uniche voci libere sono Aumenti di capitale, Costi vari e Multe.<br>
    <b>TOTALE RICAVI − TOTALE COSTI</b> = risultato prima di plus/minusvalenze; poi si incrocia con le plus/minusvalenze di Cessioni e Svincoli per dare la <b>Chiusura Bilancio</b> finale.<br>
    Se il bilancio chiude in rosso, scattano sanzioni la stagione successiva (da applicare a mano — il sito non lo fa da solo):
    ${tabSanzioni}
    Il <b>Capitale Provvisorio</b> è invece la cassa vera — conta la spesa reale all'asta, non l'ammortamento — e resta sempre visibile in alto nella pagina.
  `)}

  ${sezioneIstr("🔄 Chiudere la stagione", `
    In fondo al Conto Economico trovi il pulsante per passare alla stagione successiva. Cosa fa: il Capitale Provvisorio di oggi diventa il Capitale iniziale nuovo; la Rosa resta com'è (contratti invariati, si ricalcolano da soli); i prestiti bancari pluriennali restano; piazzamenti, partite in casa, Cessioni/Svincoli/Acquisti/Prestiti giocatori di questa stagione si azzerano; i bonus sponsor si aggiornano da soli in base a cosa hai vinto. Non si può annullare.<br>
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
