import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawNames } from '../server/draw.js';

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
