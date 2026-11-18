// Pilot: shuttlebay door and pressure check. A door can fail on its gauges, on its interlock or on its tether rack, and the gauge alone tells
// you nothing about the other two. At each door: hold the interlock test button long enough for the full lamp sequence (amber, then green, and
// it must STAY green), then give the door a verdict with a digit: 1 sound, 2 interlock fault, 3 pressure out of band, 4 tethers short.
// A verdict before the test has run is the classic gauge-only pass (a fault); a wrong verdict is a fault.
import { define, machine, ri, rf, pick, txt, box, bar, lamp, COL, DIG, SPACE } from './kit.js';

const DOORS = ['Main bay door', 'Aft personnel door', 'Cargo-side door'], LBL = ['', 'sound', 'interlock', 'pressure', 'tethers'];

export default define({
  job: { billet: 'pilot', label: 'Shuttlebay door and pressure check', type: 'loop' },
  title: 'Bay door interlock and tether verdict', dept: 'flight', host: 'console', tool: 'Bay door control and gauges',
  how: 'Hold Space to run the interlock test and watch the lamp: amber, then green, and it must stay green. Then read both gauges and the tether count and give a verdict: 1 sound, 2 interlock, 3 pressure, 4 tethers.',
  keys: ['Space hold: interlock test', '1 sound', '2 interlock', '3 pressure', '4 tethers'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'test then verdict', input: 'space-hold+digits',
    win: 'each bay door given the right one of four verdicts after a full interlock lamp sequence',
    fail: 'passing a door on its gauges before the interlock test has run, or naming the wrong defect',
    rule: 'Hold Space through the interlock test (amber, green, stays green), then press 1-4 for sound, interlock, pressure or tether count against the stock sheet.' },
  rush: 'Read the door gauge and walked on.',
  captions: { 'gauge only': 'buzzer', 'wrong verdict': 'buzzer', 'test cut short': 'relay clicks off' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, TEST = m.calm ? 1.2 : 1.5;
    m.doors = DOORS.map(name => {
      const fault = pick(r, [1, 1, 2, 3, 4]), lo = ri(r, 95, 99), hi = lo + ri(r, 4, 6), inP = ri(r, lo + 1, hi - 1), outP = fault === 3 ? pick(r, [lo - ri(r, 2, 5), hi + ri(r, 2, 5)]) : ri(r, lo + 1, hi - 1);
      const sheet = ri(r, 6, 10), rack = fault === 4 ? sheet - ri(r, 1, 2) : sheet;
      return { name, fault, band: [lo, hi], inP, outP, sheet, rack, lampKind: fault === 2 ? pick(r, ['stuck', 'relapse']) : 'ok', greenAt: rf(r, 0.45, 0.7) };
    });
    // a pressure fault shows on exactly one gauge: swap sides at random so both gauges must be read
    for (const d of m.doors) if (d.fault === 3 && r() < 0.5) { const t = d.inP; d.inP = d.outP; d.outP = t; }
    m.round = 1; m.rounds = DOORS.length; m.i = 0; m.hold = 0; m.tested = false; m.flash = 0;
    const d = () => m.doors[m.i];
    m.lamp = () => { if (m.hold <= 0 && !m.tested) return 'off'; const t = m.tested ? TEST : m.hold, g = d().greenAt, k = d().lampKind;
      if (t < g || k === 'stuck') return 'amber'; if (k === 'relapse' && t > g + 0.45) return 'amber'; return 'green'; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { if (down) m.held.S = true; else { if (m.held.S && !m.tested && m.hold > 0.05) { m.fault('test cut short'); } m.held.S = false; m.hold = 0; } return true; }
      const n = DIG(code); if (n < 1 || n > 4) return false; if (!down) return true;
      if (!m.tested) { m.fault('gauge only'); m.flash = 0.6; return true; }
      if (n !== d().fault) { m.fault('wrong verdict'); m.flash = 0.6; return true; }
      m.ev('door', { verdict: LBL[n] }); m.i++; m.tested = false; m.hold = 0; m.held.S = false; if (m.i >= m.doors.length) m.win(); else m.round = m.i + 1; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); if (m.held.S && !m.tested) { m.hold += dt; if (m.hold >= TEST) m.tested = true; } };
    m.hint = () => m.tested ? [['Space', false], ['Digit' + d().fault, true]] : [['Space', true]];
    m.bad = () => 'Digit1';
    m.view = () => ({ doors: m.doors.map(x => [x.fault, x.inP, x.outP, x.sheet, x.rack, x.lampKind]) });
    m.buttons = () => [['Space', 'Test (hold)'], ['Digit1', '1 sound'], ['Digit2', '2 interlock'], ['Digit3', '3 pressure'], ['Digit4', '4 tethers']];
    m.draw = (c, W, H, P) => {
      const x = d() || m.doors[m.doors.length - 1]; txt(c, x.name.toUpperCase(), 12, 18, { size: 12, col: COL.peri });
      const g = (lab, v, y) => { txt(c, `${lab} ${v} kPa`, 12, y, { size: 11, col: COL.pale }); bar(c, 130, y - 10, 150, 10, (v - 85) / 30, { band: [(x.band[0] - 85) / 30, (x.band[1] - 85) / 30] }); };
      g('Bay side', x.inP, 42); g('Door side', x.outP, 62);
      const L = m.lamp(); lamp(c, 330, 50, 18, L === 'green' ? P.good : L === 'amber' ? COL.warn : '#333', L === 'green' ? 'circle' : L === 'amber' ? 'triangle' : 'square');
      txt(c, L.toUpperCase(), 330, 84, { size: 10, col: COL.dim, align: 'center' });
      txt(c, 'Test', 12, 96, { size: 10, col: COL.dim }); bar(c, 50, 88, 150, 10, m.tested ? 1 : m.hold / TEST, { col: COL.lav });
      txt(c, m.tested ? 'test complete' : 'hold Space', 210, 97, { size: 10, col: COL.dim });
      box(c, 12, 110, W - 24, 34, 'rgba(255,255,255,.05)', null, 6);
      txt(c, `Tether rack: ${x.rack} on hooks   ·   stock sheet: ${x.sheet}`, 22, 131, { size: 12, col: COL.ink });
      if (m.flash > 0) txt(c, 'VERDICT REFUSED', W - 12, H - 10, { size: 11, col: P.bad, align: 'right' });
      txt(c, '1 sound  2 interlock  3 pressure  4 tethers', 12, H - 10, { size: 10, col: COL.dim });
    };
    return m;
  },
});
