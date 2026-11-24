// random uniforme senza bias, portabile (Workers e Node)
function randomInt(n) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % n;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  const bad = new Set();
  for (const [a, b] of exclusions) {
    bad.add(`${a}:${b}`);
    bad.add(`${b}:${a}`);
  }
  const ok = (a, b) => a !== b && !bad.has(`${a}:${b}`);

  // 1) Preferisci un ciclo unico: nessuno pesca chi lo ha pescato (con n > 2)
  if (n > 2) {
    const order = shuffle(ids);
    const start = order[0];
    const path = [start];
    const used = new Set([start]);
    let steps = 0;
    const dfs = () => {
      if (++steps > 200000) return false;
      const last = path[path.length - 1];
      if (path.length === n) return ok(last, start);
      for (const c of shuffle(order)) {
        if (used.has(c) || !ok(last, c)) continue;
        used.add(c);
        path.push(c);
        if (dfs()) return true;
        path.pop();
        used.delete(c);
      }
      return false;
    };
    if (dfs()) {
      const map = new Map();
      for (let i = 0; i < n; i++) map.set(path[i], path[(i + 1) % n]);
      return map;
    }
  }

  // 2) Fallback: una qualsiasi permutazione valida
  const givers = shuffle(ids);
  const taken = new Set();
  const map = new Map();
  let steps = 0;
  const dfs2 = (i) => {
    if (++steps > 200000) return false;
    if (i === n) return true;
    const g = givers[i];
    for (const r of shuffle(ids)) {
      if (taken.has(r) || !ok(g, r)) continue;
      taken.add(r);
      map.set(g, r);
      if (dfs2(i + 1)) return true;
      taken.delete(r);
      map.delete(g);
    }
    return false;
  };
  return dfs2(0) ? map : null;
}
