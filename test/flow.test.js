// Pokretanje: node --test test/   (koristi privremenu bazu)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os'), path = require('node:path'), fs = require('node:fs');
process.env.DB_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kviz-')), 't.db');
const { server, db, RULES, getDaily, today } = require('../server.js');

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

test('dnevna piramida je ista za sve i ne otkriva točan odgovor', async () => {
  const ids = getDaily(today());
  assert.equal(ids.length, RULES.levels.reduce((s, l) => s + l.count, 0));
  assert.deepEqual(getDaily(today()), ids);
  const c = client(); await c('register', { username: 'iva', password: 'lozinka123' });
  const r = await c('run/start', {});
  assert.ok(!('correct' in r.body.run.question));
  assert.ok(!JSON.stringify(r.body).includes('"correct"'));
});

test('savršen uspon do vrha', async () => {
  const c = client(); await c('register', { username: 'marko', password: 'lozinka123' });
  let run = (await c('run/start', {})).body.run;
  while (run.status === 'playing') {
    const r = await c('run/answer', { index: run.qIndex, choice: correctFor(run.qIndex) });
    assert.equal(r.status, 200); assert.ok(r.body.result.correct); run = r.body.run;
  }
  const max = RULES.levels.reduce((s, l) => s + l.count * l.points, 0);
  assert.equal(run.baseScore, max);
  assert.equal(run.maxLevel, 5);
  assert.ok(run.speedBonus > 0 && run.speedBonus <= max * RULES.speedBonusShare);
  assert.equal(run.streakBonus, 0);
  // drugi pokušaj istog dana nije moguć
  const again = await c('run/start', {}); assert.equal(again.body.run.status, 'finished');
  assert.equal((await c('run/answer', { index: 0, choice: 0 })).status, 409);
});

test('dvije greške završavaju uspon; isti odgovor se ne može poslati dvaput', async () => {
  const c = client(); await c('register', { username: 'luka', password: 'lozinka123' });
  let run = (await c('run/start', {})).body.run;
  const wrong = i => (correctFor(i) + 1) % 4;
  let r = await c('run/answer', { index: 0, choice: correctFor(0) });
  assert.equal((await c('run/answer', { index: 0, choice: correctFor(0) })).status, 409);
  r = await c('run/answer', { index: 1, choice: wrong(1) });
  assert.equal(r.body.run.status, 'playing'); assert.equal(r.body.run.lives, 1);
  r = await c('run/answer', { index: 2, choice: wrong(2) });
  assert.equal(r.body.run.status, 'finished'); assert.equal(r.body.run.baseScore, 10);
  assert.deepEqual(r.body.run.answers, [true, false, false]);
});

test('istek vremena se računa na serveru', async () => {
  const c = client(); await c('register', { username: 'petra', password: 'lozinka123' });
  await c('run/start', {});
  // simuliramo da je pitanje prikazano prije 30 s
  db.prepare("UPDATE runs SET served_at=? WHERE user_id=(SELECT id FROM users WHERE username='petra')").run(Date.now() - 30000);
  const r = await c('run/answer', { index: 0, choice: correctFor(0) });
  assert.equal(r.body.result.correct, false); assert.equal(r.body.result.timedOut, true);
});

test('bonus niza za uzastopne dane', async () => {
  const c = client(); await c('register', { username: 'niz', password: 'lozinka123' });
  const yest = new Date(today() + 'T12:00:00Z'); yest.setUTCDate(yest.getUTCDate() - 1);
  db.prepare("UPDATE users SET streak=3, last_played=? WHERE username='niz'").run(yest.toISOString().slice(0, 10));
  let run = (await c('run/start', {})).body.run;
  while (run.status === 'playing') run = (await c('run/answer', { index: run.qIndex, choice: null })).body.run;
  assert.equal(run.streakBonus, 3 * RULES.streakBonusPerDay);
  assert.equal((await c('profile/niz')).body.streak, 4);
});

test('ljestvice i profil', async () => {
  const c = client();
  const d = (await c('leaderboard?period=daily')).body.rows;
  assert.equal(d[0].username, 'marko');
  assert.equal(d.length, 3); // marko, luka, niz (iva i petra nisu završili)
  for (const p of ['weekly', 'alltime']) assert.equal((await c('leaderboard?period=' + p)).body.rows[0].username, 'marko');
  const p = (await c('profile/marko')).body;
  assert.equal(p.max_level, 5); assert.equal(p.summits, 1); assert.equal(p.games, 1);
  assert.equal((await c('profile/nitko')).status, 404);
});

test('nedovršena igra od jučer se zaključuje', async () => {
  const c = client(); await c('register', { username: 'stari', password: 'lozinka123' });
  const uid = db.prepare("SELECT id FROM users WHERE username='stari'").get().id;
  const y = new Date(today() + 'T12:00:00Z'); y.setUTCDate(y.getUTCDate() - 1); const yd = y.toISOString().slice(0, 10);
  db.prepare("INSERT INTO runs(user_id,date,status,lives,base_score,speed_bonus,score,max_level,served_at,started_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(uid, yd, 'playing', 2, 30, 5, 35, 1, Date.now(), Date.now());
  await c('me');
  const r = db.prepare('SELECT status, score FROM runs WHERE user_id=? AND date=?').get(uid, yd);
  assert.equal(r.status, 'finished'); assert.equal(r.score, 35);
  // jučer odigrano → danas niz 2
  let run = (await c('run/start', {})).body.run;
  while (run.status === 'playing') run = (await c('run/answer', { index: run.qIndex, choice: null })).body.run;
  assert.equal((await c('profile/stari')).body.streak, 2);
});
