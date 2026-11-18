// Čitanje provjerene banke pitanja i dnevnih rasporeda koje priprema agent (agent/pripremi.js).
// Server ovo koristi bez vanjskih paketa. Format je opisan u agent/README.md.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DIR = process.env.PITANJA_DIR || __dirname;   // PITANJA_DIR samo za testove

// Sva provjerena pitanja: [{ id, razina, pitanje, odgovori: [točan, krivi, krivi, krivi], ... }]
function provjerenaPitanja() {
  const f = path.join(DIR, 'banka.json');
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, 'utf8')).filter(p => p.status === 'provjereno');
}

// Piramide za datum kao nizovi pitanja (objekti iz banke), ili null ako raspored ne postoji ili nije ispravan.
function piramideZaDan(datum) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  const f = path.join(DIR, 'raspored', datum + '.json');
  if (!fs.existsSync(f)) return null;
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  const poId = new Map(provjerenaPitanja().map(p => [p.id, p]));
  const piramide = r.piramide.map(ids => ids.map(id => poId.get(id)));
  if (!piramide.length || piramide.some(pi => pi.some(p => !p))) return null;   // npr. pitanje u međuvremenu odbačeno
  return piramide;
}

module.exports = { provjerenaPitanja, piramideZaDan };
