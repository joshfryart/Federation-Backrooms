// Environmental tech: cycle every environmental subsystem under load (shakedown). The checklist gives the start order; the switch board is laid
// out differently. Press each subsystem's switch (1-7) in checklist order and wait for its indicator to turn green before the next. Pumps are on
// the list but their isolation valves are NOT: open a pump's valve first or it runs dry. Then shut everything down in reverse, lamp by lamp.
import { define, machine, DIG, rf, shuffle, txt, box, lamp, COL } from './kit.js';

const SUBS = ['Scrubber bank', 'Fan bank', 'Coolant pump', 'Water pump', 'Zone lights'];
export default define({
  job: { billet: 'env', label: 'Cycle every environmental subsystem under load', type: 'task:shakedown' },
  title: 'Subsystem start-up and reverse shutdown', dept: 'engineering', host: 'console', tool: 'Environmental test board',
  how: 'Switch each subsystem on (1-7) in checklist order, waiting for its lamp to turn green; open a pump\'s isolation valve before the pump. Then switch them off in reverse order, waiting for each lamp to go dark.',
  keys: ['1-7 throw a switch'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'cycle up, down', input: 'digits', win: 'every environmental subsystem brought up in checklist order and shut down in reverse, each lamp settled before the next, no pump run dry',
    fail: 'starting a pump with its isolation valve shut, throwing the next switch before the last lamp settled, or switching out of order',
    rule: 'Board numbers do not follow the checklist: find each name. Amber lamp = spinning up or down, wait. Valves are not listed but each pump needs its valve open first.' },
  rush: 'Threw every switch on the board at once and wrote PASS on the checklist.',
  captions: { 'dry run': 'pump screams', 'stacked load': 'breaker groans', 'out of order': 'checklist buzzer' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const items = [...SUBS.map(n => ({ name: n, spin: rf(r, 0.5, 1.1) })), { name: 'Coolant valve', valve: true, spin: 0 }, { name: 'Water valve', valve: true, spin: 0 }];
    m.board = shuffle(r, items).map(it => ({ ...it, on: false, t: 0 }));
    m.pumpValve = { 'Coolant pump': 'Coolant valve', 'Water pump': 'Water valve' };
    m.order = SUBS.slice(); m.phase = 'up'; m.idx = 0; m.cd = 0; m.rounds = 10; m.round = 0;
    const B = (name) => m.board.find(b => b.name === name);
    m.busy = () => m.board.some(b => !b.valve && b.t > 0 && b.t < b.spin);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (!d || d > 7) return false; m.cd = 0.2; const b = m.board[d - 1];
      if (b.valve) { if (m.phase === 'up') b.on = true; return true; }
      if (m.busy()) { m.fault('stacked load'); return true; }
      const want = m.phase === 'up' ? m.order[m.idx] : m.order[m.order.length - 1 - m.idx];
      if (b.name !== want) { m.fault('out of order'); return true; }
      if (m.phase === 'up' && m.pumpValve[b.name] && !B(m.pumpValve[b.name]).on) { m.fault('dry run'); return true; }
      b.on = m.phase === 'up'; b.t = 0.0001; m.idx++; m.round++;
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.cd -= dt; for (const b of m.board) if (!b.valve && b.t > 0 && b.t < b.spin) b.t = Math.min(b.spin, b.t + dt);
      if (!m.busy() && m.idx >= m.order.length) { if (m.phase === 'up') { m.phase = 'down'; m.idx = 0; m.board.forEach(b => { if (!b.valve) b.t = 0; }); } else m.win(); }
    };
    m.hint = () => {
      if (m.cd > 0 || m.busy() || m.idx >= m.order.length) return [];
      const want = m.phase === 'up' ? m.order[m.idx] : m.order[m.order.length - 1 - m.idx], v = m.pumpValve[want];
      const target = m.phase === 'up' && v && !B(v).on ? v : want; return [[`Digit${m.board.findIndex(b => b.name === target) + 1}`, true]];
    };
    m.bad = () => { if (m.cd > 0) return null; const p = m.board.findIndex(b => b.name === 'Coolant pump'); return `Digit${p + 1}`; };
    m.view = () => ({ b: m.board.map(b => b.name) });
    m.buttons = () => m.board.map((b, i) => [`Digit${i + 1}`, `${i + 1} ${b.name}`]);
    m.draw = (c, W, H, P) => {
      m.board.forEach((b, i) => {
        const x = 12 + (i % 4) * 66, y = 12 + Math.floor(i / 4) * 64, spin = !b.valve && b.t > 0 && b.t < b.spin;
        box(c, x, y, 60, 56, COL.panel, null, 5); txt(c, String(i + 1), x + 6, y + 15, { size: 12, col: COL.gold });
        const st = b.valve ? (b.on ? 'good' : 'off') : spin ? 'spin' : b.on ? 'good' : 'off';
        lamp(c, x + 46, y + 12, 7, st === 'good' ? P.good : st === 'spin' ? COL.warn : COL.dim, st === 'good' ? 'circle' : st === 'spin' ? 'triangle' : 'square');
        b.name.split(' ').forEach((w, k) => txt(c, w, x + 6, y + 32 + k * 12, { size: 10, col: b.valve ? COL.lav : COL.ink }));
      });
      txt(c, m.phase === 'up' ? 'CHECKLIST — START' : 'CHECKLIST — SHUT DOWN (reverse)', 282, 18, { size: 10, col: COL.gold });
      const list = m.phase === 'up' ? m.order : m.order.slice().reverse();
      list.forEach((n, k) => txt(c, `${k < m.idx ? '✓' : k === m.idx ? '▶' : '·'} ${n}`, 282, 38 + k * 16, { size: 11, col: k === m.idx ? COL.ink : COL.dim }));
      txt(c, 'valves: not listed', 282, 128, { size: 10, col: COL.lav });
    };
    return m;
  },
});
