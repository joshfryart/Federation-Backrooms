// Chief of security: post a guard at the lab. Five officers are on the roster, each with a rest bar. Press an officer's digit to pick them, then Enter to
// post them. Three posts must be filled. Never post an officer under the rest line: an exhausted guard sleeps through the door. Posted officers leave the list.
import { define, machine, DIG, shuffle, rf, box, bar, txt, COL, ri } from './kit.js';

const NAMES = ['Ensign Rel', 'Crewman Vos', 'Crewman Dahl', 'Petty Officer Hane', 'Crewman Ilo'];
const LINE = 45;
export default define({
  job: { billet: 'cos', label: 'Post a guard at the lab', type: 'task:survey' },
  title: 'Post the rested officer', dept: 'security', host: 'console', tool: 'Duty roster',
  how: 'Pick an officer by pressing their digit: the rest bar shows how rested they are. Press Enter to post them. Only post officers above the rest line; three posts to fill.',
  keys: ['1 – 5 pick an officer', 'Enter post the officer'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'post by rest', input: 'digits+enter', win: 'three posts filled, each by an officer above the rest line, with no officer posted twice',
    fail: 'posting an officer below the rest line, who would sleep through the door',
    rule: 'Five officers with rest bars. A digit picks one; Enter posts the picked officer. A bar under the rest line means exhausted, and posting them is a fault. Posted officers leave the list.' },
  rush: 'Wrote the first three names on the roster and left the lab to the next watch.',
  captions: { 'posted tired': 'alarm tone' }, says: {},
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.rest = shuffle(r, NAMES.map((_, k) => (k < 3 ? ri(r, 55, 95) : ri(r, 10, 40))));
    m.posted = new Set(); m.sel = -1; m.posts = 3; m.postsDone = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false;
      const d = DIG(code);
      if (d) { if (d <= NAMES.length && !m.posted.has(d - 1)) m.sel = d - 1; return true; }
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (m.sel < 0 || m.posted.has(m.sel)) return true;
        if (m.rest[m.sel] < LINE) { m.fault('posted tired'); return true; }
        m.posted.add(m.sel); m.sel = -1; m.postsDone++; m.ev('post');
        if (m.postsDone >= m.posts) m.win();
        return true;
      }
      return false;
    };
    const pick = () => m.rest.findIndex((v, k) => v >= LINE && !m.posted.has(k));
    m.hint = () => { const k = pick(); if (k < 0) return []; return m.sel === k ? [['Enter', true]] : [[`Digit${k + 1}`, true]]; };
    m.bad = () => { const k = m.rest.findIndex((v, q) => v < LINE && !m.posted.has(q)); return m.sel === k ? 'Enter' : `Digit${k + 1}`; };
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['Enter', 'post']];
    m.view = () => ({ rest: m.rest.slice() });
    m.draw = (c, W, H, P) => {
      NAMES.forEach((n, k) => {
        const y = 8 + k * 26, out = m.posted.has(k), on = k === m.sel;
        box(c, 10, y, 380, 22, on ? 'rgba(244,194,91,.18)' : 'rgba(255,255,255,.05)', on ? COL.gold : null, 6);
        txt(c, `${k + 1}  ${n}`, 20, y + 15, { size: 11, col: out ? COL.dim : COL.ink });
        bar(c, 215, y + 7, 130, 8, m.rest[k] / 100, { band: [LINE / 100, 1], col: m.rest[k] >= LINE ? P.good : P.bad, mark: LINE / 100 });
        txt(c, out ? 'posted' : `${m.rest[k]}%`, 382, y + 15, { size: 10, align: 'right', col: COL.dim });
      });
      txt(c, `Posts filled ${m.postsDone} / ${m.posts}`, 200, 164, { size: 11, align: 'center', col: COL.peri });
    };
    return m;
  },
});
