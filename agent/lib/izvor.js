// Provjera izvora: domena s popisa dopuštenih, stranica se stvarno može dohvatiti i citat je doslovno na njoj.
// Ovo radi naš kod, ne model, pa model ne može "izmisliti" da je provjera prošla.
'use strict';
const { htmlUTekst, nadjiCitat, odgovorUCitatu } = require('./tekst');

function domenaDopustena(url, dopustene) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return dopustene.some(d => h === d || h.endsWith('.' + d));
}

// Dohvaćene stranice pamtimo tijekom jednog pokretanja (više pitanja često ima isti izvor).
function napraviDohvat({ fetchFn = globalThis.fetch, timeoutMs = 20000, dopustene }) {
  const cache = new Map();
  return async function dohvati(url) {
    if (cache.has(url)) return cache.get(url);
    const p = (async () => {
      if (!domenaDopustena(url, dopustene)) return { ok: false, greska: 'domena nije na popisu pouzdanih izvora' };
      try {
        const r = await fetchFn(url, {
          redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; dnevni-kviz-provjera-izvora/1.0)', 'Accept-Language': 'hr,en;q=0.5' },
        });
        if (!r.ok) return { ok: false, greska: `HTTP ${r.status}` };
        if (r.url && !domenaDopustena(r.url, dopustene)) return { ok: false, greska: 'preusmjereno izvan pouzdanih izvora' };
        const tip = r.headers.get('content-type') || '';
        if (!/html|text\/plain/i.test(tip)) return { ok: false, greska: `nepodržan sadržaj (${tip})` };
        const tekst = htmlUTekst(await r.text());
        return { ok: true, tekst };
      } catch (e) {
        return { ok: false, greska: 'dohvat nije uspio: ' + (e.name === 'TimeoutError' ? 'isteklo vrijeme' : e.message) };
      }
    })();
    cache.set(url, p);
    return p;
  };
}

// Vraća { ok, isjecak } ili { ok:false, razlog }.
async function provjeriIzvor(kandidat, dohvati) {
  const str = await dohvati(kandidat.izvor_url);
  if (!str.ok) return { ok: false, razlog: 'izvor: ' + str.greska };
  const isjecak = nadjiCitat(str.tekst, kandidat.izvor_citat);
  if (!isjecak) return { ok: false, razlog: 'citat nije pronađen na stranici izvora' };
  if (!odgovorUCitatu(kandidat.tocan, kandidat.izvor_citat)) return { ok: false, razlog: 'točan odgovor se ne vidi u citatu' };
  return { ok: true, isjecak };
}

module.exports = { domenaDopustena, napraviDohvat, provjeriIzvor };
