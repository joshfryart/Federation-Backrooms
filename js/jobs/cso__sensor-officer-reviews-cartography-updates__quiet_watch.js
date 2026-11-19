// Chief science officer: the sensor officer reviews cartography updates. Each revised star arrives as a marker at its new coordinates. Hold
// the arrows to drag the marker back onto its charted point (the cross); the readout keeps the distance it has moved. Compare that offset
// with the error ring for the star's survey class: inside the ring approve the update (Enter); outside it, or wildly off like a mis-keyed
// coordinate, flag it (Space). Ruling before the marker sits on its charted point, approving a phantom, or flagging a good fix is a fault.
import { define, machine, ARROW, SPACE, ENTER, rf, pick, txt, box, COL } from './kit.js';

const RING = { A: 6, B: 12, C: 20 }, NAMES = ['Kepler 442', 'Gliese 581', 'Wolf 359', 'Ross 128', 'Lalande 21185', 'Tau Ceti', 'Groombridge 34', 'Struve 2398'];
export default define({
  job: { billet: 'cso', label: 'Sensor officer reviews cartography updates', type: 'task:quiet_watch' },
  title: 'Star update overlay and ring', dept: 'sciences', host: 'console', tool: 'Master star chart',
  how: 'Hold the arrows to drag each updated star marker onto its charted cross. Read the offset you moved it against the error ring for its survey class: inside, approve with Enter; outside, flag it with Space.',
  keys: ['arrows hold: drag marker', 'Enter approve', 'Space flag'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'overlay and measure', input: 'arrows-hold+enter+space', win: 'each revised star dragged back onto its charted cross and approved only when the measured offset sits inside its survey-class ring',
    fail: 'approving a mis-keyed coordinate or out-of-ring move, flagging a fix that sits inside its ring, or ruling before the overlay',
    rule: 'Hold arrows to drag the marker onto its cross; the readout shows how far it moved. Class rings: A 6, B 12, C 20. Offset within ring = Enter; beyond = Space.' },
  rush: 'Accepted the whole update feed into the master chart unread.',
  captions: { 'approved phantom': 'chart commit chime', 'flagged good fix': 'flag tone', 'not overlaid': 'overlay error buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, sp = m.calm ? 32 : 40, snap = 1.6, names = [...NAMES];
    m.stars = [0, 1, 2, 3].map(k => { const cls = pick(r, ['A', 'B', 'C']), kind = k === 0 ? 'in' : pick(r, ['in', 'out', 'typo']), ring = RING[cls], mag = kind === 'in' ? rf(r, 0.3, 0.8) * ring : kind === 'out' ? rf(r, 1.6, 2.4) * ring : rf(r, 45, 60), a = rf(r, 0, 6.283);
      const cx = rf(r, 70, 170), cy = rf(r, 60, 100), nm = names.splice(Math.floor(r() * names.length), 1)[0];
      return { nm, cls, kind, cx, cy, sx: Math.max(18, Math.min(232, cx + Math.cos(a) * mag)), sy: Math.max(24, Math.min(136, cy + Math.sin(a) * mag)) }; });
    for (const s of m.stars) { s.off = Math.hypot(s.sx - s.cx, s.sy - s.cy); s.ok = s.off <= RING[s.cls]; }
    m.i = 0; m.dn = {}; m.bf = 0; m.rounds = 4; m.round = 1; const st = () => m.stars[m.i]; m.p = [st().sx, st().sy];
    const on = () => Math.hypot(m.p[0] - st().cx, m.p[1] - st().cy) <= snap;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (a) { m.dn[a] = down; return true; } if (!SPACE(code) && !ENTER(code)) return false;
      const e = down && !m.dn[code]; m.dn[code] = down; if (!e) return true; const s = st();
      if (!on()) { m.fault('not overlaid'); return true; }
      if (ENTER(code) && !s.ok) { m.fault('approved phantom'); return true; } if (SPACE(code) && s.ok) { m.fault('flagged good fix'); return true; }
      m.i++; m.round = Math.min(4, m.i + 1); if (m.i >= 4) m.win(); else { m.p = [st().sx, st().sy]; m.dn = {}; } return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.p[0] = Math.max(4, Math.min(246, m.p[0] + ((m.dn.R ? 1 : 0) - (m.dn.L ? 1 : 0)) * sp * dt)); m.p[1] = Math.max(4, Math.min(146, m.p[1] + ((m.dn.D ? 1 : 0) - (m.dn.U ? 1 : 0)) * sp * dt)); };
    m.hint = () => {
      const s = st(); if (!s) return []; const dx = s.cx - m.p[0], dy = s.cy - m.p[1], th = 0.7;
      const out = [['ArrowRight', dx > th], ['ArrowLeft', dx < -th], ['ArrowDown', dy > th], ['ArrowUp', dy < -th]];
      if (Math.abs(dx) <= th && Math.abs(dy) <= th) { const k = s.ok ? 'Enter' : 'Space'; out.push([k, !m.dn[k]]); } return out;
    };
    m.bad = () => ['Enter', ++m.bf % 2 === 0];
    m.view = () => ({ stars: m.stars.map(s => [s.nm, s.cls, s.kind, Math.round(s.off)]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Enter', 'Approve'], ['Space', 'Flag']];
    m.draw = (c, W, H, P) => {
      const s = st(); if (!s) return; box(c, 10, 10, 250, 150, 'rgba(255,255,255,.04)', COL.dim, 4);
      m.stars.forEach((o, k) => { if (k !== m.i) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(10 + o.cx - 1, 10 + o.cy - 1, 2, 2); } });
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(10 + s.cx - 6, 10 + s.cy); c.lineTo(10 + s.cx + 6, 10 + s.cy); c.moveTo(10 + s.cx, 10 + s.cy - 6); c.lineTo(10 + s.cx, 10 + s.cy + 6); c.stroke();
      c.setLineDash?.([3, 3]); c.strokeStyle = COL.dim; c.beginPath(); c.moveTo(10 + s.sx, 10 + s.sy); c.lineTo(10 + m.p[0], 10 + m.p[1]); c.stroke(); c.setLineDash?.([]);
      c.strokeStyle = on() ? P.good : COL.peri; c.beginPath(); c.arc(10 + m.p[0], 10 + m.p[1], 5, 0, 6.283); c.stroke();
      const moved = Math.hypot(m.p[0] - s.sx, m.p[1] - s.sy);
      txt(c, `${s.nm}  class ${s.cls}`, 270, 26, { size: 11, col: COL.gold }); txt(c, `moved ${moved.toFixed(1)}″`, 270, 48, { size: 13, col: COL.ink });
      txt(c, on() ? 'ON CHARTED POINT' : 'drag onto the cross', 270, 66, { size: 10, col: on() ? P.good : COL.dim });
      txt(c, 'ERROR RINGS', 270, 92, { size: 10, col: COL.dim }); ['A', 'B', 'C'].forEach((k, j) => txt(c, `class ${k}  ≤ ${RING[k]}″`, 270, 108 + j * 14, { size: 11, col: k === s.cls ? COL.pale : COL.dim }));
      txt(c, `star ${m.i + 1} / 4`, 270, 160, { size: 10, col: COL.dim });
    };
    return m;
  },
});
