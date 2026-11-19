// Botanist, survey: boost O2 output for the sensor crew on extended shifts. Work along the lamp array and then the nutrient feed valve. Grip a
// dial with E held and turn your whole view to wind it up: the dial follows how far you turn, but a fast turn is a sudden jump that scorches the
// tray (a fault, the dial knocks back down). Wind each one slowly into its green band and let go of E there. Winding past the band also scorches.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'bot', label: 'Boost O2 output for sensor crew on extended shifts', type: 'task:survey' },
  title: 'Slow wind of the lamp array', dept: 'sciences', host: 'room', siteName: 'Dial', verb: 'Raise',
  how: 'Hold E on each lamp dial (and the nutrient feed) and turn your view slowly to wind it up into the green band, then let go. A fast turn or going past the band scorches the tray.',
  keys: ['E hold: grip the dial', 'turn view slowly: wind it up'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'wind up slowly', input: 'e-hold+turn', win: 'every lamp dial and the feed valve wound up into its band at a slow steady turn',
    fail: 'turning fast enough to jump the dial and scorch the tray, or winding past the band',
    rule: 'While E is held, the speed of your view turn raises the dial; the speed meter must stay under its line. Let go when the dial sits in the green band.' },
  rush: 'Slammed every lamp to full and opened the feed wide.',
  captions: { scorched: 'lamp hum spikes, leaves crackle' },
  says: { scorched: 'Too sudden: the tray scorched and the dial dropped back. Turn slowly.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Lamp 1 dial', prop: 'growbed' }, { name: 'Lamp 2 dial', prop: 'tree' }, { name: 'Lamp 3 dial', prop: 'plant' }, { name: 'Nutrient feed valve', prop: 'nutrient_tanks' }]), r = m.rnd;
    const vmax = m.calm ? 2.2 : 1.6, half = m.calm ? 0.07 : 0.05, k = 0.22;
    m.dials = m.sites.map(() => { const v0 = rf(r, 0.15, 0.3); return { v0, v: v0, want: rf(r, 0.6, 0.82), spd: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, d = m.dials[i];
      d.spd = inp.hold ? Math.abs(inp.turn || 0) : 0;
      if (inp.hold) { if (d.spd > vmax) { m.fault('scorched'); d.v = d.v0; return; } d.v += d.spd * k * dt; if (d.v > d.want + half) { m.fault('scorched'); d.v = d.v0; return; } }
      if (rel && Math.abs(d.v - d.want) <= half) { m.finish(i); return; }
      s.prog = clamp(d.v / (d.want + half), 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.dials[i];
      return d.v < d.want - half * 0.3 ? { at: i, hold: true, press: !m.prev, turn: Math.min(vmax * 0.7, (d.want - d.v) / (k / 30) * 0.5 + 0.2) } : { at: i, hold: false }; };
    m.bad = () => ({ at: m.next, hold: true, turn: 4 });
    m.view = () => ({ dials: m.dials.map(d => [+d.v0.toFixed(3), +d.want.toFixed(3)]) });
    m.panel = (i) => { const d = m.dials[i]; return d ? { label: d.spd > vmax * 0.8 ? 'TOO FAST' : 'Light meter', value: `${Math.round(d.v * 100)} % · turn ${d.spd.toFixed(1)}/${vmax}`, bar: d.v, band: [d.want - half, d.want + half] } : null; };
    m.prompt = (i) => (m.dials[i] ? 'Hold [E] and turn your view slowly to wind the dial up; let go in the green band' : '');
    return m;
  },
});
