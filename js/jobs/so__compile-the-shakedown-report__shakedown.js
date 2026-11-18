// Second officer: compile the shakedown report. Go down the trial checklist line by line. A passed test is skipped (Enter). A failed test
// goes into the faults section with its reading, but first look it up in the previous shakedown report on the right: key how many times it
// has now failed (1 if it is new, the old count plus one if it is a repeat), then Space copies the line. When the checklist is done, Enter
// saves the report. Leaving out a fault, copying a pass, or a wrong repeat count is a fault.
import { define, machine, DIG, SPACE, ENTER, shuffle, ri, txt, box, COL } from './kit.js';

const TESTS = [['Warp coil ramp', 'Eng'], ['Shield emitter cycle', 'Tac'], ['Pattern buffer lock', 'Ops'], ['Lateral sensor sweep', 'Sci'], ['Biobed self-test', 'Med'],
  ['RCS pulse lag', 'Helm'], ['Scrubber flow', 'Eng'], ['Hold seal sensor', 'Ops'], ['Phaser capacitor bleed', 'Tac'], ['Deflector dish trim', 'Eng']];

export default define({
  job: { billet: 'so', label: 'Compile the shakedown report', type: 'task:shakedown' },
  title: 'Shakedown report repeat tally', dept: 'command', host: 'console', tool: 'Report template, trial checklist and archive folder',
  how: 'Skip passed tests; for each failed test find it in the previous report, key how many times it has now failed, then copy it into the faults section; save at the end.',
  keys: ['Enter skip a pass / save', '1 – 9 times failed', 'Space copy the fault'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'tally repeats', input: 'digits+space+enter', win: 'every failed trial test copied into the report with its reading and its correct running count from the previous archive',
    fail: 'leaving a fault out, copying a passed test, or entering a repeat count that does not match the old report',
    rule: 'For each checklist line: pass → Enter. Fail → key its failure count (old ×n plus one, or 1 if absent from the old report), then Space to copy. Enter saves.' },
  rush: 'Pasted last cruise\'s report under a new date and saved it.',
  captions: { 'fault left out': 'page turns', 'pass copied': 'eraser rub', 'wrong count': 'pencil scratch', 'count first': 'console bloop' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, pool = shuffle(r, TESTS), cur = pool.slice(0, 6), nFail = ri(r, 3, 4), fails = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, nFail));
    const prev = new Map(); shuffle(r, cur.filter((_, i) => fails.has(i))).slice(0, ri(r, 1, 3)).forEach(t => prev.set(t[0], ri(r, 1, 3)));
    pool.slice(6, 6 + ri(r, 1, 3)).forEach(t => prev.set(t[0], ri(r, 1, 2))); cur.filter((_, i) => !fails.has(i)).slice(0, 1).forEach(t => prev.set(t[0], 1));
    m.prev = shuffle(r, [...prev.entries()]);
    m.lines = cur.map(([t, d], i) => ({ t, d, fail: fails.has(i), reading: fails.has(i) ? `${ri(r, 11, 97)}${['%', ' ms', ' K', ' err'][ri(r, 0, 3)]}` : 'in limits', want: fails.has(i) ? (prev.get(t) || 0) + 1 : 0, n: 0, done: '' }));
    m.li = 0; m.rounds = 6; m.round = 0;
    const L = () => m.lines[m.li];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), x = L();
      if (ENTER(code)) { if (!x) { m.win(); return true; } if (x.fail) { m.fault('fault left out'); return true; } x.done = 'skip'; m.li++; m.round++; return true; }
      if (!x) return !!d || SPACE(code);
      if (d) { x.n = d; return true; }
      if (SPACE(code)) {
        if (!x.fail) { m.fault('pass copied'); return true; } if (!x.n) { m.fault('count first'); return true; }
        if (x.n !== x.want) { m.fault('wrong count'); x.n = 0; return true; }
        x.done = 'copy'; m.li++; m.round++; return true;
      }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const x = L(); if (!x) return [['Enter', true]]; if (!x.fail) return [['Enter', true]]; if (x.n !== x.want) return [['Digit' + x.want, true]]; return [['Space', true]]; };
    m.bad = () => { const x = L(); return !x ? null : x.fail ? 'Enter' : 'Space'; };
    m.view = () => ({ l: m.lines.map(x => [x.t, x.fail, x.want]), prev: m.prev });
    m.buttons = () => [['Enter', 'Skip / save'], ['Space', 'Copy fault'], ...[1, 2, 3, 4].map(k => ['Digit' + k, `×${k}`])];
    m.draw = (c, W, H, P) => {
      txt(c, 'TRIAL CHECKLIST', 10, 13, { size: 9, col: COL.gold });
      m.lines.forEach((x, i) => {
        const y = 18 + i * 22, curr = i === m.li; box(c, 6, y, 238, 20, curr ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', curr ? COL.orange : null, 6);
        txt(c, `${x.fail ? '✗' : '✓'} ${x.t} (${x.d})`, 12, y + 14, { size: 10, col: x.fail ? COL.warn : COL.pale });
        txt(c, x.done === 'copy' ? `→ ×${x.n}` : x.done === 'skip' ? '—' : curr && x.n ? `×${x.n}?` : x.reading, 238, y + 14, { size: 9, align: 'right', col: x.done ? P.good : COL.dim });
      });
      box(c, 252, 18, 142, 132, 'rgba(125,151,232,.1)', COL.peri, 6); txt(c, 'PREVIOUS REPORT · faults', 258, 32, { size: 9, col: COL.peri });
      m.prev.forEach(([t, n], k) => txt(c, `${t} ×${n}`, 258, 48 + k * 14, { size: 9, col: COL.ink }));
      if (m.li >= m.lines.length) txt(c, 'Checklist done: Enter saves to the archive folder.', 10, 164, { size: 10, col: COL.warn });
    };
    return m;
  },
});
