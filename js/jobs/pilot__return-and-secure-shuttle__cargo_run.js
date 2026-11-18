// Pilot: return and secure the shuttle. The lock-up that gets half done: the door is shut but the security bar never goes on. Hold the bay
// door control through red and amber until the interlock lamp turns green (let go early and the door rolls back: a fault). From that moment
// the interlock only holds for a short while on its own: lift the security bar off its rack and swing it across (hold E and sweep your view
// to the right), then hook it on the swaying latch by tapping E with the hook in your sights. Too slow and the interlock relaxes: bar left off.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'pilot', label: 'Return and secure shuttle', type: 'task:cargo_run' },
  title: 'Door green, bar across, hook on', dept: 'flight', host: 'room', siteName: 'Step', verb: 'Secure',
  how: 'Door control: hold E until the lamp is green, then let go. Bar rack: hold E and sweep your view to the right to swing the bar across. Latch: aim at the swaying hook and tap E. Do the bar before the interlock relaxes.',
  keys: ['E hold: door / bar', 'sweep right: swing bar', 'E tap: hook on'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'bar the door', input: 'e-hold+e-tap+swing+look',
    win: 'bay door held to a green interlock, then the security bar swung across and hooked on its swaying latch before the interlock relaxes',
    fail: 'letting go of the door control before green, knocking the bar back, missing the hook, or leaving the bar off until the interlock relaxes',
    rule: 'Hold E on the door control until GREEN; at the rack hold E and sweep right to swing the bar; at the latch tap E when your aim is on the swaying hook, all inside the interlock time.' },
  rush: 'Shut the bay door and left the security bar on its rack.',
  captions: { 'not sealed': 'door rolls back', 'bar knocked': 'bar clangs', 'missed hook': 'bar scrapes', 'bar left off': 'interlock chime' },
  says: { 'not sealed': 'Let go before green: the door rolled back open.', 'bar left off': 'The interlock relaxed with no bar on. Get the bar across quicker.', 'missed hook': 'Missed the hook: aim on it as it swings, then tap.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bay door control', prop: 'baycontrol' }, { name: 'Security bar rack', prop: 'shelving' }, { name: 'Door latch hook', prop: 'airlock_doors' }]), r = m.rnd;
    const HOLDT = m.calm ? 22 : 15, tol = m.calm ? 0.11 : 0.08;
    m.d = { press: 0, green: +rf(r, 1.4, 2.0).toFixed(2), arc: 0, need: +rf(r, 1.0, 1.4).toFixed(2), amp: +rf(r, 0.18, 0.3).toFixed(2), w: +rf(r, 1.6, 2.4).toFixed(2), clock: -1, ht: 0 };
    const d = m.d, hook = () => d.amp * Math.sin(d.w * d.ht), lampOf = () => d.press >= d.green ? 'GREEN' : d.press >= 0.6 ? 'AMBER' : 'RED';
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; if (d.clock >= 0) { d.clock += dt; if (d.clock > HOLDT) { m.fault('bar left off'); d.clock = 0; } }
      d.ht += dt; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.hold) d.press += dt; if (rel) { if (d.press >= d.green) { d.clock = 0; m.finish(0); return; } if (d.press > 0.1) m.fault('not sealed'); d.press = 0; } s.prog = clamp(d.press / d.green) * 0.9; }
      else if (i === 1) { if (inp.hold) { const sw = inp.swing || 0; if (sw > 1) { m.fault('bar knocked'); d.arc = 0; } else d.arc += Math.max(0, -sw) * dt; if (d.arc >= d.need) { m.finish(1); return; } } s.prog = clamp(d.arc / d.need) * 0.9; }
      else { m.aim = inp.look || 0; if (inp.press) { if (Math.abs(m.aim - hook()) < tol) { m.ev('hooked'); d.clock = -1; m.finish(2); return; } m.fault('missed hook'); } }
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 };
      if (i === 0) return { at: 0, hold: d.press < d.green + 0.05 };
      if (i === 1) return { at: 1, hold: true, swing: -1.2 };
      return { at: 2, look: hook(), press: f % 3 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 20 < 10, swing: 2, look: 0.5, press: f % 4 === 0 });
    m.view = () => ({ green: d.green, need: d.need, amp: d.amp, w: d.w });
    m.panel = (i) => i === 0 ? { label: 'Interlock', value: lampOf(), bar: clamp(d.press / d.green), band: [0.99, 1] }
      : i === 1 ? { label: 'Bar swing', value: `${Math.round(clamp(d.arc / d.need) * 100)} %`, bar: clamp(d.arc / d.need) }
      : i === 2 ? { label: 'Hook', value: Math.abs((m.aim || 0) - hook()) < tol ? 'ON THE HOOK' : 'off', bar: clamp(0.5 + hook()), band: [clamp(0.5 + (m.aim || 0) - tol), clamp(0.5 + (m.aim || 0) + tol)] } : null;
    m.prompt = (i) => { const left = d.clock >= 0 ? ` (interlock ${Math.max(0, Math.ceil(HOLDT - d.clock))} s)` : '';
      return i === 0 ? (lampOf() === 'GREEN' ? 'GREEN: let go of [E]' : 'Hold [E] on the door control until the lamp is green') : i === 1 ? 'Hold [E] and sweep your view right to swing the bar across' + left : i === 2 ? 'Aim at the swaying hook and tap [E]' + left : ''; };
    return m;
  },
});
