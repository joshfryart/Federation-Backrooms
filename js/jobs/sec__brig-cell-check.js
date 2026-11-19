// Security: brig cell check. Look through each cell's viewing port and prove the occupant is breathing by breathing along with them: hold E
// while their chest rises and let go while it falls, for two full breaths in step. An occupant who is not breathing shows a flat chest line:
// hold E down for three seconds to sound the medical alert. Holding through an exhale, or not holding when they inhale, is a lost count.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Brig cell check', type: 'loop' },
  title: 'Breathe along at the viewing port', dept: 'security', host: 'room', siteName: 'Cell', verb: 'Watch',
  how: 'At each viewing port hold E while the occupant breathes in and let go as they breathe out, two breaths in step. Flat line: hold E three seconds to alert the medic.',
  keys: ['E hold: in-breath', 'E up: out-breath', 'E hold 3 s on a flat line: alert'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'breathe along', input: 'e-hold+rhythm', win: 'every occupant followed through two breaths in step, and any non-breathing occupant alerted with a long hold',
    fail: 'holding through an out-breath or missing an in-breath, so the occupant is never properly watched',
    rule: 'The panel shows the occupant\'s chest. Hold E as it starts to rise, release as it starts to fall; two in-step breaths clear the cell. A flat line needs a 3 s hold.' },
  rush: 'Glanced through each port and kept walking.',
  captions: { 'out of step': 'lost the count', 'no alert': 'medic not called' },
  says: { 'out of step': 'You lost their breathing. Hold E as the chest rises, let go as it falls.', 'no alert': 'That occupant is not breathing — hold E to sound the alert.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cell 1 port', prop: 'airlock_doors' }, { name: 'Cell 2 port', prop: 'cellfield' }, { name: 'Cell 3 port', prop: 'locker' }]), r = m.rnd;
    const flat = r() < 0.6 ? ri(r, 0, 2) : -1, tol = m.calm ? 0.55 : 0.4, sl = m.calm ? 1.25 : 1;
    m.cells = m.sites.map((_, i) => ({ flat: i === flat, d0: rf(r, 0.4, 0.9), I: rf(r, 1.0, 1.3) * sl, X: rf(r, 1.1, 1.4) * sl, w: 0, ok: 0, chk: 0, hT: 0 }));
    const phase = (c) => { if (c.flat || c.w < c.d0) return { inh: false, k: -1, u: 0 }; const T = c.I + c.X, x = (c.w - c.d0) % T, n = Math.floor((c.w - c.d0) / T);
      return x < c.I ? { inh: true, k: n * 2, u: x / c.I, since: x } : { inh: false, k: n * 2 + 1, u: 1 - (x - c.I) / c.X, since: x - c.I }; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, c = m.cells[i]; c.w += dt;
      if (c.flat) { c.hT = inp.hold ? c.hT + dt : 0; if (c.hT >= 3) { m.ev('alert', { site: i }); m.finish(i); return; } if (c.w > 9) { m.fault('no alert'); c.w = 3; } s.prog = clamp(c.hT / 3) * 0.9; return; }
      const p = phase(c);
      if (p.k >= c.chk && p.since >= tol) { c.chk = p.k + 1; if (!!inp.hold === p.inh) { c.ok++; if (c.ok >= 4) { m.finish(i); return; } } else { m.fault('out of step'); c.ok = 0; } }
      s.prog = c.ok / 4 * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cells[i]; return { at: i, hold: c.flat ? c.w > 0.5 : phase(c).inh }; };
    m.bad = () => ({ at: m.next, hold: true });
    m.view = () => ({ cells: m.cells.map(c => [c.flat, +c.I.toFixed(2), +c.X.toFixed(2)]) });
    m.panel = (i) => { const c = m.cells[i]; if (!c) return null; if (c.flat) return { label: c.w > 3 ? 'Chest: NO MOVEMENT' : 'Chest: watching…', value: c.hT > 0 ? `alert ${Math.round(c.hT / 3 * 100)} %` : '', bar: c.flat && c.w > 3 ? clamp(c.hT / 3) : 0.05 };
      const p = phase(c); return { label: p.k < 0 ? 'Chest: resting' : p.inh ? 'Chest: RISING' : 'Chest: falling', value: `${Math.floor(c.ok / 2)} / 2 breaths`, bar: p.k < 0 ? 0.1 : 0.1 + 0.85 * p.u }; };
    m.prompt = (i) => { const c = m.cells[i]; if (!c) return ''; return c.flat && c.w > 3 ? 'No breathing! Hold [E] for three seconds to alert the medic' : 'Hold [E] while the chest rises, let go while it falls'; };
    return m;
  },
});
