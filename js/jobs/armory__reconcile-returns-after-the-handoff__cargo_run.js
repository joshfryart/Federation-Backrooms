// Armory, cargo run: reconcile returns after the handoff. Your hand walks the returns rack slot by slot at a steady pace. Press Space once as it
// rests on each weapon to touch-count it (its serial is crossed off the out-log); a press on an empty slot, a second press on the same weapon,
// or a weapon the hand passes untouched is a miscount. Then chase every out-log line still not crossed: if a handoff slip shows that exact serial
// still out with an escort, press 1; if no slip covers it, press 2 to report it missing. Near-miss serials on a slip do not count.
import { define, machine, DIG, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

const ser = (r) => `RZ-${ri(r, 100, 999)}`;
export default define({
  job: { billet: 'armory', label: 'Reconcile returns after the handoff', type: 'task:cargo_run' },
  title: 'Touch-count the returns rack', dept: 'security', host: 'console', tool: 'Returns rack and out-log',
  how: 'Your hand moves along the returns rack: press Space once on every weapon it rests on, never on an empty slot. Then for each line still open: 1 if a handoff slip shows that exact serial still out, 2 if not: missing.',
  keys: ['Space touch-count', '1 still out on a slip', '2 missing'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'touch and chase', input: 'digits+space', win: 'every returned weapon touch-counted once as the hand passes it, and every open out-log line chased to a slip or reported missing until the counts agree',
    fail: 'counting an empty slot or a weapon twice, letting a weapon pass uncounted, or writing off a weapon a slip accounts for',
    rule: 'The hand steps along the rack by itself. Space while it rests on a weapon, once each. Afterwards each open line: exact serial on a slip is 1, otherwise 2.' },
  rush: 'Wrote the issued count at the foot of the log and signed it.',
  captions: { 'counted air': 'hand taps empty slot', 'counted twice': 'pencil double-tick', skipped: 'weapon passes uncounted', 'wrote off': 'log eraser', 'covered a loss': 'shift officer frowns' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, used = new Set(), dwell = m.calm ? 0.7 : 0.5;
    const uniq = (f) => { let s; do s = f(); while (used.has(s)); used.add(s); return s; };
    m.log = Array.from({ length: 6 }, () => ({ s: uniq(() => ser(r)), x: 0 }));
    const back = shuffle(r, [0, 1, 2, 3, 4, 5]); m.open = back.slice(4).map(i => m.log[i]);
    const outOne = r() < 0.5 ? 1 : 2; m.open.forEach((l, k) => { l.k = k < outOne ? 'out' : 'gone'; });
    m.rack = shuffle(r, [...back.slice(0, 4).map(i => m.log[i]), null, null, null, null]).map(l => ({ l, hit: false }));
    const g = m.open.find(l => l.k === 'gone');
    m.slips = shuffle(r, [...m.open.filter(l => l.k === 'out').map(l => l.s), g ? uniq(() => g.s.slice(0, 5) + ((+g.s[5] + 3) % 10)) : uniq(() => ser(r)), uniq(() => ser(r))]);
    m.h = 0; m.ht = 0; m.phase = 'count'; m.c = 0; m.rounds = 2; m.round = 0;
    const slot = () => m.rack[m.h];
    const step = () => { const q = slot(); if (q.l && !q.hit) m.fault('skipped'); m.h++; m.ht = 0; if (m.h >= m.rack.length) { m.phase = 'chase'; m.round = 1; } };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (SPACE(code)) { if (m.phase !== 'count') return true; const q = slot(); if (!q.l) m.fault('counted air'); else if (q.hit) m.fault('counted twice'); else { q.hit = true; q.l.x = 1; } return true; }
      if (d === 1 || d === 2) {
        if (m.phase !== 'chase') return true; const l = m.open[m.c];
        if (d === 1 && l.k !== 'out') { m.fault('covered a loss'); return true; } if (d === 2 && l.k !== 'gone') { m.fault('wrote off'); return true; }
        l.x = d + 1; m.c++; if (m.c >= m.open.length) { m.round = 2; m.win(); } return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.phase === 'count') { m.ht += dt; if (m.ht >= dwell) step(); } };
    m.hint = () => {
      if (m.phase === 'count') { const q = slot(); return q && q.l && !q.hit && m.ht > 0.1 ? [['Space', true]] : []; }
      const l = m.open[m.c]; return l ? [[l.k === 'out' ? 'Digit1' : 'Digit2', true]] : [];
    };
    m.bad = () => m.phase === 'count' ? (slot()?.l ? null : 'Space') : 'Digit2';
    m.view = () => ({ log: m.log.map(l => [l.s, l.k || 'back']), rack: m.rack.map(q => q.l ? q.l.s : ''), slips: m.slips });
    m.buttons = () => [['Space', 'Touch'], ['Digit1', '1 On a slip'], ['Digit2', '2 Missing']];
    m.draw = (c, W, H, P) => {
      txt(c, 'OUT-LOG', 14, 16, { size: 10, col: COL.dim });
      m.log.forEach((l, k) => { const y = 32 + k * 18, cur = m.phase === 'chase' && m.open[m.c] === l; if (cur) box(c, 8, y - 13, 108, 17, 'rgba(244,194,91,.18)', COL.gold, 4);
        txt(c, l.s, 14, y, { size: 12, font: 'monospace', col: l.x === 1 ? COL.dim : COL.ink }); if (l.x === 1) { c.fillStyle = COL.dim; c.fillRect(12, y - 5, 60, 2); }
        txt(c, l.x === 2 ? 'OUT' : l.x === 3 ? 'MISSING' : '', 112, y, { size: 9, align: 'right', col: l.x === 3 ? P.bad : P.good }); });
      txt(c, 'RETURNS RACK', 130, 16, { size: 10, col: COL.dim });
      m.rack.forEach((q, k) => { const x = 130 + k * 33, here = m.phase === 'count' && k === m.h; box(c, x, 24, 28, 50, here ? 'rgba(244,194,91,.25)' : '#14122a', here ? COL.gold : COL.peri, 4);
        if (q.l) { c.fillStyle = q.hit ? P.good : COL.pale; c.fillRect(x + 11, 30, 6, 38); } if (here) txt(c, '✋', x + 14, 90, { size: 14, align: 'center' }); });
      txt(c, 'HANDOFF SLIPS', 130, 112, { size: 10, col: COL.dim }); m.slips.forEach((s, k) => txt(c, `${s} still out`, 130 + (k % 2) * 130, 130 + Math.floor(k / 2) * 16, { size: 11, font: 'monospace', col: COL.pale }));
    };
    return m;
  },
});
