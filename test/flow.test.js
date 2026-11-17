// Pokretanje: npm test   (koristi privremenu bazu)
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
const runOf = name => db.prepare('SELECT r.* FROM runs r JOIN users u ON u.id=r.user_id WHERE u.username=? AND r.date=?').get(name, today());
const questionAt = (name, idx) => db.prepare('SELECT * FROM questions WHERE id=?').get(JSON.parse(runOf(name).question_ids)[idx]);
const correctFor = (name, idx) => questionAt(name, idx).correct;
async function player(name) { const c = client(); await c('register', { username: name, password: 'lozinka123' }); return c; }
const MAX_BASE = RULES.steps * (RULES.steps + 1) / 2;

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

test('pitanje ne otkriva točan odgovor; težina raste po razinama', async () => {
  const c = await player('iva');
  const r = await c('run/start', {});
  assert.ok(!JSON.stringify(r.body).includes('"correct"'));
  assert.equal(r.body.run.question.total, 100);
  assert.equal(r.body.run.question.level, 1);
  assert.equal(r.body.run.question.points, 1);
  assert.equal(questionAt('iva', 0).level, 1);
});

test('savršen uspon do vrha: 100 stepenica, bez ponavljanja pitanja, prava razina na svakoj', async () => {
  const c = await player('marko');
  let run = (await c('run/start', {})).body.run;
  while (run.status === 'playing') {
    const i = run.qIndex;
    const r = await c('run/answer', { index: i, choice: correctFor('marko', i) });
    assert.equal(r.status, 200); assert.ok(r.body.result.correct); assert.equal(r.body.result.gained, i + 1);
    run = r.body.run;
  }
  const ids = JSON.parse(runOf('marko').question_ids);
  assert.equal(ids.length, 100);
  assert.equal(new Set(ids).size, 100, 'isto pitanje dvaput u istoj igri');
  ids.forEach((id, i) => assert.equal(db.prepare('SELECT level FROM questions WHERE id=?').get(id).level, Math.floor(i / 10) + 1));
  assert.equal(run.baseScore, MAX_BASE);
  assert.equal(run.maxLevel, 100);
  assert.ok(run.speedBonus > 0 && run.speedBonus <= MAX_BASE * RULES.speedBonusShare);
  const again = await c('run/start', {}); assert.equal(again.body.run.status, 'finished');
  assert.equal((await c('run/answer', { index: 0, choice: 0 })).status, 409);
});

test('tri greške završavaju uspon; isti odgovor se ne može poslati dvaput', async () => {
  const c = await player('luka');
  await c('run/start', {});
  const wrong = i => (correctFor('luka', i) + 1) % 4;
  let r = await c('run/answer', { index: 0, choice: correctFor('luka', 0) });
  assert.equal((await c('run/answer', { index: 0, choice: correctFor('luka', 0) })).status, 409);
  for (const i of [1, 2]) { r = await c('run/answer', { index: i, choice: wrong(i) }); assert.equal(r.body.run.status, 'playing'); }
  assert.equal(r.body.run.lives, 1);
  r = await c('run/answer', { index: 3, choice: wrong(3) });
  assert.equal(r.body.run.status, 'finished'); assert.equal(r.body.run.baseScore, 1);
  assert.deepEqual(r.body.run.answers, [true, false, false, false]);
});

test('istek vremena se računa na serveru', async () => {
  const c = await player('petra');
  await c('run/start', {});
  db.prepare('UPDATE runs SET served_at=? WHERE id=?').run(Date.now() - 30000, runOf('petra').id);
  const r = await c('run/answer', { index: 0, choice: correctFor('petra', 0) });
  assert.equal(r.body.result.correct, false); assert.equal(r.body.result.timedOut, true);
});

test('bonus niza za uzastopne dane', async () => {
  const c = await player('niz');
  const yest = new Date(today() + 'T12:00:00Z'); yest.setUTCDate(yest.getUTCDate() - 1);
  db.prepare("UPDATE users SET streak=3, last_played=? WHERE username='niz'").run(yest.toISOString().slice(0, 10));
  let run = (await c('run/start', {})).body.run;
  while (run.status === 'playing') run = (await c('run/answer', { index: run.qIndex, choice: null })).body.run;
  assert.equal(run.streakBonus, 3 * RULES.streakBonusPerDay);
  assert.equal((await c('profile/niz')).body.streak, 4);
});

test('način "personal": igrači dobivaju različita pitanja iste razine', async () => {
  const a = await player('prvi'), b = await player('drugi');
  for (const c of [a, b]) {
    let run = (await c('run/start', {})).body.run;
    while (run.status === 'playing' && run.qIndex < 15) {
      const name = c === a ? 'prvi' : 'drugi';
      run = (await c('run/answer', { index: run.qIndex, choice: correctFor(name, run.qIndex) })).body.run;
    }
  }
  const x = JSON.parse(runOf('prvi').question_ids), y = JSON.parse(runOf('drugi').question_ids);
  assert.notDeepEqual(x, y);
});

test('način "shared": svi dobivaju isti dnevni niz od 100 pitanja', async () => {
  RULES.mode = 'shared';
  try {
    const ids = getDaily(today());
    assert.equal(ids.length, 100); assert.deepEqual(getDaily(today()), ids);
    const a = await player('zajed1'), b = await player('zajed2');
    for (const [c, n] of [[a, 'zajed1'], [b, 'zajed2']]) {
      let run = (await c('run/start', {})).body.run;
      for (let k = 0; k < 5; k++) run = (await c('run/answer', { index: run.qIndex, choice: correctFor(n, run.qIndex) })).body.run;
    }
    assert.deepEqual(JSON.parse(runOf('zajed1').question_ids), ids.slice(0, 6));
    assert.deepEqual(JSON.parse(runOf('zajed2').question_ids), ids.slice(0, 6));
  } finally { RULES.mode = 'personal'; }
});

test('ljestvice i profil', async () => {
  const c = client();
  const d = (await c('leaderboard?period=daily')).body.rows;
  assert.equal(d[0].username, 'marko');
  for (const p of ['weekly', 'alltime']) assert.equal((await c('leaderboard?period=' + p)).body.rows[0].username, 'marko');
  const p = (await c('profile/marko')).body;
  assert.equal(p.max_level, 100); assert.equal(p.summits, 1); assert.equal(p.games, 1);
  assert.equal((await c('profile/nitko')).status, 404);
});

test('nedovršena igra od jučer se zaključuje', async () => {
  const c = await player('stari');
  const uid = db.prepare("SELECT id FROM users WHERE username='stari'").get().id;
  const y = new Date(today() + 'T12:00:00Z'); y.setUTCDate(y.getUTCDate() - 1); const yd = y.toISOString().slice(0, 10);
  db.prepare("INSERT INTO runs(user_id,date,status,lives,base_score,speed_bonus,score,max_level,served_at,started_at,question_ids) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(uid, yd, 'playing', 2, 30, 5, 35, 1, Date.now(), Date.now(), '[1]');
  await c('me');
  const r = db.prepare('SELECT status, score FROM runs WHERE user_id=? AND date=?').get(uid, yd);
  assert.equal(r.status, 'finished'); assert.equal(r.score, 35);
  let run = (await c('run/start', {})).body.run;
  while (run.status === 'playing') run = (await c('run/answer', { index: run.qIndex, choice: null })).body.run;
  assert.equal((await c('profile/stari')).body.streak, 2);
});
