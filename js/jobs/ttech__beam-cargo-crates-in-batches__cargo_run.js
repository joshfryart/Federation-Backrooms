// Transporter tech: beam cargo crates in batches. Walk each crate on the hand truck to its numbered pad spot and tip it down flat. Hold E to
// take the weight and swing your view to the right to lower it: the swing speed is the lowering speed. Swing too fast and the crate slides
// off its spot; in the last stretch above the plate it must come down slowly or it lands hard and shifts. Let go only when it sits flat.
// When every spot shows a flat crate the batch is ready to beam.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Beam cargo crates in batches', type: 'task:cargo_run' },
  title: 'Hand-truck crate tip-down', dept: 'operations', host: 'room', siteName: 'Spot', verb: 'Tip down',
  how: 'At each numbered spot hold E and swing your view right to lower the crate off the hand truck: steady, never fast, and slow right down near the plate. Let go when flat.',
  keys: ['E hold: take the weight', 'swing view right: lower', 'let go when flat'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'tip down', input: 'e-hold+swing', win: 'every crate lowered from the hand truck to lie flat on its numbered pad spot without sliding or landing hard',
    fail: 'swinging so fast the crate slides, landing it hard near the plate, or letting go before it is flat',
    rule: 'Hold E and swing the view right: the faster the swing the faster the crate tips. Over the slide speed it slides off; in the last fifth it must be under the landing speed. Release only at FLAT.' },
  rush: 'Dumped the crates off the truck roughly on their spots and started the batch.',
  captions: { slid: 'crate scrapes', 'hard landing': 'heavy thud', dropped: 'crate bangs down' },
  says: { slid: 'Too fast — the crate slid off its spot. Back on the truck; lower it steadily.', 'hard landing': 'It hit the plate hard and shifted. Slow right down near the floor.', dropped: 'You let go before it was flat.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pad spot 1', prop: 'pad' }, { name: 'Pad spot 2', prop: 'pad' }, { name: 'Pad spot 3', prop: 'cargo_pad' }]), r = m.rnd;
    const k = m.calm ? 1.25 : 1;
    m.cr = m.sites.map(() => ({ tilt: 1, slide: rf(r, 1.5, 1.9) * k, land: rf(r, 0.55, 0.7) * k, near: rf(r, 0.18, 0.26), mass: rf(r, 0.3, 0.4) }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, c = m.cr[i];
      if (rel) { if (c.tilt <= 0.03) { m.finish(i); return; } if (c.tilt < 0.95) { m.fault('dropped'); c.tilt = 1; } }
      if (inp.hold) { const sw = -(inp.swing || 0);   // right swing lowers
        if (sw > c.slide) { m.fault('slid'); c.tilt = 1; }
        else if (sw > 0) { if (c.tilt < c.near && sw > c.land) { m.fault('hard landing'); c.tilt = 1; } else c.tilt = Math.max(0, c.tilt - sw * c.mass * dt); }
        else if (sw < 0) c.tilt = Math.min(1, c.tilt - sw * c.mass * dt); }
      s.prog = clamp((1 - c.tilt) * 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cr[i]; if (c.tilt <= 0.03) return { at: i, hold: false }; return { at: i, hold: true, swing: -(c.tilt < c.near + 0.08 ? c.land * 0.7 : c.slide * 0.7), turn: 1 }; };
    m.bad = () => ({ at: m.next, hold: true, swing: -2.6, turn: 2.6 });
    m.view = () => ({ cr: m.cr.map(c => [+c.slide.toFixed(2), +c.land.toFixed(2), +c.near.toFixed(2)]) });
    m.panel = (i) => { const c = m.cr[i]; return c ? { label: c.tilt <= 0.03 ? 'FLAT — let go' : c.tilt < c.near ? 'Near the plate: slow' : 'Tilt', value: `${Math.round(c.tilt * 90)}°`, bar: 1 - c.tilt, band: [1 - c.near, 1] } : null; };
    m.prompt = (i) => { const c = m.cr[i]; return !c ? '' : c.tilt <= 0.03 ? 'Flat on the spot — let go of [E]' : c.tilt < c.near ? 'Ease it down slowly the last bit' : 'Hold [E] and swing your view right, steadily, to lower the crate'; };
    return m;
  },
});
