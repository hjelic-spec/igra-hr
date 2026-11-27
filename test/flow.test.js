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
// jedan korak: prikaz pitanja → odgovor
async function play(c, run, { right = true, choice } = {}) {
  const n = await c('run/next', { q: run.q });
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
  // ponovljeni "next" ne resetira sat; klijent ne može sam tražiti multiplikator (stari "double" se zanemaruje)
  const again = await c('run/next', { q: 0, double: true, mult: 99 });
  assert.equal(again.body.run.mult, 1);
  assert.equal(again.body.run.question.text, n.body.run.question.text);
});

test('savršen brzi uspon: svaki brz točan odgovor udvostručuje sljedeće pitanje, bez nagomilavanja', async () => {
  const c = await player('marko');
  let run = (await c('run/start', {})).body.run;
  const mults = [];
  while (run.status !== 'finished') {
    assert.equal(run.mult, Game.bonusMult(run.fastStreak));        // najava prije prikaza pitanja
    const r = await play(c, run);
    assert.ok(r.result.correct); assert.ok(r.result.fast); assert.ok(r.result.ms <= RULES.fastBonus.withinMs);
    assert.equal(r.result.gained, Game.PLAN[run.q].points * r.result.mult);
    mults.push(r.result.mult);
    run = r.run;
  }
  assert.deepEqual(mults, [1, ...Array(14).fill(2)]);              // prvo pitanje ×1, svako sljedeće ×2, nikad ×4
  const max = RULES.levels.reduce((s, l) => s + l.count * l.points, 0);
  assert.equal(run.base, 2 * max - 10);
  assert.deepEqual(run.answers.map(a => a.m), mults);
  assert.equal(run.score, run.base);                             // nema bonusa bodova za brzinu ni rezerve vremena
  assert.equal(run.bankMs, undefined); assert.equal(run.speedBonus, undefined);
  assert.equal(run.maxLevel, 5);
  assert.equal((await c('run/start', {})).body.run.status, 'finished');
  assert.equal((await c('run/next', { q: 0 })).status, 409);
});

test('spor ili kriv odgovor vraća bonus na ×1; kazna se ne množi; tolerancija za mrežu', async () => {
  const F = RULES.fastBonus;
  const c = await player('spori');
  let run = (await c('run/start', {})).body.run;
  for (let i = 0; i < 2; i++) {                    // 2 točna, ali sporija od 3 s + tolerancija
    await c('run/next', { q: run.q }); delay('spori', F.withinMs + F.latencyMs + 200);
    const r = (await c('run/answer', { q: run.q, choice: correctFor(run.q) })).body;
    assert.ok(r.result.correct); assert.equal(r.result.fast, false); assert.equal(r.result.mult, 1);
    run = r.run;
  }
  assert.equal(run.fastStreak, 0); assert.equal(run.mult, 1);
  for (let i = 0; i < 3; i++) run = (await play(c, run)).run;      // 3 brza zaredom: i dalje samo ×2
  assert.equal(run.fastStreak, 3); assert.equal(run.mult, 2);
  const before = run.current;
  let r = await play(c, run, { right: false });                    // 6. pitanje (20 bodova) krivo uz ×2
  assert.equal(r.result.mult, 2); assert.equal(r.result.gained, -20);
  assert.equal(r.run.current, before - 20);
  assert.equal(r.run.fastStreak, 0); assert.equal(r.run.mult, 1);
  run = r.run;
  // odgovor malo iza 3 s, ali unutar tolerancije za kašnjenje mreže, još se računa kao brz
  await c('run/next', { q: run.q }); delay('spori', F.withinMs + F.latencyMs - 150);
  r = (await c('run/answer', { q: run.q, choice: correctFor(run.q) })).body;
  assert.ok(r.result.fast); assert.equal(r.run.mult, 2);
  run = r.run;
  await c('run/next', { q: run.q }); delay('spori', F.withinMs + F.latencyMs + 1);
  r = (await c('run/answer', { q: run.q, choice: correctFor(run.q) })).body;   // točno uz ×2, ali sporo
  assert.equal(r.result.mult, 2); assert.equal(r.result.gained, 2 * Game.PLAN[run.q].points);
  assert.equal(r.result.fast, false); assert.equal(r.run.mult, 1);
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

test('rezultat ne ide ispod nule; igra spremljena sa starim ulozima nastavlja se bez njih', () => {
  const st = Game.newRun(); Game.serve(st, 0);
  const res = Game.answer(st, 9, 0, 100);
  assert.equal(res.gained, 0); assert.equal(st.base + st.speed, 0);
  // stara pravila: stakes/doublesLeft; ulozi nestaju, započeto pitanje s ×2 ostaje ×2 do odgovora
  const old = Game.newRun(); old.stakes = [2, 2]; old.earnedCount = 2; old.doublesLeft = 2; old.fastStreak = 2;
  old.status = 'question'; old.mult = 2; old.servedAt = 0;
  const v = Game.view(old);
  assert.equal(v.stakes, undefined); assert.equal(v.mult, 2);
  const r = Game.answer(old, 0, 0, 500);
  assert.equal(r.mult, 2); assert.equal(old.fastStreak, 3); assert.equal(Game.view(old).mult, 2);
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
  const v = { answers: [{ c: true, m: 1 }, { c: false, m: 3 }, { c: true, m: 2 }, { c: true, d: true }], score: 77, maxLevel: 1, out: false };
  const t = Game.shareText(v, '17. 11. 2026.', 4);
  assert.match(t, /^Dnevna piramida 17\. 11\. 2026\./);
  assert.ok(t.includes('🟩🟥🟨🟨⬜')); assert.ok(!t.includes('💥')); assert.ok(t.includes('77 bodova')); assert.ok(t.includes('🔥4'));
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

test('bez rezerve vremena i bonusa za brzinu: rok je uvijek 10 s, bodovi su bodovi pitanja × multiplikator', () => {
  const limit = RULES.secondsPerQuestion * 1000;
  assert.equal(RULES.timeBank, undefined); assert.equal(RULES.speedBonusShare, undefined);
  const st = Game.newRun();
  let t = 0;
  const q = (ms, right = true) => { Game.serve(st, t); t += ms; return Game.answer(st, right ? 0 : 1, 0, t); };
  let r = q(500);                                                 // vrlo brz odgovor: samo bodovi pitanja
  assert.equal(r.gained, 10); assert.equal(r.speedBonus, undefined); assert.equal(st.speed, 0);
  for (let i = 0; i < 5; i++) q(500);                             // mnogo brzih odgovora ne produljuje rok
  Game.serve(st, t);
  assert.equal(Game.view(st, { text: 'x', options: [] }, t).question.secondsLeft, limit / 1000);
  t += limit + RULES.graceMs + 1; r = Game.answer(st, 0, 0, t);
  assert.ok(r.timedOut);
  // pitanje prikazano po starim pravilima zadržava rezervu koju je imalo; stari bonus za brzinu ostaje u rezultatu
  const old = { ...Game.newRun(), status: 'question', servedAt: 0, limitMs: limit + 6000, bankMs: 6000, speed: 15, base: 100 };
  assert.equal(Game.view(old, { text: 'x', options: [] }, 0).question.secondsLeft, limit / 1000 + 6);
  r = Game.answer(old, 0, 0, limit + 4000);
  assert.ok(r.correct); assert.equal(old.bankMs, undefined); assert.equal(Game.finalScore(old), 100 + 15 + 10);
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
