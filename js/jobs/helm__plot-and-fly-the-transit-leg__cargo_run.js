// Helm: plot and fly the transit leg. Step the plot head across the helm chart one cell at a time (arrows) from the start to each waypoint
// in turn, round the hazard tiles, and engage course hold at the waypoint (Enter). The hazard overlay is not static: when the UPDATE lamp
// lights, recheck the overlay (Space) before you engage, and if a new patch now sits on the leg you plotted, that leg has to be re-plotted.
// Plotting into a hazard tile, engaging away from the waypoint, or engaging on a stale overlay is a fault.
import { define, machine, ARROW, SPACE, ENTER, ri, txt, box, lamp, COL } from './kit.js';

const GW = 9, GH = 5, K = (x, y) => y * GW + x;
export default define({
  job: { billet: 'helm', label: 'Plot and fly the transit leg', type: 'task:cargo_run' },
  title: 'Waypoint plot with hazard recheck', dept: 'flight', host: 'console', tool: 'Helm chart, course dial and hazard overlay',
  how: 'Step the plot with the arrows round hazard tiles to each waypoint and press Enter to engage hold there. When the UPDATE lamp lights, press Space to recheck the overlay first.',
  keys: ['arrows step the plot', 'Space recheck overlay', 'Enter engage hold'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'plot around', input: 'arrows+space+enter', win: 'every leg plotted cell by cell clear of hazards and engaged at its waypoint on a current overlay',
    fail: 'plotting into a hazard tile, engaging before the waypoint, or engaging while an overlay update is unchecked',
    rule: 'Arrows move the plot head one cell; hazard cells refuse it. Enter on the waypoint engages the leg. The UPDATE lamp means new hazards: Space reveals them, and a leg crossing one snaps back to its start.' },
  rush: 'Flew the old line without looking at the overlay again.',
  captions: { 'into hazard': 'hazard chime', 'skipped waypoint': 'nav: that is not the waypoint', 'stale overlay': 'overlay alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.wps = [[3, ri(r, 0, 4)], [6, ri(r, 0, 4)], [8, ri(r, 0, 4)]]; m.start = [0, ri(r, 0, 4)];
    const keep = new Set([K(...m.start), ...m.wps.map(w => K(...w))]); m.haz = new Set();
    m.upd = [r() < 0.8, r() < 0.8, false]; if (!m.upd[0] && !m.upd[1]) m.upd[0] = true;
    m.leg = 0; m.head = [...m.start]; m.legStart = [...m.start]; m.path = [K(...m.start)]; m.flown = []; m.pending = null; m.rounds = 3; m.round = 0;
    const bfs = (from, to, avoid) => {
      const prev = new Map([[K(...from), -1]]), q = [from];
      while (q.length) { const [x, y] = q.shift(); if (x === to[0] && y === to[1]) break;
        for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) { const nx = x + dx, ny = y + dy, k = K(nx, ny); if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || prev.has(k) || avoid.has(k)) continue; prev.set(k, K(x, y)); q.push([nx, ny]); } }
      if (!prev.has(K(...to))) return null; const out = []; for (let k = K(...to); k !== -1; k = prev.get(k)) out.unshift(k); return out;
    };
    const ok = () => [m.start, ...m.wps].every((p, i, a) => !i || bfs(a[i - 1], p, m.haz));
    for (let tries = 0; tries < 40; tries++) { m.haz = new Set(); while (m.haz.size < 8) { const x = ri(r, 1, 7), y = ri(r, 0, 4); if (!keep.has(K(x, y)) && x !== 3 && x !== 6) m.haz.add(K(x, y)); } if (ok()) break; }
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), w = m.wps[m.leg];
      if (a) { if (!down) return true; const nx = m.head[0] + (a === 'R') - (a === 'L'), ny = m.head[1] + (a === 'D') - (a === 'U');
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return true; if (m.haz.has(K(nx, ny))) { m.fault('into hazard'); return true; }
        m.head = [nx, ny]; m.path.push(K(nx, ny));
        if (m.upd[m.leg] && !m.pending && m.path.length >= 3 && Math.abs(nx - w[0]) + Math.abs(ny - w[1]) <= 2) {
          m.upd[m.leg] = false; const cand = m.path.slice(1, -1).filter(k => !m.path.slice(-1).includes(k));
          for (const k of cand) { const av = new Set([...m.haz, k]); if (bfs(m.legStart, w, av)) { m.pending = k; break; } }
        }
        return true; }
      if (SPACE(code)) { if (!down) return true; if (m.pending != null) { m.haz.add(m.pending); m.pending = null; if (m.path.some(k => m.haz.has(k))) { m.head = [...m.legStart]; m.path = [K(...m.legStart)]; } } return true; }
      if (ENTER(code)) { if (!down) return true; if (m.head[0] !== w[0] || m.head[1] !== w[1]) { m.fault('skipped waypoint'); return true; }
        if (m.pending != null) { m.fault('stale overlay'); return true; }
        m.flown.push(...m.path); m.leg++; m.round = m.leg; if (m.leg >= 3) { m.win(); return true; } m.legStart = [...m.head]; m.path = [K(...m.head)]; return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (m.state !== 'play') return [];
      if (m.pending != null) return [['Space', true]]; const w = m.wps[m.leg]; if (m.head[0] === w[0] && m.head[1] === w[1]) return [['Enter', true]];
      const p = bfs(m.head, w, m.haz); if (!p || p.length < 2) return []; const nx = p[1] % GW, ny = Math.floor(p[1] / GW);
      return [[nx > m.head[0] ? 'ArrowRight' : nx < m.head[0] ? 'ArrowLeft' : ny > m.head[1] ? 'ArrowDown' : 'ArrowUp', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ wps: m.wps, s: m.start, haz: [...m.haz].sort((a, b) => a - b), upd: m.upd });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowRight', '▶'], ['Space', 'Recheck'], ['Enter', 'Engage']];
    m.draw = (c, W, H, P) => {
      const cs = 28, x0 = 12, y0 = 12;
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const k = K(x, y), hz = m.haz.has(k);
        box(c, x0 + x * cs, y0 + y * cs, cs - 3, cs - 3, hz ? 'rgba(255,90,72,.35)' : m.flown.includes(k) ? 'rgba(125,151,232,.25)' : m.path.includes(k) ? 'rgba(244,194,91,.3)' : 'rgba(255,255,255,.05)', hz ? P.bad : null, 3);
        if (hz) txt(c, '✕', x0 + x * cs + 12, y0 + y * cs + 18, { size: 12, align: 'center', col: P.bad }); }
      m.wps.forEach((w, i) => txt(c, 'W' + (i + 1), x0 + w[0] * cs + 12, y0 + w[1] * cs + 17, { size: 10, align: 'center', col: i < m.leg ? COL.dim : COL.peri }));
      lamp(c, x0 + m.head[0] * cs + 12, y0 + m.head[1] * cs + 12, 7, COL.gold, 'diamond');
      box(c, 272, 14, 116, 70, COL.panel, null, 6); lamp(c, 290, 38, 9, m.pending != null ? COL.warn : COL.dim, m.pending != null ? 'triangle' : 'circle');
      txt(c, m.pending != null ? 'UPDATE' : 'overlay ok', 306, 43, { size: 12, col: m.pending != null ? COL.warn : COL.dim });
      txt(c, `leg ${Math.min(3, m.leg + 1)} → W${Math.min(3, m.leg + 1)}`, 284, 70, { size: 12, col: COL.ink });
    };
    return m;
  },
});
