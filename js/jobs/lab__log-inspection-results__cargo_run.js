// Lab technician, cargo run: log inspection results. The field reader's printout comes off in the order the items were read, not in log order,
// and the cargo crate IDs differ by a single character here and there. Pick a printout line (↑ ↓), then press the number of the log entry whose
// crate ID it belongs to (1-5). Filing a line under the look-alike crate puts a reading on the wrong crate; submitting (Enter) with any log
// entry still blank holds the whole release queue.
import { define, machine, ARROW, DIG, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const L = 'ABCDEFHKMNPRTX';
const mk = (r) => `${pick(r, L.split(''))}${pick(r, L.split(''))}-${ri(r, 10, 99)}${ri(r, 0, 9)}`;
const twin = (r, id) => { const d = id.split(''), k = pick(r, [0, 1, 3, 4, 5]); const pool = k < 2 ? L : '0123456789'; let c; do c = pick(r, pool.split('')); while (c === d[k]); d[k] = c; return d.join(''); };
export default define({
  job: { billet: 'lab', label: 'Log inspection results', type: 'task:cargo_run' },
  title: 'File the printout under its crate', dept: 'sciences', host: 'console', tool: 'Cargo inspection log',
  how: 'Select a printout line (↑ ↓) and press the number of the log entry with the same crate ID (1-5). Watch for IDs one character apart. Submit (Enter) only when every entry has its reading.',
  keys: ['↑ ↓ select printout line', '1-5 file under log entry', 'Enter submit'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'file the printouts', input: 'arrows+digits+enter', win: 'every printout reading filed against the log entry with exactly its crate ID and the log submitted complete',
    fail: 'filing a reading under a crate whose ID is one character off, or submitting while a crate entry is blank',
    rule: 'The printout is out of order. Choose a line with the arrows, compare its crate ID character by character with the log, press that entry\'s number. Enter submits once no entry is blank.' },
  rush: 'Typed the readings into the log top to bottom in printout order.',
  captions: { misfiled: 'log error tone', blank: 'release queue held' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, base = mk(r);
    const ids = [base]; while (ids.length < 5) { const c = r() < 0.6 ? twin(r, pick(r, ids)) : mk(r); if (!ids.includes(c)) ids.push(c); }
    m.log = shuffle(r, ids).map(id => ({ id, read: null }));
    m.print = shuffle(r, m.log.map((e, k) => ({ k, id: e.id, val: ri(r, 2, 98), sus: r() < 0.3, filed: false })));
    m.sel = 0; m.rounds = 5; m.round = 0;
    const open = () => m.print.map((p, i) => i).filter(i => !m.print[i].filed);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code), o = open();
      if (a === 'U' || a === 'D') { if (!o.length) return true; const j = o.indexOf(m.sel); m.sel = o[((j < 0 ? 0 : j) + (a === 'D' ? 1 : o.length - 1)) % o.length]; return true; }
      if (d >= 1 && d <= 5) {
        const p = m.print[m.sel]; if (!p || p.filed) return true; if (m.log[d - 1].read) { m.fault('misfiled'); return true; }
        if (p.k !== d - 1) { m.fault('misfiled'); return true; }
        p.filed = true; m.log[d - 1].read = p; m.round++; const o2 = open(); if (o2.length) m.sel = o2[0]; return true;
      }
      if (ENTER(code)) { if (m.log.some(e => !e.read)) { m.fault('blank'); return true; } m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.state !== 'play') return []; const p = m.print[m.sel]; if (!open().length) return [['Enter', true]]; if (!p || p.filed) return [['ArrowDown', true]]; return [[`Digit${p.k + 1}`, true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ log: m.log.map(e => e.id), pr: m.print.map(p => p.k) });
    m.buttons = () => [['ArrowUp', '↑'], ['ArrowDown', '↓'], ...[1, 2, 3, 4, 5].map(n => [`Digit${n}`, `Entry ${n}`]), ['Enter', 'Submit']];
    m.draw = (c, W, H, P) => {
      txt(c, 'READER PRINTOUT', 12, 14, { size: 10, col: COL.dim }); txt(c, 'INSPECTION LOG', 214, 14, { size: 10, col: COL.dim });
      m.print.forEach((p, i) => { const y = 22 + i * 24; if (i === m.sel && !p.filed) box(c, 8, y, 180, 20, COL.panel, COL.gold, 4); txt(c, `${p.id}  ${p.val} ${p.sus ? 'SUSPECT' : 'clear'}`, 14, y + 14, { size: 11, col: p.filed ? COL.dim : COL.ink }); if (p.filed) txt(c, '✓', 182, y + 14, { size: 11, col: P.good, align: 'right' }); });
      m.log.forEach((e, i) => { const y = 22 + i * 24; box(c, 210, y, 182, 20, null, e.read ? P.good : COL.dim, 4); txt(c, `${i + 1}  ${e.id}`, 216, y + 14, { size: 11 }); txt(c, e.read ? `${e.read.val} ${e.read.sus ? 'HOLD' : 'release'}` : '— blank', 386, y + 14, { size: 10, col: e.read ? COL.pale : COL.warn, align: 'right' }); });
      txt(c, `${m.log.filter(e => e.read).length} / 5 filed`, 12, 154, { size: 12, col: COL.pale });
    };
    return m;
  },
});
