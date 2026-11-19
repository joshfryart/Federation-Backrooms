// Chief science officer: verify the lab and hydroponics systems. Walk gauge to gauge. A needle sitting comfortably mid-band can be accepted
// with a tap of E. A needle near the band edge must be watched: hold E and the panel shows its trend after a moment. If it holds steady,
// let go to accept it; if it is creeping, keep watching until it leaves the band and let go to log it out of band. Accepting an edge needle
// unwatched, or letting go of a creeping one while it is still inside the band (signing off a failing system), is a fault.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const LO = 0.3, HI = 0.7;
export default define({
  job: { billet: 'cso', label: 'Verify lab and hydroponics systems', type: 'task:shakedown' },
  title: 'Edge needle drift watch', dept: 'sciences', host: 'room', siteName: 'Gauge', verb: 'Watch',
  how: 'Tap E to accept a needle sitting mid-band. If it sits near the band edge, hold E to watch it: steady after a second, let go to accept; creeping, hold on until it leaves the band, then let go to log it.',
  keys: ['E tap: accept mid-band', 'E hold: watch an edge needle'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'watch the needle', input: 'e-tap+e-hold', win: 'every lab and hydroponics gauge read, edge needles watched long enough to see their trend, steady ones accepted and creeping ones logged out of band',
    fail: 'tapping an edge needle through without watching it, or releasing a creeping needle while it still reads in band',
    rule: 'Mid-band needle: tap E. AT EDGE: hold E; after a second the trend shows STEADY or CREEPING. Steady: let go. Creeping: keep holding until the needle crosses out of the band, then let go.' },
  rush: 'Glanced at each dial on the way through and signed the sheet.',
  captions: { 'accepted unwatched': 'pen tick', 'signed a drifting gauge': 'gauge needle ticks' },
  says: { 'accepted unwatched': 'That needle sits at the band edge — hold [E] and watch it before you accept.', 'signed a drifting gauge': 'It was still creeping — keep watching until it leaves the band.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Air scrubber flow gauge', prop: 'scrubber' }, { name: 'Coolant manifold pressure', prop: 'heatexch' }, { name: 'Grow-light output meter', prop: 'growbed' }, { name: 'Hydro pump load', prop: 'nutrient_tanks' }]), r = m.rnd, watchT = m.calm ? 1.2 : 1.5;
    const kinds = shuffle(r, ['center', 'drift', r() < 0.5 ? 'drift' : 'edge', 'edge']);
    m.g = kinds.map(k => { const up = r() < 0.5, edgeV = up ? HI - rf(r, 0.03, 0.06) : LO + rf(r, 0.03, 0.06); return { kind: k, v: k === 'center' ? rf(r, 0.44, 0.56) : edgeV, rate: k === 'drift' ? rf(r, 0.045, 0.07) * (up ? 1 : -1) : 0, h: 0 }; });
    const edge = (g) => g.v < LO + 0.08 || g.v > HI - 0.08, inBand = (g) => g.v >= LO && g.v <= HI;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, g = m.g[i];
      if (inp.hold) { g.h += dt; g.v = clamp(g.v + g.rate * dt, 0, 1); }
      if (rel) {
        if (g.h < 0.4) { if (edge(g)) m.fault('accepted unwatched'); else m.finish(i); }
        else if (g.h >= watchT) { if (!inBand(g)) m.finish(i); else if (g.kind === 'drift') m.fault('signed a drifting gauge'); else m.finish(i); }
        g.h = 0;
      }
      if (!s.done) s.prog = clamp(g.h / watchT, 0, 0.9);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const g = m.g[i];
      if (!edge(g) && inBand(g) && g.h === 0) return { at: i, hold: f % 4 === 0, press: f % 4 === 0 };
      return { at: i, hold: g.kind === 'drift' ? (inBand(g) || g.h < watchT) : g.h < watchT + 0.1 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 4 === 0, press: f % 4 === 0 });
    m.view = () => ({ g: m.g.map(g => [g.kind, +g.v.toFixed(3)]) });
    m.panel = (i) => { const g = m.g[i]; if (!g) return null; const trend = g.h < 1 ? (g.h > 0 ? 'watching…' : '') : g.rate ? 'CREEPING' : 'STEADY';
      return { label: `${inBand(g) ? (edge(g) ? 'AT EDGE' : 'mid-band') : 'OUT OF BAND'}${trend ? ' · ' + trend : ''}`, value: `${Math.round(g.v * 100)} %`, bar: g.v, band: [LO, HI] }; };
    m.prompt = (i) => { const g = m.g[i]; if (!g) return ''; if (!inBand(g)) return 'Out of band — let go of [E] to log it';
      return edge(g) ? (g.h >= 1 ? (g.rate ? 'Creeping — keep holding [E] until it leaves the band' : 'Steady — let go of [E] to accept') : 'At the edge — hold [E] and watch the needle') : 'Mid-band — tap [E] to accept'; };
    return m;
  },
});
