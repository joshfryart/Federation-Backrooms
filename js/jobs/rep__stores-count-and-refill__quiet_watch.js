// Replicator tech: stores count and refill. A carriage swings back and forth over four hoppers holding a canister. Tap Space to drop it while it is
// directly over a hopper that is still under its fill line. Dropping between hoppers spills it, and dropping into a full one overfills it.
import { define, machine, SPACE, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Stores count and refill', type: 'task:quiet_watch' },
  title: 'Canister drop over hoppers', dept: 'services', host: 'console', tool: 'Stores carriage',
  how: 'The carriage swings across the hoppers. Tap Space when it is right over a hopper that is below its fill line to drop a canister in. Spilled or surplus canisters are faults.',
  keys: ['Space drop canister'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'drop over hopper', input: 'space', win: 'every hopper brought to its fill line by canisters dropped from the swinging carriage right over it',
    fail: 'dropping while the carriage is between hoppers, or into a hopper already at its fill line',
    rule: 'The carriage sweeps left and right over four hoppers. Space drops a canister: it must be over a hopper still below its line. Needs differ per hopper.' },
  rush: 'Counted by eye and tipped the canisters in without watching the fill line.',
  captions: { spilled: 'canister clangs on deck', overfilled: 'hopper overflow alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, per = m.calm ? 4.8 : 3.4; m.ph = r() * 0.5; m.need = [0, 1, 2, 3].map(() => ri(r, 1, 3)); m.cool = 0; m.have = m.need.map(() => 0); m.rounds = m.need.reduce((a, b) => a + b, 0); m.round = 0;
    m.pos = () => { const p = (m.t / per + m.ph) % 1; return p < 0.5 ? p * 2 : 2 - p * 2; };
    const over = () => { const x = m.pos() * 4, i = Math.min(3, Math.floor(x)), f = x - i; return f > 0.2 && f < 0.8 ? i : -1; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !SPACE(code)) return false; if (!down || m.cool > 0) return true; const i = over(); m.cool = 0.35;
      if (i < 0) { m.fault('spilled'); return true; } if (m.have[i] >= m.need[i]) { m.fault('overfilled'); return true; }
      m.have[i]++; m.round++; if (m.have.every((h, k) => h >= m.need[k])) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.cool = Math.max(0, m.cool - dt); };
    m.hint = () => { const x = m.pos() * 4, i = over(); return i >= 0 && Math.abs(x - i - 0.5) < 0.18 && m.have[i] < m.need[i] ? [['Space', true]] : []; };
    m.bad = () => over() >= 0 ? null : 'Space';
    m.view = () => ({ need: m.need.slice(), ph: +m.ph.toFixed(2) });
    m.buttons = () => [['Space', 'Drop']];
    m.draw = (c, W, H, P) => {
      m.need.forEach((n, i) => { const x = 14 + i * 94; box(c, x, 70, 84, 70, 'rgba(255,255,255,.05)', m.have[i] >= n ? P.good : COL.dim, 8); for (let k = 0; k < n; k++) { c.fillStyle = k < m.have[i] ? COL.pale : 'rgba(255,255,255,.12)'; c.fillRect(x + 10 + k * 24, 108 - 0, 20, 20); } txt(c, `H${i + 1} ${m.have[i]}/${n}${m.have[i] >= n ? ' ✓' : ''}`, x + 8, 88, { size: 12 }); });
      const px = 14 + m.pos() * 376; c.fillStyle = COL.gold; c.fillRect(px - 8, 30, 16, 14); c.fillRect(px - 2, 44, 4, 12); txt(c, 'carriage', 14, 22, { size: 11, col: COL.dim });
    };
    return m;
  },
});
