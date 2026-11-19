// Sensor officer: lateral array alignment. The drift data lists the array's elements with their bearing error against the reference grid.
// Pick the WORST element (digit), then hold ← / → to nudge its alignment control while the reference star's return walks across the
// crosshair. The element keeps drifting slowly, so once the error is inside tolerance it has to STAY there through a watch timer; sign the
// alignment log (Enter) only when the watch is full. Overshooting through zero past the band, picking a better element first, or signing
// on a single good test are faults.
import { define, machine, ARROW, DIG, ENTER, rf, shuffle, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'sensor', label: 'Lateral array alignment', type: 'loop' },
  title: 'Worst element nudge and drift watch', dept: 'sciences', host: 'console', tool: 'Lateral array console',
  how: 'Pick the element with the worst bearing error (1-5), hold ← / → to nudge it until the star sits in the tolerance band, keep it there through the drift watch, then sign with Enter.',
  keys: ['1-5 pick element', '← / → hold to nudge', 'Enter sign the log'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'nudge worst element', input: 'arrows-hold+digits+enter', win: 'three worst-first lateral elements nudged into tolerance and held there against slow drift for a full watch before signing',
    fail: 'choosing an element that is not the worst, nudging through zero past the band, or signing on one good test before the watch fills',
    rule: 'Read the drift table and press the digit of the largest error. Hold an arrow to walk the star to the crosshair, let go early, counter the slow drift, and Enter once the watch bar fills.' },
  rush: 'Nudged one element until the star flashed centred once and signed the log.',
  captions: { 'wrong element': 'console buzz', overshot: 'star swings past', 'single test': 'log rejects' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 0.07 : 0.055, watch = m.calm ? 1.6 : 2.0, rate = m.calm ? 0.2 : 0.26;
    const mags = shuffle(r, [0.18, 0.26, 0.34, 0.42, 0.5].map(x => x + rf(r, -0.02, 0.02)));
    m.el = mags.map((e, i) => ({ n: i + 1, e: e * (r() < 0.5 ? -1 : 1), d: rf(r, 0.012, 0.03) * (r() < 0.5 ? -1 : 1), done: false }));
    m.sel = -1; m.w = 0; m.round = 1; m.rounds = 3; m.hd = { L: false, R: false }; m.bk = 0;
    const worst = () => m.el.filter(x => !x.done).reduce((a, b) => (Math.abs(b.e) > Math.abs(a.e) ? b : a));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { m.hd[a] = down; return true; }
      if (!down) return !!(d || ENTER(code));
      if (d >= 1 && d <= 5) { if (m.sel >= 0) return true; const e = m.el[d - 1]; if (e.done) return true; if (e !== worst()) m.fault('wrong element'); else { m.sel = d - 1; m.w = 0; } return true; }
      if (ENTER(code)) { if (m.sel < 0) return true; if (m.w < watch) { m.fault('single test'); return true; }
        m.el[m.sel].done = true; m.sel = -1; if (m.el.filter(x => x.done).length >= 3) m.win(); else m.round++; return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.el.forEach(x => { if (!x.done) x.e += x.d * dt * 0.4; });
      if (m.sel < 0) return; const k = m.el[m.sel], was = k.e; k.e += x(dt) + k.d * dt * 0.6;
      if (Math.sign(was) !== Math.sign(k.e) && Math.abs(k.e) > band * 1.1) { m.fault('overshot'); }
      if (Math.abs(k.e) < band) m.w += dt; else m.w = 0;
    };
    const x = (dt) => (m.hd.R ? rate : 0) * dt - (m.hd.L ? rate : 0) * dt;
    m.hint = () => {
      if (m.sel < 0) return [['ArrowLeft', false], ['ArrowRight', false], ['Digit' + worst().n, true]];
      const k = m.el[m.sel]; if (m.w >= watch) return [['ArrowLeft', false], ['ArrowRight', false], ['Enter', true]];
      if (Math.abs(k.e) > band * 0.4) return k.e > 0 ? [['ArrowRight', false], ['ArrowLeft', true]] : [['ArrowLeft', false], ['ArrowRight', true]];
      return [['ArrowLeft', false], ['ArrowRight', false]];
    };
    m.bad = () => { if (m.sel < 0) { const w = worst(), o = m.el.find(e => !e.done && e !== w); return 'Digit' + o.n; } return 'Enter'; };
    m.view = () => ({ e: m.el.map(x => +x.e.toFixed(3)) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['ArrowLeft', '◀ nudge'], ['ArrowRight', 'nudge ▶'], ['Enter', 'Sign']];
    m.draw = (c, W, H, P) => {
      txt(c, 'DRIFT TABLE · bearing error', 14, 20, { size: 11, col: COL.gold });
      m.el.forEach((e, i) => { const y = 32 + i * 24; txt(c, String(e.n), 16, y + 10, { size: 12, col: e.done ? COL.dim : COL.ink });
        bar(c, 30, y, 140, 12, Math.min(1, Math.abs(e.e) / 0.55), { col: e.done ? COL.dim : Math.abs(e.e) < band ? P.good : P.bad });
        txt(c, e.done ? 'signed' : `${(e.e * 100).toFixed(1)} mr`, 176, y + 10, { size: 10, col: COL.dim }); if (i === m.sel) lamp(c, 236, y + 6, 6, COL.gold, 'triangle'); });
      const cx = 315, cy = 70; box(c, 255, 18, 120, 104, 'rgba(255,255,255,.04)', COL.dim, 4);
      c.fillStyle = 'rgba(79,208,106,.2)'; c.fillRect(cx - band * 110, 20, band * 220, 100); c.strokeStyle = P.good; c.lineWidth = 1; c.strokeRect(cx - band * 110, 20, band * 220, 100);
      c.strokeStyle = COL.ink; c.beginPath(); c.moveTo(cx, 24); c.lineTo(cx, 116); c.moveTo(259, cy); c.lineTo(371, cy); c.stroke();
      if (m.sel >= 0) { const k = m.el[m.sel], sx = Math.max(258, Math.min(372, cx + k.e * 110)); c.globalAlpha = Math.max(0.3, 1 - Math.abs(k.e) * 1.5); lamp(c, sx, cy, 7, COL.pale, 'diamond'); c.globalAlpha = 1; }
      txt(c, 'DRIFT WATCH', 255, 138, { size: 10, col: COL.dim }); bar(c, 255, 144, 120, 10, m.w / watch, { col: P.good });
      txt(c, m.sel < 0 ? 'Pick the worst element' : m.w >= watch ? 'Holding — Enter to sign' : 'Nudge, then hold in band', 14, 160, { size: 10, col: COL.dim });
    };
    return m;
  },
});
