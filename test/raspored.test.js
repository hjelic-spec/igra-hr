// Igra koristi raspored koji je pripremio agent (pitanja/raspored/DATUM.json), a bez njega staru logiku.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kviz-r-'));
process.env.DB_FILE = path.join(tmp, 't.db');
process.env.PITANJA_DIR = path.join(tmp, 'pitanja');
fs.mkdirSync(path.join(tmp, 'pitanja', 'raspored'), { recursive: true });

const { RULES } = require('../public/game.js');
const datum = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sutra = (() => { const d = new Date(datum + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
const banka = [], ids = [];
RULES.levels.forEach(l => { for (let i = 0; i < l.count; i++) {
  const id = `t-${l.level}-${i}`; ids.push(id);
  banka.push({ id, razina: l.level, status: 'provjereno', pitanje: `Provjereno pitanje ${id}?`, odgovori: ['Da', 'Ne', 'Možda', 'Nikad'], izvor: { url: 'https://www.enciklopedija.hr/x', citat: 'x' } });
} });
fs.writeFileSync(path.join(tmp, 'pitanja', 'banka.json'), JSON.stringify(banka));
fs.writeFileSync(path.join(tmp, 'pitanja', 'raspored', datum + '.json'), JSON.stringify({ datum, piramide: [ids] }));
// sutra: raspored pokazuje na nepostojeće pitanje -> igra ga ignorira
fs.writeFileSync(path.join(tmp, 'pitanja', 'raspored', sutra + '.json'), JSON.stringify({ datum: sutra, piramide: [[...ids.slice(1), 'nema']] }));

const { server, db, getDaily } = require('../server.js');
test.after(() => server.close());

test('dan s rasporedom: točno pitanja iz rasporeda, istim redom', () => {
  const tekstovi = getDaily(datum).map(id => db.prepare('SELECT text FROM questions WHERE id=?').get(id).text);
  assert.deepEqual(tekstovi, ids.map(id => `Provjereno pitanje ${id}?`));
});

test('neispravan raspored: igra radi po staroj logici', () => {
  const d = getDaily(sutra);
  assert.equal(d.length, RULES.levels.reduce((s, l) => s + l.count, 0));
});
