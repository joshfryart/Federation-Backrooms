// Medtech: triage beds. Five patients wait in a row with a tag colour and vitals. Left/Right moves the cursor, Up puts the patient on a bed (only
// two free), Down sends them to the bench. Red tag OR heart rate 130+ OR SpO2 89- is critical, whatever the tag says; a critical left waiting too long fails.
import { define, machine, ARROW, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'medtech', label: 'Set up triage beds and sort incoming patients by urgency', type: 'task:medical_relief' },
  title: 'Bed or bench by the vitals', dept: 'medical', host: 'console', tool: 'Triage queue tablet',
  how: 'Left/Right to pick a patient. Up = free biobed, Down = waiting bench. Critical means red tag, or HR 130+, or SpO2 89 or lower. Two beds only, so do not waste one.',
  keys: ['Left/Right pick', 'Up bed', 'Down bench'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'bed or bench', input: 'arrows', win: 'both critical patients put on the two beds and the three minor patients sent to the bench',
    fail: 'a minor patient taking a bed, a critical one sent to the bench, or a critical left waiting past its timer',
    rule: 'Read tag and vitals for the picked patient. Critical = red tag or HR 130+ or SpO2 89-: press Up. Everyone else: press Down. A critical waits only about ten seconds.' },
  rush: 'Filled the beds with the first patients through the door and left the quiet ones to the bench unchecked.',
  captions: { 'bed wasted': 'bed taken by a minor case', 'left waiting': 'critical alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, ids = shuffle(r, [1, 2, 3, 4, 5]), wait = m.calm ? 17 : 12;
    m.p = ids.map((n, k) => { const crit = k < 2, tag = crit ? (k === 0 ? 'RED' : 'GREEN') : (r() < 0.5 ? 'YELLOW' : 'GREEN'); return { n, crit, tag, hr: crit && tag !== 'RED' ? ri(r, 131, 150) : ri(r, 70, 118), spo2: crit && tag !== 'RED' ? ri(r, 84, 89) : ri(r, 93, 99), placed: false }; });
    m.p = shuffle(r, m.p); m.cur = 0; const wl = () => m.p.filter(p => !p.placed);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); if (!a) return false; const w = wl(); if (!w.length) return true;
      if (a === 'L') m.cur = (m.cur + w.length - 1) % w.length; else if (a === 'R') m.cur = (m.cur + 1) % w.length;
      else { const p = w[m.cur % w.length]; if ((a === 'U') === p.crit) { p.placed = true; m.cur = 0; if (!wl().length) m.win(); } else m.fault(a === 'U' ? 'bed wasted' : 'left waiting'); }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.t > wait && wl().some(p => p.crit)) m.fail('left waiting'); };
    m.hint = () => { const w = wl(); if (!w.length) return []; const tgt = w.findIndex(p => p.crit), ix = tgt < 0 ? 0 : tgt, c = m.cur % w.length; return c === ix ? [[w[c].crit ? 'ArrowUp' : 'ArrowDown', true]] : [[c < ix ? 'ArrowRight' : 'ArrowLeft', true]]; };
    m.bad = () => { const w = wl(), p = w[m.cur % w.length]; return p ? [p.crit ? 'ArrowDown' : 'ArrowUp', true] : null; };
    m.view = () => ({ p: m.p.map(p => [p.n, p.tag, p.hr, p.spo2]) });
    m.buttons = () => [['ArrowLeft', '<'], ['ArrowRight', '>'], ['ArrowUp', 'Bed'], ['ArrowDown', 'Bench']];
    m.draw = (c, W, H, P) => {
      const w = wl(); txt(c, `beds free ${2 - m.p.filter(p => p.placed && p.crit).length}   waiting ${w.length}`, 10, 16, { size: 12, col: COL.pale });
      w.forEach((p, k) => { const x = 10 + k * 76, on = k === m.cur % w.length; box(c, x, 30, 70, 100, on ? COL.panel : 'rgba(255,255,255,.05)', on ? COL.gold : null);
        txt(c, `#${p.n} ${p.tag}`, x + 6, 48, { size: 11, col: p.tag === 'RED' ? P.bad : COL.ink }); txt(c, 'HR ' + p.hr, x + 6, 72, { size: 12 }); txt(c, 'SpO2 ' + p.spo2, x + 6, 92, { size: 12 }); });
      txt(c, m.t > wait - 4 && w.some(p => p.crit) ? `critical waiting ${Math.max(0, wait - m.t).toFixed(0)} s` : 'Up bed · Down bench', 10, 156, { size: 11, col: COL.dim });
    };
    return m;
  },
});
