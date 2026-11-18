// Deck crew: fuel the shuttles. Hold E at each tank to pump; the flow builds while you hold and keeps running for a moment after you let go,
// so the level coasts on. Let go early enough that it settles inside the fill band. Over the top is a spill (the tank is drained back).
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Fuel and stock shuttles', type: 'loop' },
  title: 'Shuttle fuelling with hose lag', dept: 'flight', host: 'room', siteName: 'Tank', verb: 'Fuel',
  how: 'At each marked tank hold E to pump. The hose keeps flowing after you let go, so release before the mark and let the level coast into the band.',
  keys: ['E hold: pump'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'coast-fill', input: 'e-hold', win: 'every tank settles inside its fill band after the hose stops',
    fail: 'holding on until the coasting flow overfills the tank past the top',
    rule: 'Holding E opens the nozzle and the flow builds; after release it keeps flowing and dies away. Let go early so the settled level lands in the band.' },
  rush: 'Filled them all to the brim and wiped up the overflow.',
  captions: { overfill: 'fuel splashes on the deck' }, says: { overfill: 'Overfilled — the tank is drained back. Let go sooner: the hose keeps running.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Shuttle tank', prop: 'shuttle' }, { name: 'Work pod tank', prop: 'workpod' }, { name: 'Bowser top-up', prop: 'fuelbowser' }]), r = m.rnd, w = m.calm ? 0.1 : 0.07;
    m.tanks = m.sites.map(() => { const c = rf(r, 0.55, 0.8); return { lvl: rf(r, 0.05, 0.2), flow: 0, band: [c - w / 2, c + w / 2], acc: rf(r, 0.5, 0.7), tau: rf(r, 0.55, 0.85) }; });
    const settle = (k) => k.lvl + k.flow * k.tau;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), i = m.next;
      for (const [j, k] of m.tanks.entries()) { const on = s && j === i && inp.hold; k.flow = on ? Math.min(0.5, k.flow + k.acc * dt) : k.flow * Math.exp(-dt / k.tau); k.lvl += k.flow * dt; if (!on && k.flow < 0.004) k.flow = 0; m.sites[j].prog = m.sites[j].done ? 1 : clamp(k.lvl / k.band[0] * 0.9, 0, 0.95);
        if (k.lvl > 1) { m.fault('overfill'); k.lvl = rf(r, 0.1, 0.3); k.flow = 0; } }
      if (s) { const k = m.tanks[i]; if (!inp.hold && k.flow === 0 && k.lvl >= k.band[0] && k.lvl <= k.band[1]) m.finish(i); if (!inp.hold && k.flow === 0 && k.lvl > k.band[1] + 0.02) { m.fault('overfill'); k.lvl = rf(r, 0.1, 0.3); } }
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.tanks[i], c = (k.band[0] + k.band[1]) / 2; return { at: i, hold: settle(k) < c - 0.004 }; };
    m.bad = () => ({ at: m.next, hold: true });
    m.view = () => ({ tanks: m.tanks.map(k => [+k.band[0].toFixed(2), +k.lvl.toFixed(2)]) });
    m.panel = (i) => { const k = m.tanks[i]; return k ? { label: 'Level', value: k.flow > 0.01 ? `flow ${Math.round(k.flow * 200)} L/s` : 'settled', bar: k.lvl, band: k.band } : null; };
    m.prompt = (i) => { const k = m.tanks[i]; return !k ? '' : k.flow > 0.01 ? 'Coasting… watch it settle' : k.lvl < k.band[0] ? 'Hold [E] to pump — let go before the mark' : 'Settled'; };
    return m;
  },
});
