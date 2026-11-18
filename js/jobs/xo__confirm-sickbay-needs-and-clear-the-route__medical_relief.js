// XO: confirm sickbay needs and clear the route. Walk the route from sickbay to the transporter and shove every cart or crate blocking it into
// the storage alcove on its side. Hold E to put your hands on it and swing your body toward the alcove at a steady push: shove too hard and
// the loaded cart tips (a fault); push the wrong way and it rolls further into the route (a fault). It is clear when the alcove lock clicks.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'xo', label: 'Confirm sickbay needs and clear the route', type: 'task:medical_relief' },
  title: 'Evacuation route cart shove', dept: 'command', host: 'room', siteName: 'Blockage', verb: 'Shove',
  how: 'At each blocking cart hold E and turn your body steadily toward its alcove (the panel says left or right) until the lock clicks. A steady push, not a heave: a hard swing tips the cart.',
  keys: ['E hold: hands on', 'swing toward the alcove'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'shove clear', input: 'e-hold+swing', win: 'every cart blocking the sickbay route shoved into its side alcove until the lock clicks, none tipped',
    fail: 'heaving so hard the loaded cart tips, or pushing it back out into the route',
    rule: 'Hold E on the cart and turn the view toward the alcove side shown on the panel: a steady turn rolls it, the bar fills to the lock. A fast swing tips it; turning the other way pushes it into the route.' },
  rush: 'Squeezed past the carts and told the medical officer the route was clear.',
  captions: { 'cart tipped': 'cart crashes over', 'pushed into route': 'cart rolls the wrong way', locked: 'alcove lock clicks' },
  says: { 'cart tipped': 'Too hard — the cart tipped. A steady push.', 'pushed into route': 'Wrong way — that rolls it into the route. Push toward the alcove.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Supply cart by the ward door', prop: 'cart' }, { name: 'Crate stack in the corridor', prop: 'crate' }, { name: 'Trolley at the transporter turn', prop: 'galley_trolley' }]), r = m.rnd;
    const tip = m.calm ? 3.2 : 2.6;
    m.carts = m.sites.map(() => ({ dir: r() < 0.5 ? 1 : -1, pos: 0, mass: rf(r, 0.35, 0.55), load: ri(r, 40, 120), cool: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, c = m.carts[i]; c.cool = Math.max(0, c.cool - dt);
      if (!inp.hold) return; const sw = (inp.swing || 0) * c.dir;
      if (Math.abs(inp.swing || 0) > tip) { if (!c.cool) { m.fault('cart tipped'); c.cool = 0.8; c.pos = Math.max(0, c.pos - 0.25); } return; }
      if (sw < -0.3) { if (!c.cool) { m.fault('pushed into route'); c.cool = 0.8; } c.pos = Math.max(0, c.pos + sw * c.mass * dt); return; }
      if (sw > 0.2) c.pos = clamp(c.pos + sw * c.mass * dt, 0, 1);
      s.prog = c.pos * 0.9; if (c.pos >= 1) { m.ev('locked', { site: i }); m.finish(i); }
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, hold: true, swing: m.carts[i].dir * 1.6 }; };
    m.bad = (f = 0) => { const i = m.next; return { at: i, hold: true, swing: m.carts[i].dir * (f % 2 ? 4 : -1.5) }; };
    m.view = () => ({ carts: m.carts.map(c => [c.dir, c.load]) });
    m.panel = (i) => { const c = m.carts[i]; return c ? { label: `Alcove to the ${c.dir > 0 ? 'LEFT ◀' : 'RIGHT ▶'} · ${c.load} kg load`, value: c.pos >= 1 ? 'locked' : `${Math.round(c.pos * 100)} %`, bar: c.pos, band: [0.97, 1] } : null; };
    m.prompt = (i) => { const c = m.carts[i]; return c ? `Hold [E] and turn steadily to the ${c.dir > 0 ? 'left' : 'right'} to roll it into the alcove` : ''; };
    return m;
  },
});
