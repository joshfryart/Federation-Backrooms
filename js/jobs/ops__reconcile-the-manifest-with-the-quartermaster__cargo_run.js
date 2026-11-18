// Ops: reconcile the manifest with the quartermaster. Each manifest line sits beside the quartermaster's inventory line, but paper can agree
// while the shelf does not. Point at the crate with the line's code on the cargo shelf (← →) to read its real count, then tick the line
// (Space) only if manifest, inventory and crate all agree, or cross it (Enter) for a correction. Deciding without pointing at the crate is a fault.
import { define, machine, ARROW, SPACE, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const GOODS = ['medical stores', 'ration packs', 'water casks', 'hull patches', 'field rations', 'spare couplers', 'blankets', 'filter cartridges'];

export default define({
  job: { billet: 'ops', label: 'Reconcile the manifest with the quartermaster', type: 'task:cargo_run' },
  title: 'Three-way manifest reconcile', dept: 'operations', host: 'console', tool: 'Cargo desk, manifest and shelf',
  how: 'For each manifest line, point at its crate on the shelf (← →) to read the real count, then tick it (Space) if manifest, inventory sheet and crate all agree, or cross it (Enter) so the correction goes on both sheets.',
  keys: ['← → point at a crate', 'Space tick', 'Enter cross'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'three-way reconcile', input: 'arrows+space+enter', win: 'every manifest line ticked or crossed against both the inventory sheet and the real crate on the shelf',
    fail: 'ticking a line that matched on paper but not on the shelf, crossing a true match, or deciding without pointing at the crate',
    rule: 'Crate counts show only while the pointer is on the crate. Find the crate whose code matches the line, compare its count with both sheets, then Space for all three equal, Enter for any difference.' },
  rush: 'Ticked every line where the two sheets agreed and never looked at the shelf.',
  captions: { 'not on shelf': 'quartermaster points at the shelf', 'ticked mismatch': 'quartermaster shakes head', 'false cross': 'quartermaster recounts' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 5;
    m.crates = shuffle(r, GOODS).slice(0, n).map(g => { const q = ri(r, 6, 40); return { g, code: `C-${ri(r, 100, 999)}`, man: q, inv: q, shelf: q }; });
    const kinds = shuffle(r, ['ok', 'ok', 'paper', 'shelf', pick(r, ['ok', 'shelf', 'paper'])]);
    m.crates.forEach((c, i) => { if (kinds[i] === 'paper') c.inv = c.man + pick(r, [-2, -1, 1, 3]); if (kinds[i] === 'shelf') c.shelf = c.man - ri(r, 1, 3); c.ok = kinds[i] === 'ok'; });
    m.order = shuffle(r, [...Array(n).keys()]); m.lines = m.order.slice(0, 4); m.k = 0; m.ptr = ri(r, 0, n - 1); m.marks = []; m.last = -9; m.msg = ''; m.rounds = 4; m.round = 0;
    const L = () => m.crates[m.lines[m.k]];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!down) return !!a || SPACE(code) || ENTER(code);
      if (a === 'L' || a === 'R') { m.ptr = (m.ptr + (a === 'R' ? 1 : n - 1)) % n; m.last = m.t; return true; }
      if (SPACE(code) || ENTER(code)) {
        m.last = m.t; const c = L();
        if (m.crates[m.ptr] !== c) { m.fault('not on shelf'); m.msg = `Point at crate ${c.code} on the shelf first`; return true; }
        if (SPACE(code) && !c.ok) { m.fault('ticked mismatch'); m.msg = 'The counts do not all agree'; return true; }
        if (ENTER(code) && c.ok) { m.fault('false cross'); m.msg = 'All three agree — that one is a tick'; return true; }
        m.marks.push(SPACE(code) ? '✓' : '✗'); m.msg = SPACE(code) ? `${c.code} ticked` : `${c.code} crossed — correction to ${c.shelf} on both sheets`; m.k++; m.round++; if (m.k >= 4) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.t - m.last < 0.15) return []; const c = L(); if (!c) return []; const tgt = m.crates.indexOf(c); if (m.ptr !== tgt) return [[(tgt - m.ptr + n) % n <= n / 2 ? 'ArrowRight' : 'ArrowLeft', true]]; return [[c.ok ? 'Space' : 'Enter', true]]; };
    m.bad = () => (m.t - m.last < 0.2 ? null : 'Space');
    m.view = () => ({ crates: m.crates.map(c => [c.code, c.man, c.inv, c.shelf]), lines: m.lines });
    m.buttons = () => [['ArrowLeft', '◀ crate'], ['ArrowRight', 'crate ▶'], ['Space', 'Tick ✓'], ['Enter', 'Cross ✗']];
    m.draw = (c, W, H, P) => {
      const l = L(); if (!l) return;
      box(c, 10, 8, 185, 54, 'rgba(255,255,255,.05)', COL.gold, 8); txt(c, `MANIFEST line ${m.k + 1}/4`, 18, 24, { size: 10, col: COL.dim }); txt(c, `${l.code} ${l.g}`, 18, 40, { size: 11 }); txt(c, `qty ${l.man}`, 18, 56, { size: 12, col: COL.gold });
      box(c, 205, 8, 185, 54, 'rgba(255,255,255,.05)', COL.peri, 8); txt(c, 'QM INVENTORY SHEET', 213, 24, { size: 10, col: COL.dim }); txt(c, `${l.code} ${l.g}`, 213, 40, { size: 11 }); txt(c, `qty ${l.inv}`, 213, 56, { size: 12, col: COL.peri });
      txt(c, 'CARGO SHELF', 14, 80, { size: 10, col: COL.dim });
      m.crates.forEach((q, i) => { const x = 12 + i * 76, on = i === m.ptr; box(c, x, 86, 70, 40, on ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.05)', on ? COL.orange : null, 6); txt(c, q.code, x + 35, 102, { size: 11, align: 'center' }); txt(c, on ? `count ${q.shelf}` : '· · ·', x + 35, 119, { size: 11, align: 'center', col: on ? COL.warn : COL.dim }); });
      txt(c, `marks ${m.marks.join(' ')}`, 14, 146, { size: 11, col: COL.pale }); txt(c, m.msg, 14, H - 8, { size: 11, col: COL.pale });
    };
    return m;
  },
});
