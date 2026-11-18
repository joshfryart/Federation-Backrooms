// CFO: flight deck walk-round. Walk pad to pad with the torch. At each shuttle there are two checks, the hatch seal and the tie-down clamp,
// and each spot sways with the craft on its gear. Hold E to keep the beam on the spot for the full dwell count; the beam only counts while it
// sits on the spot. Letting go part way through a dwell is a skimmed check (the log would be signed on a glance).
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Flight deck walk-round', type: 'loop' },
  title: 'Torch dwell on seals and clamps', dept: 'flight', host: 'room', item: 'flashlight', siteName: 'Pad', verb: 'Inspect',
  how: 'At each pad hold E to shine the torch and keep the beam on the swaying seal, then the clamp, until the dwell count completes. Do not let go part way.',
  keys: ['E hold: torch on', 'aim the view to keep the beam on the spot'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'beam dwell', input: 'e-hold+look', win: 'hatch seal and tie-down clamp of every pad lit for the full dwell count before the log is signed',
    fail: 'letting the torch off a spot part way through its dwell, signing a check on a glance',
    rule: 'Each spot drifts as the craft rocks on its gear. With E held the dwell count rises only while the beam sits on the spot; let go before it is full and the check is skimmed.' },
  rush: 'Walked the bay with the clipboard and signed every pad from the doorway.',
  captions: { skimmed: 'clipboard snaps shut' }, says: { skimmed: 'Skimmed — the light came off before the count was done. Hold the beam on it for the full dwell.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pad 1 shuttle', prop: 'shuttle' }, { name: 'Pad 2 shuttle', prop: 'pad' }, { name: 'Pad 3 shuttle', prop: 'shuttle' }]), r = m.rnd;
    const tol = m.calm ? 0.2 : 0.13, need = m.calm ? 0.9 : 1.0;
    m.pads = m.sites.map(() => [{ name: 'Hatch seal', base: rf(r, 0.15, 0.32), amp: rf(r, 0.05, 0.12), w: rf(r, 0.8, 1.5), dw: 0 }, { name: 'Tie-down clamp', base: -rf(r, 0.12, 0.3), amp: rf(r, 0.05, 0.12), w: rf(r, 0.8, 1.5), dw: 0 }]);
    m.spot = 0; m.age = 0;
    const tgt = (s) => s.base + s.amp * Math.sin(m.age * s.w);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, sp = m.pads[i][m.spot];
      m.age += dt; const on = Math.abs((inp.look || 0) - tgt(sp)) < tol;
      if (inp.hold && on) sp.dw += dt;
      if (sp.dw >= need) { m.spot++; if (m.spot > 1) { m.spot = 0; m.finish(i); return; } }
      else if (rel && sp.dw > 0.15) { m.fault('skimmed'); sp.dw = 0; }
      s.prog = s.done ? 1 : clamp((m.spot + sp.dw / need) / 2, 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, hold: true, look: tgt(m.pads[i][m.spot]) }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, hold: f % 24 < 14, look: tgt(m.pads[i][m.spot]) }; };
    m.view = () => ({ pads: m.pads.map(p => p.map(s => +s.base.toFixed(3))) });
    m.panel = (i) => { const p = m.pads[i]; if (!p) return null; const sp = p[m.spot], d = tgt(sp); return { label: sp.name, value: `dwell ${(sp.dw).toFixed(1)} / ${need} s`, bar: clamp(sp.dw / need) }; };
    m.prompt = (i) => { const p = m.pads[i]; if (!p) return ''; const sp = p[m.spot]; return `Hold [E] and keep the beam on the ${sp.name.toLowerCase()} (it is ${tgt(sp) > 0 ? 'left' : 'right'} of centre and sways)`; };
    return m;
  },
});
