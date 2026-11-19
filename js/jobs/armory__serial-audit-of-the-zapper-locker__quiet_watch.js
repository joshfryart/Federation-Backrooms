// Armory, quiet watch: serial audit of the zapper locker. The ledger page lists six zappers. The locker rail shows the grip serials actually on
// their clips (some clips empty, one serial a near miss of a ledger line). For each ledger line: 1 if that exact serial is on the rail, 2 if it
// is off the rail but a sign-out slip covers it, 3 if it is nowhere: missing. The slips are a stack: page through them with ← → (one at a time)
// before calling any weapon signed out or missing. Near-miss serials on the rail or on a slip do not count.
import { define, machine, DIG, ARROW, ri, shuffle, txt, box, COL } from './kit.js';

const ser = (r) => `ZP-${ri(r, 1, 9)}${ri(r, 0, 9)}${ri(r, 0, 9)}${ri(r, 0, 9)}`;
const near = (r, s) => { const i = ri(r, 3, 6), d = (+s[i] + ri(r, 1, 8)) % 10; return s.slice(0, i) + d + s.slice(i + 1); };
export default define({
  job: { billet: 'armory', label: 'Serial audit of the zapper locker', type: 'task:quiet_watch' },
  title: 'Locker rail versus ledger and slips', dept: 'security', host: 'console', tool: 'Ledger page and sign-out slips',
  how: 'For each ledger line: 1 if the exact serial hangs on the rail, 2 if a sign-out slip covers it, 3 if it is missing. Page through the slip stack with ← → before you call anything signed out or missing.',
  keys: ['1 on rail', '2 signed out', '3 missing', '← → page the slips'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'chase the gaps', input: 'digits+arrows', win: 'every ledger line resolved as on the rail, covered by a sign-out slip, or reported missing, with near-miss serials not accepted',
    fail: 'ticking a serial that is not on the rail, calling a weapon signed out with no slip, or reporting missing one that is on a slip or the rail',
    rule: 'Read the ledger line, find it on the rail (exact digits) and press 1. If it is not there, page the slips with ← →: a slip with that exact serial is 2, none is 3. Near misses do not count.' },
  rush: 'Counted the clips against the number at the foot of the page and sealed the locker.',
  captions: { 'ticked absent': 'ledger pencil scratches', 'covered a loss': 'locker seal snaps', 'false missing': 'alarm chirps', 'slips unchecked': 'slip stack rustles' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const kinds = shuffle(r, ['rail', 'rail', 'rail', 'out', 'gone', r() < 0.5 ? 'out' : 'gone']), used = new Set();
    const uniq = (f) => { let s; do s = f(); while (used.has(s)); used.add(s); return s; };
    m.lines = kinds.map(k => ({ k, s: uniq(() => ser(r)), res: 0 }));
    const gone = m.lines.filter(l => l.k === 'gone');
    m.rail = shuffle(r, [...m.lines.filter(l => l.k === 'rail').map(l => l.s), uniq(() => near(r, gone[0].s)), '', '']);
    m.slips = shuffle(r, [...m.lines.filter(l => l.k === 'out').map(l => l.s), uniq(() => near(r, (gone[1] || gone[0]).s)), uniq(() => ser(r))]);
    m.sl = 0; m.seen = new Set([0]); m.i = 0; m.rounds = 6; m.round = 0;
    const L = () => m.lines[m.i];
    const answer = (l, d) => {
      if (d === 1) { if (l.k !== 'rail') return m.fault('ticked absent'); }
      else { if (m.seen.size < m.slips.length) return m.fault('slips unchecked'); if (d === 2 && l.k !== 'out') return m.fault(l.k === 'rail' ? 'false missing' : 'covered a loss'); if (d === 3 && l.k !== 'gone') return m.fault('false missing'); }
      l.res = d; m.i++; m.round++; if (m.i >= m.lines.length) m.win();
    };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code);
      if (a === 'L' || a === 'R') { m.sl = (m.sl + (a === 'R' ? 1 : m.slips.length - 1)) % m.slips.length; m.seen.add(m.sl); return true; }
      if (d >= 1 && d <= 3) { answer(L(), d); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const l = L(); if (!l) return []; if (l.k === 'rail') return [['Digit1', true]]; if (m.seen.size < m.slips.length) return [['ArrowRight', true]]; return [[l.k === 'out' ? 'Digit2' : 'Digit3', true]]; };
    m.bad = () => { const l = L(); return l?.k === 'rail' ? 'Digit3' : 'Digit1'; };
    m.view = () => ({ lines: m.lines.map(l => [l.k, l.s]), rail: m.rail, slips: m.slips });
    m.buttons = () => [['Digit1', '1 Rail'], ['Digit2', '2 Signed out'], ['Digit3', '3 Missing'], ['ArrowLeft', '◀ slip'], ['ArrowRight', 'slip ▶']];
    m.draw = (c, W, H, P) => {
      txt(c, 'LEDGER', 14, 16, { size: 10, col: COL.dim });
      m.lines.forEach((l, k) => {
        const y = 32 + k * 20, cur = k === m.i; if (cur) box(c, 8, y - 13, 112, 18, 'rgba(244,194,91,.18)', COL.gold, 4);
        txt(c, l.s, 14, y, { size: 12, font: 'monospace', col: cur ? COL.gold : COL.ink }); txt(c, ['', '✓ rail', '✎ out', '✖ MISSING'][l.res], 102, y, { size: 9, col: l.res === 3 ? P.bad : P.good, align: 'right' });
      });
      txt(c, 'LOCKER RAIL (left → right)', 132, 16, { size: 10, col: COL.dim });
      m.rail.forEach((s, k) => { const x = 132 + (k % 3) * 82, y = 26 + Math.floor(k / 3) * 26; box(c, x, y, 76, 20, '#14122a', COL.peri, 4); txt(c, s || 'empty clip', x + 38, y + 14, { size: 10, font: 'monospace', align: 'center', col: s ? COL.ink : COL.dim }); });
      box(c, 132, 92, 160, 56, '#201c10', COL.pale, 6); txt(c, `SIGN-OUT SLIP ${m.sl + 1} / ${m.slips.length}`, 140, 108, { size: 10, col: COL.dim });
      txt(c, m.slips[m.sl], 140, 132, { size: 16, font: 'monospace', col: COL.pale });
      txt(c, `slips read ${m.seen.size}/${m.slips.length}`, 300, 132, { size: 10, col: m.seen.size === m.slips.length ? P.good : COL.warn });
    };
    return m;
  },
});
