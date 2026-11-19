// Cartographer, medical relief: plot the fastest course to the stricken ship, ignoring comfort margins. Five candidate intercept lines lead
// the ship's drift; ↑ / ↓ selects one and the risk meter reads its closest pass to the hazard. Take the fastest (lowest ETA) even when it is
// risky, but be honest about it: hold Space to write the risk note (the grade climbs Low → Medium → High while you hold) and let go on the
// grade the meter shows. Enter submits; no note, an understated or overstated note, or a slower line is refused.
import { define, machine, ARROW, SPACE, ENTER, ri, rf, txt, bar, lamp, COL } from './kit.js';

const GR = ['—', 'LOW', 'MEDIUM', 'HIGH'];
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
export default define({
  job: { billet: 'carto', label: 'Plot fastest course to the stricken ship, ignoring comfort margins', type: 'task:medical_relief' },
  title: 'Fastest intercept with honest risk note', dept: 'sciences', host: 'console', tool: 'Lab console course line tool, hazard map and risk meter',
  how: 'Select the lowest-ETA line with ↑ / ↓, hold Space to write the risk note and let go on the grade the risk meter shows, then submit with Enter.',
  keys: ['↑ / ↓ select line', 'Space hold: write risk note', 'Enter submit'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'take and annotate', input: 'arrows+space-hold+enter', win: 'the lowest-ETA intercept line submitted with a risk note whose grade matches the risk meter for that line',
    fail: 'submitting with no risk note or a note that misstates the risk, or choosing a slower comfortable line',
    rule: 'Pick the line with the lowest ETA whatever its risk. Hold Space: the note grade climbs Low, Medium, High; let go on the meter\'s grade. Enter submits.' },
  rush: 'Sent navigation the comfortable long way round with no note on the time it costs.',
  captions: { 'no risk note': 'submit refused', 'risk misstated': 'navigator query', 'slow course': 'sickbay: "how long?"' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, S = [22, ri(r, 70, 100)], T0 = [ri(r, 330, 370), ri(r, 40, 130)], dv = [rf(r, -8, 8), rf(r, -14, 14)], step = m.calm ? 0.8 : 0.6;
    const T = [T0[0] + dv[0] * 2, T0[1] + dv[1] * 2], mid = [(S[0] + T[0]) / 2, (S[1] + T[1]) / 2];
    m.hz = [mid[0] + ri(r, -20, 20), mid[1] + (r() < 0.5 ? -1 : 1) * rf(r, 4, 30), ri(r, 9, 14)];
    m.lines = [-56, -30, -12, 12, 30, 56].filter((_, k) => k !== ri(r, 0, 5)).map(off => {
      const v = [mid[0] + ri(r, -10, 10), mid[1] + off], L = Math.hypot(v[0] - S[0], v[1] - S[1]) + Math.hypot(T[0] - v[0], T[1] - v[1]);
      const cl = Math.min(segDist(m.hz[0], m.hz[1], ...S, ...v), segDist(m.hz[0], m.hz[1], ...v, ...T)) - m.hz[2];
      return { v, eta: +(L / 40).toFixed(1), cl: +cl.toFixed(1), tier: cl < 6 ? 3 : cl < 22 ? 2 : 1 }; });
    m.fast = m.lines.reduce((b, l, k) => l.eta < m.lines[b].eta ? k : b, 0); m.sel = (m.fast + 2) % m.lines.length; m.note = 0; m.hT = -1;
    const grade = () => Math.min(3, 1 + Math.floor(m.hT / step));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a) { if (down && (a === 'U' || a === 'D')) { m.sel = (m.sel + (a === 'U' ? -1 : 1) + m.lines.length) % m.lines.length; m.note = 0; m.hT = -1; } return true; }
      if (SPACE(code)) { if (down && m.hT < 0) m.hT = 0; else if (!down && m.hT >= 0) { m.note = grade(); m.hT = -1; } return true; }
      if (ENTER(code)) { if (!down) return true; const l = m.lines[m.sel];
        if (!m.note) m.fault('no risk note'); else if (m.sel !== m.fast) m.fault('slow course'); else if (m.note !== l.tier) { m.fault('risk misstated'); m.note = 0; } else m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.hT >= 0) m.hT += dt; };
    m.hint = () => { const l = m.lines[m.fast];
      if (m.sel !== m.fast) return [[m.sel > m.fast ? 'ArrowUp' : 'ArrowDown', true], ['ArrowUp', false], ['ArrowDown', false]];
      if (m.note === l.tier) return [['Enter', true]];
      if (m.hT < 0) return [['Space', true]]; return grade() === l.tier && m.hT % step > step * 0.3 ? [['Space', false]] : [['Space', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ l: m.lines.map(l => [l.eta, l.tier]), hz: m.hz });
    m.buttons = () => [['ArrowUp', '▲ line'], ['ArrowDown', 'line ▼'], ['Space', 'Risk note (hold)'], ['Enter', 'Submit']];
    m.draw = (c, W, H, P) => {
      c.beginPath(); c.arc(m.hz[0], m.hz[1], m.hz[2], 0, 6.283); c.fillStyle = 'rgba(255,90,72,.3)'; c.fill(); txt(c, '✕', m.hz[0] - 4, m.hz[1] + 4, { size: 10, col: P.bad });
      m.lines.forEach((l, k) => { const on = k === m.sel; c.strokeStyle = on ? COL.gold : 'rgba(168,166,185,.45)'; c.lineWidth = on ? 3 : 1; c.beginPath(); c.moveTo(...S); c.lineTo(...l.v); c.lineTo(...T); c.stroke();
        txt(c, `${l.eta}`, l.v[0] - 8, l.v[1] - 4, { size: 9, col: on ? COL.gold : COL.dim }); });
      lamp(c, S[0], S[1], 6, COL.peri, 'square'); lamp(c, T[0], T[1], 6, COL.pale, 'diamond'); c.strokeStyle = COL.pale; c.beginPath(); c.moveTo(...T0); c.lineTo(...T); c.stroke();
      const l = m.lines[m.sel]; txt(c, `ETA ${l.eta} h · clearance ${Math.max(0, l.cl).toFixed(0)}`, 14, 14, { size: 11 });
      txt(c, 'RISK', 250, 14, { size: 10, col: COL.dim }); bar(c, 280, 6, 110, 10, l.tier / 3, { col: l.tier === 3 ? P.bad : COL.warn }); txt(c, GR[l.tier], 340, 30, { size: 10, col: l.tier === 3 ? P.bad : COL.ink });
      txt(c, `risk note: ${m.hT >= 0 ? 'writing ' + GR[grade()] + '…' : GR[m.note]}`, 14, 162, { size: 11, col: m.note ? P.good : COL.warn });
    };
    return m;
  },
});
