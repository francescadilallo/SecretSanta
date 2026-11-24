# Secret Santa 🎅

Web app (PWA) per il Secret Santa: sorteggio segreto e liste dei desideri. In italiano, pensata per iPhone.

## Funzioni
- Gruppo con link d'invito; ogni persona entra con nome + PIN (nessun account).
- Sorteggio fatto dal server: **nessuno vede gli abbinamenti, nemmeno l'organizzatore**. Ciclo unico (nessuno pesca chi lo ha pescato), con esclusioni (es. coppie).
- Lista desideri: incolli il link di un prodotto (Amazon o qualsiasi negozio) e l'app legge titolo, immagine e prezzo. Scorciatoie di ricerca su Amazon, Google Shopping, eBay, Zalando, IBS.
- Chi ti ha pescato vede la tua lista e può segnare "lo prendo io" (tu non lo vedi).
- Installabile su iPhone: Safari → Condividi → Aggiungi a Home.

## Sviluppo
Richiede Node >= 22.13 (SQLite integrato, zero dipendenze).

    npm start        # http://localhost:3000
    npm test

Variabili: `PORT`, `DB_FILE` (default `./data/santa.db`).

## Deploy
Un solo container con un volume per il database SQLite (`/data`). Con Fly.io: vedi `fly.toml`.
Va bene qualsiasi host che esegua il `Dockerfile` e abbia un disco persistente.

## Note sulla lista desideri
Amazon non offre un'API di ricerca aperta (serve un account affiliato con vendite qualificate), quindi si parte dal link:
il server legge Open Graph / JSON-LD; per Amazon, se la pagina blocca i bot, ricostruisce titolo e immagine dall'ASIN.
La ricerca integrata (come DrawNames) è un'estensione possibile con la Product Advertising API.
