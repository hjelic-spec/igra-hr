// Banka pitanja (pitanja/banka.json) i dnevni rasporedi (pitanja/raspored/GGGG-MM-DD.json).
// Povijest korištenja se ne sprema posebno: izvodi se iz datoteka rasporeda, pa je uvijek u skladu s njima.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function dodajDane(datum, n) { const d = new Date(datum + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function razlikaDana(a, b) { return Math.round((new Date(a + 'T12:00:00Z') - new Date(b + 'T12:00:00Z')) / 864e5); }
const danasZagreb = (sad = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit' }).format(sad);

class Banka {
  constructor(dir) {
    this.dir = dir;
    this.datBanka = path.join(dir, 'banka.json');
    this.dirRaspored = path.join(dir, 'raspored');
    this.pitanja = fs.existsSync(this.datBanka) ? JSON.parse(fs.readFileSync(this.datBanka, 'utf8')) : [];
    this.rasporedi = new Map();
    if (fs.existsSync(this.dirRaspored)) {
      for (const f of fs.readdirSync(this.dirRaspored)) {
        const d = f.replace(/\.json$/, '');
        if (DATUM.test(d)) this.rasporedi.set(d, JSON.parse(fs.readFileSync(path.join(this.dirRaspored, f), 'utf8')));
      }
    }
  }
  poId(id) { return this.pitanja.find(p => p.id === id); }
  sljedeciId(datum) {
    const pref = 'p' + datum.replace(/-/g, '') + '-';
    const n = this.pitanja.filter(p => p.id.startsWith(pref)).length;
    return pref + String(n + 1).padStart(3, '0');
  }
  dodaj(p) { this.pitanja.push(p); }
  // Zadnji datum na koji je pitanje bilo (ili će biti) u rasporedu, ne računajući datum `osim`.
  koristenja(osim) {
    const m = new Map();
    for (const [d, r] of this.rasporedi) {
      if (d === osim) continue;
      for (const id of r.piramide.flat()) { const a = m.get(id) || []; a.push(d); m.set(id, a); }
    }
    return m;
  }
  // Je li pitanje slobodno za `datum`: nije korišteno unutar `prozor` dana prije ili poslije tog datuma.
  slobodno(id, datum, prozor, kor = this.koristenja(datum)) {
    return !(kor.get(id) || []).some(d => Math.abs(razlikaDana(d, datum)) < prozor);
  }
  spremi() {
    fs.mkdirSync(this.dirRaspored, { recursive: true });
    fs.writeFileSync(this.datBanka, JSON.stringify(this.pitanja, null, 1) + '\n');
    for (const [d, r] of this.rasporedi) {
      const f = path.join(this.dirRaspored, d + '.json');
      const novo = JSON.stringify(r, null, 1) + '\n';
      if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== novo) fs.writeFileSync(f, novo);
    }
  }
}

// Koliko pitanja koje razine treba za jedan dan.
function potrebno(razine, piramida) {
  const m = {};
  for (const r of razine) m[r.level] = r.count * piramida;
  return m;
}

// Složi raspored za `datum` iz provjerenih pitanja. Prednost: nikad korištena (najstarija prvo, da se pregledana
// pitanja ne gomilaju), zatim ona korištena najdavnije (ali izvan prozora). Vraća { raspored } ili { manjak }.
function slozi(banka, datum, { razine, piramida, prozorDana }) {
  const kor = banka.koristenja(datum);
  const zadnje = id => (kor.get(id) || []).filter(d => d < datum).sort().pop() || '';
  const odabrano = {}, manjak = {}, ponovljeno = [];
  for (const r of razine) {
    const treba = r.count * piramida;
    const kandidati = banka.pitanja
      .filter(p => p.status === 'provjereno' && p.razina === r.level && banka.slobodno(p.id, datum, prozorDana, kor))
      .sort((a, b) => zadnje(a.id).localeCompare(zadnje(b.id)) || a.id.localeCompare(b.id));
    const uzmi = kandidati.slice(0, treba);
    for (const p of uzmi) if (kor.has(p.id)) ponovljeno.push(p.id);
    if (uzmi.length < treba) manjak[r.level] = treba - uzmi.length;
    odabrano[r.level] = uzmi.map(p => p.id);
  }
  if (Object.keys(manjak).length) return { manjak };
  const piramide = [];
  for (let i = 0; i < piramida; i++) piramide.push(razine.flatMap(r => odabrano[r.level].slice(i * r.count, (i + 1) * r.count)));
  return { raspored: { datum, piramide, ponovljeno } };
}

// Koliko provjerenih pitanja po razini već čeka u banci za `datum`.
// samoNekoristena = true: broje se samo nikad korištena (agent tada svaki dan sastavlja nova).
// false: broje se sva slobodna unutar prozora (stara se vraćaju nakon prozora, pa agent nakon nekoliko mjeseci gotovo ništa ne plaća).
function rezerva(banka, datum, razine, { samoNekoristena = false, prozorDana = 0 } = {}) {
  const kor = banka.koristenja(datum), m = {};
  for (const r of razine) m[r.level] = banka.pitanja.filter(p => p.status === 'provjereno' && p.razina === r.level &&
    (samoNekoristena ? !kor.has(p.id) : banka.slobodno(p.id, datum, prozorDana, kor))).length;
  return m;
}

module.exports = { Banka, slozi, rezerva, potrebno, dodajDane, razlikaDana, danasZagreb };
