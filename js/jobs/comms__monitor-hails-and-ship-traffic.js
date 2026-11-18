// Comms officer: monitor hails and ship traffic. Hails land on four incoming lines with a caller timer. Open one (its digit) to hear who it
// is and whether it is priority, then route it: ↑ to the bridge handset (priority) or ↓ to the announcement queue (routine). Opening a second
// line while one is live cuts that caller off; a hail whose timer runs out is dropped.
import { define, machine, DIG, ARROW, rf, pick, txt, box, bar, lamp, COL } from './kit.js';

const SHIPS = ['USS Kestrel', 'Freighter Halvard', 'Tug Oriel-9', 'Starbase 41 Ops', 'Courier Tanis', 'USS Marrow', 'Ore barge Kell', 'Medevac Sorrel'];

export default define({
  job: { billet: 'comms', label: 'Monitor hails and ship traffic', type: 'loop' },
  title: 'Incoming hail triage', dept: 'operations', host: 'console', tool: 'Incoming channel list and headset',
  how: 'Open a flashing hail with its line number, hear whether it is priority, then send it up to the bridge handset or down to the queue before its timer runs out.',
  keys: ['1-4 open line', '↑ bridge handset', '↓ queue'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'open and route', input: 'digits+arrows', win: 'six overlapping hails each opened and routed by priority before the caller gives up',
    fail: 'letting a hail time out, sending it the wrong way, or opening another line over a live caller',
    rule: 'Hails flash on lines 1-4 with a shrinking timer. Press the line digit to open it and read PRIORITY or routine, then ↑ handset or ↓ queue; only one line open at a time.' },
  rush: 'Dumped every hail into the queue and let the bridge sort it out.',
  captions: { dropped: 'caller tone cuts out', misrouted: 'bridge handset buzzes', 'cut off': 'caller clicks off mid-word' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, wait = m.calm ? 9 : 6.5;
    m.sched = []; let t = 0.6; for (let i = 0; i < 6; i++) { m.sched.push({ at: t, ship: pick(r, SHIPS), pri: i === 1 || r() < 0.4, ch: 10 + Math.floor(r() * 80), brg: Math.floor(r() * 360) }); t += rf(r, 0.8, 2.0); }
    if (m.sched.every(h => h.pri)) m.sched[0].pri = false;
    m.lines = [null, null, null, null]; m.open = -1; m.done = 0; m.rounds = 6; m.round = 0; m.nx = 0;
    const settle = (h, i) => { m.lines[i] = null; m.open = -1; m.done++; m.round = m.done; if (m.done >= 6 && m.state === 'play') m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code);
      if (d >= 1 && d <= 4) { const h = m.lines[d - 1]; if (!h || m.open === d - 1) return true; if (m.open >= 0) { m.fault('cut off'); settle(m.lines[m.open], m.open); } m.open = d - 1; h.opened = true; return true; }
      if ((a === 'U' || a === 'D') && m.open >= 0) { const h = m.lines[m.open]; if ((a === 'U') !== h.pri) m.fault('misrouted'); settle(h, m.open); return true; }
      return a === 'U' || a === 'D';
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      while (m.nx < 6 && m.sched[m.nx].at <= m.t) { const i = m.lines.indexOf(null); if (i < 0) break; m.lines[i] = { ...m.sched[m.nx], left: wait, opened: false }; m.nx++; }
      m.lines.forEach((h, i) => { if (!h || i === m.open) return; h.left -= dt; if (h.left <= 0) { m.fault('dropped'); settle(h, i); } });
    };
    m.hint = () => {
      if (m.open >= 0) return [[m.lines[m.open].pri ? 'ArrowUp' : 'ArrowDown', true]];
      let b = -1; m.lines.forEach((h, i) => { if (h && (b < 0 || h.left < m.lines[b].left)) b = i; });
      return b < 0 ? [] : [['Digit' + (b + 1), true]];
    };
    m.bad = () => m.open >= 0 ? (m.lines[m.open].pri ? 'ArrowDown' : 'ArrowUp') : null;
    m.view = () => ({ s: m.sched.map(h => [h.ship, h.pri, +h.at.toFixed(2)]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['ArrowUp', '▲ Handset'], ['ArrowDown', '▼ Queue']];
    m.draw = (c, W, H, P) => {
      m.lines.forEach((h, i) => {
        const y = 8 + i * 30, op = i === m.open; box(c, 6, y, 250, 26, op ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.05)', op ? COL.orange : null, 8);
        txt(c, `${i + 1}`, 16, y + 18, { size: 13, col: COL.gold });
        if (!h) { txt(c, '— idle —', 34, y + 17, { size: 10, col: COL.dim }); return; }
        const flash = !op && Math.floor(m.t * 4) % 2 === 0; lamp(c, 38, y + 13, 6, flash ? COL.warn : COL.peri, 'triangle');
        txt(c, op ? `${h.ship} · ch ${h.ch} · brg ${h.brg}` : `hail · brg ${h.brg}`, 50, y + 12, { size: 10 });
        if (op) txt(c, h.pri ? '▲ PRIORITY' : '▼ routine', 50, y + 23, { size: 10, col: h.pri ? COL.warn : P.good });
        else bar(c, 50, y + 17, 120, 5, h.left / wait, { col: h.left < 2 ? P.bad : COL.peri });
      });
      box(c, 270, 10, 120, 50, 'rgba(255,255,255,.05)', COL.peri, 8); txt(c, '▲ BRIDGE HANDSET', 330, 40, { size: 10, align: 'center', col: COL.pale });
      box(c, 270, 70, 120, 50, 'rgba(255,255,255,.05)', COL.lav, 8); txt(c, '▼ QUEUE', 330, 100, { size: 10, align: 'center', col: COL.pale });
      txt(c, `routed ${m.done} / 6`, 330, 145, { size: 11, align: 'center', col: COL.dim });
    };
    return m;
  },
});
