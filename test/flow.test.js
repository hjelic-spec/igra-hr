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
const correctFor = (idx, attempt = 1) => db.prepare('SELECT correct FROM questions WHERE id=?').get(getDaily(today(), attempt)[idx]).correct;
const wrongFor = (idx, attempt = 1) => (correctFor(idx, attempt) + 1) % 4;
// pomakni vrijeme prikaza trenutnog pitanja unatrag (simulira sporiji odgovor)
function delay(name, ms) {
  const row = db.prepare('SELECT r.* FROM runs r JOIN users u ON u.id=r.user_id WHERE u.username=?').get(name);
  const st = JSON.parse(row.state); st.servedAt -= ms;
  db.prepare('UPDATE runs SET state=? WHERE id=?').run(JSON.stringify(st), row.id);
}
async function player(name) { const c = client(); await c('register', { username: name, password: 'lozinka123' }); return c; }
// jedan korak: (ulog po želji) → prikaz pitanja → odgovor
async function play(c, run, { right = true, double = false, choice } = {}) {
  const n = await c('run/next', { q: run.q, double });
  assert.equal(n.status, 200); assert.equal(n.body.run.status, 'question');
  const a = await c('run/answer', { q: run.q, choice: choice !== undefined ? choice : right ? correctFor(run.q, run.attempt) : wrongFor(run.q, run.attempt) });
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
  assert.equal(again.body.run.doubled, false);           // nema zarađenog uloga, pa ga ne može ni uzeti
});

test('savršen brzi uspon: ulog se zarađuje svaka 3 brza točna i odmah troši', async () => {
  const c = await player('marko');
  let run = (await c('run/start', {})).body.run;
  const used = [], mults = [];
  while (run.status !== 'finished') {
    const want = run.nextStake > 0;
    const r = await play(c, run, { double: want });
    assert.ok(r.result.correct); assert.ok(r.result.ms <= 3000);
    if (want) { used.push(run.q); mults.push(r.result.mult); assert.ok(r.result.doubled); }
    run = r.run;
  }
  assert.deepEqual(used, [3, 6, 9, 12]);          // zarađen nakon 3., 6., 9. i 12. pitanja
  assert.deepEqual(mults, [2, 2, 2, 2]);          // svaki ulog je ×2
  const max = RULES.levels.reduce((s, l) => s + l.count * l.points, 0);
  assert.equal(run.base, max + 10 + 20 + 40 + 80);
  assert.deepEqual(run.stakes, [2]);              // zarađen nakon 15., ali igra je gotova
  assert.deepEqual(run.answers.map(a => a.m).filter(m => m > 1), [2, 2, 2, 2]);
  assert.equal(run.bankMs, RULES.timeBank.maxMs);                // brzi odgovori napunili rezervu do vrha
  assert.equal(run.score, run.base + run.speedBonus);
  assert.equal(run.maxLevel, 5);
  assert.equal((await c('run/start', {})).body.run.status, 'finished');
  assert.equal((await c('run/next', { q: 0 })).status, 409);
});

test('ulog se ne zarađuje sporim ili krivim odgovorom; ulozi se skupljaju', async () => {
  const c = await player('spori');
  let run = (await c('run/start', {})).body.run;
  for (let i = 0; i < 3; i++) {                    // 3 točna, ali sporija od 3 s
    await c('run/next', { q: run.q }); delay('spori', 3500);
    run = (await c('run/answer', { q: run.q, choice: correctFor(run.q) })).body.run;
  }
  assert.deepEqual(run.stakes, []); assert.equal(run.fastStreak, 0);
  run = (await play(c, run)).run; run = (await play(c, run)).run;   // 2 brza
  assert.equal(run.fastStreak, 2);
  run = (await play(c, run, { right: false })).run;                // greška ruši niz
  assert.equal(run.fastStreak, 0); assert.deepEqual(run.stakes, []);
  for (let i = 0; i < 7; i++) run = (await play(c, run)).run;      // 7 brzih: 2 uloga, niz krenuo ispočetka
  assert.deepEqual(run.stakes, [2, 2]); assert.equal(run.fastStreak, 1);
  const r = await play(c, run, { double: true });
  assert.equal(r.result.mult, 2); assert.deepEqual(r.run.stakes, [2]);
});

test('kriv odgovor oduzima bodove pitanja; druga greška završava igru s tadašnjim bodovima', async () => {
  const c = await player('luka');
  let run = (await c('run/start', {})).body.run;
  for (let i = 0; i < 6; i++) run = (await play(c, run)).run;   // 5 × 10 + 1 × 20 (+ brzina)
  const before = run.current;
  let r = await play(c, run, { right: false });                  // 7. pitanje (20 bodova) krivo
  assert.equal(r.result.gained, -20); assert.equal(r.run.current, before - 20);
  assert.equal(r.run.lives, 1); assert.equal(r.run.status, 'ready');
  run = r.run; const mid = run.current;
  r = await play(c, run, { right: false });                      // 8. pitanje krivo → kraj
  assert.equal(r.result.event, 'out');
  assert.equal(r.run.status, 'finished'); assert.ok(r.run.out);
  assert.equal(r.run.score, mid - 20);
  assert.equal((await c('run/stop', {})).status, 404);           // nema više stajanja
});

test('dupli ili ništa: točno dvostruko, krivo oduzima dvostruko; rezultat ne ide ispod nule', async () => {
  const c = await player('ulog');
  let run = (await c('run/start', {})).body.run;
  for (let i = 0; i < 3; i++) run = (await play(c, run)).run;    // zaradi ulog
  assert.deepEqual(run.stakes, [2]);
  let r = await play(c, run, { right: true, double: true });     // 4. pitanje (10) ×2
  assert.equal(r.result.gained, 20); assert.deepEqual(r.run.stakes, []);
  run = r.run;
  for (let i = 0; i < 3; i++) run = (await play(c, run)).run;    // 5.–7. brzo: novi ulog
  assert.deepEqual(run.stakes, [2]);
  const before = run.current;
  r = await play(c, run, { right: false, double: true });        // 8. pitanje (20) krivo uz ulog: −40
  assert.equal(r.result.gained, -40); assert.equal(r.run.current, before - 40);
  // donja granica 0, provjereno na samim pravilima
  const st = Game.newRun(); st.stakes = [2]; Game.serve(st, true, 0);
  const res = Game.answer(st, 9, 0, 100);
  assert.equal(res.gained, 0); assert.equal(st.base + st.speed, 0);
  // igra spremljena po starim pravilima (doublesLeft) nastavlja se s ulozima ×2
  const old = Game.newRun(); delete old.stakes; delete old.mult; old.doublesLeft = 2; old.doubled = false;
  assert.deepEqual(Game.view(old).stakes, [2, 2]);
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
  const v = { answers: [{ c: true, d: false }, { c: false, d: true }, { c: true, d: true }], score: 77, maxLevel: 1, out: false };
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

test('nedovršena igra od jučer se zaključuje s bodovima koje je igrač imao', async () => {
  const c = await player('stari');
  const uid = db.prepare("SELECT id FROM users WHERE username='stari'").get().id;
  const y = new Date(today() + 'T12:00:00Z'); y.setUTCDate(y.getUTCDate() - 1); const yd = y.toISOString().slice(0, 10);
  const st = { ...Game.newRun(), q: 7, base: 90, speed: 10 };
  db.prepare("INSERT INTO runs(user_id,date,status,lives,started_at,state) VALUES(?,?,?,?,?,?)").run(uid, yd, 'playing', 2, Date.now(), JSON.stringify(st));
  await c('me');
  const r = db.prepare('SELECT status, score FROM runs WHERE user_id=? AND date=?').get(uid, yd);
  assert.equal(r.status, 'finished'); assert.equal(r.score, 100);
  let run = (await c('run/start', {})).body.run;
  while (run.status !== 'finished') run = (await play(c, run, { right: false })).run;
  assert.equal((await c('profile/stari')).body.streak, 2);
});

test('rezerva vremena: brz točan odgovor sprema 2 s (najviše 6), sat je troši nakon osnovnog vremena', () => {
  const T = RULES.timeBank, base = RULES.secondsPerQuestion * 1000;
  const st = Game.newRun();
  let t = 0;
  const q = (ms, right = true) => { Game.serve(st, false, t); t += ms; return Game.answer(st, right ? 0 : 1, 0, t); };
  assert.equal(q(4000).bankEarned, T.earnMs);                    // ispod 5 s: +2 s
  assert.equal(q(6000).bankEarned, 0);                           // sporije: ništa
  assert.equal(q(1000, false).bankEarned, 0);                    // brz, ali kriv: ništa
  for (let i = 0; i < 6; i++) q(1000);
  assert.equal(st.bankMs, T.maxMs);                              // strop 6 s
  // pitanje s rezervom: odgovor 4 s nakon osnovnog vremena vrijedi i troši 4 s rezerve
  Game.serve(st, false, t);
  assert.equal(Game.view(st, { text: 'x', options: [] }, t).question.reserveSec, 6);
  assert.equal(Game.view(st, { text: 'x', options: [] }, t).question.totalLeft, base / 1000 + 6);
  t += base + 4000; const r = Game.answer(st, 0, 0, t);
  assert.ok(r.correct); assert.equal(r.bankUsed, 4000); assert.equal(st.bankMs, 2000);
  // bez dovoljno rezerve: istek vremena i rezerva je potrošena do kraja
  Game.serve(st, false, t); t += base + 2000 + RULES.graceMs + 1; const r2 = Game.answer(st, 0, 0, t);
  assert.ok(r2.timedOut); assert.equal(st.bankMs, 0);
});

test('3 piramide dnevno: različita pitanja, iste za sve; na ljestvicu ide najbolja', async () => {
  const c = await player('trojka');
  const scores = [];
  let run = (await c('run/start', {})).body.run;
  assert.equal(run.attempt, 1); assert.equal(run.attempts, RULES.attemptsPerDay);
  for (let k = 1; k <= RULES.attemptsPerDay; k++) {
    // 1. piramida: dvije greške odmah; 2.: cijela točno; 3.: 6 točnih pa dvije greške
    const plan = k === 1 ? [false, false] : k === 2 ? Array(15).fill(true) : [...Array(6).fill(true), false, false];
    for (const right of plan) run = (await play(c, run, { right })).run;
    assert.equal(run.status, 'finished'); scores.push(run.score);
    assert.equal(run.dayScore, Math.max(...scores));
    // bez izričitog zahtjeva start vraća završenu piramidu, ne otvara novu
    assert.equal((await c('run/start', {})).body.run.attempt, k);
    if (k < RULES.attemptsPerDay) { run = (await c('run/start', { again: true })).body.run; assert.equal(run.attempt, k + 1); assert.equal(run.status, 'ready'); }
  }
  const no = await c('run/start', { again: true });
  assert.equal(no.status, 409); assert.equal(no.body.run.attempt, RULES.attemptsPerDay);
  // kompleti se ne preklapaju i isti su za sve igrače
  const sets = [1, 2, 3].map(k => getDaily(today(), k));
  assert.equal(new Set(sets.flat()).size, 3 * Game.TOTAL);                 // nijedno pitanje se ne ponavlja unutar dana
  const row = (await c('leaderboard?period=daily')).body.rows.find(r => r.username === 'trojka');
  assert.equal(row.score, Math.max(...scores)); assert.equal(row.games, 1);
  const pr = (await c('profile/trojka')).body;
  assert.equal(pr.games, 3); assert.equal(pr.recent[0].attempts, 3); assert.equal(pr.recent[0].score, Math.max(...scores));
});

test('nadogradnja stare baze (jedna igra dnevno) zadržava igre i dopušta nove pokušaje', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { execFileSync } = require('node:child_process');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kviz-old-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL, streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0, last_played TEXT);
  CREATE TABLE runs(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), date TEXT NOT NULL,
  status TEXT NOT NULL, q_index INTEGER NOT NULL DEFAULT 0, lives INTEGER NOT NULL,
  base_score INTEGER NOT NULL DEFAULT 0, speed_bonus INTEGER NOT NULL DEFAULT 0, streak_bonus INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0, max_level INTEGER NOT NULL DEFAULT 0, correct_count INTEGER NOT NULL DEFAULT 0,
  served_at INTEGER, started_at INTEGER NOT NULL, finished_at INTEGER, total_ms INTEGER NOT NULL DEFAULT 0,
  state TEXT, UNIQUE(user_id, date));
  CREATE TABLE answers(run_id INTEGER NOT NULL REFERENCES runs(id), q_index INTEGER NOT NULL, question_id INTEGER NOT NULL, chosen INTEGER, correct INTEGER NOT NULL, ms INTEGER NOT NULL, PRIMARY KEY(run_id, q_index));
  INSERT INTO users VALUES(1,'stara','x','y','2026-01-01',0,0,NULL);
  INSERT INTO runs(id,user_id,date,status,lives,score,started_at) VALUES(7,1,'2026-11-01','finished',2,123,0);
  INSERT INTO answers VALUES(7,0,1,0,1,900);`);
  old.close();
  execFileSync(process.execPath, ['-e', "require('./server.js').db.close()"], { cwd: path.join(__dirname, '..'), env: { ...process.env, DB_FILE: file } });
  const db2 = new DatabaseSync(file);
  const r = db2.prepare('SELECT id, score, attempt FROM runs').get();
  assert.deepEqual({ ...r }, { id: 7, score: 123, attempt: 1 });
  db2.exec("INSERT INTO runs(user_id,date,attempt,status,lives,started_at) VALUES(1,'2026-11-01',2,'playing',2,0)");
  assert.equal(db2.prepare('SELECT COUNT(*) n FROM answers WHERE run_id=7').get().n, 1);
  assert.equal(db2.prepare('PRAGMA foreign_key_check').all().length, 0);
  db2.close();
});
