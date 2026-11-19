// Armory, shakedown: live-fire calibration at the range. With the zapper braced on the bench rest, fire a three-shot group (Space, letting the
// recoil settle between shots). Read where the group's centre sits above or below the bullseye on the ruler, then turn the elevation screw a
// quarter turn at a time (↑ raises the impact 2 cm, ↓ lowers it) to bring it to centre. Fire a second group to confirm the zero holds inside the
// centre ring. Touching the screw before the group is complete, or snatching shots, is a fault; a confirming group outside the ring is too.
import { define, machine, ARROW, SPACE, ri, rf, txt, box, COL } from './kit.js';

const STEP = 2, RING = 1.5;
export default define({
  job: { billet: 'armory', label: 'Live-fire calibration at the range', type: 'task:shakedown' },
  title: 'Three-shot group and elevation zero', dept: 'security', host: 'console', tool: 'Range target, ruler and spanner',
  how: 'Fire three shots (Space), waiting for the recoil each time. Read the group centre on the ruler, turn the elevation screw (↑ / ↓, 2 cm per quarter turn) to cancel it, then fire a confirming group: it must land in the centre ring.',
  keys: ['Space fire', '↑ quarter turn up (+2 cm)', '↓ quarter turn down (−2 cm)'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'group and zero', input: 'arrows+space', win: 'two zappers zeroed: a full three-shot group read, the elevation screw turned the right number of quarter turns, and a confirming group landing inside the centre ring',
    fail: 'turning the screw off a single shot, snatching shots before the recoil settles, or a confirming group that lands outside the centre ring',
    rule: 'Space three times, a beat apart. The ruler shows the group centre in cm: each ↑ adds 2 cm, each ↓ takes 2 cm off. Cancel the offset, then fire three more to confirm inside the ring.' },
  rush: 'Fired one shot, eyeballed it and tightened the screw a turn.',
  captions: { 'chased a shot': 'spanner clinks', flinched: 'shot goes wide', 'off zero': 'range officer: off zero' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, cool = m.calm ? 0.3 : 0.4;
    m.guns = [0, 1].map(() => { const k = ri(r, 2, 5) * (r() < 0.5 ? -1 : 1); return { z: k * STEP + rf(r, -0.3, 0.3), adj: 0, adj0: 0, shots: [], phase: 'group', confirm: false }; });
    m.g = 0; m.cd = 0; m.rounds = 2; m.round = 0;
    const G = () => m.guns[m.g], mean = (g) => g.shots.reduce((a, b) => a + b, 0) / (g.shots.length || 1);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), g = G(); if (!g) return false;
      if (a === 'U' || a === 'D') { if (g.phase !== 'adjust') { m.fault('chased a shot'); return true; } g.adj += a === 'U' ? 1 : -1; return true; }
      if (a) return true;
      if (SPACE(code)) {
        if (m.cd > 0) { m.fault('flinched'); return true; }
        if (g.phase === 'adjust') { g.phase = 'group'; g.confirm = true; g.shots = []; }
        if (g.phase !== 'group') return true;
        g.shots.push(g.z + g.adj * STEP + rf(m.rnd, -0.6, 0.6)); m.cd = cool;
        if (g.shots.length === 3) {
          if (!g.confirm) { g.phase = 'adjust'; g.adj0 = g.adj; }
          else if (Math.abs(mean(g)) <= RING) { m.g++; m.round++; if (m.g >= m.guns.length) m.win(); }
          else { m.fault('off zero'); g.phase = 'adjust'; g.adj0 = g.adj; }
        }
        return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.cd > 0) m.cd = Math.max(0, m.cd - dt); };
    m.hint = () => {
      const g = G(); if (!g || m.cd > 0) return [];
      if (g.phase === 'adjust') { const need = Math.round(-mean(g) / STEP) - (g.adj - g.adj0); if (need !== 0) return [[need > 0 ? 'ArrowUp' : 'ArrowDown', true]]; }
      return [['Space', true]];
    };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ z: m.guns.map(g => +g.z.toFixed(2)) });
    m.buttons = () => [['Space', 'Fire'], ['ArrowUp', '▲ ¼ turn'], ['ArrowDown', '▼ ¼ turn']];
    m.draw = (c, W, H, P) => {
      const g = G() || m.guns[m.guns.length - 1], cx = 110, cy = 85, sc = 6;
      txt(c, `ZAPPER ${Math.min(m.g + 1, 2)} / 2 · ${g.confirm ? 'CONFIRMING GROUP' : 'FIRST GROUP'}`, 14, 16, { size: 11, col: COL.peri });
      for (const rr of [6, 4, RING]) { c.beginPath(); c.arc(cx, cy, rr * sc * 1.6, 0, 6.283); c.strokeStyle = rr === RING ? P.good : COL.dim; c.lineWidth = 2; c.stroke(); }
      g.shots.forEach((y, k) => { c.beginPath(); c.arc(cx + (k - 1) * 7, cy - y * sc * 1.6, 4, 0, 6.283); c.fillStyle = COL.gold; c.fill(); });
      for (let v = -12; v <= 12; v += 4) txt(c, `${v > 0 ? '+' : ''}${v}`, 200, cy - v * sc * 0.55 + 4, { size: 9, col: COL.dim });
      if (g.shots.length === 3 || g.phase === 'adjust') { const mu = mean(g); box(c, 228, cy - mu * sc * 0.55 - 2, 14, 4, COL.warn); txt(c, `group centre ${mu >= 0 ? '+' : ''}${mu.toFixed(1)} cm`, 250, 50, { size: 13, col: COL.warn }); }
      txt(c, `screw: ${g.adj >= 0 ? '+' : ''}${g.adj} quarter turns (${g.adj * STEP >= 0 ? '+' : ''}${g.adj * STEP} cm)`, 250, 80, { size: 11 });
      txt(c, `shots ${g.shots.length} / 3`, 250, 104, { size: 11, col: COL.dim }); txt(c, m.cd > 0 ? 'recoil…' : 'ready', 250, 124, { size: 11, col: m.cd > 0 ? COL.warn : P.good });
    };
    return m;
  },
});
