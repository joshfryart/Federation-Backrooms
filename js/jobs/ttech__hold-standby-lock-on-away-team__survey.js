// Transporter tech: hold a standby lock on the away team. Keep the lock reticle on the team's dot as it wanders across the map (hold the
// arrows), and watch the beacon range bar. Every so often the primary beacon starts to fade: the instant the bar sinks under its marked
// level, switch to the backup beacon (Space). Switching early resets the comm for nothing; a beacon that fades to zero is a team you cannot
// pull out; letting the reticle wander off the dot lets the lock slip.
import { define, machine, ARROW, SPACE, rf, clamp, txt, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Hold standby lock on away team', type: 'task:survey' },
  title: 'Standby lock with beacon handover', dept: 'operations', host: 'console', tool: 'Standby lock map and range bar',
  how: 'Hold the arrows to keep the reticle on the team dot. When the range bar sinks under its mark, press Space to switch to the backup beacon.',
  keys: ['Arrows (hold) steer the reticle', 'Space switch to backup beacon'], limit: 24, maxFaults: 3,
  fingerprint: { verb: 'shadow handover', input: 'arrows-hold+space', win: 'the standby watch held to the end with the reticle on the team and each fading beacon handed to its backup in time',
    fail: 'handing over while the beacon is still above its mark, letting a beacon fade out, or letting the reticle drift off the team',
    rule: 'Steer the reticle with held arrows so the team dot stays inside its ring. The range bar drifts down during a fade: press Space once it is below the white mark, before it empties.' },
  rush: 'Put the lock on the beacon and went back to the coffee.',
  captions: { 'needless switch': 'comm reset click', 'lost beacon': 'drop-out tone', 'lock slipped': 'lock warble' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 1.5 : 1, R = 18, MARK = 0.35;
    m.watch = 18 * k; m.dot = { x: rf(r, 70, 180), y: rf(r, 50, 120), vx: rf(r, -22, 22), vy: rf(r, -18, 18) }; m.ret = { x: 126, y: 85 };
    m.fades = [rf(r, 2.5, 4.5) * k, rf(r, 10, 12.5) * k]; m.fi = 0; m.str = 1; m.fading = false; m.off = 0; m.rounds = 2; m.round = 0; m.beacon = 'PRIMARY'; m.hand = 0;
    m.key = (code, down = true) => {
      const a = ARROW(code); if (a) { m.held[a] = !!down; return true; } if (!SPACE(code)) return false; if (m.state !== 'play' || !down) return true;
      if (m.str >= MARK) { m.fault('needless switch'); return true; }
      m.str = 1; m.fading = false; m.round++; m.hand++; m.beacon = m.beacon === 'PRIMARY' ? 'BACKUP' : 'PRIMARY'; m.ev('handover'); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const d = m.dot, h = m.held, sp = 60;
      d.vx = clamp(d.vx + rf(m.rnd, -30, 30) * dt, -26, 26); d.vy = clamp(d.vy + rf(m.rnd, -30, 30) * dt, -22, 22); d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < 24 || d.x > 230) { d.vx = -d.vx; d.x = clamp(d.x, 24, 230); } if (d.y < 28 || d.y > 150) { d.vy = -d.vy; d.y = clamp(d.y, 28, 150); }
      m.ret.x = clamp(m.ret.x + ((h.R ? 1 : 0) - (h.L ? 1 : 0)) * sp * dt, 16, 238); m.ret.y = clamp(m.ret.y + ((h.D ? 1 : 0) - (h.U ? 1 : 0)) * sp * dt, 20, 158);
      if (Math.hypot(d.x - m.ret.x, d.y - m.ret.y) > R) { m.off += dt; if (m.off > 1.5) { m.off = 0; m.fault('lock slipped'); } } else m.off = Math.max(0, m.off - dt);
      if (!m.fading && m.fi < m.fades.length && m.t >= m.fades[m.fi]) { m.fading = true; m.fi++; }
      if (m.fading) { m.str -= dt * (m.str > MARK ? 0.22 : 0.2) / k; if (m.str <= 0) { m.fault('lost beacon'); m.str = 1; m.fading = false; m.round++; } }
      if (m.state === 'play' && m.t >= m.watch) { if (m.hand >= 2) m.win(); else m.fail('lost beacon'); }
    };
    m.hint = () => { const dx = m.dot.x - m.ret.x, dy = m.dot.y - m.ret.y, out = [['ArrowRight', dx > 3], ['ArrowLeft', dx < -3], ['ArrowDown', dy > 3], ['ArrowUp', dy < -3]]; if (m.str < MARK - 0.03) out.push(['Space', true]); return out; };
    m.bad = () => (m.str >= MARK ? 'Space' : null);
    m.view = () => ({ f: m.fades.map(x => +x.toFixed(2)), d: [Math.round(m.dot.x), Math.round(m.dot.y)] });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Backup beacon']];
    m.draw = (c, W, H, P) => {
      c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 1; c.strokeRect(14, 18, 228, 144); txt(c, 'TEAM MAP', 18, 30, { size: 9, col: COL.dim });
      const on = Math.hypot(m.dot.x - m.ret.x, m.dot.y - m.ret.y) <= R; lamp(c, m.dot.x, m.dot.y, 6, COL.gold, 'diamond');
      c.strokeStyle = on ? P.good : P.bad; c.lineWidth = 2; c.beginPath(); c.arc(m.ret.x, m.ret.y, R, 0, 6.283); c.stroke(); txt(c, on ? 'ON' : 'OFF', m.ret.x, m.ret.y - R - 3, { size: 9, col: on ? P.good : P.bad, align: 'center' });
      txt(c, `BEACON ${m.beacon}`, 256, 30, { size: 11, col: COL.pale }); bar(c, 256, 40, 130, 12, m.str, { mark: MARK, col: m.str < MARK ? COL.warn : COL.peri });
      txt(c, m.str < MARK ? 'UNDER MARK — switch!' : m.fading ? 'fading…' : 'steady', 256, 70, { size: 11, col: m.str < MARK ? P.bad : COL.ink });
      txt(c, `watch ${Math.max(0, m.watch - m.t).toFixed(0)} s left`, 256, 100, { size: 11, col: COL.dim }); txt(c, `handovers ${m.round} / 2`, 256, 118, { size: 11, col: COL.dim });
    };
    return m;
  },
});
