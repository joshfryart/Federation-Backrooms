// CFO: prep a survey shuttle. Throw each probe pod's locking lever: hold E to haul it down past the click, and keep it hauled until the lock
// indicator reads LOCKED (seated is not locked). Then top the fuel up to the survey line in short pulses from the pad hose (tap E for each
// pulse) and cap the hose (hold E) once the gauge sits on the line. Overfill and the tank has to be drained back.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Prep a survey shuttle', type: 'task:survey' },
  title: 'Pod lever lock and pulse fuel', dept: 'flight', host: 'room', siteName: 'Station', verb: 'Prep',
  how: 'Hold E on each pod lever, past the click, until the indicator says LOCKED. At the fuel port tap E for short fuel pulses, then hold E to cap once on the survey line.',
  keys: ['E hold: haul lever / cap hose', 'E tap: one fuel pulse'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'lock then pulse', input: 'e-hold+e-tap', win: 'both probe pod levers held through the click to LOCKED and the tank pulsed up onto the survey line and capped',
    fail: 'letting a lever up after the click but before it locks, overfilling past the survey line, or capping short',
    rule: 'Lever: hold E, it clicks part way, keep holding until LOCKED. Fuel: each E tap adds one pulse of uneven size; when the needle is inside the survey band, hold E to cap.' },
  rush: 'Slammed the pods on, filled to the brim and sent the pilot out.',
  captions: { 'not locked': 'lever springs back', overfilled: 'fuel gurgles over', short: 'gauge reads short' },
  says: { 'not locked': 'It clicked but never locked — the lever sprang back. Hold until LOCKED.', overfilled: 'Over the survey line — drained back. Shorter pulses near the line.', short: 'Capped short of the survey line.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Fore pod lever', prop: 'shuttle' }, { name: 'Aft pod lever', prop: 'shuttle' }, { name: 'Fuel port', prop: 'fuelbowser' }]), r = m.rnd;
    const lockT = m.calm ? 0.6 : 0.8, bw = m.calm ? 0.13 : 0.1;
    m.levers = [0, 1].map(() => ({ click: rf(r, 0.45, 0.75), rate: rf(r, 0.5, 0.7), d: 0, after: 0 }));
    m.fuel = { lv: rf(r, 0.2, 0.35), lo: rf(r, 0.66, 0.74), held: 0, pulses: Array.from({ length: 40 }, () => rf(r, 0.05, 0.09)), k: 0 }; m.fuel.hi = m.fuel.lo + bw;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i < 2) {
        const L = m.levers[i];
        if (inp.hold) { L.d = clamp(L.d + L.rate * dt); if (L.d >= L.click) { L.after += dt; if (L.after >= lockT) { m.finish(i); return; } } }
        if (rel) { if (L.d >= L.click) m.fault('not locked'); L.d = 0; L.after = 0; }
        s.prog = clamp(L.d * 0.6 + L.after / lockT * 0.35);
      } else {
        const F = m.fuel;
        if (inp.hold) { F.held += dt; if (F.held >= 0.5) { if (F.lv >= F.lo && F.lv <= F.hi) { m.finish(i); return; } m.fault('short'); F.held = -99; } }
        if (rel) { if (F.held > 0 && F.held < 0.3) { F.lv += F.pulses[F.k++ % 40]; if (F.lv > F.hi) { m.fault('overfilled'); F.lv = 0.45; } } F.held = 0; }
        s.prog = clamp(F.lv / F.hi * 0.95);
      }
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; if (i < 2) return { at: i, hold: true };
      const F = m.fuel; return F.lv >= F.lo ? { at: i, hold: true } : { at: i, hold: f % 4 === 0 };
    };
    m.bad = (f = 0) => { const i = m.next; if (i < 2) { const L = m.levers[i]; return { at: i, hold: !(L.d >= L.click && L.after > 0.15) }; } return { at: i, hold: f % 4 === 0 }; };
    m.view = () => ({ l: m.levers.map(L => +L.click.toFixed(3)), lo: +m.fuel.lo.toFixed(3) });
    m.panel = (i) => {
      if (i < 2) { const L = m.levers[i]; return { label: L.after > 0 ? 'CLICKED — hold' : 'Lever', value: L.after >= lockT ? 'LOCKED' : L.after > 0 ? 'seated, not locked' : 'open', bar: L.d }; }
      const F = m.fuel; return { label: 'Fuel', value: `${Math.round(F.lv * 100)} % (line ${Math.round(F.lo * 100)}-${Math.round(F.hi * 100)})`, bar: clamp(F.lv), band: [F.lo, F.hi] };
    };
    m.prompt = (i) => i < 2 ? 'Hold [E] to haul the lever down; keep holding after the click until LOCKED' : m.fuel.lv >= m.fuel.lo ? 'On the survey line — hold [E] to cap the hose' : 'Tap [E] for a fuel pulse';
    return m;
  },
});
