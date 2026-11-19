// Chief of security: armory charger load test. Pick a charger slot (1-4) and press ↓ to seat a test cell home with a click. All seated slots
// charge at once against the timing line. A cell whose heat passes the warning line must be pulled (↑) before it cooks. A slot whose meter
// lags behind the timing line is a slow charger: tag it (Enter) once it has had time to show it. A cell that reaches full is cleared (Enter).
import { define, machine, DIG, ARROW, ENTER, rf, shuffle, txt, box, bar, COL } from './kit.js';

const N = 4, FULL = 3.0, JUDGE = 2.2, WARN = 0.7;
export default define({
  job: { billet: 'cos', label: 'Armory charger load test', type: 'task:shakedown' },
  title: 'Four-slot charger load watch', dept: 'security', host: 'console', tool: 'Armory charger rack and test cells',
  how: 'Pick a slot (1-4) and press ↓ to seat a cell. Watch every slot at once: ↑ pulls a cell past the heat line, Enter tags a slot that lags the timing line, and Enter clears a cell at full.',
  keys: ['1-4 pick a slot', '↓ seat · ↑ pull', 'Enter tag slow / clear full'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'seat and watch', input: 'digits+arrows+enter', win: 'four test cells seated and every slot settled in parallel: hot cells pulled at the heat line, slow chargers tagged, good cells cleared at full',
    fail: 'letting a cell cook past the heat line, clearing a slow charger or a cell short of full, or pulling a cool cell',
    rule: 'The white tick on each meter is the timing line: where a healthy charger should be. Once a slot has run past the judge mark and sits well behind the tick, it is slow. Heat over the dashed line: pull it.' },
  rush: 'Seated all the cells and signed the sheet without watching the meters.',
  captions: { cooked: 'cell hisses', 'pulled cool': 'clunk', 'early clear': 'test sheet beep', 'slow passed': 'test sheet beep', 'no cell': 'slot rattles' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, HEATT = m.calm ? 1.6 : 1.1;
    const kinds = shuffle(r, ['good', 'slow', 'hot', r() < 0.5 ? 'good' : r() < 0.5 ? 'slow' : 'hot']);
    m.slots = kinds.map(k => ({ k, seat: false, t: 0, lv: 0, heat: 0, rate: k === 'slow' ? rf(r, 0.1, 0.15) : 1 / FULL, hr: k === 'hot' ? rf(r, 0.32, 0.42) : rf(r, 0.03, 0.08), res: null }));
    m.sel = 0; m.rounds = N; m.round = 0;
    const settle = (s, res) => { s.res = res; m.round = m.slots.filter(x => x.res).length; if (m.round >= N) m.win(); };
    const behind = (s) => s.t >= JUDGE && s.lv < Math.min(1, s.t / FULL) - 0.2;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code);
      if (d && d <= N) { m.sel = d - 1; return true; } const s = m.slots[m.sel];
      if (a === 'D') { if (!s.seat && !s.res) { s.seat = true; m.ev('click'); } return true; }
      if (a === 'U') { if (!s.seat || s.res) { m.fault('no cell'); return true; } if (s.heat >= WARN) settle(s, 'pulled'); else { m.fault('pulled cool'); } return true; }
      if (ENTER(code)) { if (!s.seat || s.res) { m.fault('no cell'); return true; }
        if (s.lv >= 1) { if (s.k === 'slow') m.fault('slow passed'); settle(s, 'clear'); } else if (behind(s)) settle(s, 'tag'); else m.fault('early clear'); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const s of m.slots) { if (!s.seat || s.res) continue; s.t += dt; s.lv = Math.min(1, s.lv + s.rate * dt); s.heat = Math.min(1, s.heat + s.hr * dt);
      if (s.heat >= 1) { m.fault('cooked'); settle(s, 'cooked'); } } void HEATT; };
    m.hint = () => { const go = (i, k) => [['Digit' + (i + 1), true], [k, true]], S = m.slots;
      let i = S.findIndex(s => s.seat && !s.res && s.heat >= WARN + 0.02); if (i >= 0) return go(i, 'ArrowUp');
      i = S.findIndex(s => s.seat && !s.res && (s.lv >= 1 || behind(s))); if (i >= 0) return go(i, 'Enter');
      i = S.findIndex(s => !s.seat); return i >= 0 ? go(i, 'ArrowDown') : []; };
    m.bad = () => { const i = m.slots.findIndex(s => s.seat && !s.res && s.heat < WARN && s.lv < 1 && !behind(s)); if (i >= 0) return m.sel === i ? 'Enter' : 'Digit' + (i + 1); const j = m.slots.findIndex(s => !s.seat); return j >= 0 ? (m.sel === j ? 'ArrowDown' : 'Digit' + (j + 1)) : null; };
    m.view = () => ({ kinds: m.slots.map(s => [s.k, +s.hr.toFixed(2)]) });
    m.buttons = () => [...[1, 2, 3, 4].map(n => ['Digit' + n, `Slot ${n}`]), ['ArrowDown', '↓ Seat'], ['ArrowUp', '↑ Pull'], ['Enter', 'Tag / clear']];
    m.draw = (c, W, H, P) => {
      m.slots.forEach((s, i) => { const y = 12 + i * 34; box(c, 12, y, 376, 30, i === m.sel ? 'rgba(244,194,91,.13)' : COL.panel, i === m.sel ? COL.gold : null, 5);
        txt(c, `${i + 1}`, 22, y + 20, { size: 14, col: COL.gold });
        if (!s.seat) { txt(c, 'empty — ↓ to seat', 44, y + 19, { size: 10, col: COL.dim }); return; }
        txt(c, 'charge', 44, y + 12, { size: 8, col: COL.dim }); bar(c, 44, y + 15, 190, 9, s.lv, { col: COL.peri, mark: Math.min(1, s.t / FULL) });
        txt(c, 'heat', 248, y + 12, { size: 8, col: COL.dim }); bar(c, 248, y + 15, 80, 9, s.heat, { col: s.heat >= WARN ? P.bad : COL.gold });
        c.fillStyle = '#fff'; for (let k = 0; k < 9; k += 3) c.fillRect(248 + WARN * 80 - 1, y + 13 + k, 2, 2);
        txt(c, s.res ? s.res.toUpperCase() : s.t < JUDGE ? `${s.t.toFixed(1)} s` : 'judge', 380, y + 21, { size: 10, align: 'right', col: s.res ? COL.pale : s.t >= JUDGE ? COL.warn : COL.ink }); });
    };
    return m;
  },
});
