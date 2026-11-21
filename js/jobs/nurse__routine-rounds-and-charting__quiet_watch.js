// Nurse: routine rounds and charting. Walk bed to bed with Right. Each bed's pad shows the last chart entries and now the new reading. Every
// single step looks small, so judge the whole run: a steady one-way slide gets a trend note (Space) before you initial and move on.
import { define, machine, SPACE, ARROW, ri, rf, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Routine rounds and charting', type: 'task:quiet_watch' },
  title: 'Chart trend watch', dept: 'medical', host: 'console', tool: 'Chart pad',
  how: 'Press Right to open the next bed. If its readings slide the same way every entry, press Space to write a trend note before you press Right to initial and move on.',
  keys: ['Right next bed', 'Space trend note'], limit: 30, maxFaults: 2,
  fingerprint: { verb: 'note the trend', input: 'arrows+space', win: 'every bed initialled with a trend note on each steady slide and none on beds that only wobble',
    fail: 'initialling a bed whose entries slide steadily, or noting a trend on a bed that only wobbles',
    rule: 'Each bed shows five readings. Space notes a trend when the last entries all fall or all rise; Right initials the bed and moves on.' },
  rush: 'Copied each reading onto the pad without comparing it to the last one.',
  captions: { 'missed trend': 'pen scratch', 'false trend': 'dull double tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 4; m.round = 0; m.k = 0; m.noted = false;
    m.beds = Array.from({ length: 4 }, (_, i) => {
      const trend = i === 1 || i === 3 ? true : r() < 0.35, dir = r() < 0.5 ? -1 : 1, base = ri(r, 68, 84), v = [base];
      for (let k = 1; k < 5; k++) v.push(Math.round(v[k - 1] + (trend ? dir * rf(r, 1.5, 3) : (k % 2 ? 1 : -1) * rf(r, 1, 3))));
      return { v, trend };
    });
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!SPACE(code) && a !== 'R') return false; if (!down) return true; const b = m.beds[m.k];
      if (SPACE(code)) { if (m.noted) return true; if (!b.trend) m.fault('false trend'); else m.noted = true; }
      else { if (b.trend && !m.noted) { m.fault('missed trend'); m.noted = true; } m.k++; m.round = m.k; m.noted = false; if (m.k >= 4) m.win(); }
      return true;
    };
    m.hint = () => { const b = m.beds[m.k]; if (!b) return []; return [[b.trend && !m.noted ? 'Space' : 'ArrowRight', true]]; };
    m.bad = () => 'ArrowRight';
    m.view = () => ({ beds: m.beds.map(b => [b.trend, b.v]) });
    m.buttons = () => [['Space', 'Trend note'], ['ArrowRight', 'Initial, next bed']];
    m.draw = (c, W, H, P) => {
      const b = m.beds[Math.min(m.k, 3)]; txt(c, `Bed ${Math.min(m.k, 3) + 1} pulse chart`, 14, 24, { size: 14, col: COL.gold });
      b.v.forEach((x, i) => { box(c, 20 + i * 72, 44, 62, 40, i === 4 ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.05)', i === 4 ? COL.orange : null, 8); txt(c, x, 51 + i * 72, 72, { size: 18 }); });
      txt(c, 'last four entries, then NOW', 20, 104, { size: 10, col: COL.dim }); txt(c, m.noted ? 'trend note written' : 'no note yet', 20, 136, { size: 12, col: m.noted ? P.good : COL.dim });
    };
    return m;
  },
});
