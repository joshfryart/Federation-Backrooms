// Damage control: clear a corridor route for stretchers. The corridor is drawn from above with the stretcher outline down its middle and a
// side bay along each wall. Pick a crate by its number and push it with Up / Down half a crate at a time into a free side bay (a bay with
// clutter is blocked: pushing into it, or into the wall, is a fault). Heavy crates go on the hand truck and need two pushes per step. Press
// Enter to mark the route open: if any crate still pokes over the stretcher line, the stretcher jams (a fault).
import { define, machine, DIG, ARROW, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const COLS = 9;
export default define({
  job: { billet: 'dc', label: 'Clear a corridor route for stretchers', type: 'task:medical_relief' },
  title: 'Stretcher lane clearance push', dept: 'engineering', host: 'console', tool: 'Corridor plan and hand truck',
  how: 'Press a crate\'s number, then Up or Down to push it half a crate at a time into a side bay that has no clutter. When no crate overlaps the stretcher outline at all, press Enter to mark the route open.',
  keys: ['1-5 pick a crate', 'Up / Down push it', 'Enter mark the route open'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'push clear', input: 'arrows+digits+enter', win: 'every crate pushed wholly out of the stretcher outline into a free side bay before the route is marked open',
    fail: 'marking the route open with a crate still just inside the clearance line, or ramming a crate into clutter or the wall',
    rule: 'Crates move half a crate per push (heavy ones need two pushes per half). A crate is clear only when no part overlaps the dashed stretcher outline. Push toward the side bay without clutter; Enter declares the route.' },
  rush: 'Shoved the crates to the walls with a boot and waved the stretcher through.',
  captions: { 'stretcher jams': 'stretcher bumps a crate', jammed: 'crate thuds' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = ri(r, 4, 5), cols = shuffle(r, [...Array(COLS).keys()]).slice(0, n).sort((a, b) => a - b);
    m.crates = cols.map(c => { const row = ri(r, 1, 2), cl = r() < 0.5 ? (row === 1 ? 0 : 3) : -1; return { c, y: row * 2, heavy: r() < 0.35, strain: 0, clutter: cl }; });
    m.sel = -1; m.msg = '';
    const inLane = (k) => k.y < 6 && k.y + 2 > 2, blocked = (k, d) => { const ny = k.y + d; if (ny < 0 || ny > 6) return true; return (k.clutter === 0 && ny < 2) || (k.clutter === 3 && ny + 2 > 6); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code);
      if (d) { if (d <= m.crates.length) m.sel = d - 1; return true; }
      if (a === 'U' || a === 'D') { const k = m.crates[m.sel]; if (!k) return true; const dy = a === 'U' ? -1 : 1;
        if (blocked(k, dy)) { m.fault('jammed'); m.msg = 'blocked: clutter or wall'; return true; }
        if (k.heavy && ++k.strain < 2) return true; k.strain = 0; k.y += dy; m.msg = ''; return true; }
      if (ENTER(code)) { if (m.crates.some(inLane)) { m.fault('stretcher jams'); m.msg = 'a crate is still over the line'; return true; } m.win(); return true; }
      return a != null;
    };
    m.tick = (dt) => { m.live(dt); };
    const way = (k) => k.clutter === 0 ? 1 : k.clutter === 3 ? -1 : (k.y <= 2 ? -1 : 1);
    m.hint = () => { const k = m.crates.findIndex(inLane); if (k < 0) return [['Enter', true]]; if (m.sel !== k) return [['Digit' + (k + 1), true]]; return [[way(m.crates[k]) < 0 ? 'ArrowUp' : 'ArrowDown', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ c: m.crates.map(k => [k.c, k.y, k.heavy, k.clutter]) });
    m.buttons = () => [...m.crates.map((_, i) => ['Digit' + (i + 1), String(i + 1)]), ['ArrowUp', 'Push up'], ['ArrowDown', 'Push down'], ['Enter', 'Route open']];
    m.draw = (c, W, H, P) => {
      const x0 = 20, y0 = 14, cw = 36, hh = 16;   // half-crate height 16 px; rows 0..3 -> y 0..8 halves
      box(c, x0, y0, COLS * cw, 8 * hh, 'rgba(255,255,255,.05)', COL.dim, 2);
      c.strokeStyle = P.good; c.setLineDash?.([5, 4]); c.strokeRect(x0, y0 + 2 * hh, COLS * cw, 4 * hh); c.setLineDash?.([]);
      txt(c, 'side bay', x0 + COLS * cw + 6, y0 + 18, { size: 9, col: COL.dim }); txt(c, 'stretcher', x0 + COLS * cw + 6, y0 + 4 * hh + 4, { size: 9, col: P.good }); txt(c, 'side bay', x0 + COLS * cw + 6, y0 + 7 * hh + 4, { size: 9, col: COL.dim });
      m.crates.forEach((k, i) => { const x = x0 + k.c * cw + 3;
        if (k.clutter >= 0) { c.fillStyle = 'rgba(255,90,72,.35)'; c.fillRect(x, y0 + (k.clutter === 0 ? 0 : 6) * hh + 2, cw - 6, 2 * hh - 4); txt(c, '✗', x + 12, y0 + (k.clutter === 0 ? 1 : 7) * hh + 4, { size: 11, col: P.bad }); }
        box(c, x, y0 + k.y * hh + 2, cw - 6, 2 * hh - 4, inLane(k) ? COL.orange : COL.peri, i === m.sel ? '#fff' : null, 3);
        txt(c, (i + 1) + (k.heavy ? 'H' : ''), x + (cw - 6) / 2, y0 + k.y * hh + 22, { size: 11, col: COL.dark, align: 'center' }); });
      txt(c, m.msg || `${m.crates.filter(inLane).length} crate(s) over the stretcher line · H = hand truck (2 pushes)`, 20, 162, { size: 11, col: m.msg ? COL.warn : COL.pale });
    };
    return m;
  },
});
