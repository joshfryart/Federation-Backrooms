// Holodeck tech: close the playroom. At the viewing glass you must look to each side (a real look, view turned well away from centre) and tap
// E to check that side; a person found is hailed and leaves. Then switch the emitter lights off by tapping E only as the pointer passes a lit
// one, and finally tap the door lock.
import { define, machine, room, pick, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Close the playroom during cargo transfers and give the space to stores', type: 'task:cargo_run' },
  title: 'Check both sides, then lights, then lock', dept: 'services', host: 'room', siteName: 'Closing step', verb: 'Close',
  how: 'At the glass turn your view left, tap E, turn right, tap E to check both sides. At the light bank tap E as the pointer is on a lit lamp. Then tap the lock.',
  keys: ['look left + E, look right + E', 'E tap on a lit lamp', 'E tap to lock'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'clear then lock', input: 'look+e-tap', win: 'both sides of the room checked through the glass, all four lights switched off and the door locked',
    fail: 'tapping at the glass without looking to a side, or switching off a lamp that is already dark',
    rule: 'Turn your view well to the left, tap E; well to the right, tap E. At the light bank a pointer sweeps four lamps: tap only on a lit one. Last, tap the lock.' },
  rush: 'Glanced through the glass from the doorway, killed the lights in one go and locked up.',
  captions: { glanced: 'glass check rejected', 'dark lamp': 'switch clicks on nothing' }, says: { glanced: 'You tapped at the glass without looking to either side.', 'dark lamp': 'That lamp was already off.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Viewing glass', prop: 'console' }, { name: 'Light bank', prop: null }, { name: 'Door lock', prop: 'airlock_doors' }]), r = m.rnd, per = m.calm ? 0.8 : 0.6;
    m.seen = { L: false, R: false }; m.guest = pick(r, ['L', 'R']); m.lamps = [1, 1, 1, 1]; m.ph = rf(r, 0, 2);
    const ptr = (t = m.t) => Math.floor((t + m.ph) / per) % 4;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, l = inp.look || 0;
      if (i === 0) { if (inp.press) { const side = l > 0.35 ? 'L' : l < -0.35 ? 'R' : null; if (!side) m.fault('glanced'); else m.seen[side] = true; if (m.seen.L && m.seen.R) m.finish(0); } s.prog = (m.seen.L + m.seen.R) / 2; }
      else if (i === 1) { if (inp.press) { const k = ptr(m.t - dt); if (!m.lamps[k]) m.fault('dark lamp'); else { m.lamps[k] = 0; if (!m.lamps.some(Boolean)) m.finish(1); } } s.prog = 1 - m.lamps.filter(Boolean).length / 4; }
      else if (inp.press) m.finish(2);
    };
    m.hint = (f = 0) => { const i = m.next; if (i === 0) return { at: 0, look: m.seen.L ? -0.5 : 0.5, press: f % 4 === 0 }; if (i === 1) return { at: 1, press: m.lamps[ptr()] === 1 && f % 2 === 0 }; return { at: i, press: true }; };
    m.bad = (f = 0) => ({ at: m.next, look: 0, press: f % 3 === 0 });
    m.view = () => ({ guest: m.guest, ph: +m.ph.toFixed(2) });
    m.panel = (i) => i === 0 ? { label: 'Glass', value: `left ${m.seen.L ? 'seen' : '-'}, right ${m.seen.R ? 'seen' : '-'}${m.seen[m.guest] ? ' (guest hailed out)' : ''}`, bar: (m.seen.L + m.seen.R) / 2 } : i === 1 ? { label: `Pointer on lamp ${ptr() + 1}`, value: m.lamps.map(x => x ? 'ON' : 'off').join(' '), bar: clamp(1 - m.lamps.filter(Boolean).length / 4) } : { label: 'Lock', value: 'empty room', bar: 0 };
    m.prompt = (i) => i === 0 ? 'Look well left and tap [E], then well right and tap [E]' : i === 1 ? 'Tap [E] only while the pointer is on a lit lamp' : 'Tap [E] to lock the door';
    return m;
  },
});
