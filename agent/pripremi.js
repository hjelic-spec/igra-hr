#!/usr/bin/env node
// Agent za dnevna pitanja. Pokreće ga zakazani GitHub Actions posao (.github/workflows/dnevna-pitanja.yml),
// a može i ručno:
//   node agent/pripremi.js                 # pripremi rasporede za idućih N dana (N = danaUnaprijed)
//   node agent/pripremi.js --dana 7        # za idućih 7 dana
//   node agent/pripremi.js --bez-api       # samo složi raspored iz već provjerenih pitanja (ništa ne plaća)
//   node agent/pripremi.js --odbaci p20261118-004,p20261118-009   # odbaci pitanja i presloži buduće dane
// Treba varijablu ANTHROPIC_API_KEY (osim uz --bez-api). Izvješće (Markdown) ide na stdout i u --izvjesce datoteku.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Banka, slozi, dodajDane, danasZagreb } = require('./lib/banka');
const { napraviDohvat } = require('./lib/izvor');
const { pripremiDan } = require('./lib/cjevovod');
const { cijena } = require('./lib/model');

const KORIJEN = path.join(__dirname, '..');

function argumenti(argv) {
  const a = { dana: null, bezApi: false, odbaci: [], izvjesce: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--dana') a.dana = Number(argv[++i]);
    else if (x === '--bez-api') a.bezApi = true;
    else if (x === '--odbaci') a.odbaci = String(argv[++i] || '').split(/[\s,]+/).filter(Boolean);
    else if (x === '--izvjesce') a.izvjesce = argv[++i];
    else throw new Error('Nepoznat argument: ' + x);
  }
  return a;
}

function izvjesceMd({ izvjesca, potrosnja, cfg, odbaceno, banka }) {
  const L = [];
  const ukupno = banka.pitanja.filter(p => p.status === 'provjereno').length;
  L.push(`Provjerenih pitanja u banci: **${ukupno}**. Pitanja se ne ponavljaju unutar **${cfg.bezPonavljanjaDana} dana**.`);
  if (potrosnja.pozivi) L.push(`Potrošnja API-ja: ${potrosnja.pozivi} poziva, ${potrosnja.pretrage} pretraga, procjena **${cijena(potrosnja, cfg.cijene).toFixed(2)} USD**.`);
  if (odbaceno.length) L.push(`Ručno odbačena pitanja: ${odbaceno.join(', ')}.`);
  for (const iz of izvjesca) {
    L.push('', `### ${iz.datum}: ${iz.raspored ? 'raspored spreman' : 'raspored NIJE spreman'}`);
    for (const n of iz.napomene) L.push(`- ⚠️ ${n}`);
    if (iz.prihvaceno.length) {
      L.push('', `Nova pitanja (${iz.prihvaceno.length}):`, '', '| ID | Razina | Pitanje | Točan odgovor | Izvor |', '|---|---|---|---|---|');
      for (const id of iz.prihvaceno) {
        const p = banka.poId(id);
        const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        L.push(`| ${id} | ${p.razina} | ${esc(p.pitanje)} | ${esc(p.odgovori[0])} | [izvor](${p.izvor.url} "${esc(p.izvor.citat).replace(/"/g, "'")}") |`);
      }
    }
    if (iz.odbijeno?.length) {
      L.push('', `<details><summary>Odbijeno ${iz.odbijeno.length}</summary>`, '');
      for (const o of iz.odbijeno) L.push(`- (razina ${o.razina}) ${o.pitanje || '?'}: ${o.razlog}`);
      L.push('', '</details>');
    }
  }
  return L.join('\n');
}

async function main() {
  const a = argumenti(process.argv.slice(2));
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  const { RULES } = require(path.join(KORIJEN, 'public', 'game.js'));
  const razine = RULES.levels;
  const stara = require(path.join(KORIJEN, 'questions.js'));
  const banka = new Banka(path.join(KORIJEN, 'pitanja'));
  const danas = danasZagreb();
  const potrosnja = { ulaz: 0, cache: 0, izlaz: 0, pretrage: 0, pozivi: 0 };
  const log = s => console.error(s);

  // 1) Ručno odbačena pitanja: označi ih i obriši buduće rasporede u kojima su (opet će se složiti niže).
  const odbaceno = [];
  for (const id of a.odbaci) {
    const p = banka.poId(id);
    if (!p) throw new Error('Nema pitanja ' + id);
    p.status = 'odbaceno'; odbaceno.push(id);
  }
  const dana = a.dana ?? cfg.danaUnaprijed;
  const datumi = Array.from({ length: dana }, (_, i) => dodajDane(danas, i + 1));
  for (const [d, r] of banka.rasporedi) {
    if (d > danas && r.piramide.flat().some(id => banka.poId(id)?.status !== 'provjereno')) {
      banka.rasporedi.delete(d);
      fs.rmSync(path.join(banka.dirRaspored, d + '.json'), { force: true });
      if (!datumi.includes(d)) datumi.push(d);
    }
  }

  // 2) Za svaki dan bez rasporeda: dopuni banku (ako treba) i složi raspored.
  const izvjesca = [];
  let client = null, dohvati = null;
  for (const datum of datumi.sort()) {
    if (banka.rasporedi.has(datum)) continue;
    if (a.bezApi) {
      const s = slozi(banka, datum, { razine, piramida: cfg.piramideDnevno, prozorDana: cfg.bezPonavljanjaDana });
      const iz = { datum, prihvaceno: [], odbijeno: [], napomene: [] };
      if (s.raspored) { banka.rasporedi.set(datum, s.raspored); iz.raspored = true; }
      else iz.napomene.push('Nedovoljno provjerenih pitanja: ' + JSON.stringify(s.manjak));
      izvjesca.push(iz); continue;
    }
    if (!client) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('Nedostaje ANTHROPIC_API_KEY (ili pokreni s --bez-api).');
      const Anthropic = require('@anthropic-ai/sdk');
      client = new Anthropic();
      dohvati = napraviDohvat({ dopustene: cfg.dopusteneDomene });
    }
    izvjesca.push(await pripremiDan({ datum, banka, cfg, razine, client, dohvati, stara, log, potrosnja, danas }));
    banka.spremi();   // spremi nakon svakog dana, da se plaćeni rad ne izgubi ako sljedeći dan padne
  }
  banka.spremi();

  const md = izvjesceMd({ izvjesca, potrosnja, cfg, odbaceno, banka });
  if (a.izvjesce) fs.writeFileSync(a.izvjesce, md + '\n');
  console.log(md);
  // Izlazni kod 2 = barem jedan dan nema raspored (posao u Actions to prikaže kao upozorenje, ali PR se ipak otvori).
  if (izvjesca.some(i => !i.raspored)) process.exitCode = 2;
}

main().catch(e => { console.error(e); process.exit(1); });
