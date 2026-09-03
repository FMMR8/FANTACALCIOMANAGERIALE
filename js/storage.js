// ============================================================
// SALVATAGGIO — Firebase Firestore (piano gratuito)
// Richiede che tu crei un progetto Firebase gratuito e incolli
// le tue chiavi in firebase-config.js — istruzioni nel README.
// ============================================================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, addDoc, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const TEAMS_COLLECTION = "squadre";
const PROPOSTE_COLLECTION = "proposte";

export async function caricaSquadra(nickname) {
  const ref = doc(db, TEAMS_COLLECTION, nickname);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function salvaSquadra(nickname, stato) {
  const ref = doc(db, TEAMS_COLLECTION, nickname);
  await setDoc(ref, stato, { merge: false });
}

export async function elencoSquadre() {
  const snap = await getDocs(collection(db, TEAMS_COLLECTION));
  const squadre = [];
  snap.forEach((d) => squadre.push({ nickname: d.id, ...d.data() }));
  return squadre;
}

export async function eliminaSquadra(nickname) {
  const ref = doc(db, TEAMS_COLLECTION, nickname);
  await deleteDoc(ref);
}

// ---------- Proposte di mercato (Prestiti/Trasferimenti tra squadre) ----------
// Un posto condiviso e neutro: nessuna delle due squadre scrive mai nel documento
// dell'altra — ognuna scrive solo qui (una proposta) e poi, quando è confermata da
// entrambi, ognuna applica l'effetto SOLO sul proprio documento (la propria Rosa).
export async function creaProposta(proposta) {
  const ref = await addDoc(collection(db, PROPOSTE_COLLECTION), proposta);
  return ref.id;
}

export async function elencoProposte() {
  const snap = await getDocs(collection(db, PROPOSTE_COLLECTION));
  const proposte = [];
  snap.forEach((d) => proposte.push({ id: d.id, ...d.data() }));
  return proposte;
}

export async function aggiornaProposta(id, aggiornamenti) {
  const ref = doc(db, PROPOSTE_COLLECTION, id);
  await updateDoc(ref, aggiornamenti);
}

export async function eliminaProposta(id) {
  const ref = doc(db, PROPOSTE_COLLECTION, id);
  await deleteDoc(ref);
}
