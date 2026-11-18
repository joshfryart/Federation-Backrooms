// Pilot: prep the survey shuttle with its sensor pod. Three stages, each its own feel. Lift the pod out of its cradle and carry it level (hold
// E, keep your view steady: a sharp turn tips it). Seat the four lugs: the pod bobs on the rack springs, and a lug only clicks home if you
// push (tap E) as the pod bottoms out; push on the up-stroke and the lug jams. Then twist the two plug collars by turning your view with E
// held until the lock clicks, and let go: keep twisting past the lock and the collar strips.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'pilot', label: 'Prep survey shuttle with sensor pod', type: 'task:survey' },
  title: 'Pod lugs on the bob, collars to lock', dept: 'flight', host: 'room', siteName: 'Step', verb: 'Fit',
  how: 'Cradle: hold E and keep the view steady to carry the pod level. Rack: tap E each time the bobbing pod bottoms out to click a lug home (4 lugs). Collars: hold E and turn your view to twist; let go when it locks.',
  keys: ['E hold: lift / twist', 'E tap on the bob: seat a lug', 'turn the view: twist'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'bob-seat lugs', input: 'e-hold+e-tap+turn+rhythm',
    win: 'pod carried level, all four lugs clicked on the bottom of the bob, both collars twisted to their lock',
    fail: 'tipping the pod with a sharp turn, pushing a lug on the up-stroke so it jams, or twisting a collar past its lock',
    rule: 'Carry with E held and a steady view; tap E in time with the bottom of each bob to seat a lug; hold E and turn to twist a collar, letting go at LOCK.' },
  rush: 'Shoved the pod onto the rack and pushed the plugs in without twisting.',
  captions: { 'pod tipped': 'pod clunks', 'lug jammed': 'metal grinds', 'collar stripped': 'thread crunches', click: 'lug clicks' },
  says: { 'pod tipped': 'You swung round too fast and the pod tipped. Keep your view steady while carrying.', 'lug jammed': 'Pushed on the up-stroke: wait for the pod to bottom out.', 'collar stripped': 'Twisted past the lock: let go as soon as it clicks.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pod cradle', prop: 'crate' }, { name: 'Underside rack', prop: 'shuttle' }, { name: 'Plug collars', prop: 'workpod' }]), r = m.rnd;
    const cap = m.calm ? 1.4 : 1.0, win = m.calm ? 0.16 : 0.11;
    m.pod = { lift: 0, tip: false, period: +rf(r, 0.8, 1.1).toFixed(2), off: +rf(r, 0, 0.5).toFixed(2), lugs: 0, lastBob: -1, collars: [rf(r, 1.3, 1.9), rf(r, 1.3, 1.9)].map(v => +v.toFixed(2)), tw: 0, c: 0, strip: false, tl: 0 };
    const p = m.pod, bob = () => (p.tl + p.off) / p.period, near = () => Math.abs(bob() - Math.round(bob())) * p.period;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.hold && !p.tip) { if ((inp.turn || 0) > cap) { p.tip = true; p.lift = 0; m.fault('pod tipped'); } else { p.lift += dt / 1.6; if (p.lift >= 1) { m.finish(0); return; } } }
        if (rel) { p.tip = false; if (p.lift < 1) p.lift = 0; } s.prog = p.lift * 0.9; }
      else if (i === 1) { p.tl += dt; if (inp.press) { const b = Math.round(bob());
          if (near() <= win && b !== p.lastBob) { p.lastBob = b; p.lugs++; m.ev('click', { lug: p.lugs }); if (p.lugs >= 4) { m.finish(1); return; } } else if (near() > win) m.fault('lug jammed'); }
        s.prog = p.lugs / 4 * 0.9; }
      else { const need = p.collars[p.c];
        if (inp.hold && !p.strip) { p.tw += (inp.turn || 0) * dt; if (p.tw > need + 0.6) { p.strip = true; p.tw = 0; m.fault('collar stripped'); } }
        if (rel) { if (!p.strip && p.tw >= need) { p.c++; m.ev('locked', { c: p.c }); if (p.c >= 2) { m.finish(2); return; } } p.tw = 0; p.strip = false; }
        s.prog = (p.c + clamp(p.tw / need)) / 2 * 0.9; }
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 };
      if (i === 0) return { at: 0, hold: true, turn: 0.1 };
      if (i === 1) { const b = Math.round(bob()); return { at: 1, press: near() < 0.04 && b !== p.lastBob }; }
      return { at: 2, hold: p.tw < p.collars[p.c] + 0.05, turn: 1.5 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 20 < 14, turn: 3, press: f % 5 === 0 });
    m.view = () => ({ period: p.period, off: p.off, collars: p.collars });
    m.panel = (i) => i === 0 ? { label: p.tip ? 'TIPPED' : 'Lift', value: p.tip ? 'let go' : `${Math.round(p.lift * 100)} %`, bar: p.lift }
      : i === 1 ? { label: 'Bob', value: `${p.lugs} / 4 lugs`, bar: 0.5 + 0.5 * Math.cos(2 * Math.PI * bob()), band: [0.9, 1] }
      : i === 2 ? { label: p.tw >= (p.collars[p.c] ?? 9) ? 'LOCK' : `Collar ${Math.min(p.c + 1, 2)}`, value: p.strip ? 'stripped: let go' : `${Math.round(clamp(p.tw / (p.collars[p.c] ?? 1)) * 90)}°`, bar: clamp(p.tw / ((p.collars[p.c] ?? 1) + 0.6)), band: [(p.collars[p.c] ?? 1) / ((p.collars[p.c] ?? 1) + 0.6), 1] } : null;
    m.prompt = (i) => i === 0 ? 'Hold [E] to lift the pod; keep your view steady' : i === 1 ? 'Tap [E] as the pod bottoms out on its springs (bar full)'
      : i === 2 ? (p.tw >= (p.collars[p.c] ?? 9) ? 'LOCK: let go of [E]' : 'Hold [E] and turn your view to twist the collar') : '';
    return m;
  },
});
