import * as calc from "./calc.js";
import { caricaSquadra, salvaSquadra, elencoSquadre } from "./storage.js";

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
  for (const s of document.querySelectorAll(".schermata")) s.hidden = true;
  document.getElementById(id).hidden = false;
}

// ---------- ACCESSO ----------
document.getElementById("btn-entra").addEventListener("click", async () => {
  const nickname = document.getElementById("input-nickname").value.trim();
  const pin = document.getElementById("input-pin").value.trim();
  const errEl = document.getElementById("errore-accesso");
  errEl.hidden = true;

  if (!nickname) { errEl.textContent = "Inserisci il nome della tua squadra."; errEl.hidden = false; return; }
  if (!/^\d{4}$/.test(pin)) { errEl.textContent = "Il PIN deve avere 4 cifre."; errEl.hidden = false; return; }

  let dati;
  try {
    dati = await caricaSquadra(nickname);
  } catch (e) {
    errEl.textContent = "Errore di connessione al salvataggio. Controlla firebase-config.js.";
    errEl.hidden = false;
    return;
  }

  if (dati) {
    if (dati.pin !== pin) {
      errEl.textContent = "PIN non corretto per questa squadra.";
      errEl.hidden = false;
      return;
    }
    stato = dati;
  } else {
    stato = statoVuoto(nickname, pin);
    await salvaSquadra(nickname, stato);
  }
  nickCorrente = nickname;
  entraNellaSquadra();
});

document.getElementById("btn-vedi-lega").addEventListener("click", () => renderLega());
document.getElementById("btn-lega").addEventListener("click", () => renderLega());
document.getElementById("btn-torna-squadra").addEventListener("click", () => {
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
  const righe = stato.rosa.map((p, i) => rigaRosa(p, i)).join("");
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
      I primi 25 giocatori della lista sono i titolari (servono 3 portieri, 8 difensori, 8 centrocampisti, 6 attaccanti).
      Dal 26° in poi sono U21/extra — stipendio e ammortamento si calcolano comunque allo stesso modo.
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
    <td><input class="r-quota cifra" type="number" step="0.1" value="${p.quotaStagione ?? 1}" /></td>
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
  const righeGiocatori = (stato.prestitiGiocatori || []).map((p, i) => rigaPrestitoGiocatore(p, i)).join("");

  return `
  <div class="sezione">
    <h3>Prestiti bancari</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">
      Tassi: 1 anno 10% (15% per risanare un rosso) · 2 anni 25% (35%) · 3 anni 40% (50%).
      Spunta "incassato quest'anno" solo per i prestiti nuovi di questa stagione.
    </p>
    <div class="tabella-scroll">
      <table class="tabella-rosa">
        <thead><tr><th>Descrizione</th><th>Capitale</th><th>Anni</th><th>Per risanare</th><th>Incassato quest'anno</th><th></th></tr></thead>
        <tbody id="corpo-prestiti-banca">${righeBanca}</tbody>
      </table>
    </div>
    <button id="btn-agg-prestito-banca" class="btn-piccolo" style="margin-top:10px">+ Aggiungi prestito</button>
  </div>

  <div class="sezione">
    <h3>Prestiti giocatori tra squadre</h3>
    <p style="font-size:12px;color:var(--gesso-ombra)">
      Se lo prendi IN ENTRATA non aggiungerlo in Rosa con un costo vero (o mettilo a 0): il vero impatto lo scrivi qui.
    </p>
    <div class="tabella-scroll">
      <table class="tabella-rosa">
        <thead><tr><th>Nome</th><th>Controparte</th><th>Direzione</th><th>Tipo</th><th>Impatto operaz.</th><th>Stipendio a carico</th><th></th></tr></thead>
        <tbody id="corpo-prestiti-giocatori">${righeGiocatori}</tbody>
      </table>
    </div>
    <button id="btn-agg-prestito-giocatore" class="btn-piccolo" style="margin-top:10px">+ Aggiungi prestito giocatore</button>
  </div>`;
}

function rigaPrestitoBancario(p, i) {
  return `<tr data-i="${i}">
    <td><input class="pb-descr" type="text" value="${p.descrizione || ""}" /></td>
    <td><input class="pb-capitale cifra" type="number" value="${p.capitale || 0}" /></td>
    <td><select class="pb-anni"><option value="1" ${p.anni===1?"selected":""}>1</option><option value="2" ${p.anni===2?"selected":""}>2</option><option value="3" ${p.anni===3?"selected":""}>3</option></select></td>
    <td><input class="pb-risanare" type="checkbox" ${p.perRisanare ? "checked" : ""} /></td>
    <td><input class="pb-incassato" type="checkbox" ${p.incassatoQuestAnno ? "checked" : ""} /></td>
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
  </div>`;
}

// ============================================================
// EVENTI per tab (letti/scritti sullo stato + salvataggio)
// ============================================================
function agganciaEventi(tab) {
  const bind = (id, campo, tipo = "text") => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      let v = el.value;
      if (tipo === "number") v = v === "" ? 0 : parseFloat(v);
      if (tipo === "checkbox") v = el.checked;
      stato[campo] = v;
      programmaSalvataggio();
      if (["stagioneCorrente", "stadioIdx", "partiteCasa", "vittorieCasa", "pareggiCasa",
           "bonusCampionatoScorso", "bonusChampionsScorso", "bonusCoppaScorso"].includes(campo)) {
        renderTab(tabAttiva);
      }
    });
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
    const bindSel = (id, campo) => {
      const el = document.getElementById(id);
      el.addEventListener("change", () => {
        stato[campo] = el.value ? parseInt(el.value) || el.value : null;
        programmaSalvataggio();
      });
    };
    bindSel("f-piazz-campionato", "piazzamentoCampionato");
    bindSel("f-piazz-coppa", "piazzamentoCoppa");
    bindSel("f-risultato-champions", "risultatoChampions");
  } else if (tab === "rosa") {
    document.getElementById("btn-agg-giocatore").addEventListener("click", () => {
      stato.rosa.push({ ruolo: "P", nome: "", costo: 0, annoInizio: stato.stagioneCorrente, annoFine: stato.stagioneCorrente, quotaStagione: 1, rinnovi: 0 });
      programmaSalvataggio();
      renderTab("rosa");
    });
    document.querySelectorAll("#corpo-tabella-rosa tr").forEach(tr => {
      const i = parseInt(tr.dataset.i);
      const campo = (cls, key, tipo) => {
        const el = tr.querySelector(cls);
        el.addEventListener("input", () => {
          let v = el.value;
          if (tipo === "number") v = v === "" ? 0 : parseFloat(v);
          stato.rosa[i][key] = v;
          programmaSalvataggio();
          renderTab("rosa");
        });
      };
      campo(".r-ruolo", "ruolo");
      campo(".r-nome", "nome");
      campo(".r-costo", "costo", "number");
      campo(".r-anno-inizio", "annoInizio", "number");
      campo(".r-anno-fine", "annoFine", "number");
      campo(".r-quota", "quotaStagione", "number");
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
    document.querySelectorAll("#corpo-cessioni tr").forEach(tr => {
      const i = parseInt(tr.dataset.i);
      const c = (cls, key, tipo) => {
        const el = tr.querySelector(cls);
        el.addEventListener("input", () => {
          stato.cessioni[i][key] = tipo === "number" ? (parseFloat(el.value) || 0) : el.value;
          programmaSalvataggio(); renderTab("mercato");
        });
      };
      c(".c-nome", "nomeGiocatore"); c(".c-prezzo", "prezzoCessione", "number");
      tr.querySelector(".c-rimuovi").addEventListener("click", () => {
        stato.cessioni.splice(i, 1); programmaSalvataggio(); renderTab("mercato");
      });
    });
    document.querySelectorAll("#corpo-svincoli tr").forEach(tr => {
      const i = parseInt(tr.dataset.i);
      const c = (cls, key, tipo) => {
        const el = tr.querySelector(cls);
        el.addEventListener(tipo === "select" ? "change" : "input", () => {
          stato.svincoli[i][key] = tipo === "number" ? (parseFloat(el.value) || 0) : el.value;
          programmaSalvataggio(); renderTab("mercato");
        });
      };
      c(".s-nome", "nomeGiocatore"); c(".s-motivo", "motivo", "select"); c(".s-indennizzo", "indennizzo", "number");
      tr.querySelector(".s-rimuovi").addEventListener("click", () => {
        stato.svincoli.splice(i, 1); programmaSalvataggio(); renderTab("mercato");
      });
    });
    document.querySelectorAll("#corpo-acquisti tr").forEach(tr => {
      const i = parseInt(tr.dataset.i);
      const c = (cls, key, tipo) => {
        const el = tr.querySelector(cls);
        el.addEventListener("input", () => {
          stato.acquistiFuoriAsta[i][key] = tipo === "number" ? (parseFloat(el.value) || 0) : el.value;
          programmaSalvataggio();
        });
      };
      c(".a-nome", "nome"); c(".a-da", "compratoDa"); c(".a-prezzo", "prezzo", "number");
      tr.querySelector(".a-rimuovi").addEventListener("click", () => {
        stato.acquistiFuoriAsta.splice(i, 1); programmaSalvataggio(); renderTab("mercato");
      });
    });
  } else if (tab === "prestiti") {
    document.getElementById("btn-agg-prestito-banca").addEventListener("click", () => {
      stato.prestitiBancari = stato.prestitiBancari || [];
      stato.prestitiBancari.push({ descrizione: "", capitale: 0, anni: 1, perRisanare: false, incassatoQuestAnno: true });
      programmaSalvataggio(); renderTab("prestiti");
    });
    document.getElementById("btn-agg-prestito-giocatore").addEventListener("click", () => {
      stato.prestitiGiocatori = stato.prestitiGiocatori || [];
      stato.prestitiGiocatori.push({ nome: "", controparte: "", direzione: "In entrata", tipo: "Diritto di riscatto", impattoOperazione: 0, stipendioACarico: 0 });
      programmaSalvataggio(); renderTab("prestiti");
    });
    document.querySelectorAll("#corpo-prestiti-banca tr").forEach(tr => {
      const i = parseInt(tr.dataset.i);
      const c = (cls, key, tipo) => {
        const el = tr.querySelector(cls);
        const evento = (tipo === "number" || tipo === "text") ? "input" : "change";
        el.addEventListener(evento, () => {
          let v = el.value;
          if (tipo === "number") v = parseFloat(v) || 0;
          if (tipo === "int") v = parseInt(v) || 1;
          if (tipo === "checkbox") v = el.checked;
          stato.prestitiBancari[i][key] = v;
          programmaSalvataggio();
        });
      };
      c(".pb-descr", "descrizione"); c(".pb-capitale", "capitale", "number"); c(".pb-anni", "anni", "int");
      c(".pb-risanare", "perRisanare", "checkbox"); c(".pb-incassato", "incassatoQuestAnno", "checkbox");
      tr.querySelector(".pb-rimuovi").addEventListener("click", () => {
        stato.prestitiBancari.splice(i, 1); programmaSalvataggio(); renderTab("prestiti");
      });
    });
    document.querySelectorAll("#corpo-prestiti-giocatori tr").forEach(tr => {
      const i = parseInt(tr.dataset.i);
      const c = (cls, key, tipo) => {
        const el = tr.querySelector(cls);
        el.addEventListener(tipo === "select" ? "change" : "input", () => {
          stato.prestitiGiocatori[i][key] = tipo === "number" ? (parseFloat(el.value) || 0) : el.value;
          programmaSalvataggio();
        });
      };
      c(".pg-nome", "nome"); c(".pg-controparte", "controparte"); c(".pg-direzione", "direzione", "select");
      c(".pg-tipo", "tipo", "select"); c(".pg-impatto", "impattoOperazione", "number"); c(".pg-stipendio", "stipendioACarico", "number");
      tr.querySelector(".pg-rimuovi").addEventListener("click", () => {
        stato.prestitiGiocatori.splice(i, 1); programmaSalvataggio(); renderTab("prestiti");
      });
    });
  } else if (tab === "bilancio") {
    bind("f-aumenti-capitale", "aumentiCapitale", "number");
    bind("f-costi-vari", "costiVari", "number");
    bind("f-multe", "multe", "number");
    document.getElementById("f-aumenti-capitale").addEventListener("input", () => renderTab("bilancio"));
    document.getElementById("f-costi-vari").addEventListener("input", () => renderTab("bilancio"));
    document.getElementById("f-multe").addEventListener("input", () => renderTab("bilancio"));
  }
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
    el.innerHTML = "<p>Errore di connessione al salvataggio. Controlla firebase-config.js.</p>";
    return;
  }
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
