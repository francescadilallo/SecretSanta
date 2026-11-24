import { drawNames } from './draw.js';
import { fetchPreview } from './preview.js';

const MAX_MEMBERS = 40;
const PBKDF2_ITER = 5000; // il piano gratuito ha poca CPU per richiesta; la difesa vera è il blocco dei tentativi
const MAX_FAILS = 6;
const LOCK_MS = 5 * 60_000;

// ---------- utilità ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const forbidden = (m = 'Non autorizzato') => new HttpError(403, m);
const notFound = (m = 'Non trovato') => new HttpError(404, m);

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: PBKDF2_ITER }, key, 256));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const now = () => Date.now();
const clean = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

function checkUrl(v) {
  const s = clean(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) throw 0;
    return u.toString();
  } catch { throw bad('Link non valido'); }
}

// limite in memoria per isolate (best effort): anteprime e creazione gruppi
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const t = now();
  if (buckets.size > 5000) buckets.clear();
  const b = buckets.get(key) ?? { n: 0, reset: t + windowMs };
  if (t > b.reset) { b.n = 0; b.reset = t + windowMs; }
  b.n++;
  buckets.set(key, b);
  if (b.n > max) throw new HttpError(429, 'Troppi tentativi, riprova tra qualche minuto');
}

// ---------- schema (creato al primo uso: nessuna migrazione da lanciare) ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS groups (
     id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, budget TEXT, event_date TEXT,
     drawn INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS members (
     id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     name TEXT NOT NULL COLLATE NOCASE, pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL,
     is_admin INTEGER NOT NULL DEFAULT 0, gives_to INTEGER REFERENCES members(id) ON DELETE SET NULL,
     fail_count INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL, UNIQUE (group_id, name))`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS exclusions (
     group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     a INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
     b INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE, PRIMARY KEY (a, b))`,
  `CREATE TABLE IF NOT EXISTS wishes (
     id INTEGER PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
     title TEXT NOT NULL, url TEXT, image TEXT, price TEXT, site TEXT, note TEXT,
     reserved INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS wishes_member ON wishes(member_id)`,
];
let schemaReady = null;
function ensureSchema(db) {
  schemaReady ??= db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

// ---------- logica ----------
function makeApi(db, { allowPrivatePreview = false } = {}) {
  const first = (sql, ...a) => db.prepare(sql).bind(...a).first();
  const all = async (sql, ...a) => (await db.prepare(sql).bind(...a).all()).results;
  const run = (sql, ...a) => db.prepare(sql).bind(...a).run();
  const stmt = (sql, ...a) => db.prepare(sql).bind(...a);

  const getGroup = async (code) => {
    const g = await first('SELECT * FROM groups WHERE code = ?', String(code).toUpperCase());
    if (!g) throw notFound('Gruppo non trovato');
    return g;
  };

  async function authMember(req, group) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Accesso richiesto');
    const m = await first(
      `SELECT m.* FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.token_hash = ? AND m.group_id = ?`,
      await sha(token), group.id);
    if (!m) throw new HttpError(401, 'Sessione non valida');
    return m;
  }
  const requireAdmin = (m) => { if (!m.is_admin) throw forbidden("Solo l'organizzatore può farlo"); };

  async function newSession(memberId) {
    const token = randomHex(32);
    await run('INSERT INTO sessions (token_hash, member_id, created_at) VALUES (?,?,?)', await sha(token), memberId, now());
    return token;
  }
  function randomHex(n) { return randHex(n); }

  async function createMember(groupId, name, pin, isAdmin) {
    const salt = randHex(16);
    const r = await run(
      `INSERT INTO members (group_id, name, pin_salt, pin_hash, is_admin, created_at) VALUES (?,?,?,?,?,?)`,
      groupId, name, salt, await hashPin(pin, salt), isAdmin ? 1 : 0, now());
    return newSession(r.meta.last_row_id);
  }

  const wishOut = (w) => ({ id: w.id, title: w.title, url: w.url, image: w.image, price: w.price, site: w.site, note: w.note });
  const validName = (v) => { const n = clean(v, 30); if (n.length < 2) throw bad('Inserisci un nome (almeno 2 lettere)'); return n; };
  const validPin = (v) => { const p = String(v ?? ''); if (!/^\d{4,8}$/.test(p)) throw bad('Il PIN deve avere da 4 a 8 cifre'); return p; };
  const wishFields = (body) => {
    const title = clean(body.title, 200);
    if (!title) throw bad('Serve un titolo');
    return { title, url: checkUrl(body.url), image: checkUrl(body.image), price: clean(body.price, 30) || null, site: clean(body.site, 80) || null, note: clean(body.note, 300) || null };
  };

  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  };

  route('POST', '/api/groups', async ({ body, ip }) => {
    rateLimit(`create:${ip}`, 20, 3600_000);
    const name = clean(body.name, 60);
    if (name.length < 2) throw bad('Dai un nome al gruppo');
    const adminName = validName(body.adminName);
    const pin = validPin(body.pin);
    let code;
    do { code = newCode(); } while (await first('SELECT 1 FROM groups WHERE code = ?', code));
    const r = await run('INSERT INTO groups (code, name, budget, event_date, created_at) VALUES (?,?,?,?,?)',
      code, name, clean(body.budget, 30) || null, clean(body.eventDate, 10) || null, now());
    const token = await createMember(r.meta.last_row_id, adminName, pin, true);
    return { code, token };
  });

  route('GET', '/api/groups/:code/public', async ({ params }) => {
    const g = await getGroup(params.code);
    const { c } = await first('SELECT COUNT(*) c FROM members WHERE group_id = ?', g.id);
    return { name: g.name, budget: g.budget, eventDate: g.event_date, drawn: !!g.drawn, members: c };
  });

  route('POST', '/api/groups/:code/enter', async ({ params, body, ip }) => {
    const g = await getGroup(params.code);
    const name = validName(body.name);
    const pin = validPin(body.pin);
    rateLimit(`enter-ip:${ip}`, 60, 300_000);
    const m = await first('SELECT * FROM members WHERE group_id = ? AND name = ?', g.id, name);
    if (m) {
      if (m.locked_until > now()) throw new HttpError(429, 'Troppi tentativi sbagliati, riprova tra qualche minuto');
      if (!safeEqual(await hashPin(pin, m.pin_salt), m.pin_hash)) {
        const fails = m.fail_count + 1;
        if (fails >= MAX_FAILS) await run('UPDATE members SET fail_count = 0, locked_until = ? WHERE id = ?', now() + LOCK_MS, m.id);
        else await run('UPDATE members SET fail_count = ? WHERE id = ?', fails, m.id);
        throw new HttpError(401, 'PIN errato');
      }
      if (m.fail_count) await run('UPDATE members SET fail_count = 0 WHERE id = ?', m.id);
      return { token: await newSession(m.id), name: m.name };
    }
    if (g.drawn) throw bad('Il sorteggio è già stato fatto: non puoi più unirti');
    const { c } = await first('SELECT COUNT(*) c FROM members WHERE group_id = ?', g.id);
    if (c >= MAX_MEMBERS) throw bad('Il gruppo è pieno');
    return { token: await createMember(g.id, name, pin, false), name };
  });

  route('GET', '/api/groups/:code/me', async ({ req, params }) => {
    const g = await getGroup(params.code);
    const me = await authMember(req, g);
    const members = await all('SELECT id, name, is_admin FROM members WHERE group_id = ? ORDER BY created_at, id', g.id);
    const out = {
      group: { code: g.code, name: g.name, budget: g.budget, eventDate: g.event_date, drawn: !!g.drawn },
      me: { id: me.id, name: me.name, isAdmin: !!me.is_admin },
      members: members.map((m) => ({ id: m.id, name: m.name, isAdmin: !!m.is_admin })),
      hasGiftee: me.gives_to != null,
    };
    if (me.is_admin) out.exclusions = (await all('SELECT a, b FROM exclusions WHERE group_id = ?', g.id)).map((e) => [e.a, e.b]);
    return out;
  });

  route('DELETE', '/api/groups/:code/members/:id', async ({ req, params }) => {
    const g = await getGroup(params.code);
    requireAdmin(await authMember(req, g));
    if (g.drawn) throw bad('Sorteggio già fatto');
    const target = await first('SELECT * FROM members WHERE id = ? AND group_id = ?', Number(params.id), g.id);
    if (!target) throw notFound();
    if (target.is_admin) throw bad("Non puoi rimuovere l'organizzatore");
    await run('DELETE FROM members WHERE id = ?', target.id);
    return { ok: true };
  });

  route('PUT', '/api/groups/:code/exclusions', async ({ req, params, body }) => {
    const g = await getGroup(params.code);
    requireAdmin(await authMember(req, g));
    if (g.drawn) throw bad('Sorteggio già fatto');
    const ids = new Set((await all('SELECT id FROM members WHERE group_id = ?', g.id)).map((m) => m.id));
    const pairs = Array.isArray(body.pairs) ? body.pairs : [];
    const ops = [stmt('DELETE FROM exclusions WHERE group_id = ?', g.id)];
    for (const p of pairs.slice(0, 200)) {
      const [a, b] = (Array.isArray(p) ? p : []).map(Number);
      if (!ids.has(a) || !ids.has(b) || a === b) continue;
      ops.push(stmt('INSERT OR IGNORE INTO exclusions (group_id, a, b) VALUES (?,?,?)', g.id, a, b));
    }
    await db.batch(ops);
    return { ok: true };
  });

  route('POST', '/api/groups/:code/draw', async ({ req, params }) => {
    const g = await getGroup(params.code);
    requireAdmin(await authMember(req, g));
    if (g.drawn) throw bad('Sorteggio già fatto');
    const ids = (await all('SELECT id FROM members WHERE group_id = ?', g.id)).map((m) => m.id);
    if (ids.length < 3) throw bad('Servono almeno 3 partecipanti');
    const ex = (await all('SELECT a, b FROM exclusions WHERE group_id = ?', g.id)).map((e) => [e.a, e.b]);
    const result = drawNames(ids, ex);
    if (!result) throw bad('Impossibile sorteggiare con queste esclusioni: togline qualcuna');
    await db.batch([
      ...[...result].map(([giver, receiver]) => stmt('UPDATE members SET gives_to = ? WHERE id = ?', receiver, giver)),
      stmt('UPDATE groups SET drawn = 1 WHERE id = ?', g.id),
    ]);
    return { ok: true }; // l'organizzatore NON vede gli abbinamenti
  });

  route('GET', '/api/groups/:code/giftee', async ({ req, params }) => {
    const g = await getGroup(params.code);
    const me = await authMember(req, g);
    if (!g.drawn || me.gives_to == null) throw bad('Il sorteggio non è ancora stato fatto');
    const giftee = await first('SELECT id, name FROM members WHERE id = ?', me.gives_to);
    const wishes = (await all('SELECT * FROM wishes WHERE member_id = ? ORDER BY created_at, id', giftee.id))
      .map((w) => ({ ...wishOut(w), reserved: !!w.reserved }));
    return { name: giftee.name, wishes };
  });

  route('POST', '/api/groups/:code/wishes/:id/reserve', async ({ req, params }) => {
    const g = await getGroup(params.code);
    const me = await authMember(req, g);
    const w = await first('SELECT * FROM wishes WHERE id = ?', Number(params.id));
    if (!w || w.member_id !== me.gives_to) throw forbidden();
    await run('UPDATE wishes SET reserved = ? WHERE id = ?', w.reserved ? 0 : 1, w.id);
    return { reserved: !w.reserved };
  });

  route('GET', '/api/groups/:code/wishes', async ({ req, params }) => {
    const g = await getGroup(params.code);
    const me = await authMember(req, g);
    // il proprietario non vede mai lo stato "già preso"
    return (await all('SELECT * FROM wishes WHERE member_id = ? ORDER BY created_at, id', me.id)).map(wishOut);
  });

  route('POST', '/api/groups/:code/wishes', async ({ req, params, body }) => {
    const g = await getGroup(params.code);
    const me = await authMember(req, g);
    const { c } = await first('SELECT COUNT(*) c FROM wishes WHERE member_id = ?', me.id);
    if (c >= 50) throw bad('Hai già 50 desideri, bastano!');
    const w = wishFields(body);
    const r = await run(
      'INSERT INTO wishes (member_id, title, url, image, price, site, note, created_at) VALUES (?,?,?,?,?,?,?,?)',
      me.id, w.title, w.url, w.image, w.price, w.site, w.note, now());
    return { id: r.meta.last_row_id, ...w };
  });

  route('PUT', '/api/groups/:code/wishes/:id', async ({ req, params, body }) => {
    const g = await getGroup(params.code);
    const me = await authMember(req, g);
    const w = await first('SELECT * FROM wishes WHERE id = ? AND member_id = ?', Number(params.id), me.id);
    if (!w) throw notFound();
    const f = wishFields(body);
    await run('UPDATE wishes SET title=?, url=?, image=?, price=?, site=?, note=? WHERE id=?',
      f.title, f.url, f.image, f.price, f.site, f.note, w.id);
    return { id: w.id, ...f };
  });

  route('DELETE', '/api/groups/:code/wishes/:id', async ({ req, params }) => {
    const g = await getGroup(params.code);
    const me = await authMember(req, g);
    const r = await run('DELETE FROM wishes WHERE id = ? AND member_id = ?', Number(params.id), me.id);
    if (!r.meta.changes) throw notFound();
    return { ok: true };
  });

  route('POST', '/api/groups/:code/preview', async ({ req, params, body }) => {
    const g = await getGroup(params.code);
    const me = await authMember(req, g);
    rateLimit(`preview:${me.id}`, 40, 300_000);
    try {
      return await fetchPreview(body.url, { allowPrivate: allowPrivatePreview });
    } catch (e) {
      throw bad(e.message === 'Indirizzo non consentito' ? e.message : 'Link non valido o non raggiungibile');
    }
  });

  return async function handle(request) {
    const url = new URL(request.url);
    const r = routes.find((x) => x.method === request.method && x.re.test(url.pathname));
    if (!r) throw notFound('Rotta non trovata');
    const m = url.pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    let body = {};
    if (request.method !== 'GET' && request.method !== 'DELETE') {
      const text = await request.text();
      if (text.length > 100_000) throw new HttpError(413, 'Richiesta troppo grande');
      try { body = text ? JSON.parse(text) : {}; } catch { throw bad('JSON non valido'); }
    }
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
    return r.handler({ req: request, params, body, ip });
  };
}

export default {
  async fetch(request, env) {
    const json = (status, obj) => new Response(JSON.stringify(obj), {
      status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
    try {
      const { pathname } = new URL(request.url);
      if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request); // sicurezza in più: gli asset sono serviti dal runtime
      await ensureSchema(env.DB);
      const handle = makeApi(env.DB, { allowPrivatePreview: env.ALLOW_PRIVATE_PREVIEW === '1' });
      return json(200, await handle(request));
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      console.error(e);
      return json(500, { error: 'Errore interno' });
    }
  },
};
