// Deck crew: inventory suits and tool lockers. The pen travels steadily along the locker rail, one hook at a time. As it points at each hook,
// tick it (Space) if a suit hangs there with its seal ring, or flag it (Enter) if the hook is empty or the suit has no ring. One mark per hook:
// a second mark is a double count, the wrong mark is a miscount, and a hook the pen leaves unmarked is a skipped hook.
import { define, machine, SPACE, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Inventory suits and tool lockers', type: 'task:quiet_watch' },
  title: 'Suit rail count against the pen', dept: 'flight', host: 'console', tool: 'Suit locker rail and register',
  how: 'The pen moves along the rail by itself. While it points at a hook, press Space if a ringed suit hangs there, Enter if the hook is empty or the suit lacks its seal ring. One mark per hook.',
  keys: ['Space tick: suit present', 'Enter flag: empty or no ring'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'mark in passing', input: 'space+enter', win: 'every hook on the moving rail marked once, suits ticked and empty or ringless hooks flagged',
    fail: 'double-counting a hook, ticking an empty one, or letting the pen pass a hook unmarked',
    rule: 'The pen pauses briefly at each hook in turn. Space ticks a suit with its seal ring; Enter flags an empty hook or a suit missing its ring. Each hook takes exactly one mark before the pen moves on.' },
  rush: 'Counted the suits by eye from the doorway.',
  captions: { 'double count': 'pen scratch', miscount: 'register beep', skipped: 'pen moves on' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 12, dwell = m.calm ? 1.25 : 0.95;
    const bad = new Set(shuffle(r, [...Array(n).keys()]).slice(0, ri(r, 3, 5)));
    m.hooks = [...Array(n).keys()].map(i => ({ no: 20 + i, suit: !bad.has(i) || r() < 0.4, ring: !bad.has(i), mark: null }));
    m.hooks.forEach(h => { if (!h.suit) h.ring = false; });
    m.p = -0.6; m.dwell = dwell;
    const at = () => (m.p >= 0 ? m.hooks[Math.floor(m.p)] : null);
    const ok = (h) => h.suit && h.ring;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const sp = SPACE(code), en = ENTER(code); if (!sp && !en) return false; if (!down) return true;
      const h = at(); if (!h) return true; if (h.mark) { m.fault('double count'); return true; }
      h.mark = sp ? 'tick' : 'flag'; if (sp !== ok(h)) m.fault('miscount'); m.ev('mark', { hook: h.no, mark: h.mark }); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const prev = at(); m.p += dt / m.dwell;
      if (prev && at() !== prev && !prev.mark) { prev.mark = 'skip'; m.fault('skipped'); }
      if (m.p >= n && m.state === 'play') m.win();
    };
    m.hint = () => { const h = at(); if (!h || h.mark || m.p - Math.floor(m.p) < 0.2) return []; return [[ok(h) ? 'Space' : 'Enter', true]]; };
    m.bad = () => (at() ? 'Space' : null);
    m.view = () => ({ hooks: m.hooks.map(h => (h.suit ? (h.ring ? 2 : 1) : 0)) });
    m.buttons = () => [['Space', 'Tick suit'], ['Enter', 'Flag hook']];
    m.draw = (c, W, H, P) => {
      txt(c, 'SUIT LOCKER RAIL', 16, 20, { size: 12, col: COL.gold });
      const cur = Math.floor(m.p), x0 = 200; c.fillStyle = COL.dim; c.fillRect(10, 40, 380, 3);
      for (let j = -3; j <= 3; j++) { const i = cur + j; if (i < 0 || i >= m.hooks.length) continue; const h = m.hooks[i], x = x0 + j * 56;
        txt(c, `#${h.no}`, x, 56, { size: 10, align: 'center', col: j === 0 ? COL.ink : COL.dim });
        if (h.suit) { box(c, x - 14, 62, 28, 58, j === 0 ? COL.peri : 'rgba(125,151,232,.4)', null, 6); if (h.ring) { c.strokeStyle = COL.gold; c.lineWidth = 3; c.beginPath(); c.arc(x, 70, 7, 0, 6.283); c.stroke(); } }
        else { c.strokeStyle = COL.dim; c.setLineDash?.([3, 3]); c.strokeRect(x - 14, 62, 28, 58); c.setLineDash?.([]); }
        if (h.mark === 'tick') lamp(c, x, 136, 7, P.good, 'circle'); else if (h.mark) lamp(c, x, 136, 7, P.bad, 'triangle'); }
      c.fillStyle = COL.orange; c.beginPath(); c.moveTo(x0, 150); c.lineTo(x0 - 7, 164); c.lineTo(x0 + 7, 164); c.fill();
      txt(c, `pen ${Math.min(m.hooks.length, cur + 1)} / ${m.hooks.length}`, 390, 20, { size: 11, align: 'right', col: COL.dim });
    };
    return m;
  },
});
