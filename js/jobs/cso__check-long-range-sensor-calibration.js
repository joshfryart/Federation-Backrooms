// Chief science officer: check long-range sensor calibration. Three gain channels have walked out overnight. The gain trim knob turns in
// detents: each tap of an arrow moves the offset line by one detent. Bring it inside the tolerance band without crossing out past zero (an
// overshoot is a fault), let it settle there, then sign with Enter. One channel may be a real fault whose drift keeps walking: the drift-rate
// lamp says WALKING. Trimming that one hides the fault (a fault); flag it with Space instead.
import { define, machine, ARROW, SPACE, ENTER, ri, rf, shuffle, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'cso', label: 'Check long-range sensor calibration', type: 'loop' },
  title: 'Gain trim to the zero marker', dept: 'sciences', host: 'console', tool: 'Long-range gain trim knob',
  how: 'Tap left / right to turn the gain knob one detent at a time until the offset sits in the band, wait for it to settle, then sign with Enter. A channel whose drift lamp reads WALKING is a real fault: flag it with Space and leave the knob alone.',
  keys: ['◀ ▶ one detent', 'Enter sign the log', 'Space flag a real fault'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'detent to zero', input: 'arrows+enter+space', win: 'every drifted gain channel brought onto the zero marker, left to settle and signed, and any walking channel flagged untouched',
    fail: 'overshooting past zero, signing before the offset settles, or trimming a walking channel so the real fault is hidden',
    rule: 'One arrow tap = one detent of gain. Bring the offset line inside the band without overshooting the far edge, wait for the settle bar to fill, then Enter. Drift lamp WALKING: press Space, never trim it.' },
  rush: 'Spun the trim until the needle sat on zero and signed without waiting.',
  captions: { overshot: 'knob clicks past', 'signed unsettled': 'log buzz', 'hid a fault': 'quiet log chime', 'false fault': 'flag tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, det = 0.1, band = m.calm ? 0.07 : 0.05, settle = 1.4;
    const walker = r() < 0.75 ? ri(r, 0, 2) : -1;
    m.chs = shuffle(r, ['A', 'B', 'C']).map((name, i) => { const k = ri(r, 3, 6) * (r() < 0.5 ? -1 : 1); return { name, o: k * det + rf(r, -0.025, 0.025), walk: i === walker, rate: i === walker ? rf(r, 0.05, 0.08) * Math.sign(k) : 0, s: 0, ref: ri(r, 2, 5) }; });
    m.i = 0; m.dn = {}; m.round = 1; m.rounds = 3; m.bf = 0;
    const ch = () => m.chs[m.i], next = () => { m.i++; m.round = Math.min(3, m.i + 1); if (m.i >= m.chs.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!a && !SPACE(code) && !ENTER(code)) return false;
      const e = down && !m.dn[code]; m.dn[code] = down; if (!e) return true; const c = ch();
      if (a === 'L' || a === 'R') { if (c.walk) { m.fault('hid a fault'); return true; } const was = c.o; c.o += a === 'R' ? det : -det; c.s = 0; if (Math.sign(was) !== Math.sign(c.o) && Math.abs(c.o) > band) m.fault('overshot'); }
      else if (ENTER(code)) { if (c.walk) m.fault('hid a fault'); else if (c.s >= settle) next(); else m.fault('signed unsettled'); }
      else if (SPACE(code)) { if (c.walk) next(); else m.fault('false fault'); }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const c = ch(); c.o += c.rate * dt; if (Math.abs(c.o) < band) c.s += dt; else c.s = 0; };
    const tap = (code) => [[code, !m.dn[code]]];
    m.hint = () => {
      const c = ch(); if (!c) return []; if (c.walk) return tap('Space');
      if (Math.abs(c.o) >= band) return tap(c.o > 0 ? 'ArrowLeft' : 'ArrowRight');
      return c.s >= settle ? tap('Enter') : [['ArrowLeft', false], ['ArrowRight', false], ['Enter', false]];
    };
    m.bad = () => ['Enter', ++m.bf % 2 === 0];
    m.view = () => ({ chs: m.chs.map(c => [c.name, +c.o.toFixed(3), c.walk]) });
    m.buttons = () => [['ArrowLeft', '◀ detent'], ['ArrowRight', 'detent ▶'], ['Enter', 'Sign'], ['Space', 'Flag fault']];
    m.draw = (c, W, H, P) => {
      const k = ch(); if (!k) return; txt(c, `CHANNEL ${k.name}  ·  ${m.i + 1}/3`, 14, 24, { size: 12, col: COL.gold });
      box(c, 14, 34, 220, 92, 'rgba(255,255,255,.04)', COL.dim, 4); c.lineWidth = 2;
      for (const [off, col] of [[0, COL.peri], [k.o * 120, COL.pale]]) { c.strokeStyle = col; c.beginPath(); for (let x = 0; x <= 216; x += 3) { const y = 80 - 28 * Math.exp(-(((x - 40 * k.ref) - off) ** 2) / 260) + (col === COL.pale ? Math.sin(x * 0.7 + m.t * 9) * 1.5 : 0); x ? c.lineTo(16 + x, y) : c.moveTo(16 + x, y); } c.stroke(); }
      txt(c, 'reference (blue) · live return', 18, 120, { size: 9, col: COL.dim });
      txt(c, 'OFFSET', 250, 30, { size: 10, col: COL.dim }); const cx = 320, sc = 120;
      c.fillStyle = 'rgba(79,208,106,.25)'; c.fillRect(cx - band * sc, 38, band * 2 * sc, 34); c.strokeStyle = P.good; c.strokeRect(cx - band * sc, 38, band * 2 * sc, 34);
      c.fillStyle = '#fff'; c.fillRect(cx - 1, 34, 2, 42); const ox = Math.max(250, Math.min(390, cx + k.o * sc)); c.fillStyle = Math.abs(k.o) < band ? P.good : P.bad; c.fillRect(ox - 2, 40, 4, 30);
      txt(c, `${k.o >= 0 ? '+' : ''}${(k.o * 100).toFixed(1)} µ`, 250, 88, { size: 12, col: COL.ink });
      txt(c, 'SETTLE', 250, 106, { size: 10, col: COL.dim }); bar(c, 300, 98, 90, 10, k.s / settle, { col: P.good });
      lamp(c, 262, 134, 9, k.walk ? P.bad : P.good, k.walk ? 'triangle' : 'circle'); txt(c, k.walk ? `DRIFT WALKING ${(Math.abs(k.rate) * 100).toFixed(1)} µ/s` : 'drift steady', 276, 138, { size: 11, col: k.walk ? COL.warn : COL.dim });
      txt(c, '◀ ▶ one detent · Enter sign · Space flag', 14, 150, { size: 10, col: COL.dim });
    };
    return m;
  },
});
