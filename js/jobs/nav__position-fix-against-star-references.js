// Navigator: position fix against star references. The sextant arm is walked in on a star by halving: the chart shows the arm's bearing (the middle of
// the bracket) and, after the instrument settles, whether the star lies to port or to starboard of it. Press Left to pull the bracket's far edge in to
// the arm when the star is to port, Right when it is to starboard. When the bracket is under three degrees wide, Enter takes the fix. Three stars.
import { define, machine, ARROW, ENTER, rf, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'nav', label: 'Position fix against star references', type: 'loop' },
  title: 'Halve the bracket onto the star', dept: 'flight', host: 'console', tool: 'Sextant arm and bearing bracket',
  how: 'The arm sits in the middle of the bracket. When the reading settles, press Left if the star is to port of the arm, Right if to starboard; the bracket halves. Under 3 degrees, Enter fixes.',
  keys: ['Left / Right: halve the bracket', 'Enter: take the fix'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'bisect bearing', input: 'arrows+enter',
    win: 'three stars each fixed by halving the bearing bracket until under three degrees wide, then taking the fix',
    fail: 'halving towards the wrong side, pressing before the reading settles, or taking a fix while the bracket is still wide',
    rule: 'The arm sits mid-bracket; the lamp shows which side the star is on only after a short settle. Press that side to halve the bracket. Enter fixes once the bracket is under three degrees.' },
  rush: 'Took the fix where the first two lines crossed and logged it.',
  captions: { 'wrong way': 'arm swung away from the star', unsettled: 'reading not settled yet', wide: 'fix taken with a wide bracket' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, settle = m.calm ? 1 : 0.7; m.n = 0; m.rounds = 3; m.round = 0; m.set = 0;
    m.stars = Array.from({ length: 3 }, () => rf(r, 4, 86)); m.lo = 0; m.hi = 90; const mid = () => (m.lo + m.hi) / 2;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (ENTER(code)) { if (!down) return true; if (m.hi - m.lo > 3) { m.fault('wide'); return true; } m.n++; m.round = m.n; m.lo = 0; m.hi = 90; m.set = 0.4; if (m.n >= 3) m.win(); return true; }
      if (a !== 'L' && a !== 'R') return !!a; if (!down) return true; if (m.set > 0) { m.fault('unsettled'); return true; }
      const star = m.stars[m.n], port = star < mid(); if ((a === 'L') !== port) { m.fault('wrong way'); return true; } if (port) m.hi = mid(); else m.lo = mid(); m.set = settle; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.set > 0) m.set = Math.max(0, m.set - dt); };
    m.hint = () => { if (m.state !== 'play' || m.set > 0) return []; if (m.hi - m.lo <= 3) return [['Enter', true]]; return [[m.stars[m.n] < mid() ? 'ArrowLeft' : 'ArrowRight', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ s: m.stars.map(x => +x.toFixed(1)) });
    m.buttons = () => [['ArrowLeft', '◀ port'], ['ArrowRight', 'starboard ▶'], ['Enter', 'Fix']];
    m.draw = (c, W, H, P) => {
      const X = (b) => 20 + b / 90 * 360, st = m.stars[Math.min(m.n, 2)]; box(c, 20, 60, 360, 26, COL.panel, COL.dim, 4); box(c, X(m.lo), 60, X(m.hi) - X(m.lo), 26, 'rgba(244,194,91,.18)', COL.gold, 4);
      c.fillStyle = '#fff'; c.fillRect(X(mid()) - 1, 52, 3, 42); txt(c, `${mid().toFixed(1)}°`, X(mid()), 46, { size: 11, align: 'center', col: COL.gold });
      txt(c, m.set > 0 ? 'reading settling…' : st < mid() ? '◀ star to PORT' : 'star to STARBOARD ▶', 200, 118, { size: 14, align: 'center', col: m.set > 0 ? COL.dim : COL.pale });
      txt(c, `bracket ${(m.hi - m.lo).toFixed(1)}°   star ${Math.min(m.n + 1, 3)}/3`, 200, 150, { size: 11, align: 'center', col: m.hi - m.lo <= 3 ? P.good : COL.dim });
    };
    return m;
  },
});
