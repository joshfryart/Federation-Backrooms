// Deputy security chief: armory inventory audit. Walk a cursor along both racks of the open locker and mark every slot exactly once (Space),
// weapons, charge packs and empty hooks alike, so the tally builds up against the sign-out log. Marking a slot twice double-counts it; taking
// the cursor to the countersign tile while any slot is still unmarked sends up a count with a gap the rack hid.
import { define, machine, SPACE, ARROW, ri, pick, txt, box, COL } from './kit.js';

const COLS = 6, ROWS = 2;
export default define({
  job: { billet: 'dep', label: 'Armory inventory audit', type: 'loop' },
  title: 'Rack-by-rack tally', dept: 'security', host: 'console', tool: 'Locker rack tally board',
  how: 'Move along both racks with the arrows and press Space once on every slot to tally it. Then go to SIGN at the end of the rack and press Space to countersign.',
  keys: ['Arrows move along the rack', 'Space tally the slot / countersign'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'tally once', input: 'arrows+space', win: 'every rack slot tallied exactly one time before the audit sheet is countersigned',
    fail: 'marking a slot twice so it is double-counted, or countersigning while a slot is still untallied',
    rule: 'Arrows move a cursor over a 2 x 6 locker rack; Space tallies the slot under it (once only). The SIGN tile at the right end countersigns, and only takes when every slot is ticked.' },
  rush: 'Eyeballed the rack, copied the sign-out total and signed.',
  captions: { 'double count': 'tally clicks twice', 'gap hidden': 'sheet rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.slots = Array.from({ length: ROWS * COLS }, () => { const k = pick(r, ['phaser', 'phaser', 'rifle', 'pack', 'pack', 'empty']); return { k, g: k === 'pack' ? ri(r, 10, 100) : 0, n: false }; });
    m.cx = 0; m.cy = 0; m.out = ri(r, 1, 3); m.cool = 0;
    const left = () => m.slots.filter(s => !s.n).length, at = () => m.cx === COLS ? null : m.slots[m.cy * COLS + m.cx];
    m.tally = (k) => m.slots.filter(s => s.n && (k ? s.k === k : s.k !== 'empty')).length;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a) { if (down) { if (a === 'L') m.cx = Math.max(0, m.cx - 1); if (a === 'R') m.cx = Math.min(COLS, m.cx + 1); if (a === 'U') m.cy = 0; if (a === 'D') m.cy = 1; } return true; }
      if (!SPACE(code)) return false; if (!down) return true;
      const s = at();
      if (!s) { if (left()) { m.fault('gap hidden'); m.ev('sign refused', { left: left() }); } else m.win(); return true; }
      if (s.n) { m.fault('double count'); return true; }
      s.n = true; m.round = ROWS * COLS - left(); return true;
    };
    m.rounds = ROWS * COLS; m.round = 0;
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      const i = m.slots.findIndex(s => !s.n); if (i < 0) return m.cx < COLS ? [['ArrowRight', true]] : [['Space', true]];
      const y = Math.floor(i / COLS), x = i % COLS; if (y !== m.cy) return [[y ? 'ArrowDown' : 'ArrowUp', true]];
      if (x !== m.cx) return [[x < m.cx ? 'ArrowLeft' : 'ArrowRight', true]]; return [['Space', true]];
    };
    m.bad = () => 'Space';
    m.view = () => ({ rack: m.slots.map(s => s.k[0] + s.g), out: m.out });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowRight', '▶'], ['Space', 'Tally']];
    m.draw = (c, W, H, P) => {
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const s = m.slots[y * COLS + x], X = 14 + x * 50, Y = 18 + y * 56, cur = m.cx === x && m.cy === y;
        box(c, X, Y, 44, 48, s.n ? 'rgba(79,208,106,.12)' : COL.panel, cur ? COL.gold : 'rgba(255,255,255,.15)', 5);
        txt(c, s.k === 'empty' ? '—' : s.k === 'pack' ? 'PACK' : s.k === 'rifle' ? 'RIFLE' : 'PH-1', X + 22, Y + 20, { size: 10, align: 'center', col: s.k === 'empty' ? COL.dim : COL.ink });
        if (s.k === 'pack') { c.fillStyle = s.g < 30 ? COL.warn : COL.peri; c.fillRect(X + 6, Y + 26, 32 * s.g / 100, 4); }
        if (s.n) txt(c, '✓', X + 22, Y + 44, { size: 12, align: 'center', col: P.good });
      }
      box(c, 316, 18, 70, 104, m.cx === COLS ? 'rgba(244,194,91,.2)' : COL.panel, m.cx === COLS ? COL.gold : 'rgba(255,255,255,.15)', 6);
      txt(c, 'SIGN', 351, 66, { size: 13, align: 'center', col: COL.gold }); txt(c, left() ? `${left()} left` : 'ready', 351, 84, { size: 10, align: 'center', col: left() ? COL.warn : P.good });
      txt(c, `Tally: ${m.tally('phaser') + m.tally('rifle')} weapons · ${m.tally('pack')} packs · ${m.slots.filter(s => s.n && s.k === 'empty').length} empty`, 14, 146, { size: 11, col: COL.pale });
      txt(c, `Sign-out log: ${m.out} out`, 14, 162, { size: 10, col: COL.dim });
    };
    return m;
  },
});
