// Assistant Chief Engineer: compile fault list for the Chief. Five fault tags come off the test log. Each tag is as loud as the alarm that raised
// it, but the severity is in the test-log line: margin left. Under 20% is critical (1), 20-50% major (2), over 50% minor (3). Choose the column
// by the margin, not the volume, and press Enter to file. A quiet drift filed as minor, or a loud one as critical, is a misfile.
import { define, machine, DIG, ENTER, ri, pick, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Compile fault list for the Chief', type: 'task:shakedown' },
  title: 'File faults by margin, not volume', dept: 'engineering', host: 'console', tool: 'Fault tags and test log',
  how: 'Each tag shows alarm volume, but the test-log line gives margin left. Under 20%: column 1; 20-50%: 2; over 50%: 3. Press the column, then Enter to file.',
  keys: ['1 critical / 2 major / 3 minor', 'Enter file the tag'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'file by margin', input: 'digits+enter',
    win: 'five fault tags filed into critical major or minor columns by the margin on the test log line, ignoring alarm loudness',
    fail: 'filing a tag by its alarm volume so a quiet low-margin drift lands under minor or a loud healthy one under critical',
    rule: 'Margin under 20% is critical, 20 to 50 major, over 50 minor. Loudness is a decoy. Pick the column, press Enter.' },
  rush: 'Sorted the list by which alarms were loudest and handed it to the Chief.',
  captions: { misfiled: 'Chief marks the list wrong' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, subs = ['Impulse coil', 'EPS tap 4', 'Damper bank', 'Coolant loop', 'Sensor bus', 'Aux pump', 'Gravity plate']; m.rounds = 5; m.round = 0; m.col = 0;
    m.tags = Array.from({ length: 5 }, (_, i) => { const mg = ri(r, 4, 85), loud = r() < 0.5 ? ri(r, 4, 5) : ri(r, 1, 2); return { n: subs[i], mg, loud, ans: mg < 20 ? 1 : mg <= 50 ? 2 : 3 }; });
    m.key = (code, down = true) => { if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= 3) { m.col = d; return true; }
      if (ENTER(code)) { const t = m.tags[m.round]; if (m.col !== t.ans) { m.fault('misfiled'); m.col = 0; } else { m.round++; m.col = 0; if (m.round >= 5) m.win(); } return true; } return false; };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => (m.round < 5 ? [['Digit' + m.tags[m.round].ans, true], ['Enter', true]] : []);
    m.bad = () => { const t = m.tags[Math.min(m.round, 4)]; m.col = (t.ans % 3) + 1; return 'Enter'; };
    m.view = () => ({ tags: m.tags.map(t => [t.mg, t.loud]) });
    m.buttons = () => [['Digit1', '1 crit'], ['Digit2', '2 major'], ['Digit3', '3 minor'], ['Enter', 'File']];
    m.draw = (c) => { const t = m.tags[Math.min(m.round, 4)]; box(c, 14, 12, 250, 90, COL.panel, COL.peri); txt(c, `${m.round + 1}/5  ${t.n}`, 24, 34, { size: 14 });
      txt(c, 'alarm ' + '▮'.repeat(t.loud) + '▯'.repeat(5 - t.loud), 24, 60, { size: 13, col: COL.warn }); txt(c, `test log: margin left ${t.mg}%`, 24, 86, { size: 13, col: COL.pale });
      ['1 Critical', '2 Major', '3 Minor'].forEach((s, i) => { box(c, 280, 12 + i * 32, 108, 26, COL.panel, m.col === i + 1 ? COL.gold : COL.dim); txt(c, s, 290, 30 + i * 32, { size: 12, col: m.col === i + 1 ? COL.gold : COL.ink }); }); };
    return m;
  },
});
