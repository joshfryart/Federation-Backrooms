// Chief of security: sweep the sensors over the pad before the away team beams out. There is no button on this hand sensor: you turn your view around the
// pad, and a lifesign blip locks when the view comes to rest on it. Hold still on each blip for about a second. Swing across a blip quickly and the lock drops.
import { define, machine, room, rf } from './kit.js';

const LOCK = 0.9;
export default define({
  job: { billet: 'cos', label: 'Sweep sensors before the away team beams out', type: 'task:survey' },
  title: 'Lifesign dwell lock', dept: 'security', host: 'room', item: 'tricorder_sec', siteName: 'Pad', verb: 'Sweep',
  how: 'Turn your view slowly around the pad. Rest the view on each lifesign blip for about a second to lock it. Swing past a blip fast and the lock is lost.',
  keys: ['turn the view slowly', 'rest on each blip'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'dwell on blips', input: 'swing', win: 'every lifesign blip on the pad and the cargo pad locked by resting the view on it',
    fail: 'swinging past blips too fast, so the lock drops and the contact is never confirmed',
    rule: 'Turn your view to bring a blip into the sensor centre and rest there: the lock fills in about a second. A quick swing across a blip drops the lock; a very fast swing past it is a missed contact.' },
  rush: 'Panned the sensor across the pad once and called it clear.',
  captions: { 'swept past': 'sensor chirp' }, says: {},
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Transporter pad', prop: 'pad' }, { name: 'Cargo pad', prop: 'cargo_pad' }]), r = m.rnd;
    m.pads = m.sites.map(() => [rf(r, -0.3, -0.12), rf(r, 0.12, 0.3)].map(b => ({ b, dwell: 0, locked: false })));
    m.cool = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return;
      const i = m.next, bl = m.pads[i], b = bl.find(x => !x.locked); if (!b) return;
      m.cool = Math.max(0, m.cool - dt);
      const look = inp.look || 0, sw = Math.abs(inp.swing || 0);
      if (Math.abs(look - b.b) < 0.12 && sw < 0.35) { b.dwell += dt; if (b.dwell >= LOCK) { b.locked = true; m.ev('lock', { site: i }); } }
      else {
        b.dwell = 0;
        if (sw > 1.2 && Math.abs(look - b.b) < 0.35 && m.cool <= 0) { m.fault('swept past'); m.cool = 0.6; }
      }
      if (bl.every(x => x.locked)) { m.finish(i); return; }
      s.prog = bl.reduce((a, x) => a + (x.locked ? 1 : Math.min(1, x.dwell / LOCK)), 0) / bl.length * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const b = m.pads[i].find(x => !x.locked); return { at: i, look: b ? b.b : 0, swing: 0 }; };
    m.bad = () => { const i = m.next; if (i < 0) return { at: -1 }; const b = m.pads[i].find(x => !x.locked) || m.pads[i][0]; return { at: i, look: b.b, swing: 2 }; };
    m.view = () => ({ pads: m.pads.map(p => p.map(x => +x.b.toFixed(2))) });
    m.panel = (i) => { const bl = m.pads[i]; if (!bl) return null; const n = bl.filter(x => x.locked).length; return { label: 'Lifesign lock', value: `${n} / ${bl.length}`, bar: n / bl.length }; };
    m.prompt = (i) => (m.pads[i] ? 'Rest the view on a blip; do not swing past it' : '');
    return m;
  },
});
