// Environmental tech: filter and panel maintenance (quiet watch). At each vent panel: back out the panel screws (tap E at each), hold the old
// cartridge up to the inspection light (look toward the light and tap E), then slot the new cartridge. The cartridge's flow arrow turns with
// your view: line it up with the airflow arrow on the duct and tap E to slide it home. Slotted backwards, the air bypasses it.
import { define, machine, room, pick, ri, clamp } from './kit.js';

const aim = (look, want, tol) => Math.abs((look || 0) - want) < tol;
export default define({
  job: { billet: 'env', label: 'Filter and panel maintenance', type: 'task:quiet_watch' },
  title: 'Filter arrow with the airflow', dept: 'engineering', host: 'room', item: 'toolbag', siteName: 'Vent panel', verb: 'Refit',
  how: 'Tap E to back out each panel screw, look toward the inspection light and tap E to check the old filter, then turn your view until the new cartridge\'s arrow matches the duct airflow and tap E to slot it.',
  keys: ['E tap: screw / inspect / slot', 'look: aim the light, turn the cartridge'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'orient the cartridge', input: 'e-tap+look', win: 'every vent refitted with a fresh cartridge slotted with its arrow along the airflow after the old one was held to the light',
    fail: 'slotting a cartridge backwards or edge-on so the air bypasses it, or refitting before checking the old filter',
    rule: 'Looking left turns the cartridge arrow to point left, looking right turns it right; straight ahead it is edge-on. Match the duct arrow on the panel and tap E.' },
  rush: 'Shoved new filters in whichever way they came out of the box and screwed the panels back on.',
  captions: { backwards: 'duct whistles', 'edge-on': 'cartridge jams', unchecked: 'tool clatter' },
  says: { backwards: 'Backwards: the arrow is against the airflow, so the air goes round it. Turn your view the other way.', 'edge-on': 'Edge-on: it will not slot. Turn your view left or right to swing the arrow round.', unchecked: 'Check the old filter against the light first.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Scrubber vent panel', prop: 'scrubber' }, { name: 'Duct vent panel', prop: 'fumehood' }, { name: 'Exchanger vent panel', prop: 'heatexch' }]), r = m.rnd, tol = m.calm ? 0.2 : 0.14;
    m.v = m.sites.map(() => ({ screws: ri(r, 2, 4), out: 0, light: pick(r, [0.35, -0.35]), seen: false, flow: pick(r, [1, -1]), clog: ri(r, 40, 95) }));
    m.arrow = (look) => (look || 0) > 0.15 ? 1 : (look || 0) < -0.15 ? -1 : 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, v = m.v[i]; m.lk = inp.look || 0;
      if (inp.press) {
        if (v.out < v.screws) v.out++;
        else if (!v.seen) { if (aim(inp.look, v.light, tol)) v.seen = true; }
        else { const a = m.arrow(inp.look); if (a === v.flow) m.finish(i); else m.fault(a === 0 ? 'edge-on' : 'backwards'); }
      }
      s.prog = s.done ? 1 : clamp((v.out / v.screws) * 0.4 + (v.seen ? 0.3 : 0), 0, 0.95);
    };
    m.want = () => { const v = m.v[m.next]; return !v ? 0 : v.out < v.screws ? 0 : !v.seen ? v.light : v.flow * 0.3; };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const k = f % 8; return { at: i, look: m.want(), press: k === 0, hold: k < 2 }; };
    m.bad = (f = 0) => { const i = m.next, v = m.v[i]; const k = f % 8; return { at: i, look: v && v.seen ? -v.flow * 0.3 : m.want(), press: k === 0, hold: k < 2 }; };
    m.view = () => ({ v: m.v.map(v => [v.screws, v.light, v.flow]) });
    m.panel = (i) => {
      const v = m.v[i]; if (!v) return null; if (v.out < v.screws) return { label: 'Panel screws', value: `${v.out} / ${v.screws} in the tray`, bar: v.out / v.screws };
      if (!v.seen) return { label: `Light is to your ${v.light > 0 ? 'LEFT' : 'RIGHT'}`, value: 'hold the old filter up to it', bar: 0.4 };
      return { label: `Duct airflow ${v.flow > 0 ? '◀ left' : 'right ▶'}`, value: `cartridge ${['right ▶', 'edge-on', '◀ left'][m.arrow(m.lk) + 1]} · old one ${v.clog} % clogged`, bar: 0.7 };
    };
    m.prompt = (i) => { const v = m.v[i]; if (!v) return ''; if (v.out < v.screws) return 'Tap [E] to back out each screw'; if (!v.seen) return 'Look toward the inspection light and tap [E]'; return 'Turn your view until the cartridge arrow matches the airflow, then tap [E]'; };
    return m;
  },
});
