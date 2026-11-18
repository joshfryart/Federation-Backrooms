// Deck crew: seat the probe pods. Each pod mount has a ring of bolts; aim the hydrospanner at one and tap E to take it up a stage. Bolts go in
// a star pattern (always across the ring from the last one) and in two rounds, snug then torque. Out of pattern warps the seat: a fault.
import { define, machine, room, shuffle } from './kit.js';

const STAR = { 4: [0, 2, 1, 3], 6: [0, 3, 1, 4, 2, 5] };
export default define({
  job: { billet: 'deck', label: 'Prep survey shuttle with probe pods', type: 'task:survey' },
  title: 'Probe pod star torque', dept: 'flight', host: 'room', item: 'hydrospanner', siteName: 'Pod mount', verb: 'Torque',
  how: 'At each pod mount aim the hydrospanner at a bolt and tap E. Work across the ring in a star (opposite bolt next), snug them all, then go round again to torque.',
  keys: ['Aim with the view', 'E tap: tighten one stage'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'star-torque', input: 'e-tap+look', win: 'every bolt on every pod mount snugged then torqued in star order',
    fail: 'tightening a bolt out of the star pattern so the pod seat warps',
    rule: 'Bolts are numbered round the ring. Tap E on the bolt opposite the last one (1, 3, 2, 4 on four bolts; 1, 4, 2, 5, 3, 6 on six); snug every bolt, then a second round to torque.' },
  rush: 'Ran the bolts round in a circle with the gun on full.',
  captions: { 'out of pattern': 'pod seat creaks' }, says: { 'out of pattern': 'Out of pattern — that warps the seat. Go across the ring: opposite bolt next.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Port pod mount', prop: 'shuttle' }, { name: 'Starboard pod mount', prop: 'workpod' }]), r = m.rnd, tol = m.calm ? 0.09 : 0.065;
    const sizes = shuffle(r, [4, 6]);
    m.pods = sizes.map(n => { const rot = Math.floor(r() * n); return { n, bolts: Array.from({ length: n }, (_, k) => ({ b: -0.45 + 0.9 * k / (n - 1), st: 0 })), order: STAR[n].map(k => (k + rot) % n), k: 0 }; });
    m.aim = (i, look) => { const p = m.pods[i]; let best = -1, bd = tol; p.bolts.forEach((b, k) => { const d = Math.abs((look || 0) - b.b); if (d < bd) { bd = d; best = k; } }); return best; };
    const want = (p) => p.order[p.k % p.n];
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s || !inp.press) return; const i = m.next, p = m.pods[i], a = m.aim(i, inp.look);
      if (a < 0) return; if (a !== want(p)) { m.fault('out of pattern'); return; }
      p.bolts[a].st++; p.k++; s.prog = p.k / (2 * p.n); m.ev('bolt', { site: i, bolt: a }); if (p.k >= 2 * p.n) m.finish(i);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pods[i]; return { at: i, look: p.bolts[want(p)].b, press: f % 3 === 0 }; };
    m.bad = (f = 0) => { const i = m.next, p = m.pods[i]; return { at: i, look: p.bolts[(want(p) + 1) % p.n].b, press: f % 3 === 0 }; };
    m.view = () => ({ pods: m.pods.map(p => [p.n, p.order]) });
    m.panel = (i) => { const p = m.pods[i]; if (!p) return null; return { label: `${p.k < p.n ? 'Snug' : 'Torque'} round`, value: p.bolts.map((b, k) => `${k + 1}${'·▪■'[b.st]}`).join(' '), bar: p.k / (2 * p.n) }; };
    m.prompt = (i) => { const p = m.pods[i]; return p ? `Aim at bolt ${want(p) + 1} (across from the last) and tap [E] · ${p.k < p.n ? 'snug' : 'torque'} round` : ''; };
    return m;
  },
});
