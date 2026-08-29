# Fantacalcio Manageriale

Motore centrale del gioco (Anagrafica, Rosa con calcolo automatico di
stipendio/ammortamento/valore residuo, Stadio a 4 livelli con investimento,
Sponsor+Premio+bonus, Coppa, Champions, Conto Economico completo) **completo
di tutto**: Cessioni/Svincoli con lookup automatico dalla Rosa, Prestiti bancari,
Prestiti giocatori, Acquisti fuori asta — più un registro di lega che mostra
tutte le squadre.

## 1. Crea un progetto Firebase gratuito (5 minuti)

1. Vai su https://console.firebase.google.com e accedi con un account Google.
2. "Aggiungi progetto" → dagli un nome (es. "fantacalcio-manageriale") → crealo (puoi disattivare Google Analytics, non serve).
3. Nel menu a sinistra, apri **Build → Firestore Database** → "Crea database" → scegli **modalità di produzione** → scegli una zona (una europea va bene) → Avanti.
4. Vai su **Firestore Database → Regole** e incolla questo (permette lettura/scrittura a chiunque abbia il link — va bene per un gruppo di 8 amici, non per un sito pubblico):
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /squadre/{doc} {
         allow read, write: if true;
       }
     }
   }
   ```
   Premi **Pubblica**.
5. Torna alla pagina principale del progetto → icona ⚙️ (Impostazioni progetto) → scorri fino a "Le tue app" → clicca l'icona **</>** (Web) → dagli un nome → "Registra app".
6. Ti mostra un blocco `firebaseConfig = {...}` — copia SOLO quella parte.

## 2. Incolla le chiavi nel progetto

1. Nella cartella `js/`, fai una copia di `firebase-config.example.js` e chiamala `firebase-config.js`.
2. Incolla dentro i valori che hai copiato al punto 6 sopra, al posto di `"INCOLLA_QUI"`.

## 3. Prova in locale (facoltativo, prima di pubblicare)

Serve un piccolo server locale perché i moduli JS non funzionano aprendo il file direttamente:
```
cd cartella-del-progetto
python3 -m http.server 8000
```
Poi apri http://localhost:8000 nel browser.

## 4. Pubblica gratis su GitHub Pages

1. Crea un account GitHub (gratis) se non ce l'hai già, e crea un nuovo repository (es. "fantacalcio-manageriale").
2. Carica dentro tutti i file di questa cartella (incluso il tuo `firebase-config.js`, che ora contiene le tue chiavi — vedi nota di sicurezza sotto).
3. Nel repository: **Settings → Pages → Source** → scegli il branch `main` e la cartella `/ (root)` → Salva.
4. Dopo un minuto, GitHub ti mostra un link tipo `https://tuonome.github.io/fantacalcio-manageriale/` — quello è il sito vero, condividilo con gli altri 7.

**Nota di sicurezza**: le regole del punto 1.4 permettono a chiunque abbia il link di leggere/scrivere i dati — va bene per un gruppo di amici che si fida, ma non usarle per un progetto con dati sensibili o aperto al pubblico.

## 5. Come funziona l'accesso

Non è un vero login: chiunque scriva lo stesso nome squadra + PIN vede/modifica quella scheda.
È pensato per un gruppo di amici, non per resistere a chi vuole entrare senza permesso.

**Le squadre NON si creano più da sole al primo accesso.** Se qualcuno scrive un nome che
non esiste, il sito ora dà errore ("Squadra non trovata") invece di crearne una nuova per sbaglio.

### Area Presidente — crei tu le 8 squadre

Nella schermata di accesso, scrivi come nome squadra **PRESIDENTE** (maiuscolo o minuscolo,
non importa) e scegli un PIN a piacere — la prima volta che lo fai, quel PIN diventa il tuo
PIN da presidente per sempre (nessun altro lo conosce). Da lì puoi:
- **Creare le 8 squadre**: scegli tu nickname e PIN per ognuna, poi li comunichi ai tuoi amici.
- **Aprire i dati di qualunque squadra** senza bisogno di conoscerne il PIN — utile per controllare
  o correggere qualcosa.

## Struttura dei file

```
index.html                     — pagina unica (accesso, squadra, lega)
style.css                      — aspetto grafico
js/calc.js                     — tutte le formule (identiche all'Excel)
js/storage.js                  — salvataggio su Firebase
js/firebase-config.js          — le tue chiavi (da creare, vedi punto 2)
js/firebase-config.example.js  — modello da copiare
js/app.js                      — logica dell'interfaccia
```
