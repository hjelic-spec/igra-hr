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
    secondsPerQuestion: 20,
    graceMs: 1500,                // tolerancija za mrežno kašnjenje
    lives: 2,                     // druga greška završava uspon; vrijede bodovi u tom trenutku
    speedBonusShare: 0.5,         // najviše +50 % bodova pitanja za brz odgovor
    // kriv odgovor (ili istek vremena) oduzima bodove pitanja; uz "Dupli ili ništa" dvostruko. Rezultat ne ide ispod 0.
    doubles: 3,                   // "Dupli ili ništa" najviše 3 puta po igri
    streakBonusPerDay: 5,         // +5 bodova po uzastopnom danu nakon prvog
    streakBonusMax: 50,
  };
  const PLAN = RULES.levels.flatMap(l => Array.from({ length: l.count }, () => l));
  const TOTAL = PLAN.length;

  // status: 'ready' (čeka sljedeće pitanje), 'question' (pitanje je prikazano, sat teče), 'finished'
  function newRun() {
    return { q: 0, status: 'ready', lives: RULES.lives, base: 0, speed: 0,
      doublesLeft: RULES.doubles, doubled: false, servedAt: null, answers: [],
      maxLevel: 0, correctCount: 0, totalMs: 0, out: false, streakBonus: 0 };
  }

  const current = run => run.base + run.speed;
  const finalScore = run => current(run) + (run.streakBonus || 0);

  function serve(run, wantDouble, now) {
    if (run.status !== 'ready') throw new Error('Pitanje je već prikazano.');
    run.doubled = !!wantDouble && run.doublesLeft > 0;
    if (run.doubled) run.doublesLeft--;
    run.servedAt = now; run.status = 'question';
    return run;
  }

  // correctIndex dolazi iz baze pitanja; klijent ga nikad ne zna prije odgovora
  function answer(run, choice, correctIndex, now) {
    if (run.status !== 'question') throw new Error('Nema prikazanog pitanja.');
    const step = PLAN[run.q], limit = RULES.secondsPerQuestion * 1000;
    const ms = now - run.servedAt;
    const timedOut = ms > limit + RULES.graceMs;
    const correct = !timedOut && choice === correctIndex;
    const mult = run.doubled ? 2 : 1;
    let gained = 0, speed = 0;
    if (correct) {
      gained = step.points * mult;
      speed = Math.round(step.points * RULES.speedBonusShare * Math.max(0, limit - ms) / limit);
      run.base += gained; run.speed += speed; run.correctCount++;
      run.maxLevel = Math.max(run.maxLevel, step.level);
    } else {
      run.lives--;
      gained = -step.points * mult;
      run.base += gained;
      // rezultat ne ide u minus
      if (current(run) < 0) { gained -= current(run); run.base = -run.speed; }
    }
    run.answers.push({ c: correct, d: run.doubled });
    run.totalMs += Math.min(ms, limit);
    const wasDoubled = run.doubled;
    run.doubled = false; run.servedAt = null;

    let event = null;
    if (run.lives <= 0) {                      // druga greška: kraj, vrijede bodovi u ovom trenutku
      run.out = true; run.status = 'finished'; event = 'out';
    } else if (run.q + 1 >= TOTAL) {
      run.status = 'finished'; event = correct ? 'summit' : 'end';
    } else {
      run.q++; run.status = 'ready';
    }
    return { correct, timedOut, correctChoice: correctIndex, gained, speedBonus: speed, doubled: wasDoubled, event };
  }

  // Što klijent smije vidjeti (bez točnih odgovora)
  function view(run, question, now) {
    const step = PLAN[Math.min(run.q, TOTAL - 1)];
    const v = { status: run.status, q: run.q, total: TOTAL, lives: run.lives, score: finalScore(run),
      current: current(run), base: run.base, speedBonus: run.speed, doublesLeft: run.doublesLeft, doubled: run.doubled,
      answers: run.answers.slice(), maxLevel: run.maxLevel, correctCount: run.correctCount,
      out: run.out, streakBonus: run.streakBonus || 0,
      next: { level: step.level, points: step.points } };
    if (run.status === 'question' && question) {
      v.question = { text: question.text, options: question.options,
        secondsLeft: Math.max(0, Math.ceil((RULES.secondsPerQuestion * 1000 - (now - run.servedAt)) / 1000)) };
    }
    return v;
  }

  // Rezultat za dijeljenje: piramida od emojija, bez ijednog pitanja ili odgovora
  function shareText(v, dateLabel, streak) {
    const mark = a => !a ? '⬜' : a.c ? (a.d ? '🟨' : '🟩') : (a.d ? '💥' : '🟥');
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

  const Game = { RULES, PLAN, TOTAL, newRun, serve, answer, view, finalScore, shareText, streakBonusFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = Game; else root.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
