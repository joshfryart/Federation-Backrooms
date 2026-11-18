// Helm: best-speed run to the stricken site. Keep the throttle held at the cruise notch the whole way, slip between the three traffic lanes
// round debris, and ease off only through the marked slow zones. Easing off with nothing ahead is lost time (a fault), so is a hit or speeding.
import { define, machine, ARROW, SPACE, ri, rf, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Best-speed run to the stricken site', type: 'task:medical_relief' },
  title: 'Best-speed lane run', dept: 'flight', host: 'console', tool: 'Helm throttle and lane steering',
  how: 'Hold Space at the cruise notch the whole way, slip lanes (← / →) round debris, and let go of Space only through a marked slow zone.',
  keys: ['Space hold: throttle', '← / → lane'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'lane-run', input: 'arrows+space-hold', win: 'the ship reaches the site at cruise with no hits, no speeding through slow zones and no needless easing',
    fail: 'hitting debris, holding cruise through a slow zone, or easing off with a clear lane ahead',
    rule: 'Space held keeps cruise speed; ← / → switch lane. Debris blocks a lane; a yellow slow zone spans all lanes: be off the throttle inside it, and on it everywhere else.' },
  rush: 'Ran the whole way at cruise and let the deflector take the debris.',
  captions: { hit: 'deflector thump', overspeed: 'overspeed klaxon', 'eased off': 'helm officer sighs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, len = 14; m.obs = []; m.zones = [];
    for (let x = 2.5; x < len - 1; x += rf(r, 1.3, 2.0)) { if (r() < 0.22) { m.zones.push([x, x + 1.4]); x += 1.4; continue; } m.obs.push({ x, lane: ri(r, 0, 2), hit: false }); }
    m.d = 0; m.lane = 1; m.v = 0.5; m.slack = 0; m.inZoneFast = 0;
    const zoneAt = (x) => m.zones.find(([a, b]) => x >= a && x <= b);
    m.key = (code, down = true) => { if (m.state !== 'play') return false; if (SPACE(code)) { m.held.S = down; return true; } const a = ARROW(code); if (a === 'L' || a === 'R') { if (down) m.lane = Math.max(0, Math.min(2, m.lane + (a === 'R' ? 1 : -1))); return true; } return false; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.v += ((m.held.S ? 1.1 : 0.45) - m.v) * Math.min(1, dt * 3); m.d += m.v * dt;
      for (const o of m.obs) if (!o.hit && o.lane === m.lane && Math.abs(o.x - m.d) < 0.12) { o.hit = true; m.fault('hit'); }
      const z = zoneAt(m.d), near = zoneAt(m.d + 0.6);
      if (z && m.v > 0.75) { m.inZoneFast += dt; if (m.inZoneFast > 0.5) { m.fault('overspeed'); m.inZoneFast = -1.5; } } else if (!z) m.inZoneFast = 0;
      if (!z && !near && !m.held.S) { m.slack += dt; if (m.slack > 1.2) { m.fault('eased off'); m.slack = -0.8; } } else m.slack = 0;
      if (m.d >= len) m.win();
    };
    m.hint = () => {
      const out = [], z = zoneAt(m.d) || zoneAt(m.d + 0.6); out.push(['Space', !z]);
      const o = m.obs.find(o => !o.hit && o.x > m.d && o.x - m.d < 0.9 && o.lane === m.lane);
      if (o) { const free = [0, 1, 2].filter(l => !m.obs.some(p => p.lane === l && Math.abs(p.x - o.x) < 0.5)); const t = free.sort((a, b) => Math.abs(a - m.lane) - Math.abs(b - m.lane))[0]; if (t != null) out.push([t > m.lane ? 'ArrowRight' : 'ArrowLeft', true]); }
      return out;
    };
    m.bad = () => { m.held.S = true; const o = m.obs.find(o => !o.hit && o.x > m.d); return o && o.lane !== m.lane ? (o.lane > m.lane ? 'ArrowRight' : 'ArrowLeft') : 'Space'; };
    m.view = () => ({ obs: m.obs.map(o => [+o.x.toFixed(2), o.lane]), zones: m.zones.map(z => +z[0].toFixed(2)) });
    m.buttons = () => [['ArrowLeft', '◀ lane'], ['Space', 'Throttle (hold)'], ['ArrowRight', 'lane ▶']];
    m.draw = (c, W, H, P) => {
      const x0 = 40, sc = (W - 60) / 5, ly = (l) => 38 + l * 34;
      for (let l = 0; l < 3; l++) box(c, x0 - 10, ly(l) - 14, W - x0, 28, 'rgba(255,255,255,.04)', null, 8);
      for (const [a, b] of m.zones) { const xa = x0 + (a - m.d) * sc, xb = x0 + (b - m.d) * sc; if (xb > 0 && xa < W) { c.fillStyle = 'rgba(255,179,71,.18)'; c.fillRect(Math.max(30, xa), 22, Math.min(W, xb) - Math.max(30, xa), 102); txt(c, 'SLOW', Math.max(34, xa + 4), 20, { size: 10, col: COL.warn }); } }
      for (const o of m.obs) { const x = x0 + (o.x - m.d) * sc; if (x > 20 && x < W) { c.fillStyle = o.hit ? P.bad : COL.lav; c.beginPath(); c.moveTo(x, ly(o.lane) - 10); c.lineTo(x + 10, ly(o.lane)); c.lineTo(x, ly(o.lane) + 10); c.lineTo(x - 10, ly(o.lane)); c.closePath(); c.fill(); } }
      c.fillStyle = COL.gold; c.beginPath(); c.moveTo(x0 + 14, ly(m.lane)); c.lineTo(x0 - 8, ly(m.lane) - 9); c.lineTo(x0 - 8, ly(m.lane) + 9); c.closePath(); c.fill();
      txt(c, `Speed ${(m.v * 9).toFixed(1)} c-units  ·  ${m.held.S ? 'CRUISE' : 'easing'}`, 12, H - 14, { size: 12, col: m.held.S ? COL.pale : COL.warn });
      txt(c, `${Math.round(Math.min(1, m.d / len) * 100)} %`, W - 12, H - 14, { size: 12, align: 'right', col: COL.peri });
    };
    return m;
  },
});
