// CMO: report medical readiness to the captain. The readiness board flashes its four sections (1 beds, 2 staff, 3 supplies, 4 isolation) in the
// order of how short each one is, worst first, one lamp at a time. The captain gets the report in that order, from memory, because the board
// is wiped as soon as it has flashed. Watch the sequence, then key the section numbers back in the same order. Two rounds, the second longer.
import { define, machine, DIG, ri, txt, box, lamp, COL } from './kit.js';

const NAMES = ['Beds', 'Staff', 'Supplies', 'Isolation'], MARK = ['circle', 'triangle', 'square', 'diamond'];
export default define({
  job: { billet: 'cmo', label: 'Report medical readiness to captain', type: 'task:shakedown' },
  title: 'Recite the board worst-first', dept: 'medical', host: 'console', tool: 'Readiness board',
  how: 'Watch the four readiness lamps flash, worst section first. When the board goes dark, press 1-4 to report the sections back in the same order. Two rounds.',
  keys: ['1-4 report that section'], limit: 24, maxFaults: 3,
  fingerprint: { verb: 'repeat the sequence', input: 'digits',
    win: 'two flashed sequences of readiness sections, three then five long, each keyed back from memory in the same order',
    fail: 'keying a section out of order, so the captain hears the readiness gaps in the wrong priority',
    rule: 'Lamps 1-4 flash one at a time while the board is lit. When it goes dark, press the same numbers in the same order. Keys do nothing while the board is flashing.' },
  rush: 'Told the captain "medical is fine" and checked the board afterwards.',
  captions: { 'wrong section': 'captain: that is not the worst section' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, on = m.calm ? 0.75 : 0.55, off = 0.25; m.rounds = 2; m.round = 0; m.phase = 'show'; m.pos = 0; m.ft = 0.8;
    m.seqs = [Array.from({ length: 3 }, () => ri(r, 1, 4)), Array.from({ length: 5 }, () => ri(r, 1, 4))]; const cur = () => m.seqs[Math.min(m.round, 1)];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (d < 1 || d > 4) return false; if (!down || m.phase !== 'input') return true;
      if (d !== cur()[m.pos]) { m.fault('wrong section'); m.pos = 0; return true; } m.pos++;
      if (m.pos >= cur().length) { m.round++; m.pos = 0; if (m.round >= 2) m.win(); else { m.phase = 'show'; m.ft = 0.8; } } return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.phase === 'show') { m.ft += dt; if (m.ft >= 0.8 + (on + off) * cur().length + 0.3) { m.phase = 'input'; m.pos = 0; } } };
    m.lit = () => { if (m.phase !== 'show') return 0; const k = Math.floor((m.ft - 0.8) / (on + off)); if (k < 0 || k >= cur().length) return 0; return (m.ft - 0.8) - k * (on + off) < on ? cur()[k] : 0; };
    m.hint = () => (m.state === 'play' && m.phase === 'input' ? [['Digit' + cur()[m.pos], true]] : []);
    m.bad = () => (m.phase === 'input' ? 'Digit' + (cur()[m.pos] % 4 + 1) : null);
    m.view = () => ({ s: m.seqs });
    m.buttons = () => [['Digit1', '1 Beds'], ['Digit2', '2 Staff'], ['Digit3', '3 Supplies'], ['Digit4', '4 Isol.']];
    m.draw = (c, W, H, P) => {
      const lit = m.lit(); NAMES.forEach((nm, i) => { const x = 60 + i * 92, y = 60; lamp(c, x, y, 24, lit === i + 1 ? COL.gold : '#2a2742', MARK[i]); txt(c, `${i + 1} ${nm}`, x, y + 44, { size: 11, align: 'center', col: lit === i + 1 ? COL.gold : COL.dim }); });
      txt(c, m.phase === 'show' ? 'WATCH THE BOARD' : `REPORT BACK  ${m.pos}/${cur().length}`, 200, 150, { size: 12, align: 'center', col: m.phase === 'show' ? COL.warn : COL.gold }); txt(c, `round ${Math.min(2, m.round + 1)}/2`, 340, 16, { size: 10, col: COL.dim });
    };
    return m;
  },
});
