// Yeoman: route science requests to the captain. Requests slide down the tray chute one at a time. Steer each into the captain's review lane
// (left) or the next-day lane (right) before it lands. Go by the science officer's priority tick, not the requester's own wording: plenty of
// titles shout URGENT that the CSO has ticked routine. A request that lands in the middle sits unrouted.
import { define, machine, ARROW, shuffle, txt, box, lamp, COL } from './kit.js';

const REQ = ['Extend sensor time on ridge', 'Probe relaunch window', 'Shuttle for ice core', 'Lab power for spectrometer', 'Hold orbit two more passes', 'Raise shields for flare data',
  'Crew for sample sort', 'Bandwidth for data dump', 'Reroute to dust lane', 'Recalibrate array tonight'];

export default define({
  job: { billet: 'yeoman', label: 'Route science requests to captain', type: 'task:survey' },
  title: 'Chute sort by the CSO priority tick', dept: 'command', host: 'console', tool: 'Science request chute',
  how: 'Steer each falling request (← →) into the captain\'s review lane if the science officer ticked it urgent (▲), or the next-day lane if ticked routine (○). ↓ drops it faster.',
  keys: ['← → steer', '↓ drop'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'drop-sort', input: 'arrows', win: 'six falling science requests landed in the lane their CSO tick calls for',
    fail: 'trusting the requester\'s wording over the tick, or letting a request land unrouted in the middle',
    rule: 'A request falls down the middle column. Its CSO tick (▲ urgent, ○ routine) decides the lane, whatever its title says. Steer left for urgent, right for next-day before it lands; ↓ speeds the fall.' },
  rush: 'Put every request on the captain\'s pile.',
  captions: { misfiled: 'paper slaps the wrong tray', unrouted: 'request alert pings' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, fall = m.calm ? 5.4 : 3.8;
    const titles = shuffle(r, REQ).slice(0, 6), urg = shuffle(r, [1, 1, 1, 0, 0, 0]);
    m.reqs = titles.map((t, i) => { const shout = r() < 0.45; return { t: shout ? 'URGENT: ' + t : t, urg: !!urg[i], shout }; });
    if (!m.reqs.some(q => q.shout && !q.urg)) { const q = m.reqs.find(x => !x.urg); q.t = 'URGENT: ' + q.t.replace(/^URGENT: /, ''); q.shout = true; }
    m.k = 0; m.y = 0; m.col = 1; m.fast = false; m.lanes = [[], []]; m.rounds = 6; m.round = 1;
    const land = () => { const q = m.reqs[m.k];
      if (m.col === 1) m.fault('unrouted'); else { if ((m.col === 0) !== q.urg) m.fault('misfiled'); m.lanes[m.col ? 1 : 0].push(q); }
      m.k++; m.y = 0; m.col = 1; m.fast = false; if (m.k >= m.reqs.length) { if (m.state === 'play') m.win(); } else m.round = m.k + 1; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!a) return false; if (a === 'D') { m.fast = down; return true; } if (!down) return true;
      if (a === 'L') m.col = Math.max(0, m.col - 1); if (a === 'R') m.col = Math.min(2, m.col + 1); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.y += dt / fall * (m.fast ? 4 : 1); if (m.y >= 1) land(); };
    m.hint = () => { const q = m.reqs[m.k]; if (!q) return []; const want = q.urg ? 0 : 2; if (m.col !== want) return [['ArrowDown', false], [m.col > want ? 'ArrowLeft' : 'ArrowRight', true]]; return [['ArrowDown', true]]; };
    m.bad = () => { const q = m.reqs[m.k]; if (!q) return null; const want = q.urg ? 2 : 0; return m.col !== want ? (m.col > want ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown'; };
    m.view = () => ({ reqs: m.reqs.map(q => [q.t, q.urg]) });
    m.buttons = () => [['ArrowLeft', '◀ Captain'], ['ArrowDown', 'Drop ▼'], ['ArrowRight', 'Next day ▶']];
    m.draw = (c, W, H, P) => {
      const cw = 128, x0 = 8; ['CAPTAIN · REVIEW', 'UNROUTED', 'NEXT DAY'].forEach((s, i) => { box(c, x0 + i * (cw + 4), 8, cw, 154, i === 1 ? 'rgba(255,179,71,.06)' : 'rgba(255,255,255,.04)', i === m.col ? COL.gold : null, 6);
        txt(c, s, x0 + i * (cw + 4) + cw / 2, 154, { size: 9, align: 'center', col: COL.dim }); });
      m.lanes.forEach((l, j) => l.forEach((q, n) => { const x = x0 + (j ? 2 : 0) * (cw + 4) + 6; box(c, x, 132 - n * 14, cw - 12, 12, 'rgba(255,255,255,.1)', null, 3); txt(c, q.t.slice(0, 22), x + 4, 141 - n * 14, { size: 8, col: COL.dim }); }));
      const q = m.reqs[m.k]; if (!q) return; const x = x0 + m.col * (cw + 4) + 4, y = 14 + m.y * 92;
      box(c, x, y, cw - 8, 34, COL.panel, COL.lav, 5); lamp(c, x + 12, y + 17, 8, q.urg ? P.bad : COL.peri, q.urg ? 'triangle' : 'circle');
      txt(c, q.urg ? 'CSO ▲ urgent' : 'CSO ○ routine', x + 24, y + 13, { size: 8, col: COL.pale }); txt(c, q.t.length > 21 ? q.t.slice(0, 20) + '…' : q.t, x + 24, y + 27, { size: 9 });
    };
    return m;
  },
});
