// Captain: sign the log and review reports. The sickbay and engineering reports list each figure for yesterday and today with the band it
// may move by. Pencil-mark every figure that moved beyond its band (its number key), ask the XO about the marks (Enter, one answer at a
// time), and sign only when every mark has its explanation (Space). Marking a figure that stayed in band, or signing early, is a fault.
import { define, machine, DIG, ENTER, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

const FIG = [['Sickbay', 'beds occupied', 1], ['Sickbay', 'dressings used', 4], ['Sickbay', 'hypo doses', 3], ['Engineering', 'coolant loss l', 6], ['Engineering', 'EPS draw MW', 5], ['Engineering', 'plasma temp ×100 K', 2]];
const WHY = ['shuttle crew in for checks', 'drill casualties logged', 'pump two on spare', 'sensor array on full', 'scheduled flush', 'two techs on sick leave'];

export default define({
  job: { billet: 'co', label: 'Sign the log and review reports', type: 'task:quiet_watch' },
  title: 'Report mark-up before signing', dept: 'command', host: 'console', tool: 'Ready room in-tray and log pad',
  how: 'Work out which figures moved more than their band since yesterday and mark each one, ask the XO to explain the marks, then sign the log.',
  keys: ['1-6 mark figure', 'Enter ask XO', 'Space sign'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'mark and query', input: 'digits+enter+space', win: 'every figure that moved beyond its band pencil-marked and explained by the XO before the log is signed',
    fail: 'marking a figure that stayed inside its band, or signing while a moved figure is unmarked or unexplained',
    rule: 'Subtract yesterday from today on each row; if the change is bigger than the band, press its number. Enter asks the XO, who explains one mark per second. Space signs once all marks are answered.' },
  rush: 'Signed the log on top of the pile without opening the reports.',
  captions: { 'pencil noise': 'XO sighs', 'signed unread': 'stylus scrapes' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nMove = ri(r, 2, 3), mv = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, nMove)), why = shuffle(r, WHY), ans = m.calm ? 0.8 : 1.0;
    m.rows = FIG.map(([d, f, b], i) => { const y = ri(r, 10, 60), moved = mv.has(i), dl = moved ? b + ri(r, 1, 6) : ri(r, 0, b); return { d, f, b, y, now: y + (r() < 0.5 ? dl : -Math.min(dl, y)), moved, mark: false, said: null, why: why[i] }; });
    m.rows.forEach(w => { w.moved = Math.abs(w.now - w.y) > w.b; });
    if (!m.rows.some(w => w.moved)) { const w = m.rows[0]; w.now = w.y + w.b + 3; w.moved = true; }
    m.ask = []; m.xo = 0; m.rounds = m.rows.filter(w => w.moved).length; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= 6) { const w = m.rows[d - 1]; if (w.mark) return true; if (!w.moved) { m.fault('pencil noise'); return true; } w.mark = true; return true; }
      if (ENTER(code)) { for (const w of m.rows) if (w.mark && !w.said && !m.ask.includes(w)) m.ask.push(w); return true; }
      if (SPACE(code)) { if (m.rows.some(w => w.moved && !w.said)) { m.fault('signed unread'); return true; } m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.ask.length) { m.xo += dt; if (m.xo >= ans) { m.xo = 0; const w = m.ask.shift(); w.said = w.why; m.round++; m.ev('answer'); } } };
    m.hint = () => {
      const u = m.rows.findIndex(w => w.moved && !w.mark); if (u >= 0) return [['Digit' + (u + 1), true]];
      if (m.rows.every(w => !w.moved || w.said)) return [['Space', true]];
      return m.rows.some(w => w.mark && !w.said && !m.ask.includes(w)) ? [['Enter', true]] : [];
    };
    m.bad = () => 'Space';
    m.view = () => ({ rows: m.rows.map(w => [w.y, w.now, w.b]) });
    m.buttons = () => [1, 2, 3, 4, 5, 6].map(k => ['Digit' + k, String(k)]).concat([['Enter', 'Ask XO'], ['Space', 'Sign']]);
    m.draw = (c, W, H, P) => {
      txt(c, 'figure', 30, 14, { size: 9, col: COL.dim }); txt(c, 'yest.', 190, 14, { size: 9, col: COL.dim }); txt(c, 'today', 228, 14, { size: 9, col: COL.dim }); txt(c, 'band', 268, 14, { size: 9, col: COL.dim });
      m.rows.forEach((w, i) => {
        const y = 18 + i * 20; box(c, 6, y, W - 12, 18, w.mark ? 'rgba(240,147,58,.18)' : 'rgba(255,255,255,.04)', w.mark ? COL.orange : null, 6);
        txt(c, `${i + 1}`, 14, y + 13, { size: 10, col: COL.gold }); txt(c, `${w.d}: ${w.f}`, 30, y + 13, { size: 10 });
        txt(c, w.y, 190, y + 13, { size: 10 }); txt(c, w.now, 228, y + 13, { size: 10 }); txt(c, `±${w.b}`, 268, y + 13, { size: 10, col: COL.dim });
        if (w.mark) txt(c, w.said ? '✓ ' + w.said.slice(0, 16) : m.ask.includes(w) ? '…asking' : '✎ marked', W - 10, y + 13, { size: 9, col: w.said ? P.good : COL.warn, align: 'right' });
      });
      const left = m.rows.filter(w => w.mark && !w.said).length; txt(c, left ? `${left} mark(s) waiting for the XO` : 'signature line', 8, 150, { size: 11, col: left ? COL.warn : COL.pale });
      c.fillStyle = COL.dim; c.fillRect(170, 152, 200, 1);
    };
    return m;
  },
});
