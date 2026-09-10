// ============================================================
// MOTORE DI CALCOLO — Fantacalcio Manageriale
// Replica esatta delle formule del foglio Excel di riferimento.
// Tutte le cifre sono in milioni. Nessuna conversione di valuta.
// ============================================================

export const STADI = [
  { nome: "20 mila posti",  costo: 50,  sconfitta: 2.21,  pareggio: 3.08,  vittoria: 3.95,  investimento: null },
  { nome: "50 mila posti",  costo: 100, sconfitta: 4.95,  pareggio: 6.18,  vittoria: 7.41,  investimento: 100 },
  { nome: "80 mila posti",  costo: 150, sconfitta: 7.68,  pareggio: 9.51,  vittoria: 11.33, investimento: 125 },
  { nome: "100 mila posti", costo: 200, sconfitta: 10.42, pareggio: 13.06, vittoria: 15.69, investimento: 150 },
];

export const PREMIO_CAMPIONATO = [100, 90, 82, 75, 72, 68, 63, 60]; // indice 0 = 1° posto — lega a 8 squadre (riferimento)

// Numero di squadre ammesso in una lega.
// Le partite in casa sono sempre 19, qualunque sia il numero di squadre della lega.
export const PARTITE_CASA = 19;

export const MIN_SQUADRE = 4;
export const MAX_SQUADRE = 20;

// I premi devono valere per leghe di qualunque dimensione, mantenendo lo stesso equilibrio
// costruito sulla lega a 8: primo e ultimo prendono sempre la stessa cifra, e le posizioni in
// mezzo seguono una curva che scende ripida in alto e si appiattisce in basso (come nel calcio
// vero, dove la differenza grossa è tra chi lotta per il titolo e chi sta a metà classifica).
// A 8 squadre si usano i valori calibrati a mano, senza ricalcolarli.
function curvaPremi(nSquadre, primo, ultimo, esponente = 2.2, distaccoMinimo = 0.5) {
  if (nSquadre <= 1) return [primo];
  const valori = Array.from({ length: nSquadre }, (_, i) => {
    const t = i / (nSquadre - 1);
    return primo - (primo - ultimo) * (1 - Math.pow(1 - t, esponente));
  });
  // Dal basso verso l'alto garantisco che due posizioni non prendano mai la stessa cifra.
  valori[nSquadre - 1] = ultimo;
  for (let i = nSquadre - 2; i >= 0; i--) {
    if (valori[i] < valori[i + 1] + distaccoMinimo) valori[i] = valori[i + 1] + distaccoMinimo;
  }
  valori[0] = primo;
  return valori.map(v => Math.round(v * 10) / 10);
}

export function premiCampionato(nSquadre) {
  if (nSquadre === 8) return PREMIO_CAMPIONATO;
  return curvaPremi(nSquadre, 100, 60);
}

export function premiCoppa(nSquadre) {
  if (nSquadre === 8) return PREMIO_COPPA;
  return curvaPremi(nSquadre, 30, 8);
}

// Da 12 squadre in su la Champions ha una fascia in più (i quarti), perché ci sono
// abbastanza squadre da renderla sensata.
export function premiChampions(nSquadre) {
  if (nSquadre >= 12) {
    return { "1° posto": 40, "2° posto": 35, "3°/4° posto": 28, "5°-8° posto": 23, "Gironi": 18 };
  }
  return PREMIO_CHAMPIONS;
}

// Motivo dello svincolo -> quota del Valore residuo che diventa Indennizzo (positiva = la ricevi, negativa = la paghi).
export const MOTIVI_SVINCOLO = {
  "Ritiro": 0.5,
  "Serie B": 1.0,
  "Trasferimento estero": 1.0,
  "Risoluzione consensuale": -1.0,
};
export const PREMIO_COPPA      = [30, 25, 23, 20, 18, 16, 12, 8];
export const PREMIO_CHAMPIONS  = {
  "1° posto": 40, "2° posto": 35, "3°/4° posto": 28, "Gironi": 18,
};
// Fasce continue: "a" è il limite superiore ESCLUSO, così non restano buchi tra una fascia e
// l'altra (una perdita di 20,5 deve rientrare da qualche parte).
export const SANZIONI = [
  { da: 10,  a: 20,       punti: -2 },
  { da: 20,  a: 50,       punti: -3 },
  { da: 50,  a: 100,      punti: -5 },
  { da: 100, a: 150,      punti: -8 },
  { da: 150, a: 200,      punti: -10 },
  { da: 200, a: 300,      punti: -15 },
  { da: 300, a: Infinity, punti: -20 },
];

// --- Fasce stipendio / ammortamento (Cap. 5 e 12) ---
export function fasciaStipendio(costo) {
  if (costo <= 1) return 1;
  if (costo <= 5) return 2;
  if (costo <= 10) return 3;
  if (costo <= 20) return 4;
  if (costo <= 30) return 5;
  if (costo <= 40) return 6;
  if (costo <= 50) return 8;
  if (costo <= 60) return 10;
  if (costo <= 70) return 12;
  if (costo <= 80) return 14;
  if (costo <= 90) return 16;
  if (costo <= 100) return 18;
  if (costo <= 150) return 20;
  return 22;
}

// --- Rosa: un giocatore ---
// player = { ruolo, nome, costo, annoInizio, annoFine, quotaStagione, rinnovi }
export function anniRimanenti(player, stagioneCorrente) {
  return Math.max(0, player.annoFine - stagioneCorrente + 1);
}
export function stipendio(player) {
  if (!player.costo) return 0;
  const quota = player.quotaStagione ?? 1;
  return fasciaStipendio(player.costo) * Math.pow(1.25, player.rinnovi || 0) * quota;
}
export function ammortamentoAnnuo(player, stagioneCorrente) {
  if (!player.costo) return 0;
  if (stagioneCorrente > player.annoFine) return 0;
  const anni = player.annoFine - player.annoInizio + 1;
  if (anni <= 0) return 0;
  // Sempre pieno, MAI scalato dalla quota: è il costo di acquisto che si consuma comunque,
  // a prescindere da quanto lo usi — altrimenti il valore residuo (che non guarda la quota)
  // non tornerebbe mai a 0 in modo coerente con quanto ammortizzato davvero.
  return player.costo / anni;
}
export function valoreResiduo(player, stagioneCorrente) {
  if (!player.costo) return 0;
  const anni = player.annoFine - player.annoInizio + 1;
  if (anni <= 0) return 0;
  const anniConsumati = Math.min(anni, Math.max(0, stagioneCorrente - player.annoInizio + 1));
  return Math.max(0, player.costo - (player.costo / anni) * anniConsumati);
}

export function totaliRosa(players, stagioneCorrente) {
  let costo = 0, stip = 0, amm = 0;
  for (const p of players) {
    costo += p.costo || 0;
    stip += stipendio(p);
    amm += ammortamentoAnnuo(p, stagioneCorrente);
  }
  return { costo, stipendi: stip, ammortamenti: amm };
}

export function composizioneRuoli(players25Titolari) {
  const count = { P: 0, D: 0, C: 0, A: 0 };
  for (const p of players25Titolari) if (count[p.ruolo] !== undefined) count[p.ruolo]++;
  const ok = count.P === 3 && count.D === 8 && count.C === 8 && count.A === 6;
  return { ...count, ok };
}

// --- Stadio ---
export function ricavoStadio(stadioIdx, partiteCasa, vittorie, pareggi) {
  const s = STADI[stadioIdx];
  const sconfitte = Math.max(0, (partiteCasa || 0) - (vittorie || 0) - (pareggi || 0));
  return (vittorie || 0) * s.vittoria + (pareggi || 0) * s.pareggio + sconfitte * s.sconfitta;
}
export function costoInvestimentoStadio(stadioLivelloInSospeso) {
  if (stadioLivelloInSospeso === null || stadioLivelloInSospeso === undefined) return 0;
  return STADI[stadioLivelloInSospeso].investimento || 0;
}

// --- Sponsor (fisso + bonus su risultati stagione scorsa) ---
export function ricavoSponsor(bonusCampionato, bonusChampions, bonusCoppa) {
  const moltiplicatore = 1 + (bonusCampionato ? 0.05 : 0) + (bonusChampions ? 0.03 : 0) + (bonusCoppa ? 0.02 : 0);
  return 100 * moltiplicatore;
}

// --- Sanzioni bilancio in rosso ---
export function sanzionePer(perditaAssoluta) {
  for (const s of SANZIONI) if (perditaAssoluta >= s.da && perditaAssoluta < s.a) return s;
  return null;
}

// --- Chiusura Bilancio (5 casistiche) ---
export function chiusuraBilancio(risultatoAnte, plusvalenze, minusvalenze) {
  const diff = (plusvalenze || 0) - (minusvalenze || 0);
  if (risultatoAnte >= 0) return risultatoAnte + Math.min(diff, 0);
  return Math.min(risultatoAnte + diff, 0);
}

// --- Conto Economico completo per una squadra ---
// stato = tutti i campi della squadra (vedi model.js per la forma esatta)
// Impatto economico di un singolo prestito giocatore: il Costo prestito e lo Stipendio contano sempre subito;
// il Costo riscatto (solo se Diritto) non conta mai qui — conta solo quando confermi il riscatto davvero.
// Il Costo stipendio si scrive sempre come numero positivo (quanto vale il suo stipendio) — è la Direzione
// a decidere se pesa su di te (In entrata, te lo tieni tu) o è un risparmio (In uscita, lo paga l'altra squadra).
export function impattoFissoPrestito(p) {
  const segnoStipendio = p.direzione === "In uscita" ? 1 : -1;
  const stipendioEffettivo = segnoStipendio * Math.abs(p.stipendioACarico || 0) * ((p.quotaPercento ?? 100) / 100);
  return (p.costoPrestito || 0) + stipendioEffettivo;
}
export function impattoPrestitoGiocatore(p) {
  return impattoFissoPrestito(p);
}

export function calcolaContoEconomico(stato) {
  const stagioneCorrente = stato.stagioneCorrente;
  const players = stato.rosa || [];
  const { stipendi, ammortamenti } = totaliRosa(players, stagioneCorrente);

  const ricSponsor = ricavoSponsor(stato.bonusCampionatoScorso, stato.bonusChampionsScorso, stato.bonusCoppaScorso);
  // Il numero di squadre della lega determina la scala dei premi; se manca (leghe create prima
  // di questa funzione) si usa 8, che è la configurazione originale.
  const nSquadre = stato.numeroSquadre || 8;
  const tabellaCampionato = premiCampionato(nSquadre);
  const tabellaCoppa = premiCoppa(nSquadre);
  const ricPremio = stato.piazzamentoCampionato ? (tabellaCampionato[stato.piazzamentoCampionato - 1] || 0) : 0;
  const ricCoppa = stato.piazzamentoCoppa ? (tabellaCoppa[stato.piazzamentoCoppa - 1] || 0) : 0;
  const ricChampions = stato.risultatoChampions ? (premiChampions(nSquadre)[stato.risultatoChampions] || 0) : 0;
  // I ricavi dello stadio entrano in bilancio solo dopo che hai confermato i risultati in casa:
  // prima della conferma il sito conterebbe come sconfitte tutte le partite non ancora inserite,
  // accreditandoti soldi per partite mai giocate.
  const ricStadio = stato.risultatiCasaConfermati
    ? ricavoStadio(stato.stadioIdx, stato.partiteCasa, stato.vittorieCasa, stato.pareggiCasa)
    : 0;
  const ricVenditeCalciatori = (stato.cessioni || []).reduce((s, c) => s + (c.prezzoCessione || 0), 0);
  const ricPrestitoBancario = (stato.prestitiBancari || []).filter(p => p.incassatoQuestAnno).reduce((s, p) => s + (p.capitale || 0), 0);
  const ricPrestitiGiocatori = (stato.prestitiGiocatori || []).reduce((s, p) => s + impattoPrestitoGiocatore(p), 0);
  // Divido il saldo prestiti giocatori in positivo (va tra i Ricavi) e negativo (va tra i Costi) —
  // il numero finale del bilancio resta identico, cambia solo dove lo si vede scritto.
  const ricPrestitiGiocatoriPositivo = Math.max(0, ricPrestitiGiocatori);
  const costoPrestitiGiocatoriNegativo = Math.max(0, -ricPrestitiGiocatori);

  // Bonus prima asta: solo nella primissima stagione, cifra fissa uguale per tutti,
  // così tutti partono con lo stesso budget iniziale a prescindere da quanto spendono davvero.
  const bonusPrimaAsta = stato.primaStagione ? 500 : 0;

  const totRicavi = (stato.aumentiCapitale || 0) + bonusPrimaAsta + ricVenditeCalciatori + ricSponsor + ricPremio + ricCoppa + ricChampions
    + ricStadio + ricPrestitoBancario + ricPrestitiGiocatoriPositivo;

  const costoStadio = STADI[stato.stadioIdx].costo;
  const investimentoStadio = costoInvestimentoStadio(stato.stadioLivelloInSospeso);
  const rataPrestitoBancario = (stato.prestitiBancari || []).reduce((s, p) => {
    if (!p.capitale || !p.anni) return s;
    if (prestitoEstinto(p, stagioneCorrente)) return s; // già ripagato per intero, non pesa più
    const tasso = p.perRisanare ? tassoRisanamento(p.anni) : tassoNormale(p.anni);
    const totale = p.capitale * (1 + tasso);
    return s + totale / p.anni;
  }, 0);

  const totCosti = stipendi + ammortamenti + costoStadio + investimentoStadio + rataPrestitoBancario
    + costoPrestitiGiocatoriNegativo + (stato.costiVari || 0);

  const risultatoAnte = totRicavi - totCosti;
  const plusvalenze = (stato.cessioni || []).reduce((s, c) => s + Math.max(0, (c.prezzoCessione || 0) - valoreResiduoCessione(stato, c)), 0)
    + (stato.svincoli || []).reduce((s, sv) => s + Math.max(0, (sv.indennizzo || 0) - valoreResiduoCessione(stato, sv)), 0);
  const minusvalenze = (stato.cessioni || []).reduce((s, c) => s + Math.max(0, valoreResiduoCessione(stato, c) - (c.prezzoCessione || 0)), 0)
    + (stato.svincoli || []).reduce((s, sv) => s + Math.max(0, valoreResiduoCessione(stato, sv) - (sv.indennizzo || 0)), 0);

  const chiusura = chiusuraBilancio(risultatoAnte, plusvalenze, minusvalenze);

  const usciteMercato = (stato.acquistiAsta || []).reduce((s, a) => s + (a.costo || 0), 0)
    + (stato.acquistiFuoriAsta || []).reduce((s, a) => s + (a.prezzo || 0), 0);
  const capitaleProvvisorio = (stato.capitaleIniziale || 0) + totRicavi - (totCosti - ammortamenti) - usciteMercato;

  // Spesi/incassati sul mercato: flusso di cassa puro (quanto hai pagato o ricevuto), diverso da plus/minusvalenze
  // (che invece confrontano l'incasso col valore residuo). Gli svincoli entrano qui in base al segno dell'indennizzo:
  // positivo = incassato (Ritiro/Serie B/estero), negativo = speso (risoluzione consensuale). I prestiti giocatori
  // contano solo per la quota fissa (costoPrestito, sempre un numero positivo salvato): se lo dai in prestito
  // (In uscita) è incassato, se lo prendi (In entrata) è speso — lo stipendio a carico non c'entra qui.
  const spesoSulMercato = usciteMercato
    + (stato.svincoli || []).reduce((s, sv) => s + Math.max(0, -(sv.indennizzo || 0)), 0)
    + (stato.prestitiGiocatori || []).filter(p => p.direzione === "In entrata").reduce((s, p) => s + (p.costoPrestito || 0), 0);
  const incassatoDalMercato = ricVenditeCalciatori
    + (stato.svincoli || []).reduce((s, sv) => s + Math.max(0, sv.indennizzo || 0), 0)
    + (stato.prestitiGiocatori || []).filter(p => p.direzione === "In uscita").reduce((s, p) => s + (p.costoPrestito || 0), 0);

  return {
    stipendi, ammortamenti, ricSponsor, ricPremio, ricCoppa, ricChampions, ricStadio, bonusPrimaAsta,
    ricVenditeCalciatori, ricPrestitoBancario, ricPrestitiGiocatori, ricPrestitiGiocatoriPositivo, totRicavi,
    costoStadio, investimentoStadio, rataPrestitoBancario, costoPrestitiGiocatoriNegativo, totCosti,
    risultatoAnte, plusvalenze, minusvalenze, chiusura, capitaleProvvisorio,
    spesoSulMercato, incassatoDalMercato,
  };
}

function valoreResiduoCessione(stato, mov) {
  // Se il movimento porta già "fotografato" il valore residuo del momento (caso normale,
  // dato che il giocatore viene tolto dalla Rosa subito dopo cessione/svincolo), uso quello.
  if (mov.valoreResiduoAlMomento !== undefined && mov.valoreResiduoAlMomento !== null) {
    return mov.valoreResiduoAlMomento;
  }
  // Altrimenti (dati vecchi, prima di questa modifica) provo comunque a cercarlo in Rosa.
  const player = (stato.rosa || []).find(p => p.nome === mov.nomeGiocatore);
  if (!player) return 0;
  return valoreResiduo(player, stato.stagioneCorrente);
}

export function tassoNormale(anni) {
  return { 1: 0.10, 2: 0.20, 3: 0.30 }[anni] || 0;
}
export function tassoRisanamento(anni) {
  return { 1: 0.15, 2: 0.30, 3: 0.50 }[anni] || 0;
}
export function anniTrascorsiPrestito(p, stagioneCorrente) {
  const annoErogazione = p.annoErogazione ?? stagioneCorrente;
  return Math.max(0, stagioneCorrente - annoErogazione);
}
export function prestitoEstinto(p, stagioneCorrente) {
  return anniTrascorsiPrestito(p, stagioneCorrente) >= (p.anni || 0);
}
