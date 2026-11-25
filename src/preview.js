const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAX_BYTES = 500_000; // i meta tag stanno all'inizio; limita anche la CPU
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 8000;

// ---------- sicurezza (SSRF) ----------
const isIPv4 = (s) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
const isIPv6 = (s) => s.includes(':') && /^[0-9a-f:.]+$/i.test(s);
const isIP = (s) => isIPv4(s) || isIPv6(s);

export function isPrivateIp(ip) {
  if (isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l.startsWith('::ffff:')) return isPrivateIp(l.slice(7));
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
  }
  return true;
}

// Nei Workers non c'è DNS lookup, ma fetch() non può comunque raggiungere reti private:
// qui blocchiamo IP letterali e nomi interni ovvi.
async function assertPublicHost(hostname, allowPrivate) {
  if (allowPrivate) return;
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(h) ? isPrivateIp(h) : (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.'))) {
    throw new Error('Indirizzo non consentito');
  }
}

// ---------- parsing HTML ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€' };
export function decodeEntities(s = '') {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

function collectJsonLdProducts(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => collectJsonLdProducts(n, out));
  const t = node['@type'];
  const types = Array.isArray(t) ? t : [t];
  if (types.includes('Product')) out.push(node);
  if (node['@graph']) collectJsonLdProducts(node['@graph'], out);
}

function firstString(v) {
  if (Array.isArray(v)) return firstString(v[0]);
  if (v && typeof v === 'object') return firstString(v.url ?? v.contentUrl);
  return typeof v === 'string' ? v : undefined;
}

function normalizePrice(amount, currency) {
  if (amount == null || amount === '') return undefined;
  const num = parseFloat(String(amount).replace(',', '.'));
  if (!isFinite(num) || num <= 0) return undefined;
  const cur = (currency || 'EUR').toUpperCase();
  const sym = { EUR: '€', USD: '$', GBP: '£' }[cur];
  const fmt = num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${fmt} ${sym}` : `${fmt} ${cur}`;
}

export function parseHtml(html, baseUrl) {
  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content;
  }

  const products = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectJsonLdProducts(JSON.parse(m[1].trim()), products);
    } catch { /* json-ld malformato: ignora */ }
  }
  const p = products[0];
  let offer = p?.offers;
  if (Array.isArray(offer)) offer = offer[0];

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = (
    meta['og:title'] || p?.name || meta['twitter:title'] || decodeEntities(titleTag || '')
  ).trim().replace(/\s+/g, ' ');

  let image = meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || firstString(p?.image);
  if (image) {
    try { image = new URL(image, baseUrl).toString(); } catch { image = undefined; }
  }

  const price = normalizePrice(
    meta['product:price:amount'] || meta['og:price:amount'] || offer?.price || offer?.lowPrice,
    meta['product:price:currency'] || meta['og:price:currency'] || offer?.priceCurrency,
  );

  return { title: title || undefined, image, price };
}

// ---------- Amazon: fallback senza scraping ----------
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

export function amazonInfo(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  if (!/(^|\.)amazon\.[a-z.]+$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/i);
  if (!m) return null;
  const asin = m[1].toUpperCase();
  const slug = u.pathname.split('/dp/')[0].split('/').filter(Boolean).pop();
  const title = slug && !/^(gp|dp|product)$/i.test(slug)
    ? safeDecode(slug).replace(/[-_]+/g, ' ').trim()
    : undefined;
  return {
    asin,
    title,
    url: `https://${u.hostname}/dp/${asin}`,
    image: `https://m.media-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`,
  };
}

const isAmazonShort = (h) => /^(amzn\.(to|eu)|a\.co)$/i.test(h);

// ---------- fetch ----------
async function readLimited(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    chunks.push(value);
    if (total >= MAX_BYTES) { await reader.cancel(); break; }
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  const cs = /charset=([\w-]+)/i.exec(res.headers.get('content-type') || '')?.[1] || 'utf-8';
  try { return new TextDecoder(cs).decode(buf); } catch { return new TextDecoder().decode(buf); }
}

async function fetchHtml(startUrl, allowPrivate) {
  let url = startUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error('Link non valido');
    await assertPublicHost(u.hostname, allowPrivate);
    const res = await fetch(u, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'it-IT,it;q=0.9' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), u).toString();
      continue;
    }
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.finalUrl = url; throw e; }
    return { html: await readLimited(res), finalUrl: url };
  }
  throw new Error('Troppi reindirizzamenti');
}

export function cleanUrl(raw) {
  let u = new URL(raw);
  for (const k of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|igshid$|mc_cid$|mc_eid$|ref_src$|spm$)/i.test(k)) u.searchParams.delete(k); // solo tracciamento: mai parametri che cambiano la pagina
  }
  u.hash = '';
  return u.toString();
}

/** Ricava titolo/immagine/prezzo da un link prodotto. Non lancia mai per fallimenti "normali". */
export async function fetchPreview(rawUrl, { allowPrivate = false } = {}) {
  let input = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  let u;
  try { u = new URL(input); } catch { throw new Error('Link non valido'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Link non valido');

  const result = { url: cleanUrl(u.toString()), site: u.hostname.replace(/^www\./, '') };
  let final = u.toString();

  try {
    const { html, finalUrl } = await fetchHtml(final, allowPrivate);
    final = finalUrl;
    Object.assign(result, parseHtml(html, finalUrl));
  } catch (e) {
    if (e.finalUrl) final = e.finalUrl;
  }

  // Link corti Amazon o pagine che bloccano i bot: ricostruisci da ASIN
  const fu = new URL(final);
  result.site = fu.hostname.replace(/^www\./, '');
  const amz = amazonInfo(final);
  if (amz) {
    result.url = amz.url;
    result.title ||= amz.title;
    result.image ||= amz.image;
  } else if (!isAmazonShort(fu.hostname)) {
    result.url = cleanUrl(final);
  }
  // Titoli "bot check" di Amazon & co.
  if (result.title && /robot|captcha|access denied|just a moment/i.test(result.title)) {
    result.title = amz?.title;
  }
  return result;
}
