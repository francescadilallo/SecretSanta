// Test d'integrazione: avvia il Worker vero in locale (workerd via wrangler) con D1 temporaneo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PORT = 8799;
const base = `http://127.0.0.1:${PORT}`;
const persist = mkdtempSync(path.join(tmpdir(), 'santa-'));
let proc;

before(async () => {
  proc = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', persist, '--var', 'ALLOW_PRIVATE_PREVIEW:1'], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
  });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    try { if ((await fetch(`${base}/api/groups/XXXXXXXX/public`)).status === 404) return; } catch { /* non ancora pronto */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('wrangler dev non si avvia:\n' + log.slice(-2000));
});
after(() => { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* già chiuso */ } rmSync(persist, { recursive: true, force: true }); });

const call = async (method, p, body, token) => {
  const res = await fetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('flusso completo: gruppo, sorteggio segreto, lista desideri, prenotazione', async () => {
  const c = await call('POST', '/api/groups', { name: 'Natale', adminName: 'Anna', pin: '1234', budget: '20 €' });
  assert.equal(c.status, 200);
  const code = c.data.code;
  const tokens = { Anna: c.data.token };
  for (const n of ['Bruno', 'Carla', 'Dino', 'Elena']) {
    const r = await call('POST', `/api/groups/${code}/enter`, { name: n, pin: '1111' });
    assert.equal(r.status, 200);
    tokens[n] = r.data.token;
  }
  assert.equal((await call('POST', `/api/groups/${code}/enter`, { name: 'Bruno', pin: '9999' })).status, 401);
  const again = await call('POST', `/api/groups/${code}/enter`, { name: 'Bruno', pin: '1111' });
  assert.equal((await call('GET', `/api/groups/${code}/me`, null, tokens.Bruno)).status, 200);
  assert.equal((await call('GET', `/api/groups/${code}/me`, null, again.data.token)).status, 200);

  assert.equal((await call('POST', `/api/groups/${code}/draw`, {}, tokens.Bruno)).status, 403);
  assert.equal((await call('GET', `/api/groups/${code}/giftee`, null, tokens.Bruno)).status, 400);

  for (const n of Object.keys(tokens)) {
    const w = await call('POST', `/api/groups/${code}/wishes`, { title: `Regalo di ${n}`, url: 'https://example.com/x' }, tokens[n]);
    assert.equal(w.status, 200);
  }
  assert.equal((await call('POST', `/api/groups/${code}/wishes`, { title: 'x', url: 'javascript:alert(1)' }, tokens.Anna)).status, 400);

  const d = await call('POST', `/api/groups/${code}/draw`, {}, tokens.Anna);
  assert.equal(d.status, 200);
  assert.deepEqual(d.data, { ok: true });
  const me = await call('GET', `/api/groups/${code}/me`, null, tokens.Anna);
  assert.equal(JSON.stringify(me.data).includes('gives_to'), false);

  const received = new Set();
  for (const n of Object.keys(tokens)) {
    const g = await call('GET', `/api/groups/${code}/giftee`, null, tokens[n]);
    assert.equal(g.status, 200);
    assert.notEqual(g.data.name, n);
    received.add(g.data.name);
    assert.equal(g.data.wishes[0].title, `Regalo di ${g.data.name}`);
  }
  assert.equal(received.size, 5);

  const g = await call('GET', `/api/groups/${code}/giftee`, null, tokens.Carla);
  const wid = g.data.wishes[0].id;
  assert.equal((await call('POST', `/api/groups/${code}/wishes/${wid}/reserve`, {}, tokens.Carla)).data.reserved, true);
  const owner = g.data.name;
  const ownList = await call('GET', `/api/groups/${code}/wishes`, null, tokens[owner]);
  assert.equal('reserved' in ownList.data[0], false);
  const other = Object.keys(tokens).find((n) => n !== 'Carla' && n !== owner);
  assert.equal((await call('POST', `/api/groups/${code}/wishes/${wid}/reserve`, {}, tokens[other])).status, 403);

  assert.equal((await call('POST', `/api/groups/${code}/enter`, { name: 'Nuovo', pin: '1234' })).status, 400);
  assert.equal((await call('POST', `/api/groups/${code}/draw`, {}, tokens.Anna)).status, 400);
});

test('servono almeno 3 persone e le esclusioni impossibili danno errore', async () => {
  const c = await call('POST', '/api/groups', { name: 'Gruppo', adminName: 'Anna', pin: '1234' });
  const code = c.data.code;
  assert.equal((await call('POST', `/api/groups/${code}/draw`, {}, c.data.token)).status, 400);
  await call('POST', `/api/groups/${code}/enter`, { name: 'Bruno', pin: '1234' });
  await call('POST', `/api/groups/${code}/enter`, { name: 'Carla', pin: '1234' });
  const me = await call('GET', `/api/groups/${code}/me`, null, c.data.token);
  const [a, b, cc] = me.data.members.map((m) => m.id);
  await call('PUT', `/api/groups/${code}/exclusions`, { pairs: [[a, b], [a, cc]] }, c.data.token);
  const d = await call('POST', `/api/groups/${code}/draw`, {}, c.data.token);
  assert.equal(d.status, 400);
  assert.match(d.data.error, /esclusioni/);
});

test('troppi PIN sbagliati bloccano temporaneamente quel partecipante', async () => {
  const c = await call('POST', '/api/groups', { name: 'Gruppo', adminName: 'Anna', pin: '1234' });
  const code = c.data.code;
  let last;
  for (let i = 0; i < 6; i++) last = await call('POST', `/api/groups/${code}/enter`, { name: 'Anna', pin: '0000' });
  assert.equal(last.status, 401);
  const locked = await call('POST', `/api/groups/${code}/enter`, { name: 'Anna', pin: '1234' });
  assert.equal(locked.status, 429);
});

test('gli asset statici e le pagine /g/CODICE rispondono', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  const r = await fetch(`${base}/g/ABCDEFGH`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Secret Santa/);
  assert.equal((await fetch(`${base}/manifest.webmanifest`)).status, 200);
});

test('anteprima link: legge titolo, immagine e prezzo dentro il Worker', async () => {
  const shop = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<meta property="og:title" content="Cuffie Pro"><meta property="og:image" content="/i.jpg"><meta property="product:price:amount" content="49.90"><meta property="product:price:currency" content="EUR">');
  });
  await new Promise((r) => shop.listen(0, '127.0.0.1', r));
  try {
    const c = await call('POST', '/api/groups', { name: 'Gruppo', adminName: 'Anna', pin: '1234' });
    const url = `http://127.0.0.1:${shop.address().port}/p?utm_source=x`;
    const r = await call('POST', `/api/groups/${c.data.code}/preview`, { url }, c.data.token);
    assert.equal(r.status, 200);
    assert.equal(r.data.title, 'Cuffie Pro');
    assert.match(r.data.image, /\/i\.jpg$/);
    assert.match(r.data.price, /49,90/);
    assert.ok(!r.data.url.includes('utm_source'));
    assert.equal((await call('POST', `/api/groups/${c.data.code}/preview`, { url }, 'sbagliato')).status, 401);
  } finally { shop.close(); }
});
