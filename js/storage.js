// ============================================================
// SALVATAGGIO — Firebase Firestore (piano gratuito)
// Richiede che tu crei un progetto Firebase gratuito e incolli
// le tue chiavi in firebase-config.js — istruzioni nel README.
//
// STRUTTURA: ogni lega è un documento in "leghe/{legaId}" (nome, PIN admin).
// Dentro ogni lega, due sotto-collezioni: "squadre" e "proposte" — separate
// da lega a lega, così più leghe possono convivere senza vedersi tra loro.
// "leghe/__superadmin__" è un documento riservato (solo {pin}) per l'accesso
// del super-admin unico — non è una lega vera, va sempre escluso dagli elenchi.
// ============================================================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, addDoc, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const LEGHE_COLLECTION = "leghe";
const SUPERADMIN_ID = "sistema-superadmin";

// ---------- Leghe ----------
export async function caricaLega(legaId) {
  const ref = doc(db, LEGHE_COLLECTION, legaId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function creaLega(legaId, dati) {
  const ref = doc(db, LEGHE_COLLECTION, legaId);
  await setDoc(ref, dati, { merge: false });
}

// Elenco di tutte le leghe vere (mai il documento riservato del super-admin).
export async function elencoLeghe() {
  const snap = await getDocs(collection(db, LEGHE_COLLECTION));
  const leghe = [];
  snap.forEach((d) => { if (d.id !== SUPERADMIN_ID) leghe.push({ legaId: d.id, ...d.data() }); });
  return leghe;
}

// Elimina una lega per intero: prima tutte le squadre e proposte al suo interno, poi la lega stessa.
export async function eliminaLega(legaId) {
  const squadre = await elencoSquadre(legaId);
  for (const sq of squadre) await eliminaSquadra(legaId, sq.nickname);
  const proposte = await elencoProposte(legaId);
  for (const p of proposte) await eliminaProposta(legaId, p.id);
  await deleteDoc(doc(db, LEGHE_COLLECTION, legaId));
}

// ---------- Super-admin (accesso riservato, unico, sopra tutte le leghe) ----------
export async function caricaSuperAdmin() {
  const ref = doc(db, LEGHE_COLLECTION, SUPERADMIN_ID);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function creaSuperAdmin(pin) {
  const ref = doc(db, LEGHE_COLLECTION, SUPERADMIN_ID);
  await setDoc(ref, { pin }, { merge: false });
}

// ---------- Squadre (dentro una lega) ----------
export async function caricaSquadra(legaId, nickname) {
  const ref = doc(db, LEGHE_COLLECTION, legaId, "squadre", nickname);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function salvaSquadra(legaId, nickname, stato) {
  const ref = doc(db, LEGHE_COLLECTION, legaId, "squadre", nickname);
  await setDoc(ref, stato, { merge: false });
}

export async function elencoSquadre(legaId) {
  const snap = await getDocs(collection(db, LEGHE_COLLECTION, legaId, "squadre"));
  const squadre = [];
  snap.forEach((d) => squadre.push({ nickname: d.id, ...d.data() }));
  return squadre;
}

export async function eliminaSquadra(legaId, nickname) {
  const ref = doc(db, LEGHE_COLLECTION, legaId, "squadre", nickname);
  await deleteDoc(ref);
}

// ---------- Proposte di mercato (dentro una lega) ----------
// Un posto condiviso e neutro DENTRO LA LEGA: nessuna delle due squadre scrive mai nel
// documento dell'altra — ognuna scrive solo qui (una proposta) e poi, quando è confermata
// da entrambi, ognuna applica l'effetto SOLO sul proprio documento (la propria Rosa).
export async function creaProposta(legaId, proposta) {
  const ref = await addDoc(collection(db, LEGHE_COLLECTION, legaId, "proposte"), proposta);
  return ref.id;
}

export async function elencoProposte(legaId) {
  const snap = await getDocs(collection(db, LEGHE_COLLECTION, legaId, "proposte"));
  const proposte = [];
  snap.forEach((d) => proposte.push({ id: d.id, ...d.data() }));
  return proposte;
}

export async function aggiornaProposta(legaId, id, aggiornamenti) {
  const ref = doc(db, LEGHE_COLLECTION, legaId, "proposte", id);
  await updateDoc(ref, aggiornamenti);
}

export async function eliminaProposta(legaId, id) {
  const ref = doc(db, LEGHE_COLLECTION, legaId, "proposte", id);
  await deleteDoc(ref);
}

// ---------- Messaggi di supporto (fuori da ogni lega, arrivano solo al super-admin) ----------
const SUPPORTO_COLLECTION = "supporto";

export async function inviaSupporto(messaggio) {
  const ref = await addDoc(collection(db, SUPPORTO_COLLECTION), messaggio);
  return ref.id;
}

export async function elencoSupporto() {
  const snap = await getDocs(collection(db, SUPPORTO_COLLECTION));
  const messaggi = [];
  snap.forEach((d) => messaggi.push({ id: d.id, ...d.data() }));
  return messaggi;
}

export async function eliminaSupporto(id) {
  const ref = doc(db, SUPPORTO_COLLECTION, id);
  await deleteDoc(ref);
}
