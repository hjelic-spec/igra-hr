// Dnevni kviz-izazov – prototip. Bez vanjskih paketa: Node.js >= 22.13 (node:sqlite).
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'kviz.db');
const TZ = 'Europe/Zagreb';

// ---------- Pravila igre: zajednički modul (isti kod koristi i probna verzija u pregledniku) ----------
const Game = require('./public/game.js');
const { RULES } = Game;

// ---------- Baza ----------
const db = new DatabaseSync(DB_FILE);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL,
  streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0, last_played TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS questions(
  id INTEGER PRIMARY KEY, level INTEGER NOT NULL, text TEXT UNIQUE NOT NULL,
  options TEXT NOT NULL, correct INTEGER NOT NULL, times_used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS daily(date TEXT PRIMARY KEY, question_ids TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), date TEXT NOT NULL,
  status TEXT NOT NULL, q_index INTEGER NOT NULL DEFAULT 0, lives INTEGER NOT NULL,
  base_score INTEGER NOT NULL DEFAULT 0, speed_bonus INTEGER NOT NULL DEFAULT 0, streak_bonus INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0, max_level INTEGER NOT NULL DEFAULT 0, correct_count INTEGER NOT NULL DEFAULT 0,
  served_at INTEGER, started_at INTEGER NOT NULL, finished_at INTEGER, total_ms INTEGER NOT NULL DEFAULT 0,
  state TEXT, UNIQUE(user_id, date));
CREATE TABLE IF NOT EXISTS answers(
  run_id INTEGER NOT NULL REFERENCES runs(id), q_index INTEGER NOT NULL, question_id INTEGER NOT NULL,
  chosen INTEGER, correct INTEGER NOT NULL, ms INTEGER NOT NULL, PRIMARY KEY(run_id, q_index));
CREATE INDEX IF NOT EXISTS runs_date ON runs(date, score DESC);
`);
// nadogradnja baze iz prve verzije prototipa
const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
if (!cols('runs').includes('state')) db.exec('ALTER TABLE runs ADD COLUMN state TEXT');
if (!cols('answers').includes('doubled')) db.exec('ALTER TABLE answers ADD COLUMN doubled INTEGER NOT NULL DEFAULT 0');

// Učitaj početna pitanja (točan je prvi; spremamo opcije u stalnom izmiješanom redoslijedu)
{
  const ins = db.prepare('INSERT OR IGNORE INTO questions(level,text,options,correct) VALUES(?,?,?,?)');
  for (const [level, text, opts] of require('./questions.js')) {
    const order = shuffle([0, 1, 2, 3], hashSeed(text));
    ins.run(level, text, JSON.stringify(order.map(i => opts[i])), order.indexOf(0));
  }
}

function hashSeed(s) { return crypto.createHash('sha256').update(s).digest().readUInt32LE(0); }
function shuffle(arr, seed) {
  let x = seed || 1; const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- Datumi (granica dana po hrvatskom vremenu) ----------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => fmt.format(new Date());
function addDays(dateStr, n) { const d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekStart(dateStr) { const d = new Date(dateStr + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; return addDays(dateStr, -dow); }

// ---------- Dnevna piramida: ista za sve igrače ----------
function getDaily(date) {
  const row = db.prepare('SELECT question_ids FROM daily WHERE date=?').get(date);
  if (row) return JSON.parse(row.question_ids);
  const ids = [];
  for (const l of RULES.levels) {
    // najmanje korištena pitanja te razine; unutar istog broja korištenja deterministički redoslijed po datumu
    const qs = db.prepare('SELECT id, times_used FROM questions WHERE level=?').all(l.level);
    if (qs.length < l.count) throw new Error(`Premalo pitanja za razinu ${l.level}`);
    const seed = hashSeed(date + ':' + l.level);
    qs.sort((a, b) => a.times_used - b.times_used || hashSeed(seed + ':' + a.id) - hashSeed(seed + ':' + b.id));
    ids.push(...qs.slice(0, l.count).map(q => q.id));
  }
  db.exec('BEGIN');
  try {
    const again = db.prepare('SELECT question_ids FROM daily WHERE date=?').get(date);
    if (again) { db.exec('COMMIT'); return JSON.parse(again.question_ids); }
    db.prepare('INSERT INTO daily(date, question_ids) VALUES(?,?)').run(date, JSON.stringify(ids));
    const up = db.prepare('UPDATE questions SET times_used=times_used+1 WHERE id=?');
    ids.forEach(id => up.run(id));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return ids;
}

// ---------- Lozinke i sesije ----------
function hashPassword(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, userId, Date.now() + 30 * 864e5);
  return token;
}
function getUser(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  return db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?`).get(m[1], Date.now()) || null;
}
const cookie = (token, maxAge) =>
  `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

// jednostavno ograničenje pokušaja prijave (u memoriji; za produkciju koristiti nešto trajnije)
const attempts = new Map();
function rateLimited(key) {
  const now = Date.now(); const a = (attempts.get(key) || []).filter(t => now - t < 15 * 60e3);
  a.push(now); attempts.set(key, a); return a.length > 10;
}

// ---------- Logika igre ----------
// Stanje igre živi u runs.state (JSON, oblik iz game.js); stupci score/status/max_level služe ljestvicama.
const loadRun = (userId, date) => db.prepare('SELECT * FROM runs WHERE user_id=? AND date=?').get(userId, date);
function stateOf(row) { return row.state ? JSON.parse(row.state) : Game.newRun(); }
function saveRun(row, st) {
  db.prepare(`UPDATE runs SET state=?, status=?, q_index=?, lives=?, base_score=?, speed_bonus=?, streak_bonus=?, score=?,
    max_level=?, correct_count=?, served_at=?, total_ms=?, finished_at=? WHERE id=?`)
    .run(JSON.stringify(st), st.status === 'finished' ? 'finished' : 'playing', st.q, st.lives, st.base, st.speed,
      st.streakBonus || 0, Game.finalScore(st), st.maxLevel, st.correctCount, st.servedAt, st.totalMs,
      st.status === 'finished' ? Date.now() : null, row.id);
}
function questionAt(row, st) {
  const q = db.prepare('SELECT * FROM questions WHERE id=?').get(getDaily(row.date)[st.q]);
  return { ...q, options: JSON.parse(q.options) };
}
function runView(row) {
  const st = stateOf(row);
  return Game.view(st, st.status === 'question' ? questionAt(row, st) : null, Date.now());
}
function streakOf(user, date) {
  return user.last_played === date || user.last_played === addDays(date, -1) ? user.streak : 0;
}
// Zatvaranje igre: niz dana i bonus za niz
function finishRun(row, st, user, date) {
  const yesterday = addDays(date, -1);
  const streak = user.last_played === yesterday ? user.streak + 1 : (user.last_played === date ? user.streak : 1);
  st.status = 'finished'; st.servedAt = null;
  st.streakBonus = Game.streakBonusFor(streak);
  saveRun(row, st);
  db.prepare('UPDATE users SET streak=?, best_streak=MAX(best_streak, ?), last_played=? WHERE id=?').run(streak, streak, date, user.id);
}

// Igra iz prethodnog dana koja nije dovršena (zatvoren preglednik) zaključuje se s bodovima koje je igrač imao.
function closeStaleRuns(user) {
  const stale = db.prepare("SELECT * FROM runs WHERE user_id=? AND status='playing' AND date<? ORDER BY date").all(user.id, today());
  for (const row of stale) {
    const st = stateOf(row);
    finishRun(row, st, db.prepare('SELECT * FROM users WHERE id=?').get(user.id), row.date);
  }
  return stale.length ? db.prepare('SELECT * FROM users WHERE id=?').get(user.id) : user;
}

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Sljedeće pitanje: igrač prije prikaza bira hoće li igrati "Dupli ili ništa"
function next(user, body) {
  const date = today(); const row = loadRun(user.id, date);
  if (!row || row.status !== 'playing') return [409, { error: 'Nema aktivne igre.' }];
  const st = stateOf(row);
  if (st.status === 'question') return [200, { run: runView(row) }];      // već prikazano: vrati isto, sat teče dalje
  if (body.q !== st.q) return [409, { error: 'Stanje igre se promijenilo, osvježi stranicu.' }];
  Game.serve(st, body.double === true, Date.now());
  saveRun(row, st);
  return [200, { run: runView(loadRun(user.id, date)) }];
}

function answer(user, body) {
  const date = today(); const row = loadRun(user.id, date);
  if (!row || row.status !== 'playing') return [409, { error: 'Nema aktivne igre.' }];
  const st = stateOf(row);
  if (st.status !== 'question' || body.q !== st.q) return [409, { error: 'Pitanje je već odgovoreno.' }];
  const q = questionAt(row, st);
  const chosen = Number.isInteger(body.choice) && body.choice >= 0 && body.choice <= 3 ? body.choice : null;
  const now = Date.now(), ms = now - st.servedAt, qIndex = st.q;
  const result = tx(() => {
    const r = Game.answer(st, chosen, q.correct, now);
    db.prepare('INSERT INTO answers(run_id, q_index, question_id, chosen, correct, ms, doubled) VALUES(?,?,?,?,?,?,?)')
      .run(row.id, qIndex, q.id, chosen, r.correct ? 1 : 0, ms, r.doubled ? 1 : 0);
    if (st.status === 'finished') finishRun(row, st, user, date); else saveRun(row, st);
    return r;
  });
  return [200, { result, run: runView(loadRun(user.id, date)) }];
}

function leaderboard(period) {
  const d = today();
  let where = 'r.date = ?', args = [d];
  if (period === 'weekly') { where = 'r.date >= ? AND r.date <= ?'; args = [weekStart(d), d]; }
  if (period === 'alltime') { where = '1=1'; args = []; }
  return db.prepare(`
    SELECT u.username, SUM(r.score) score, MAX(r.max_level) max_level, COUNT(*) games, SUM(r.total_ms) ms
    FROM runs r JOIN users u ON u.id=r.user_id
    WHERE r.status='finished' AND ${where}
    GROUP BY u.id ORDER BY score DESC, ms ASC LIMIT 50`).all(...args);
}

function profile(username) {
  const u = db.prepare('SELECT id, username, created_at, streak, best_streak, last_played FROM users WHERE username=?').get(username);
  if (!u) return null;
  const stats = db.prepare(`SELECT COUNT(*) games, COALESCE(MAX(score),0) best_score, COALESCE(MAX(max_level),0) max_level,
    COALESCE(SUM(score),0) total, COALESCE(SUM(max_level=5),0) summits
    FROM runs WHERE user_id=? AND status='finished'`).get(u.id);
  const recent = db.prepare(`SELECT date, score, max_level, correct_count FROM runs
    WHERE user_id=? AND status='finished' ORDER BY date DESC LIMIT 14`).all(u.id);
  // niz se prekida ako igrač nije igrao jučer ni danas
  const d = today();
  const streak = (u.last_played === d || u.last_played === addDays(d, -1)) ? u.streak : 0;
  return { username: u.username, since: u.created_at.slice(0, 10), streak, bestStreak: u.best_streak, ...stats, recent };
}

// ---------- HTTP ----------
function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) return reject(new Error('json'));
    let b = ''; req.on('data', c => { b += c; if (b.length > 10_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (!p.startsWith('/api/')) {
      const file = path.join(__dirname, 'public', p === '/' ? 'index.html' : path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('Nije pronađeno');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }

    const user = getUser(req);
    const body = req.method === 'POST' ? await readJson(req) : {};

    if (p === '/api/register' && req.method === 'POST') {
      const username = String(body.username || '').trim(), password = String(body.password || '');
      if (!/^[A-Za-z0-9_čćžšđČĆŽŠĐ]{3,20}$/.test(username)) return send(res, 400, { error: 'Korisničko ime: 3–20 znakova (slova, brojke, _).' });
      if (password.length < 8) return send(res, 400, { error: 'Lozinka mora imati barem 8 znakova.' });
      if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return send(res, 409, { error: 'Korisničko ime je zauzeto.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const { lastInsertRowid } = db.prepare('INSERT INTO users(username, pass_hash, salt, created_at) VALUES(?,?,?,?)')
        .run(username, hashPassword(password, salt), salt, new Date().toISOString());
      return send(res, 200, { username }, { 'Set-Cookie': cookie(createSession(Number(lastInsertRowid)), 30 * 86400) });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const username = String(body.username || '').trim();
      if (rateLimited((req.socket.remoteAddress || '') + ':' + username.toLowerCase()))
        return send(res, 429, { error: 'Previše pokušaja. Pokušaj ponovno za 15 minuta.' });
      const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
      const ok = u && crypto.timingSafeEqual(Buffer.from(hashPassword(String(body.password || ''), u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));
      if (!ok) return send(res, 401, { error: 'Pogrešno korisničko ime ili lozinka.' });
      return send(res, 200, { username: u.username }, { 'Set-Cookie': cookie(createSession(u.id), 30 * 86400) });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
      if (m) db.prepare('DELETE FROM sessions WHERE token=?').run(m[1]);
      return send(res, 200, {}, { 'Set-Cookie': cookie('', 0) });
    }
    if (p === '/api/rules') return send(res, 200, { ...RULES, date: today() });
    if (p === '/api/leaderboard') return send(res, 200, { period: url.searchParams.get('period') || 'daily', rows: leaderboard(url.searchParams.get('period')) });
    if (p.startsWith('/api/profile/')) {
      const pr = profile(decodeURIComponent(p.slice('/api/profile/'.length)));
      return pr ? send(res, 200, pr) : send(res, 404, { error: 'Igrač ne postoji.' });
    }

    if (!user) return send(res, 401, { error: 'Prijavi se.' });
    const player = closeStaleRuns(user);

    if (p === '/api/me') {
      const date = today(); const row = loadRun(user.id, date);
      return send(res, 200, { username: user.username, date, streak: streakOf(player, date), run: row ? runView(row) : null });
    }
    if (p === '/api/run/start' && req.method === 'POST') {
      const date = today(); getDaily(date);
      const now = Date.now();
      // jedna igra dnevno: ako već postoji, vraća se njeno stanje
      db.prepare(`INSERT OR IGNORE INTO runs(user_id, date, status, lives, started_at, state) VALUES(?,?,?,?,?,?)`)
        .run(user.id, date, 'playing', RULES.lives, now, JSON.stringify(Game.newRun()));
      return send(res, 200, { run: runView(loadRun(user.id, date)) });
    }
    if (p === '/api/run/next' && req.method === 'POST') { const [s, d] = next(player, body); return send(res, s, d); }
    if (p === '/api/run/answer' && req.method === 'POST') { const [s, d] = answer(player, body); return send(res, s, d); }

    send(res, 404, { error: 'Nepoznata ruta.' });
  } catch (e) {
    if (e.message === 'json') return send(res, 415, { error: 'Očekujem JSON.' });
    console.error(e); send(res, 500, { error: 'Greška na serveru.' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Dnevni kviz radi na http://localhost:${PORT}`));
  // uredno gašenje (hosting šalje SIGTERM pri novoj verziji) da baza ostane zatvorena čisto
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
}
module.exports = { server, db, RULES, Game, getDaily, today };
