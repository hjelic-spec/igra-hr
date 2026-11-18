// Pomoćne funkcije za tekst: normalizacija, sličnost pitanja, provjera citata.
'use strict';

// Za usporedbu: mala slova, bez dijakritika, ujednačeni navodnici i crtice, jedan razmak.
function normaliziraj(s, { dijakritici = false } = {}) {
  let t = String(s ?? '').normalize('NFKC').toLowerCase()
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟«»„”]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/­/g, '')
    .replace(/\s+/g, ' ').trim();
  if (!dijakritici) t = t.replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t;
}

// Ključ za usporedbu: samo slova i brojke.
const kljuc = s => normaliziraj(s).replace(/[^a-z0-9]+/g, ' ').trim();

function trigrami(s) {
  const t = ' ' + kljuc(s) + ' ';
  const out = new Set();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}

// Indeks postojećih pitanja za brzu provjeru duplikata.
class IndeksSlicnosti {
  constructor(prag = { pitanje: 0.55, istiOdgovor: 0.3 }) { this.prag = prag; this.stavke = []; }
  dodaj(id, pitanje, tocan) { this.stavke.push({ id, tri: trigrami(pitanje), odg: kljuc(tocan), tekst: kljuc(pitanje) }); }
  // Vraća { id, slicnost, razlog } najsličnijeg pitanja koje prelazi prag, ili null.
  nadjiSlicno(pitanje, tocan) {
    const tri = trigrami(pitanje), odg = kljuc(tocan), tekst = kljuc(pitanje);
    let naj = null;
    for (const s of this.stavke) {
      if (s.tekst === tekst) return { id: s.id, slicnost: 1, razlog: 'isto pitanje' };
      const j = jaccard(tri, s.tri);
      const prag = s.odg === odg ? this.prag.istiOdgovor : this.prag.pitanje;
      if (j >= prag && (!naj || j > naj.slicnost)) naj = { id: s.id, slicnost: j, razlog: s.odg === odg ? 'isti odgovor, slično pitanje' : 'slično pitanje' };
    }
    return naj;
  }
}

// HTML -> običan tekst (dovoljno za traženje citata; nije potpun HTML parser).
const ENTITETI = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', shy: '',
  scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž', ccaron: 'č', Ccaron: 'Č', cacute: 'ć', Cacute: 'Ć',
  dstrok: 'đ', Dstrok: 'Đ', eacute: 'é', ouml: 'ö', uuml: 'ü', auml: 'ä', deg: '°', times: '×' };
function htmlUTekst(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTITETI ? ENTITETI[n] : m))
    .replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

// Je li citat doslovno na stranici (nakon normalizacije)? Vraća isječak oko citata ili null.
function nadjiCitat(tekstStranice, citat, okolo = 1500) {
  const stranica = normaliziraj(tekstStranice, { dijakritici: true });
  const c = normaliziraj(citat, { dijakritici: true }).replace(/^[\s"'.…]+|[\s"'.…]+$/g, '');
  if (c.length < 20) return null;
  const i = stranica.indexOf(c);
  if (i < 0) return null;
  return stranica.slice(Math.max(0, i - okolo), i + c.length + okolo);
}

// Slaže li se točan odgovor s citatom? Hrvatski se sklanja, pa uspoređujemo početke riječi (4 slova),
// a brojke točno. Dovoljno je da se pojavi barem pola značajnih riječi odgovora.
function odgovorUCitatu(odgovor, citat) {
  const c = ' ' + kljuc(citat) + ' ';
  const rijeci = kljuc(odgovor).split(' ').filter(w => /\d/.test(w) || w.length >= 3);
  if (!rijeci.length) return false;
  const pogodaka = rijeci.filter(w => /^\d+$/.test(w) ? c.includes(' ' + w + ' ') : c.includes(' ' + w.slice(0, Math.min(4, w.length)))).length;
  return pogodaka >= Math.ceil(rijeci.length / 2);
}

module.exports = { normaliziraj, kljuc, trigrami, jaccard, IndeksSlicnosti, htmlUTekst, nadjiCitat, odgovorUCitatu };
