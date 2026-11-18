// Navigator: plot the most economical route to the drop point. Three candidate routes are laid on the chart, but their power cost only
// shows as you step each one leg by leg with the dividers (→), multiplying length by the cost rate of the space it crosses, and a leg
// that clips a hazard shading shows up as you reach it. Choose a route (↑ ↓) and commit it (Enter): the cheapest clean one, never a
// route you have not costed all the way.
import { define, machine, ARROW, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const ZONE = [['open', 1], ['dust', 2], ['nebula', 3]];
export default define({
  job: { billet: 'nav', label: 'Plot the most economical route to the drop point', type: 'task:cargo_run' },
  title: 'Route power-cost comparison', dept: 'flight', host: 'console', tool: 'Chart, dividers and power cost table',
  how: 'Step every candidate route leg by leg (→) to read its power cost and hazards, then choose the cheapest clean one (↑ ↓) and commit it (Enter).',
  keys: ['↑ ↓ choose a route', '→ cost the next leg', 'Enter commit'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'cost and compare', input: 'arrows+enter', win: 'two drops routed by the candidate with the lowest summed power cost that clears every hazard, after costing all candidates',
    fail: 'committing a route before every candidate is costed, a route through hazard shading, or a dearer route',
    rule: 'Each → press measures the chosen route\'s next leg: length times the zone\'s cost rate, with a warning if it clips a hazard. Cost all three to the drop, then Enter on the lowest clean total.' },
  rush: 'Took the straightest line to the drop point and sent it.',
  captions: { uncosted: 'calculator beep', hazard: 'hazard buzz', dearer: 'power alarm chirp' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 2; m.round = 0;
    m.newDrop = () => {
      for (;;) {
        const rs = ['Alpha', 'Bravo', 'Charlie'].map((name, i) => { const n = ri(r, 2, 4), legs = []; for (let k = 0; k < n; k++) { const z = ZONE[ri(r, 0, 2)]; legs.push({ len: ri(r, 3, 9), zone: z[0], rate: z[1], haz: false }); } return { name, legs, seen: 0 }; });
        const bad = shuffle(r, [0, 1, 2])[0]; if (r() < 0.75) rs[bad].legs[ri(r, 0, rs[bad].legs.length - 1)].haz = true;
        rs.forEach(x => { x.cost = x.legs.reduce((s, l) => s + l.len * l.rate, 0); x.haz = x.legs.some(l => l.haz); });
        const ok = rs.filter(x => !x.haz).map(x => x.cost).sort((a, b) => a - b);
        if (ok.length >= 2 && ok[0] < ok[1]) { m.rs = rs; m.best = rs.findIndex(x => !x.haz && x.cost === ok[0]); m.sel = 0; return; }
      }
    };
    m.newDrop();
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { m.sel = (m.sel + (a === 'D' ? 1 : 2)) % 3; return true; }
      if (a === 'R') { const x = m.rs[m.sel]; if (x.seen < x.legs.length) x.seen++; return true; }
      if (!ENTER(code)) return !!a;
      if (m.rs.some(x => x.seen < x.legs.length)) { m.fault('uncosted'); return true; }
      const x = m.rs[m.sel]; if (x.haz) { m.fault('hazard'); return true; } if (m.sel !== m.best) { m.fault('dearer'); return true; }
      m.round++; m.ev('route', { name: x.name }); if (m.round >= 2) m.win(); else m.newDrop(); return true;
    };
    m.hint = () => {
      const i = m.rs.findIndex(x => x.seen < x.legs.length), t = i >= 0 ? i : m.best;
      if (m.sel !== t) return [[t > m.sel ? 'ArrowDown' : 'ArrowUp', true]];
      return [[i >= 0 ? 'ArrowRight' : 'Enter', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ c: m.rs.map(x => [x.cost, x.haz, x.legs.length]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowRight', 'Cost leg ▶'], ['Enter', 'Commit']];
    m.draw = (c, W, H, P) => {
      txt(c, `DROP ${m.round + 1} / 2 · cost rate open 1 · dust 2 · nebula 3`, 14, 18, { size: 11, col: COL.peri });
      m.rs.forEach((x, i) => {
        const y = 32 + i * 44, on = i === m.sel; box(c, 10, y, 380, 38, on ? 'rgba(244,194,91,.12)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 4);
        txt(c, `${on ? '▶ ' : ''}${x.name}`, 18, y + 15, { size: 12, col: on ? COL.gold : COL.ink });
        x.legs.forEach((l, k) => { const sx = 100 + k * 58; if (k < x.seen) { txt(c, `${l.len}×${l.rate}`, sx, y + 15, { size: 10, col: l.haz ? P.bad : COL.ink }); if (l.haz) lamp(c, sx + 40, y + 11, 6, P.bad, 'triangle'); txt(c, l.zone, sx, y + 30, { size: 8, col: COL.dim }); } else txt(c, '· · ·', sx, y + 15, { size: 10, col: COL.dim }); });
        const done = x.seen >= x.legs.length, sum = x.legs.slice(0, x.seen).reduce((s, l) => s + l.len * l.rate, 0);
        txt(c, done ? `${sum} u${x.haz ? ' HAZ' : ''}` : `${sum}+ u`, 382, y + 22, { size: 12, col: done ? (x.haz ? P.bad : COL.pale) : COL.dim, align: 'right' });
      });
    };
    return m;
  },
});
