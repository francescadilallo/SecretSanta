// Random uniforme senza bias, portabile (Workers e Node).
// I numeri casuali vengono presi a blocchi: una chiamata a crypto per ogni numero costerebbe troppo.
const pool = new Uint32Array(512);
let poolPos = pool.length;
function nextRandom() {
  if (poolPos === pool.length) { crypto.getRandomValues(pool); poolPos = 0; }
  return pool[poolPos++];
}
function randomInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  let v;
  do { v = nextRandom(); } while (v >= limit);
  return v % n;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Passi massimi per cercare un ciclo unico: basta e avanza quando esiste, e tiene
// il costo basso (i Workers gratuiti hanno pochi millisecondi di CPU a richiesta).
const CYCLE_BUDGET = 1500;
const MATCHING_ATTEMPTS = 40;

/** Accoppiamento perfetto giver -> receiver con ordine casuale (algoritmo di Kuhn). null se non esiste. */
function randomMatching(adj, n) {
  const lists = adj.map(shuffle);
  const giverOf = new Array(n).fill(-1);
  const augment = (u, seen) => {
    for (const v of lists[u]) {
      if (seen[v]) continue;
      seen[v] = 1;
      if (giverOf[v] === -1 || augment(giverOf[v], seen)) { giverOf[v] = u; return true; }
    }
    return false;
  };
  for (const u of shuffle([...Array(n).keys()])) {
    if (!augment(u, new Uint8Array(n))) return null; // Kuhn è esatto: se fallisce, non esiste alcuna soluzione
  }
  const gives = new Array(n);
  giverOf.forEach((u, v) => { gives[u] = v; });
  return gives;
}

/**
 * Sorteggio Secret Santa.
 * @param {number[]} ids        partecipanti
 * @param {Array<[number,number]>} exclusions coppie che non possono pescarsi (in entrambe le direzioni)
 * @returns {Map<number, number>|null} giver -> receiver, oppure null se impossibile
 */
export function drawNames(ids, exclusions = []) {
  const n = ids.length;
  if (n < 2) return null;

  const index = new Map(ids.map((id, i) => [id, i]));
  const ok = Array.from({ length: n }, () => new Array(n).fill(true));
  for (let i = 0; i < n; i++) ok[i][i] = false;
  for (const [a, b] of exclusions) {
    const i = index.get(a), j = index.get(b);
    if (i === undefined || j === undefined) continue;
    ok[i][j] = ok[j][i] = false;
  }
  const adj = ok.map((row) => row.flatMap((v, j) => (v ? [j] : [])));
  if (adj.some((l) => l.length === 0)) return null; // qualcuno non può pescare nessuno

  const toMap = (gives) => new Map(gives.map((r, g) => [ids[g], ids[r]]));

  // 1) Preferisci un ciclo unico (A→B→C→A): nessuno pesca chi lo ha pescato
  if (n > 2) {
    const path = [randomInt(n)];
    const used = new Uint8Array(n);
    used[path[0]] = 1;
    let steps = 0;
    const dfs = () => {
      if (++steps > CYCLE_BUDGET) return false;
      const last = path[path.length - 1];
      if (path.length === n) return ok[last][path[0]];
      for (const c of shuffle(adj[last])) {
        if (used[c]) continue;
        used[c] = 1; path.push(c);
        if (dfs()) return true;
        path.pop(); used[c] = 0;
      }
      return false;
    };
    if (dfs()) {
      const gives = new Array(n);
      for (let i = 0; i < n; i++) gives[path[i]] = path[(i + 1) % n];
      return toMap(gives);
    }
  }

  // 2) Altrimenti una permutazione valida, preferendo senza coppie reciproche
  let fallback = null;
  for (let attempt = 0; attempt < MATCHING_ATTEMPTS; attempt++) {
    const gives = randomMatching(adj, n);
    if (!gives) return null; // nessuna soluzione possibile
    if (n === 2 || gives.every((r, g) => gives[r] !== g)) return toMap(gives);
    fallback = gives;
  }
  return fallback ? toMap(fallback) : null;
}
