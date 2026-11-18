// Ops: work the ops board. Requests come up one at a time with a department, a power ask and a task. Route each to the officer who must act
// on it (← → pick the officer, Enter assign). If the ask would push the bus over its limit, ring engineering first (hold Space on the handset
// until they agree a rebalance). Assigning a clashing ask alone overloads the bus; ringing engineering over an ask that fits wastes their time.
import { define, machine, ARROW, ENTER, SPACE, ri, pick, shuffle, txt, box, bar, COL } from './kit.js';

const OFF = ['Comms officer', 'Transporter chief', 'Duty engineer'];
const TASKS = [['open a subspace channel', 0], ['relay the survey traffic', 0], ['beam a work party down', 1], ['transport cargo pallets', 1], ['raise shield output', 2], ['power the lab array', 2]];
const DEPTS = ['Sciences', 'Medical', 'Security', 'Flight', 'Stores', 'Engineering'];

export default define({
  job: { billet: 'ops', label: 'Work the ops board', type: 'loop' },
  title: 'Ops board rebalance and routing', dept: 'operations', host: 'console', tool: 'Ops console requests board',
  how: 'For each request pick the officer who acts on it (← →) and assign it (Enter). If its power ask would overrun the bus, hold Space to ring engineering until they agree a rebalance first.',
  keys: ['← → officer', 'Enter assign', 'Space hold: ring engineering'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'ring before commit', input: 'arrows+space-hold+enter', win: 'four requests routed to their acting officer with every bus clash agreed with engineering beforehand',
    fail: 'committing an ask that overruns the bus without engineering, routing a task to the wrong officer, or ringing engineering over an ask that fits',
    rule: 'Compare the ask with the free bus shown in the side panel. If it fits, pick the officer and press Enter. If it does not, hold Space until engineering says AGREED, then assign.' },
  rush: 'Approved every ask in the order it came and let the bus breakers argue it out.',
  captions: { 'bus overload': 'bus overload klaxon', 'wrong officer': 'officer queries the task', 'needless rebalance': 'engineering sighs on the handset' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, C = 100, ring = m.calm ? 0.8 : 1.1;
    m.load = ri(r, 48, 62); let load = m.load; const pat = shuffle(r, [1, 0, 1, 0]);
    m.reqs = pat.map(cl => {
      const [task, off] = pick(r, TASKS), head = C - load, clash = cl || head < 9; let ask, shed = 0;
      if (clash) { ask = head + ri(r, 3, 10); shed = ask - head + ri(r, 12, 20); load = load - shed + ask; } else { ask = ri(r, 3, head - 4); load += ask; }
      return { dept: pick(r, DEPTS), task, off, ask, clash, shed, agreed: false };
    });
    m.k = 0; m.sel = 0; m.ring = 0; m.last = -9; m.rounds = 4; m.round = 0; m.msg = '';
    const R = () => m.reqs[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (SPACE(code)) { m.held.S = down; if (!down) m.ring = 0; return true; }
      if (!down) return a === 'L' || a === 'R' || ENTER(code);
      if (a === 'L' || a === 'R') { m.sel = (m.sel + (a === 'R' ? 1 : 2)) % 3; m.last = m.t; return true; }
      if (ENTER(code)) {
        m.last = m.t; const q = R();
        if (q.clash && !q.agreed) { m.fault('bus overload'); m.msg = 'BUS OVERLOAD — ring engineering first'; return true; }
        if (m.sel !== q.off) { m.fault('wrong officer'); m.msg = `${OFF[m.sel]} cannot ${q.task}`; return true; }
        m.load += q.ask; m.msg = `Assigned to ${OFF[m.sel]}`; m.k++; m.round++; if (m.k >= m.reqs.length) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const q = R(); if (!q || !m.held.S) return; m.ring += dt;
      if (m.ring >= ring) {
        if (q.clash && !q.agreed) { q.agreed = true; m.load -= q.shed; m.msg = `ENGINEERING AGREED — shed ${q.shed} from the holodecks`; }
        else if (!q.clash) { m.fault('needless rebalance'); m.msg = 'Engineering: that one fits, why ring?'; }
        m.ring = -99;
      }
    };
    m.hint = () => {
      const q = R(); if (!q) return []; if (q.clash && !q.agreed) return [['Space', true]]; if (m.held.S) return [['Space', false]];
      if (m.t - m.last < 0.15) return []; if (m.sel !== q.off) return [[(q.off - m.sel + 3) % 3 === 1 ? 'ArrowRight' : 'ArrowLeft', true]]; return [['Enter', true]];
    };
    m.bad = () => (m.t - m.last < 0.2 ? null : 'Enter');
    m.view = () => ({ load: m.load, reqs: m.reqs.map(q => [q.dept, q.off, q.ask, q.clash]) });
    m.buttons = () => [['ArrowLeft', '◀ officer'], ['ArrowRight', 'officer ▶'], ['Space', 'Ring eng. (hold)'], ['Enter', 'Assign']];
    m.draw = (c, W, H, P) => {
      const q = R(); if (!q) return; const free = C - m.load;
      box(c, 10, 8, 250, 62, 'rgba(255,255,255,.05)', COL.orange, 10);
      txt(c, `REQUEST ${m.k + 1}/4 · ${q.dept.toUpperCase()}`, 20, 26, { size: 12, col: COL.gold });
      txt(c, `Asks to ${q.task}`, 20, 44, { size: 11 }); txt(c, `power ask ${q.ask} MW`, 20, 61, { size: 12, col: q.ask > free ? COL.warn : COL.pale });
      txt(c, 'BUS LOAD', 272, 22, { size: 10, col: COL.dim }); txt(c, `${m.load} / ${C}`, 272, 42, { size: 16 }); txt(c, `free ${free} MW`, 272, 60, { size: 12, col: q.ask > free ? P.bad : P.good });
      bar(c, 14, 78, W - 28, 10, m.load / C, { mark: (m.load + q.ask) / C, col: COL.peri });
      OFF.forEach((o, i) => { const x = 12 + i * 128; box(c, x, 98, 120, 26, i === m.sel ? 'rgba(240,147,58,.25)' : 'rgba(255,255,255,.04)', i === m.sel ? COL.orange : null, 8); txt(c, (i === m.sel ? '▶ ' : '') + o, x + 60, 115, { size: 11, align: 'center' }); });
      txt(c, m.held.S && m.ring > 0 ? `ringing engineering… ${Math.min(100, Math.round(m.ring / ring * 100))} %` : q.agreed ? 'rebalance agreed' : '', 14, 142, { size: 11, col: COL.warn });
      txt(c, m.msg, 14, H - 12, { size: 11, col: COL.pale });
    };
    return m;
  },
});
