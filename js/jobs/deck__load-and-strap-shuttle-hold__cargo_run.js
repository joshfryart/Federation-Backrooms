// Deck crew: load and strap the shuttle hold. The ratchet handle swings back and forth on its own stroke; the pawl only catches at the top of
// each stroke (the click). Tap E on the click to take up one notch of tension. A tap off the click slips the pawl and the strap sags a notch.
// Stop on the tension line: a notch past it crushes the crate lid.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Load and strap shuttle hold', type: 'task:cargo_run' },
  title: 'Ratchet on the pawl click', dept: 'flight', host: 'room', item: 'cargo_hook', siteName: 'Crate strap', verb: 'Ratchet',
  how: 'At each crate the ratchet handle swings on its own stroke. Tap E as the pawl clicks (top of the stroke) to take one notch. Stop exactly on the tension line.',
  keys: ['E tap on the click: one notch'], limit: 40, maxFaults: 4,
  fingerprint: { verb: 'notch on click', input: 'e-tap+rhythm', win: 'every crate strap ratcheted notch by notch to exactly its tension line, each tap landing on the pawl click',
    fail: 'tapping between clicks so the pawl slips and the strap sags, or ratcheting past the line and crushing the crate',
    rule: 'The stroke has a steady beat; the panel shows CLICK at the top of each stroke. A tap inside the click window adds a notch; a tap outside it slips one back. Reach the line exactly.' },
  rush: 'Cranked every strap as hard as it would go.',
  captions: { slipped: 'pawl slips with a clack', crushed: 'crate lid cracks' },
  says: { slipped: 'Off the click — the pawl slipped. Wait for the top of the stroke.', crushed: 'Past the line — the lid is crushed. Stop on the line.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Forward crate', prop: 'crate' }, { name: 'Centreline crate', prop: 'pallet_loaded' }, { name: 'Aft crate', prop: 'injector_crate' }]), r = m.rnd;
    const win = m.calm ? 0.17 : 0.12;
    m.straps = m.sites.map(() => ({ need: ri(r, 3, 5), n: 0, per: rf(r, 0.55, 0.75) * (m.calm ? 1.2 : 1), ph: rf(r, 0, 0.5), t: 0 }));
    const phase = (k) => ((k.t + k.ph) % k.per) / k.per;           // 0 = click (top of stroke)
    const onClick = (k) => { const p = phase(k); return Math.min(p, 1 - p) * k.per <= win / 2; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, k = m.straps[i]; k.t += dt;
      if (inp.press) { if (!onClick(k)) { m.fault('slipped'); k.n = Math.max(0, k.n - 1); } else if (k.n + 1 > k.need) { m.fault('crushed'); k.n = 0; } else { k.n++; m.ev('notch', { site: i, n: k.n }); } }
      if (k.n === k.need) { k.settle = (k.settle || 0) + dt; if (k.settle > 0.6) { m.finish(i); return; } } else k.settle = 0;
      s.prog = s.done ? 1 : clamp(k.n / k.need * 0.9, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.straps[i]; if (k.n >= k.need) return { at: i }; const beat = Math.round((k.t + k.ph) / k.per), q = ((k.t + 1 / 30 + k.ph) % k.per) / k.per, t = Math.min(q, 1 - q) * k.per <= win / 2 - 0.035 && k.hitBeat !== beat && !k.held; k.held = t; if (t) k.hitBeat = beat; return { at: i, hold: t, press: t }; };
    m.bad = (f = 0) => { const t = f % 7 === 0; return { at: m.next, hold: t, press: t }; };
    m.view = () => ({ straps: m.straps.map(k => [k.need, +k.per.toFixed(2)]) });
    m.panel = (i) => { const k = m.straps[i]; if (!k) return null; const c = onClick(k); return { label: c ? 'CLICK ◆' : 'stroke…', value: `notch ${k.n} / line ${k.need}`, bar: 1 - Math.min(phase(k), 1 - phase(k)) * 2, band: [1 - win / k.per, 1] }; };
    m.prompt = (i) => { const k = m.straps[i]; return !k ? '' : k.n >= k.need ? 'On the line — leave it' : 'Tap [E] on each CLICK, stop on the tension line'; };
    return m;
  },
});
