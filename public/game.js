// Pravila igre "Dnevna piramida": jedan izvor istine za server (Node) i probnu verziju (preglednik).
// Ovaj modul ne zna ništa o bazi ni o pitanjima; radi samo sa stanjem jedne igre (običan objekt).
(function (root) {
  'use strict';

  const RULES = {
    levels: [                     // piramida odozdo prema vrhu
      { level: 1, count: 5, points: 10 },
      { level: 2, count: 4, points: 20 },
      { level: 3, count: 3, points: 40 },
      { level: 4, count: 2, points: 80 },
      { level: 5, count: 1, points: 160 },
    ],
    secondsPerQuestion: 10,
    graceMs: 1500,                // tolerancija za mrežno kašnjenje
    lives: 2,                     // druga greška završava uspon; vrijede bodovi u tom trenutku
    // kriv odgovor (ili istek vremena) oduzima bodove pitanja (bez multiplikatora). Rezultat ne ide ispod 0.
    // Bonus za brzinu: točan odgovor unutar 3 s od prikaza pitanja udvostručuje bodove SLJEDEĆEG pitanja.
    // Ne nagomilava se: niz brzih odgovora daje ×2 na svakom sljedećem pitanju (ne ×4, ×8).
    // Kriv ili sporiji odgovor vraća na ×1. Množe se bodovi pitanja (ne bonus za brzinu); kazna se ne množi.
    // Vrijeme mjeri server od slanja pitanja do primitka odgovora, pa uključuje i put kroz mrežu;
    // latencyMs je tolerancija za to kašnjenje (igrač vidi granicu od 3 s, server prihvaća do 3,3 s).
    fastBonus: { withinMs: 3000, latencyMs: 300, mult: 2 },
    // Rezerva vremena i bonus bodova za brzinu (do +50 %) ukinuti su 2026-11-27; brzinu nagrađuje samo fastBonus.
    attemptsPerDay: 3,            // 3 piramide dnevno, svaka s drugim pitanjima (iste za sve igrače)
    dailyScore: 'best',           // što ide na ljestvicu: 'best' (najbolja od tri), 'sum' (zbroj) ili 'first' (prva)
    streakBonusPerDay: 5,         // +5 bodova po uzastopnom danu nakon prvog
    streakBonusMax: 50,
  };
  const PLAN = RULES.levels.flatMap(l => Array.from({ length: l.count }, () => l));
  const TOTAL = PLAN.length;

  // status: 'ready' (čeka sljedeće pitanje), 'question' (pitanje je prikazano, sat teče), 'finished'
  function newRun() {
    return { q: 0, status: 'ready', lives: RULES.lives, base: 0, speed: 0,
      fastStreak: 0, mult: 1, limitMs: null, servedAt: null, answers: [],
      maxLevel: 0, correctCount: 0, totalMs: 0, out: false, streakBonus: 0 };
  }

  const current = run => run.base + (run.speed || 0);   // speed: bonus za brzinu iz starih igara (nove ga nemaju)
  const finalScore = run => current(run) + (run.streakBonus || 0);

  // Multiplikator sljedećeg pitanja: ×2 ako je prethodni odgovor bio brz i točan, inače ×1
  const bonusMult = fastStreak => fastStreak > 0 ? RULES.fastBonus.mult : 1;

  // stanja spremljena po starim pravilima (ulozi ×2) nemaju više uloga; zatečeni multiplikator ostaje do odgovora
  function norm(run) {
    if (typeof run.mult !== 'number') run.mult = run.doubled ? 2 : 1;
    if (typeof run.fastStreak !== 'number') run.fastStreak = 0;
    delete run.stakes; delete run.earnedCount; delete run.doublesLeft; delete run.doubled; delete run.bankMs;
    return run;
  }

  function serve(run, now) {
    norm(run);
    if (run.status !== 'ready') throw new Error('Pitanje je već prikazano.');
    run.mult = bonusMult(run.fastStreak);
    run.limitMs = RULES.secondsPerQuestion * 1000;
    run.servedAt = now; run.status = 'question';
    return run;
  }

  // correctIndex dolazi iz baze pitanja; klijent ga nikad ne zna prije odgovora
  function answer(run, choice, correctIndex, now) {
    norm(run);
    if (run.status !== 'question') throw new Error('Nema prikazanog pitanja.');
    const step = PLAN[run.q], limit = RULES.secondsPerQuestion * 1000;
    const ms = now - run.servedAt;
    const total = Math.max(run.limitMs || 0, limit);     // pitanje prikazano po starim pravilima zadržava svoju rezervu
    const timedOut = ms > total + RULES.graceMs;
    const correct = !timedOut && choice === correctIndex;
    const mult = run.mult;
    let gained = 0;
    if (correct) {
      gained = step.points * mult;
      run.base += gained; run.correctCount++;
      run.maxLevel = Math.max(run.maxLevel, step.level);
    } else {
      run.lives--;
      gained = -step.points;
      run.base += gained;
      // rezultat ne ide u minus
      if (current(run) < 0) { gained -= current(run); run.base = -(run.speed || 0); }
    }
    // bonus za brzinu: brz točan odgovor udvostručuje sljedeće pitanje, inače se vraća na ×1
    const F = RULES.fastBonus;
    const fast = correct && ms <= F.withinMs + F.latencyMs;
    run.fastStreak = fast ? run.fastStreak + 1 : 0;
    const nextMult = bonusMult(run.fastStreak);
    run.answers.push({ c: correct, m: mult });
    run.totalMs += Math.min(ms, total);
    run.limitMs = null;
    run.mult = 1; run.servedAt = null;

    let event = null;
    if (run.lives <= 0) {                      // druga greška: kraj, vrijede bodovi u ovom trenutku
      run.out = true; run.status = 'finished'; event = 'out';
    } else if (run.q + 1 >= TOTAL) {
      run.status = 'finished'; event = correct ? 'summit' : 'end';
    } else {
      run.q++; run.status = 'ready';
    }
    return { correct, timedOut, correctChoice: correctIndex, gained, mult, fast, nextMult, ms, event };
  }

  // Što klijent smije vidjeti (bez točnih odgovora)
  function view(run, question, now) {
    norm(run);
    const step = PLAN[Math.min(run.q, TOTAL - 1)];
    const v = { status: run.status, q: run.q, total: TOTAL, lives: run.lives, score: finalScore(run),
      current: current(run), base: run.base,
      fastStreak: run.fastStreak, mult: run.status === 'question' ? run.mult : bonusMult(run.fastStreak),
      answers: run.answers.slice(), maxLevel: run.maxLevel, correctCount: run.correctCount,
      out: run.out, streakBonus: run.streakBonus || 0,
      next: { level: step.level, points: step.points } };
    if (run.status === 'question' && question) {
      const total = Math.max(run.limitMs || 0, RULES.secondsPerQuestion * 1000), el = now - run.servedAt;
      v.question = { text: question.text, options: question.options,
        secondsLeft: Math.max(0, Math.ceil((total - el) / 1000)) };
    }
    return v;
  }

  // Rezultat za dijeljenje: piramida od emojija, bez ijednog pitanja ili odgovora
  function shareText(v, dateLabel, streak) {
    const mark = a => !a ? '⬜' : a.c ? ((a.m || (a.d ? 2 : 1)) > 1 ? '🟨' : '🟩') : '🟥';
    const rows = []; let i = 0;
    for (const l of RULES.levels) {
      let row = '';
      for (let k = 0; k < l.count; k++, i++) row += mark(v.answers[i]);
      rows.push(row);
    }
    const width = RULES.levels[0].count;
    const lines = rows.reverse().map((r, idx) => ' '.repeat(width - RULES.levels[RULES.levels.length - 1 - idx].count) + r);
    const top = v.answers.length === TOTAL && v.answers[TOTAL - 1].c;
    const end = top ? 'na vrhu ▲' : v.out ? 'pao na ' + v.answers.length + '. pitanju' : '';
    return [`Dnevna piramida ${dateLabel}`, ...lines, `${v.score} bodova${end ? ' · ' + end : ''}${streak > 1 ? ' · 🔥' + streak : ''}`].join('\n');
  }

  function streakBonusFor(streak) { return Math.min(RULES.streakBonusMax, Math.max(0, streak - 1) * RULES.streakBonusPerDay); }

  const Game = { RULES, PLAN, TOTAL, newRun, serve, answer, view, finalScore, shareText, streakBonusFor, bonusMult };
  if (typeof module !== 'undefined' && module.exports) module.exports = Game; else root.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
