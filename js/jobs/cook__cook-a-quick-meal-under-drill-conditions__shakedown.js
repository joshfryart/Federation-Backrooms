// Cook: quick meal under drill. The drill card shows the order of steps as arrows for a couple of seconds, then it is taken away. Repeat the
// order from memory: Up chop, Right heat, Left stir, Down plate. A wrong step is a fault and the card is shown again briefly.
import { define, machine, ARROW, ri, txt, COL } from './kit.js';
const G = { U: 'chop', R: 'heat', L: 'stir', D: 'plate' };

export default define({
  job: { billet: 'cook', label: 'Cook a quick meal under drill conditions', type: 'task:shakedown' },
  title: 'Recall the drill order', dept: 'services', host: 'console', tool: 'Drill order card',
  how: 'The drill card shows the order of cooking steps briefly. When it disappears, press the same arrows in the same order from memory.',
  keys: ['Up chop, Right heat, Left stir, Down plate'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'recall the order', input: 'arrows', win: 'two drill orders repeated from memory, four steps then five, with no wrong step',
    fail: 'repeating a step out of order from memory three times',
    rule: 'Watch the order card while it shows, then press the arrows in that order once it is hidden. A wrong step is a fault and re-shows the card.' },
  rush: 'Skipped the order and tossed things in the pot as they came to hand.',
  captions: { 'wrong step': 'drill buzzer' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, show = m.calm ? 3.4 : 2.4; m.rounds = 2; m.round = 0; m.idx = 0; m.vis = show;
    const deal = () => { const n = m.round === 0 ? 4 : 5; m.seq = []; for (let i = 0; i < n; i++) m.seq.push('UDLR'[ri(r, 0, 3)]); m.idx = 0; m.vis = show; };
    deal();
    m.key = (code, down = true) => {
      const a = ARROW(code); if (m.state !== 'play' || !down || !a) return false; if (m.vis > 0) return true;
      if (a !== m.seq[m.idx]) { m.fault('wrong step'); m.idx = 0; m.vis = 1.4; return true; } m.idx++;
      if (m.idx >= m.seq.length) { m.round++; if (m.round >= m.rounds) m.win(); else deal(); } return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.vis > 0) m.vis -= dt; };
    m.hint = () => m.vis > 0 ? [] : [['Arrow' + { U: 'Up', D: 'Down', L: 'Left', R: 'Right' }[m.seq[m.idx]], true]];
    m.bad = () => m.vis > 0 ? null : 'Arrow' + { U: 'Up', D: 'Down', L: 'Left', R: 'Right' }[m.seq[m.idx] === 'U' ? 'D' : 'U'];
    m.view = () => ({ seq: m.seq.join('') });
    m.buttons = () => [['ArrowUp', 'Chop'], ['ArrowRight', 'Heat'], ['ArrowLeft', 'Stir'], ['ArrowDown', 'Plate']];
    m.draw = (c, W, H, P) => { txt(c, m.vis > 0 ? 'MEMORISE THE ORDER' : `repeat it: ${m.idx} / ${m.seq.length}`, 200, 30, { size: 13, align: 'center', col: COL.pale });
      m.seq.forEach((s, i) => txt(c, m.vis > 0 ? G[s] : (i < m.idx ? G[s] : '?'), 20 + i * 74, 100, { size: 15, col: m.vis > 0 || i < m.idx ? COL.ink : COL.dim }));
      txt(c, `drill ${m.round + 1} / ${m.rounds}`, 16, 14, { size: 11, col: COL.dim }); };
    return m;
  },
});
