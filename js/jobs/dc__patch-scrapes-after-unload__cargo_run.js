// Damage control: patch scrapes after the unload. The plates are clamped over the scrapes; now run the bead. Hold E to strike the torch and
// let the puddle heat, then travel along the seam by turning the view steadily. Heat follows travel speed: linger and the gauge climbs until
// the panel warps; rush and it drops until the bead stops fusing (a cold lap). Each panel takes heat differently, so read the gauge and set
// your pace. Letting go of E part way leaves a broken bead.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'dc', label: 'Patch scrapes after unload', type: 'task:cargo_run' },
  title: 'Torch bead heat-paced run', dept: 'engineering', host: 'room', item: 'plasma_torch', siteName: 'Patch seam', verb: 'Weld',
  how: 'Hold E to light the torch and let the gauge come up, then turn the view steadily along the seam. Slower travel runs hotter, faster runs colder: keep the heat gauge inside its band until the bead reaches the end, without letting go.',
  keys: ['E hold: torch on', 'turn steadily: travel along the seam'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'run a bead', input: 'e-hold+turn', win: 'every patch seam run end to end in one continuous bead with the heat held in band by travel speed',
    fail: 'lingering so the panel overheats and warps, rushing so the bead runs cold and laps, or breaking the bead part way',
    rule: 'Heat climbs toward a level set by how fast you travel: a still torch overheats, a fast one cools. Pace the turn so the gauge stays between the marks; the bead only advances once the puddle is hot.' },
  rush: 'Tacked the corners and called the patch done.',
  captions: { warped: 'metal pings', 'cold lap': 'torch sputters', 'broken bead': 'arc snaps off' },
  says: { warped: 'Too hot — the panel is warping. Travel faster.', 'cold lap': 'Too fast — the bead is not fusing. Slow down.', 'broken bead': 'You let go mid-seam. Keep the torch on to the end.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Port bulkhead scrape', prop: 'crate' }, { name: 'Deck plate dent', prop: 'pallet' }, { name: 'Door frame scrape', prop: 'airlock_doors' }]), r = m.rnd;
    const hi = m.calm ? 0.92 : 0.88, lo = m.calm ? 0.2 : 0.26;
    m.seams = m.sites.map(() => ({ g: rf(r, 0.95, 1.3), len: rf(r, 0.8, 1.15), heat: 0, run: 0, lit: false }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, w = m.seams[i], turn = inp.turn || 0;
      if (rel && w.run > 0.05) { m.fault('broken bead'); w.run = 0; }
      if (!inp.hold) { w.heat = Math.max(0, w.heat - dt * 0.8); w.lit = false; return; }
      const target = w.g - 1.4 * turn; w.heat += (target - w.heat) * 1.3 * dt;
      if (w.heat >= 0.35) w.lit = true; if (w.lit) w.run += turn * dt;
      if (w.heat > hi) { m.fault('warped'); w.heat = 0.5; }
      else if (w.lit && w.run > 0.05 && w.heat < lo) { m.fault('cold lap'); w.heat = 0.5; }
      s.prog = clamp(w.run / w.len * 0.95, 0, 0.95); if (w.run >= w.len) m.finish(i);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const w = m.seams[i]; return { at: i, hold: true, turn: w.heat < 0.4 && !w.lit ? 0 : clamp((w.g - 0.55) / 1.4, 0, 2) }; };
    m.bad = () => ({ at: m.next, hold: true, turn: 0 });
    m.view = () => ({ s: m.seams.map(w => [+w.g.toFixed(2), +w.len.toFixed(2)]) });
    m.panel = (i) => { const w = m.seams[i]; return w ? { label: `Heat ${Math.round(w.heat * 1000)} °C · bead ${Math.round(w.run / w.len * 100)} %`, value: w.heat > 0.75 ? 'HOT' : w.heat < 0.38 && w.lit ? 'COLD' : w.lit ? 'fusing' : 'preheat', bar: clamp(w.heat), band: [0.38, 0.75] } : null; };
    m.prompt = (i) => { const w = m.seams[i]; return !w ? '' : !w.lit ? 'Hold [E] to light the torch and let the puddle heat' : 'Keep [E] held and turn steadily along the seam; pace to keep heat in the band'; };
    return m;
  },
});
