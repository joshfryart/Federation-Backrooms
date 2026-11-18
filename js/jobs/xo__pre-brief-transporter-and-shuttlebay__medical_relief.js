// XO: pre-brief the transporter and shuttlebay chiefs. You have read the transfer plan to each chief; now they read it back to you item by
// item. Cut in the moment an item comes back wrong so it is corrected before they move on, and let correct items run. Only when both chiefs
// have read back the same plan do you initial it. Cutting in on a correct item, or letting a wrong one stand, is a fault.
import { define, machine, SPACE, ENTER, shuffle, ri, pick, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'xo', label: 'Pre-brief transporter and shuttlebay', type: 'task:medical_relief' },
  title: 'Transfer plan readback cut-in', dept: 'command', host: 'console', tool: 'Transporter console and patient transfer plan',
  how: 'Each chief reads the plan back item by item: press Space while a wrong item is being read to correct it, let right ones run, then Enter to initial once both readbacks are done.',
  keys: ['Space cut in: correct', 'Enter initial the plan'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'cut in', input: 'space+enter', win: 'both chiefs\' readbacks corrected item by item as they are spoken and the plan initialled only once both match',
    fail: 'cutting in on a correct item, letting a wrong time, count or pad stand, or initialling before both chiefs have read back',
    rule: 'Items arrive one at a time under the plan. If the item being spoken differs from the plan, Space before the next one arrives. When both readbacks are complete, Enter initials the plan.' },
  rush: 'Briefed the transporter chief and assumed the shuttlebay would hear about it.',
  captions: { 'cut off': 'chief stops mid-word', 'let it stand': 'wrong figure logged', 'initialled early': 'pad refuses' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, per = m.calm ? 1.25 : 1;
    const hh = ri(r, 10, 22), mm = pick(r, ['00', '15', '20', '30', '40', '45']), n = ri(r, 4, 12), pad = ri(r, 1, 6), bay = ri(r, 1, 3);
    m.plan = [['Window', `${hh}:${mm}`], ['Patients', `${n}`], ['Pad', `${pad}`], ['Bay door', `${bay}`]];
    const wrongOf = (k) => k === 0 ? `${hh + (r() < 0.5 ? 1 : -1)}:${mm}` : k === 1 ? `${n + (r() < 0.5 ? 2 : -1)}` : k === 2 ? `${pad % 6 + 1}` : `${bay % 3 + 1}`;
    const slots = shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7]).slice(0, ri(r, 2, 3));
    m.rb = [];
    ['Transporter chief', 'Shuttlebay chief'].forEach((who, c) => m.plan.forEach(([f, v], k) => { const bad = slots.includes(c * 4 + k); m.rb.push({ who, f, v: bad ? wrongOf(k) : v, right: v, bad, at: 1 + (c * 4 + k) * per + c * 0.6, cut: false, stood: false }); }));
    m.end = m.rb[7].at + per; m.rounds = 2; m.round = 0;
    const cur = () => { let x = null; for (const y of m.rb) if (m.t >= y.at) x = y; return x; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false;
      if (SPACE(code)) { const x = cur(); if (!x || x.cut || x.stood || m.t >= m.end) return true; if (!x.bad) { m.fault('cut off'); x.cut = true; return true; } x.cut = true; x.v = x.right; m.ev('corrected', { f: x.f }); return true; }
      if (ENTER(code)) { if (m.t < m.end) { m.fault('initialled early'); return true; } m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.round = m.t >= m.rb[4].at ? (m.t >= m.end ? 2 : 1) : 0;
      for (let i = 0; i < m.rb.length; i++) { const y = m.rb[i], nx = m.rb[i + 1]?.at ?? m.end; if (y.bad && !y.cut && !y.stood && m.t >= nx) { y.stood = true; m.fault('let it stand'); } } };
    m.hint = () => { if (m.t >= m.end) return [['Enter', true]]; const x = cur(); return x && x.bad && !x.cut && m.t - x.at > 0.25 ? [['Space', true]] : []; };
    m.bad = () => { const x = cur(); return x && !x.bad && !x.cut ? 'Space' : null; };
    m.view = () => ({ plan: m.plan, rb: m.rb.map(y => y.v) });
    m.buttons = () => [['Space', 'Cut in'], ['Enter', 'Initial']];
    m.draw = (c, W, H, P) => {
      box(c, 8, 8, W - 16, 26, 'rgba(255,255,255,.05)', COL.peri, 8); txt(c, 'PLAN  ' + m.plan.map(([f, v]) => `${f} ${v}`).join('  ·  '), 16, 25, { size: 11, col: COL.gold });
      [0, 1].forEach(ch => { const y = 44 + ch * 52; txt(c, m.rb[ch * 4].who, 16, y + 12, { size: 11, col: COL.pale });
        m.rb.slice(ch * 4, ch * 4 + 4).forEach((x, k) => { if (m.t < x.at) return; const xx = 16 + k * 94, live = x === cur() && m.t < m.end;
          box(c, xx, y + 18, 88, 26, live ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.05)', live ? COL.orange : null, 6);
          txt(c, `${x.f} ${x.v}`, xx + 6, y + 35, { size: 11, col: x.stood ? P.bad : x.cut ? P.good : COL.ink }); if (x.cut) txt(c, '✎', xx + 80, y + 30, { size: 10, col: P.good, align: 'right' }); }); });
      txt(c, m.t >= m.end ? 'Both read back — Enter to initial the plan' : 'Space the moment a spoken item differs from the plan', 16, H - 8, { size: 10, col: COL.dim });
    };
    return m;
  },
});
