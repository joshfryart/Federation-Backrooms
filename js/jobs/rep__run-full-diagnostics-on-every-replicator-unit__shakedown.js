// Replicator tech: run full diagnostics on every replicator unit. Hold Down for the test button until every LED goes steady: a slow fault only shows
// by turning one LED red after a long flicker. Let go on steady, note the fault code (Enter) if an LED is red, then Right moves the rig on to the next unit.
import { define, machine, ENTER, ARROW, ri, rf, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Run full diagnostics on every replicator unit', type: 'task:shakedown' },
  title: 'Hold the test till steady', dept: 'services', host: 'console', tool: 'Test rig',
  how: 'Hold Down on the test button until all four LEDs are steady. Let go. If an LED is red press Enter to note the code. Then press Right to move the rig to the next unit.',
  keys: ['Down hold: test button', 'Enter note code', 'Right next unit'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'hold test steady', input: 'arrows-hold+enter', win: 'four units each tested with the button held until every LED was steady, any red LED noted and the rig moved on',
    fail: 'releasing the button while an LED still flickers, moving on with a red LED un-noted or before the test finished',
    rule: 'Hold Down while LEDs settle one by one. A slow fault flickers longer and ends red. Release only when all are steady, Enter to note a red, Right to go on.' },
  rush: 'Pressed the test button once per unit and moved down the line.',
  captions: { 'released early': 'test rig drops out', 'skipped note': 'fault code card rustles', 'skipped unit': 'rig clatters', 'false note': 'dull double tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, slow = m.calm ? 1.6 : 2.2; m.k = 0; m.h = 0; m.done = false; m.noted = false; m.rounds = 4; m.round = 0;
    const redUnits = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.units = [0, 1, 2, 3].map(i => ({ red: redUnits.has(i), t: [0, 1, 2, 3].map(() => rf(r, 0.3, 0.9)), slowLed: ri(r, 0, 3) }));
    const U = () => m.units[Math.min(m.k, 3)];
    m.led = (j) => { const u = U(), at = (u.red && j === u.slowLed) ? slow : u.t[j]; return m.h >= at ? (u.red && j === u.slowLed ? 'red' : 'steady') : 'flicker'; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!ENTER(code) && a !== 'D' && a !== 'R') return false;
      if (a === 'D') { if (!down && m.held.D && !m.done) { if (m.h > 0.1) m.fault('released early'); m.h = 0; } m.held.D = down; return true; } if (!down) return true; const u = U();
      if (ENTER(code)) { if (m.done && u.red && !m.noted) m.noted = true; else m.fault('false note'); }
      else if (!m.done) m.fault('skipped unit'); else if (u.red && !m.noted) m.fault('skipped note'); else { m.k++; m.round = m.k; m.h = 0; m.done = false; m.noted = false; m.held.D = false; if (m.k >= 4) m.win(); }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.D && !m.done) { m.h += dt; if ([0, 1, 2, 3].every(j => m.led(j) !== 'flicker')) m.done = true; } };
    m.hint = () => { const u = U(); if (!u) return []; if (!m.done) return [['ArrowDown', true]]; return [['ArrowDown', false], [u.red && !m.noted ? 'Enter' : 'ArrowRight', true]]; };
    m.bad = () => 'ArrowRight';
    m.view = () => ({ units: m.units.map(u => [u.red, u.slowLed, u.t.map(x => +x.toFixed(2))]) });
    m.buttons = () => [['ArrowDown', 'Test (hold)'], ['Enter', 'Note code'], ['ArrowRight', 'Next unit']];
    m.draw = (c, W, H, P) => {
      txt(c, `Unit ${Math.min(m.k + 1, 4)} / 4`, 14, 22, { size: 14, col: COL.gold });
      [0, 1, 2, 3].forEach(j => { const s = m.led(j); lamp(c, 50 + j * 70, 70, 18, !m.held.D && !m.done ? 'rgba(255,255,255,.1)' : s === 'red' ? P.bad : s === 'steady' ? P.good : COL.warn, s === 'red' ? 'triangle' : s === 'steady' ? 'circle' : 'diamond'); txt(c, m.held.D || m.done ? s : '-', 30 + j * 70, 108, { size: 11, col: COL.dim }); });
      txt(c, m.done ? (U().red ? (m.noted ? 'code noted: Right' : 'RED: note the code (Enter)') : 'all steady: Right') : m.held.D ? 'testing...' : 'hold Down to test', 14, 146, { size: 12, col: COL.dim });
    };
    return m;
  },
});
