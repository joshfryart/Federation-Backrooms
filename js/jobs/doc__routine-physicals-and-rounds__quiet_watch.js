// Doctor: routine physicals on a quiet watch. Each crewman on the physicals list goes through the columns in order: weight on the scale, blood
// pressure with the cuff, and the new-medication cross-check (Right takes the next column; each reading takes a moment). A pressure of 140 or
// over lands in the red column and must be rechecked after rest: Down sits the crewman down for the rest timer, and only when it runs out does
// Right retake the cuff. Some fall back to normal (nerves), some stay high (refer). Enter signs the physical. Signing with a column empty or a
// red reading never rechecked is the fault; retaking before the rest is over just repeats the nervous reading and is a fault too.
import { define, machine, ARROW, ENTER, ri, pick, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const COLS = ['Weight', 'Pressure', 'Medication'];
export default define({
  job: { billet: 'doc', label: 'Routine physicals and rounds', type: 'task:quiet_watch' },
  title: 'Red-column rest and recheck', dept: 'medical', host: 'console', tool: 'Physicals slate',
  how: 'Right takes the next column (scale, cuff, medicine list). A red pressure (140+) needs a rest: Down starts the rest timer, then Right retakes it once the timer is done. Enter signs the physical.',
  keys: ['→ next reading / recheck', '↓ rest the crewman', 'Enter sign'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'rest and recheck', input: 'arrows+enter', win: 'three physicals signed with every column filled and every red pressure retaken after a full rest',
    fail: 'signing a physical with a red pressure never rechecked or a column empty, or retaking the cuff before the rest timer ends',
    rule: 'Columns fill left to right with →. A red pressure: ↓ to rest, wait for the timer to empty, → to retake. Enter signs only a complete sheet; a pressure still high after rest signs as REFER.' },
  rush: 'Weighed them, took one pressure each and signed the lot.',
  captions: { 'signed high': 'slate chimes', 'column empty': 'slate buzzes', 'no rest': 'cuff hisses' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rest = m.calm ? 2.6 : 2.2, take = 0.5, names = shuffle(r, ['Ens. Kirov', 'Lt. Amadi', 'PO Hale', 'Crewman Ostrow', 'Lt. Cruz', 'Ens. Bell']);
    const types = shuffle(r, ['nerves', 'rising', pick(r, ['ok', 'nerves', 'rising'])]);
    m.q = types.map((k, i) => ({ who: names[i], k, kg: ri(r, 58, 96), sys: k === 'ok' ? ri(r, 108, 132) : ri(r, 142, 165), dia: ri(r, 70, 92), sys2: k === 'rising' ? ri(r, 146, 170) : ri(r, 112, 134), med: pick(r, ['none', 'none', 'antihistamine', 'sleep aid']), col: 0, busy: -1, restT: -1, rechecked: false }));
    m.i = 0; m.rounds = 3; m.round = 1;
    const cur = () => m.q[m.i], red = (p) => p.col >= 2 && p.sys >= 140 && !p.rechecked, resting = (p) => p.restT >= 0 && m.t - p.restT < rest;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const p = cur(), a = ARROW(code); if (!p) return false;
      if (p.busy >= 0) return a || ENTER(code) ? true : false;
      if (ENTER(code)) { if (p.col < 3) m.fault('column empty'); else if (red(p)) m.fault('signed high'); else { m.ev('signed', { who: p.who, refer: p.rechecked && p.sys2 >= 140 }); if (++m.i >= 3) m.win(); else m.round++; } return true; }
      if (a === 'R') { if (p.col < 3) { p.busy = m.t; p.col++; } else if (red(p)) { if (p.restT < 0 || resting(p)) m.fault('no rest'); else { p.busy = m.t; p.rechecked = true; } } return true; }
      if (a === 'D') { if (p.col >= 2 && p.sys >= 140 && p.restT < 0) p.restT = m.t; return true; }
      return !!a;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const p = cur(); if (p && p.busy >= 0 && m.t - p.busy >= take) p.busy = -1; };
    m.hint = () => { const p = cur(); if (!p || p.busy >= 0) return []; if (p.col < 3) return [['ArrowRight', true]];
      if (red(p)) { if (p.restT < 0) return [['ArrowDown', true]]; return resting(p) ? [] : [['ArrowRight', true]]; } return [['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ q: m.q.map(p => [p.k, p.sys, p.sys2, p.kg]) });
    m.buttons = () => [['ArrowRight', 'Next ▶'], ['ArrowDown', '▼ Rest'], ['Enter', 'Sign']];
    m.draw = (c, W, H, P) => {
      const p = cur(); if (!p) return; txt(c, `Physical ${m.i + 1}/3: ${p.who}`, 16, 22, { size: 14, col: COL.gold });
      const vals = [`${p.kg} kg`, `${p.sys}/${p.dia}`, p.med === 'none' ? 'no new meds' : `${p.med} · on list ✓`];
      COLS.forEach((h, k) => { const x = 16 + k * 124, filled = p.col > k, hot = k === 1 && filled && p.sys >= 140; box(c, x, 34, 116, 56, hot ? 'rgba(255,120,80,.16)' : 'rgba(255,255,255,.06)', hot ? P.bad : COL.peri);
        txt(c, h, x + 8, 50, { size: 11, col: COL.dim }); txt(c, filled ? (p.busy >= 0 && p.col === k + 1 ? '…' : vals[k]) : '—', x + 8, 76, { size: k === 2 ? 11 : 16, col: hot ? P.bad : COL.ink }); if (hot) lamp(c, x + 104, 46, 6, P.bad, 'triangle'); });
      if (p.col >= 2 && p.sys >= 140) { txt(c, 'RED COLUMN: recheck after rest', 16, 108, { size: 12, col: P.bad });
        if (p.restT >= 0 && !p.rechecked) { const left = Math.max(0, rest - (m.t - p.restT)); bar(c, 16, 116, 200, 8, left / rest, { col: COL.lav }); txt(c, left > 0 ? `resting ${left.toFixed(1)} s` : 'rest done: retake →', 226, 124, { size: 11, col: left > 0 ? COL.dim : P.good }); }
        if (p.rechecked && p.busy < 0) txt(c, `recheck ${p.sys2}/${p.dia - 4}${p.sys2 >= 140 ? ' still high: REFER' : ' normal'}`, 16, 140, { size: 12, col: p.sys2 >= 140 ? P.bad : P.good }); }
      txt(c, '→ next · ↓ rest · Enter sign', 16, 160, { size: 11, col: COL.pale });
    };
    return m;
  },
});
