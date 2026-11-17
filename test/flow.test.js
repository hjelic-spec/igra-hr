// Pokretanje: npm test   (koristi privremenu bazu)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kviz-')), 't.db');
const { server, db, RULES, Game, getDaily, today } = require('../server.js');

let base;
test.before(() => new Promise(r => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => server.close());

function client() {
  let ck = '';
  return async (p, body) => {
    const r = await fetch(base + '/api/' + p, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0];
    return { status: r.status, body: await r.json() };
  };
}
const correctFor = idx => db.prepare('SELECT correct FROM questions WHERE id=?').get(getDaily(today())[idx]).correct;
const wrongFor = idx => (correctFor(idx) + 1) % 4;
async function player(name) { const c = client(); await c('register', { username: name, password: 'lozinka123' }); return c; }
// jedan korak: (ulog po želji) → prikaz pitanja → odgovor
async function play(c, run, { right = true, double = false, choice } = {}) {
  const n = await c('run/next', { q: run.q, double });
  assert.equal(n.status, 200); assert.equal(n.body.run.status, 'question');
  const a = await c('run/answer', { q: run.q, choice: choice !== undefined ? choice : right ? correctFor(run.q) : wrongFor(run.q) });
  assert.equal(a.status, 200);
  return a.body;
}

test('registracija, prijava i zaštita', async () => {
  const a = client();
  assert.equal((await a('me')).status, 401);
  assert.equal((await a('register', { username: 'ab', password: '12345678' })).status, 400);
  assert.equal((await a('register', { username: 'ana', password: 'kratka' })).status, 400);
  assert.equal((await a('register', { username: 'ana', password: 'tajna1234' })).status, 200);
  assert.equal((await client()('register', { username: 'ANA', password: 'tajna1234' })).status, 409);
  const b = client();
  assert.equal((await b('login', { username: 'ana', password: 'kriva1234' })).status, 401);
  assert.equal((await b('login', { username: 'ana', password: 'tajna1234' })).status, 200);
  assert.equal((await b('me')).body.username, 'ana');
});

test('pitanje se ne prikazuje prije "next" i ne otkriva točan odgovor', async () => {
  const c = await player('iva');
  const s = await c('run/start', {});
  assert.equal(s.body.run.status, 'ready'); assert.ok(!s.body.run.question);
  const n = await c('run/next', { q: 0, double: false });
  assert.ok(n.body.run.question.text);
  assert.ok(!JSON.stringify(n.body).includes('"correct"'));
  // ponovljeni "next" ne resetira sat i ne troši ulog
  const again = await c('run/next', { q: 0, double: true });
  assert.equal(again.body.run.doublesLeft, RULES.doubles);
});

test('savršen uspon s tri dupla uloga', async () => {
  const c = await player('marko');
  let run = (await c('run/start', {})).body.run, doubles = 0;
  while (run.status !== 'finished') {
    if (run.canStop) assert.ok([5, 10].includes(run.q));
    const want = run.q >= 12;                      // ulog na zadnja tri pitanja
    const r = await play(c, run, { double: want });
    assert.ok(r.result.correct);
    if (want) { doubles++; assert.ok(r.result.doubled); }
    run = r.run;
  }
  const max = RULES.levels.reduce((s, l) => s + l.count * l.points, 0);
  assert.equal(doubles, 3);
  assert.equal(run.doublesLeft, 0);
  assert.equal(run.base, max + 80 + 80 + 160);   // pitanja 13–15 (80, 80, 160) vrijede dvostruko
  assert.equal(run.score, run.base + run.speedBonus);
  assert.equal(run.maxLevel, 5);
  assert.equal((await c('run/start', {})).body.run.status, 'finished');
  assert.equal((await c('run/next', { q: 0 })).status, 409);
});

test('dvije greške: pad na zadnju sigurnu stepenicu', async () => {
  const c = await player('luka');
  let run = (await c('run/start', {})).body.run;
  for (let i = 0; i < 5; i++) run = (await play(c, run)).run;   // 5 točnih → sigurno
  assert.equal(run.q, 5); assert.ok(run.canStop); assert.equal(run.safe, run.current);
  const safe = run.safe;
  run = (await play(c, run)).run;                                // 6. točno, bodovi rastu
  assert.ok(run.current > safe);
  run = (await play(c, run, { right: false })).run;              // prva greška
  assert.equal(run.lives, 1); assert.equal(run.status, 'ready');
  const r = await play(c, run, { right: false });                // druga greška → pad
  assert.equal(r.run.status, 'finished'); assert.ok(r.run.fell); assert.equal(r.run.score, safe);
  assert.equal(r.result.event, 'fell');
});

test('stani na sigurnoj stepenici zadržava bodove; ne može se stati drugdje', async () => {
  const c = await player('stani');
  let run = (await c('run/start', {})).body.run;
  run = (await play(c, run)).run;
  assert.equal((await c('run/stop', {})).status, 409);
  for (let i = 1; i < 5; i++) run = (await play(c, run)).run;
  const s = await c('run/stop', {});
  assert.equal(s.status, 200); assert.equal(s.body.run.status, 'finished'); assert.ok(s.body.run.stopped);
  assert.equal(s.body.run.score, run.current);
});

test('dupli ili ništa: kriva oklada oduzima dvostruko, ali ne ispod sigurnih bodova', async () => {
  const c = await player('ulog');
  let run = (await c('run/start', {})).body.run;
  let r = await play(c, run, { right: false, double: true });   // 1. pitanje: 0 bodova, ne ide u minus
  assert.equal(r.result.gained, 0); assert.equal(r.run.current, 0); assert.equal(r.run.doublesLeft, 2);
  run = r.run;
  for (let i = 1; i < 5; i++) run = (await play(c, run)).run;   // do sigurne stepenice
  const safe = run.safe;
  r = await play(c, run, { right: true, double: true });         // 6. pitanje (20 bodova) ×2
  assert.equal(r.result.gained, 40);
  const before = r.run.current; run = r.run;
  r = await play(c, run, { right: false, double: true });        // 7. pitanje krivo uz ulog: −40, ali ne ispod sigurnog
  assert.equal(r.run.status, 'finished');                         // to je bila druga greška
  assert.equal(r.run.score, safe);
  assert.ok(before - 40 >= safe); assert.equal(r.result.gained, -40);
});

test('istek vremena se računa na serveru', async () => {
  const c = await player('petra');
  let run = (await c('run/start', {})).body.run;
  await c('run/next', { q: 0 });
  const row = db.prepare("SELECT r.* FROM runs r JOIN users u ON u.id=r.user_id WHERE u.username='petra'").get();
  const st = JSON.parse(row.state); st.servedAt = Date.now() - 30000;
  db.prepare('UPDATE runs SET state=? WHERE id=?').run(JSON.stringify(st), row.id);
  const r = await c('run/answer', { q: 0, choice: correctFor(0) });
  assert.equal(r.body.result.correct, false); assert.equal(r.body.result.timedOut, true);
});

test('bonus niza za uzastopne dane', async () => {
  const c = await player('niz');
  const yest = new Date(today() + 'T12:00:00Z'); yest.setUTCDate(yest.getUTCDate() - 1);
  db.prepare("UPDATE users SET streak=3, last_played=? WHERE username='niz'").run(yest.toISOString().slice(0, 10));
  assert.equal((await c('me')).body.streak, 3);
  let run = (await c('run/start', {})).body.run;
  while (run.status !== 'finished') run = (await play(c, run, { right: false })).run;
  assert.equal(run.streakBonus, 3 * RULES.streakBonusPerDay);
  assert.equal(run.score, 3 * RULES.streakBonusPerDay);
  assert.equal((await c('profile/niz')).body.streak, 4);
});

test('tekst za dijeljenje ne sadrži pitanja ni odgovore', () => {
  const v = { answers: [{ c: true, d: false }, { c: false, d: true }, { c: true, d: true }], score: 77, maxLevel: 1, fell: false, stopped: false };
  const t = Game.shareText(v, '17. 11. 2026.', 4);
  assert.match(t, /^Dnevna piramida 17\. 11\. 2026\./);
  assert.ok(t.includes('🟩💥🟨⬜⬜')); assert.ok(t.includes('77 bodova')); assert.ok(t.includes('🔥4'));
  assert.equal(t.split('\n').length, 7);
});

test('ljestvice i profil', async () => {
  const c = client();
  const d = (await c('leaderboard?period=daily')).body.rows;
  assert.equal(d[0].username, 'marko');
  for (const p of ['weekly', 'alltime']) assert.equal((await c('leaderboard?period=' + p)).body.rows[0].username, 'marko');
  const p = (await c('profile/marko')).body;
  assert.equal(p.max_level, 5); assert.equal(p.summits, 1); assert.equal(p.games, 1);
  assert.equal((await c('profile/nitko')).status, 404);
});

test('nedovršena igra od jučer se zaključuje sa sigurnim bodovima', async () => {
  const c = await player('stari');
  const uid = db.prepare("SELECT id FROM users WHERE username='stari'").get().id;
  const y = new Date(today() + 'T12:00:00Z'); y.setUTCDate(y.getUTCDate() - 1); const yd = y.toISOString().slice(0, 10);
  const st = { ...Game.newRun(), q: 7, base: 90, speed: 10, safe: 60 };
  db.prepare("INSERT INTO runs(user_id,date,status,lives,started_at,state) VALUES(?,?,?,?,?,?)").run(uid, yd, 'playing', 2, Date.now(), JSON.stringify(st));
  await c('me');
  const r = db.prepare('SELECT status, score FROM runs WHERE user_id=? AND date=?').get(uid, yd);
  assert.equal(r.status, 'finished'); assert.equal(r.score, 60);
  let run = (await c('run/start', {})).body.run;
  while (run.status !== 'finished') run = (await play(c, run, { right: false })).run;
  assert.equal((await c('profile/stari')).body.streak, 2);
});
