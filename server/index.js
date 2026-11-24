import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { drawNames } from './draw.js';
import { fetchPreview } from './preview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_MEMBERS = 40;

// ---------- utilità ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const forbidden = (m = 'Non autorizzato') => new HttpError(403, m);
const notFound = (m = 'Non trovato') => new HttpError(404, m);

const sha = (s) => createHash('sha256').update(s).digest('hex');
const hashPin = (pin, salt) => scryptSync(pin, salt, 32).toString('hex');
const now = () => Date.now();
const clean = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

function checkUrl(v) {
  const s = clean(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) throw 0;
    return u.toString();
  } catch { throw bad('Link non valido'); }
}

// rate limiting in memoria (login a PIN + anteprime)
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const t = now();
  const b = buckets.get(key) ?? { n: 0, reset: t + windowMs };
  if (t > b.reset) { b.n = 0; b.reset = t + windowMs; }
  b.n++;
  buckets.set(key, b);
  if (b.n > max) throw new HttpError(429, 'Troppi tentativi, riprova tra qualche minuto');
}
setInterval(() => { const t = now(); for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k); }, 60_000).unref();

// ---------- app ----------
export function createApp({ dbFile = process.env.DB_FILE || path.join(process.cwd(), 'data', 'santa.db'), allowPrivatePreview = process.env.ALLOW_PRIVATE_PREVIEW === '1' } = {}) {
  const db = openDb(dbFile);
  const q = (sql) => db.prepare(sql);

  const getGroup = (code) => {
    const g = q('SELECT * FROM groups WHERE code = ?').get(String(code).toUpperCase());
    if (!g) throw notFound('Gruppo non trovato');
    return g;
  };

  function authMember(req, group) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Accesso richiesto');
    const m = q(`SELECT m.* FROM sessions s JOIN members m ON m.id = s.member_id
                 WHERE s.token_hash = ? AND m.group_id = ?`).get(sha(token), group.id);
    if (!m) throw new HttpError(401, 'Sessione non valida');
    return m;
  }
  const requireAdmin = (m) => { if (!m.is_admin) throw forbidden('Solo l\'organizzatore può farlo'); };

  function newSession(memberId) {
    const token = randomBytes(32).toString('hex');
    q('INSERT INTO sessions (token_hash, member_id, created_at) VALUES (?,?,?)').run(sha(token), memberId, now());
    return token;
  }

  function createMember(group, name, pin, isAdmin) {
    const salt = randomBytes(16).toString('hex');
    const info = q(`INSERT INTO members (group_id, name, pin_salt, pin_hash, is_admin, created_at)
       VALUES (?,?,?,?,?,?)`).run(group.id, name, salt, hashPin(pin, salt), isAdmin ? 1 : 0, now());
    return newSession(Number(info.lastInsertRowid));
  }

  const wishOut = (w) => ({ id: w.id, title: w.title, url: w.url, image: w.image, price: w.price, site: w.site, note: w.note });
  const validName = (v) => { const n = clean(v, 30); if (n.length < 2) throw bad('Inserisci un nome (almeno 2 lettere)'); return n; };
  const validPin = (v) => { const p = String(v ?? ''); if (!/^\d{4,8}$/.test(p)) throw bad('Il PIN deve avere da 4 a 8 cifre'); return p; };

  // ---------- rotte ----------
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  };

  route('POST', '/api/groups', ({ body, ip }) => {
    rateLimit(`create:${ip}`, 20, 3600_000);
    const name = clean(body.name, 60);
    if (name.length < 2) throw bad('Dai un nome al gruppo');
    const adminName = validName(body.adminName);
    const pin = validPin(body.pin);
    let code;
    do { code = newCode(); } while (q('SELECT 1 FROM groups WHERE code = ?').get(code));
    const info = q('INSERT INTO groups (code, name, budget, event_date, created_at) VALUES (?,?,?,?,?)')
      .run(code, name, clean(body.budget, 30) || null, clean(body.eventDate, 10) || null, now());
    const token = createMember({ id: Number(info.lastInsertRowid) }, adminName, pin, true);
    return { code, token };
  });

  route('GET', '/api/groups/:code/public', ({ params }) => {
    const g = getGroup(params.code);
    const count = q('SELECT COUNT(*) c FROM members WHERE group_id = ?').get(g.id).c;
    return { name: g.name, budget: g.budget, eventDate: g.event_date, drawn: !!g.drawn, members: count };
  });

  route('POST', '/api/groups/:code/enter', ({ params, body, ip }) => {
    const g = getGroup(params.code);
    const name = validName(body.name);
    const pin = validPin(body.pin);
    rateLimit(`enter:${g.id}:${name.toLowerCase()}`, 8, 300_000);
    rateLimit(`enter-ip:${ip}`, 60, 300_000);
    const m = q('SELECT * FROM members WHERE group_id = ? AND name = ?').get(g.id, name);
    if (m) {
      const a = Buffer.from(hashPin(pin, m.pin_salt), 'hex');
      const b = Buffer.from(m.pin_hash, 'hex');
      if (!timingSafeEqual(a, b)) throw new HttpError(401, 'PIN errato');
      return { token: newSession(m.id), name: m.name };
    }
    if (g.drawn) throw bad('Il sorteggio è già stato fatto: non puoi più unirti');
    const count = q('SELECT COUNT(*) c FROM members WHERE group_id = ?').get(g.id).c;
    if (count >= MAX_MEMBERS) throw bad('Il gruppo è pieno');
    return { token: createMember(g, name, pin, false), name };
  });

  route('GET', '/api/groups/:code/me', ({ req, params }) => {
    const g = getGroup(params.code);
    const me = authMember(req, g);
    const members = q('SELECT id, name, is_admin FROM members WHERE group_id = ? ORDER BY created_at').all(g.id);
    const out = {
      group: { code: g.code, name: g.name, budget: g.budget, eventDate: g.event_date, drawn: !!g.drawn },
      me: { id: me.id, name: me.name, isAdmin: !!me.is_admin },
      members: members.map((m) => ({ id: m.id, name: m.name, isAdmin: !!m.is_admin })),
      hasGiftee: me.gives_to != null,
    };
    if (me.is_admin) {
      out.exclusions = q('SELECT a, b FROM exclusions WHERE group_id = ?').all(g.id).map((e) => [e.a, e.b]);
    }
    return out;
  });

  route('DELETE', '/api/groups/:code/members/:id', ({ req, params }) => {
    const g = getGroup(params.code);
    requireAdmin(authMember(req, g));
    if (g.drawn) throw bad('Sorteggio già fatto');
    const target = q('SELECT * FROM members WHERE id = ? AND group_id = ?').get(Number(params.id), g.id);
    if (!target) throw notFound();
    if (target.is_admin) throw bad('Non puoi rimuovere l\'organizzatore');
    q('DELETE FROM members WHERE id = ?').run(target.id);
    return { ok: true };
  });

  route('PUT', '/api/groups/:code/exclusions', ({ req, params, body }) => {
    const g = getGroup(params.code);
    requireAdmin(authMember(req, g));
    if (g.drawn) throw bad('Sorteggio già fatto');
    const ids = new Set(q('SELECT id FROM members WHERE group_id = ?').all(g.id).map((m) => m.id));
    const pairs = Array.isArray(body.pairs) ? body.pairs : [];
    db.exec('BEGIN');
    try {
      q('DELETE FROM exclusions WHERE group_id = ?').run(g.id);
      for (const p of pairs.slice(0, 200)) {
        const [a, b] = (Array.isArray(p) ? p : []).map(Number);
        if (!ids.has(a) || !ids.has(b) || a === b) continue;
        q('INSERT OR IGNORE INTO exclusions (group_id, a, b) VALUES (?,?,?)').run(g.id, a, b);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ok: true };
  });

  route('POST', '/api/groups/:code/draw', ({ req, params }) => {
    const g = getGroup(params.code);
    requireAdmin(authMember(req, g));
    if (g.drawn) throw bad('Sorteggio già fatto');
    const ids = q('SELECT id FROM members WHERE group_id = ?').all(g.id).map((m) => m.id);
    if (ids.length < 3) throw bad('Servono almeno 3 partecipanti');
    const ex = q('SELECT a, b FROM exclusions WHERE group_id = ?').all(g.id).map((e) => [e.a, e.b]);
    const result = drawNames(ids, ex);
    if (!result) throw bad('Impossibile sorteggiare con queste esclusioni: togline qualcuna');
    db.exec('BEGIN');
    try {
      for (const [giver, receiver] of result) q('UPDATE members SET gives_to = ? WHERE id = ?').run(receiver, giver);
      q('UPDATE groups SET drawn = 1 WHERE id = ?').run(g.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    // l'organizzatore NON vede gli abbinamenti
    return { ok: true };
  });

  route('GET', '/api/groups/:code/giftee', ({ req, params }) => {
    const g = getGroup(params.code);
    const me = authMember(req, g);
    if (!g.drawn || me.gives_to == null) throw bad('Il sorteggio non è ancora stato fatto');
    const giftee = q('SELECT id, name FROM members WHERE id = ?').get(me.gives_to);
    const wishes = q('SELECT * FROM wishes WHERE member_id = ? ORDER BY created_at').all(giftee.id)
      .map((w) => ({ ...wishOut(w), reserved: !!w.reserved }));
    return { name: giftee.name, wishes };
  });

  route('POST', '/api/groups/:code/wishes/:id/reserve', ({ req, params }) => {
    const g = getGroup(params.code);
    const me = authMember(req, g);
    const w = q('SELECT * FROM wishes WHERE id = ?').get(Number(params.id));
    if (!w || w.member_id !== me.gives_to) throw forbidden();
    q('UPDATE wishes SET reserved = ? WHERE id = ?').run(w.reserved ? 0 : 1, w.id);
    return { reserved: !w.reserved };
  });

  route('GET', '/api/groups/:code/wishes', ({ req, params }) => {
    const g = getGroup(params.code);
    const me = authMember(req, g);
    // il proprietario non vede mai lo stato "già preso"
    return q('SELECT * FROM wishes WHERE member_id = ? ORDER BY created_at').all(me.id).map(wishOut);
  });

  const wishFields = (body) => {
    const title = clean(body.title, 200);
    if (!title) throw bad('Serve un titolo');
    const image = checkUrl(body.image);
    return { title, url: checkUrl(body.url), image, price: clean(body.price, 30) || null, site: clean(body.site, 80) || null, note: clean(body.note, 300) || null };
  };

  route('POST', '/api/groups/:code/wishes', ({ req, params, body }) => {
    const g = getGroup(params.code);
    const me = authMember(req, g);
    const n = q('SELECT COUNT(*) c FROM wishes WHERE member_id = ?').get(me.id).c;
    if (n >= 50) throw bad('Hai già 50 desideri, bastano!');
    const w = wishFields(body);
    const info = q(`INSERT INTO wishes (member_id, title, url, image, price, site, note, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(me.id, w.title, w.url, w.image, w.price, w.site, w.note, now());
    return { id: Number(info.lastInsertRowid), ...w };
  });

  route('PUT', '/api/groups/:code/wishes/:id', ({ req, params, body }) => {
    const g = getGroup(params.code);
    const me = authMember(req, g);
    const w = q('SELECT * FROM wishes WHERE id = ? AND member_id = ?').get(Number(params.id), me.id);
    if (!w) throw notFound();
    const f = wishFields(body);
    q('UPDATE wishes SET title=?, url=?, image=?, price=?, site=?, note=? WHERE id=?')
      .run(f.title, f.url, f.image, f.price, f.site, f.note, w.id);
    return { id: w.id, ...f };
  });

  route('DELETE', '/api/groups/:code/wishes/:id', ({ req, params }) => {
    const g = getGroup(params.code);
    const me = authMember(req, g);
    const r = q('DELETE FROM wishes WHERE id = ? AND member_id = ?').run(Number(params.id), me.id);
    if (!r.changes) throw notFound();
    return { ok: true };
  });

  route('POST', '/api/groups/:code/preview', async ({ req, params, body, ip }) => {
    const g = getGroup(params.code);
    const me = authMember(req, g);
    rateLimit(`preview:${me.id}`, 40, 300_000);
    try {
      return await fetchPreview(body.url, { allowPrivate: allowPrivatePreview });
    } catch (e) {
      throw bad(e.message === 'Indirizzo non consentito' ? e.message : 'Link non valido o non raggiungibile');
    }
  });

  // ---------- statici ----------
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  };
  async function serveStatic(req, res, pathname) {
    let rel = pathname === '/' || pathname.startsWith('/g/') ? '/index.html' : pathname;
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) throw notFound();
    try {
      const data = await readFile(file);
      const ext = path.extname(file);
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': ext === '.html' || rel === '/sw.js' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(data);
    } catch { throw notFound(); }
  }

  // ---------- server ----------
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (status, obj) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(obj));
    };
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('content-security-policy',
      "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    try {
      if (url.pathname.startsWith('/api/')) {
        const r = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
        if (!r) throw notFound('Rotta non trovata');
        const m = url.pathname.match(r.re);
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        let body = {};
        if (req.method !== 'GET' && req.method !== 'DELETE') {
          let size = 0; const chunks = [];
          for await (const c of req) { size += c.length; if (size > 100_000) throw new HttpError(413, 'Richiesta troppo grande'); chunks.push(c); }
          try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { throw bad('JSON non valido'); }
        }
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
        return send(200, await r.handler({ req, params, body, ip }));
      }
      if (req.method !== 'GET') throw notFound();
      await serveStatic(req, res, url.pathname);
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      console.error(e);
      send(500, { error: 'Errore interno' });
    }
  });

  return { server, db };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createApp();
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => console.log(`Secret Santa su http://localhost:${port}`));
}
