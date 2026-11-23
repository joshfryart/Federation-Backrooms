// Transporter chief: report the shakedown results to ops. The test log comes off the printer in the order the tests were run, but ops reads the
// report in script-step order. Move the cursor with Up / Down; Space swaps the line under the cursor with the one below it. When every line is in
// ascending step order, Enter sends the report. Sending it out of order sends ops to the wrong step.
import { define, machine, ARROW, SPACE, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const SUBS = ['Pad 1 energiser', 'Pad 2 energiser', 'Pattern buffer', 'Doppler comp', 'Biofilter', 'Heisenberg comp', 'Annular confinement'];
export default define({
  job: { billet: 'tchief', label: 'Report results to ops', type: 'task:shakedown' },
  title: 'Shakedown log into script order', dept: 'operations', host: 'console', tool: 'Ops report form',
  how: 'Up / Down moves the cursor over the log lines; Space swaps the line with the one below it. Put the lines in ascending script step order, then press Enter to send.',
  keys: ['Up / Down: move the cursor', 'Space: swap with the line below', 'Enter: send the report'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'swap into order', input: 'arrows+space+enter',
    win: 'six test log lines swapped one neighbour at a time into ascending script step order and the report sent',
    fail: 'sending the report while any line is out of step order, or wasting swaps past the allowance',
    rule: 'Space exchanges the cursor line with the next one down; only neighbours swap. The step number on each line must rise from top to bottom before Enter will send it.' },
  rush: 'Sent ops the log as it came off the printer: "some issues, details to follow".',
  captions: { unsorted: 'ops rejects the report: steps out of order', wasteful: 'report padded with needless edits' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 6; m.c = 0; m.swaps = 0;
    const steps = shuffle(r, Array.from({ length: 12 }, (_, i) => i + 1)).slice(0, n), names = shuffle(r, SUBS);
    m.l = steps.map((s, i) => ({ s, n: names[i] })); m.l = shuffle(r, m.l); let inv = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (m.l[i].s > m.l[j].s) inv++; if (!inv) [m.l[0], m.l[1]] = [m.l[1], m.l[0]];
    inv = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (m.l[i].s > m.l[j].s) inv++; m.budget = inv + 3;
    const sorted = () => m.l.every((x, i) => !i || m.l[i - 1].s < x.s);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { if (down) m.c = Math.max(0, Math.min(n - 1, m.c + (a === 'D' ? 1 : -1))); return true; } if (a) return true;
      if (!down) return SPACE(code) || ENTER(code);
      if (SPACE(code)) { if (m.c < n - 1) { [m.l[m.c], m.l[m.c + 1]] = [m.l[m.c + 1], m.l[m.c]]; m.swaps++; if (m.swaps > m.budget) m.fault('wasteful'); } return true; }
      if (ENTER(code)) { if (sorted()) m.win(); else m.fault('unsorted'); return true; } return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.state !== 'play') return []; if (sorted()) return [['Enter', true]]; let i = 0; while (m.l[i].s < m.l[i + 1].s) i++; return m.c < i ? [['ArrowDown', true]] : m.c > i ? [['ArrowUp', true]] : [['Space', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ l: m.l.map(x => [x.s, x.n]), b: m.budget });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Swap ↕'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      m.l.forEach((x, i) => { const y = 8 + i * 25, on = i === m.c; box(c, 10, y, 300, 22, COL.panel, on ? COL.gold : null, 4); txt(c, `step ${String(x.s).padStart(2, ' ')}`, 20, y + 16, { size: 12, col: on ? COL.gold : COL.ink, font: 'monospace' }); txt(c, x.n, 110, y + 16, { size: 11, col: COL.dim });
        if (i && m.l[i - 1].s > x.s) txt(c, '▲ before', 250, y + 16, { size: 9, col: COL.warn }); });
      txt(c, `swaps ${m.swaps}/${m.budget}`, 330, 40, { size: 10, col: m.swaps > m.budget ? P.bad : COL.dim }); txt(c, sorted() ? 'in order: send' : 'out of order', 330, 60, { size: 10, col: sorted() ? P.good : COL.warn });
    };
    return m;
  },
});
