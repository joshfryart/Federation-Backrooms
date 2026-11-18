// Navigator: plot the orbit and transporter-range hold. The ship circles the stricken world and only the shaded arc is in transporter
// range. Each lock needs a set time in range, so first pick an orbit height (↑ ↓) whose pass through the arc is long enough: higher is
// slower and the arc wider. Then hold the transporter key (Space) while the marker is in the arc until the lock completes. Keying out
// of range, letting go early, or riding out of the arc mid-lock is a fault.
import { define, machine, ARROW, SPACE, rf, txt, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'nav', label: 'Plot orbit and transporter-range hold', type: 'task:medical_relief' },
  title: 'Orbit height and range-arc lock', dept: 'flight', host: 'console', tool: 'Orbit ring template and lock schedule',
  how: 'On the far side of the world, set an orbit height (↑ ↓) whose arc pass is longer than the lock needs, then hold Space while the ship is inside the range arc until the lock completes.',
  keys: ['↑ ↓ orbit height', 'hold Space: transporter lock'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'ride the arc', input: 'arrows+space-hold', win: 'three transporter locks completed, each from an orbit whose range-arc pass outlasts the lock and held inside the arc',
    fail: 'keying the lock out of range, releasing before the lock completes, or an orbit that carries the ship out of the arc mid-lock',
    rule: 'The card shows the pass time at the chosen height against the lock time needed: raise the orbit until the pass is longer. In the arc, hold Space until the lock bar fills, then let go.' },
  rush: 'Plotted the standard orbit and left the transporter chief to chase the lock.',
  captions: { 'out of range': 'transporter null tone', 'lock dropped': 'lock fade', 'lock slipped': 'lock fade' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, sl = m.calm ? 0.8 : 1;
    const half = (h) => 0.3 + 0.12 * h, w = (h) => (1.8 - 0.22 * h) * sl, pass = (h) => 2 * half(h) / w(h);
    m.h = 0; m.a = Math.PI / 2 + rf(r, -0.3, 0.3); m.prog = 0; m.used = false; m.rounds = 3; m.round = 0;
    m.newLock = () => { m.need = rf(r, 0.45, 1.3) * (m.calm ? 1.1 : 1); m.prog = 0; };
    m.newLock();
    const off = () => { let d = (m.a + Math.PI / 2) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; return d; };
    const inArc = () => Math.abs(off()) <= half(m.h);
    const good = () => { for (let h = 0; h <= 4; h++) if (pass(h) >= m.need + 0.3) return h; return 4; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { if (down && Math.abs(off()) > Math.PI / 2) m.h = Math.max(0, Math.min(4, m.h + (a === 'U' ? 1 : -1))); return true; }
      if (!SPACE(code)) return !!a;
      if (down) { if (m.held.S) return true; if (!inArc()) { m.fault('out of range'); return true; } if (!m.used) m.held.S = true; return true; }
      if (m.held.S) { m.held.S = false; if (m.prog < m.need) { m.fault('lock dropped'); m.prog = 0; m.used = true; } } return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const was = inArc(); m.a = (m.a + w(m.h) * dt) % (2 * Math.PI);
      if (!inArc()) { if (was && m.held.S && m.prog < m.need) { m.fault('lock slipped'); m.prog = 0; } m.held.S = false; m.used = false; return; }
      if (m.held.S && !m.used) { m.prog += dt; if (m.prog >= m.need) { m.held.S = false; m.used = true; m.round++; m.ev('lock'); if (m.round >= 3) m.win(); else m.newLock(); } }
    };
    m.hint = () => {
      if (!inArc()) { const g = good(); if (m.h !== g && Math.abs(off()) > Math.PI / 2) return [['Space', false], [g > m.h ? 'ArrowUp' : 'ArrowDown', true]]; return [['Space', false]]; }
      if (m.used) return [['Space', false]]; return [['Space', true]];
    };
    m.bad = () => (inArc() ? null : 'Space');
    m.view = () => ({ need: +m.need.toFixed(3), a: +m.a.toFixed(3) });
    m.buttons = () => [['ArrowUp', '▲ higher'], ['ArrowDown', '▼ lower'], ['Space', 'Lock (hold)']];
    m.draw = (c, W, H, P) => {
      const cx = 90, cy = 86, R = 40 + m.h * 8; c.fillStyle = COL.lav; c.beginPath(); c.arc(cx, cy, 22, 0, 6.283); c.fill();
      c.strokeStyle = 'rgba(79,208,106,.5)'; c.lineWidth = 10; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2 - half(m.h), -Math.PI / 2 + half(m.h)); c.stroke();
      c.strokeStyle = COL.peri; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, R, 0, 6.283); c.stroke();
      const ia = inArc(); lamp(c, cx + Math.cos(m.a) * R, cy + Math.sin(m.a) * R, 6, ia ? P.good : COL.gold, ia ? 'circle' : 'triangle');
      txt(c, `LOCK ${Math.min(3, m.round + 1)} / 3`, 190, 24, { size: 12, col: COL.peri });
      txt(c, `orbit height ${m.h + 1} / 5`, 190, 46, { size: 11 });
      const ok = pass(m.h) >= m.need; txt(c, `arc pass ${pass(m.h).toFixed(1)} s · lock needs ${m.need.toFixed(1)} s`, 190, 66, { size: 11, col: ok ? P.good : P.bad });
      txt(c, ia ? 'IN RANGE' : 'out of range', 190, 92, { size: 11, col: ia ? P.good : COL.dim });
      txt(c, 'lock', 190, 120, { size: 10, col: COL.dim }); bar(c, 220, 112, 160, 10, m.prog / m.need, { col: COL.lav });
    };
    return m;
  },
});
