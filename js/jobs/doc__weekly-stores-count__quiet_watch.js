// Doc: weekly stores count. A serial log of blood-analogue bags runs in order. One bag is logged twice (circle the repeat with Enter) and one
// serial is missing between two lines (mark the gap with Space on the line after it). A total would hide both. Circling a good line is a fault.
import { define, machine, ARROW, SPACE, ENTER, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Weekly stores count', type: 'task:quiet_watch' },
  title: 'Serial log repeat and gap', dept: 'medical', host: 'console', tool: 'Weekly count sheet',
  how: 'Walk the cursor down the serial log (Up/Down). Enter circles a serial logged twice; Space marks a missing serial on the line after the gap.',
  keys: ['Up/Down move along the log', 'Enter circle a repeat', 'Space mark a gap'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'circle and gap-mark', input: 'arrows+enter+space', win: 'the bag serial logged twice circled and the skipped serial marked missing on the sheet',
    fail: 'circling a serial that is logged once or marking a gap where the sequence is unbroken',
    rule: 'Serials should count up by one. A line equal to the one above is a repeat: Enter. A jump of two means one is missing: Space on the line after the jump.' },
  rush: 'Counted the bags and wrote the total without reading the serials.',
  captions: { 'good serial': 'pen scratches', 'no gap': 'pen scratches' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; let v = ri(r, 1200, 8800); const L = [], gap = ri(r, 4, 6), dup = ri(r, 1, 2);
    for (let k = 0; k < 9; k++, v++) { if (k === gap) continue; L.push(v); if (k === dup) L.push(v); }
    m.L = L; m.cur = 0; m.done = { dup: false, gap: false };
    m.dupAt = L.findIndex((x, i) => i && x === L[i - 1]); m.gapAt = L.findIndex((x, i) => i && x - L[i - 1] === 2);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { m.cur = Math.max(0, Math.min(L.length - 1, m.cur + (a === 'D' ? 1 : -1))); return true; }
      if (ENTER(code)) { if (m.cur === m.dupAt) m.done.dup = true; else if (!m.done.dup || m.cur !== m.dupAt) m.fault('good serial'); }
      else if (SPACE(code)) { if (m.cur === m.gapAt) m.done.gap = true; else m.fault('no gap'); } else return false;
      if (m.done.dup && m.done.gap) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const t = !m.done.dup ? m.dupAt : m.gapAt; if (m.cur < t) return [['ArrowDown', true]]; if (m.cur > t) return [['ArrowUp', true]]; return [[!m.done.dup ? 'Enter' : 'Space', true]]; };
    m.bad = () => (m.cur === 0 ? 'Enter' : 'ArrowUp');
    m.view = () => ({ L });
    m.buttons = () => [['ArrowUp', 'Up'], ['ArrowDown', 'Down'], ['Enter', 'Circle repeat'], ['Space', 'Mark gap']];
    m.draw = (c, W, H, P) => {
      const top = Math.max(0, Math.min(L.length - 6, m.cur - 2));
      for (let k = 0; k < 6; k++) { const i = top + k, y = 14 + k * 24, on = i === m.cur;
        box(c, 20, y, 210, 20, on ? 'rgba(125,151,232,.25)' : 'rgba(255,255,255,.05)', on ? COL.peri : null, 4);
        txt(c, `BAG-${L[i]}`, 30, y + 15, { size: 13, col: COL.ink });
        if (i === m.dupAt && m.done.dup) txt(c, 'O repeat', 150, y + 15, { size: 11, col: P.good });
        if (i === m.gapAt && m.done.gap) txt(c, '^ missing', 150, y + 15, { size: 11, col: P.good }); }
      txt(c, `repeat ${m.done.dup ? 'circled' : 'open'}`, 260, 50, { size: 13, col: m.done.dup ? P.good : COL.warn });
      txt(c, `gap ${m.done.gap ? 'marked' : 'open'}`, 260, 80, { size: 13, col: m.done.gap ? P.good : COL.warn });
    };
    return m;
  },
});
