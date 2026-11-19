// Reactor specialist: report all margins. The margin form has four lines, each fed from a different sheet: core, trim, budget and load. Each
// sheet has several entries written at different times, not in order, and one may be carried over from the last shift (tagged PREV) with a
// later clock time than today's. Copy the newest entry from this shift onto each line (its number key), then send the form to the bridge (Enter).
// Copying an older figure, or last shift's, is a stale margin and a fault.
import { define, machine, DIG, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Report all margins', type: 'task:shakedown' },
  title: 'Margin form from the newest sheet entry', dept: 'engineering', host: 'console', tool: 'Margin report form',
  how: 'For each form line, read its source sheet and press the number of the newest entry from this shift (ignore PREV, last shift). When all four lines are filled, press Enter to send.',
  keys: ['1-4 copy that sheet entry', 'Enter send to the bridge'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'copy the newest', input: 'digits+enter', win: 'all four margin lines copied from the newest this-shift entry of their source sheet and the form sent',
    fail: 'copying an older entry or a last-shift carry-over onto a margin line, or sending the form unfilled',
    rule: 'Each sheet lists entries with clock times in no order; entries tagged PREV are last shift and never count. Press the digit of the latest untagged time; Enter once every line is filled.' },
  rush: 'Copied last shift’s margin report and changed the date.',
  captions: { stale: 'form reject buzz', unfilled: 'bridge query chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const lines = [['Core temperature margin', 'Core sheet', 'K', 40, 160], ['Coolant flow margin', 'Trim sheet', '%', 4, 25], ['Constrictor headroom', 'Trim sheet', 'MW', 20, 90], ['Power margin', 'Budget sheet', 'MW', 10, 70]];
    const clock = (mn) => `${String(Math.floor(mn / 60)).padStart(2, '0')}:${String(mn % 60).padStart(2, '0')}`;
    m.lines = lines.map(([name, sheet, unit, lo, hi]) => {
      const n = ri(r, 3, 4), times = shuffle(r, [...Array(14)].map((_, k) => 60 * 8 + 30 * k)).slice(0, n);
      const es = times.map(t => ({ t, v: ri(r, lo, hi), prev: false }));
      if (r() < 0.6) { const top = Math.max(...es.map(e => e.t)), e = es.find(x => x.t !== top) || es[0]; e.prev = true; e.t = top + 30 * ri(r, 1, 3); }
      const ok = es.filter(e => !e.prev).reduce((a, e) => e.t > a.t ? e : a); return { name, sheet, unit, es: es.map(e => ({ ...e, c: clock(e.t) })), good: es.indexOf(ok), got: -1 };
    });
    m.li = 0; m.rounds = 4; m.round = 1;
    m.key = (code, down = true) => {
      const d = DIG(code), e = ENTER(code); if (m.state !== 'play' || (!(d >= 1 && d <= 4) && !e)) return false; if (!down) return true;
      if (e) { if (m.li < 4) { m.fault('unfilled'); return true; } m.ev('sent'); m.win(); return true; }
      const L = m.lines[m.li]; if (!L || d > L.es.length) return true;
      if (d - 1 !== L.good) { m.fault('stale'); return true; } L.got = d - 1; m.li++; m.round = Math.min(4, m.li + 1); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => m.t < 0.3 * (m.li + 1) ? [] : m.li < 4 ? [['Digit' + (m.lines[m.li].good + 1), true]] : [['Enter', true]];
    m.bad = () => { const L = m.lines[m.li]; return L ? 'Digit' + (L.good === 0 ? 2 : 1) : 'Enter'; };
    m.view = () => ({ l: m.lines.map(L => L.es.map(e => [e.c, e.v, e.prev])) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      txt(c, 'MARGIN REPORT', 14, 16, { size: 10, col: COL.gold });
      m.lines.forEach((L, i) => { const y = 32 + i * 18, on = i === m.li; if (on) box(c, 10, y - 12, 186, 16, 'rgba(125,151,232,.22)', COL.peri, 3);
        txt(c, L.name, 14, y, { size: 10, col: on ? COL.ink : COL.pale }); txt(c, L.got >= 0 ? `${L.es[L.got].v} ${L.unit}` : on ? '…' : '', 192, y, { size: 10, col: P.good, align: 'right' }); });
      txt(c, m.li >= 4 ? 'All lines filled: Enter sends' : '', 14, 120, { size: 11, col: COL.gold });
      const L = m.lines[m.li]; if (!L) return; box(c, 206, 8, 186, 150, COL.panel, COL.dim, 6); txt(c, `${L.sheet.toUpperCase()} · ${L.name.split(' ')[0]}`, 214, 26, { size: 10, col: COL.gold });
      L.es.forEach((e, k) => { const y = 50 + k * 24; txt(c, `${k + 1}`, 216, y, { size: 12, col: COL.peri }); txt(c, e.c, 236, y, { size: 12, col: COL.ink });
        txt(c, `${e.v} ${L.unit}`, 290, y, { size: 12, col: COL.ink }); if (e.prev) txt(c, 'PREV', 352, y, { size: 10, col: COL.warn }); });
    };
    return m;
  },
});
