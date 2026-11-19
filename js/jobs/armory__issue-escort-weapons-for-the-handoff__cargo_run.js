// Armory, cargo run: issue escort weapons for the handoff. The handoff order assigns one zapper serial to each named escort. Escorts step up to the
// desk one at a time; the badge reader shows who it is. Walk the rack (← →) to the zapper the order gives that escort (one rack serial is a near
// miss), fit its safety pin (Space) and hand it across (Enter). Anyone whose badge is not on the order is waved off with ↓, unarmed.
import { define, machine, ARROW, SPACE, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const NAMES = ['PO Kestrel', 'Ens. Fadel', 'Lt Corrigan', 'PO Ibsen', 'Ens. Mwangi', 'PO Selk', 'Ens. Rourke'];
const ser = (r) => `EZ-${ri(r, 10, 99)}${String.fromCharCode(65 + ri(r, 0, 7))}${ri(r, 1, 9)}`;
export default define({
  job: { billet: 'armory', label: 'Issue escort weapons for the handoff', type: 'task:cargo_run' },
  title: 'Escort order: rack, pin and hand', dept: 'security', host: 'console', tool: 'Handoff order and escort rack',
  how: 'Read the escort\'s badge, find their name on the handoff order, move along the rack (← →) to the zapper with that exact serial, fit the safety pin (Space) and hand it over (Enter). Not on the order: wave them off with ↓.',
  keys: ['← → along the rack', 'Space fit safety pin', 'Enter hand over', '↓ wave off'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'pin and match', input: 'arrows+space+enter', win: 'every escort on the handoff order issued the exact zapper serial assigned to them with its safety pin fitted, and anyone not on the order sent away',
    fail: 'handing an escort the wrong serial, handing a weapon over unpinned, or arming someone who is not on the order',
    rule: 'Badge → order line → serial. ← → to that zapper on the rack (beware the near-miss serial), Space pins it, Enter hands it. A badge not on the order gets ↓.' },
  rush: 'Passed the first zappers off the rack to whoever was waiting.',
  captions: { 'wrong weapon': 'order mismatch beep', unpinned: 'safety catch rattles', 'not on order': 'Deputy frowns', 'turned away': 'escort grumbles' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = shuffle(r, NAMES), used = new Set();
    const uniq = (f) => { let s; do s = f(); while (used.has(s)); used.add(s); return s; };
    m.order = names.slice(0, 3).map(n => ({ n, s: uniq(() => ser(r)) }));
    const decoy = (() => { const s = m.order[ri(r, 0, 2)].s; return uniq(() => s.slice(0, 5) + ((+s[5] % 9) + 1)); })();
    m.rack = shuffle(r, [...m.order.map(o => o.s), decoy, uniq(() => ser(r))]).map(s => ({ s, pin: false, out: false }));
    m.line = shuffle(r, [...m.order.map(o => o.n), names[3]]); m.i = 0; m.cur = ri(r, 0, 4); m.rounds = 4; m.round = 0;
    const who = () => m.line[m.i], ord = () => m.order.find(o => o.n === who()), target = () => { const o = ord(); return o ? m.rack.findIndex(z => z.s === o.s) : -1; };
    const next = () => { m.i++; m.round++; if (m.i >= m.line.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), z = m.rack[m.cur];
      if (a === 'L' || a === 'R') { m.cur = Math.max(0, Math.min(m.rack.length - 1, m.cur + (a === 'R' ? 1 : -1))); return true; }
      if (a === 'D') { if (ord()) m.fault('turned away'); else next(); return true; }
      if (a === 'U') return true;
      if (SPACE(code)) { if (!z.out) z.pin = true; return true; }
      if (ENTER(code)) {
        if (z.out) return true; if (!ord()) { m.fault('not on order'); return true; } if (!z.pin) { m.fault('unpinned'); return true; }
        if (m.cur !== target()) { m.fault('wrong weapon'); return true; } z.out = true; next(); return true;
      }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (!who()) return []; const t = target(); if (t < 0) return [['ArrowDown', true]];
      if (m.cur !== t) return [[m.cur < t ? 'ArrowRight' : 'ArrowLeft', true]]; return [[m.rack[t].pin ? 'Enter' : 'Space', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ order: m.order.map(o => [o.n, o.s]), rack: m.rack.map(z => z.s), line: m.line });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Pin'], ['Enter', 'Hand over'], ['ArrowDown', 'Wave off']];
    m.draw = (c, W, H, P) => {
      txt(c, 'HANDOFF ORDER', 14, 18, { size: 10, col: COL.dim });
      m.order.forEach((o, k) => { txt(c, o.n, 14, 36 + k * 16, { size: 11 }); txt(c, o.s, 110, 36 + k * 16, { size: 11, font: 'monospace', col: COL.pale }); });
      txt(c, 'AT THE DESK', 230, 18, { size: 10, col: COL.dim }); txt(c, who() || '—', 230, 40, { size: 15, col: COL.gold });
      txt(c, `escort ${Math.min(m.i + 1, m.line.length)} / ${m.line.length}`, 230, 58, { size: 10, col: COL.dim });
      m.rack.forEach((z, k) => {
        const x = 14 + k * 76, y = 96, sel = k === m.cur; box(c, x, y, 70, 46, sel ? 'rgba(244,194,91,.18)' : '#14122a', sel ? COL.gold : COL.peri, 6);
        txt(c, z.out ? 'issued' : z.s, x + 35, y + 20, { size: 11, font: 'monospace', align: 'center', col: z.out ? COL.dim : COL.ink });
        if (!z.out) { lamp(c, x + 14, y + 34, 6, z.pin ? P.good : COL.warn, z.pin ? 'circle' : 'triangle'); txt(c, z.pin ? 'pinned' : 'no pin', x + 24, y + 38, { size: 9, col: COL.dim }); }
      });
    };
    return m;
  },
});
