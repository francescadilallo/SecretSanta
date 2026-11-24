# Secret Santa 🎅

Web app (PWA) per il Secret Santa: sorteggio segreto e liste dei desideri. In italiano, pensata per iPhone.
Gira **gratis** su Cloudflare (Workers + database D1): niente server da gestire.

## Funzioni
- Gruppo con link d'invito; ogni persona entra con nome + PIN (nessun account).
- Sorteggio fatto dal server: **nessuno vede gli abbinamenti, nemmeno l'organizzatore**. Nessuno pesca chi lo ha pescato, con esclusioni (es. coppie).
- Lista desideri: incolli il link di un prodotto (Amazon o qualsiasi negozio) e l'app legge titolo, immagine e prezzo. Scorciatoie di ricerca su Amazon, Google Shopping, eBay, Zalando, IBS.
- Chi ti ha pescato vede la tua lista e può segnare "lo prendo io" (tu non lo vedi).
- Installabile su iPhone: Safari → Condividi → Aggiungi a Home.

## Mettere online (gratis, ~5 minuti, una volta sola)
1. Crea un account gratuito su <https://dash.cloudflare.com/sign-up>.
2. Dashboard → **Workers & Pages** → **Create** → **Import a repository** (collega GitHub e scegli questa repo, branch `main`).
   Lascia "Build command" vuoto e come "Deploy command" `npx wrangler deploy`.
   Cloudflare crea da solo il database D1 e le tabelle; l'indirizzo sarà `https://secret-santa.<tuo-nome>.workers.dev`.
3. Ogni push su `main` ripubblica l'app.

Alternativa con GitHub Actions (`.github/workflows/deploy.yml`): aggiungi nei Secrets della repo
`CLOUDFLARE_API_TOKEN` (modello "Edit Cloudflare Workers") e `CLOUDFLARE_ACCOUNT_ID`.

Da terminale: `npx wrangler login && npm run deploy`.

## Sviluppo
Richiede Node >= 22.

    npm install
    npm run dev      # http://localhost:8787 (Worker + D1 in locale)
    npm test         # unitari + integrazione sul runtime Workers locale

## Note
- Piano gratuito Cloudflare: 100.000 richieste/giorno e 5 GB di D1, molto oltre quanto serve per un gruppo di amici.
- Amazon non ha un'API di ricerca aperta (serve un account affiliato con vendite qualificate), quindi la lista parte dal link:
  il Worker legge Open Graph / JSON-LD; per Amazon, se la pagina blocca i bot, ricostruisce titolo e immagine dall'ASIN.
  La ricerca integrata sarebbe un'estensione con la Product Advertising API.
