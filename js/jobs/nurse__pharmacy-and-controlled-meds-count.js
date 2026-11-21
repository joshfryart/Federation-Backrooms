// Nurse: pharmacy and controlled meds count. Each tray's ampoules show up one by one; tap Space once per ampoule to build your own tally, then
// compare it with the drug log line. A tally that matches the log is signed (Enter); a short count must be flagged (Up) and never signed.
import { define, machine, SPACE, ENTER, ARROW, ri, pick, txt, box, COL } from './kit.js';

const DRUGS = ['Morphine 10 mg', 'Midazolam 5 mg', 'Ketamine 50 mg', 'Fentanyl 100 mcg', 'Diazepam 10 mg'];
export default define({
  job: { billet: 'nurse', label: 'Pharmacy and controlled meds count', type: 'loop' },
  title: 'Controlled tray tally against log', dept: 'medical', host: 'console', tool: 'Controlled cabinet tally',
  how: 'Tap Space once for every ampoule that appears in the tray. When the tray is fully shown, press Enter if your tally equals the log line, or Up to flag a short count.',
  keys: ['Space tally one', 'Enter sign', 'Up flag short'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'tally then sign', input: 'space+enter+arrows', win: 'three trays each counted ampoule by ampoule then signed when equal to the log or flagged when short',
    fail: 'signing a short tray, flagging an honest tray, tapping ahead of the ampoules or signing before the last one is counted',
    rule: 'Tap Space per ampoule as it appears; when all are out, Enter signs a count equal to the log line and Up flags any shortfall.' },
  rush: 'Eyeballed each tray and signed the log without counting.',
  captions: { 'signed short': 'cabinet alarm chirp', 'false flag': 'dull double tone', 'phantom tap': 'tally buzz', 'early sign': 'log pen scratch' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = m.calm ? 0.55 : 0.35;
    m.trays = Array.from({ length: 3 }, (_, i) => { const log = ri(r, 4, 7), short = i === 1 || r() < 0.3; return { drug: pick(r, DRUGS), log, act: short ? log - ri(r, 1, 2) : log, shown: 0, tally: 0 }; });
    m.k = 0; m.clk = 0; m.rounds = 3; m.round = 0;
    const T = () => m.trays[m.k], full = () => T().shown >= T().act;
    const next = () => { m.k++; m.round = m.k; m.clk = 0; if (m.k >= 3) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const own = SPACE(code) || ENTER(code) || ARROW(code) === 'U'; if (!own) return false; if (!down) return true; const t = T();
      if (SPACE(code)) { if (t.tally >= t.shown) m.fault('phantom tap'); else t.tally++; }
      else if (!full() || t.tally < t.shown) m.fault('early sign');
      else if (ENTER(code)) { if (t.act !== t.log) m.fault('signed short'); else next(); }
      else if (ARROW(code) === 'U') { if (t.act === t.log) m.fault('false flag'); else next(); }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const t = T(); if (!t || full()) return; m.clk += dt; if (m.clk >= gap) { m.clk = 0; t.shown++; m.ev('ampoule', { n: t.shown }); } };
    m.hint = () => { const t = T(); if (!t) return []; if (t.tally < t.shown) return [['Space', true]]; if (!full()) return []; return [[t.act === t.log ? 'Enter' : 'ArrowUp', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ trays: m.trays.map(t => [t.drug, t.log, t.act]) });
    m.buttons = () => [['Space', 'Tally'], ['Enter', 'Sign'], ['ArrowUp', 'Flag short']];
    m.draw = (c, W, H, P) => {
      const t = T() || m.trays[2]; txt(c, `${t.drug}   log line: ${t.log}`, 14, 24, { size: 14, col: COL.gold });
      for (let i = 0; i < 8; i++) { box(c, 14 + i * 32, 40, 26, 40, i < t.shown ? COL.pale : 'rgba(255,255,255,.06)', i < t.shown ? null : COL.dim, 8); if (i < t.tally) txt(c, '✓', 20 + i * 32, 66, { col: P.good, size: 16 }); }
      txt(c, `your tally ${t.tally}`, 14, 110, { size: 14 }); txt(c, `tray ${Math.min(m.k + 1, 3)} / 3`, W - 14, 24, { align: 'right', col: COL.dim });
      txt(c, full() ? (t.tally === t.log ? 'equal to log: Enter' : 'differs from log: Up') : 'counting out...', 14, 140, { size: 12, col: full() && t.tally !== t.log ? P.bad : COL.dim });
    };
    return m;
  },
});
