import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDEAS, CATEGORIES } from '../public/ideas.js';

test('catalogo idee: dati coerenti', () => {
  assert.ok(IDEAS.length >= 100);
  assert.equal(new Set(IDEAS.map((i) => i.title)).size, IDEAS.length, 'titoli duplicati');
  for (const i of IDEAS) {
    assert.ok(CATEGORIES.some((c) => c.id === i.cat), `categoria sconosciuta: ${i.title}`);
    assert.ok(i.min > 0 && i.min <= i.max, `prezzo non valido: ${i.title}`);
    assert.ok(i.title.length <= 60);
  }
  for (const c of CATEGORIES) assert.ok(IDEAS.some((i) => i.cat === c.id), `categoria vuota: ${c.id}`);
});
