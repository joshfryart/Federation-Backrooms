// Assistant Chief Engineer: inspect cargo bay power and gravity. Tap E to step on each floor plate and read how it feels. A sound plate reads
// full weight and is done. A plate that feels light needs its control-box lever: hold E and let go the moment the status light holds green;
// over-pulling is a fault, and pulling the lever on a sound plate would blame the wrong part.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Inspect cargo bay power and gravity', type: 'task:cargo_run' },
  title: 'Step each plate, lever the light one', dept: 'engineering', host: 'room', siteName: 'Plate', verb: 'Step on',
  how: 'Tap E to step on a plate. Full weight: move on. Feels light: let go, then hold E on the lever and release when the light shows green.',
  keys: ['E tap: step on the plate', 'E hold then release in the green: lever'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'step then lever', input: 'e-tap+e-hold',
    win: 'four floor plates stepped on, with each light plate brought back to full weight by its lever released in the green',
    fail: 'over-pulling the lever, letting go before the green, or throwing the lever on a plate that felt sound',
    rule: 'Tap E to step and read the weight. Under 85% is light: hold E to pull the lever and release inside the green band.' },
  rush: 'Walked the bay once and wrote down the junction box as the cause.',
  captions: { overpulled: 'lever over-pulled', early: 'plate still light', 'sound plate': 'sound plate levered' },
  says: { overpulled: 'You pulled past the green. Let go inside it.', early: 'Still light. Hold the lever until the light is green.', 'sound plate': 'That plate felt sound. Leave the lever.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Plate 1', prop: 'cargo_pad' }, { name: 'Plate 2', prop: 'pallet_loaded' }, { name: 'Plate 3', prop: 'crate' }, { name: 'Plate 4', prop: 'baycontrol' }]), r = m.rnd, w = ri(r, 0, 3), w2 = (w + ri(r, 1, 3)) % 4, sp = m.calm ? 0.35 : 0.5;
    m.pl = m.sites.map((_, i) => { const weak = i === w || (i === w2 && r() < 0.6), lo = ri(r, 55, 65) / 100; return { weak, wt: weak ? ri(r, 62, 82) / 100 : ri(r, 96, 100) / 100, lo, hi: lo + 0.14, p: 0, st: 0, ar: false, g: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const p = m.pl[m.next];
      if (!p.st) { if (inp.press) p.st = 0.001; return; }
      if (p.st < 0.4) { p.st += dt; if (!inp.hold) p.ar = true; if (p.st >= 0.4 && !p.weak) m.finish(m.next); return; }
      if (!inp.hold) p.ar = true;
      if (inp.hold && p.ar) p.p += sp * dt; if (p.p > p.hi + 0.1) { m.fault('overpulled'); p.p = 0; p.ar = false; }
      if (rel && p.p > 0) { if (p.p >= p.lo && p.p <= p.hi + 0.1) m.finish(m.next); else { m.fault('early'); p.p = 0; } }
      s.prog = clamp(p.p) * 0.5;
    };
    m.hint = (f = 0) => { const p = m.pl[m.next]; if (!p) return { at: -1 }; if (!p.st) return f % 2 ? { at: m.next, hold: false } : { at: m.next, hold: true, press: true }; if (!p.ar) return { at: m.next, hold: false }; return { at: m.next, hold: p.p < p.lo + 0.03 }; };
    m.bad = () => { const p = m.pl[m.next]; if (!p) return { at: -1 }; return { at: m.next, hold: true, press: !p.st }; };
    m.view = () => ({ pl: m.pl.map(p => [p.weak, p.wt, +p.lo.toFixed(2)]) });
    m.panel = (i) => { const p = m.pl[i]; if (!p) return null; return { label: !p.st ? 'Plate: tap E to step' : p.st < 0.4 ? 'Plate: settling' : `Weight ${Math.round(p.wt * 100)} % - LIGHT`, value: p.st >= 0.4 ? (p.p >= p.lo && p.p <= p.hi ? 'light: GREEN' : 'light: red') : '', bar: p.st >= 0.4 ? p.p : 0, band: [p.lo, p.hi] }; };
    m.prompt = (i) => { const p = m.pl[i]; return !p || !p.st ? 'Tap [E] to step on the plate' : p.weak ? 'Light plate: hold [E] for the lever, release in the green' : 'Reading the plate'; };
    return m;
  },
});
