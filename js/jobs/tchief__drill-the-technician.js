// Transporter chief: drill the technician. The technician walks the pad drill one move at a time against the scenario card. A slow or untidy
// move on the right control is a small error: let it happen, they learn from it. A move on the WRONG control must be stopped while it is
// happening (Space pauses the scenario); the run stays paused until the right control is named (1-3). Stopping a sound or merely slow move
// over-coaches; letting a wrong one through teaches the wrong habit.
import { define, machine, SPACE, DIG, ri, rf, pick, shuffle, txt, box, lamp, COL } from './kit.js';

const PARTS = ['Lock indicator', 'Emitter array', 'Pad side panel', 'Pattern buffer', 'Phase coil', 'Targeting grid', 'Biofilter', 'Energize switch'];
const SLOW = ['hesitates, then', 'reaches across, then', 'double-checks, then'];
const SCEN = ['Lock failure', 'Misaligned pad', 'Buffer overflow', 'Coil overheat'];
export default define({
  job: { billet: 'tchief', label: 'Drill the technician', type: 'loop' },
  title: 'Scenario pause on the pad drill', dept: 'operations', host: 'console', tool: 'Pad side panel scenario pause',
  how: 'Watch each of the technician\'s moves against the scenario card. Let slow moves go. When they go for the wrong control, press Space to pause, then name the right control with 1-3.',
  keys: ['Space pause the scenario', '1-3 name the right control'], limit: 30, maxFaults: 2,
  fingerprint: { verb: 'pause and correct', input: 'space+digits', win: 'the drill run to its end with every wrong-control move paused while it happened and the right control named before resuming',
    fail: 'pausing a sound or merely slow move, naming the wrong control, or letting a wrong-control move run on',
    rule: 'Each move shows for a moment beside the card step it should be. Same control, even if slow: let it run. Different control: Space while it is showing, then the digit of the card\'s control.' },
  rush: 'Watched the run from the console and handed over a list of mistakes afterwards.',
  captions: { 'needless stop': 'pause chime', 'over-coached': 'pause chime', 'wrong habit': 'drill buzzer', 'wrong correction': 'error tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dwell = m.calm ? 1.8 : 1.25;
    const card = shuffle(r, PARTS).slice(0, 7), sev = new Set(shuffle(r, [1, 2, 3, 4, 5, 6]).slice(0, ri(r, 2, 3)));
    const minor = new Set(shuffle(r, [0, 1, 2, 3, 4, 5, 6].filter(k => !sev.has(k))).slice(0, ri(r, 1, 2)));
    m.scen = pick(r, SCEN);
    m.moves = card.map((want, k) => {
      if (sev.has(k)) { const did = pick(r, PARTS.filter(p => p !== want)), opts3 = shuffle(r, [want, did, pick(r, PARTS.filter(p => p !== want && p !== did))]); return { want, did, kind: 'wrong', opts: opts3, fixed: false }; }
      return { want, did: want, kind: minor.has(k) ? 'slow' : 'ok', how: pick(r, SLOW), lag: rf(r, 0, 0.2) };
    });
    m.k = 0; m.st = 0; m.paused = false; m.rounds = 7; m.round = 0;
    const M = () => m.moves[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return SPACE(code) || !!DIG(code); const mv = M(); if (!mv) return false;
      if (SPACE(code)) {
        if (m.paused) return true;
        if (mv.kind === 'wrong' && !mv.fixed) { m.paused = true; m.ev('pause'); }
        else m.fault(mv.kind === 'slow' ? 'over-coached' : 'needless stop');
        return true;
      }
      const d = DIG(code); if (!d) return false; if (!m.paused || d > 3) return true;
      if (mv.opts[d - 1] === mv.want) { mv.fixed = true; m.paused = false; m.st = dwell; } else m.fault('wrong correction');
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.paused) return; m.st += dt; if (m.st < dwell) return;
      const mv = M(); if (mv.kind === 'wrong' && !mv.fixed) m.fault('wrong habit');
      m.k++; m.round = m.k; m.st = 0; if (m.k >= m.moves.length && m.state === 'play') m.win();
    };
    m.hint = () => { const mv = M(); if (!mv) return []; if (m.paused) return [['Digit' + (mv.opts.indexOf(mv.want) + 1), true]]; return mv.kind === 'wrong' && !mv.fixed && m.st > 0.3 ? [['Space', true]] : []; };
    m.bad = () => { const mv = M(); return mv && mv.kind !== 'wrong' && m.st > 0.2 ? 'Space' : null; };
    m.view = () => ({ scen: m.scen, moves: m.moves.map(v => [v.want, v.did, v.kind]) });
    m.buttons = () => [['Space', 'Pause'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3']];
    m.draw = (c, W, H, P) => {
      txt(c, `DRILL CARD: ${m.scen}`, 12, 18, { size: 11, col: COL.dim });
      m.moves.forEach((v, k) => { const y = 34 + k * 14, on = k === m.k; txt(c, `${k + 1}. ${v.want}`, 14, y, { size: 11, col: on ? COL.gold : k < m.k ? COL.dim : COL.ink, w: on ? 800 : 500 }); });
      const mv = M(); if (!mv) return;
      box(c, 170, 26, W - 182, 66, 'rgba(255,255,255,.05)', m.paused ? COL.orange : COL.peri, 10);
      txt(c, 'TECHNICIAN', 182, 42, { size: 10, col: COL.dim });
      const words = mv.kind === 'slow' ? `${mv.how} points at ${mv.did}` : `points at ${mv.did}`;
      txt(c, words, 182, 62, { size: 12, col: COL.ink }); const match = mv.did === mv.want;
      lamp(c, 190, 80, 7, match ? P.good : P.bad, match ? 'circle' : 'triangle'); txt(c, match ? 'same control as the card' : 'NOT the card control', 204, 84, { size: 10, col: match ? P.good : COL.warn });
      if (m.paused) mv.opts.forEach((o, i) => { box(c, 170 + i * 76, 100, 70, 30, 'rgba(240,147,58,.15)', COL.orange, 6); txt(c, `${i + 1} ${o}`, 205 + i * 76, 119, { size: 9, align: 'center' }); });
      else { c.fillStyle = COL.peri; c.fillRect(170, 100, (W - 182) * Math.min(1, m.st / dwell), 6); }
      txt(c, m.paused ? 'PAUSED — name the right control' : 'run in progress', 170, H - 14, { size: 11, col: m.paused ? COL.warn : COL.dim });
    };
    return m;
  },
});
