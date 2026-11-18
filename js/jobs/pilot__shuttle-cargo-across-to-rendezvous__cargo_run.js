// Pilot: shuttle cargo across to the rendezvous. The route is flown waypoint by waypoint. As you pass each waypoint the hazard light tells you
// whether the NEXT leg crosses a hazard and which side of the line it lies: then you dog-leg round it on the far side (↑ / ↓) instead of
// flying the leg straight (→). Dog-legging a clear leg cuts out a waypoint. At the end, match the rendezvous ship's speed on the radar with
// ↑ / ↓ and close with Enter. Flying into a hazard, skipping a waypoint or a mismatched meet are faults.
import { define, machine, ri, pick, txt, box, lamp, COL, ARROW, ENTER } from './kit.js';

export default define({
  job: { billet: 'pilot', label: 'Shuttle cargo across to rendezvous', type: 'task:cargo_run' },
  title: 'Waypoint legs past the hazards', dept: 'flight', host: 'console', tool: 'Flight computer and radar',
  how: 'At each waypoint read the hazard light. Clear: → flies the leg. Hazard above the line: ↓ dog-legs below it; hazard below: ↑ dog-legs above. At the rendezvous, ↑/↓ match the ship\'s speed, then Enter.',
  keys: ['→ fly leg', '↑ ↓ dog-leg / speed', 'Enter meet'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'dog-leg round', input: 'arrows+enter',
    win: 'every waypoint flown in order with each lit hazard passed on its far side, then speed matched to the rendezvous ship before closing',
    fail: 'flying a hazard leg straight, dog-legging a clear leg so a waypoint is missed, or closing on the ship at the wrong speed',
    rule: 'At each waypoint: hazard lamp dark, press right; lamp lit with the hazard above or below the line, press the opposite of up or down. At the end match speed and press Enter.' },
  rush: 'Flew straight at the rendezvous and cut across the hazard zone.',
  captions: { 'flew through hazard': 'debris rattles hull', 'missed waypoint': 'nav computer beeps', 'rough meet': 'docking collar bangs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = ri(r, 5, 6), TRAVEL = m.calm ? 0.7 : 0.55;
    for (let tries = 0; tries < 20; tries++) { m.legs = Array.from({ length: n }, () => r() < 0.45 ? pick(r, ['above', 'below']) : null); if (m.legs.filter(Boolean).length >= 2 && m.legs.some(x => !x)) break; }
    m.ship = ri(r, 9, 16) * 10; m.spd = m.ship + pick(r, [-1, 1]) * ri(r, 2, 4) * 10; m.k = 0; m.move = 0; m.flash = 0; m.msg = ''; m.round = 1; m.rounds = n + 1;
    const fly = () => { m.k++; m.move = TRAVEL; m.round = Math.min(m.rounds, m.k + 1); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), e = ENTER(code); if (!a && !e) return false; if (!down || m.move > 0) return true;
      if (m.k < n) { const h = m.legs[m.k];
        if (a === 'R') { if (h) { m.fault('flew through hazard'); m.msg = 'HAZARD HIT'; m.flash = 0.7; } fly(); }
        else if (a === 'U' || a === 'D') { if (!h) { m.fault('missed waypoint'); m.msg = 'WAYPOINT MISSED'; m.flash = 0.7; } else if ((h === 'above') === (a === 'U')) { m.fault('flew through hazard'); m.msg = 'WRONG SIDE'; m.flash = 0.7; } fly(); }
        return true; }
      if (a === 'U') m.spd += 10; else if (a === 'D') m.spd -= 10;
      else if (e) { if (m.spd === m.ship) { m.ev('meet'); m.win(); } else { m.fault('rough meet'); m.msg = 'SPEED MISMATCH'; m.flash = 0.7; } }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); m.move = Math.max(0, m.move - dt); };
    m.hint = () => { if (m.move > 0) return []; let k;
      if (m.k < n) { const h = m.legs[m.k]; k = !h ? 'ArrowRight' : h === 'above' ? 'ArrowDown' : 'ArrowUp'; }
      else k = m.spd < m.ship ? 'ArrowUp' : m.spd > m.ship ? 'ArrowDown' : 'Enter';
      return [[k, true], [k, false]]; };
    m.bad = () => 'ArrowRight';
    m.view = () => ({ legs: m.legs, ship: m.ship, spd: m.spd });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowRight', 'Fly leg ▶'], ['ArrowDown', '▼'], ['Enter', 'Meet']];
    m.draw = (c, W, H, P) => {
      txt(c, 'NAV SHEET', 12, 18, { size: 11, col: COL.peri }); const sx = 26, dx = 300 / n, y = 66;
      c.strokeStyle = COL.dim; c.lineWidth = 2; c.beginPath(); c.moveTo(sx, y); c.lineTo(sx + n * dx, y); c.stroke();
      for (let k = 0; k <= n; k++) { c.fillStyle = k < m.k ? COL.dim : k === m.k ? COL.gold : COL.ink; c.beginPath(); c.arc(sx + k * dx, y, k === n ? 7 : 5, 0, 6.283); c.fill(); }
      txt(c, 'RV', sx + n * dx, y + 22, { size: 10, col: COL.dim, align: 'center' });
      if (m.k > 0 && m.k <= n) { const h = m.legs[m.k - 1]; if (h) { c.fillStyle = COL.warn; c.fillRect(sx + (m.k - 0.5) * dx - 4, y + (h === 'above' ? -16 : 8), 8, 8); } }
      if (m.k < n) { const h = m.legs[m.k]; lamp(c, 360, 40, 14, h ? P.bad : '#2a2838', h ? 'triangle' : 'square');
        txt(c, h ? `HAZARD ${h.toUpperCase()}` : 'clear', 360, 70, { size: 10, col: h ? COL.ink : COL.dim, align: 'center' });
        if (h) { c.fillStyle = P.bad; c.fillRect(sx + (m.k + 0.5) * dx - 5, y + (h === 'above' ? -20 : 10), 10, 10); } }
      box(c, 12, 104, 250, 40, 'rgba(255,255,255,.05)', null, 6);
      txt(c, m.k < n ? `Waypoint ${m.k} of ${n}${m.move > 0 ? ' · in transit' : ''}` : `Radar: ship ${m.ship} m/s · you ${m.spd} m/s`, 22, 129, { size: 12, col: COL.pale });
      if (m.flash > 0) txt(c, m.msg, W - 12, H - 10, { size: 12, col: P.bad, align: 'right' });
    };
    return m;
  },
});
