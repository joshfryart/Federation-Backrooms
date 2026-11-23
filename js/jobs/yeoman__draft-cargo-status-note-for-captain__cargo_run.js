// Yeoman: draft the cargo status note for the captain. The cargo board is read out to you line by line on the beat of the loading crane, and the
// note is typed from the ticker as it scrolls: four lines (1 crates aboard, 2 ETA, 3 delays, 4 reserve) drop towards the line at the bottom. Press a
// line's number as its marker crosses the line, not before and not after, so the note records each figure the instant it was true.
import { define, machine, DIG, ri, txt, box, COL } from './kit.js';

const LINES = ['Crates aboard', 'ETA', 'Delays', 'Reserve'];
export default define({
  job: { billet: 'yeoman', label: 'Draft cargo status note for captain', type: 'task:cargo_run' },
  title: 'Take the board down on the beat', dept: 'command', host: 'console', tool: 'Cargo ticker and note pad',
  how: 'Board lines drop down four lanes. Press the lane\'s number (1-4) just as its marker crosses the line at the bottom. Ten lines go into the note.',
  keys: ['1-4 take that lane as it crosses the line'], limit: 24, maxFaults: 3,
  fingerprint: { verb: 'catch on beat', input: 'digits+rhythm',
    win: 'ten cargo status lines each taken from their lane on the beat as the marker crossed the line',
    fail: 'taking a line early or late, missing it entirely, or tapping a lane with no line crossing',
    rule: 'Lines fall down lanes 1-4 at a steady beat. Press that lane\'s number within a fifth of a second of its marker reaching the line; stray presses and misses are faults.' },
  rush: 'Wrote "cargo on schedule" and dropped it in the tray.',
  captions: { missed: 'status line missed', 'off beat': 'figure noted off the beat' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, beat = m.calm ? 0.75 : 0.6, win = m.calm ? 0.28 : 0.2, fall = 1.8; m.t0 = 1.8; m.got = 0;
    m.notes = Array.from({ length: 10 }, (_, i) => ({ lane: ri(r, 1, 4), hit: m.t0 + i * beat, done: false }));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (d < 1 || d > 4) return false; if (!down) return true;
      const n = m.notes.find(q => !q.done && q.lane === d && Math.abs(q.hit - m.t) <= win);
      if (!n) { m.fault('off beat'); return true; } n.done = true; m.got++; if (m.got >= m.notes.length) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const n of m.notes) if (!n.done && m.t > n.hit + win) { n.done = true; m.fault('missed'); } };
    m.hint = () => { if (m.state !== 'play') return []; const n = m.notes.find(q => !q.done && m.t >= q.hit - 0.05); return n ? [['Digit' + n.lane, true]] : []; };
    m.bad = () => 'Digit1';
    m.view = () => ({ n: m.notes.map(n => n.lane) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4']];
    m.draw = (c, W, H, P) => {
      for (let l = 1; l <= 4; l++) { const x = 40 + (l - 1) * 100; box(c, x, 6, 80, 148, 'rgba(255,255,255,.04)', COL.dim, 4); txt(c, `${l} ${LINES[l - 1]}`, x + 40, 20, { size: 9, align: 'center', col: COL.dim }); }
      c.fillStyle = COL.gold; c.fillRect(34, 128, 332, 3);
      for (const n of m.notes) { if (n.done) continue; const y = 128 - (n.hit - m.t) / fall * 110; if (y < 26 || y > 150) continue; box(c, 40 + (n.lane - 1) * 100 + 12, y - 8, 56, 16, '#3a3a6a', COL.pale, 3); txt(c, String(n.lane), 40 + (n.lane - 1) * 100 + 40, y + 4, { size: 10, align: 'center' }); }
      txt(c, `noted ${m.got}/10`, 386, 164, { size: 10, align: 'right', col: COL.dim });
    };
    return m;
  },
});
