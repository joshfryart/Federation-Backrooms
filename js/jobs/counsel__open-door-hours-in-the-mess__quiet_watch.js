// Counsellor: open-door hours in the mess. Chairs in a loose ring (seats 1 – 5). As each crewman comes in and takes a seat, greet them by
// pressing their seat number before they drift off to the edges. Partway through, two of them start to argue and the heat climbs: press Space
// to sit down between them, then offer chess with Enter and make each move only after the last one has settled (about two seconds). Two calm
// moves and the quarrel is over. A quarrel left to boil over ends the hour.
import { define, machine, SPACE, ENTER, DIG, rf, ri, pick, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const CREW = ['Ozawa', 'Brennan', 'Tull', 'Mbeki', 'Castell', 'Iyer', 'Novak', 'Ferro', 'Quist'];
export default define({
  job: { billet: 'counsel', label: 'Open-door hours in the mess', type: 'task:quiet_watch' },
  title: 'Open-door ring and chessboard', dept: 'medical', host: 'console', tool: 'Tea urn, chess set',
  how: 'Greet each arrival by pressing their seat number (1 – 5). When two start arguing, press Space to sit between them, then play chess with Enter, waiting for each move to settle.',
  keys: ['1 – 5 greet a seat', 'Space sit between', 'Enter chess move'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'greet and defuse', input: 'digits+space+enter', win: 'every arrival greeted by name before drifting off and the building quarrel settled over two unhurried chess moves',
    fail: 'an arrival left ungreeted at the edges, hovering when nobody is arguing, rushing the chess, or a quarrel that boils over',
    rule: 'A seat lights when someone sits: press its number within a few seconds. When the heat bar starts, Space puts you between them; then Enter moves, each at least 1.5 s after the last.' },
  rush: 'Left the urn on and read a padd in the corner.',
  captions: { unwelcomed: 'chair drags to the wall', hovering: 'crew glance up', rushed: 'chess piece clatters', quarrel: 'raised voices' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, win = m.calm ? 3.6 : 2.6, gapMv = 1.5;
    const seats = shuffle(r, [1, 2, 3, 4, 5]), names = shuffle(r, CREW);
    m.arr = [0, 1, 2, 3].map(k => ({ seat: seats[k], name: names[k], at: 1 + k * 3.2 + rf(r, 0, 1), hi: false, gone: false }));
    const q = shuffle(r, [0, 1, 2, 3]).slice(0, 2).sort(); m.q = { a: q[0], b: q[1], at: m.arr[q[1]].at + rf(r, 1.5, 3), heat: 0, sat: false, moves: 0, last: 0, done: false };
    m.rounds = 5; m.round = 0;
    const here = (a) => m.t >= a.at && !a.gone;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), Q = m.q;
      if (d >= 1 && d <= 5) { const a = m.arr.find(x => x.seat === d && here(x) && !x.hi); if (a) { a.hi = true; m.round++; } return true; }
      if (SPACE(code)) { if (Q.heat <= 0 || Q.done) m.fault('hovering'); else Q.sat = true; return true; }
      if (ENTER(code)) { if (!Q.sat || Q.done) return true; if (m.t - Q.last < gapMv) { m.fault('rushed'); Q.heat = Math.min(1, Q.heat + 0.15); Q.last = m.t; return true; }
        Q.moves++; Q.last = m.t; Q.heat = Math.max(0, Q.heat - 0.5); if (Q.moves >= 2) { Q.done = true; Q.heat = 0; m.round++; } return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const Q = m.q;
      for (const a of m.arr) if (!a.hi && !a.gone && m.t > a.at + win) { a.gone = true; m.fault('unwelcomed'); }
      if (!Q.done && m.t >= Q.at && !Q.sat) { Q.heat += (m.calm ? 0.09 : 0.12) * dt; if (Q.heat >= 1) { m.fail('quarrel'); return; } }
      if (!Q.done && Q.sat && Q.moves === 0 && Q.last === 0) Q.last = m.t - gapMv + 0.4;
      if (Q.done && m.arr.every(a => a.hi)) m.win();
    };
    m.hint = () => { const a = m.arr.find(x => here(x) && !x.hi && m.t > x.at + 0.3); if (a) return [['Digit' + a.seat, true]]; const Q = m.q;
      if (!Q.done && Q.heat > 0.05 && !Q.sat) return [['Space', true]]; if (Q.sat && !Q.done && m.t - Q.last >= gapMv + 0.1) return [['Enter', true]]; return []; };
    m.bad = () => (m.q.sat ? 'Enter' : m.q.heat <= 0 ? 'Space' : null);
    m.view = () => ({ arr: m.arr.map(a => [a.seat, a.name, +a.at.toFixed(2)]), q: [m.q.a, m.q.b, +m.q.at.toFixed(2)] });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['Space', 'Sit between'], ['Enter', 'Chess move']];
    m.draw = (c, W, H, P) => {
      const cx = 110, cy = 88, Q = m.q; c.strokeStyle = 'rgba(255,255,255,.15)'; c.beginPath(); c.arc(cx, cy, 52, 0, 6.283); c.stroke(); txt(c, 'urn', cx, cy + 4, { size: 10, align: 'center', col: COL.dim });
      for (let s = 1; s <= 5; s++) { const ang = -1.57 + (s - 1) * 1.2566, x = cx + 62 * Math.cos(ang), y = cy + 62 * Math.sin(ang), a = m.arr.find(z => z.seat === s && here(z)), arg = a && !Q.done && m.t >= Q.at && (a === m.arr[Q.a] || a === m.arr[Q.b]);
        lamp(c, x, y, 13, !a ? 'rgba(255,255,255,.1)' : a.hi ? P.good : COL.warn, !a ? 'circle' : a.hi ? 'square' : 'triangle'); txt(c, s, x, y - 16, { size: 10, align: 'center', col: COL.gold });
        if (a) txt(c, (arg ? '! ' : '') + a.name, x, y + 26, { size: 9, align: 'center', col: arg ? P.bad : a.hi ? COL.pale : COL.warn }); }
      txt(c, 'door ▶', 14, 18, { size: 10, col: COL.dim });
      txt(c, 'Quarrel heat', 220, 30, { size: 11, col: COL.dim }); bar(c, 220, 36, 166, 12, Q.heat, { col: Q.heat > 0.6 ? P.bad : COL.warn });
      txt(c, Q.done ? 'Settled over chess ✓' : Q.sat ? `Chess: ${Q.moves} / 2 moves` : Q.heat > 0 ? 'Arguing — sit between them' : 'All calm', 220, 68, { size: 12, col: Q.done ? P.good : COL.pale });
      if (Q.sat && !Q.done) bar(c, 220, 78, 166, 8, Math.min(1, (m.t - Q.last) / gapMv), { col: COL.peri, band: [1 - 0.01, 1] });
      txt(c, `greeted ${m.arr.filter(a => a.hi).length} / ${m.arr.length}`, 220, 112, { size: 12, col: COL.gold });
    };
    return m;
  },
});
