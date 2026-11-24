// Secret Santa PWA – frontend senza dipendenze
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
    <div class="hero"><div class="emoji">🎅</div><h1>Secret Santa</h1>
      <p class="muted">Sorteggio segreto e liste dei desideri, senza spoiler.</p></div>
    ${entries.length ? `<h2>I tuoi gruppi</h2>` + entries.map(([code, s]) => `
      <a data-nav href="/g/${code}" class="card row between" style="text-decoration:none;color:inherit">
        <div><strong>${esc(s.groupName || code)}</strong><div class="muted">Sei ${esc(s.name || '')}</div></div><span>›</span>
      </a>`).join('') : ''}
    <h2>Crea un nuovo gruppo</h2>
    <form id="create" class="card">
      <label>Nome del gruppo</label><input name="name" placeholder="Natale in famiglia 2026" required maxlength="60">
      <label>Budget (facoltativo)</label><input name="budget" placeholder="es. 20 €" maxlength="30">
      <label>Data dello scambio (facoltativa)</label><input name="eventDate" type="date">
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
  $app.innerHTML = `<div class="hero"><div class="emoji">🎁</div><p class="muted">Carico…</p></div>`;
  let info;
  try { info = await api('GET', `/api/groups/${code}/public`); }
  catch { $app.innerHTML = `<div class="empty"><span class="emoji">🤔</span>Gruppo non trovato.<p><a data-nav href="/">Torna alla home</a></p></div>`; return; }
  $app.innerHTML = `
    <div class="hero"><div class="emoji">🎅</div><h1>${esc(info.name)}</h1>
      <p class="muted">${info.members} partecipanti${info.budget ? ' · budget ' + esc(info.budget) : ''}${info.eventDate ? ' · ' + fmtDate(info.eventDate) : ''}</p></div>
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
    <div class="row between"><a data-nav href="/" class="link">‹ Home</a><span class="muted">${esc(me.name)}${me.isAdmin ? ' · organizzatore' : ''}</span></div>
    <h1>${esc(group.name)}</h1>
    <p class="muted">${[group.budget && 'Budget ' + esc(group.budget), group.eventDate && fmtDate(group.eventDate)].filter(Boolean).join(' · ')}</p>
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
  const { group, code } = ctx;
  if (!group.drawn) {
    el.innerHTML = `<div class="empty"><span class="emoji">⏳</span><strong>Il sorteggio non è ancora stato fatto.</strong>
      <p>Intanto scrivi la tua lista dei desideri: chi ti pescherà saprà cosa regalarti.</p>
      <p><button data-go="lista">Vai alla mia lista</button></p></div>`;
    el.querySelector('[data-go]').onclick = () => { tab = 'lista'; render(); };
    return;
  }
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  let g;
  try { g = await api('GET', `/api/groups/${code}/giftee`, null, code); }
  catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }

  const paint = () => {
    el.innerHTML = `
      <div class="reveal ${revealed ? 'open' : ''}" id="reveal">
        ${revealed
          ? `<div class="emoji">🎁</div><div>Fai il regalo a</div><div class="big">${esc(g.name)}</div><div style="opacity:.85;font-size:14px">Tocca per nascondere</div>`
          : `<div class="emoji">🤫</div><div class="big">Tocca per scoprire</div><div style="opacity:.85;font-size:14px">a chi farai il regalo</div>`}
      </div>
      ${revealed ? `<h2>Desideri di ${esc(g.name)}</h2>${g.wishes.length ? g.wishes.map(wishCard).join('') :
        `<div class="empty"><span class="emoji">🕵️</span>${esc(g.name)} non ha ancora scritto nulla. Riprova più tardi!</div>`}` : ''}`;
    el.querySelector('#reveal').onclick = () => { revealed = !revealed; paint(); };
    el.querySelectorAll('[data-reserve]').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.reserve);
      try {
        const r = await api('POST', `/api/groups/${code}/wishes/${id}/reserve`, {}, code);
        g.wishes.find((w) => w.id === id).reserved = r.reserved;
        paint();
      } catch (e) { toast(e.message); }
    }));
  };
  const wishCard = (w) => `
    <div class="card wish ${w.reserved ? 'reserved' : ''}">
      <div class="thumb">${w.image ? `<img src="${esc(w.image)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : '🎁'}</div>
      <div class="grow"><div class="t">${esc(w.title)}</div>
        <div class="meta">${[w.price && esc(w.price), w.site && esc(w.site)].filter(Boolean).join(' · ')}</div>
        ${w.note ? `<div class="meta">“${esc(w.note)}”</div>` : ''}
        <div class="actions">
          ${w.url ? `<a class="btn small ghost" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">Apri ↗</a>` : ''}
          <button class="small ${w.reserved ? 'ghost' : 'green'}" data-reserve="${w.id}">${w.reserved ? 'Segnato come preso ✓' : 'Lo prendo io'}</button>
        </div></div>
    </div>`;
  paint();
}

// ----- tab: la mia lista -----
async function paneLista(el) {
  const { code } = ctx;
  el.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  let wishes;
  try { wishes = await api('GET', `/api/groups/${code}/wishes`, null, code); }
  catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }

  el.innerHTML = `
    <button class="block" id="add">＋ Aggiungi un desiderio</button>
    <p class="muted" style="margin-top:10px">Solo chi ti pescherà vedrà questa lista. Tu non vedrai mai se qualcuno ha già preso qualcosa.</p>
    ${wishes.length ? wishes.map((w) => `
      <div class="card wish">
        <div class="thumb">${w.image ? `<img src="${esc(w.image)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : '🎁'}</div>
        <div class="grow"><div class="t">${esc(w.title)}</div>
          <div class="meta">${[w.price && esc(w.price), w.site && esc(w.site)].filter(Boolean).join(' · ')}</div>
          ${w.note ? `<div class="meta">“${esc(w.note)}”</div>` : ''}
          <div class="actions">
            ${w.url ? `<a class="btn small ghost" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">Apri ↗</a>` : ''}
            <button class="small ghost" data-edit="${w.id}">Modifica</button>
            <button class="small danger" data-del="${w.id}">Elimina</button>
          </div></div>
      </div>`).join('') : `<div class="empty"><span class="emoji">📝</span>Nessun desiderio ancora.<br>Aggiungi link da Amazon o da qualsiasi negozio!</div>`}`;
  const refresh = () => paneLista(el);
  el.querySelector('#add').onclick = () => wishSheet(null, refresh);
  el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => wishSheet(wishes.find((w) => w.id === Number(b.dataset.edit)), refresh));
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Eliminare questo desiderio?')) return;
    try { await api('DELETE', `/api/groups/${code}/wishes/${b.dataset.del}`, null, code); refresh(); } catch (e) { toast(e.message); }
  });
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
      <div class="pair"><span>${esc(m.name)} ${m.isAdmin ? '<span class="badge">organizzatore</span>' : ''}${m.id === me.id ? ' <span class="muted">(tu)</span>' : ''}</span>
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
    try { await api('POST', `/api/groups/${code}/draw`, {}, code); tab = 'abbinamento'; revealed = false; viewGroup(code); toast('Sorteggio fatto! 🎉'); }
    catch (e) { $('#err').textContent = e.message; }
  });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
route();
