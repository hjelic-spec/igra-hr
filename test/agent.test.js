// Testovi agenta za dnevna pitanja. Ne zovu pravi API ni internet: model i web su zamijenjeni lažnima.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
const { IndeksSlicnosti, nadjiCitat, odgovorUCitatu, htmlUTekst } = require('../agent/lib/tekst');
const { domenaDopustena, napraviDohvat } = require('../agent/lib/izvor');
const { Banka, slozi, dodajDane } = require('../agent/lib/banka');
const { pripremiDan, formalnaProvjera } = require('../agent/lib/cjevovod');
const cfgPravi = require('../agent/config.json');
const { RULES } = require('../public/game.js');

const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pitanja-')); fs.mkdirSync(path.join(d, 'raspored')); fs.writeFileSync(path.join(d, 'banka.json'), '[]'); return d; };

test('sličnost: hvata preformulirana pitanja, propušta različita', () => {
  const ind = new IndeksSlicnosti(cfgPravi.slicnost);
  ind.dodaj('a', 'U kojem je mjestu rođen Nikola Tesla?', 'Smiljan');
  assert.ok(ind.nadjiSlicno('U kojem mjestu je rođen Nikola Tesla?', 'Smiljan'));
  assert.ok(ind.nadjiSlicno('Gdje je rođen izumitelj Nikola Tesla?', 'Smiljan'), 'isti odgovor + slično pitanje');
  assert.equal(ind.nadjiSlicno('Koji je glavni grad Kanade?', 'Ottawa'), null);
  assert.equal(ind.nadjiSlicno('U kojem je mjestu rođen Ivan Meštrović?', 'Vrpolje'), null, 'druga osoba nije duplikat');
});

test('citat mora biti doslovno na stranici; HTML entiteti i dijakritici', () => {
  const html = '<html><script>x="Smiljan"</script><p>Nikola Tesla, izumitelj (Smiljan, 10. VII. 1856 &ndash; New York, 7. I. 1943).</p><p>Studirao je u Grazu &scaron;to&#39;</p></html>';
  const t = htmlUTekst(html);
  assert.ok(nadjiCitat(t, 'Nikola Tesla, izumitelj (Smiljan, 10. VII. 1856 – New York, 7. I. 1943)'));
  assert.equal(nadjiCitat(t, 'Nikola Tesla rođen je u Gospiću 1856. godine.'), null);
  assert.equal(nadjiCitat(t, 'Tesla'), null, 'prekratak citat ne vrijedi');
  assert.ok(odgovorUCitatu('Smiljan', 'Nikola Tesla (Smiljan, 1856)'));
  assert.ok(odgovorUCitatu('1989.', 'Berlinski zid srušen je 9. studenoga 1989.'));
  assert.equal(odgovorUCitatu('1991.', 'Berlinski zid srušen je 9. studenoga 1989.'), false);
  assert.equal(odgovorUCitatu('19', 'godine 1989.'), false, 'broj se uspoređuje cijeli');
});

test('samo https i dopuštene domene (i poddomene), preusmjeravanje van se odbija', async () => {
  const d = ['enciklopedija.hr'];
  assert.ok(domenaDopustena('https://www.enciklopedija.hr/clanak/x', d));
  assert.equal(domenaDopustena('http://www.enciklopedija.hr/clanak/x', d), false);
  assert.equal(domenaDopustena('https://enciklopedija.hr.zlo.com/x', d), false);
  assert.equal(domenaDopustena('https://lazna-enciklopedija.hr/x', d), false);
  const dohvati = napraviDohvat({ dopustene: d, fetchFn: async () => ({ ok: true, url: 'https://zlo.com/', headers: new Headers({ 'content-type': 'text/html' }), text: async () => '' }) });
  assert.match((await dohvati('https://www.enciklopedija.hr/a')).greska, /preusmjereno/);
});

test('formalna provjera', () => {
  const ok = { pitanje: 'Koji je glavni grad Kanade?', tocan: 'Ottawa', netocni: ['Toronto', 'Montreal', 'Vancouver'], izvor_url: 'https://www.enciklopedija.hr/x', izvor_citat: 'Ottawa je glavni grad Kanade.' };
  assert.equal(formalnaProvjera(ok, ['enciklopedija.hr']), null);
  assert.match(formalnaProvjera({ ...ok, netocni: ['Toronto', 'ottawa', 'Vancouver'] }, ['enciklopedija.hr']), /ponavljaju/);
  assert.match(formalnaProvjera({ ...ok, izvor_url: 'https://hr.wikipedia.org/x' }, ['enciklopedija.hr']), /pouzdanih/);
  assert.match(formalnaProvjera({ ...ok, netocni: ['a', 'b'] }, ['enciklopedija.hr']), /format/);
});

// Lažni svijet: stranica izvora sadrži rečenicu "Činjenica broj N: odgovor je OdgN." za svaki N.
function lazniSvijet({ losiCitati = new Set(), krivaProvjera = new Set() } = {}) {
  const tocni = new Map();
  let n = 0;
  const stranica = () => Array.from({ length: 400 }, (_, i) => `<p>Činjenica broj ${i}: odgovor je Odg${i}xyz.</p>`).join('');
  const fetchFn = async url => ({ ok: true, url, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }), text: async () => stranica() });
  const usage = { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 2 } };
  const client = { beta: { messages: {
    stream: params => ({ finalMessage: async () => {
      const broj = Number(/Sastavi (\d+)/.exec(params.messages[0].content)[1]);
      const pitanja = Array.from({ length: broj }, () => {
        const i = n++;
        const p = { pitanje: `${require('node:crypto').createHash('md5').update(String(i)).digest('hex').replace(/\d/g, d => 'ghijklmnop'[d])}?`, tocan: `Odg${i}xyz`, netocni: [`Krivo${i}a`, `Krivo${i}b`, `Krivo${i}c`],
          kategorija: 'test', izvor_url: 'https://www.enciklopedija.hr/clanak/test', izvor_citat: losiCitati.has(i) ? `Izmišljen citat broj ${i} kojeg nema.` : `Činjenica broj ${i}: odgovor je Odg${i}xyz.` };
        tocni.set(p.pitanje, krivaProvjera.has(i) ? 'NEMA' : p.tocan);
        return p;
      });
      return { stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', name: 'predaj_pitanja', input: { pitanja } }] };
    } }),
    create: async params => {
      const txt = params.messages[0].content;
      const pit = /Pitanje \(.*\):\n(.*)\n/.exec(txt)[1];
      const slovo = (new RegExp(`([A-D])\\) ${tocni.get(pit)}\\n?`).exec(txt) || [])[1] || 'nijedan';
      const r = { odgovor: slovo, izvor_potvrduje: true, jednoznacno: true, netocni_su_netocni: true, vremenski_stabilno: true, jezik_ispravan: true, razina_odgovara: true, razlog: 'ok' };
      return { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  } } };
  return { client, fetchFn };
}

const cfgTest = { ...cfgPravi, maxTrosakPoPokretanjuUSD: 1000 };

test('cjevovod: puni 45 pitanja (3 piramide × 15), odbija izmišljene citate i pale slijepe provjere', async () => {
  const dir = tmpDir();
  const banka = new Banka(dir);
  const { client, fetchFn } = lazniSvijet({ losiCitati: new Set([0, 3]), krivaProvjera: new Set([1]) });
  const dohvati = napraviDohvat({ dopustene: cfgTest.dopusteneDomene, fetchFn });
  const potrosnja = { ulaz: 0, cache: 0, izlaz: 0, pretrage: 0, pozivi: 0 };
  const iz = await pripremiDan({ datum: '2026-11-20', banka, cfg: cfgTest, razine: RULES.levels, client, dohvati, potrosnja, danas: '2026-11-18' });
  assert.ok(iz.raspored, JSON.stringify(iz.napomene));
  assert.equal(iz.prihvaceno.length, 45);
  assert.equal(iz.odbijeno.filter(o => /citat nije/.test(o.razlog)).length, 2);
  assert.equal(iz.odbijeno.filter(o => /provjeravatelj/.test(o.razlog)).length, 1);
  const r = banka.rasporedi.get('2026-11-20');
  assert.equal(r.piramide.length, 3);
  for (const pi of r.piramide) assert.deepEqual(pi.map(id => banka.poId(id).razina), [1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5]);
  assert.equal(new Set(r.piramide.flat()).size, 45, 'nijedno pitanje dvaput u istom danu');
  for (const p of banka.pitanja) assert.ok(p.izvor.url && p.izvor.citat, 'svako pitanje ima izvor i citat');
  banka.spremi();

  // drugi dan: rezerve nema, pa agent mora sastaviti 45 novih; nijedno se ne ponavlja
  const b2 = new Banka(dir);
  const iz2 = await pripremiDan({ datum: '2026-11-21', banka: b2, cfg: cfgTest, razine: RULES.levels, client, dohvati, potrosnja, danas: '2026-11-19' });
  assert.equal(iz2.prihvaceno.length, 45);
  const d1 = new Set(b2.rasporedi.get('2026-11-20').piramide.flat());
  assert.ok(b2.rasporedi.get('2026-11-21').piramide.flat().every(id => !d1.has(id)));
});

test('raspored: bez ponavljanja unutar prozora; kad nedostaje, ne radi pola rasporeda', () => {
  const banka = new Banka(tmpDir());
  const razine = [{ level: 1, count: 2 }];
  for (let i = 0; i < 4; i++) banka.dodaj({ id: 'q' + i, razina: 1, status: 'provjereno', pitanje: 'P' + i, odgovori: ['a', 'b', 'c', 'd'] });
  const s1 = slozi(banka, '2026-01-01', { razine, piramida: 1, prozorDana: 3 });
  banka.rasporedi.set('2026-01-01', s1.raspored);
  const s2 = slozi(banka, '2026-01-02', { razine, piramida: 1, prozorDana: 3 });
  banka.rasporedi.set('2026-01-02', s2.raspored);
  assert.deepEqual([...s1.raspored.piramide[0], ...s2.raspored.piramide[0]].sort(), ['q0', 'q1', 'q2', 'q3']);
  assert.deepEqual(slozi(banka, '2026-01-03', { razine, piramida: 1, prozorDana: 3 }).manjak, { 1: 2 });
  const s4 = slozi(banka, dodajDane('2026-01-01', 3), { razine, piramida: 1, prozorDana: 3 });
  assert.deepEqual(s4.raspored.piramide[0].sort(), s1.raspored.piramide[0].sort(), 'nakon prozora smiju se vratiti najstarija');
  assert.equal(s4.raspored.ponovljeno.length, 2);
});

test('proračun: zaustavlja se kad je trošak dosegnut', async () => {
  const banka = new Banka(tmpDir());
  const { client, fetchFn } = lazniSvijet();
  const dohvati = napraviDohvat({ dopustene: cfgTest.dopusteneDomene, fetchFn });
  const potrosnja = { ulaz: 0, cache: 0, izlaz: 0, pretrage: 0, pozivi: 0 };
  const iz = await pripremiDan({ datum: '2026-11-20', banka, cfg: { ...cfgTest, maxTrosakPoPokretanjuUSD: 0.05 }, razine: RULES.levels, client, dohvati, potrosnja, danas: '2026-11-18' });
  assert.equal(iz.raspored, undefined);
  assert.ok(iz.napomene.some(n => /proračun/.test(n)));
});
