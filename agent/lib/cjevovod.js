// Cjevovod za jedan dan: koliko pitanja nedostaje -> sastavi -> formalna provjera -> duplikati ->
// provjera izvora (naš kod) -> slijepa provjera (drugi poziv modela) -> banka -> raspored.
'use strict';
const crypto = require('node:crypto');
const { IndeksSlicnosti, kljuc } = require('./tekst');
const { provjeriIzvor, domenaDopustena } = require('./izvor');
const { slozi, rezerva, potrebno } = require('./banka');
const model = require('./model');

function formalnaProvjera(k, dopustene) {
  const str = v => typeof v === 'string' && v.trim().length > 0;
  if (!str(k.pitanje) || !str(k.tocan) || !Array.isArray(k.netocni) || k.netocni.length !== 3 || !k.netocni.every(str)) return 'neispravan format';
  if (!str(k.izvor_url) || !str(k.izvor_citat)) return 'nema izvora';
  if (!k.pitanje.trim().endsWith('?')) return 'pitanje ne završava upitnikom';
  if (k.pitanje.length > 200) return 'pitanje je predugo';
  const svi = [k.tocan, ...k.netocni];
  if (svi.some(o => o.length > 60)) return 'odgovor je predug';
  if (new Set(svi.map(kljuc)).size !== 4) return 'odgovori se ponavljaju';
  if (svi.some(o => /\b(sve|ništa) (od )?navedeno/i.test(o))) return 'zabranjen tip odgovora';
  if (!domenaDopustena(k.izvor_url, dopustene)) return 'izvor nije na popisu pouzdanih domena';
  return null;
}

// Determinističko miješanje za slijepu provjeru (da se ponovljeno pokretanje ponaša isto).
function redoslijedZa(tekst) {
  const a = [0, 1, 2, 3];
  const h = crypto.createHash('sha256').update(tekst).digest();
  for (let i = 3; i > 0; i--) { const j = h[i] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function napraviIndeks(banka, stara, prag) {
  const ind = new IndeksSlicnosti(prag);
  for (const p of banka.pitanja) if (p.status !== 'odbaceno') ind.dodaj(p.id, p.pitanje, p.odgovori[0]);
  stara.forEach(([, tekst, opts], i) => ind.dodaj('questions.js#' + (i + 1), tekst, opts[0]));
  return ind;
}

async function pripremiDan({ datum, banka, cfg, razine, client, dohvati, stara = [], log = () => {}, potrosnja, danas }) {
  const izvjesce = { datum, prihvaceno: [], odbijeno: [], napomene: [] };
  const piramida = cfg.piramideDnevno;
  const treba = potrebno(razine, piramida);
  const imaRezerve = rezerva(banka, datum, razine, { samoNekoristena: cfg.uvijekNovaPitanja, prozorDana: cfg.bezPonavljanjaDana });
  const ind = napraviIndeks(banka, stara, cfg.slicnost);

  for (const r of razine) {
    const cilj = Math.max(0, treba[r.level] + (cfg.dodatnaRezervaPoRazini || 0) - imaRezerve[r.level]);
    let primljeno = 0;
    for (let pokusaj = 0; primljeno < cilj && pokusaj < cfg.maxPokusajaPoRazini; pokusaj++) {
      if (model.cijena(potrosnja, cfg.cijene) >= cfg.maxTrosakPoPokretanjuUSD) {
        izvjesce.napomene.push(`Dosegnut proračun od ${cfg.maxTrosakPoPokretanjuUSD} USD; razina ${r.level} nije dovršena.`);
        break;
      }
      const broj = Math.min(cfg.generator.pitanjaPoPozivu, Math.ceil((cilj - primljeno) * cfg.generator.visakZbogOdbijanja));
      const izbjegavaj = banka.pitanja.filter(p => p.razina === r.level && p.status !== 'odbaceno').slice(-cfg.generator.maxIzbjegavaj).map(p => p.odgovori[0]);
      log(`${datum} razina ${r.level}: tražim ${broj} (nedostaje ${cilj - primljeno})`);
      let gen;
      try { gen = await model.generiraj(client, cfg, { razina: r.level, broj, kategorije: cfg.kategorije, izbjegavaj }, potrosnja); }
      catch (e) { izvjesce.napomene.push(`Greška API-ja (razina ${r.level}): ${e.message}`); break; }
      if (gen.greska) izvjesce.napomene.push(`Razina ${r.level}: ${gen.greska}`);
      for (const k of gen.pitanja) {
        if (primljeno >= cilj) break;
        const odbij = razlog => izvjesce.odbijeno.push({ razina: r.level, pitanje: k?.pitanje, razlog });
        const f = formalnaProvjera(k, cfg.dopusteneDomene);
        if (f) { odbij(f); continue; }
        const sl = ind.nadjiSlicno(k.pitanje, k.tocan);
        if (sl) { odbij(`duplikat (${sl.razlog}, ${sl.id}, ${(sl.slicnost * 100).toFixed(0)} %)`); continue; }
        const iz = await provjeriIzvor(k, dohvati);
        if (!iz.ok) { odbij(iz.razlog); continue; }
        let pr;
        try { pr = await model.provjeri(client, cfg, { kandidat: k, razina: r.level, isjecak: iz.isjecak, redoslijed: redoslijedZa(k.pitanje) }, potrosnja); }
        catch (e) { odbij('provjera: greška API-ja ' + e.message); continue; }
        if (!pr.ok) { odbij(pr.razlog); continue; }
        const p = {
          id: banka.sljedeciId(danas), razina: r.level, kategorija: k.kategorija,
          pitanje: k.pitanje.trim(), odgovori: [k.tocan.trim(), ...k.netocni.map(s => s.trim())],
          izvor: { url: k.izvor_url, citat: k.izvor_citat.trim() },
          status: 'provjereno', dodano: danas,
          provjera: { generator: cfg.generator.model, provjeravatelj: cfg.provjera.model, napomena: pr.napomena || '' },
        };
        banka.dodaj(p); ind.dodaj(p.id, p.pitanje, p.odgovori[0]);
        izvjesce.prihvaceno.push(p.id); primljeno++;
      }
    }
  }

  const s = slozi(banka, datum, { razine, piramida, prozorDana: cfg.bezPonavljanjaDana });
  if (s.manjak) {
    izvjesce.napomene.push('Raspored NIJE napravljen; nedostaje provjerenih pitanja po razinama: ' +
      Object.entries(s.manjak).map(([l, n]) => `razina ${l}: ${n}`).join(', ') + '. Igra će taj dan koristiti staru bazu.');
  } else {
    banka.rasporedi.set(datum, s.raspored);
    izvjesce.raspored = true;
    if (s.raspored.ponovljeno.length) izvjesce.napomene.push(`Ponovljeno ${s.raspored.ponovljeno.length} starijih pitanja (izvan razdoblja od ${cfg.bezPonavljanjaDana} dana).`);
  }
  return izvjesce;
}

module.exports = { pripremiDan, formalnaProvjera, redoslijedZa };
