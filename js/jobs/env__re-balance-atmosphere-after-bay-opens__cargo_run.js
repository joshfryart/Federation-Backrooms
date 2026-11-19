// Environmental tech: re-balance the atmosphere after the bay opens (cargo run). Two controls move the cargo bay's pressure toward the corridor's:
// the bay intake valve (Left/Right) and the transfer damper (Up/Down). Every notch also shifts air out of the aft decks, and which control drags
// the aft CO2 up changes notch by notch. Try a notch, watch the aft CO2 bar; if it climbs out of band, roll that notch straight back and use the
// other control. Log the balance (Enter) when the bay marker sits on the corridor line with the CO2 in band.
import { define, machine, ARROW, ENTER, ri, pick, clamp, txt, bar, box, COL } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Re-balance atmosphere after bay opens', type: 'task:cargo_run' },
  title: 'Two-zone notch trial and roll back', dept: 'engineering', host: 'console', tool: 'Aft balance console',
  how: 'Move the bay pressure onto the corridor line one notch at a time with the intake valve (Left/Right) or the transfer damper (Up/Down). If a notch sends the aft CO2 out of band, roll it back at once and use the other control. Enter logs.',
  keys: ['Left / Right intake valve', 'Up / Down transfer damper', 'Enter log the balance'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'trial-notch rollback', input: 'arrows+enter', win: 'bay pressure walked onto the corridor line notch by notch, every CO2-raising notch rolled back, logged with the aft CO2 in band',
    fail: 'keeping a notch that drags the aft deck CO2 out of band, or logging the balance off the corridor line',
    rule: 'Each notch moves the bay marker one step. Watch the aft CO2 for half a second after each notch: if it leaves its band, press the opposite key on the SAME control to roll it back, then try the other control.' },
  rush: 'Wound the intake open until the bay gauge matched and logged it without a look at the aft decks.',
  captions: { 'aft CO2 creep': 'aft deck alarm', 'unbalanced log': 'log rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = ri(r, 4, 6), win = m.calm ? 2.2 : 1.6;
    m.dir = pick(r, [1, -1]); m.d = -m.dir * n; m.harm = Array.from({ length: n }, () => pick(r, ['A', 'B'])); if (!m.harm.includes('A')) m.harm[ri(r, 0, n - 1)] = 'A';
    m.k = 0; m.co2 = 0.4; m.pend = null; m.tried = null; m.cd = 0;
    const notch = (v, s) => {
      if (m.pend) { if (m.pend.v === v && s === -m.pend.s) { m.d -= m.pend.s; m.tried = v; m.pend = null; return; } m.fault('aft CO2 creep'); m.d -= m.pend.s; m.pend = null; return; }
      m.d += s; if (s !== m.dir) return; if (m.harm[m.k] === v) m.pend = { v, s, t: 0 }; else { m.k++; m.tried = null; }
    };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); m.cd = 0.15;
      if (a === 'L' || a === 'R') { notch('A', a === 'R' ? 1 : -1); return true; }
      if (a === 'U' || a === 'D') { notch('B', a === 'U' ? 1 : -1); return true; }
      if (ENTER(code)) { if (m.d === 0 && !m.pend && m.co2 < 0.62) m.win(); else m.fault('unbalanced log'); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.cd -= dt; const want = m.pend ? 0.4 + 0.35 * clamp(m.pend.t / 0.5) : 0.4; m.co2 += (want - m.co2) * Math.min(1, dt * 8);
      if (m.pend) { m.pend.t += dt; if (m.pend.t > win) { m.fault('aft CO2 creep'); m.d -= m.pend.s; m.pend = null; } }
    };
    const key = (v, s) => v === 'A' ? (s > 0 ? 'ArrowRight' : 'ArrowLeft') : (s > 0 ? 'ArrowUp' : 'ArrowDown');
    m.hint = () => {
      if (m.cd > 0) return []; if (m.pend) return m.co2 > 0.62 ? [[key(m.pend.v, -m.pend.s), true]] : [];
      if (m.d !== 0) return [[key(m.tried === 'A' ? 'B' : 'A', m.dir), true]]; return m.co2 < 0.45 ? [['Enter', true]] : [];
    };
    m.bad = () => m.cd > 0 || m.pend ? null : key('A', m.dir);
    m.view = () => ({ n, dir: m.dir, harm: m.harm.join('') });
    m.buttons = () => [['ArrowLeft', 'Intake ◀'], ['ArrowRight', 'Intake ▶'], ['ArrowUp', 'Damper ▲'], ['ArrowDown', 'Damper ▼'], ['Enter', 'Log balance']];
    m.draw = (c, W, H, P) => {
      const cx = 200, step = 24; txt(c, 'BAY ΔP vs CORRIDOR', 20, 22, { size: 11, col: COL.dim }); box(c, 20, 30, 360, 22, 'rgba(255,255,255,.06)', null, 4);
      c.fillStyle = P.good; c.fillRect(cx - 1, 26, 3, 30); txt(c, 'corridor', cx - 20, 68, { size: 9, col: P.good });
      const x = cx + m.d * step; c.fillStyle = COL.gold; c.beginPath(); c.moveTo(x, 32); c.lineTo(x - 7, 50); c.lineTo(x + 7, 50); c.fill();
      txt(c, `${m.d > 0 ? '+' : ''}${m.d} notch${Math.abs(m.d) === 1 ? '' : 'es'}`, 20, 68, { size: 11, col: m.d === 0 ? P.good : COL.ink });
      const out = m.co2 > 0.62; txt(c, 'AFT DECK CO2', 20, 96, { size: 11, col: COL.dim }); bar(c, 20, 102, 360, 12, m.co2, { band: [0.2, 0.62], col: out ? P.bad : P.good });
      txt(c, m.pend ? (out ? `▲ OUT OF BAND — roll back the ${m.pend.v === 'A' ? 'intake' : 'damper'} notch` : '… watching the aft CO2') : m.tried ? `${m.tried === 'A' ? 'intake' : 'damper'} rolled back — try the other control` : 'CO2 steady', 20, 136, { size: 12, col: out ? P.bad : COL.pale });
      txt(c, 'Left/Right intake · Up/Down damper', 20, 158, { size: 10, col: COL.dim });
    };
    return m;
  },
});
