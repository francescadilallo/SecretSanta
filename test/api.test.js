import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';

async function setup() {
  const { server } = createApp({ dbFile: ':memory:' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { server, call };
}

test('flusso completo: gruppo, sorteggio segreto, lista desideri, prenotazione', async () => {
  const { server, call } = await setup();
  try {
    const c = await call('POST', '/api/groups', { name: 'Natale', adminName: 'Anna', pin: '1234', budget: '20 €' });
    assert.equal(c.status, 200);
    const code = c.data.code;
    const tokens = { Anna: c.data.token };
    for (const n of ['Bruno', 'Carla', 'Dino', 'Elena']) {
      const r = await call('POST', `/api/groups/${code}/enter`, { name: n, pin: '1111' });
      assert.equal(r.status, 200);
      tokens[n] = r.data.token;
    }
    // pin sbagliato
    assert.equal((await call('POST', `/api/groups/${code}/enter`, { name: 'Bruno', pin: '9999' })).status, 401);
    // login ripetuto: la sessione precedente resta valida
    const again = await call('POST', `/api/groups/${code}/enter`, { name: 'Bruno', pin: '1111' });
    assert.equal((await call('GET', `/api/groups/${code}/me`, null, tokens.Bruno)).status, 200);
    assert.equal((await call('GET', `/api/groups/${code}/me`, null, again.data.token)).status, 200);

    // non admin non può sorteggiare
    assert.equal((await call('POST', `/api/groups/${code}/draw`, {}, tokens.Bruno)).status, 403);
    // prima del sorteggio non c'è giftee
    assert.equal((await call('GET', `/api/groups/${code}/giftee`, null, tokens.Bruno)).status, 400);

    // desideri
    for (const n of Object.keys(tokens)) {
      const w = await call('POST', `/api/groups/${code}/wishes`, { title: `Regalo di ${n}`, url: 'https://example.com/x' }, tokens[n]);
      assert.equal(w.status, 200);
    }
    assert.equal((await call('POST', `/api/groups/${code}/wishes`, { title: 'x', url: 'javascript:alert(1)' }, tokens.Anna)).status, 400);

    const d = await call('POST', `/api/groups/${code}/draw`, {}, tokens.Anna);
    assert.equal(d.status, 200);
    assert.deepEqual(d.data, { ok: true }); // l'organizzatore non vede nulla

    const me = await call('GET', `/api/groups/${code}/me`, null, tokens.Anna);
    assert.equal(JSON.stringify(me.data).includes('gives_to'), false);

    // ognuno ha un giftee diverso da sé e tutti coperti
    const received = new Set();
    for (const n of Object.keys(tokens)) {
      const g = await call('GET', `/api/groups/${code}/giftee`, null, tokens[n]);
      assert.equal(g.status, 200);
      assert.notEqual(g.data.name, n);
      received.add(g.data.name);
      assert.equal(g.data.wishes.length, 1);
      assert.equal(g.data.wishes[0].title, `Regalo di ${g.data.name}`);
    }
    assert.equal(received.size, 5);

    // prenotazione: solo chi ha il giftee, e il proprietario non vede lo stato
    const g = await call('GET', `/api/groups/${code}/giftee`, null, tokens.Carla);
    const wid = g.data.wishes[0].id;
    const r = await call('POST', `/api/groups/${code}/wishes/${wid}/reserve`, {}, tokens.Carla);
    assert.equal(r.data.reserved, true);
    const owner = g.data.name;
    const ownList = await call('GET', `/api/groups/${code}/wishes`, null, tokens[owner]);
    assert.equal('reserved' in ownList.data[0], false);
    const other = Object.keys(tokens).find((n) => n !== 'Carla' && n !== owner);
    assert.equal((await call('POST', `/api/groups/${code}/wishes/${wid}/reserve`, {}, tokens[other])).status, 403);

    // dopo il sorteggio non ci si può più unire
    assert.equal((await call('POST', `/api/groups/${code}/enter`, { name: 'Nuovo', pin: '1234' })).status, 400);
    assert.equal((await call('POST', `/api/groups/${code}/draw`, {}, tokens.Anna)).status, 400);
  } finally { server.close(); }
});

test('servono almeno 3 persone e le esclusioni impossibili danno errore', async () => {
  const { server, call } = await setup();
  try {
    const c = await call('POST', '/api/groups', { name: 'Gruppo', adminName: 'Anna', pin: '1234' });
    const code = c.data.code;
    assert.equal((await call('POST', `/api/groups/${code}/draw`, {}, c.data.token)).status, 400);
    const b = await call('POST', `/api/groups/${code}/enter`, { name: 'Bruno', pin: '1234' });
    const x = await call('POST', `/api/groups/${code}/enter`, { name: 'Carla', pin: '1234' });
    const me = await call('GET', `/api/groups/${code}/me`, null, c.data.token);
    const [a, bb, cc] = me.data.members.map((m) => m.id);
    await call('PUT', `/api/groups/${code}/exclusions`, { pairs: [[a, bb], [a, cc]] }, c.data.token);
    const d = await call('POST', `/api/groups/${code}/draw`, {}, c.data.token);
    assert.equal(d.status, 400);
    assert.match(d.data.error, /esclusioni/);
  } finally { server.close(); }
});
