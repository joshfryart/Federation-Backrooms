// Comms officer, survey: relay the sensor data link to the bridge. Send a test packet (Enter) and watch it walk the hop list from the
// datacore. Where it stalls, put the cursor on that hop (← →) and retype its two-digit address from the routing card. Only the stalled hop
// may be touched: retyping a hop the packet has not reached, or one it already crossed, drops live traffic. Done when a packet lands on the
// bridge node, not when the local counter climbs.
import { define, machine, DIG, ARROW, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'comms', label: 'Relay sensor data link to the bridge', type: 'task:survey' },
  title: 'Packet trace and hop rekey', dept: 'operations', host: 'console', tool: 'Sensor relay feed and routing card',
  how: 'Send a test packet with Enter, find the hop where it stalls, move the cursor there and retype that hop\'s address from the routing card, then send again until it reaches the bridge.',
  keys: ['Enter send packet', '← → hop', '1-9 address digits'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'trace and rekey', input: 'digits+arrows+enter', win: 'a test packet traced hop by hop and seen arriving on the bridge node',
    fail: 'retyping a hop other than the one the packet stalled at, or keying a wrong address',
    rule: 'Enter sends a packet along the hops; it stops at a bad address. Cursor to that hop only and type the two digits the routing card gives it, then send again.' },
  rush: 'Saw the local packet counter climbing and logged the link as up.',
  captions: { 'bad address': 'route reject tone', 'dropped traffic': 'live link drops' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 5, hopT = m.calm ? 0.4 : 0.32;
    m.card = Array.from({ length: n }, () => `${ri(r, 1, 9)}${ri(r, 1, 9)}`);
    m.addr = m.card.slice(); const bad = shuffle(r, [0, 1, 2, 3, 4]).slice(0, 2);
    for (const b of bad) { let a; do a = `${ri(r, 1, 9)}${ri(r, 1, 9)}`; while (a === m.card[b]); m.addr[b] = a; }
    m.cur = 0; m.typed = ''; m.pkt = -1; m.pt = 0; m.stall = -1; m.seen = 0; m.rounds = 3; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code);
      if (ENTER(code)) { if (m.pkt < 0) { m.pkt = 0; m.pt = 0; m.stall = -1; m.round++; } return true; }
      if (a === 'L' || a === 'R') { m.cur = (m.cur + (a === 'R' ? 1 : n - 1)) % n; m.typed = ''; return true; }
      if (d) { if (m.pkt >= 0) return true; m.typed += d; if (m.typed.length < 2) return true; const t = m.typed; m.typed = '';
        if (m.cur !== m.stall) { m.fault('dropped traffic'); return true; }
        if (t !== m.card[m.cur]) { m.fault('bad address'); return true; }
        m.addr[m.cur] = t; m.stall = -1; return true; }
      return !!a;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.pkt < 0) return; m.pt += dt; if (m.pt < hopT) return; m.pt = 0;
      if (m.pkt >= n) { m.pkt = -1; m.win(); return; }
      m.seen = Math.max(m.seen, m.pkt + 1);
      if (m.addr[m.pkt] !== m.card[m.pkt]) { m.stall = m.pkt; m.pkt = -1; return; } m.pkt++;
    };
    m.hint = () => { if (m.pkt >= 0) return []; if (m.stall < 0) return [['Enter', true]]; if (m.cur !== m.stall) return [[m.cur < m.stall ? 'ArrowRight' : 'ArrowLeft', true]];
      return [['Digit' + m.card[m.cur][m.typed.length], true]]; };
    m.bad = () => { if (m.pkt >= 0) return null; if (m.stall < 0) return 'Enter'; return m.cur === m.stall ? 'ArrowRight' : 'Digit1'; };
    m.view = () => ({ card: m.card, addr: m.addr.slice() });
    m.buttons = () => [['Enter', 'Send'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => ['Digit' + k, String(k)])];
    m.draw = (c, W, H, P) => {
      txt(c, 'ROUTING CARD', 10, 16, { size: 9, col: COL.dim }); txt(c, m.card.map((a, i) => `H${i + 1}:${a}`).join('  '), 10, 30, { size: 10, col: COL.pale });
      const x0 = 18, dx = 62, y = 80; txt(c, 'DC', x0 - 8, y + 4, { size: 10, col: COL.gold });
      for (let i = 0; i < n; i++) { const x = x0 + 30 + i * dx, st = i === m.stall, sel = i === m.cur;
        box(c, x - 22, y - 16, 44, 32, sel ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.05)', st ? P.bad : sel ? COL.orange : null, 6);
        txt(c, `H${i + 1}`, x, y - 3, { size: 9, col: COL.dim, align: 'center' });
        txt(c, i < m.seen ? (sel && m.typed ? m.typed + '_' : m.addr[i]) : '--', x, y + 11, { size: 11, align: 'center', col: st ? P.bad : COL.ink });
        if (st) txt(c, '✗ STALL', x, y + 30, { size: 9, col: P.bad, align: 'center' }); }
      const bx = x0 + 30 + n * dx - 6; lamp(c, bx, y, 9, m.state === 'win' ? P.good : COL.dim, m.state === 'win' ? 'circle' : 'square'); txt(c, 'BRIDGE', bx, y + 24, { size: 9, align: 'center', col: COL.dim });
      if (m.pkt >= 0) lamp(c, x0 + 30 + m.pkt * dx - 31 + 31 * (m.pt / hopT), y - 24, 4, COL.gold);
      txt(c, m.pkt >= 0 ? 'packet in flight…' : m.stall >= 0 ? `stalled at H${m.stall + 1}: cursor there and retype` : 'Enter: send a test packet', 10, 150, { size: 11, col: COL.pale });
    };
    return m;
  },
});
