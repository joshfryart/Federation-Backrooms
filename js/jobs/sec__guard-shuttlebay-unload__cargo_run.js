// Security: guard shuttlebay unload. Crates ride the unload belt past a count line, and people come to the door. Two jobs at once: press Space
// as each crate crosses the count line (too early or late and it is miscounted), and press Enter to hold anyone arriving without a badge.
// A crate that passes uncounted, or an unbadged person left to walk through, is the failure; holding a badged person is a false hold.
import { define, machine, SPACE, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Guard shuttlebay unload', type: 'task:cargo_run' },
  title: 'Count the line, hold the door', dept: 'security', host: 'console', tool: 'Guard post',
  how: 'Press Space as each crate crosses the count line. Press Enter to hold a person at the door who shows no badge.',
  keys: ['Space count the crate', 'Enter hold an unbadged person'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'count and hold', input: 'space+enter',
    win: 'every crate counted as it crossed the line and every unbadged person at the door held, with no badged person stopped',
    fail: 'a crate leaving the line uncounted or counted off the line, an unbadged person walking through, or holding a badged one',
    rule: 'Crates move left to right: press Space as one crosses the count line. Someone with no badge at the door: press Enter before they walk through.' },
  rush: 'Counted crates from the manifest and waved people through.',
  captions: { uncounted: 'crate left the line uncounted', miscount: 'count off the line', slipped: 'unbadged person through', 'false hold': 'badged person held' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.17 : 0.12, cd = m.calm ? 2.6 : 2.0, pd = m.calm ? 2.3 : 1.8;
    const kinds = shuffle(r, ['c', 'c', 'c', 'c', 'c', 'p', 'p', 'p']); let t = 0.8; m.ev8 = kinds.map((k, i) => { const e = { k, t0: t, bad: k === 'p' && (i === kinds.indexOf('p') || r() < 0.5), done: false, got: false }; t += ri(r, 13, 17) / 10; return e; });
    m.x = (e) => (m.t - e.t0) / (e.k === 'c' ? cd : pd); m.act = (k) => m.ev8.filter(e => e.k === k && !e.done && m.t >= e.t0 && m.x(e) <= 1);
    m.key = (code, down = true) => { if (m.state !== 'play' || !down) return false;
      if (SPACE(code)) { const e = m.act('c').find(q => Math.abs(m.x(q) - 0.7) <= tol); if (e) e.done = e.got = true; else m.fault('miscount'); return true; }
      if (ENTER(code)) { const ps = m.act('p').filter(q => m.x(q) > 0.15), e = ps.find(q => q.bad) || ps[0]; if (!e || !e.bad) m.fault('false hold'); else e.done = e.got = true; return true; } return false; };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const e of m.ev8) if (!e.done && m.t > e.t0 + (e.k === 'c' ? cd : pd)) { e.done = true; if (e.k === 'c') m.fault('uncounted'); else if (e.bad) m.fault('slipped'); }
      if (m.state === 'play' && m.ev8.every(e => e.done)) m.win(); };
    m.hint = () => { if (m.act('c').some(q => Math.abs(m.x(q) - 0.7) <= 0.03)) return [['Space', true]]; return m.act('p').some(q => q.bad && m.x(q) > 0.3) ? [['Enter', true]] : []; };
    m.bad = () => (m.t > 0.3 ? 'Enter' : null);
    m.view = () => ({ ev: m.ev8.map(e => [e.k, e.bad, +e.t0.toFixed(2)]) });
    m.buttons = () => [['Space', 'Count'], ['Enter', 'Hold']];
    m.draw = (c) => { box(c, 14, 20, 372, 40, COL.panel, COL.peri); c.fillStyle = COL.gold; c.fillRect(14 + 372 * 0.7 - 1, 14, 3, 52); txt(c, 'COUNT', 14 + 372 * 0.7 - 16, 12, { size: 9, col: COL.gold });
      for (const e of m.act('c')) box(c, 14 + 372 * m.x(e) - 14, 28, 28, 24, COL.orange, '#fff', 3);
      txt(c, 'DOOR', 14, 92, { size: 10, col: COL.dim }); box(c, 14, 98, 372, 40, COL.panel, COL.peri);
      for (const e of m.act('p')) { const x = 14 + 372 * m.x(e); box(c, x - 12, 102, 24, 32, COL.dim, '#fff', 8); txt(c, e.bad ? 'NO BADGE' : '◆ badge', x - 14, 150, { size: 9, col: e.bad ? COL.warn : COL.pale }); } };
    return m;
  },
});
