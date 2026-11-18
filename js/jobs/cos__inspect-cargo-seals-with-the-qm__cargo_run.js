// Chief of security: inspect cargo seals by hand with the QM. Each crate's seal bead is a strip you run your fingertip along. Hold the right arrow to move
// the fingertip at a careful reader's pace. A cut in the bead shows as a notch under the finger: press Enter when you feel it. Enter over sound bead is a false flag.
import { define, machine, ARROW, ENTER, txt, box, lamp, COL } from './kit.js';

const CRATES = 3;
export default define({
  job: { billet: 'cos', label: 'Inspect cargo seals with the QM', type: 'task:cargo_run' },
  title: 'Seal bead fingertip trace', dept: 'security', host: 'console', tool: 'Seal bead strip',
  how: 'Hold the right arrow to run your finger along each crate seal bead. When you feel a cut under your finger, press Enter to flag it. Enter on sound bead is a false flag.',
  keys: ['→ hold: run along the bead', 'Enter: flag a cut'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'trace the bead', input: 'arrows-hold+enter', win: 'each of three seal beads run to the end with every cut flagged',
    fail: 'flagging sound bead, or running past a cut without flagging it',
    rule: 'Hold right to move your finger along the bead of the current crate. A cut shows as a notch under the finger. Enter flags it there. Enter over sound bead is a false flag; a cut passed unflagged is a missed cut.' },
  rush: 'Ran a thumb over the first crate and signed the cargo tally.',
  captions: { 'false flag': 'tally beep', 'missed cut': 'belt rattle' }, says: {},
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, speed = m.calm ? 0.24 : 0.3;
    m.cuts = Array.from({ length: CRATES }, () => (r() < 0.7 ? 0.2 + r() * 0.6 : -1));
    if (m.cuts.every(c => c < 0)) m.cuts[0] = 0.5;
    m.k = 0; m.pos = 0; m.flagged = false; m.held = m.held || {};
    const cutAt = () => m.cuts[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'R' || a === 'L') { m.held[a] = !!down; return true; }
      if (ENTER(code) && down) {
        const c = cutAt();
        if (c >= 0 && !m.flagged && Math.abs(m.pos - c) < 0.05) { m.flagged = true; m.ev('flag', { crate: m.k }); }
        else m.fault('false flag');
        return true;
      }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      const d = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0);
      if (d) m.pos = Math.max(0, Math.min(1, m.pos + d * speed * dt));
      if (m.pos >= 1) {
        const c = cutAt(); if (c >= 0 && !m.flagged) m.fault('missed cut');
        m.k++; m.pos = 0; m.flagged = false; if (m.k >= CRATES) m.win();
      }
    };
    m.hint = () => {
      if (m.k >= CRATES) return [];
      const c = cutAt();
      if (c >= 0 && !m.flagged && Math.abs(m.pos - c) < 0.04) return [['ArrowRight', false], ['Enter', true]];
      return [['ArrowRight', true]];
    };
    m.bad = () => 'Enter';
    m.buttons = () => [['ArrowLeft', '◀ back'], ['ArrowRight', 'run along ▶'], ['Enter', 'flag cut']];
    m.view = () => ({ cuts: m.cuts.map(c => +c.toFixed(2)) });
    m.draw = (c, W, H, P) => {
      for (let k = 0; k < CRATES; k++) {
        const y = 36 + k * 40, x0 = 40, w = 320, cur = k === m.k, v = k < m.k ? 1 : cur ? m.pos : 0;
        txt(c, `Crate ${k + 1}`, 8, y + 9, { size: 10, col: cur ? COL.gold : COL.dim });
        box(c, x0, y, w, 10, 'rgba(255,255,255,.08)', null, 5);
        c.fillStyle = cur ? COL.gold : COL.peri; c.fillRect(x0, y, w * v, 10);
        const cut = m.cuts[k];
        if (cut >= 0 && (k < m.k || (cur && Math.abs(m.pos - cut) < 0.15))) lamp(c, x0 + cut * w, y + 20, 5, COL.orange, 'triangle');
      }
      txt(c, m.flagged ? 'cut flagged' : 'run your finger; flag a cut as you feel it', 200, 164, { size: 10, align: 'center', col: COL.dim });
    };
    return m;
  },
});
