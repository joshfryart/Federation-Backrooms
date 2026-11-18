// Captain: authorise medical stores and surge staff. Fill the surge rota on the sickbay staff board: move the cursor (arrows) and pin a medic
// to a shift (Space; again to unpin) until every shift has the number of medics it needs. Medics on rest are refused, and nobody may work two
// shifts back to back. Then sign the stores requisition (Enter). A rest pin, a back-to-back pin, or signing with a shift short is a fault.
import { define, machine, ARROW, SPACE, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const MED = ['Nurse Ogawa', 'Dr. Selar', 'Medic Pell', 'Nurse Adair', 'Medic Kovac', 'Dr. Hanley', 'Nurse Tsoi'];
const SHIFT = ['0000-0800', '0800-1600', '1600-2400'];
const STORE = [['Tri-ox doses', 40], ['Dressings', 120], ['Plasma units', 16], ['Analgesic', 60]];

export default define({
  job: { billet: 'co', label: 'Authorise medical stores and surge staff', type: 'task:medical_relief' },
  title: 'Surge rota pinning', dept: 'command', host: 'console', tool: 'Sickbay staff board and requisition clipboard',
  how: 'Pin free medics to the surge shifts until each shift has its number, never using someone on rest or giving anyone back-to-back shifts, then sign the requisition.',
  keys: ['arrows move', 'Space pin / unpin', 'Enter sign requisition'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'fill the rota', input: 'arrows+space+enter', win: 'every surge shift staffed to its number with free medics, nobody on two adjacent shifts, requisition signed',
    fail: 'pinning a medic who is on rest, giving one medic back-to-back shifts, or signing with a shift still short',
    rule: 'Rows are medics, columns are shifts. Space pins the medic under the cursor to that shift. REST rows refuse; a pin next to the same medic’s other shift is refused. Enter signs once every column shows its need met.' },
  rush: 'Signed for double stores and put the whole sickbay on every shift.',
  captions: { 'on rest': 'staff board refuses pin', 'back to back': 'duty-hours alarm', 'shift short': 'requisition bounces' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = shuffle(r, MED).slice(0, 5), rest = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 1, 2)));
    m.meds = names.map((n, i) => ({ n, rest: rest.has(i), on: [false, false, false] }));
    m.sol = []; m.need = [0, 0, 0];
    m.meds.forEach((d, i) => { if (d.rest) return; const opt = shuffle(r, [[0], [1], [2], [0, 2], [0, 2], [1]])[0]; for (const s of opt) { m.sol.push([i, s]); m.need[s]++; } });
    for (let s = 0; s < 3; s++) if (!m.need[s]) { const i = m.meds.findIndex((d, k) => !d.rest && !m.sol.some(([a, b]) => a === k && Math.abs(b - s) === 1)); if (i >= 0) { m.sol.push([i, s]); m.need[s]++; } }
    m.stores = STORE.map(([n, lvl]) => ({ n, lvl, have: ri(r, Math.floor(lvl * 0.3), lvl - 2) }));
    m.cx = 0; m.cy = 0; m.rounds = m.sol.length; m.round = 0;
    const count = (s) => m.meds.filter(d => d.on[s]).length;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a) { if (a === 'U' || a === 'D') m.cy = (m.cy + (a === 'D' ? 1 : 4)) % 5; else m.cx = (m.cx + (a === 'R' ? 1 : 2)) % 3; return true; }
      if (SPACE(code)) {
        const d = m.meds[m.cy], s = m.cx; if (d.on[s]) { d.on[s] = false; m.round--; return true; }
        if (d.rest) { m.fault('on rest'); return true; } if (d.on[s - 1] || d.on[s + 1]) { m.fault('back to back'); return true; }
        if (count(s) >= m.need[s]) return true; d.on[s] = true; m.round++; return true;
      }
      if (ENTER(code)) { if ([0, 1, 2].some(s => count(s) < m.need[s])) { m.fault('shift short'); return true; } m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      const g = m.sol.find(([i, s]) => !m.meds[i].on[s]); if (!g) return [['Enter', true]]; const [i, s] = g;
      if (m.cy !== i) return [[m.cy < i ? 'ArrowDown' : 'ArrowUp', true]]; if (m.cx !== s) return [[m.cx < s ? 'ArrowRight' : 'ArrowLeft', true]]; return [['Space', true]];
    };
    m.bad = () => { const i = m.meds.findIndex(d => d.rest); if (m.cy !== i) return m.cy < i ? 'ArrowDown' : 'ArrowUp'; return 'Space'; };
    m.view = () => ({ meds: m.meds.map(d => [d.n, d.rest]), need: m.need });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Pin'], ['Enter', 'Sign']];
    m.draw = (c, W, H, P) => {
      SHIFT.forEach((s, j) => { const n = count(j), ok = n >= m.need[j]; txt(c, s, 120 + j * 52 + 24, 12, { size: 8, col: COL.dim, align: 'center' }); txt(c, `${ok ? '✓' : '○'} ${n}/${m.need[j]}`, 120 + j * 52 + 24, 24, { size: 9, col: ok ? P.good : COL.warn, align: 'center' }); });
      m.meds.forEach((d, i) => {
        const y = 30 + i * 22; txt(c, d.n, 8, y + 14, { size: 10, col: d.rest ? COL.dim : COL.ink }); if (d.rest) txt(c, 'REST', 92, y + 14, { size: 8, col: COL.warn });
        for (let j = 0; j < 3; j++) { const on = i === m.cy && j === m.cx; box(c, 122 + j * 52, y + 2, 48, 18, d.on[j] ? 'rgba(125,151,232,.45)' : d.rest ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.07)', on ? COL.orange : null, 4); if (d.on[j]) txt(c, '■ pinned', 146 + j * 52, y + 15, { size: 8, align: 'center' }); }
      });
      txt(c, 'STORES (below reorder)', 290, 14, { size: 9, col: COL.gold });
      m.stores.forEach((s, k) => txt(c, `${s.n}: ${s.have}/${s.lvl} → +${s.lvl - s.have}`, 290, 32 + k * 14, { size: 8 }));
      txt(c, 'Enter: sign requisition', 290, 150, { size: 9, col: COL.dim });
    };
    return m;
  },
});
