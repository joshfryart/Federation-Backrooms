// Galley: cold store and pantry inventory. Each produce carton is squeezed (hold E) until its firmness reading shows. Soft, spoiled items go in the
// spoilage bag: let go of E while looking left toward the bag. Bruised but firm-enough items go back on the shelf: let go looking straight ahead.
// Letting go before the reading shows, bagging good stock or shelving rot are faults.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Cold store and pantry inventory', type: 'loop' },
  title: 'Squeeze test and spoilage bag', dept: 'services', host: 'room', siteName: 'Carton', verb: 'Squeeze',
  how: 'Hold E to squeeze the carton until the firmness reading appears. Under 35 percent is spoiled: let go while looking left at the bag. Anything firmer goes back: let go looking ahead.',
  keys: ['E hold: squeeze', 'look left on release: bag it'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'bag by squeeze', input: 'e-hold+look', win: 'four cartons each squeezed to a reading and the spoiled ones, and only those, released into the spoilage bag',
    fail: 'letting go before the firmness reading shows, shelving a spoiled carton, or bagging one that is only bruised',
    rule: 'Hold E until FIRMNESS shows. Reading under 35: turn your view left and let go to bag it. 35 or more, bruises included: let go looking ahead to shelve it.' },
  rush: 'Counted the cartons by the label and left the soft ones where they sat.',
  captions: { unsqueezed: 'carton rustle', rotten: 'sour smell', 'good bagged': 'bag rustle' },
  says: { unsqueezed: 'You let go before you felt the carton through.', rotten: 'That one was spoiled and went back on the shelf.', 'good bagged': 'That carton was only bruised: it should have gone back.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Carton 1', prop: 'shelving' }, { name: 'Carton 2', prop: 'crate' }, { name: 'Carton 3', prop: 'locker' }, { name: 'Carton 4', prop: 'shelving' }]), r = m.rnd;
    m.C = m.sites.map(() => ({ f: r() < 0.45 ? rf(r, 0.1, 0.3) : rf(r, 0.4, 0.8), sq: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, c = m.C[i];
      if (inp.hold) c.sq = clamp(c.sq + dt * 1.2);
      if (rel) { const bag = (inp.look || 0) > 0.3, rot = c.f < 0.35;
        if (c.sq < 0.6) { m.fault('unsqueezed'); c.sq = 0; } else if (rot && !bag) { m.fault('rotten'); c.sq = 0; } else if (!rot && bag) { m.fault('good bagged'); c.sq = 0; } else m.finish(i); }
      s.prog = s.done ? 1 : c.sq * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.C[i]; return c.sq < 0.7 ? { at: i, hold: true, look: 0 } : { at: i, hold: false, look: c.f < 0.35 ? 0.4 : 0 }; };
    m.bad = (f = 0) => ({ at: Math.max(0, m.next), hold: f % 20 < 10 });
    m.view = () => ({ f: m.C.map(c => +c.f.toFixed(2)) });
    m.panel = (i) => { const c = m.C[i]; return c ? { label: 'Firmness', value: c.sq >= 0.6 ? `${Math.round(c.f * 100)} %` : 'squeezing...', bar: c.sq, band: [0.6, 1] } : null; };
    m.prompt = (i) => { const c = m.C[i]; return !c ? '' : c.sq < 0.6 ? 'Hold [E] to squeeze the carton' : 'Under 35: let go looking left to bag it; otherwise let go looking ahead'; };
    return m;
  },
});
