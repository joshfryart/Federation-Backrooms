// Nurse: prepare biobeds and the isolation bay. Tuck each bed's corners as a sweeping marker passes the tight zone (tap E on it, three corners per
// bed). At the isolation door press E to seal, wait for the seal light, and press E again if it came up red. Pressing while the light is still amber
// rushes the seal.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Prepare biobeds and isolation bay', type: 'task:medical_relief' },
  title: 'Tuck on the pass, seal on green', dept: 'medical', host: 'room', siteName: 'Bay', verb: 'Prepare',
  how: 'At a bed tap E when the sweeping marker is inside the tight zone, three times. At the isolation door press E once to seal, wait for the light and press E again only if it stays red.',
  keys: ['E tap on the zone', 'E seal door', 'wait for the light'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'tuck on pass', input: 'e-tap+rhythm', win: 'two beds tucked with three on-the-pass corner taps each and the isolation door sealed to a green light',
    fail: 'tapping a corner outside the tight zone three times, or pressing the seal while its light is still resolving',
    rule: 'The marker sweeps back and forth: tap E while it is in the tight zone for each corner. At the door tap E to seal, then wait for the light; red means seal again.' },
  rush: 'Smoothed the sheets and marked the beds ready from the doorway.',
  captions: { 'loose corner': 'sheet flaps loose', 'rushed seal': 'door seal hiss' }, says: { 'loose corner': 'That corner was left loose. Tap on the tight zone.', 'rushed seal': 'You pressed the seal while it was still resolving. Wait for the light.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Biobed 1', prop: 'bunk' }, { name: 'Biobed 2', prop: 'bunk' }, { name: 'Isolation door', prop: 'airlock_doors' }]), r = m.rnd, per = m.calm ? 2.6 : 1.7, band = m.calm ? 0.12 : 0.08;
    m.ph = ri(r, 0, 9) / 10; m.tucks = [0, 0]; m.misses = 0; m.inband = false; m.seal = { state: 0, clk: 0, red: r() < 0.7, tries: 0 };
    const pos = () => { const p = ((m.t / per) + m.ph) % 1; return p < 0.5 ? p * 2 : 2 - p * 2; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), p = pos(), inb = Math.abs(p - 0.5) < band, k = m.seal;
      if (k.state === 1) { k.clk += dt; if (k.clk >= 0.9) { k.state = k.red && k.tries <= 1 ? 3 : 2; } }
      if (!inb) m.inband = false; if (!s) return; const i = m.next;
      if (i < 2) { if (inp.press) { if (inb && !m.inband) { m.tucks[i]++; m.inband = true; if (m.tucks[i] >= 3) m.finish(i); } else if (!inb) { m.misses++; if (m.misses >= 2) { m.fault('loose corner'); m.misses = 0; } } } s.prog = m.tucks[i] / 3 * 0.95; }
      else if (inp.press) { if (k.state === 1) { m.fault('rushed seal'); } else if (k.state === 0 || k.state === 3) { k.state = 1; k.clk = 0; k.tries++; } else m.finish(2); }
      if (i === 2) s.prog = k.state === 2 ? 0.95 : k.state === 1 ? 0.4 : 0;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i < 2) { const inb = Math.abs(pos() - 0.5) < band * 0.7; return { at: i, press: inb && !m.inband }; } const k = m.seal; return { at: i, press: k.state === 0 || k.state === 2 || k.state === 3 }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 2 === 0 });
    m.view = () => ({ ph: m.ph, red: m.seal.red });
    m.panel = (i) => { if (i < 2) { const p = pos(); return { label: 'Corners', value: `${m.tucks[i]}/3  marker ${Math.round(p * 100)}`, bar: p, band: [0.5 - band, 0.5 + band] }; } const k = m.seal; return { label: 'Seal light', value: ['idle', 'AMBER', 'GREEN', 'RED'][k.state], bar: k.state === 1 ? k.clk / 0.9 : k.state === 2 ? 1 : 0 }; };
    m.prompt = (i) => i < 2 ? 'Tap [E] when the marker is inside the tight zone' : m.seal.state === 1 ? 'Wait: the seal light is still amber' : m.seal.state === 3 ? 'Light is red: press [E] to seal again' : m.seal.state === 2 ? 'Green: press [E] to mark the bay ready' : 'Press [E] to seal the isolation door';
    return m;
  },
});
