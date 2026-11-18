// Second officer: run the system test checklist with each department. Enter calls the next department to start its test; its board light
// goes to TESTING. The department often says "looks like a pass" before the light has changed: ignore the voice and wait for the light. Mark
// 1 pass on a green light; on a red one mark 2 fail and then key the reading they report (one digit) beside it. Marking on the voice alone,
// marking the wrong result or writing the wrong number is a fault.
import { define, machine, DIG, ENTER, shuffle, ri, rf, pick, txt, box, lamp, COL } from './kit.js';

const TESTS = [['Engineering', 'Warp field coil ramp', 'coil temp'], ['Tactical', 'Shield emitter cycle', 'cycle time'], ['Operations', 'Transporter pattern lock', 'lock drift'],
  ['Science', 'Sensor array sweep', 'gain loss'], ['Medical', 'Biobed monitor self-test', 'channel errors'], ['Helm', 'RCS thruster pulse', 'pulse lag']];

export default define({
  job: { billet: 'so', label: 'Run the system test checklist with each department', type: 'task:shakedown' },
  title: 'Test checklist: trust the light', dept: 'command', host: 'console', tool: 'System test checklist, comm and status lights',
  how: 'Call each department to run its test, wait for its status light to change whatever they say, then mark pass or fail and write down the reading on a fail.',
  keys: ['Enter call next department', '1 pass', '2 fail', 'then 1 – 9 the reading'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'test and record', input: 'enter+digits', win: 'every department test marked from its status light, with the reported reading written beside each fail',
    fail: 'marking a pass on the department\'s word while the light still reads testing, or a fail without its reading',
    rule: 'Enter starts a test. While the light says TESTING do nothing, even if they call it a pass. Green → 1. Red → 2, then press the digit of the reading they give.' },
  rush: 'Asked each department "all good?" and ticked every line.',
  captions: { 'took their word': 'checklist scratch', 'wrong mark': 'console bloop', 'wrong reading': 'pencil scratch' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tests = shuffle(r, TESTS).slice(0, 4), nFail = ri(r, 1, 2), fails = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, nFail));
    m.lines = tests.map(([d, t, q], i) => ({ d, t, q, fail: fails.has(i), reading: ri(r, 1, 9), dur: rf(r, 1.0, 2.0), early: r() < 0.7, start: -1, mark: 0, wrote: 0 }));
    m.li = 0; m.rounds = 4; m.round = 0;
    const L = () => m.lines[m.li], settled = (x) => x.start >= 0 && m.t - x.start >= x.dur;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const x = L(); if (!x) return false; const d = DIG(code);
      if (ENTER(code)) { if (x.start < 0) { x.start = m.t; m.ev('call', { d: x.d }); } return true; }
      if (!d) return false; if (x.start < 0) return true;
      if (x.mark === 2 && !x.wrote) { if (d !== x.reading) { m.fault('wrong reading'); return true; } x.wrote = d; m.li++; m.round++; if (m.li >= 4) m.win(); return true; }
      if (d > 2) return true; if (!settled(x)) { m.fault('took their word'); return true; }
      if ((d === 2) !== x.fail) { m.fault('wrong mark'); return true; }
      x.mark = d; if (d === 1) { m.li++; m.round++; if (m.li >= 4) m.win(); } return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const x = L(); if (!x) return []; if (x.start < 0) return [['Enter', true]]; if (!settled(x)) return []; if (x.mark === 2) return [['Digit' + x.reading, true]]; return [[x.fail ? 'Digit2' : 'Digit1', true]]; };
    m.bad = () => { const x = L(); return !x ? null : x.start < 0 ? 'Enter' : 'Digit1'; };
    m.view = () => ({ l: m.lines.map(x => [x.d, x.fail, x.reading]) });
    m.buttons = () => [['Enter', 'Call next'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => ['Digit' + k, String(k)])];
    m.draw = (c, W, H, P) => {
      m.lines.forEach((x, i) => {
        const y = 8 + i * 30, cur = i === m.li, st = x.start < 0 ? 'idle' : !settled(x) ? 'test' : x.fail ? 'red' : 'green';
        box(c, 6, y, W - 12, 26, cur ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', cur ? COL.orange : null, 8);
        lamp(c, 20, y + 13, 8, st === 'green' ? P.good : st === 'red' ? P.bad : st === 'test' ? COL.warn : '#2a2748', st === 'green' ? 'circle' : st === 'red' ? 'square' : st === 'test' ? 'triangle' : 'circle');
        txt(c, `${x.d}: ${x.t}`, 34, y + 12, { size: 10, col: COL.gold }); txt(c, st === 'idle' ? 'not called' : st === 'test' ? 'TESTING' : st === 'red' ? `FAIL · ${x.q} ${x.reading}` : 'PASS', 34, y + 23, { size: 9, col: st === 'red' ? COL.warn : COL.pale });
        txt(c, x.mark === 1 ? '✓ pass' : x.mark === 2 ? (x.wrote ? `✗ fail, ${x.q} ${x.wrote}` : '✗ fail, reading?') : '', W - 12, y + 17, { size: 10, align: 'right', col: x.mark === 1 ? P.good : COL.warn });
      });
      const x = L(); let say = '';
      if (x && x.start >= 0) say = !settled(x) ? (x.early && m.t - x.start > x.dur * 0.4 ? `${x.d}: "Looks like a pass from here."` : `${x.d}: "Running it now…"`) : x.fail ? `${x.d}: "It failed, ${x.q} read ${x.reading}."` : `${x.d}: "Clean pass."`;
      txt(c, say, 10, 136, { size: 11, col: COL.ink });
    };
    return m;
  },
});
