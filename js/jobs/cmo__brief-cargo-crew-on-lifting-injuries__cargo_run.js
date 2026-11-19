// CMO: brief the cargo crew on lifting injuries (cargo run). Loaders lift the sandbag one after another while you watch the spine line.
// Partway up a bad lift goes wrong: the shoulders twist left or right, or the back rounds over straight legs. Call the correction while
// the bag is still moving: the arrow the shoulders have turned (← / →), or ↓ for "bend the knees". A clean lift needs no word. When the
// whole crew has lifted, pin the chart by the door (Enter).
import { define, machine, ARROW, ENTER, rf, shuffle, txt, COL } from './kit.js';

const ERR = ['L', 'R', 'D'], SAY = { L: 'shoulders twisting left', R: 'shoulders twisting right', D: 'back rounding, legs straight' };
export default define({
  job: { billet: 'cmo', label: 'Brief cargo crew on lifting injuries', type: 'task:cargo_run' },
  title: 'Sandbag lift spine-line coaching', dept: 'medical', host: 'console', tool: 'Lifting chart and sandbag',
  how: 'Watch each loader\'s spine line as they lift; when it goes wrong call the fix before the bag is up (← / → for a twist that way, ↓ for a rounded back), then pin the chart (Enter).',
  keys: ['← / → twist correction', '↓ bend the knees', 'Enter pin the chart'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'coach the lift', input: 'arrows+enter', win: 'every faulty sandbag lift corrected with the right cue before the bag was up, clean lifts left alone and the chart pinned',
    fail: 'calling the wrong correction, nagging a clean lift, or letting a twisted or rounded lift finish uncorrected',
    rule: 'Each lift takes a couple of seconds. If the spine line twists, press the arrow the shoulders turned; if the back rounds over straight legs, press ↓. Say nothing on a clean lift. Enter pins the chart at the end.' },
  rush: 'Pinned the lifting chart by the door and told them to read it.',
  captions: { 'wrong correction': 'loader looks confused', 'nagged a clean lift': 'loader rolls eyes', 'uncorrected lift': 'loader grunts and clutches back', 'chart pinned early': 'crew still lifting' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dur = m.calm ? 3.2 : 2.6, gap = 0.6;
    const errs = shuffle(r, [...ERR, ERR[Math.floor(r() * 3)], null]);
    m.lifts = errs.map(e => ({ e, on: e ? rf(r, 0.25, 0.45) * dur : null, fixed: false, said: false }));
    m.k = 0; m.lt = -0.8; m.rounds = 5; m.round = 0; m.flash = ''; m.done = false;
    const Lf = () => m.lifts[m.k], showing = (l) => l && l.e && !l.fixed && m.lt >= l.on;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!(a === 'L' || a === 'R' || a === 'D' || ENTER(code))) return false; if (!down) return true;
      if (ENTER(code)) { if (!m.done) { m.fault('chart pinned early'); m.flash = 'the crew is still lifting'; return true; } m.win(); return true; }
      const l = Lf(); if (m.done || !l || m.lt < 0) return true;
      if (!showing(l)) { if (!l.said) { l.said = true; m.fault('nagged a clean lift'); m.flash = l.fixed ? 'already corrected' : 'that lift was fine'; } return true; }
      if (a !== l.e) { m.fault('wrong correction'); m.flash = 'wrong cue'; return true; }
      l.fixed = true; m.flash = 'loader corrects'; return true;
    };
    m.tick = (dt) => { if (!m.live(dt) || m.done) return; m.lt += dt; const l = Lf();
      if (m.lt >= dur) { if (l.e && !l.fixed) { m.fault('uncorrected lift'); m.flash = 'lift finished twisted'; } m.round++; m.k++; m.lt = -gap; if (m.k >= m.lifts.length) { m.done = true; m.flash = 'all loaders done: pin the chart'; } } };
    m.hint = () => { if (m.done) return [['Enter', true]]; const l = Lf(); return showing(l) && m.lt >= l.on + 0.25 ? [['Arrow' + { L: 'Left', R: 'Right', D: 'Down' }[l.e], true]] : []; };
    m.bad = () => (m.lt > 0.1 && !Lf()?.said ? 'ArrowDown' : null);
    m.view = () => ({ l: m.lifts.map(l => [l.e, l.on && +l.on.toFixed(2)]) });
    m.buttons = () => [['ArrowLeft', '← twist'], ['ArrowDown', '↓ knees'], ['ArrowRight', 'twist →'], ['Enter', 'Pin chart']];
    m.draw = (c, W, H, P) => {
      const l = Lf(), p = l ? Math.max(0, Math.min(1, m.lt / dur)) : 1, bad = showing(l), hx = 150, hy = 120 - p * 10;
      txt(c, `Loader ${Math.min(m.k + 1, m.lifts.length)} / ${m.lifts.length}`, 12, 16, { size: 11, col: COL.dim });
      c.strokeStyle = COL.ink; c.lineWidth = 3; const knee = bad && l.e === 'D' ? 0 : 14 * (1 - p);
      c.beginPath(); c.moveTo(hx - 12, 160); c.lineTo(hx - 12 + knee, 140); c.lineTo(hx, hy); c.moveTo(hx + 12, 160); c.lineTo(hx + 12 + knee, 140); c.lineTo(hx, hy); c.stroke();
      const tw = bad && l.e !== 'D' ? (l.e === 'L' ? -18 : 18) : 0, lean = bad && l.e === 'D' ? 26 : 6 * (1 - p), sx = hx + tw + lean, sy = hy - 50 + (bad && l.e === 'D' ? 12 : 0);
      c.strokeStyle = bad ? P.bad : P.good; c.beginPath(); c.moveTo(hx, hy); if (bad && l.e === 'D') c.quadraticCurveTo(hx + 30, hy - 40, sx, sy); else c.lineTo(sx, sy); c.stroke();
      c.strokeStyle = COL.ink; c.beginPath(); c.moveTo(sx - 16 + tw * 0.4, sy - tw * 0.3); c.lineTo(sx + 16 + tw * 0.4, sy + tw * 0.3); c.stroke();
      c.beginPath(); c.arc(sx, sy - 12, 8, 0, 6.283); c.stroke(); c.fillStyle = COL.gold; c.fillRect(sx - 14, sy + 20 - p * 10, 28, 14);
      txt(c, 'spine line', 230, 50, { size: 11, col: COL.dim }); txt(c, bad ? SAY[l.e] : l && m.lt >= 0 ? 'lifting…' : '—', 230, 70, { size: 13, col: bad ? P.bad : COL.ink });
      txt(c, `corrected ${m.lifts.filter(x => x.fixed).length} · lifts done ${m.round}`, 230, 100, { size: 11, col: COL.pale }); txt(c, m.flash, 230, 130, { size: 11, col: COL.warn });
    };
    return m;
  },
});
