// Yeoman: time and note each drill result. At the bridge drill console, start the stopwatch the instant the start lamp lights and stop it the
// instant the end lamp lights. A press before a lamp or well after it leaves no reliable time for the review. Then mark the sheet: pass if
// the reading is inside the drill's target, slow if it is over.
import { define, machine, ARROW, SPACE, rf, shuffle, txt, box, lamp, COL } from './kit.js';

const DRILLS = [['Fire team to deck 3', 'Lt Varga'], ['Hull breach seal', 'CPO Mendez'], ['Medical to bridge', 'Dr Lin'], ['Security to brig', 'Ens Tamsin'], ['Damage control muster', 'Cdr Okafor'], ['Transporter evac', 'Chief Ruiz']];

export default define({
  job: { billet: 'yeoman', label: 'Time and note each drill result', type: 'task:shakedown' },
  title: 'Stopwatch on the start and end lamps', dept: 'command', host: 'console', tool: 'Drill console stopwatch and drill sheet',
  how: 'Press Space the instant the START lamp lights, and again the instant the END lamp lights. Then mark the sheet: ← pass if the reading is within target, → slow if it is over.',
  keys: ['Space start / stop', '← pass', '→ slow'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'clock the lamps', input: 'space+arrows', win: 'three drills clocked from start lamp to end lamp within a fraction of a second and each correctly marked pass or slow',
    fail: 'jumping a lamp, reacting long after it, or marking a slow drill as a pass',
    rule: 'Lamps light after an unknown wait. Space within a third of a second of the START lamp starts the watch; Space within a third of a second of the END lamp stops it. Compare the reading with the target: ← pass, → slow.' },
  rush: 'Guessed the times from the wall clock afterwards.',
  captions: { 'jumped the lamp': 'stopwatch clicks early', 'late press': 'stopwatch clicks late', 'mis-marked': 'pen scratch' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, win = m.calm ? 0.5 : 0.33;
    m.drills = shuffle(r, DRILLS).slice(0, 3).map(([d, who]) => { const dur = rf(r, 2.2, 4.2), slow = r() < 0.5; return { d, who, dur, target: +(slow ? dur - rf(r, 0.5, 1.2) : dur + rf(r, 0.5, 1.2)).toFixed(1), wait: rf(r, 0.8, 1.8) }; });
    m.k = 0; m.ph = 'wait'; m.c = 0; m.read = 0; m.t0 = 0; m.rounds = 3; m.round = 1; m.marks = [];
    const D = () => m.drills[m.k];
    const reset = () => { m.ph = 'wait'; m.c = 0; m.read = 0; D().wait = 0.8 + (D().wait * 1.7) % 1; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (SPACE(code)) { if (!down) return true; const d = D();
        if (m.ph === 'wait') { if (m.c < d.wait) { m.fault('jumped the lamp'); reset(); } else { m.ph = 'run'; m.t0 = m.c; } }
        else if (m.ph === 'run') { const lit = d.wait + d.dur; if (m.c < lit) { m.fault('jumped the lamp'); reset(); } else { m.read = +(m.c - m.t0).toFixed(1); m.ph = 'mark'; } }
        return true; }
      if (a !== 'L' && a !== 'R') return false; if (!down || m.ph !== 'mark') return true; const pass = m.read <= D().target;
      if ((a === 'L') !== pass) m.fault('mis-marked'); m.marks.push([m.read, a === 'L']); m.k++;
      if (m.k >= 3) { if (m.state === 'play') m.win(); return true; } m.round = m.k + 1; m.ph = 'wait'; m.c = 0; return true;
    };
    m.tick = (dt) => { if (!m.live(dt) || m.ph === 'mark') return; m.c += dt; const d = D();
      if (m.ph === 'wait' && m.c > d.wait + win) { m.fault('late press'); reset(); }
      else if (m.ph === 'run' && m.c > d.wait + d.dur + win) { m.fault('late press'); reset(); } };
    m.hint = () => { const d = D(); if (!d) return []; if (m.ph === 'mark') return [[m.read <= d.target ? 'ArrowLeft' : 'ArrowRight', true]];
      const lit = m.ph === 'wait' ? d.wait : d.wait + d.dur; return m.c >= lit + 0.05 ? [['Space', true]] : []; };
    m.bad = () => { const d = D(); if (!d) return null; return m.ph === 'mark' ? (m.read <= d.target ? 'ArrowRight' : 'ArrowLeft') : m.c > 0.2 ? 'Space' : null; };
    m.view = () => ({ d: m.drills.map(d => [d.d, +d.dur.toFixed(2), d.target]) });
    m.buttons = () => [['Space', 'Start / stop'], ['ArrowLeft', '◀ Pass'], ['ArrowRight', 'Slow ▶']];
    m.draw = (c, W, H, P) => {
      const d = D(); if (!d) return; txt(c, `DRILL ${m.k + 1}/3 · ${d.d}`, 10, 18, { size: 12, col: COL.peri }); txt(c, `team lead ${d.who} · target ${d.target.toFixed(1)} s`, 10, 34, { size: 10, col: COL.dim });
      const sOn = m.ph === 'wait' ? m.c >= d.wait : true, eOn = m.ph === 'mark' || (m.ph === 'run' && m.c >= d.wait + d.dur);
      lamp(c, 50, 80, 20, sOn ? P.good : 'rgba(255,255,255,.12)', 'circle'); txt(c, 'START', 50, 116, { size: 10, align: 'center', col: COL.dim });
      lamp(c, 120, 80, 20, eOn ? COL.warn : 'rgba(255,255,255,.12)', 'square'); txt(c, 'END', 120, 116, { size: 10, align: 'center', col: COL.dim });
      const shown = m.ph === 'run' ? m.c - m.t0 : m.read; box(c, 170, 52, 120, 50, COL.panel, COL.gold, 8); txt(c, `${shown.toFixed(1)} s`, 230, 86, { size: 24, align: 'center', col: COL.gold });
      txt(c, m.ph === 'mark' ? `${m.read.toFixed(1)} vs ${d.target.toFixed(1)}: ← pass  → slow` : m.ph === 'run' ? 'running…' : 'watch the START lamp', 230, 122, { size: 10, align: 'center', col: COL.pale });
      txt(c, 'SHEET', 310, 52, { size: 10, col: COL.peri }); m.marks.forEach(([t, ps], i) => txt(c, `${i + 1}. ${t.toFixed(1)} s ${ps ? 'PASS' : 'SLOW'}`, 310, 70 + i * 16, { size: 10 }));
    };
    return m;
  },
});
