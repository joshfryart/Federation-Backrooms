// Helm: submit the maneuver report. Copy each line of the maneuver test log onto the report form: test name, handling figure, its unit,
// and a status judged against the printed limit (pass at or under it, marginal up to a tenth over, fail beyond). The console carries the
// previous form's entries over to the next one, so every field has to be checked, not just the blank ones. File each form with Enter; a
// blank field or a figure carried over from the last test sends it back from the CFO.
import { define, machine, ARROW, ENTER, rf, shuffle, txt, box, COL } from './kit.js';

const FIELDS = ['Test', 'Figure', 'Unit', 'Status'], UNITS = ['—', 'deg', 's'], STAT = ['—', 'pass', 'marginal', 'fail'];
export default define({
  job: { billet: 'helm', label: 'Submit maneuver report', type: 'task:shakedown' },
  title: 'Maneuver report form transcription', dept: 'flight', host: 'console', tool: 'Maneuver test log and report form',
  how: 'Move between form fields with ← / →, change a field with ↑ / ↓ to match the highlighted log line (status from the limit), then press Enter to file. Check the carried-over fields too.',
  keys: ['← / → field', '↑ / ↓ change value', 'Enter file the form'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'transcribe', input: 'arrows+enter', win: 'three report forms filed with every field copied from its own log line and the status judged from the limit',
    fail: 'filing a form with a blank field, or with a figure or unit carried over from the previous test',
    rule: 'The cursor field is outlined; ↑ / ↓ cycles its value and ← / → moves between fields. The next form starts with the last one\'s entries. Enter files the form; any blank or mismatch sends it back.' },
  rush: 'Filed the report with the previous test\'s numbers copied down the page.',
  captions: { 'blank field': 'CFO returns the form', 'wrong entry': 'CFO: these numbers are not from this test' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const names = shuffle(r, ['Forward', 'Reverse', 'Port turn', 'Starboard turn']).slice(0, 3);
    m.log = names.map(n => { const turn = /turn/.test(n), lim = turn ? 15 : 4.0, k = r(), fig = +(lim * (k < 0.4 ? rf(r, 0.6, 0.98) : k < 0.7 ? rf(r, 1.02, 1.09) : rf(r, 1.15, 1.4))).toFixed(1);
      return { n, fig, unit: turn ? 1 : 2, lim, st: fig <= lim ? 1 : fig <= lim * 1.1 ? 2 : 3 }; });
    m.figs = ['—', ...shuffle(r, m.log.map(l => l.fig))]; m.names = ['—', ...shuffle(r, ['Forward', 'Reverse', 'Port turn', 'Starboard turn'])];
    m.i = 0; m.cur = 0; m.form = [0, 0, 0, 0]; m.filed = []; m.rounds = 3; m.round = 0;
    const opts4 = () => [m.names.length, m.figs.length, UNITS.length, STAT.length];
    const want = () => { const l = m.log[m.i]; return [m.names.indexOf(l.n), m.figs.indexOf(l.fig), l.unit, l.st]; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a) { if (!down) return true; if (a === 'L' || a === 'R') m.cur = (m.cur + (a === 'R' ? 1 : 3)) % 4; else { const n = opts4()[m.cur]; m.form[m.cur] = (m.form[m.cur] + (a === 'D' ? 1 : n - 1)) % n; } return true; }
      if (ENTER(code)) { if (!down) return true; if (m.form.some(v => v === 0)) { m.fault('blank field'); return true; }
        const w = want(); if (m.form.some((v, k) => v !== w[k])) { m.fault('wrong entry'); return true; }
        m.filed.push([...m.form]); m.i++; m.round = m.i; m.cur = 0; if (m.i >= 3) m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (m.state !== 'play') return []; const w = want(), f = m.form.findIndex((v, k) => v !== w[k]); if (f < 0) return [['Enter', true]];
      if (f !== m.cur) return [[f > m.cur ? 'ArrowRight' : 'ArrowLeft', true]];
      const n = opts4()[f], up = (m.form[f] - w[f] + n) % n; return [[up <= n / 2 ? 'ArrowUp' : 'ArrowDown', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ log: m.log.map(l => [l.n, l.fig]) });
    m.buttons = () => [['ArrowLeft', '◀ field'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowRight', 'field ▶'], ['Enter', 'File']];
    m.draw = (c, W, H, P) => {
      box(c, 10, 10, 180, 150, COL.panel, null, 6); txt(c, 'TEST LOG', 20, 26, { size: 10, col: COL.dim });
      m.log.forEach((l, i) => { const y = 46 + i * 34; txt(c, `${i + 1}. ${l.n}`, 20, y, { size: 12, col: i === m.i ? COL.gold : i < m.i ? COL.dim : COL.ink });
        txt(c, `${l.fig} ${UNITS[l.unit]}   limit ${l.lim} ${UNITS[l.unit]}`, 30, y + 15, { size: 11, col: i === m.i ? COL.pale : COL.dim }); });
      txt(c, `REPORT FORM ${Math.min(3, m.i + 1)} / 3`, 206, 26, { size: 10, col: COL.dim });
      const vals = [m.names[m.form[0]], m.figs[m.form[1]], UNITS[m.form[2]], STAT[m.form[3]]];
      FIELDS.forEach((f, k) => { const y = 36 + k * 30; box(c, 206, y, 180, 24, 'rgba(255,255,255,.05)', k === m.cur ? COL.gold : null, 4);
        txt(c, f, 214, y + 16, { size: 10, col: COL.dim }); txt(c, String(vals[k]), 270, y + 16, { size: 12, col: m.form[k] === 0 ? COL.warn : COL.ink }); });
      txt(c, 'Enter: file to CFO queue', 206, 162, { size: 10, col: COL.dim });
    };
    return m;
  },
});
