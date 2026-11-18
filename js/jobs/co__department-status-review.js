// Captain: department status review. Read each department lamp, ask the head for one sentence, then mark whether the answer agrees with the
// lamp or is a discrepancy (contradicts it, or is a stale report). Marking a lamp you never asked about is copying the board: a fault.
import { define, machine, DIG, ARROW, ENTER, shuffle, pick, txt, box, lamp, COL, wrapText } from './kit.js';

const DEPTS = ['Engineering', 'Medical', 'Security', 'Operations', 'Science'];
const OK = { Engineering: ['Core steady, all crews on post.', 'Quiet shift, nothing open.'], Medical: ['Two in recovery, both stable.', 'Beds empty, kit stocked.'], Security: ['Posts manned, brig empty.', 'Routine patrol, all doors logged.'],
  Operations: ['Transporter and comms nominal.', 'Board green, no tickets open.'], Science: ['Arrays calibrated, logging.', 'Lab clean, sweep running.'] };
const BAD = { Engineering: ['Coolant pump two is cavitating, we are on the spare.', 'Two techs down with flu, the queue is backing up.'], Medical: ['We are one nurse short and the dermal unit is out.', 'Isolation seal alarm, we are watching it.'],
  Security: ['One post is empty, I am covering it myself.', 'Armory count is off by one phaser.'], Operations: ['Relay six drops every few minutes.', 'Pattern buffer is flagging errors.'], Science: ['Long-range array is drifting off calibration.', 'Spectrometer is down for parts.'] };

export default define({
  job: { billet: 'co', label: 'Department status review', type: 'loop' },
  title: 'Department status cross-check', dept: 'command', host: 'console', tool: 'Bridge status board and chair comm',
  how: 'Read each department lamp, then ask its head for one sentence over the chair comm and judge whether the answer matches the lamp.',
  keys: ['↑', '↓', 'Enter ask', '1 agrees', '2 discrepancy'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'cross-examine', input: 'arrows+enter+digits', win: 'every department lamp judged against what its head actually says',
    fail: 'marking a lamp without asking, or calling agreement on a contradiction or a stale report',
    rule: 'Pick a department (↑ / ↓), Enter asks its head. When the answer comes, 1 if it agrees with the lamp, 2 if it contradicts it or is an old report.' },
  rush: 'Copied the lamp colours onto the pad without calling anyone.',
  captions: { 'did not ask': 'chief clears throat', 'wrong call': 'pad stylus scratch' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nBad = 1 + Math.floor(r() * 3), bad = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, nBad));
    m.rows = DEPTS.map((d, i) => {
      const truthBad = r() < 0.5, mismatch = bad.has(i), stale = mismatch && r() < 0.35, lampBad = stale ? truthBad : mismatch ? !truthBad : truthBad;
      const when = stale ? `(report logged ${2 + Math.floor(r() * 5)} h ago)` : '(live)';
      return { d, lamp: lampBad ? (r() < 0.5 ? 'amber' : 'red') : 'green', say: pick(r, truthBad ? BAD[d] : OK[d]), when, disc: mismatch, asked: 0, judged: 0 };
    });
    m.sel = 0; m.rounds = 5; m.round = 0;
    const row = () => m.rows[m.sel];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code), x = row();
      if (a === 'U' || a === 'D') { m.sel = (m.sel + (a === 'D' ? 1 : 4)) % 5; return true; }
      if (ENTER(code)) { if (!x.asked && !x.judged) { x.asked = m.t; m.ev('ask', { row: m.sel }); } return true; }
      if (d === 1 || d === 2) {
        if (x.judged) return true;
        if (!x.asked || m.t - x.asked < 1.2) { m.fault('did not ask'); return true; }
        if ((d === 2) !== x.disc) { m.fault('wrong call'); return true; }
        x.judged = d; m.round++; if (m.rows.every(y => y.judged)) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      const i = m.rows.findIndex(y => !y.judged); if (i < 0) return []; if (i !== m.sel) return [['ArrowDown', true]];
      const x = row(); if (!x.asked) return [['Enter', true]]; if (m.t - x.asked < 1.2) return []; return [[x.disc ? 'Digit2' : 'Digit1', true]];
    };
    m.bad = () => { const x = row(); return x.judged ? 'ArrowDown' : !x.asked ? 'Digit1' : x.disc ? 'Digit1' : 'Digit2'; };
    m.view = () => ({ rows: m.rows.map(x => [x.lamp, x.say, x.disc]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Enter', 'Ask'], ['Digit1', '1 Agrees'], ['Digit2', '2 Discrepancy']];
    m.draw = (c, W, H, P) => {
      m.rows.forEach((x, i) => {
        const y = 10 + i * 24, sel = i === m.sel; box(c, 6, y, W - 12, 21, sel ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.04)', sel ? COL.orange : null, 10);
        lamp(c, 20, y + 10.5, 7, x.lamp === 'green' ? P.good : x.lamp === 'red' ? P.bad : COL.warn, x.lamp === 'green' ? 'circle' : x.lamp === 'red' ? 'square' : 'triangle');
        txt(c, x.d, 34, y + 15, { size: 11, col: COL.gold });
        const ans = !x.asked ? '— not asked —' : m.t - x.asked < 1.2 ? 'calling…' : `"${x.say}" ${x.when}`;
        txt(c, wrapText(ans, 48)[0] + (ans.length > 48 ? '…' : ''), 112, y + 15, { size: 10, col: x.asked ? COL.ink : COL.dim });
        if (x.judged) txt(c, x.judged === 1 ? '✓ agrees' : '✗ flagged', W - 12, y + 15, { size: 10, col: x.judged === 1 ? P.good : COL.warn, align: 'right' });
      });
      if (row().asked && m.t - row().asked >= 1.2 && row().say.length > 48) txt(c, row().say.slice(46), 112, H - 8, { size: 10, col: COL.pale });
    };
    return m;
  },
});
