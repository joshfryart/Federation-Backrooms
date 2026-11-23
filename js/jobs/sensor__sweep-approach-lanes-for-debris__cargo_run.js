// Sensor officer: sweep approach lanes for debris (cargo run). The debris sweep runs along the lane: the star background streams steadily
// one way, and small debris returns drift AGAINST that stream. Steer the reticle (hold arrows) onto each counter-moving return and tag it
// (Space) before it leaves the lane. Tagging a background star is a false tag; a debris return that leaves untagged is missed. When all
// are tagged, send navigation the CLOSEST tagged return by its tag number (digit); sending a farther one is a fault.
import { define, machine, ARROW, DIG, SPACE, rf, ri, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'sensor', label: 'Sweep approach lanes for debris', type: 'task:cargo_run' },
  title: 'Counter-drift debris reticle tagging', dept: 'sciences', host: 'console', tool: 'Debris sweep',
  how: 'Steer the reticle (hold arrows) onto each small return moving against the star stream and tag it (Space) before it leaves the lane; then send the closest tag to navigation (its digit).',
  keys: ['arrows hold: steer reticle', 'Space tag return', '1-3 send closest to nav'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'reticle tag debris', input: 'arrows-hold+digits+space', win: 'every debris return drifting against the star stream caught in the reticle and tagged inside the lane, and the nearest one sent to navigation',
    fail: 'tagging a background star, letting a counter-moving return leave the lane untagged, or sending navigation a farther return than the closest',
    rule: 'Stars stream left at one speed; debris drifts the other way. Hold arrows to put the reticle on it, Space to tag. Once all are tagged, read the ranges and press the digit of the closest.' },
  rush: 'Ran the sweep at full width and sent navigation "lane clear" without tagging anything.',
  captions: { 'tagged a star': 'false tag chirp', 'debris missed': 'hull strike warning', 'far return sent': 'navigation queries' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, X0 = 16, X1 = 286, Y0 = 22, Y1 = 148, flow = m.calm ? 22 : 30, sp = 130, RAD = 9, ND = 3;
    m.stars = Array.from({ length: 12 }, () => ({ x: rf(r, X0, X1), y: rf(r, Y0 + 4, Y1 - 4) }));
    const ranges = shuffle(r, [ri(r, 40, 90), ri(r, 120, 200), ri(r, 230, 400)]);
    m.deb = Array.from({ length: ND }, (_, i) => ({ t0: i * (m.calm ? 3.4 : 2.6) + rf(r, 0.3, 0.9), x: X0 + 4, y: rf(r, Y0 + 15, Y1 - 15), vx: rf(r, 10, 18) * (m.calm ? 0.8 : 1), vy: rf(r, -6, 6), rng: ranges[i], tag: 0, gone: false }));
    m.rx = (X0 + X1) / 2; m.ry = (Y0 + Y1) / 2; m.hd = {}; m.tags = 0; m.round = 0; m.rounds = ND;
    const live = (d) => m.t >= d.t0 && !d.gone, under = (o) => Math.hypot(o.x - m.rx, o.y - m.ry) < RAD;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code); if (a) { m.hd[a] = down; return true; }
      if (!down) return !!(d || SPACE(code));
      if (SPACE(code)) { const hit = m.deb.find(x => live(x) && !x.tag && under(x)); if (hit) { hit.tag = ++m.tags; m.round = m.tags; } else if (m.stars.some(under)) m.fault('tagged a star'); return true; }
      if (d >= 1 && d <= ND) { if (m.deb.some(x => !x.tag && !x.gone)) return true; if (!m.deb.some(x => x.tag)) return true; const close = m.deb.filter(x => x.tag).reduce((a, b) => (b.rng < a.rng ? b : a));
        if (close.tag === d) m.win(); else m.fault('far return sent'); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; for (const s of m.stars) { s.x -= flow * dt; if (s.x < X0) { s.x = X1; s.y = Y0 + 4 + r() * (Y1 - Y0 - 8); } }
      for (const d of m.deb) if (live(d)) { d.x += d.vx * dt; d.y += d.vy * dt; if (d.y < Y0 + 4 || d.y > Y1 - 4) d.vy *= -1; if (d.x > X1) { d.gone = true; if (!d.tag) m.fault('debris missed'); } }
      const v = sp * dt; if (m.hd.L) m.rx -= v; if (m.hd.R) m.rx += v; if (m.hd.U) m.ry -= v; if (m.hd.D) m.ry += v;
      m.rx = Math.max(X0, Math.min(X1, m.rx)); m.ry = Math.max(Y0, Math.min(Y1, m.ry));
      if (m.deb.every(d => d.gone) && !m.deb.some(d => d.tag)) m.fail('lane unswept');
    };
    const rel = (keep) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].filter(k => k !== keep).map(k => [k, false]);
    m.hint = () => {
      const tgt = m.deb.find(d => live(d) && !d.tag);
      if (!tgt) { if (m.deb.some(d => !d.tag && !d.gone)) return rel(); if (!m.deb.some(x => x.tag)) return rel(); const close = m.deb.filter(x => x.tag).reduce((a, b) => (b.rng < a.rng ? b : a)); return [...rel(), ['Digit' + close.tag, true]]; }
      const dx = tgt.x + 3 - m.rx, dy = tgt.y - m.ry; if (Math.hypot(tgt.x - m.rx, dy) < RAD * 0.6) return [...rel(), ['Space', true]];
      const k = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'); return [...rel(k), [k, true]];
    };
    m.bad = () => 'Space';
    m.view = () => ({ d: m.deb.map(d => [+d.y.toFixed(1), d.rng]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Tag'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3']];
    m.draw = (c, W, H, P) => {
      box(c, X0 - 2, Y0 - 2, X1 - X0 + 4, Y1 - Y0 + 4, 'rgba(255,255,255,.03)', COL.dim, 4); txt(c, '◀ star stream', X0 + 2, 16, { size: 9, col: COL.dim });
      c.fillStyle = COL.lav; for (const s of m.stars) c.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      for (const d of m.deb) if (live(d) || (d.tag && d.gone)) { if (d.gone) continue; lamp(c, d.x, d.y, 4, d.tag ? P.good : COL.pale, d.tag ? 'square' : 'circle'); if (d.tag) txt(c, String(d.tag), d.x + 6, d.y - 4, { size: 10, col: P.good }); }
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.arc(m.rx, m.ry, RAD, 0, 6.283); c.moveTo(m.rx - 14, m.ry); c.lineTo(m.rx + 14, m.ry); c.moveTo(m.rx, m.ry - 14); c.lineTo(m.rx, m.ry + 14); c.stroke();
      txt(c, 'TAGS', 300, 30, { size: 11, col: COL.gold }); m.deb.filter(d => d.tag).sort((a, b) => a.tag - b.tag).forEach((d, j) => txt(c, `${d.tag} · ${d.rng} km`, 300, 50 + j * 18, { size: 11 }));
      const all = !m.deb.some(d => !d.tag && !d.gone); txt(c, all ? 'Send closest: digit' : `${m.tags} / ${ND} tagged`, 300, 120, { size: 10, col: all ? COL.gold : COL.dim });
    };
    return m;
  },
});
