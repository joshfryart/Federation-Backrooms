// XO: command the bridge watch. Each chief reports in turn over the chair comm. File every report into the captain-now pile or the
// can-wait pile; a report that hedges ("should be", "probably") must be pressed for the real status first, because a hedge can hide
// trouble. Passing a hedge on unchecked, or filing a report in the wrong pile, is a fault.
import { define, machine, ARROW, SPACE, shuffle, pick, txt, box, lamp, COL, wrapText } from './kit.js';

const CH = ['Engineering', 'Medical', 'Security', 'Operations', 'Science', 'Flight'];
const URG = ['Coolant pump two has failed, we are on the spare.', 'Deflector grid is down to sixty percent.', 'We have a hull breach alarm on deck nine.', 'Relay six is dropping every few minutes.', 'Isolation seal alarm in the ward.'];
const OK = ['All quiet, crews on post.', 'Nothing open, board green.', 'Routine shift, logs are current.', 'Stores counted, nothing to report.', 'Sweep running, nothing found.'];
const HEDGE = ['It should be fine, probably, we are looking at it.', 'Mostly nominal, I think. Give us an hour.', 'There was a flicker, but it is probably nothing.', 'We are more or less on top of it.'];
const TRUE_BAD = ['Pressed: the flicker is a cracked injector. Needs the captain.', 'Pressed: two techs are down and the queue is stuck.', 'Pressed: the seal has failed twice this shift.'];
const TRUE_OK = ['Pressed: a sensor glitch, reset and holding.', 'Pressed: logged, fixed, retesting at shift end.', 'Pressed: a false alarm, the log proves it.'];

export default define({
  job: { billet: 'xo', label: 'Command the bridge watch', type: 'loop' },
  title: 'Watch handover report sift', dept: 'command', host: 'console', tool: 'Command chair comm and pad',
  how: 'Each chief reports in turn: file it left for the captain now or right for the next shift, and press any hedged answer for the truth before filing it.',
  keys: ['← captain now', '→ can wait', 'Space press a hedge'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'sift reports', input: 'arrows+space', win: 'every chief report filed in the right pile with each hedged answer pressed for the real status first',
    fail: 'passing a hedged report on unchecked, or putting a real worry in the can-wait pile',
    rule: 'A report appears: ← files it for the captain now, → for the next shift. If it hedges (amber, wavy mark), Space presses the chief and the real status comes back.' },
  rush: 'Read the board lamps to the captain as a long list and took the chair.',
  captions: { 'hedge passed on': 'chief hesitates', misfiled: 'pad buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nUrg = 1 + Math.floor(r() * 2), nHedge = 2 + Math.floor(r() * 2);
    const order = shuffle(r, CH.slice()), roles = shuffle(r, [...Array(nUrg).fill('u'), ...Array(nHedge).fill('h'), ...Array(6 - nUrg - nHedge).fill('o')]);
    m.reps = order.map((c, i) => { const k = roles[i], hb = k === 'h' && r() < 0.5; return { c, hedged: k === 'h', urgent: k === 'u' || hb, say: k === 'u' ? pick(r, URG) : k === 'o' ? pick(r, OK) : pick(r, HEDGE), truth: k === 'h' ? pick(r, hb ? TRUE_BAD : TRUE_OK) : '', pressed: 0, pile: 0 }; });
    m.i = 0; m.at = 0.8; m.rounds = 6; m.round = 0; const gap = m.calm ? 0.8 : 0.6;
    const cur = () => m.reps[m.i], ready = () => m.t >= m.at, known = (x) => !x.hedged || (x.pressed && m.t - x.pressed >= 0.8);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), x = cur();
      if (SPACE(code)) { if (ready() && x.hedged && !x.pressed) { x.pressed = m.t; m.ev('press', { i: m.i }); } return true; }
      if (a !== 'L' && a !== 'R') return false; if (!ready()) return true;
      if (x.hedged && !known(x)) { m.fault('hedge passed on'); return true; }
      if ((a === 'L') !== x.urgent) { m.fault('misfiled'); return true; }
      x.pile = a; m.i++; m.round++; m.at = m.t + gap; if (m.i >= m.reps.length) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const x = cur(); if (!x || !ready()) return []; if (x.hedged && !x.pressed) return [['Space', true]]; if (!known(x)) return []; return [[x.urgent ? 'ArrowLeft' : 'ArrowRight', true]]; };
    m.bad = () => { const x = cur(); return !x || !ready() ? null : x.urgent ? 'ArrowRight' : 'ArrowLeft'; };
    m.view = () => ({ reps: m.reps.map(x => [x.c, x.hedged, x.urgent]) });
    m.buttons = () => [['ArrowLeft', '← Captain now'], ['Space', 'Press'], ['ArrowRight', 'Can wait →']];
    m.draw = (c, W, H, P) => {
      const x = cur(), now = m.reps.filter(y => y.pile === 'L'), wait = m.reps.filter(y => y.pile === 'R');
      box(c, 10, 8, W - 20, 82, 'rgba(255,255,255,.05)', x && ready() && x.hedged && !known(x) ? COL.warn : COL.peri, 10);
      if (x) {
        txt(c, ready() ? `${x.c} chief:` : `Calling ${x.c}…`, 22, 26, { size: 12, col: COL.gold });
        if (ready()) {
          if (x.hedged) { lamp(c, W - 32, 22, 8, COL.warn, 'triangle'); txt(c, 'HEDGED', W - 46, 26, { size: 10, col: COL.warn, align: 'right' }); }
          wrapText(`"${x.say}"`, 58).slice(0, 2).forEach((l, k) => txt(c, l, 22, 44 + k * 14, { size: 11 }));
          if (x.pressed) txt(c, m.t - x.pressed < 0.8 ? 'pressing…' : x.truth, 22, 80, { size: 11, col: COL.pale });
        }
      }
      box(c, 10, 98, (W - 30) / 2, 64, 'rgba(240,147,58,.12)', COL.orange, 8); box(c, 20 + (W - 30) / 2, 98, (W - 30) / 2, 64, 'rgba(125,151,232,.12)', COL.peri, 8);
      txt(c, `← CAPTAIN NOW (${now.length})`, 18, 114, { size: 11, col: COL.orange }); txt(c, `CAN WAIT → (${wait.length})`, 28 + (W - 30) / 2, 114, { size: 11, col: COL.peri });
      now.forEach((y, k) => txt(c, '■ ' + y.c, 18, 130 + k * 12, { size: 10 })); wait.slice(-3).forEach((y, k) => txt(c, '● ' + y.c, 28 + (W - 30) / 2, 130 + k * 12, { size: 10 }));
    };
    return m;
  },
});
