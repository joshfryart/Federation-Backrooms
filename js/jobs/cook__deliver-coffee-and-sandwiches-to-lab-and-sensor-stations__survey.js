// Cook: coffee round. At each bench the analyst stands to one side and the console to the other. Face the analyst and tap E to pass the mug
// across; tapping E while facing the console bumps it and spills.
import { define, machine, room, pick, rf, clamp } from './kit.js';
const MUGS = ['black coffee', 'tea', 'cocoa', 'white coffee', 'water'];

export default define({
  job: { billet: 'cook', label: 'Deliver coffee and sandwiches to lab and sensor stations', type: 'task:survey' },
  title: 'Hand the mug across the bench', dept: 'services', host: 'room', siteName: 'Bench', verb: 'Serve',
  how: 'At each bench turn to face the analyst (the panel says which side) and tap E to pass the mug. Do not tap E while facing the console on the other side.',
  keys: ['look at the analyst', 'E tap: pass the mug'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'hand across', input: 'e-tap+look', win: 'three mugs passed to analysts while the tray stayed clear of every console',
    fail: 'tapping to hand over while facing a console, spilling the drink on it',
    rule: 'The analyst stands to one side and the console to the other. Turn your view to the analyst and tap E; tapping while facing the console spills.' },
  rush: 'Slid the tray along the bench and left each mug within reach of a keyboard.',
  captions: { spill: 'cup tips over' }, says: { spill: 'Bumped the console and spilled the drink.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Lab bench 1', prop: 'labbench' }, { name: 'Lab bench 2', prop: 'labbench' }, { name: 'Sensor station', prop: 'sensorstation' }]), r = m.rnd, tol = m.calm ? 0.2 : 0.14;
    m.an = m.sites.map(() => ({ b: pick(r, [-1, 1]) * rf(r, 0.25, 0.4), mug: pick(r, MUGS) }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const a = m.an[m.next], l = inp.look || 0;
      if (inp.press) { if (Math.abs(l - a.b) < tol) m.finish(m.next); else if (Math.abs(l + a.b) < tol + 0.04) m.fault('spill'); }
      s.prog = s.done ? 1 : clamp(1 - Math.abs(l - a.b), 0, 0.8) * 0.5;
    };
    m.hint = (f = 0) => ({ at: m.next, look: m.next >= 0 ? m.an[m.next].b : 0, press: f % 3 === 0 });
    m.bad = (f = 0) => ({ at: m.next, look: m.next >= 0 ? -m.an[m.next].b : 0, press: f % 3 === 0 });
    m.view = () => ({ an: m.an.map(a => [+a.b.toFixed(2), a.mug]) });
    m.panel = (i) => { const a = m.an[i]; return a ? { label: `Wants ${a.mug}`, value: a.b > 0 ? 'analyst on your LEFT' : 'analyst on your RIGHT', bar: 0.1 } : null; };
    m.prompt = (i) => { const a = m.an[i]; return a ? `Face the analyst (${a.b > 0 ? 'left' : 'right'}) and tap [E]` : ''; };
    return m;
  },
});
