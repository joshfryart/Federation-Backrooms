// CFO: run helm and damper checks (shakedown). Step the throttle up stage by stage (↑): each stage spools the engine, then the helm runs a turn
// while the three damper needles show live load. Only call the next stage once the turn is done and the engine note has settled. If a damper
// needle runs past its band during a turn, call a halt at once (Space). Halting a clean turn wastes the test.
import { define, machine, SPACE, ARROW, rf, ri, shuffle, clamp, txt, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Run helm and damper checks', type: 'task:shakedown' },
  title: 'Throttle staging with damper halt call', dept: 'flight', host: 'console', tool: 'Helm throttle and damper gauges',
  how: 'Press ↑ for the next throttle stage only when the last turn is finished and the engine has settled. Watch the damper needles through each turn and press Space the moment one runs past its band.',
  keys: ['↑ next throttle stage', 'Space call a halt'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'stage and halt', input: 'arrows+space', win: 'all four throttle stages run in turn with each one settled first, and every damper bank that ran past its band halted on the spot',
    fail: 'jumping a stage while the engine spools or a turn is running, halting a clean turn, or letting a bank run past its band without a halt',
    rule: 'Stage lamp: SPOOLING, then TURN, then SETTLED; ↑ only on SETTLED. During a turn a needle crossing its band edge needs Space within a second.' },
  rush: 'Ran the throttle straight up to full and read the gauges afterward.',
  captions: { 'stage jumped': 'engine note howls', 'false halt': 'helm stops for nothing', 'missed lag': 'damper alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, late = m.calm ? 1.3 : 1.0;
    const bad = new Set(shuffle(r, [1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.stages = [0, 1, 2, 3].map(k => ({ spool: rf(r, 1.0, 1.5), turn: rf(r, 2.6, 3.2), lag: bad.has(k) ? { bank: ri(r, 0, 2), at: rf(r, 0.5, 1.4), dur: 1.4, halted: false } : null }));
    m.k = 0; m.ph = 'spool'; m.pt = 0; m.rounds = 4; m.round = 1; m.ph0 = [0, 1, 2].map(() => rf(r, 0, 6));
    const S = () => m.stages[m.k];
    m.load = (b) => { const s = S(), base = m.ph === 'turn' ? 0.3 + 0.1 * (m.k + 1) * Math.sin(Math.PI * m.pt / s.turn) : 0.15 + 0.03 * m.k; let v = base + 0.03 * Math.sin(m.t * 5 + m.ph0[b]); if (m.ph === 'turn' && s.lag && s.lag.bank === b && m.pt >= s.lag.at && m.pt < s.lag.at + s.lag.dur && !s.lag.halted) v = 0.86 + 0.03 * Math.sin(m.t * 9); return clamp(v); };
    const crossing = () => { const s = S(); return m.ph === 'turn' && s.lag && !s.lag.halted && m.pt >= s.lag.at && m.pt < s.lag.at + s.lag.dur; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U') { if (m.ph !== 'done') { m.fault('stage jumped'); return true; } m.k++; m.round = m.k + 1; m.ph = 'spool'; m.pt = 0; return true; } if (a) return true;
      if (SPACE(code)) { if (crossing()) { S().lag.halted = true; m.ev('halt', { stage: m.k }); } else m.fault('false halt'); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const s = S(); m.pt += dt;
      if (m.ph === 'turn' && s.lag && !s.lag.halted && !s.lag.missed && m.pt > s.lag.at + late) { s.lag.missed = true; m.fault('missed lag'); }
      if (m.ph === 'spool' && m.pt >= s.spool) { m.ph = 'turn'; m.pt = 0; } else if (m.ph === 'turn' && m.pt >= s.turn) { m.ph = 'done'; m.pt = 0; if (m.k === 3 && m.state === 'play') m.win(); }
    };
    m.hint = () => crossing() && m.pt > S().lag.at + 0.2 ? [['Space', true]] : m.ph === 'done' && m.pt > 0.2 ? [['ArrowUp', true]] : [];
    m.bad = () => 'ArrowUp';
    m.view = () => ({ s: m.stages.map(s => s.lag ? [s.lag.bank, +s.lag.at.toFixed(2)] : 0) });
    m.buttons = () => [['ArrowUp', '▲ Next stage'], ['Space', 'HALT']];
    m.draw = (c, W, H, P) => {
      [0, 1, 2, 3].forEach(k => { const x = 20 + k * 52, now = k === m.k; lamp(c, x + 8, 22, 8, k < m.k || (now && m.ph === 'done') ? P.good : now ? COL.gold : '#333', 'circle'); txt(c, `S${k + 1}`, x + 20, 26, { size: 11, col: now ? COL.ink : COL.dim }); });
      txt(c, m.ph === 'spool' ? 'SPOOLING — engine note rising' : m.ph === 'turn' ? 'TURN in progress — watch the dampers' : 'SETTLED — ↑ for the next stage', 230, 26, { size: 11, col: m.ph === 'done' ? P.good : COL.pale });
      [0, 1, 2].forEach(b => { const v = m.load(b), y = 50 + b * 30, over = v > 0.8; txt(c, `Bank ${b + 1}`, 20, y + 10, { size: 12 }); bar(c, 80, y, 260, 12, v, { band: [0, 0.8], col: over ? P.bad : COL.gold }); if (over) { lamp(c, 360, y + 6, 7, P.bad, 'triangle'); txt(c, 'PAST', 352, y + 26, { size: 9, col: P.bad }); } });
      txt(c, `engine ${m.ph === 'spool' ? Math.round(40 + 50 * m.pt / S().spool) : 90}% of stage`, 20, 158, { size: 11, col: COL.dim });
    };
    return m;
  },
});
