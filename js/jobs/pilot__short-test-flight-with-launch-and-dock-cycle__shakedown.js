// Pilot: short test flight with a launch and dock cycle. The report needs clean flight data, which means flying the test card's climb profile
// (hold ↑ / ↓ to steer the climb rate so the shuttle stays on the profile line) and marking the recorder (Enter) each time a system responds,
// while the response lamp is lit. Then the dock: the green approach band narrows as the bay mouth grows, so the closing speed has to come down
// with the distance (↓ brakes, ↑ thrusts) to reach the marks slow enough for the clamps.
import { define, machine, rf, txt, box, bar, lamp, COL, ARROW, ENTER } from './kit.js';

export default define({
  job: { billet: 'pilot', label: 'Short test flight with launch and dock cycle', type: 'task:shakedown' },
  title: 'Climb profile, recorder marks, dock', dept: 'flight', host: 'console', tool: 'Flight data recorder',
  how: 'Climb: hold ↑ / ↓ to keep the shuttle on the profile line, and press Enter while a system response lamp is lit to mark the recorder. Dock: keep the closing speed inside the shrinking green band (↓ brake, ↑ thrust) down to the marks.',
  keys: ['↑ hold climb / thrust', '↓ hold descend / brake', 'Enter mark recorder'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'fly the card', input: 'arrows-hold+enter',
    win: 'climb profile followed with each system response marked on the recorder, then a dock inside the narrowing approach band',
    fail: 'drifting off the climb profile, a response left unmarked or a false mark, or closing on the bay faster than the band allows',
    rule: 'Hold up or down to track the climb profile and press Enter while a response lamp is lit; on the approach, keep closing speed under the green band as it narrows to the bay marks.' },
  rush: 'Flew a quick circuit and docked hot; the recorder has nothing usable.',
  captions: { 'off profile': 'profile warning', 'no data': 'recorder gap tone', 'false mark': 'recorder blip', 'fast approach': 'approach warning', 'rough dock': 'clamps bang' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, TOL = m.calm ? 1.6 : 1.2, CL = 8, LIT = m.calm ? 2 : 1.5;
    m.rates = [rf(r, 1.2, 2.2), rf(r, 0.2, 1), rf(r, 1.5, 2.5)].map(v => +v.toFixed(2));
    m.resp = [rf(r, 0.8, 2), rf(r, 3.2, 4.5), rf(r, 5.6, 6.4)].map(v => +v.toFixed(2)); m.ri = 0; m.marked = [];
    m.phase = 'climb'; m.ct = 0; m.alt = 0; m.vs = m.rates[0]; m.off = false; m.D0 = +rf(r, 16, 22).toFixed(1); m.D = m.D0; m.v = 3.5; m.fast = false; m.flash = 0; m.msg = '';
    const tgtRate = (t) => m.rates[Math.min(2, Math.floor(t / (CL / 3)))];
    const tgt = (t) => { let a = 0; for (let k = 0; k < 3; k++) a += m.rates[k] * Math.max(0, Math.min(CL / 3, t - k * CL / 3)); return a; };
    const band = (D) => 1 + 0.2 * D;
    const lit = () => m.ri < 3 && m.ct >= m.resp[m.ri] && m.ct < m.resp[m.ri] + LIT;
    const bad = (why, msg) => { m.fault(why); m.flash = 0.7; m.msg = msg; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), e = ENTER(code); if (a !== 'U' && a !== 'D' && !e) return false;
      if (a) { m.held[a] = down; return true; } if (!down) return true;
      if (m.phase === 'climb' && lit()) { m.marked.push(m.ri); m.ri++; m.ev('mark'); } else bad('false mark', 'NOTHING TO MARK');
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); const u = (m.held.U ? 1 : 0) - (m.held.D ? 1 : 0);
      if (m.phase === 'climb') {
        m.ct += dt; m.vs += u * 3 * dt; m.alt += m.vs * dt; const e = Math.abs(m.alt - tgt(m.ct));
        if (e > TOL && !m.off) { m.off = true; bad('off profile', 'OFF PROFILE'); } else if (e < TOL * 0.6) m.off = false;
        if (m.ri < 3 && m.ct >= m.resp[m.ri] + LIT) { bad('no data', 'RESPONSE MISSED'); m.ri++; }
        if (m.ct >= CL) { m.phase = 'dock'; m.held = {}; }
      } else {
        m.v = Math.max(0, m.v + (u > 0 ? 1.5 : u < 0 ? -3 : 0) * dt); m.D -= m.v * dt;
        if (m.v > band(Math.max(0, m.D)) && !m.fast) { m.fast = true; bad('fast approach', 'TOO FAST'); } else if (m.v < band(Math.max(0, m.D)) - 0.2) m.fast = false;
        if (m.v <= 0.05 && m.D > 0) m.v = 0.6;
        if (m.D <= 0) { if (m.v <= 1.2) { m.ev('docked'); m.win(); } else { bad('rough dock', 'ROUGH DOCK'); m.D = 8; m.v = 1.5; } }
      }
    };
    m.hint = () => { let want, cur;
      if (m.phase === 'climb') { want = tgtRate(m.ct) + (tgt(m.ct) - m.alt) * 2; cur = m.vs; const out = [['ArrowUp', cur < want - 0.1], ['ArrowDown', cur > want + 0.1]];
        if (lit() && m.ct - m.resp[m.ri] > 0.2) out.push(['Enter', true], ['Enter', false]); return out; }
      want = Math.max(0.7, band(Math.max(0, m.D)) - 0.3); cur = m.v; return [['ArrowUp', cur < want - 0.15], ['ArrowDown', cur > want + 0.05]]; };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ rates: m.rates, resp: m.resp, D0: m.D0 });
    m.buttons = () => [['ArrowUp', '▲ climb / thrust'], ['ArrowDown', '▼ descend / brake'], ['Enter', 'Mark']];
    m.draw = (c, W, H, P) => {
      if (m.phase === 'climb') {
        txt(c, 'CLIMB PROFILE', 12, 18, { size: 11, col: COL.peri }); box(c, 12, 26, 260, 110, 'rgba(255,255,255,.05)', null, 4);
        const sx = 260 / CL, sy = 100 / (tgt(CL) + 3); c.strokeStyle = COL.lav; c.lineWidth = 2; c.beginPath();
        for (let t = 0; t <= CL; t += 0.25) { const x = 12 + t * sx, y = 132 - tgt(t) * sy; t ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
        c.fillStyle = m.off ? P.bad : COL.gold; c.beginPath(); c.arc(12 + m.ct * sx, 132 - m.alt * sy, 5, 0, 6.283); c.fill();
        lamp(c, 330, 50, 16, lit() ? P.good : '#2a2838', lit() ? 'circle' : 'square'); txt(c, lit() ? 'RESPONSE: MARK' : 'recorder', 330, 82, { size: 10, col: lit() ? COL.ink : COL.dim, align: 'center' });
        txt(c, `marks ${m.marked.length} / 3`, 330, 104, { size: 11, col: COL.pale, align: 'center' });
      } else {
        txt(c, 'DOCK APPROACH', 12, 18, { size: 11, col: COL.peri }); const b = band(Math.max(0, m.D));
        txt(c, `Distance ${Math.max(0, m.D).toFixed(1)} m`, 12, 44, { size: 12 }); bar(c, 12, 52, 300, 10, 1 - Math.max(0, m.D) / m.D0, { mark: 1 });
        txt(c, `Closing ${m.v.toFixed(2)} m/s  ·  band ≤ ${b.toFixed(2)}`, 12, 88, { size: 12, col: m.v > b ? P.bad : COL.ink }); bar(c, 12, 96, 300, 10, m.v / 5, { band: [0, b / 5] });
        txt(c, m.v > b ? '▲ OVER BAND' : 'in band', 320, 106, { size: 10, col: m.v > b ? P.bad : P.good });
      }
      if (m.flash > 0) txt(c, m.msg, W - 12, H - 10, { size: 12, col: P.bad, align: 'right' });
    };
    return m;
  },
});
