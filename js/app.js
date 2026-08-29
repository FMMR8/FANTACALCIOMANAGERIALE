import * as calc from "./calc.js";
import { caricaSquadra, salvaSquadra, elencoSquadre, eliminaSquadra } from "./storage.js";

let stato = null;   // stato della squadra corrente, in memoria
let nickCorrente = null;
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
    cessioni: [], svincoli: [], acquistiFuoriAsta: [], prestitiBancari: [], prestitiGiocatori: [],
    aumentiCapitale: 0, costiVari: 0, multe: 0,
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
const ADMIN_NICKNAME = "PRESIDENTE";

document.getElementById("btn-entra").addEventListener("click", async () => {
  const nickname = document.getElementById("input-nickname").value.trim();
  const pin = document.getElementById("input-pin").value.trim();
  const errEl = document.getElementById("errore-accesso");
  errEl.hidden = true;

  if (!nickname) { errEl.textContent = "Inserisci il nome della tua squadra."; errEl.hidden = false; return; }
  if (!/^\d{4}$/.test(pin)) { errEl.textContent = "Il PIN deve avere 4 cifre."; errEl.hidden = false; return; }

  if (nickname.toUpperCase() === ADMIN_NICKNAME) {
    await entraComePresidente(pin, errEl);
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
    errEl.textContent = "Squadra non trovata. Chiedi al presidente di lega di crearla.";
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

async function entraComePresidente(pin, errEl) {
  let admin;
  try {
    admin = await caricaSquadra("_presidente");
  } catch (e) {
    errEl.textContent = "Errore: " + (e && e.message ? e.message : e);
    errEl.hidden = false;
    return;
  }
  if (!admin) {
    // primo accesso in assoluto: il PIN che scrivi ora diventa quello del presidente
    await salvaSquadra("_presidente", { pin });
    admin = { pin };
  } else if (admin.pin !== pin) {
    errEl.textContent = "PIN presidente non corretto.";
    errEl.hidden = false;
    return;
  }
  await renderPresidente();
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
        <label>Stagione corrente (anno)</label>
        <input type="number" id="f-stagione" value="${stato.stagioneCorrente}" />
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
  const righeArr = stato.rosa.map((p, i) => rigaRosa(p, i));
  // Separatori visivi tra Titolari (primi 25) / Under 21 (i successivi 7) / Extra (dal 33° in poi),
  // inseriti dal fondo verso l'inizio per non spostare gli indici già sistemati.
  if (righeArr.length > 32) righeArr.splice(32, 0, separatoreRosa("EXTRA — oltre ai 25 + 7, nessun limite di ruolo"));
  if (righeArr.length > 25) righeArr.splice(25, 0, separatoreRosa("UNDER 21 — fino a 7 slot"));
  const righe = righeArr.join("");
  const titolari25 = stato.rosa.slice(0, 25);
  const comp = calc.composizioneRuoli(titolari25);
  const compClasse = comp.ok ? "riga-check-ok" : "riga-check-warn";
  const compTesto = comp.ok
    ? `✅ P:${comp.P}/3 D:${comp.D}/8 C:${comp.C}/8 A:${comp.A}/6`
    : `⚠️ P:${comp.P}/3 D:${comp.D}/8 C:${comp.C}/8 A:${comp.A}/6 — non rispetta i primi 25 titolari richiesti`;

  const tot = calc.totaliRosa(stato.rosa, stato.stagioneCorrente);

  return `
  <div class="sezione">
    <h3>Rosa calciatori</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">
      I primi 25 giocatori della lista sono i titolari (servono 3 portieri, 8 difensori, 8 centrocampisti, 6 attaccanti — vedi il controllo qui sotto).
      Poi ci sono fino a 7 slot Under 21, e infine slot Extra senza limite — sono separati da una riga colorata nella tabella, così è chiaro a colpo d'occhio.
      Stipendio e ammortamento si calcolano allo stesso modo per tutti, a qualunque gruppo appartengano.
      Quota %: 100 se il giocatore è tuo per tutta la stagione, 50 se entra/esce a metà stagione, 0 se è fuori in prestito — determina che percentuale di stipendio e ammortamento paghi quest'anno.
    </p>
    <p class="${compClasse}">${compTesto}</p>
    <div class="tabella-scroll">
      <table class="tabella-rosa">
        <thead><tr>
          <th>Ruolo</th><th>Nome</th><th>Costo</th><th>Anno inizio</th><th>Anno fine</th>
          <th>Anni rim.</th><th>Stipendio</th><th>Quota %</th><th>Ammort.</th><th>Rinnovi</th><th>Val. residuo</th><th></th>
        </tr></thead>
        <tbody id="corpo-tabella-rosa">${righe}</tbody>
      </table>
    </div>
    <button id="btn-agg-giocatore" class="btn-piccolo" style="margin-top:10px">+ Aggiungi giocatore</button>
    <p style="margin-top:14px;font-size:13px">
      Totale costo rosa: <b style="font-family:var(--font-cifre)">${tot.costo.toFixed(1)}</b> ·
      Totale stipendi: <b style="font-family:var(--font-cifre)">${tot.stipendi.toFixed(1)}</b> ·
      Totale ammortamenti: <b style="font-family:var(--font-cifre)">${tot.ammortamenti.toFixed(1)}</b>
    </p>
  </div>`;
}

function separatoreRosa(testo) {
  return `<tr><td colspan="12" style="background:var(--ambra); color:var(--blu-scuro); font-weight:600; font-size:12px; text-align:center; padding:6px;">${testo}</td></tr>`;
}

function rigaRosa(p, i) {
  const anniRim = calc.anniRimanenti(p, stato.stagioneCorrente);
  const stip = calc.stipendio(p);
  const amm = calc.ammortamentoAnnuo(p, stato.stagioneCorrente);
  const val = calc.valoreResiduo(p, stato.stagioneCorrente);
  const ruoli = ["P", "D", "C", "A"].map(r => `<option value="${r}" ${p.ruolo === r ? "selected" : ""}>${r}</option>`).join("");
  return `<tr data-i="${i}">
    <td><select class="r-ruolo">${ruoli}</select></td>
    <td><input class="r-nome" type="text" value="${p.nome || ""}" /></td>
    <td><input class="r-costo cifra" type="number" value="${p.costo || 0}" /></td>
    <td><input class="r-anno-inizio" type="number" value="${p.annoInizio || stato.stagioneCorrente}" /></td>
    <td><input class="r-anno-fine" type="number" value="${p.annoFine || stato.stagioneCorrente}" /></td>
    <td class="cifra">${anniRim}</td>
    <td class="cifra">${stip.toFixed(1)}</td>
    <td><input class="r-quota cifra" type="number" step="5" min="0" max="100" value="${Math.round((p.quotaStagione ?? 1) * 100)}" /></td>
    <td class="cifra">${amm.toFixed(1)}</td>
    <td><input class="r-rinnovi cifra" type="number" value="${p.rinnovi || 0}" /></td>
    <td class="cifra">${val.toFixed(1)}</td>
    <td><button class="btn-testo r-rimuovi">✕</button></td>
  </tr>`;
}

// ============================================================
// TAB: MERCATO (Cessioni, Svincoli, Acquisti fuori asta)
// ============================================================
function trovaValoreResiduoPerNome(nome) {
  const p = stato.rosa.find(pl => pl.nome === nome);
  if (!p) return null;
  return calc.valoreResiduo(p, stato.stagioneCorrente);
}

function renderMercato() {
  const righeCessioni = (stato.cessioni || []).map((c, i) => rigaCessione(c, i)).join("");
  const righeSvincoli = (stato.svincoli || []).map((s, i) => rigaSvincolo(s, i)).join("");
  const righeAcquisti = (stato.acquistiFuoriAsta || []).map((a, i) => rigaAcquisto(a, i)).join("");
  const righeGiocatoriPrestito = (stato.prestitiGiocatori || []).map((p, i) => rigaPrestitoGiocatore(p, i)).join("");

  return `
  <div class="sezione">
    <h3>Cessioni calciatori</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Scrivi il nome esattamente come in Rosa: il valore residuo si pesca da solo.</p>
    <div class="tabella-scroll">
      <table class="tabella-rosa">
        <thead><tr><th>Nome ceduto</th><th>Valore residuo</th><th>Prezzo cessione</th><th>Plus/Minus</th><th></th></tr></thead>
        <tbody id="corpo-cessioni">${righeCessioni}</tbody>
      </table>
    </div>
    <button id="btn-agg-cessione" class="btn-piccolo" style="margin-top:10px">+ Aggiungi cessione</button>
  </div>

  <div class="sezione">
    <h3>Svincoli calciatori</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Indennizzo 0 se nessuno (il caso più comune).</p>
    <div class="tabella-scroll">
      <table class="tabella-rosa">
        <thead><tr><th>Nome svincolato</th><th>Motivo</th><th>Valore residuo</th><th>Indennizzo</th><th>Minus/Plus</th><th></th></tr></thead>
        <tbody id="corpo-svincoli">${righeSvincoli}</tbody>
      </table>
    </div>
    <button id="btn-agg-svincolo" class="btn-piccolo" style="margin-top:10px">+ Aggiungi svincolo</button>
  </div>

  <div class="sezione">
    <h3>Acquisti fuori asta</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">Solo un registro — ricordati di aggiungere lo stesso giocatore anche in Rosa con lo stesso costo, altrimenti non genera stipendio/ammortamento.</p>
    <div class="tabella-scroll">
      <table class="tabella-rosa">
        <thead><tr><th>Nome acquistato</th><th>Comprato da</th><th>Prezzo</th><th></th></tr></thead>
        <tbody id="corpo-acquisti">${righeAcquisti}</tbody>
      </table>
    </div>
    <button id="btn-agg-acquisto" class="btn-piccolo" style="margin-top:10px">+ Aggiungi acquisto</button>
  </div>

  <div class="sezione">
    <h3>Prestiti giocatori tra squadre</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">
      Se lo prendi IN ENTRATA non aggiungerlo in Rosa con un costo vero (o mettilo a 0): il vero impatto lo scrivi qui.
    </p>
    <div class="tabella-scroll">
      <table class="tabella-rosa">
        <thead><tr><th>Nome</th><th>Controparte</th><th>Direzione</th><th>Tipo</th><th>Impatto operaz.</th><th>Stipendio a carico</th><th></th></tr></thead>
        <tbody id="corpo-prestiti-giocatori">${righeGiocatoriPrestito}</tbody>
      </table>
    </div>
    <button id="btn-agg-prestito-giocatore" class="btn-piccolo" style="margin-top:10px">+ Aggiungi prestito giocatore</button>
  </div>`;
}

function rigaCessione(c, i) {
  const val = trovaValoreResiduoPerNome(c.nomeGiocatore);
  const valTxt = val === null ? "⚠ non trovato" : val.toFixed(1);
  const pm = val === null ? "" : ((c.prezzoCessione || 0) - val).toFixed(1);
  return `<tr data-i="${i}">
    <td><input class="c-nome" type="text" value="${c.nomeGiocatore || ""}" /></td>
    <td class="cifra">${valTxt}</td>
    <td><input class="c-prezzo cifra" type="number" value="${c.prezzoCessione || 0}" /></td>
    <td class="cifra">${pm}</td>
    <td><button class="btn-testo c-rimuovi">✕</button></td>
  </tr>`;
}
function rigaSvincolo(s, i) {
  const val = trovaValoreResiduoPerNome(s.nomeGiocatore);
  const valTxt = val === null ? "⚠ non trovato" : val.toFixed(1);
  const pm = val === null ? "" : ((s.indennizzo || 0) - val).toFixed(1);
  const motivi = ["Si ritira", "Si svincola dal club reale", "Squadra retrocessa in B", "Doping/illecito sportivo", "Deceduto", "Altro"];
  const opzMotivi = motivi.map(m => `<option value="${m}" ${s.motivo === m ? "selected" : ""}>${m}</option>`).join("");
  return `<tr data-i="${i}">
    <td><input class="s-nome" type="text" value="${s.nomeGiocatore || ""}" /></td>
    <td><select class="s-motivo">${opzMotivi}</select></td>
    <td class="cifra">${valTxt}</td>
    <td><input class="s-indennizzo cifra" type="number" value="${s.indennizzo || 0}" /></td>
    <td class="cifra">${pm}</td>
    <td><button class="btn-testo s-rimuovi">✕</button></td>
  </tr>`;
}
function rigaAcquisto(a, i) {
  return `<tr data-i="${i}">
    <td><input class="a-nome" type="text" value="${a.nome || ""}" /></td>
    <td><input class="a-da" type="text" value="${a.compratoDa || ""}" /></td>
    <td><input class="a-prezzo cifra" type="number" value="${a.prezzo || 0}" /></td>
    <td><button class="btn-testo a-rimuovi">✕</button></td>
  </tr>`;
}

// ============================================================
// TAB: PRESTITI (bancari + giocatori)
// ============================================================
function renderPrestiti() {
  const righeBanca = (stato.prestitiBancari || []).map((p, i) => rigaPrestitoBancario(p, i)).join("");

  return `
  <div class="sezione">
    <h3>Prestiti bancari</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">
      Tassi: 1 anno 10% (15% per risanare un rosso) · 2 anni 25% (35%) · 3 anni 40% (50%).
      Spunta "incassato quest'anno" solo per i prestiti nuovi di questa stagione.
      La colonna "Stato" ti dice da sola quando un prestito è ripagato per intero — a quel punto smette
      di pesare sul bilancio (puoi anche rimuoverlo con ✕, non serve più).
    </p>
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
    <td><input class="pb-capitale cifra" type="number" value="${p.capitale || 0}" /></td>
    <td><select class="pb-anni"><option value="1" ${p.anni===1?"selected":""}>1</option><option value="2" ${p.anni===2?"selected":""}>2</option><option value="3" ${p.anni===3?"selected":""}>3</option></select></td>
    <td><input class="pb-risanare" type="checkbox" ${p.perRisanare ? "checked" : ""} /></td>
    <td><input class="pb-incassato" type="checkbox" ${p.incassatoQuestAnno ? "checked" : ""} /></td>
    <td class="cifra" style="font-size:12px">${stato_testo}</td>
    <td><button class="btn-testo pb-rimuovi">✕</button></td>
  </tr>`;
}
function rigaPrestitoGiocatore(p, i) {
  const direzioni = ["In entrata", "In uscita"];
  const tipi = ["Diritto di riscatto", "Obbligo di riscatto", "Secco"];
  const opz = (arr, val) => arr.map(v => `<option value="${v}" ${val === v ? "selected" : ""}>${v}</option>`).join("");
  return `<tr data-i="${i}">
    <td><input class="pg-nome" type="text" value="${p.nome || ""}" /></td>
    <td><input class="pg-controparte" type="text" value="${p.controparte || ""}" /></td>
    <td><select class="pg-direzione">${opz(direzioni, p.direzione)}</select></td>
    <td><select class="pg-tipo">${opz(tipi, p.tipo)}</select></td>
    <td><input class="pg-impatto cifra" type="number" value="${p.impattoOperazione || 0}" /></td>
    <td><input class="pg-stipendio cifra" type="number" value="${p.stipendioACarico || 0}" /></td>
    <td><button class="btn-testo pg-rimuovi">✕</button></td>
  </tr>`;
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
      Vendite calciatori: <b class="cifra">${ce.ricVenditeCalciatori.toFixed(1)}</b><br>
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
      Investimento stadio: <b class="cifra">${ce.investimentoStadio.toFixed(1)}</b><br>
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
      Quando la stagione è davvero finita, premi qui per passare alla ${stato.stagioneCorrente + 1}. Cosa succede:<br>
      • Il Capitale Provvisorio di oggi (<b class="cifra">${ce.capitaleProvvisorio.toFixed(1)}</b>) diventa il Capitale iniziale della nuova stagione<br>
      • La Rosa resta com'è (contratti, anni, tutto invariato)<br>
      • Piazzamenti, partite in casa, Cessioni/Svincoli/Acquisti/Prestiti giocatori di questa stagione si azzerano<br>
      • I bonus sponsor si aggiornano da soli in base a cosa hai vinto quest'anno<br>
      Non si può annullare — fallo solo quando sei sicuro che la stagione sia chiusa per davvero.
    </p>
    <button id="btn-chiudi-stagione" class="btn-primario" style="width:auto;padding:10px 20px">Chiudi stagione e passa alla ${stato.stagioneCorrente + 1}</button>
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
    document.getElementById("btn-agg-giocatore").addEventListener("click", () => {
      stato.rosa.push({ ruolo: "P", nome: "", costo: 0, annoInizio: stato.stagioneCorrente, annoFine: stato.stagioneCorrente, quotaStagione: 1, rinnovi: 0 });
      programmaSalvataggio();
      renderTab("rosa");
    });
    document.querySelectorAll("#corpo-tabella-rosa tr").forEach(tr => {
      if (tr.dataset.i === undefined) return; // riga separatore (Under 21 / Extra), non un giocatore: la salto
      const i = parseInt(tr.dataset.i);
      const campo = (cls, key, tipo) => {
        const el = tr.querySelector(cls);
        const leggi = () => {
          let v = el.value;
          if (tipo === "number") v = v === "" ? 0 : parseFloat(v);
          if (tipo === "percento") v = v === "" ? 0 : parseFloat(v) / 100;
          stato.rosa[i][key] = v;
          programmaSalvataggio();
        };
        el.addEventListener("input", leggi);
        el.addEventListener("change", () => { leggi(); renderTab("rosa"); });
      };
      campo(".r-ruolo", "ruolo");
      campo(".r-nome", "nome");
      campo(".r-costo", "costo", "number");
      campo(".r-anno-inizio", "annoInizio", "number");
      campo(".r-anno-fine", "annoFine", "number");
      campo(".r-quota", "quotaStagione", "percento");
      campo(".r-rinnovi", "rinnovi", "number");
      tr.querySelector(".r-rimuovi").addEventListener("click", () => {
        stato.rosa.splice(i, 1);
        programmaSalvataggio();
        renderTab("rosa");
      });
    });
  } else if (tab === "mercato") {
    document.getElementById("btn-agg-cessione").addEventListener("click", () => {
      stato.cessioni = stato.cessioni || [];
      stato.cessioni.push({ nomeGiocatore: "", prezzoCessione: 0 });
      programmaSalvataggio(); renderTab("mercato");
    });
    document.getElementById("btn-agg-svincolo").addEventListener("click", () => {
      stato.svincoli = stato.svincoli || [];
      stato.svincoli.push({ nomeGiocatore: "", motivo: "Si ritira", indennizzo: 0 });
      programmaSalvataggio(); renderTab("mercato");
    });
    document.getElementById("btn-agg-acquisto").addEventListener("click", () => {
      stato.acquistiFuoriAsta = stato.acquistiFuoriAsta || [];
      stato.acquistiFuoriAsta.push({ nome: "", compratoDa: "", prezzo: 0 });
      programmaSalvataggio(); renderTab("mercato");
    });
    document.getElementById("btn-agg-prestito-giocatore").addEventListener("click", () => {
      stato.prestitiGiocatori = stato.prestitiGiocatori || [];
      stato.prestitiGiocatori.push({ nome: "", controparte: "", direzione: "In entrata", tipo: "Diritto di riscatto", impattoOperazione: 0, stipendioACarico: 0 });
      programmaSalvataggio(); renderTab("mercato");
    });
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
    righeCampo("#corpo-cessioni tr", "cessioni", [[".c-nome", "nomeGiocatore"], [".c-prezzo", "prezzoCessione", "number"]], ".c-rimuovi", "mercato");
    righeCampo("#corpo-svincoli tr", "svincoli", [[".s-nome", "nomeGiocatore"], [".s-motivo", "motivo"], [".s-indennizzo", "indennizzo", "number"]], ".s-rimuovi", "mercato");
    righeCampo("#corpo-acquisti tr", "acquistiFuoriAsta", [[".a-nome", "nome"], [".a-da", "compratoDa"], [".a-prezzo", "prezzo", "number"]], ".a-rimuovi", "mercato");
    righeCampo("#corpo-prestiti-giocatori tr", "prestitiGiocatori",
      [[".pg-nome", "nome"], [".pg-controparte", "controparte"], [".pg-direzione", "direzione"],
       [".pg-tipo", "tipo"], [".pg-impatto", "impattoOperazione", "number"], [".pg-stipendio", "stipendioACarico", "number"]], ".pg-rimuovi", "mercato");
  } else if (tab === "prestiti") {
    document.getElementById("btn-agg-prestito-banca").addEventListener("click", () => {
      stato.prestitiBancari = stato.prestitiBancari || [];
      stato.prestitiBancari.push({ descrizione: "", capitale: 0, anni: 1, perRisanare: false, incassatoQuestAnno: true, annoErogazione: stato.stagioneCorrente });
      programmaSalvataggio(); renderTab("prestiti");
    });
    document.querySelectorAll("#corpo-prestiti-banca tr").forEach(tr => {
      const i = parseInt(tr.dataset.i);
      const campo = (cls, key, tipo) => {
        const el = tr.querySelector(cls);
        const leggi = () => {
          let v = el.value;
          if (tipo === "number") v = parseFloat(v) || 0;
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
      chiudiStagione();
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
// SCHERMATA PRESIDENTE — crea squadre, apre qualunque squadra senza PIN
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
    Il sito ha 7 sezioni (le trovi come schede in alto): <b>Anagrafica</b>, <b>Stadio</b>, <b>Sponsor & Premi</b>, <b>Rosa</b>, <b>Mercato</b>, <b>Prestiti</b>, <b>Conto Economico</b> — più il bottone <b>Classifica</b> se sei presidente e il pulsante <b>Chiudi stagione</b> in fondo al Conto Economico.
    Tutto è in <b>milioni</b>, senza nessuna conversione da fare. Tutto quello che scrivi si salva da solo dopo circa mezzo secondo che smetti di scrivere — non serve nessun pulsante "salva".
  `)}

  ${sezioneIstr("📋 Anagrafica", `
    Nome società e Allenatore sono solo per riconoscerti. <b>Stagione corrente</b> è l'anno di gioco: serve a calcolare da sola quanti anni restano ai contratti dei giocatori e il loro valore residuo — aggiornala solo premendo il pulsante "Chiudi stagione", non a mano.
    <b>Capitale iniziale</b> è quanto avevi a inizio stagione (500 il primo anno, poi lo aggiorna da solo "Chiudi stagione"). <b>Capitale destinato all'asta</b> è quanto hai speso comprando giocatori — aggiornalo tu con la cifra vera.
  `)}

  ${sezioneIstr("👕 Rosa calciatori", `
    La rosa è divisa in tre gruppi, separati da una riga gialla nella tabella: i primi <b>25 titolari</b> (servono esattamente 3 portieri, 8 difensori, 8 centrocampisti, 6 attaccanti — un avviso sopra la tabella ti dice se va bene), poi fino a <b>7 Under 21</b>, poi <b>Extra</b> senza limite. Stipendio e ammortamento si calcolano allo stesso modo per tutti i gruppi.<br><br>
    <b>Costo</b>: quanto l'hai pagato. <b>Anno inizio/fine contratto</b>: li scrivi una volta e non li tocchi più — da lì si calcolano da soli "Anni rimanenti" e "Valore residuo".<br>
    <b>Stipendio</b> = fascia di costo (vedi tabella sotto) × 1,10 per ogni rinnovo × quota stagione.<br>
    <b>Ammortamento annuo</b> = costo × % della fascia ÷ anni di contratto × quota stagione — si azzera da solo una volta passata la data di fine contratto.<br>
    <b>Valore residuo</b> = costo pieno diviso semplicemente gli anni di contratto (non la % della fascia) — è il numero che conta quando lo vendi o lo svincoli, non il costo pieno.<br>
    <b>Quota %</b>: 100 se è tuo per tutta la stagione, 50 se entra/esce a metà, 0 se è fuori in prestito.
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

  ${sezioneIstr("🔁 Mercato — Cessioni, Svincoli, Acquisti, Prestiti giocatori", `
    <b>Cessioni</b>: scrivi il nome esattamente come in Rosa, il Valore residuo si pesca da solo — se vendi sopra guadagni (plusvalenza), sotto ci perdi (minusvalenza).<br>
    <b>Svincoli</b>: stesso meccanismo, con indennizzo 0 se nessuno (il caso più comune).<br>
    <b>Acquisti fuori asta</b>: solo un registro — ricordati di aggiungere lo stesso giocatore anche in Rosa con lo stesso costo, altrimenti non genera stipendio/ammortamento.<br>
    <b>Prestiti giocatori tra squadre</b>: se lo prendi IN ENTRATA non aggiungerlo in Rosa con un costo vero (o mettilo a 0) — il vero impatto lo scrivi qui.
  `)}

  ${sezioneIstr("🏦 Prestiti bancari", `
    Registra descrizione, capitale, anni (1/2/3) ed eventuale richiesta "per risanare un rosso" (tasso più alto). La colonna "Stato" ti dice da sola quando un prestito è ripagato per intero ("✅ Estinto") — a quel punto smette di pesare sul bilancio da solo, non serve fare nulla (puoi anche rimuoverlo con ✕ se vuoi).
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
    In fondo al Conto Economico trovi il pulsante per passare alla stagione successiva. Cosa fa: il Capitale Provvisorio di oggi diventa il Capitale iniziale nuovo; la Rosa resta com'è (contratti invariati, si ricalcolano da soli); i prestiti bancari pluriennali restano; piazzamenti, partite in casa, Cessioni/Svincoli/Acquisti/Prestiti giocatori di questa stagione si azzerano; i bonus sponsor si aggiornano da soli in base a cosa hai vinto. Non si può annullare.
  `)}

  ${sezioneIstr("👑 Area Presidente", `
    Chi gestisce la lega entra scrivendo <b>PRESIDENTE</b> come nome squadra (il PIN scelto la prima volta resta quello per sempre). Da lì può creare le 8 squadre (nickname + PIN a sua scelta), vedere i bilanci di tutte in un colpo d'occhio, aprire e modificare qualunque squadra senza bisogno del suo PIN, ed eliminarne una se serve.
  `)}
  `;
}

async function renderPresidente() {
  mostraSchermata("schermata-presidente");
  const el = document.getElementById("contenuto-presidente");
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
      await renderPresidente();
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
    await renderPresidente();
  });
}

document.getElementById("btn-presidente-esci").addEventListener("click", () => {
  stato = null; nickCorrente = null;
  mostraSchermata("schermata-accesso");
});
