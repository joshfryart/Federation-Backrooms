// Damage control: seal-check the sickbay isolation doors. Hold E on the latch wheel and spin it shut by turning the view the way the
// wheel's arrow points; the seal gauge climbs as the dogs bite. Let go with the needle in the band and the isolation lamp is tested. If the
// lamp stays dark the gasket has not seated: spin the wheel back open past the low mark, then close it again. Over-spinning crushes the gasket,
// letting go short of the band leaves the door unsealed, and re-latching a dark-lamp door without reopening it are faults.
import { define, machine, room, rf, pick, shuffle, clamp } from './kit.js';

const BAND = [0.65, 0.8];
export default define({
  job: { billet: 'dc', label: 'Seal-check sickbay isolation doors', type: 'task:medical_relief' },
  title: 'Isolation door wheel and lamp check', dept: 'engineering', host: 'room', siteName: 'Isolation door', verb: 'Seal',
  how: 'Hold E and turn the view the way the wheel arrow points to spin the latch shut; let go with the seal gauge in its band. If the isolation lamp stays dark, spin it back open below the low mark and close it again.',
  keys: ['E hold + turn with the arrow: close', 'E hold + turn against it: open', 'let go: test the lamp'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'wheel shut', input: 'e-hold+swing', win: 'every isolation door wheeled shut into the seal band with its lamp lit, dark-lamp doors reopened and reseated',
    fail: 'crushing the gasket by over-spinning, releasing the wheel short of the band, or relatching a dark-lamp door without reopening it',
    rule: 'With E held, turning in the wheel arrow direction raises the seal gauge and turning against it lowers it. Release inside the band to test the lamp. A dark lamp means unwind below the low mark first, then close again.' },
  rush: 'Pushed the doors shut and ticked them sealed on the log.',
  captions: { 'crushed gasket': 'rubber squeals', unsealed: 'door sighs', 'dark lamp': 'lamp stays dark', lit: 'isolation lamp on' },
  says: { 'crushed gasket': 'Too far — the gasket is crushed. Back the wheel off into the band.', unsealed: 'Not enough — the seal gauge was short of the band.', 'dark lamp': 'The lamp is still dark. Unwind the wheel fully, then close it again.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Isolation door A', prop: 'airlock_doors' }, { name: 'Isolation door B', prop: 'biobed' }]), r = m.rnd;
    const darkOne = new Set(shuffle(r, [0, 1]).slice(0, r() < 0.5 ? 1 : 2)), crush = m.calm ? 0.92 : 0.88;
    m.d = m.sites.map((_, i) => ({ dir: pick(r, [1, -1]), k: rf(r, 0.28, 0.4), ang: 0, dark: darkOne.has(i), flag: false, reseat: false }));
    const gauge = (d) => clamp(d.ang * d.k, 0, 1);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, d = m.d[i];
      if (inp.hold) { d.ang = Math.max(0, d.ang - d.dir * (inp.swing || 0) * dt); if (gauge(d) > crush) { m.fault('crushed gasket'); d.ang = 0.5 / d.k; } if (d.flag && gauge(d) < 0.15) { d.reseat = true; d.flag = false; } }
      if (rel) { const g = gauge(d);
        if (g >= BAND[0] && g <= BAND[1]) { if (d.dark && !d.reseat) { if (d.flag) m.fault('dark lamp'); else { d.flag = true; m.ev('dark lamp', { site: i }); } } else { m.ev('lit', { site: i }); m.finish(i); return; } }
        else if (g > 0.15 && g < BAND[0]) m.fault('unsealed'); }
      s.prog = s.done ? 1 : clamp(gauge(d) / BAND[1] * (d.reseat ? 0.9 : 0.6), 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.d[i], g = gauge(d), close = -1.5 * d.dir;
      if (d.flag) return { at: i, hold: true, swing: -close }; if (g < 0.72) return { at: i, hold: true, swing: close }; return { at: i, hold: false, swing: 0 }; };
    m.bad = () => { const d = m.d[m.next]; return { at: m.next, hold: true, swing: -1.5 * d.dir }; };
    m.view = () => ({ d: m.d.map(d => [d.dir, +d.k.toFixed(2), d.dark]) });
    m.panel = (i) => { const d = m.d[i]; return d ? { label: `Wheel closes ${d.dir > 0 ? 'clockwise ⟳ (turn right)' : 'anticlockwise ⟲ (turn left)'} · lamp ${d.flag ? 'DARK' : 'off'}`, value: `${Math.round(gauge(d) * 100)} % seal`, bar: gauge(d), band: BAND } : null; };
    m.prompt = (i) => { const d = m.d[i]; return !d ? '' : d.flag ? 'Lamp dark: hold [E] and spin the wheel back open below the low mark' : 'Hold [E] and turn with the wheel arrow; let go inside the band'; };
    return m;
  },
});
