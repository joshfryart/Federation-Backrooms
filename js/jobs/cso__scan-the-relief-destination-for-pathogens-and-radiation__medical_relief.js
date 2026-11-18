// Chief science officer: scan the relief destination for pathogens and radiation. Steer the scan cone over the surface grid; a sector is
// covered once the cone has dwelt on it. Holding an arrow keeps accelerating the cone, and past the speed limit the sweep smears (a fault, the
// cone stops): pulse the keys. Sectors that flash over the threshold need a resample: hold Space on them.
import { define, machine, ARROW, SPACE, shuffle, clamp, txt, box, COL } from './kit.js';

const CW = 6, CH = 3;
export default define({
  job: { billet: 'cso', label: 'Scan the relief destination for pathogens and radiation', type: 'task:medical_relief' },
  title: 'Surface scan coverage', dept: 'sciences', host: 'console', tool: 'Science station scan cone',
  how: 'Steer the scan cone (arrows) over every sector of the landing area until each is covered; tap the arrows rather than holding them. Hold Space on any sector that flashes to resample it.',
  keys: ['arrows steer (tap)', 'Space hold: resample'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'sweep coverage', input: 'arrows-hold+space-hold', win: 'every sector of the grid covered by the cone and every flashing sector resampled',
    fail: 'driving the cone past its speed limit so the sweep smears',
    rule: 'The cone speeds up the longer an arrow is held; past the red speed mark the sweep smears and stops. A sector turns green after about half a second under the cone. Flashing sectors are over threshold: hold Space on them for a second.' },
  rush: 'Ran one fast pass down the middle and logged the area clean.',
  captions: { smeared: 'scan noise burst' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, vmax = m.calm ? 2.4 : 2.0, acc = 4.5;
    m.cov = Array(CW * CH).fill(0); m.hot = new Set(shuffle(r, [...Array(CW * CH).keys()]).slice(0, 2)); m.res = {}; m.p = [r() * (CW - 1) + 0.5, r() * (CH - 1) + 0.5]; m.v = [0, 0];
    const cell = () => Math.min(CW - 1, Math.floor(m.p[0])) + CW * Math.min(CH - 1, Math.floor(m.p[1]));
    const left = () => m.cov.findIndex((v, i) => v < 0.5 || (m.hot.has(i) && !(m.res[i] >= 1)));
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const a = ARROW(code); if (a) { m.held[a] = down; return true; } if (SPACE(code)) { m.held.S = down; return true; } return false; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const ax = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0), ay = (m.held.D ? 1 : 0) - (m.held.U ? 1 : 0);
      for (const [k, a] of [[0, ax], [1, ay]]) m.v[k] = a ? m.v[k] + a * acc * dt : m.v[k] * Math.exp(-dt * 6);
      if (Math.hypot(m.v[0], m.v[1]) > vmax) { m.fault('smeared'); m.v = [0, 0]; m.held = {}; }
      m.p = [clamp(m.p[0] + m.v[0] * dt, 0.01, CW - 0.01), clamp(m.p[1] + m.v[1] * dt, 0.01, CH - 0.01)];
      const i = cell(); if (Math.hypot(m.v[0], m.v[1]) < 1.2) m.cov[i] = Math.min(1, m.cov[i] + dt * 2.4);
      if (m.held.S && m.hot.has(i) && m.cov[i] >= 0.5) m.res[i] = (m.res[i] || 0) + dt;
      if (left() < 0) m.win();
    };
    m.hint = () => {
      const k = left(); if (k < 0) return []; const tx = k % CW + 0.5, ty = Math.floor(k / CW) + 0.5, dx = tx - m.p[0], dy = ty - m.p[1], sp = Math.hypot(m.v[0], m.v[1]), out = [];
      const ax = Math.abs(dx) > 0.15 && sp < 1.1 && Math.sign(dx) * m.v[0] < 1.0 && (Math.abs(dx) > 0.5 || Math.abs(m.v[0]) < 0.3), ay = Math.abs(dy) > 0.15 && sp < 1.1 && Math.sign(dy) * m.v[1] < 1.0 && (Math.abs(dy) > 0.5 || Math.abs(m.v[1]) < 0.3);
      out.push(['ArrowRight', ax && dx > 0], ['ArrowLeft', ax && dx < 0], ['ArrowDown', ay && dy > 0], ['ArrowUp', ay && dy < 0]);
      out.push(['Space', cell() === k && m.hot.has(k) && m.cov[k] >= 0.5]); return out;
    };
    m.bad = () => 'ArrowRight';
    m.view = () => ({ hot: [...m.hot], p: m.p.map(v => +v.toFixed(2)) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Resample']];
    m.draw = (c, W, H, P) => {
      const gx = 14, gy = 14, cw = 46, ch = 40;
      for (let i = 0; i < CW * CH; i++) { const x = gx + (i % CW) * cw, y = gy + Math.floor(i / CW) * ch, hot = m.hot.has(i) && m.cov[i] >= 0.5, done = m.cov[i] >= 0.5 && (!m.hot.has(i) || m.res[i] >= 1);
        box(c, x + 1, y + 1, cw - 2, ch - 2, done ? 'rgba(79,208,106,.3)' : hot ? (Math.floor(m.t * 4) % 2 ? 'rgba(255,179,71,.5)' : 'rgba(255,179,71,.2)') : `rgba(125,151,232,${0.06 + m.cov[i] * 0.3})`, hot && !done ? COL.warn : null, 4); if (hot && !done) txt(c, '!', x + cw / 2, y + ch / 2 + 5, { size: 14, align: 'center', col: COL.warn }); }
      const px = gx + m.p[0] * cw, py = gy + m.p[1] * ch, sp = Math.hypot(m.v[0], m.v[1]); c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.arc(px, py, 14, 0, 6.283); c.stroke();
      txt(c, 'CONE SPEED', 302, 30, { size: 10, col: COL.dim }); c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(302, 38, 90, 10); c.fillStyle = sp > vmax * 0.8 ? P.bad : COL.peri; c.fillRect(302, 38, Math.min(90, sp / vmax * 90), 10); c.fillStyle = P.bad; c.fillRect(392, 34, 2, 18);
      txt(c, `covered ${m.cov.filter(v => v >= 0.5).length} / ${CW * CH}`, 302, 74, { size: 11, col: COL.pale });
    };
    return m;
  },
});
