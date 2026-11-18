// Environmental tech: life support sweep. At each vent grille hold E (palm to the grille) until the airflow reads. The panel then shows that
// zone's flow against its target AND the CO2 trend from the terminal. Only a zone whose CO2 is climbing gets its fan dial stepped up: tap E once
// per missing step and stop. Stepping a fan whose CO2 trend is flat is a blind reset; stepping past the target makes a draught.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Life support sweep', type: 'loop' },
  title: 'Vent palm read and fan steps', dept: 'engineering', host: 'room', item: 'tricorder_atmo', siteName: 'Vent', verb: 'Feel',
  how: 'Hold E at each vent grille to feel the airflow. If that zone\'s CO2 trend is climbing, tap E once per fan step it is short; if the CO2 is flat, leave the fan alone.',
  keys: ['E hold: feel the airflow', 'E tap: one fan step'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'step the fan', input: 'e-hold+e-tap', win: 'every climbing-CO2 zone stepped exactly up to its flow target and every steady zone left untouched',
    fail: 'stepping a fan on a zone whose CO2 trend was flat, or stepping past the target into a draught',
    rule: 'Hold E at the grille until the flow reads. CO2 climbing: tap E once per missing fan step and then wait. CO2 flat: do nothing and the vent signs off.' },
  rush: 'Cranked every fan up a notch on the way past and never looked at the CO2 trend.',
  captions: { 'blind reset': 'fan whines up', draught: 'grille rattles' },
  says: { 'blind reset': 'Blind reset: that zone\'s CO2 was flat. Check the trend before touching the fan.', draught: 'Too far: the zone is past its flow target and the grille is whistling.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Junction vent A', prop: 'scrubber' }, { name: 'Junction vent B', prop: 'fumehood' }, { name: 'Junction vent C', prop: 'heatexch' }, { name: 'Junction vent D', prop: 'airlock_doors' }]), r = m.rnd;
    const settle = m.calm ? 1.0 : 0.8;
    let lows = ri(r, 2, 3); m.zones = m.sites.map((_, i) => { const low = lows > 0 && (r() < 0.6 || 4 - i <= lows); if (low) lows--; return { feel: 0, low, short: low ? ri(r, 1, 3) : 0, steps: 0, quiet: 0, co2: low ? 'climbing' : 'flat' }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); const rel = m.released(inp); if (!s) return; const i = m.next, z = m.zones[i];
      if (z.feel < 1) { if (inp.hold) z.feel = Math.min(1, z.feel + dt / 1.1); else z.feel = Math.max(0, z.feel - dt); s.prog = z.feel * 0.4; if (z.feel >= 1) z.quiet = -0.4; return; }
      if (inp.press && z.quiet >= 0) {
        if (!z.low) { m.fault('blind reset'); z.quiet = 0; return; }
        z.steps++; z.quiet = 0; if (z.steps > z.short) { m.fault('draught'); z.steps = z.short; }
      } else if (!inp.hold) z.quiet += dt; else z.quiet = Math.min(z.quiet, 0);
      if (z.quiet >= settle && (!z.low || z.steps >= z.short) && rel === false && !inp.hold) m.finish(i);
      s.prog = s.done ? 1 : clamp(0.4 + (z.low ? z.steps / z.short : z.quiet / settle) * 0.5, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const z = m.zones[i]; if (z.feel < 1) return { at: i, hold: true }; if (z.low && z.steps < z.short && z.quiet >= 0) { const k = f % 8; return { at: i, hold: k < 2, press: k === 0 }; } return { at: i }; };
    m.bad = (f = 0) => { const i = m.next, z = m.zones[i]; if (!z || z.feel < 1) return { at: i, hold: true }; const k = f % 6; return { at: i, hold: k < 2, press: k === 0 }; };
    m.view = () => ({ z: m.zones.map(z => z.low ? z.short : 0) });
    m.panel = (i) => { const z = m.zones[i]; if (!z) return null; if (z.feel < 1) return { label: 'Palm at grille', value: 'feeling the draught', bar: z.feel }; const t = z.short + 3, now = 3 + z.steps - (z.low ? 0 : 0); return { label: `CO2 ${z.co2 === 'climbing' ? '▲ climbing' : '■ flat'}`, value: z.low ? `flow step ${now} / target ${t}` : 'flow on target', bar: z.low ? now / t : 1, band: [0.97, 1] }; };
    m.prompt = (i) => { const z = m.zones[i]; return !z ? '' : z.feel < 1 ? 'Hold [E] with your palm at the grille' : z.low ? (z.steps < z.short ? 'CO2 climbing: tap [E] once per fan step short' : 'On target: hands off') : 'CO2 flat: leave the fan alone'; };
    return m;
  },
});
