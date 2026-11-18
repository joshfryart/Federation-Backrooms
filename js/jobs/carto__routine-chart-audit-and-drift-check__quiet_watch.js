// Cartographer, quiet watch: routine chart audit and drift check. The trend plot reveals one audit at a time (→ steps forward). Each star's
// drift line wobbles; the danger is a star whose drift rises three audits in a row even though every single step is small. Flag it with
// its number the moment the third rise shows. A star with one big jump is a sensor glitch, not creep. Enter saves the sector at the last audit.
import { define, machine, ARROW, DIG, ENTER, ri, rf, shuffle, txt, box, lamp, COL } from './kit.js';

const NA = 7;
export default define({
  job: { billet: 'carto', label: 'Routine chart audit and drift check', type: 'task:quiet_watch' },
  title: 'Audit-by-audit creep watch', dept: 'sciences', host: 'console', tool: 'Lab trend plot and audit list',
  how: 'Step through the audits with →, flag a star (1-4) once its drift has risen three audits in a row, ignore single jumps, and save with Enter at the last audit.',
  keys: ['→ next audit', '1-4 flag star', 'Enter save sector'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'flag the creep', input: 'arrows+digits+enter', win: 'every star with three consecutive rising audits flagged as soon as the third rise is revealed and the sector saved at the final audit',
    fail: 'flagging a one-off jump or a star before its third rise, or saving the sector with a creeping star unflagged',
    rule: 'Reveal audits one by one with →. Count each star\'s consecutive rises; on the third press its number. Big single jumps do not count. Enter at the last audit.' },
  rush: 'Compared this audit with last week only, saw nothing big and marked the sector clean.',
  captions: { 'false creep': 'audit query chime', 'missed creep': 'chart drift alarm', premature: 'audit query chime', 'early save': 'save refused' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, ns = 4, gap = m.calm ? 0.9 : 0.6;
    const rises = (d, upto) => { let run = 0, best = -1; for (let k = 1; k <= upto; k++) { run = d[k] > d[k - 1] ? run + 1 : 0; if (run >= 3 && best < 0) best = k; } return best; };
    const order = shuffle(r, [0, 1, 2, 3]), creeps = new Set(order.slice(0, ri(r, 1, 2))), jumper = order[3];
    m.stars = Array.from({ length: ns }, (_, s) => { for (;;) {
      const d = [rf(r, 0.4, 1.2)];
      if (creeps.has(s)) { const st = ri(r, 0, NA - 4); for (let k = 1; k < NA; k++) d.push(d[k - 1] + (k > st && k <= st + 3 ? rf(r, 0.12, 0.25) : k <= st ? rf(r, -0.2, 0.15) : rf(r, -0.1, 0.2))); }
      else { const j = ri(r, 1, NA - 1); for (let k = 1; k < NA; k++) d.push(d[k - 1] + (s === jumper && k === j ? rf(r, 0.9, 1.3) : (k % 2 ? -1 : 1) * rf(r, 0.05, 0.3) * (r() < 0.5 ? 1 : -1))); }
      const at = rises(d, NA - 1); if (creeps.has(s) ? at > 0 : at < 0) return { d: d.map(v => +v.toFixed(2)), at, flag: false, name: `S-${ri(r, 100, 999)}` }; } });
    m.a = 1; m.wait = 0; m.rounds = NA; m.round = 1;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code), en = ENTER(code); if (!a && !d && !en) return false; if (!down) return true;
      if (a === 'R') { if (m.a < NA - 1 && m.wait <= 0) { m.a++; m.round = m.a; m.wait = gap; } return true; } if (a) return true;
      if (d >= 1 && d <= ns) { const s = m.stars[d - 1]; if (s.flag) return true; if (s.at < 0) m.fault('false creep'); else if (s.at > m.a) m.fault('premature'); else s.flag = true; return true; }
      if (d) return true;
      if (m.a < NA - 1) { m.fault('early save'); return true; }
      if (m.stars.some(s => s.at > 0 && !s.flag)) m.fault('missed creep'); else m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.wait -= dt; };
    m.hint = () => { const k = m.stars.findIndex(s => !s.flag && s.at > 0 && s.at <= m.a); if (k >= 0) return [[`Digit${k + 1}`, true]]; return m.a < NA - 1 ? [['ArrowRight', true]] : [['Enter', true]]; };
    m.bad = () => { const k = m.stars.findIndex(s => s.at < 0 && !s.flag); return k >= 0 ? `Digit${k + 1}` : 'Enter'; };
    m.view = () => ({ d: m.stars.map(s => s.d) });
    m.buttons = () => [['ArrowRight', 'Next audit ▶'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Enter', 'Save']];
    m.draw = (c, W, H, P) => {
      const x0 = 40, dx = 44, y0 = 150, sy = 45, cols = [COL.gold, COL.peri, COL.lav, COL.pale], marks = ['circle', 'square', 'diamond', 'triangle'];
      txt(c, `TREND PLOT · audit ${m.a + 1}/${NA}`, 16, 16, { size: 11, col: COL.dim });
      for (let k = 0; k < NA; k++) { c.fillStyle = k <= m.a ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.03)'; c.fillRect(x0 + k * dx, 24, 1, 130); }
      m.stars.forEach((s, i) => { c.strokeStyle = cols[i]; c.lineWidth = 2; c.beginPath(); for (let k = 0; k <= m.a; k++) { const x = x0 + k * dx, y = y0 - s.d[k] * sy; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
        lamp(c, x0 + m.a * dx + 10 + i * 0, y0 - s.d[m.a] * sy, 4, cols[i], marks[i]);
        box(c, 336, 24 + i * 30, 56, 24, s.flag ? 'rgba(255,90,72,.25)' : COL.panel, s.flag ? P.bad : null, 4);
        lamp(c, 348, 36 + i * 30, 5, cols[i], marks[i]); txt(c, `${i + 1} ${s.flag ? 'FLAG' : s.name.slice(2)}`, 357, 40 + i * 30, { size: 10 }); });
      const any = m.stars.some(s => s.flag); txt(c, `sector: ${any ? 'DRIFTING' : 'clean'}`, 336, 160, { size: 10, col: any ? P.bad : P.good });
    };
    return m;
  },
});
