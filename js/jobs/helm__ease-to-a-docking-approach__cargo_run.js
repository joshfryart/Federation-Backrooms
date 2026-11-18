// Helm: ease to a docking approach with a loaded hold. The brake does not bite at once: the longer you hold Space, the harder it grips, and
// it eases off over a moment when you let go. Hard braking shifts the cargo. Read range and closing speed off the approach board and brake
// so the ship reaches the dock marker inside the green speed band: too fast and you go round, too soft and it stalls short of the collar.
import { define, machine, SPACE, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Ease to a docking approach', type: 'task:cargo_run' },
  title: 'Ramping brake approach with cargo aboard', dept: 'flight', host: 'console', tool: 'Approach board and brake',
  how: 'Hold Space to brake: the grip builds the longer you hold and fades after you let go. Reach the dock marker inside the green speed band, and keep the cargo shift needle under its line.',
  keys: ['Space hold: brake'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'brake to marker', input: 'space-hold', win: 'two approaches reach the dock marker inside the green speed band with the cargo shift needle kept under its line',
    fail: 'arriving too fast so the ship must go round, braking so much it stalls short, or gripping so hard the cargo shifts',
    rule: 'Holding Space builds brake grip gradually; releasing lets it fade. Closing speed falls with the grip. At the marker the speed must be in the green band; heavy grip drives the cargo shift needle over its line.' },
  rush: 'Stood on the brake at the last moment and let the cargo crew re-stack.',
  captions: { 'went round': 'approach control: go round', 'stalled short': 'thrusters cough', 'cargo shifted': 'crates slide in the hold' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? [0.04, 0.17] : [0.05, 0.15], line = 1;
    m.aps = [[rf(r, 1.0, 1.3), rf(r, 0.3, 0.36)], [rf(r, 1.0, 1.3), rf(r, 0.3, 0.36)]]; m.n = 0; m.rounds = 2; m.round = 0;
    const load = () => { [m.d, m.v] = m.aps[m.n]; m.a = 0; }; load(); m.shift = 0;
    m.key = (code, down = true) => { if (m.state !== 'play' || !SPACE(code)) return false; m.held.S = down; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.a = m.held.S ? Math.min(0.15, m.a + 0.15 * dt) : Math.max(0, m.a - 0.3 * dt);
      m.v = Math.max(0, m.v - m.a * dt); m.d -= m.v * dt;
      m.shift = Math.max(0, m.shift + (m.a > 0.09 ? (m.a - 0.09) * 25 : -0.3) * dt); if (m.shift > line) { m.fault('cargo shifted'); m.shift = 0.4; }
      if (m.d <= 0) { if (m.v > band[1]) { m.fault('went round'); load(); return; } m.n++; m.round = m.n; if (m.n >= 2) m.win(); else load(); return; }
      if (m.v < 0.02) { m.fault('stalled short'); load(); }
    };
    m.hint = () => { const req = (m.v * m.v - 0.1 * 0.1) / (2 * Math.max(0.02, m.d)); return [['Space', m.a < req]]; };
    m.bad = () => ['Space', true];
    m.view = () => ({ aps: m.aps.map(a => a.map(v => +v.toFixed(3))) });
    m.buttons = () => [['Space', 'Brake (hold)']];
    m.draw = (c, W, H, P) => {
      const x0 = 20, x1 = 300, px = x1 - Math.max(0, m.d) / 1.4 * (x1 - x0);
      c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(x0, 40, x1 - x0 + 20, 26); c.fillStyle = P.good; c.fillRect(x1, 34, 4, 38); txt(c, 'DOCK', x1 + 8, 30, { size: 10, col: P.good });
      c.fillStyle = COL.gold; c.beginPath(); c.moveTo(px + 12, 53); c.lineTo(px - 6, 44); c.lineTo(px - 6, 62); c.closePath(); c.fill();
      txt(c, `range ${(Math.max(0, m.d) * 100).toFixed(0)} m   closing ${(m.v * 10).toFixed(2)} m/s`, x0, 92, { size: 12, col: COL.ink });
      bar(c, x0, 100, 260, 10, m.v / 0.4, { band: [band[0] / 0.4, band[1] / 0.4], col: m.v > band[1] ? COL.warn : COL.gold });
      txt(c, `brake grip ${Math.round(m.a / 0.15 * 100)} %`, x0, 132, { size: 11, col: COL.pale }); bar(c, x0 + 110, 124, 150, 8, m.a / 0.15, { col: COL.peri });
      box(c, 312, 82, 76, 76, COL.panel, null, 6); txt(c, 'CARGO', 322, 98, { size: 10, col: COL.dim });
      bar(c, 322, 108, 56, 10, m.shift / 1.2, { mark: line / 1.2, col: m.shift > 0.7 ? COL.warn : COL.lav }); txt(c, m.shift > 0.7 ? 'SHIFTING' : 'stowed', 322, 140, { size: 11, col: m.shift > 0.7 ? COL.warn : COL.dim });
      txt(c, `approach ${Math.min(2, m.n + 1)} / 2`, W - 12, 20, { size: 11, align: 'right', col: COL.dim });
    };
    return m;
  },
});
