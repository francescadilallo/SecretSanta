// Secret Santa PWA – frontend senza dipendenze
import { CATEGORIES, IDEAS } from '/ideas.js';
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

// ---------- utilità ----------
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (n) => esc(n.trim()[0]?.toUpperCase() || '?');
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove('show'), 2400);
}

const store = {
  get() { try { return JSON.parse(localStorage.getItem('ss_sessions') || '{}'); } catch { return {}; } },
  set(v) { try { localStorage.setItem('ss_sessions', JSON.stringify(v)); } catch { /* storage non disponibile */ } },
  save(code, data) { const s = this.get(); s[code] = { ...s[code], ...data }; this.set(s); },
  remove(code) { const s = this.get(); delete s[code]; this.set(s); },
};

async function api(method, path, body, code) {
  const token = code ? store.get()[code]?.token : null;
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error('Connessione assente, riprova'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Errore');
    err.status = res.status;
    throw err;
  }
  return data;
}

// immagini rotte -> nascondi
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG') { e.target.replaceWith(document.createTextNode('🎁')); }
}, true);

function navigate(path) { history.pushState({}, '', path); route(); }
window.addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (a) { e.preventDefault(); navigate(a.getAttribute('href')); }
});


// ---------- effetti e piccoli helper grafici ----------
const PALETTE = ['#c8352b', '#1f7a52', '#d98324', '#2f6fb5', '#8a4fb3', '#c2417a', '#2a8f8f', '#7a6a2b'];
function avatar(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="avatar" style="background:${PALETTE[h % PALETTE.length]}">${initials(name)}</span>`;
}
function countdown(d) {
  if (!d) return '';
  const target = new Date(d + 'T00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((target - today) / 864e5);
  if (isNaN(days) || days < 0) return '';
  if (days === 0) return 'Oggi! 🎉';
  if (days === 1) return 'Domani!';
  return `Mancano ${days} giorni`;
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function initSnow() {
  if (reduceMotion()) return;
  const box = document.getElementById('snow');
  for (let i = 0; i < 26; i++) {
    const f = document.createElement('i');
    const size = 2 + Math.random() * 4;
    f.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;animation-duration:${9 + Math.random() * 12}s;animation-delay:${-Math.random() * 20}s;--dx:${(Math.random() - 0.5) * 80}px`;
    box.appendChild(f);
  }
}
function confetti() {
  if (reduceMotion()) return;
  const cv = document.getElementById('confetti');
  const ctx = cv.getContext('2d');
  const dpr = devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colors = ['#e8594a', '#1f7a52', '#e9b949', '#ffffff', '#3fb67d'];
  const ps = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.45, vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 13 - 4,
    s: Math.random() * 7 + 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0],
  }));
  let frames = 0;
  (function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of ps) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.y < innerHeight + 20) alive++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); ctx.restore();
    }
    if (alive && ++frames < 260) requestAnimationFrame(tick); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })();
}


// miniatura di un desiderio: immagine del prodotto, altrimenti l'emoji dell'idea regalo
function thumb(w) {
  if (w.image) return `<div class="thumb"><img src="${esc(w.image)}" alt="" referrerpolicy="no-referrer" loading="lazy"></div>`;
  const idea = w.site === 'Idea regalo' ? IDEAS.find((i) => i.title === w.title) : null;
  return `<div class="thumb">${idea ? idea.e : '🎁'}</div>`;
}

// ---------- bottom sheet ----------
function openSheet(html, onMount) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
  document.body.appendChild(bg);
  onMount?.(bg.firstElementChild);
  return bg.firstElementChild;
}
function closeSheet() { document.querySelector('.sheet-bg')?.remove(); }

// ---------- router ----------
function route() {
  closeSheet();
  const m = location.pathname.match(/^\/g\/([A-Za-z0-9]+)/);
  if (m) return viewGroupEntry(m[1].toUpperCase());
  return viewHome();
}

// ---------- home ----------
function viewHome() {
  const sessions = store.get();
  const entries = Object.entries(sessions);
  $app.innerHTML = `
    <div class="banner hero-home"><span class="emoji">🎅</span><h1>Secret Santa</h1>
      <p>Sorteggio segreto e liste dei desideri, senza spoiler.</p></div>
    ${entries.length ? `<h2>I tuoi gruppi</h2><div class="home-list">` + entries.map(([code, s]) => `
      <a data-nav href="/g/${code}" class="card">
        ${avatar(s.groupName || code)}
        <div class="grow"><strong>${esc(s.groupName || code)}</strong><div class="muted">Sei ${esc(s.name || '')}</div></div><span class="chev">›</span>
      </a>`).join('') + `</div>` : ''}
    <h2>Crea un nuovo gruppo</h2>
    <form id="create" class="card">
      <label>Nome del gruppo</label><input name="name" placeholder="Natale in famiglia 2026" required maxlength="60">
      <label>Budget (facoltativo)</label><input name="budget" placeholder="es. 20 €" maxlength="30">
      <label>Data dello scambio (facoltativa)</label><input name="eventDate" type="date" aria-label="Data dello scambio">
      <p class="muted">Tocca il campo per scegliere il giorno.</p>
      <label>Il tuo nome</label><input name="adminName" placeholder="Francesca" required maxlength="30" autocomplete="given-name">
      <label>Scegli un PIN (4-8 cifre)</label><input name="pin" type="password" inputmode="numeric" pattern="\\d{4,8}" required placeholder="••••" autocomplete="new-password">
      <p class="muted">Il PIN serve per rientrare da un altro dispositivo.</p>
      <div class="error" id="err"></div>
      <button class="block" style="margin-top:8px">Crea gruppo</button>
    </form>`;
  document.getElementById('create').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const r = await api('POST', '/api/groups', f);
      store.save(r.code, { token: r.token, name: f.adminName, groupName: f.name });
      tab = 'gruppo';
      navigate(`/g/${r.code}`);
    } catch (err) { document.getElementById('err').textContent = err.message; btn.disabled = false; }
  });
}

// ---------- gruppo: ingresso ----------
let tab = 'abbinamento';
async function viewGroupEntry(code) {
  const s = store.get()[code];
  if (s?.token) return viewGroup(code);
  $app.innerHTML = `<div class="skeleton" style="height:170px"></div><div class="skeleton"></div>`;
  let info;
  try { info = await api('GET', `/api/groups/${code}/public`); }
  catch { $app.innerHTML = `<div class="empty"><span class="emoji">🤔</span>Gruppo non trovato.<p><a data-nav href="/">Torna alla home</a></p></div>`; return; }
  $app.innerHTML = `
    <div class="banner hero-home"><span class="emoji">🎅</span><p style="margin:0;font-weight:700;opacity:.9">Sei stato invitato a</p><h1>${esc(info.name)}</h1>
      <div class="chips" style="justify-content:center"><span class="pill">👥 ${info.members} ${info.members === 1 ? 'persona' : 'persone'}</span>${info.budget ? `<span class="pill">💶 ${esc(info.budget)}</span>` : ''}${info.eventDate ? `<span class="pill">📅 ${fmtDate(info.eventDate)}</span>` : ''}</div></div>
    <form id="enter" class="card">
      <p>${info.drawn ? 'Il sorteggio è già stato fatto: puoi solo rientrare con nome e PIN.' : 'Scrivi il tuo nome e scegli un PIN. Se sei già dentro, usa gli stessi per rientrare.'}</p>
      <label>Il tuo nome</label><input name="name" required maxlength="30" autocomplete="given-name">
      <label>PIN (4-8 cifre)</label><input name="pin" type="password" inputmode="numeric" pattern="\\d{4,8}" required autocomplete="current-password">
      <div class="error" id="err"></div>
      <button class="block" style="margin-top:8px">Entra</button>
    </form>`;
  document.getElementById('enter').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const r = await api('POST', `/api/groups/${code}/enter`, f);
      store.save(code, { token: r.token, name: r.name, groupName: info.name });
      tab = 'abbinamento';
      viewGroup(code);
    } catch (err) { document.getElementById('err').textContent = err.message; btn.disabled = false; }
  });
}

const fmtDate = (d) => { try { return new Date(d + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } };

// ---------- gruppo: schermata principale ----------
let ctx = null; // { code, me, group, members, exclusions }
let revealed = false;

async function viewGroup(code) {
  try {
    const d = await api('GET', `/api/groups/${code}/me`, null, code);
    ctx = { code, ...d };
    store.save(code, { name: d.me.name, groupName: d.group.name });
  } catch (err) {
    if (err.status === 401) { store.remove(code); toast('Sessione scaduta, rientra con nome e PIN'); return viewGroupEntry(code); }
    $app.innerHTML = `<div class="empty"><span class="emoji">⚠️</span>${esc(err.message)}<p><button id="retry">Riprova</button></p></div>`;
    document.getElementById('retry').onclick = () => viewGroup(code);
    return;
  }
  render();
}

function render() {
  const { group, me } = ctx;
  const tabs = [['abbinamento', '🎁', 'Il tuo abbinato'], ['lista', '📝', 'La mia lista'], ['gruppo', '👥', 'Gruppo']];
  $app.innerHTML = `
    <div class="banner">
      <div class="top"><a data-nav href="/" class="back">‹ Home</a><span class="who">${esc(me.name)}${me.isAdmin ? ' · organizzatore' : ''}</span></div>
      <h1>${esc(group.name)}</h1>
      <div class="chips">
        ${group.budget ? `<span class="pill">💶 ${esc(group.budget)}</span>` : ''}
        ${group.eventDate ? `<span class="pill">📅 ${fmtDate(group.eventDate)}</span>` : ''}
        ${countdown(group.eventDate) ? `<span class="pill gold">${countdown(group.eventDate)}</span>` : ''}
        <span class="pill">👥 ${ctx.members.length}</span>
      </div>
    </div>
    <div id="pane"></div>
    <nav class="tabs">${tabs.map(([k, ic, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}"><span class="ic">${ic}</span>${l}</button>`).join('')}</nav>`;
  $app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    window.scrollTo(0, 0);
    // la scheda Gruppo mostra dati che cambiano (nuovi iscritti): ricarica sempre
    if (tab === 'gruppo') viewGroup(ctx.code); else render();
  }));
  ({ abbinamento: paneAbbinamento, lista: paneLista, gruppo: paneGruppo })[tab](document.getElementById('pane'));
}

// ----- tab: abbinamento -----
async function paneAbbinamento(el) {
  const { group, code, members } = ctx;
  if (!group.drawn) {
    el.innerHTML = `
      <div class="card status"><div class="big">${members.length}</div>
        <div class="grow"><strong>${members.length === 1 ? 'persona iscritta' : 'persone iscritte'}</strong>
        <div class="muted">Il sorteggio non è ancora stato fatto${ctx.me.isAdmin ? ': invita gli altri e poi sorteggia dalla scheda Gruppo' : ': aspetta l\'organizzatore'}.</div></div></div>
      <div class="empty"><span class="emoji">📝</span><strong>Intanto scrivi la tua lista dei desideri</strong>
        <p>Chi ti pescherà saprà cosa regalarti.</p>
        <p><button data-go="lista">Vai alla mia lista</button></p></div>`;
    el.querySelector('[data-go]').onclick = () => { tab = 'lista'; render(); };
    return;
  }
  el.innerHTML = `<div class="skeleton" style="height:236px"></div><div class="skeleton"></div>`;
  let g;
  try { g = await api('GET', `/api/groups/${code}/giftee`, null, code); }
  catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }

  const wishCard = (w) => `
    <div class="card wish ${w.reserved ? 'reserved' : ''}">
      ${thumb(w)}
      <div class="grow"><div class="t">${esc(w.title)}</div>
        ${w.price ? `<span class="price">${esc(w.price)}</span>` : ''}<div class="meta">${esc(w.site || '')}</div>
        ${w.note ? `<div class="meta note">“${esc(w.note)}”</div>` : ''}
        <div class="actions">
          ${w.url ? `<a class="btn small ghost" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">Apri ↗</a>` : ''}
          <button class="small ${w.reserved ? 'ghost' : 'green'}" data-reserve="${w.id}">${w.reserved ? 'Preso ✓' : 'Lo prendo io'}</button>
        </div></div>
    </div>`;

  el.innerHTML = `
    <div class="flip ${revealed ? 'open' : ''}" id="flip"><div class="flip-in" id="reveal">
      <div class="face front"><div class="tag"><b>Tocca per scoprire</b><span>a chi farai il regalo 🤫</span></div></div>
      <div class="face back"><div class="emoji">🎁</div><div>Fai il regalo a</div><div class="name">${esc(g.name)}</div><small>Tocca per nascondere</small></div>
    </div></div>
    <div class="after-reveal" id="wishes"></div>`;

  const paintWishes = () => {
    const box = el.querySelector('#wishes');
    box.innerHTML = `<h2>Desideri di ${esc(g.name)}</h2>${g.wishes.length ? g.wishes.map(wishCard).join('') :
      `<div class="empty"><span class="emoji">🕵️</span>${esc(g.name)} non ha ancora scritto nulla. Riprova più tardi!</div>`}`;
    box.querySelectorAll('[data-reserve]').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.reserve);
      try {
        const r = await api('POST', `/api/groups/${code}/wishes/${id}/reserve`, {}, code);
        g.wishes.find((w) => w.id === id).reserved = r.reserved;
        paintWishes();
        if (r.reserved) toast('Segnato come preso ✓');
      } catch (e) { toast(e.message); }
    }));
  };
  paintWishes();
  el.querySelector('#reveal').onclick = () => {
    revealed = !revealed;
    el.querySelector('#flip').classList.toggle('open', revealed);
    if (revealed) setTimeout(confetti, 350);
  };
}

// ----- tab: la mia lista -----
async function paneLista(el) {
  const { code } = ctx;
  el.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
  let wishes;
  try { wishes = await api('GET', `/api/groups/${code}/wishes`, null, code); }
  catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }

  el.innerHTML = `
    <div class="row"><button class="grow" id="add">＋ Aggiungi desiderio</button><button class="ghost" id="ideas">💡 Idee</button></div>
    <p class="muted" style="margin-top:10px">Solo chi ti pescherà vedrà questa lista. Tu non vedrai mai se qualcuno ha già preso qualcosa.</p>
    ${wishes.length ? wishes.map((w) => `
      <div class="card wish">
        ${thumb(w)}
        <div class="grow"><div class="t">${esc(w.title)}</div>
          ${w.price ? `<span class="price">${esc(w.price)}</span>` : ''}<div class="meta">${esc(w.site || '')}</div>
          ${w.note ? `<div class="meta note">“${esc(w.note)}”</div>` : ''}
          <div class="actions">
            ${w.url ? `<a class="btn small ghost" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">Apri ↗</a>` : ''}
            <button class="small ghost" data-edit="${w.id}">Modifica</button>
            <button class="small danger" data-del="${w.id}">Elimina</button>
          </div></div>
      </div>`).join('') : `<div class="empty"><span class="emoji">📝</span>Nessun desiderio ancora.<br>Incolla un link da qualsiasi negozio oppure sfoglia le idee regalo.<p><button class="green" id="ideas2">💡 Sfoglia le idee</button></p></div>`}`;
  const refresh = () => paneLista(el);
  el.querySelector('#add').onclick = () => wishSheet(null, refresh);
  el.querySelector('#ideas').onclick = () => ideasSheet(wishes.map((w) => w.title), refresh);
  el.querySelector('#ideas2')?.addEventListener('click', () => ideasSheet([], refresh));
  el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => wishSheet(wishes.find((w) => w.id === Number(b.dataset.edit)), refresh));
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Eliminare questo desiderio?')) return;
    try { await api('DELETE', `/api/groups/${code}/wishes/${b.dataset.del}`, null, code); refresh(); } catch (e) { toast(e.message); }
  });
}


// ----- catalogo idee regalo -----
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const budgetNum = (b) => { const m = String(b || '').match(/(\d+(?:[.,]\d+)?)/); return m ? parseFloat(m[1].replace(',', '.')) : null; };
const shopLink = (q) => `https://www.google.com/search?tbm=shop&hl=it&q=${encodeURIComponent(q)}`;
const priceLabel = (i) => `${i.min}–${i.max} €`;

function ideasSheet(haveTitles, done) {
  const { code, group } = ctx;
  const budget = budgetNum(group.budget);
  const st = { q: '', cat: 'all', inBudget: budget != null };
  const added = new Set(haveTitles.map(norm));
  let count = 0;
  const sheet = openSheet(`
    <h2>💡 Idee regalo</h2>
    <p class="muted">Tocca ＋ per aggiungere un'idea alla tua lista. Chi ti pesca la cercherà nel negozio che preferisce.</p>
    <div class="sticky-top">
      <input id="iq" type="search" placeholder="Cerca: tè, cuffie, puzzle…" enterkeyhint="search" autocomplete="off">
      <div class="chips scroll" id="icats"></div>
    </div>
    <div id="ilist"></div>
    <div class="sticky-bot"><button class="block" id="idone">Fatto</button></div>`);
  const $ = (q) => sheet.querySelector(q);

  const paint = () => {
    $('#icats').innerHTML =
      (budget != null ? `<button type="button" class="chip ${st.inBudget ? 'on' : ''}" data-budget>💶 Nel budget (≤ ${budget} €)</button>` : '') +
      `<button type="button" class="chip ${st.cat === 'all' ? 'on' : ''}" data-cat="all">Tutte</button>` +
      CATEGORIES.map((c) => `<button type="button" class="chip ${st.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.e} ${esc(c.name)}</button>`).join('');
    const q = norm(st.q.trim());
    const list = IDEAS.filter((i) =>
      (st.cat === 'all' || i.cat === st.cat) &&
      (!st.inBudget || budget == null || i.min <= budget) &&
      (!q || norm(i.title).includes(q)));
    $('#ilist').innerHTML = list.length ? list.map((i) => {
      const isAdded = added.has(norm(i.title));
      return `<div class="card idea"><span class="em">${i.e}</span>
        <div class="grow"><div class="t">${esc(i.title)}</div><div class="meta">${priceLabel(i)}</div></div>
        <button type="button" class="round ${isAdded ? 'done' : ''}" data-idea="${IDEAS.indexOf(i)}" aria-label="${isAdded ? 'Già aggiunta' : 'Aggiungi'}">${isAdded ? '✓' : '＋'}</button></div>`;
    }).join('') : `<div class="empty"><span class="emoji">🔍</span>Nessuna idea trovata.<br>Prova un'altra parola${budget != null && st.inBudget ? ' o togli il filtro budget' : ''}.</div>`;
  };
  paint();

  $('#iq').addEventListener('input', (e) => { st.q = e.target.value; paint(); });
  sheet.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-cat],[data-budget]');
    if (chip) {
      if (chip.hasAttribute('data-budget')) st.inBudget = !st.inBudget; else st.cat = chip.dataset.cat;
      return paint();
    }
    const btn = e.target.closest('[data-idea]');
    if (!btn || btn.classList.contains('done')) return;
    const idea = IDEAS[Number(btn.dataset.idea)];
    btn.disabled = true;
    try {
      await api('POST', `/api/groups/${code}/wishes`, {
        title: idea.title, price: priceLabel(idea), url: shopLink(idea.title), site: 'Idea regalo',
      }, code);
      added.add(norm(idea.title)); count++;
      btn.classList.add('done'); btn.textContent = '✓'; btn.disabled = false;
      toast(`Aggiunto: ${idea.title}`);
    } catch (err) { btn.disabled = false; toast(err.message); }
  });
  $('#idone').onclick = () => { closeSheet(); if (count) done(); };
}

const SHOPS = [
  ['Amazon', (q) => `https://www.amazon.it/s?k=${q}`],
  ['Google Shopping', (q) => `https://www.google.com/search?tbm=shop&hl=it&q=${q}`],
  ['eBay', (q) => `https://www.ebay.it/sch/i.html?_nkw=${q}`],
  ['Zalando', (q) => `https://www.zalando.it/catalogo/?q=${q}`],
  ['IBS libri', (q) => `https://www.ibs.it/search?ts=as&query=${q}`],
];

function wishSheet(existing, done) {
  const { code } = ctx;
  const w = { title: '', url: '', image: '', price: '', site: '', note: '', ...(existing || {}) };
  const sheet = openSheet(`
    <h2>${existing ? 'Modifica desiderio' : 'Nuovo desiderio'}</h2>
    ${existing ? '' : `
    <label>1 · Cerca su un negozio</label>
    <input id="q" placeholder="Cosa vorresti? es. cuffie bluetooth" enterkeyhint="search">
    <div class="chips" style="margin-top:8px">${SHOPS.map(([n], i) => `<button type="button" class="chip" data-shop="${i}">${n} ↗</button>`).join('')}</div>
    <p class="muted">Trova il prodotto, poi copia il link (Condividi → Copia) e torna qui.</p>`}
    <label>${existing ? 'Link del prodotto' : '2 · Incolla il link'}</label>
    <div class="row"><input id="url" class="grow" inputmode="url" autocapitalize="off" autocorrect="off" placeholder="https://…" value="${esc(w.url || '')}"><button type="button" class="small ghost" id="paste">Incolla</button></div>
    <div id="pv"></div>
    <label>Titolo</label><input id="title" maxlength="200" value="${esc(w.title)}" placeholder="Nome del regalo">
    <div class="row"><div class="grow"><label>Prezzo</label><input id="price" maxlength="30" value="${esc(w.price || '')}" placeholder="es. 29,90 €"></div></div>
    <label>Nota (taglia, colore…)</label><input id="note" maxlength="300" value="${esc(w.note || '')}">
    <div class="error" id="err"></div>
    <div class="row" style="margin-top:12px"><button type="button" class="ghost" id="cancel">Annulla</button><button class="grow" id="save">Salva</button></div>`);
  const $ = (s) => sheet.querySelector(s);
  const pv = $('#pv');
  const showPv = () => {
    pv.innerHTML = w.image || w.site ? `<div class="preview"><div class="thumb">${w.image ? `<img src="${esc(w.image)}" alt="" referrerpolicy="no-referrer">` : '🎁'}</div>
      <div class="grow"><div class="t" style="font-weight:600">${esc($('#title').value || w.title || 'Prodotto')}</div><div class="muted">${esc(w.site || '')}</div></div></div>` : '';
  };
  showPv();
  sheet.querySelectorAll('[data-shop]').forEach((b) => b.onclick = () => {
    const q = encodeURIComponent($('#q').value.trim() || '');
    window.open(SHOPS[b.dataset.shop][1](q), '_blank', 'noopener');
  });

  let lastUrl = w.url || '';
  async function load() {
    const raw = $('#url').value.trim();
    if (!raw || raw === lastUrl) return;
    lastUrl = raw;
    pv.innerHTML = `<p class="muted"><span class="spinner"></span> Leggo il prodotto…</p>`;
    $('#err').textContent = '';
    try {
      const r = await api('POST', `/api/groups/${code}/preview`, { url: raw }, code);
      Object.assign(w, { url: r.url, image: r.image || '', site: r.site || '' });
      if (r.title) $('#title').value = r.title;
      if (r.price) $('#price').value = r.price;
      $('#url').value = r.url;
      lastUrl = r.url;
      showPv();
      if (!r.title) { pv.insertAdjacentHTML('beforeend', `<p class="muted">Non sono riuscito a leggere il titolo: scrivilo tu qui sotto.</p>`); }
    } catch (e) { pv.innerHTML = ''; $('#err').textContent = e.message; }
  }
  $('#url').addEventListener('change', load);
  $('#url').addEventListener('paste', () => setTimeout(load, 50));
  $('#paste').onclick = async () => {
    try { $('#url').value = (await navigator.clipboard.readText()).trim(); load(); }
    catch { toast('Tieni premuto nel campo e scegli Incolla'); $('#url').focus(); }
  };
  $('#cancel').onclick = closeSheet;
  $('#save').onclick = async () => {
    const body = { ...w, title: $('#title').value, price: $('#price').value, note: $('#note').value, url: $('#url').value.trim() };
    try {
      if (existing) await api('PUT', `/api/groups/${code}/wishes/${existing.id}`, body, code);
      else await api('POST', `/api/groups/${code}/wishes`, body, code);
      closeSheet(); done(); toast('Salvato ✓');
    } catch (e) { $('#err').textContent = e.message; }
  };
}

// ----- tab: gruppo -----
function paneGruppo(el) {
  const { group, me, members, code } = ctx;
  const link = `${location.origin}/g/${code}`;
  const canEdit = me.isAdmin && !group.drawn;
  const name = (id) => members.find((m) => m.id === id)?.name || '?';
  const pairs = ctx.exclusions || [];
  // coppie uniche non orientate
  const uniq = []; const seen = new Set();
  for (const [a, b] of pairs) { const k = [a, b].sort().join('-'); if (!seen.has(k)) { seen.add(k); uniq.push([a, b]); } }

  el.innerHTML = `
    <div class="card"><strong>Invita le persone</strong>
      <p class="muted">Manda questo link: ognuno sceglie nome e PIN.</p>
      <input readonly value="${esc(link)}" id="lnk">
      <div class="row" style="margin-top:10px"><button class="grow" id="share">Condividi</button><button class="ghost" id="copy">Copia</button></div></div>

    <h2>Partecipanti (${members.length}) ${group.drawn ? '<span class="badge ok">Sorteggio fatto</span>' : ''}</h2>
    <div class="card" style="padding:4px 16px">${members.map((m) => `
      <div class="member">${avatar(m.name)}<div class="grow"><strong>${esc(m.name)}</strong> ${m.isAdmin ? '<span class="badge">organizzatore</span>' : ''}${m.id === me.id ? ' <span class="muted">(tu)</span>' : ''}</div>
      ${canEdit && !m.isAdmin ? `<button class="small danger" data-rm="${m.id}">Rimuovi</button>` : ''}</div>`).join('')}</div>

    ${canEdit ? `
    <h2>Esclusioni</h2>
    <div class="card"><p class="muted">Coppie che non devono pescarsi (es. fidanzati).</p>
      ${uniq.map(([a, b], i) => `<div class="pair"><span>${esc(name(a))} ↔ ${esc(name(b))}</span><button class="small danger" data-unex="${i}">Togli</button></div>`).join('')}
      <div class="row" style="margin-top:8px"><select id="exa">${members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
      <select id="exb">${members.map((m, i) => `<option value="${m.id}" ${i === 1 ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <button class="small" id="exadd">＋</button></div></div>

    <h2>Sorteggio</h2>
    <div class="card"><p>Quando tutti sono dentro, fai il sorteggio. <strong>Nessuno vedrà gli abbinamenti degli altri, nemmeno tu.</strong> Dopo non si potrà più modificare.</p>
      <button class="block green" id="draw" ${members.length < 3 ? 'disabled' : ''}>🎲 Fai il sorteggio</button>
      ${members.length < 3 ? '<p class="muted">Servono almeno 3 partecipanti.</p>' : ''}
      <div class="error" id="err"></div></div>` : ''}

    <p style="margin-top:24px"><button class="ghost" id="logout">Esci da questo gruppo</button></p>`;

  const $ = (s) => el.querySelector(s);
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiato'); } catch { $('#lnk').select(); toast('Seleziona e copia il link'); } };
  $('#share').onclick = async () => {
    const text = `Ti invito al Secret Santa "${group.name}" 🎅`;
    if (navigator.share) { try { await navigator.share({ title: group.name, text, url: link }); } catch { /* annullato */ } }
    else { $('#copy').click(); }
  };
  $('#logout').onclick = () => { if (confirm('Uscire? Potrai rientrare con nome e PIN.')) { store.remove(code); navigate('/'); } };
  el.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
    if (!confirm('Rimuovere questa persona?')) return;
    try { await api('DELETE', `/api/groups/${code}/members/${b.dataset.rm}`, null, code); viewGroup(code); } catch (e) { toast(e.message); }
  });
  const saveEx = async (list) => {
    try { await api('PUT', `/api/groups/${code}/exclusions`, { pairs: list }, code); ctx.exclusions = list; render(); }
    catch (e) { toast(e.message); }
  };
  $('#exadd')?.addEventListener('click', () => {
    const a = Number($('#exa').value), b = Number($('#exb').value);
    if (a === b) return toast('Scegli due persone diverse');
    saveEx([...uniq, [a, b]]);
  });
  el.querySelectorAll('[data-unex]').forEach((b) => b.onclick = () => saveEx(uniq.filter((_, i) => i !== Number(b.dataset.unex))));
  $('#draw')?.addEventListener('click', async () => {
    if (!confirm('Fare il sorteggio adesso? Non si può annullare.')) return;
    try { await api('POST', `/api/groups/${code}/draw`, {}, code); tab = 'abbinamento'; revealed = false; viewGroup(code); toast('Sorteggio fatto! 🎉'); confetti(); }
    catch (e) { $('#err').textContent = e.message; }
  });
}

initSnow();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
route();
