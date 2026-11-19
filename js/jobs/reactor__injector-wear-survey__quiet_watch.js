// Reactor specialist: injector wear survey. Torch in hand, take each injector's cover plate off (tap E), then seat the wear gauge pins one at a
// time in the nozzle bore. The torch beam picks out the bore as a dark centre inside the glazed lip ring; the bore sits at a different spot for
// each pin as the gauge shifts. Aim the view onto the bore and tap E to seat the pin. A pin seated on the lip measures the lip, not the bore:
// a false reading and a fault. Pins that will not go in are logged as wear.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Injector wear survey', type: 'task:quiet_watch' },
  title: 'Wear gauge pins in the nozzle bore', dept: 'engineering', host: 'room', item: 'flashlight', siteName: 'Injector', verb: 'Gauge',
  how: 'Tap E to lift the cover plate. Then for each wear pin aim your view into the dark bore (not the shiny lip ring around it) and tap E to seat the pin.',
  keys: ['E tap: lift plate / seat a pin', 'aim the view into the bore'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'gauge the bore', input: 'e-tap+look', win: 'every wear gauge pin seated in the nozzle bore of each injector, covers lifted first',
    fail: 'seating a pin on the glazed lip ring, so the lip is measured instead of the bore',
    rule: 'The panel shows where the bore and lip sit relative to your view. Aim inside the bore (the small centre) and tap E; a tap on the ring around it is a lip reading. Each pin moves the bore.' },
  rush: 'Shone the torch into each nozzle from arm length and wrote "fair wear".',
  captions: { lip: 'gauge clicks on the lip' }, says: { lip: 'That pin sat on the glazed lip: it measures the lip, not the bore. Aim at the dark centre.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Injector A', prop: 'warpcore' }, { name: 'Injector B', prop: 'injector_crate' }, { name: 'Injector C', prop: 'reactorstation' }]), r = m.rnd;
    const bore = m.calm ? 0.07 : 0.05, lip = 0.17;
    m.inj = m.sites.map(() => ({ open: false, pin: 0, pins: [0, 1, 2].map(() => ({ x: rf(r, 0.06, 0.3) * (r() < 0.5 ? -1 : 1), tight: r() < 0.3 })), ph: rf(r, 0, 6), log: [] }));
    m.boreAt = (i) => { const j = m.inj[i]; const p = j.pins[Math.min(j.pin, 2)]; return p.x + 0.025 * Math.sin(m.t * 1.3 + j.ph); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, j = m.inj[i];
      if (inp.press) {
        if (!j.open) { j.open = true; m.ev('plate', { site: i }); }
        else { const d = Math.abs((inp.look || 0) - m.boreAt(i)); if (d <= bore) { j.log.push(j.pins[j.pin].tight ? 'tight' : 'in'); j.pin++; if (j.pin >= 3) { m.finish(i); return; } } else if (d <= lip) m.fault('lip'); }
      }
      s.prog = j.open ? 0.15 + j.pin * 0.27 : 0;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = f % 3 === 0; return { at: i, look: m.boreAt(i), press: p, hold: p }; };
    m.bad = (f = 0) => { const i = m.next, p = f % 3 === 0; return { at: i, look: m.boreAt(i) + 0.11, press: p, hold: p }; };
    m.view = () => ({ pins: m.inj.map(j => j.pins.map(p => [+p.x.toFixed(3), p.tight])) });
    m.panel = (i) => { const j = m.inj[i]; if (!j) return null; if (!j.open) return { label: 'Cover plate', value: 'tap E to lift', bar: 0 };
      const b = m.boreAt(i); return { label: `Pin ${Math.min(j.pin + 1, 3)} / 3 · bore ${Math.abs(b).toFixed(2)} ${b > 0 ? 'left' : 'right'}`, value: j.log.length ? j.log.join(' · ') : 'aim at the dark centre', bar: clamp(j.pin / 3) }; };
    m.prompt = (i) => { const j = m.inj[i]; return !j ? '' : !j.open ? 'Tap [E] to lift the cover plate' : 'Aim into the dark bore, inside the shiny lip ring, and tap [E] to seat the pin'; };
    return m;
  },
});
