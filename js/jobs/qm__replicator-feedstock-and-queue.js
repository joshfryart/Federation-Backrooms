// Quartermaster: replicator queue. Live meal orders creep forward; stuck entries are frozen. Watch the bars for a couple of seconds, move to a
// frozen entry (Up/Down) and press Enter to purge it. Purging a live order loses someone's lunch.
import { define, machine, ARROW, ENTER, ri, rf, shuffle, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Replicator feedstock and queue', type: 'loop' },
  title: 'Purge the frozen queue entries', dept: 'services', host: 'console', tool: 'Replicator touch queue',
  how: 'Watch the queue bars. Live orders keep creeping; stuck entries do not move. Up/Down to the frozen ones and Enter to purge them. Never purge one that is moving.',
  keys: ['Up/Down select', 'Enter purge'], limit: 28, maxFaults: 2,
  fingerprint: { verb: 'purge the frozen', input: 'arrows+enter', win: 'every frozen queue entry purged while every creeping meal order is left running',
    fail: 'purging a live order whose bar is still creeping forward',
    rule: 'Each queue line has a progress bar. After a couple of seconds the stuck entries are the ones whose bars have not moved. Select one and press Enter. Moving bars are lunches: leave them.' },
  rush: 'Purged the whole queue from the top to be sure, lunch orders and all.',
  captions: { 'purged lunch': 'live order lost' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, froz = shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ri(r, 2, 3));
    m.q = [0, 1, 2, 3, 4, 5].map(i => ({ tag: 'M-' + ri(r, 2000, 8999), p: rf(r, 0.05, 0.5), v: froz.includes(i) ? 0 : rf(r, 0.016, 0.03), dead: froz.includes(i) }));
    m.cur = m.q.findIndex(e => !e.dead); m.gone = 0; const dead = () => m.q.filter(e => e.dead).length;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U') m.cur = Math.max(0, m.cur - 1); else if (a === 'D') m.cur = Math.min(m.q.length - 1, m.cur + 1);
      else if (ENTER(code)) { const e = m.q[m.cur]; if (!e) return true; if (!e.dead) m.fault('purged lunch'); else m.gone++; m.q.splice(m.cur, 1); m.cur = Math.min(m.cur, m.q.length - 1); if (!dead()) m.win(); } else return false;
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const e of m.q) e.p += e.v * dt; };
    m.hint = () => { if (m.t < 2) return []; const ix = m.q.findIndex(e => e.dead); if (ix < 0) return []; return m.cur === ix ? [['Enter', true]] : [[m.cur < ix ? 'ArrowDown' : 'ArrowUp', true]]; };
    m.bad = () => { const e = m.q[m.cur]; if (e && !e.dead) return 'Enter'; const ix = m.q.findIndex(x => !x.dead); return ix < 0 ? null : m.cur < ix ? 'ArrowDown' : 'ArrowUp'; };
    m.view = () => ({ q: m.q.map(e => [e.tag, +e.p.toFixed(2), e.dead]) });
    m.buttons = () => [['ArrowUp', 'Up'], ['ArrowDown', 'Down'], ['Enter', 'Purge']];
    m.draw = (c, W, H, P) => {
      m.q.forEach((e, i) => { const y = 10 + i * 24, on = i === m.cur; if (on) { c.fillStyle = 'rgba(244,194,91,.2)'; c.fillRect(6, y - 4, 388, 22); }
        txt(c, (on ? '> ' : '  ') + e.tag, 12, y + 11, { size: 12, col: on ? COL.gold : COL.ink }); bar(c, 100, y, 230, 12, e.p, { col: COL.peri }); txt(c, Math.round(e.p * 100) + '%', 340, y + 11, { size: 11, col: COL.dim }); });
    };
    return m;
  },
});
