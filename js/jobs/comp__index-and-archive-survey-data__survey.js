// Computer specialist: index and archive survey data. Each raw scan file must be tagged before it moves: its survey code (by the number in the
// file name) and its scan type. Move it to the archive volume, then open the archived copy and compare its size before touching the next file.
// A copy whose size does not match has to be moved again. Moving an untagged or mis-tagged file loses it to the next search.
import { define, machine, ARROW, DIG, SPACE, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const TYPES = ['lidar', 'spectral', 'grav', 'thermal'];
export default define({
  job: { billet: 'comp', label: 'Index and archive survey data', type: 'task:survey' },
  title: 'Tag, move, size-check archive', dept: 'operations', host: 'console', tool: 'Datacore archive terminal',
  how: 'For each raw scan: pick its survey code (1-3) from the number in its name, set its scan type (Left / Right), move it (Space), then open the archived copy (Enter) and compare sizes. A size mismatch means move it again.',
  keys: ['1-3 survey code', 'Left / Right scan type', 'Space move to archive', 'Enter open archived copy'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'tag-move-verify', input: 'digits+arrows+space+enter', win: 'every raw scan indexed with its survey code and scan type, archived, and its archived size matched before the next file',
    fail: 'moving a file untagged or under the wrong code or type, or starting the next file before the archived copy was size-checked',
    rule: 'Read the survey number and type in the file name; set the code digit and cycle the type until both match, then Space to move and Enter to compare the copy size. Mismatch: Space again.' },
  rush: 'Dragged the whole folder to the archive volume and left the index for later.',
  captions: { 'moved untagged': 'file lost tone', 'mis-indexed': 'index mismatch chirp', 'skipped size check': 'archive warning' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, d = shuffle(r, ['1', '2', '7']), base = ri(r, 1, 9);
    m.codes = shuffle(r, [d.join(''), d[0] + d[2] + d[1], d[1] + d[0] + d[2]]).map(x => `SV-${base}${x}`);
    const bad = ri(r, 0, 3);
    m.files = Array.from({ length: 4 }, (_, i) => {
      const c = ri(r, 0, 2), ty = ri(r, 0, 3), size = ri(r, 120, 980);
      return { name: `${m.codes[c].slice(3).toLowerCase()}_${TYPES[ty]}_${String(ri(r, 1, 28)).padStart(2, '0')}${pick(r, ['a', 'b', 'c'])}`, code: c + 1, ty, size, tag: 0, tset: (ty + ri(r, 1, 3)) % 4, moved: false, corrupt: i === bad, shown: null };
    });
    m.i = 0; m.rounds = 4; m.round = 0;
    const f = () => m.files[m.i];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const F = f(), dg = DIG(code), a = ARROW(code);
      if (dg) { if (dg > 3) return true; if (F.moved) { m.fault('skipped size check'); return true; } F.tag = dg; return true; }
      if (a === 'L' || a === 'R') { if (!F.moved) F.tset = (F.tset + (a === 'R' ? 1 : 3)) % 4; return true; }
      if (SPACE(code)) {
        if (F.moved) return true; if (!F.tag) { m.fault('moved untagged'); return true; }
        if (F.tag !== F.code || F.tset !== F.ty) { m.fault('mis-indexed'); return true; }
        F.moved = true; F.shown = null; return true;
      }
      if (!ENTER(code)) return false; if (!F.moved) return true;
      if (F.corrupt) { F.corrupt = false; F.moved = false; F.shown = Math.round(F.size * 0.6); m.ev('mismatch'); return true; }
      F.shown = F.size; m.round++; m.ev('archived', { file: m.i }); if (m.i + 1 >= m.files.length) m.win(); else m.i++;
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const F = f(); if (F.moved) return [['Enter', true]]; if (F.tag !== F.code) return [['Digit' + F.code, true]]; if (F.tset !== F.ty) return [['ArrowRight', true]]; return [['Space', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ c: m.codes, f: m.files.map(F => F.name), b: bad });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['ArrowLeft', '◀ type'], ['ArrowRight', 'type ▶'], ['Space', 'Move'], ['Enter', 'Open copy']];
    m.draw = (c, W, H, P) => {
      const F = f(); txt(c, `RAW SCAN ${m.i + 1}/4`, 14, 18, { size: 11, col: COL.dim }); txt(c, F.name, 14, 40, { size: 16, col: COL.gold });
      txt(c, `${F.size} MB`, 14, 58, { size: 11, col: COL.pale });
      box(c, 14, 68, 230, 70, 'rgba(255,255,255,.04)', COL.peri, 8); txt(c, 'INDEX FORM', 22, 84, { size: 10, col: COL.dim });
      m.codes.forEach((k, j) => txt(c, `${j + 1} ${k}${F.tag === j + 1 ? ' ◆' : ''}`, 22 + j * 74, 104, { size: 11, col: F.tag === j + 1 ? COL.gold : COL.ink }));
      txt(c, `type ◀ ${TYPES[F.tset]} ▶`, 22, 128, { size: 12, col: COL.ink });
      txt(c, F.moved ? 'MOVED · open copy to check' : F.shown != null ? `COPY ${F.shown} MB ≠ ${F.size} MB — move again` : 'not moved', 260, 40, { size: 11, col: F.shown != null && !F.moved ? P.bad : F.moved ? COL.warn : COL.dim });
      m.files.forEach((q, j) => txt(c, `${j < m.i ? '✓' : j === m.i ? '▶' : '·'} ${q.name}`, 260, 70 + j * 18, { size: 10, col: j < m.i ? P.good : COL.dim }));
    };
    return m;
  },
});
