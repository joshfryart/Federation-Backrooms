// Guard: watch the cargo seals during loading. Crates ride the loading line past the bay door. While a crate is in the check window, read its
// seal number against the loading list: a number on the list and not yet ticked gets ticked (Space). A number already ticked is a doubled seal,
// and a crate with no seal at all is missing one: chalk it (Enter), and the line stops while you call it in. Ticking a bad seal, chalking a
// good one, or letting a crate leave the window unchecked are faults.
import { define, machine, SPACE, ENTER, ri, rf, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'guard', label: 'Watch cargo seals during loading', type: 'task:cargo_run' },
  title: 'Loading line seal tick and chalk', dept: 'security', host: 'console', tool: 'Loading list and chalk',
  how: 'As each crate passes the window, tick its seal (Space) if the number is on the list and not ticked yet. Chalk it (Enter) if the number was already ticked or there is no seal.',
  keys: ['Space tick the seal', 'Enter chalk the crate'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'tick or chalk', input: 'space+enter',
    win: 'every crate on the loading line checked in the window, fresh listed seals ticked and doubled or missing seals chalked before they go aboard',
    fail: 'a crate with a doubled seal ticked aboard, a good seal chalked, or a crate leaving the window unchecked',
    rule: 'Compare the seal on the crate in the window with the list. Not yet ticked: Space. Already ticked, or no seal: Enter, then wait for the line to restart.' },
  rush: 'Counted crates through the door and trusted the seal numbers.',
  captions: { 'ticked bad': 'crate thuds aboard', 'chalked good': 'chalk scrape', 'went aboard': 'hoist whines on' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, cross = m.calm ? 1.9 : 1.35, W = [0.42, 0.66];
    const list = []; while (list.length < 6) { const n = ri(r, 1000, 9999); if (!list.includes(n)) list.push(n); }
    const order = shuffle(r, list).slice(0, 5); m.crates = order.map(n => ({ seal: n, kind: 'ok' }));
    const dupAt = ri(r, 2, 5), dupOf = ri(r, 0, dupAt - 1); m.crates.splice(dupAt, 0, { seal: m.crates[dupOf].seal, kind: 'double' });
    m.crates.splice(ri(r, 1, m.crates.length), 0, { seal: null, kind: 'missing' });
    m.crates.forEach(c => { c.x = 0; c.done = false; c.gap = rf(r, 0.3, 0.7); });
    m.list = list; m.ticked = new Set(); m.i = 0; m.hold = 0; m.held = {}; m.rounds = m.crates.length; m.round = 0;
    const cur = () => m.crates[m.i], inWin = (c) => c && c.x >= W[0] && c.x <= W[1];
    const done = (c) => { c.done = true; m.i++; m.round = m.i; if (m.i >= m.crates.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !(SPACE(code) || ENTER(code))) return false; if (!down) { m.held[code] = false; return true; } if (m.held[code]) return true; m.held[code] = true;
      const c = cur(); if (!inWin(c) || m.hold > 0) return true;
      const good = c.seal != null && !m.ticked.has(c.seal);
      if (SPACE(code)) { if (!good) m.fault('ticked bad'); else m.ticked.add(c.seal); done(c); }
      else { if (good) m.fault('chalked good'); else m.hold = m.calm ? 1.0 : 0.7; m.ev('chalk'); done(c); }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (m.hold > 0) { m.hold -= dt; return; } const c = cur(); if (!c) return;
      if (c.gap > 0) { c.gap -= dt; return; } c.x += dt * (W[1] - W[0]) / cross;
      if (c.x > W[1]) { m.fault('went aboard'); if (c.seal != null) m.ticked.add(c.seal); done(c); }
    };
    m.hint = () => { const h = Object.keys(m.held).find(k => m.held[k]); if (h) return [[h, false]]; const c = cur();
      if (!inWin(c) || m.hold > 0 || c.x < W[0] + 0.04) return []; return [[c.seal != null && !m.ticked.has(c.seal) ? 'Space' : 'Enter', true]]; };
    m.bad = () => { const h = Object.keys(m.held).find(k => m.held[k]); if (h) return [h, false]; const c = cur(); return inWin(c) ? [c.seal != null && !m.ticked.has(c.seal) ? 'Enter' : 'Space', true] : null; };
    m.view = () => ({ crates: m.crates.map(c => c.seal) });
    m.buttons = () => [['Space', 'Tick'], ['Enter', 'Chalk']];
    m.draw = (c, Wc, H, P) => {
      txt(c, 'LOADING LIST', 16, 18, { size: 11, col: COL.gold });
      m.list.forEach((n, k) => { const t = m.ticked.has(n); txt(c, `${t ? '✓' : '·'} ${n}`, 16, 36 + k * 16, { size: 12, col: t ? P.good : COL.ink }); });
      const x0 = 110, x1 = 390, lx = (x) => x0 + x * (x1 - x0); c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(x0, 92, x1 - x0, 6);
      box(c, lx(W[0]), 40, lx(W[1]) - lx(W[0]), 70, 'rgba(125,151,232,.10)', COL.peri, 3); txt(c, 'CHECK', (lx(W[0]) + lx(W[1])) / 2, 36, { size: 10, align: 'center', col: COL.peri });
      const k = cur(); if (k && k.gap <= 0) { const x = lx(k.x); box(c, x - 24, 58, 48, 34, COL.panel, COL.pale, 3);
        txt(c, k.seal == null ? 'NO SEAL' : String(k.seal), x, 80, { size: k.seal == null ? 9 : 13, align: 'center', col: k.seal == null ? COL.warn : COL.ink }); }
      txt(c, 'BAY DOOR ▸', 390, 130, { size: 10, align: 'right', col: COL.dim });
      if (m.hold > 0) txt(c, 'line stopped: calling it in', 250, 150, { size: 11, align: 'center', col: COL.warn });
      txt(c, `crates ${m.i} / ${m.crates.length}`, 16, 150, { size: 11, col: COL.pale });
    };
    return m;
  },
});
