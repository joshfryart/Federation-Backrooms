// Replicator tech: matter stores count and refill. Hold E to lift each canister: how quickly the lift meter climbs is its weight. A full one climbs
// slowly, an empty one jumps up. Let go once it is lifted, with your view straight ahead to pour a full canister into the hopper, or turned left to set an empty one aside.
import { define, machine, room, rf, shuffle, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Matter stores count and refill', type: 'loop' },
  title: 'Lift by weight and sort', dept: 'services', host: 'room', siteName: 'Canister', verb: 'Lift',
  how: 'Hold E to lift: the panel says LIGHT or HEAVY after a moment. Let go at the lift mark: view ahead pours a heavy canister, view turned left sets a light one on the empty pile.',
  keys: ['E hold: lift', 'look ahead: pour', 'look left: empty pile'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'lift and judge', input: 'e-hold+look', win: 'four canisters each lifted, judged by how fast the meter climbs, then poured when full or set aside when empty',
    fail: 'pouring an empty canister as if full, setting a full one aside, or dropping any canister before the lift mark',
    rule: 'Hold E: the meter climbs fast for an empty canister and slowly for a full one. Release past the mark with the view straight to pour, or turned left to reject.' },
  rush: 'Tipped each canister into its hopper without lifting it to test the weight.',
  captions: { 'counted empty': 'hopper hiss on empty', 'wasted full': 'canister rattles on pile', dropped: 'canister clangs on deck' },
  says: { 'counted empty': 'That one was empty. It rose too easily to be full.', 'wasted full': 'That was a full canister. Slow lift means heavy.', dropped: 'You let go before the lift mark.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Canister 1', prop: 'shelving' }, { name: 'Canister 2', prop: 'shelving' }, { name: 'Canister 3', prop: 'locker' }, { name: 'Canister 4', prop: 'shelving' }]), r = m.rnd;
    const emp = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.cn = m.sites.map((_, i) => ({ empty: emp.has(i), rate: emp.has(i) ? rf(r, 1.2, 1.6) : rf(r, 0.4, 0.55) })); m.lift = 0; m.hh = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const rel = m.released(inp), s = m.cur(inp); if (!s) { m.lift = 0; m.hh = 0; return; } const c = m.cn[m.next];
      if (inp.hold) { m.hh += dt; m.lift = clamp(m.lift + c.rate * dt); }
      if (rel) { const ok = m.lift >= 0.5, left = (inp.look || 0) > 0.2, i = m.next; m.lift = 0; m.hh = 0;
        if (!ok) { m.fault('dropped'); return; } if (c.empty && !left) { m.fault('counted empty'); return; } if (!c.empty && left) { m.fault('wasted full'); return; } m.finish(i); return; }
      s.prog = m.lift * 0.9;
    };
    m.hint = () => { const c = m.cn[m.next]; if (!c) return { at: -1 }; return { at: m.next, look: c.empty ? 0.4 : 0, hold: m.lift < 0.55 }; };
    m.bad = () => { const c = m.cn[m.next]; return { at: m.next, look: c.empty ? 0 : 0.4, hold: m.lift < 0.55 }; };
    m.view = () => ({ cn: m.cn.map(c => [c.empty, +c.rate.toFixed(2)]) });
    m.panel = (i) => ({ label: m.hh > 0.3 ? (m.cn[i].rate > 0.9 ? 'LIGHT' : 'HEAVY') : 'Lift', value: `${Math.round(m.lift * 100)} %`, bar: m.lift, band: [0.5, 1] });
    m.prompt = () => 'Hold [E] to lift; let go past the mark: look ahead to pour, look left to reject';
    return m;
  },
});
