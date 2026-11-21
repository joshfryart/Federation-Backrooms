// Galley: test the backup manual stove. Three steps at three spots. Cylinder valve: hold E to open it slowly and let go with the gauge in the
// green band (past the leak line it vents and you start again). Striker: tap E on the spark flash only. Pot: a boil time is on the test sheet; hold
// E for that many seconds with no clock to watch, and let go on the count. Each miss is a fault.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Test galley backups: manual stoves and spare stock', type: 'task:shakedown' },
  title: 'Valve, spark and counted boil', dept: 'services', host: 'room', siteName: 'Stove step', verb: 'Test',
  how: 'Valve: hold E and let go with the gauge in the green band, never past the leak line. Striker: tap E while the spark flashes. Pot: hold E for the sheet boil time by feel, then let go.',
  keys: ['E hold: open the valve / time the boil', 'E tap: strike on the flash'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'light and time', input: 'e-hold+e-tap', win: 'the manual stove lit by opening the cylinder valve to the safe band, striking on the spark flash, and a boil timed to the test sheet with no clock',
    fail: 'venting gas past the leak line, striking off the flash, or letting the pot go before or after the sheet boil time',
    rule: 'Valve: hold E, release inside the green gauge band. Striker: tap E only while the spark lamp flashes. Pot: the sheet gives seconds; hold E that long without a clock and release on your count.' },
  rush: 'Cracked the valve open, struck a match and let the pot sit until it looked done.',
  captions: { 'gas leak': 'gas hiss', 'low pressure': 'weak hiss', 'high pressure': 'roaring flame', 'dud strike': 'striker click', 'off count': 'pot rattles' },
  says: { 'gas leak': 'You held the valve past the leak line and it vented.', 'low pressure': 'Valve let go too low: the burner will not catch.', 'high pressure': 'Valve let go too high: the flame roars.', 'dud strike': 'No spark on that strike: wait for the flash.', 'off count': 'The boil was off the sheet time.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Gas cylinder valve', prop: 'workbench' }, { name: 'Striker and burner', prop: 'console' }, { name: 'Test pot', prop: 'shelving' }]), r = m.rnd, rate = m.calm ? 0.26 : 0.34, tol = m.calm ? 0.65 : 0.45;
    m.p = 0; m.T = rf(r, 3, 4.5); m.h = 0; m.band = [0.4, 0.58];
    const flash = () => m.t % 1.6 < (m.calm ? 0.55 : 0.4);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 1) { if (inp.press) { if (flash()) { m.finish(i); return; } m.fault('dud strike'); } s.prog = flash() ? 0.6 : 0.2; return; }
      if (inp.hold) { if (i === 0) { m.p += rate * dt; if (m.p > 0.75) { m.fault('gas leak'); m.p = 0; } } else m.h += dt; }
      if (rel) { if (i === 0 && m.p > 0) { const q = m.p; m.p = 0; if (q >= m.band[0] && q <= m.band[1]) { m.finish(i); return; } m.fault(q < m.band[0] ? 'low pressure' : 'high pressure'); }
        else if (i === 2 && m.h > 0.2) { const h = m.h; m.h = 0; if (Math.abs(h - m.T) <= tol) { m.finish(i); return; } m.fault('off count'); } }
      s.prog = s.done ? 1 : i === 0 ? clamp(m.p / 0.75) * 0.9 : 0.3;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: i, hold: m.p < 0.47 }; if (i === 1) return { at: i, press: flash() && f % 2 === 0 }; return { at: i, hold: m.h < m.T }; };
    m.bad = () => ({ at: Math.max(0, m.next), hold: true });
    m.view = () => ({ T: +m.T.toFixed(2) });
    m.panel = (i) => (i === 0 ? { label: 'Gas gauge', value: `${Math.round(m.p * 100)} %`, bar: m.p / 0.75, band: [m.band[0] / 0.75, m.band[1] / 0.75] } : i === 1 ? { label: 'Spark lamp', value: flash() ? 'FLASH' : 'dark', bar: flash() ? 1 : 0 } : i === 2 ? { label: `Sheet boil ${m.T.toFixed(1)} s`, value: 'count it yourself', bar: 0 } : null);
    m.prompt = (i) => (i === 0 ? 'Hold [E] to open the valve; let go in the green band' : i === 1 ? 'Tap [E] while the spark flashes' : 'Hold [E] for the sheet boil time, then let go');
    return m;
  },
});
