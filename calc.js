// ============================================================
// MOTORE DI CALCOLO — Fantacalcio Manageriale
// Replica esatta delle formule del foglio Excel di riferimento.
// Tutte le cifre sono in milioni. Nessuna conversione di valuta.
// ============================================================

export const STADI = [
  { nome: "20 mila posti",  costo: 50,  sconfitta: 2.632, pareggio: 4.00,  vittoria: 5.91,  investimento: null },
  { nome: "50 mila posti",  costo: 100, sconfitta: 7.11,  pareggio: 8.11,  vittoria: 9.75,  investimento: 100 },
  { nome: "80 mila posti",  costo: 150, sconfitta: 11.72, pareggio: 12.72, vittoria: 13.81, investimento: 150 },
  { nome: "100 mila posti", costo: 200, sconfitta: 16.60, pareggio: 17.60, vittoria: 18.14, investimento: 200 },
];

export const PREMIO_CAMPIONATO = [100, 95, 92.5, 90, 87.5, 85, 82.5, 80]; // indice 0 = 1° posto
export const PREMIO_COPPA      = [25, 20, 17.5, 15, 12.5, 10, 7.5, 5];
export const PREMIO_CHAMPIONS  = {
  "Non raggiunta": 35, "4° posto": 40, "3° posto": 40, "2° posto": 45, "1° posto": 50,
};
export const SANZIONI = [
  { da: 1,   a: 190,     punti: -3,  rosa: 25 },
  { da: 200, a: 490,     punti: -10, rosa: 23 },
  { da: 500, a: Infinity, punti: -15, rosa: 21 },
];

// --- Fasce stipendio / ammortamento (Cap. 5 e 12) ---
export function fasciaStipendio(costo) {
  if (costo <= 19) return 3;
  if (costo <= 59) return 6;
  return 10;
}
export function fasciaPercAmmortamento(costo) {
  if (costo <= 19) return 1.0;
  if (costo <= 59) return 0.6;
  return 0.4;
}

// --- Rosa: un giocatore ---
// player = { ruolo, nome, costo, annoInizio, annoFine, quotaStagione, rinnovi }
export function anniRimanenti(player, stagioneCorrente) {
  return Math.max(0, player.annoFine - stagioneCorrente);
}
export function stipendio(player) {
  if (!player.costo) return 0;
  const quota = player.quotaStagione ?? 1;
  return fasciaStipendio(player.costo) * Math.pow(1.1, player.rinnovi || 0) * quota;
}
export function ammortamentoAnnuo(player, stagioneCorrente) {
  if (!player.costo) return 0;
  if (stagioneCorrente > player.annoFine) return 0;
  const anni = player.annoFine - player.annoInizio + 1;
  if (anni <= 0) return 0;
  const quota = player.quotaStagione ?? 1;
  return (player.costo * fasciaPercAmmortamento(player.costo) / anni) * quota;
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
export function costoInvestimentoStadio(stadioIdx, investitoQuestAnno) {
  if (!investitoQuestAnno) return 0;
  return STADI[stadioIdx].investimento || 0;
}

// --- Sponsor (fisso + bonus su risultati stagione scorsa) ---
export function ricavoSponsor(bonusCampionato, bonusChampions, bonusCoppa) {
  const moltiplicatore = 1 + (bonusCampionato ? 0.05 : 0) + (bonusChampions ? 0.03 : 0) + (bonusCoppa ? 0.02 : 0);
  return 100 * moltiplicatore;
}

// --- Sanzioni bilancio in rosso ---
export function sanzionePer(perditaAssoluta) {
  for (const s of SANZIONI) if (perditaAssoluta >= s.da && perditaAssoluta <= s.a) return s;
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
export function calcolaContoEconomico(stato) {
  const stagioneCorrente = stato.stagioneCorrente;
  const players = stato.rosa || [];
  const { stipendi, ammortamenti } = totaliRosa(players, stagioneCorrente);

  const ricSponsor = ricavoSponsor(stato.bonusCampionatoScorso, stato.bonusChampionsScorso, stato.bonusCoppaScorso);
  const ricPremio = stato.piazzamentoCampionato ? PREMIO_CAMPIONATO[stato.piazzamentoCampionato - 1] : 0;
  const ricCoppa = stato.piazzamentoCoppa ? PREMIO_COPPA[stato.piazzamentoCoppa - 1] : 0;
  const ricChampions = stato.risultatoChampions ? (PREMIO_CHAMPIONS[stato.risultatoChampions] || 0) : 0;
  const ricStadio = ricavoStadio(stato.stadioIdx, stato.partiteCasa, stato.vittorieCasa, stato.pareggiCasa);
  const ricVenditeCalciatori = (stato.cessioni || []).reduce((s, c) => s + (c.prezzoCessione || 0), 0);
  const ricPrestitoBancario = (stato.prestitiBancari || []).filter(p => p.incassatoQuestAnno).reduce((s, p) => s + (p.capitale || 0), 0);
  const ricPrestitiGiocatori = (stato.prestitiGiocatori || []).reduce((s, p) => s + (p.impattoOperazione || 0) + (p.stipendioACarico || 0), 0);

  const totRicavi = (stato.aumentiCapitale || 0) + ricVenditeCalciatori + ricSponsor + ricPremio + ricCoppa + ricChampions
    + ricStadio + ricPrestitoBancario + ricPrestitiGiocatori;

  const costoStadio = STADI[stato.stadioIdx].costo;
  const investimentoStadio = costoInvestimentoStadio(stato.stadioIdx, stato.investitoQuestAnno);
  const rataPrestitoBancario = (stato.prestitiBancari || []).reduce((s, p) => {
    if (!p.capitale || !p.anni) return s;
    const tasso = p.perRisanare ? tassoRisanamento(p.anni) : tassoNormale(p.anni);
    const totale = p.capitale * (1 + tasso);
    return s + totale / p.anni;
  }, 0);

  const totCosti = stipendi + ammortamenti + costoStadio + investimentoStadio + rataPrestitoBancario
    + (stato.costiVari || 0) + (stato.multe || 0);

  const risultatoAnte = totRicavi - totCosti;
  const plusvalenze = (stato.cessioni || []).reduce((s, c) => s + Math.max(0, (c.prezzoCessione || 0) - valoreResiduoCessione(stato, c)), 0)
    + (stato.svincoli || []).reduce((s, sv) => s + Math.max(0, (sv.indennizzo || 0) - valoreResiduoCessione(stato, sv)), 0);
  const minusvalenze = (stato.cessioni || []).reduce((s, c) => s + Math.max(0, valoreResiduoCessione(stato, c) - (c.prezzoCessione || 0)), 0)
    + (stato.svincoli || []).reduce((s, sv) => s + Math.max(0, valoreResiduoCessione(stato, sv) - (sv.indennizzo || 0)), 0);

  const chiusura = chiusuraBilancio(risultatoAnte, plusvalenze, minusvalenze);

  const usciteMercato = (stato.capitaleAsta || 0) + (stato.acquistiFuoriAsta || []).reduce((s, a) => s + (a.prezzo || 0), 0);
  const capitaleProvvisorio = (stato.capitaleIniziale || 0) + totRicavi - (totCosti - ammortamenti) - usciteMercato;

  return {
    stipendi, ammortamenti, ricSponsor, ricPremio, ricCoppa, ricChampions, ricStadio,
    ricVenditeCalciatori, ricPrestitoBancario, ricPrestitiGiocatori, totRicavi,
    costoStadio, investimentoStadio, rataPrestitoBancario, totCosti,
    risultatoAnte, plusvalenze, minusvalenze, chiusura, capitaleProvvisorio,
  };
}

function valoreResiduoCessione(stato, mov) {
  const player = (stato.rosa || []).find(p => p.nome === mov.nomeGiocatore);
  if (!player) return 0;
  return valoreResiduo(player, stato.stagioneCorrente);
}

export function tassoNormale(anni) {
  return { 1: 0.10, 2: 0.25, 3: 0.40 }[anni] || 0;
}
export function tassoRisanamento(anni) {
  return { 1: 0.15, 2: 0.35, 3: 0.50 }[anni] || 0;
}
