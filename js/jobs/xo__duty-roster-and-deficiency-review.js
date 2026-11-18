// XO: duty roster and deficiency review. Work through the chiefs' deficiencies: write a priority by its real risk (1 the ship cannot run,
// 2 degraded, 3 can wait). Every priority-one repair then needs an officer: pick one who holds the repair's rating and still has the free
// hours for it. A wrong priority, or an unrated or overloaded officer, is refused as a fault.
import { define, machine, DIG, ARROW, ENTER, shuffle, pick, ri, txt, box, COL } from './kit.js';

const D1 = [['Warp coil 3 offline: no warp until fixed', 'warp'], ['Main bus breaker tripping: no eps to the bridge', 'eps'], ['Life support scrubber B dead: air fails in a day', 'env'], ['Helm thruster quad 2 seized: cannot manoeuvre', 'flight']];
const D2 = [['Sensor pallet 4 running at half gain', 'sci'], ['One replicator in the mess serving cold', 'svc'], ['Deck 6 lift slow between floors', 'eng'], ['Backup comm relay noisy', 'ops']];
const D3 = [['Scuffed paint in the observation lounge', 'svc'], ['Ready room chair squeaks', 'svc'], ['Lamp flickering in a crew quarters corridor', 'eng'], ['Spare uniform locker label missing', 'ops']];
const NAMES = ['Lt Okafor', 'Ens Brandt', 'Lt Varga', 'CPO Ruiz', 'Ens Thale', 'Lt Imre'];
const RAT = ['warp', 'eps', 'env', 'flight'];

export default define({
  job: { billet: 'xo', label: 'Duty roster and deficiency review', type: 'loop' },
  title: 'Deficiency priority and repair crew', dept: 'command', host: 'console', tool: 'Ready room desk and roster screen',
  how: 'Write a priority beside each deficiency by its real risk, then give every priority-one repair to an officer with the right rating and enough free hours.',
  keys: ['1 – 3 priority', '↑ ↓ pick officer', 'Enter assign'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'rank and staff', input: 'digits+arrows+enter', win: 'each deficiency ranked by its real risk and each priority-one repair given a rated officer with free hours',
    fail: 'ranking a cosmetic item one or a dead system three, or giving a repair to an unrated or overloaded officer',
    rule: 'Read the deficiency: 1 if the ship cannot run, 2 if degraded, 3 if it can wait. On a 1, ↑ ↓ through the officers and Enter assigns: rating must match and free hours must cover the job.' },
  rush: 'Gave every deficiency a 2 and put the first name on the roster on each repair.',
  captions: { misranked: 'pen scratches out', refused: 'roster refusal tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n1 = ri(r, 1, 2), pri = shuffle(r, [...Array(n1).fill(1), 2, 3, ...(n1 === 1 ? [r() < 0.5 ? 2 : 3] : [])]);
    const p1 = shuffle(r, D1), p2 = shuffle(r, D2), p3 = shuffle(r, D3); let k1 = 0, k2 = 0, k3 = 0;
    m.defs = pri.map(p => { const [t, rat] = p === 1 ? p1[k1++] : p === 2 ? p2[k2++] : p3[k3++]; return { t, rat, p, hrs: p === 1 ? ri(r, 3, 6) : 0, set: 0, who: null }; });
    m.offs = shuffle(r, NAMES).slice(0, 5).map(name => ({ name, rat: pick(r, RAT), free: ri(r, 1, 8) }));
    for (const d of m.defs.filter(d => d.p === 1)) { const o = pick(r, m.offs.filter(o => !m.defs.some(e => e.fixer === o))); o.rat = d.rat; o.free = d.hrs + ri(r, 0, 3); d.fixer = o; }
    m.i = 0; m.sel = 0; m.rounds = 4; m.round = 0;
    const cur = () => m.defs[m.i], next = () => { m.i++; m.round++; m.sel = 0; if (m.i >= m.defs.length) m.win(); };
    const fits = (o, d) => o.rat === d.rat && o.free >= d.hrs;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = cur(), n = DIG(code), a = ARROW(code);
      if (!d.set) { if (n < 1 || n > 3) return false; if (n !== d.p) { m.fault('misranked'); return true; } d.set = n; if (n !== 1) next(); return true; }
      if (a === 'U' || a === 'D') { m.sel = (m.sel + (a === 'D' ? 1 : m.offs.length - 1)) % m.offs.length; return true; }
      if (ENTER(code)) { const o = m.offs[m.sel]; if (!fits(o, d)) { m.fault('refused'); return true; } o.free -= d.hrs; d.who = o.name; next(); return true; }
      return !!n;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const d = cur(); if (!d) return []; if (!d.set) return [['Digit' + d.p, true]]; return fits(m.offs[m.sel], d) ? [['Enter', true]] : [['ArrowDown', true]]; };
    m.bad = () => { const d = cur(); if (!d) return null; if (!d.set) return 'Digit' + (d.p === 3 ? 1 : 3); const k = m.offs.findIndex(o => !fits(o, d)); if (k >= 0) m.sel = k; return 'Enter'; };
    m.view = () => ({ defs: m.defs.map(d => [d.t, d.p, d.hrs]), offs: m.offs.map(o => [o.name, o.rat, o.free]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Enter', 'Assign']];
    m.draw = (c, W, H, P) => {
      const d = cur(); if (!d) return;
      box(c, 8, 8, W - 16, 40, 'rgba(255,255,255,.05)', COL.peri, 8);
      txt(c, `Deficiency ${m.i + 1}/${m.defs.length}${d.set ? `   priority ${d.set}` : '   priority ?'}`, 16, 23, { size: 10, col: COL.gold });
      txt(c, d.t, 16, 40, { size: 11 });
      if (!d.set) { txt(c, '1 cannot run    2 degraded    3 can wait', 16, 70, { size: 12, col: COL.pale }); return; }
      txt(c, `Repair needs rating ${d.rat.toUpperCase()} and ${d.hrs} h`, 16, 64, { size: 11, col: COL.pale });
      m.offs.forEach((o, k) => { const y = 72 + k * 19, s = k === m.sel; box(c, 8, y, W - 16, 17, s ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.04)', s ? COL.orange : null, 6);
        txt(c, o.name, 16, y + 13, { size: 11 }); txt(c, `rating ${o.rat.toUpperCase()}`, 150, y + 13, { size: 11, col: o.rat === d.rat ? P.good : COL.dim }); txt(c, `${o.free} h free`, 280, y + 13, { size: 11, col: o.free >= d.hrs ? P.good : COL.dim }); });
    };
    return m;
  },
});
