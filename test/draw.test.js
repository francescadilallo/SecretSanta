import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawNames } from '../src/draw.js';

test('nessuno pesca se stesso, tutti ricevono una sola volta', () => {
  for (let run = 0; run < 200; run++) {
    const ids = Array.from({ length: 2 + (run % 29) }, (_, i) => i + 1);
    const m = drawNames(ids);
    assert.ok(m);
    assert.equal(new Set(m.values()).size, ids.length);
    for (const [g, r] of m) assert.notEqual(g, r);
  }
});

test('con 3+ persone nessuna coppia reciproca (ciclo unico)', () => {
  for (let run = 0; run < 100; run++) {
    const m = drawNames([1, 2, 3, 4, 5, 6]);
    for (const [g, r] of m) assert.notEqual(m.get(r), g);
  }
});

test('rispetta le esclusioni in entrambe le direzioni', () => {
  for (let run = 0; run < 200; run++) {
    const m = drawNames([1, 2, 3, 4, 5, 6], [[1, 2], [3, 4]]);
    assert.ok(m);
    assert.notEqual(m.get(1), 2); assert.notEqual(m.get(2), 1);
    assert.notEqual(m.get(3), 4); assert.notEqual(m.get(4), 3);
  }
});

test('esclusioni impossibili => null', () => {
  assert.equal(drawNames([1, 2, 3], [[1, 2], [1, 3]]), null);
  assert.equal(drawNames([1]), null);
});

test('distribuzione non banale: 1 non pesca sempre lo stesso', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(drawNames([1, 2, 3, 4, 5]).get(1));
  assert.ok(seen.size >= 3);
});

// ---- casi limite e prestazioni (i Workers gratuiti hanno ~10 ms di CPU a richiesta)
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
function timed(fn) { const s = performance.now(); const r = fn(); return [r, performance.now() - s]; }

test('impossibile: risposta immediata, anche con 30 persone', () => {
  for (const n of [5, 12, 30, 40]) {
    const [m, ms] = timed(() => drawNames(range(n), range(n).slice(1).map((x) => [1, x])));
    assert.equal(m, null);
    assert.ok(ms < 100, `n=${n}: ${ms.toFixed(0)} ms`);
  }
});

test('risolvibile ma senza ciclo unico: veloce e valido', () => {
  // 1 e 2 possono ricevere solo da 3 (o l\'uno dall\'altro): non esiste un ciclo unico
  const ids = range(20);
  const ex = ids.filter((x) => x > 3).flatMap((x) => [[x, 1], [x, 2]]);
  for (let run = 0; run < 20; run++) {
    const [m, ms] = timed(() => drawNames(ids, ex));
    assert.ok(m, 'soluzione esistente non trovata');
    assert.ok(ms < 100, `${ms.toFixed(0)} ms`);
    assert.equal(new Set(m.values()).size, ids.length);
    for (const [g, r] of m) { assert.notEqual(g, r); }
    for (const x of ids.filter((y) => y > 3)) assert.ok(![1, 2].includes(m.get(x)));
  }
});

test('casi tipici con 30 persone: sotto i 10 ms di mediana', () => {
  const couples = Array.from({ length: 15 }, (_, i) => [2 * i + 1, 2 * i + 2]);
  const times = Array.from({ length: 50 }, () => timed(() => drawNames(range(30), couples))[1]).sort((a, b) => a - b);
  assert.ok(times[25] < 10, `mediana ${times[25].toFixed(1)} ms`);
});

test('proprietà: trova una soluzione se e solo se esiste (confronto con forza bruta)', () => {
  const brute = (n, bad) => {
    const perm = [];
    const used = new Set();
    const go = (i) => {
      if (i === n) return true;
      for (let r = 1; r <= n; r++) {
        if (used.has(r) || r === i + 1 || bad.has(`${i + 1}:${r}`)) continue;
        used.add(r); perm.push(r);
        if (go(i + 1)) return true;
        used.delete(r); perm.pop();
      }
      return false;
    };
    return go(0);
  };
  for (let run = 0; run < 400; run++) {
    const n = 2 + (run % 6);
    const ex = [];
    const bad = new Set();
    for (let k = 0; k < (run % 9); k++) {
      const a = 1 + Math.floor(Math.random() * n), b = 1 + Math.floor(Math.random() * n);
      if (a !== b) { ex.push([a, b]); bad.add(`${a}:${b}`); bad.add(`${b}:${a}`); }
    }
    const m = drawNames(range(n), ex);
    assert.equal(!!m, brute(n, bad), `n=${n} ex=${JSON.stringify(ex)}`);
    if (m) {
      assert.equal(new Set(m.values()).size, n);
      for (const [g, r] of m) { assert.notEqual(g, r); assert.ok(!bad.has(`${g}:${r}`)); }
    }
  }
});
