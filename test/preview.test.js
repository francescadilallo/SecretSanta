import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseHtml, amazonInfo, isPrivateIp, fetchPreview } from '../src/preview.js';

test('parseHtml: Open Graph', () => {
  const html = `<html><head><title>x</title>
    <meta property="og:title" content="Lego &amp; Co &#8211; Set">
    <meta property="og:image" content="/img/a.jpg">
    <meta property="product:price:amount" content="29,90">
    <meta property="product:price:currency" content="EUR"></head></html>`;
  const r = parseHtml(html, 'https://shop.example/p/1');
  assert.equal(r.title, 'Lego & Co – Set');
  assert.equal(r.image, 'https://shop.example/img/a.jpg');
  assert.match(r.price, /29,90/);
});

test('parseHtml: JSON-LD Product (anche in @graph)', () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Cuffie","image":["https://x/i.png"],"offers":{"@type":"Offer","price":"59.00","priceCurrency":"EUR"}}]}</script>`;
  const r = parseHtml(html, 'https://x/');
  assert.equal(r.title, 'Cuffie');
  assert.equal(r.image, 'https://x/i.png');
  assert.match(r.price, /59,00/);
});

test('amazonInfo: ASIN, slug e url pulito', () => {
  const a = amazonInfo('https://www.amazon.it/Cuffie-Bluetooth-Sony/dp/B0BDHWDR12/ref=sr_1_3?tag=x');
  assert.equal(a.asin, 'B0BDHWDR12');
  assert.equal(a.url, 'https://www.amazon.it/dp/B0BDHWDR12');
  assert.equal(a.title, 'Cuffie Bluetooth Sony');
  assert.equal(amazonInfo('https://example.com/dp/B0BDHWDR12'), null);
});

test('SSRF: IP privati bloccati', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1'])
    assert.ok(isPrivateIp(ip), ip);
  assert.ok(!isPrivateIp('8.8.8.8'));
});

test('fetchPreview rifiuta localhost di default e legge una pagina locale se consentito', async () => {
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<meta property="og:title" content="Libro"><meta property="og:image" content="https://i/x.jpg">');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/p?utm_source=a`;
  try {
    const blocked = await fetchPreview(url);
    assert.equal(blocked.title, undefined);
    const ok = await fetchPreview(url, { allowPrivate: true });
    assert.equal(ok.title, 'Libro');
    assert.ok(!ok.url.includes('utm_source'));
  } finally { srv.close(); }
});

test('amazonInfo: % malformato nel titolo non lancia errori', () => {
  const a = amazonInfo('https://www.amazon.it/%E0%A4%A/dp/B0BDHWDR12');
  assert.equal(a.asin, 'B0BDHWDR12');
});

test('cleanUrl: toglie solo il tracciamento, non i parametri che cambiano la pagina', async () => {
  const { cleanUrl } = await import('../src/preview.js');
  assert.equal(cleanUrl('https://shop.it/cerca?keywords=lego&utm_source=x&fbclid=1&color=rosso'), 'https://shop.it/cerca?keywords=lego&color=rosso');
});

test('redirect verso un indirizzo interno viene bloccato anche partendo da un host pubblico', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (u) => {
    calls.push(String(u));
    if (String(u).startsWith('https://shop.example/')) return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
    return new Response('<meta property="og:title" content="SEGRETO">', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  try {
    const r = await fetchPreview('https://shop.example/x');
    assert.equal(r.title, undefined);
    assert.deepEqual(calls, ['https://shop.example/x'], 'non deve richiedere l\'indirizzo interno');
  } finally { globalThis.fetch = realFetch; }
});
