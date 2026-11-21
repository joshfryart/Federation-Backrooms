// Nurse: stock splints and burn gel. Four splint sizes sit on the shelf and handlers keep taking them. Print a splint of the size that is
// running low (digit 1-4, the replicator is busy a moment after each print). Bring every size up to par without any shelf hitting zero.
import { define, machine, DIG, ri, rf, txt, box, COL } from './kit.js';

const SIZES = ['Small', 'Medium', 'Large', 'X-large'];
export default define({
  job: { billet: 'nurse', label: 'Stock splints and burn gel', type: 'task:cargo_run' },
  title: 'Splint shelf restock', dept: 'medical', host: 'console', tool: 'Splint shelf and replicator tray',
  how: 'Handlers keep taking splints. Press 1-4 to print Small, Medium, Large or X-large into its slot. Get all four sizes to the par line and never let one run out.',
  keys: ['1 Small', '2 Medium', '3 Large', '4 X-large'], limit: 30, maxFaults: 2,
  fingerprint: { verb: 'keep sizes stocked', input: 'digits', win: 'all four splint size slots raised to par while handlers drain them and none emptied',
    fail: 'a size slot emptied by handlers before it was topped up, or prints queued on a busy replicator',
    rule: 'Pick a size by number to print one into its slot (the printer is busy 0.6 s after each). Handlers take random sizes; reach par on all four, never zero.' },
  rush: 'Stacked whatever was in the tray without counting sizes.',
  captions: { 'ran out': 'empty shelf rattle', 'printer busy': 'replicator refusal tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, busyFor = m.calm ? 0.4 : 0.6;
    m.par = 3; m.slots = SIZES.map(() => ri(r, 1, 2)); m.busy = 0; m.nextTake = rf(r, 3, 4.5); m.takes = Array.from({ length: 12 }, () => ri(r, 0, 3)); m.ti = 0;
    m.key = (code, down = true) => { const d = DIG(code); if (m.state !== 'play' || d < 1 || d > 4) return false; if (!down) return true; if (m.busy > 0) { m.fault('printer busy'); return true; } m.slots[d - 1]++; m.busy = busyFor; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.busy = Math.max(0, m.busy - dt); m.nextTake -= dt;
      if (m.nextTake <= 0) { m.nextTake = m.calm ? rf(m.rnd, 4, 6) : rf(m.rnd, 3, 4.5); const i = m.takes[m.ti++ % 12]; if (m.slots[i] > 0) m.slots[i]--; if (m.slots[i] === 0) { m.fault('ran out'); m.slots[i] = 1; } }
      if (m.state === 'play' && m.slots.every(s => s >= m.par)) m.win();
    };
    m.hint = () => { if (m.busy > 0) return []; let b = 0; m.slots.forEach((s, i) => { if (s < m.slots[b]) b = i; }); return m.slots[b] < m.par ? [['Digit' + (b + 1), true]] : []; };
    m.bad = () => 'Digit1';
    m.view = () => ({ slots: m.slots.slice(), takes: m.takes.slice(0, 5) });
    m.buttons = () => SIZES.map((s, i) => ['Digit' + (i + 1), s]);
    m.draw = (c, W, H, P) => {
      SIZES.forEach((s, i) => { const x = 14 + i * 96; box(c, x, 20, 86, 80, 'rgba(255,255,255,.05)', m.slots[i] <= 1 ? P.bad : COL.dim, 8); txt(c, `${i + 1} ${s}`, x + 8, 40, { size: 12 }); for (let k = 0; k < Math.min(m.slots[i], 5); k++) { c.fillStyle = k < m.par ? COL.pale : COL.gold; c.fillRect(x + 8 + k * 15, 80 - k * 0, 12, 14); } txt(c, `${m.slots[i]}/${m.par}${m.slots[i] <= 1 ? ' LOW' : ''}`, x + 8, 66, { size: 14, col: m.slots[i] <= 1 ? P.bad : P.good }); });
      txt(c, m.busy > 0 ? 'replicator busy' : 'replicator ready', 14, 130, { size: 12, col: m.busy > 0 ? COL.warn : COL.dim });
    };
    return m;
  },
});
