// Captain: set course and priority for relief. Bend the route line clear of the debris field (← →; a wider bend adds distance), set the warp
// dial (↑ ↓) as high as the power gauge allows without overdraw, then choose the priority from the slack left before the deadline
// (1 routine, 2 urgent, 3 emergency) and confirm (Enter). A route through debris, an overdraw, a late arrival or the wrong priority is a fault.
import { define, machine, ARROW, DIG, ENTER, ri, rf, pick, shuffle, txt, box, bar, COL } from './kit.js';

const DEST = ['Tessen III colony', 'Mining station Rho', 'Halvar relief camp', 'Corvan II', 'Outpost Sigma'];
const PRI = ['', 'routine', 'urgent', 'emergency'];

export default define({
  job: { billet: 'co', label: 'Set course and priority for relief', type: 'task:medical_relief' },
  title: 'Relief run plot, warp and priority', dept: 'command', host: 'console', tool: 'Nav plot, helm warp dial and priority selector',
  how: 'Bend the route clear of debris, set the highest warp the power gauge allows, choose the priority from the slack before the deadline, and confirm.',
  keys: ['← → bend route', '↑ ↓ warp', '1-3 priority', 'Enter confirm'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'plan the run', input: 'arrows+digits+enter', win: 'two relief runs confirmed on a debris-free bend at the top safe warp with the priority the deadline slack calls for',
    fail: 'a route line through the debris field, a warp setting that overdraws the core, an arrival after the deadline, or the wrong priority',
    rule: '← → moves the route bow off the debris; ↑ ↓ sets warp while the power bar must stay under its line. Slack = deadline minus ETA: under 2 h press 3, 2 to 5 h press 2, more press 1. Enter confirms.' },
  rush: 'Set emergency priority and maximum warp and let engineering worry about it.',
  captions: { 'debris crossing': 'proximity alarm', overdraw: 'warp core strain tone', 'late arrival': 'helm: "we will be late, sir"', 'wrong priority': 'ops queries the priority' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dests = shuffle(r, DEST);
    m.runs = [0, 1].map(k => {
      const lo = ri(r, -2, 0), hi = lo + ri(r, 1, 2), blocked = []; for (let b = lo; b <= hi; b++) blocked.push(b); if (!blocked.includes(0)) blocked.push(0);
      const d0 = rf(r, 3, 6), c = rf(r, 0.9, 1.4), maxP = ri(r, 40, 75), wmax = Math.min(9, Math.floor(Math.sqrt(maxP / c)));
      const clear = [-3, -2, -1, 1, 2, 3].filter(b => !blocked.includes(b)).sort((a, b) => Math.abs(a) - Math.abs(b))[0], dist = d0 + Math.abs(clear) * 0.5, eta = dist * 10 / wmax;
      return { dest: dests[k], blocked, d0, c, maxP, wmax, clear, dl: +(eta + pick(r, [rf(r, 0.4, 1.6), rf(r, 2.4, 4.6), rf(r, 5.6, 9)])).toFixed(1) };
    });
    m.k = 0; m.b = 0; m.w = ri(r, 2, 4); m.pri = 0; m.rounds = 2; m.round = 0;
    const R = () => m.runs[m.k], dist = () => R().d0 + Math.abs(m.b) * 0.5, eta = () => dist() * 10 / m.w, pow = () => R().c * m.w * m.w;
    const slackPri = () => { const s = R().dl - eta(); return s < 2 ? 3 : s <= 5 ? 2 : 1; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { m.b = Math.max(-3, Math.min(3, m.b + (a === 'R' ? 1 : -1))); return true; }
      if (a === 'U' || a === 'D') { m.w = Math.max(1, Math.min(9, m.w + (a === 'U' ? 1 : -1))); return true; }
      if (d >= 1 && d <= 3) { m.pri = d; return true; }
      if (ENTER(code)) {
        if (R().blocked.includes(m.b)) m.fault('debris crossing'); else if (pow() > R().maxP) m.fault('overdraw'); else if (eta() > R().dl) m.fault('late arrival'); else if (m.pri !== slackPri()) m.fault('wrong priority');
        else { m.round++; m.k++; m.b = 0; m.pri = 0; if (m.k >= 2) m.win(); } return true;
      }
      return !!d;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (m.k >= 2) return []; const q = R(); if (m.b !== q.clear) return [[m.b < q.clear ? 'ArrowRight' : 'ArrowLeft', true]];
      if (m.w !== q.wmax) return [[m.w < q.wmax ? 'ArrowUp' : 'ArrowDown', true]]; if (m.pri !== slackPri()) return [['Digit' + slackPri(), true]]; return [['Enter', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ runs: m.runs.map(q => [q.blocked, q.maxP, q.dl, q.clear]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', 'Warp ▲'], ['ArrowDown', 'Warp ▼'], ['Digit1', '1 Routine'], ['Digit2', '2 Urgent'], ['Digit3', '3 Emergency'], ['Enter', 'Confirm']];
    m.draw = (c, W, H, P) => {
      if (m.k >= 2) return; const q = R(), y0 = 85, Yb = (b) => y0 - b * 18;
      txt(c, `RELIEF ${m.k + 1} / 2 → ${q.dest} · deadline ${q.dl} h`, 8, 14, { size: 11, col: COL.gold });
      for (const b of q.blocked) { c.fillStyle = 'rgba(255,179,71,.25)'; c.fillRect(110, Yb(b) - 9, 40, 18); txt(c, '✶', 130, Yb(b) + 4, { size: 10, col: COL.warn, align: 'center' }); }
      const hit = q.blocked.includes(m.b); c.strokeStyle = hit ? P.bad : COL.orange; c.lineWidth = 3; c.setLineDash?.(hit ? [5, 4] : []);
      c.beginPath(); c.moveTo(20, y0); c.quadraticCurveTo(130, y0 - m.b * 36, 240, y0); c.stroke(); c.setLineDash?.([]);
      txt(c, 'ship', 20, y0 + 16, { size: 9, col: COL.dim }); txt(c, 'site', 232, y0 + 16, { size: 9, col: COL.dim });
      txt(c, `WARP ${m.w}`, 262, 40, { size: 14 }); const p = pow(); bar(c, 262, 48, 128, 10, p / 100, { mark: q.maxP / 100, col: p > q.maxP ? COL.warn : COL.peri });
      txt(c, `draw ${p.toFixed(0)} / max ${q.maxP}`, 262, 72, { size: 9, col: p > q.maxP ? P.bad : COL.dim });
      txt(c, `ETA ${eta().toFixed(1)} h · slack ${(q.dl - eta()).toFixed(1)} h`, 262, 96, { size: 10, col: eta() > q.dl ? P.bad : COL.ink });
      txt(c, `priority: ${m.pri ? PRI[m.pri] : '—'}`, 262, 120, { size: 11, col: COL.pale });
      txt(c, hit ? '▲ route crosses debris' : '● route clear', 8, 160, { size: 10, col: hit ? P.bad : P.good });
    };
    return m;
  },
});
