// Second officer: visit the lab and check data handling. Scroll each survey file to its last row, counting records as you go, and compare
// the count and the checksum in the corner with the file header and the handling sheet taped to the console. Archive (1) only a file where
// all of them agree; quarantine (2) a short or padded file, or one whose checksum differs from the sheet or was copied from the last file.
// Deciding before reading to the last row is a fault.
import { define, machine, ARROW, DIG, ri, pick, shuffle, txt, box, COL } from './kit.js';

const INST = ['GRAV-2', 'SPEC-7', 'LR-ARRAY', 'MAG-4', 'PART-1'];
const HEX = '0123456789ABCDEF';
const sum = (r) => Array.from({ length: 6 }, () => pick(r, HEX.split(''))).join('');

export default define({
  job: { billet: 'so', label: 'Visit lab and check data handling', type: 'task:survey' },
  title: 'Survey file count and checksum', dept: 'command', host: 'console', tool: 'Lab data console and handling sheet',
  how: 'Scroll each survey file to the end counting its rows, then archive it only if the count matches the header and the checksum matches the handling sheet.',
  keys: ['↑ ↓ scroll rows', '1 archive', '2 quarantine'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'count and archive', input: 'arrows+digits', win: 'three survey files read to the last row and archived only when row count, header and checksum all agree',
    fail: 'archiving a short or padded file or a copied checksum, or deciding before reading every row',
    rule: 'Scroll ↓ to the last row while counting. 1 archives if the rows equal the header count and the corner checksum equals the sheet; otherwise 2 quarantines.' },
  rush: 'Saw the right file name and dragged it into the archive.',
  captions: { unread: 'console bloop', 'corrupt archived': 'archive error chime', 'good quarantined': 'quarantine click' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nBad = ri(r, 1, 2), bad = new Set(shuffle(r, [0, 1, 2]).slice(0, nBad)); let last = sum(r);
    m.files = [0, 1, 2].map(i => {
      const n = ri(r, 7, 11), tags = shuffle(r, Array.from({ length: 40 }, (_, k) => 100 + k * 3)).slice(0, n).sort((a, b) => a - b).map(t => `S-${t}  ${(r() * 90 + 10).toFixed(2)}  ${pick(r, ['ok', 'ok', 'lo', 'hi'])}`);
      let hdr = n, ck = sum(r), sheet = ck, why = '';
      if (bad.has(i)) { const k = ri(r, 0, 2); if (k === 0) { hdr = n + 1; why = 'short'; } else if (k === 1) { hdr = n - 1; tags.splice(ri(r, 1, n - 2), 0, tags[0]); why = 'padded'; } else { ck = last; why = 'copied sum'; } }
      last = sheet; return { inst: pick(r, INST), date: `${ri(r, 2380, 2399)}.${ri(r, 10, 99)}`, rows: tags, hdr, ck, sheet, bad: bad.has(i), why, top: 0, seen: 0, call: 0 };
    });
    m.rounds = 3; m.round = 0; const VIS = 5;
    const F = () => m.files[m.round];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code), f = F(); if (!f) return false;
      if (a === 'U' || a === 'D') { f.top = Math.max(0, Math.min(f.rows.length - VIS, f.top + (a === 'D' ? 1 : -1))); f.seen = Math.max(f.seen, f.top + VIS); return true; }
      if (d === 1 || d === 2) {
        if (f.seen < f.rows.length) { m.fault('unread'); return true; }
        if (d === 1 && f.bad) { m.fault('corrupt archived'); return true; } if (d === 2 && !f.bad) { m.fault('good quarantined'); return true; }
        f.call = d; m.round++; if (m.round >= 3) m.win(); return true;
      }
      return false;
    };
    m.files.forEach(f => { f.seen = VIS; });
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const f = F(); if (!f) return []; if (f.seen < f.rows.length) return [['ArrowDown', true]]; return [[f.bad ? 'Digit2' : 'Digit1', true]]; };
    m.bad = () => { const f = F(); return f && f.seen >= f.rows.length ? (f.bad ? 'Digit1' : 'Digit2') : 'Digit1'; };
    m.view = () => ({ f: m.files.map(f => [f.inst, f.rows.length, f.hdr, f.ck, f.sheet, f.why]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Digit1', '1 Archive'], ['Digit2', '2 Quarantine']];
    m.draw = (c, W, H, P) => {
      const f = F(); if (!f) return;
      txt(c, `${f.inst} · captured ${f.date} · header: ${f.hdr} records`, 10, 16, { size: 11, col: COL.gold }); txt(c, `file ${m.round + 1} / 3`, W - 10, 16, { size: 10, col: COL.dim, align: 'right' });
      box(c, 8, 24, 250, 104, 'rgba(255,255,255,.04)', COL.peri, 6);
      f.rows.slice(f.top, f.top + VIS).forEach((s, k) => txt(c, s, 16, 42 + k * 19, { size: 11, font: 'monospace', col: COL.ink }));
      txt(c, f.top + VIS >= f.rows.length ? '— end of file —' : '▼ more rows', 133, 140, { size: 10, align: 'center', col: f.top + VIS >= f.rows.length ? P.good : COL.dim });
      box(c, 268, 24, 124, 46, 'rgba(255,255,255,.04)', null, 6); txt(c, 'CHECKSUM', 276, 40, { size: 9, col: COL.dim }); txt(c, f.ck, 276, 60, { size: 14, font: 'monospace' });
      box(c, 268, 78, 124, 50, 'rgba(244,194,91,.12)', COL.gold, 6); txt(c, 'HANDLING SHEET', 276, 94, { size: 9, col: COL.gold }); txt(c, f.sheet, 276, 116, { size: 14, font: 'monospace' });
      txt(c, 'Count the rows yourself: the header may be wrong.', 10, 162, { size: 10, col: COL.pale });
    };
    return m;
  },
});
