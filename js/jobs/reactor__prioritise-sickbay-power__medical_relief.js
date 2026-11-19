// Reactor specialist: prioritise sickbay power. Reactor output is fixed; the bridge orders more for sickbay. Every unit sickbay gains must come
// out of another share, and it has to come from the lowest-priority share that still has power, working up the list only when that one is
// empty. Cutting a higher-priority share while a lower one still draws is a wrong donor; letting the total run over output makes the biobeds
// flicker. Done when sickbay holds its ordered share with the total under output.
import { define, machine, DIG, ARROW, ri, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Prioritise sickbay power', type: 'task:medical_relief' },
  title: 'Sickbay share by lowest-priority donor', dept: 'engineering', host: 'console', tool: 'Sickbay feed panel',
  how: 'Pick a share with its number key and move it with Up / Down. Raise sickbay to the ordered figure, taking every unit from the lowest-priority share (highest P number) that still has power. Keep the total under output.',
  keys: ['1-5 pick a share', 'Up / Down move it a unit'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'rob the lowest', input: 'digits+arrows', win: 'sickbay raised to its ordered share with every unit taken from the lowest-priority share still powered and the total under output',
    fail: 'cutting a higher-priority share while a lower one still draws, or running the total over output until the biobeds flicker',
    rule: 'Each row shows a priority (P1 highest). Lower the powered row with the largest P number one unit, raise sickbay one unit, repeat; the total must not stay over output for more than a moment.' },
  rush: 'Shoved the sickbay slider to full and let the breakers shed whatever they chose.',
  captions: { 'wrong donor': 'priority alarm chirp', flicker: 'biobed lamps stutter' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, grace = m.calm ? 1.2 : 0.8;
    const defs = [['Life support', 1, ri(r, 8, 10), 6], ['Sickbay', 2, ri(r, 4, 6), 0], ['Shields', 3, ri(r, 3, 5), 0], ['Sensors', 4, ri(r, 2, 3), 0], ['Replicators', 5, ri(r, 1, 3), 0]];
    m.rows = shuffle(r, defs.map(([name, p, u, min]) => ({ name, p, u, min })));
    m.out = m.rows.reduce((a, s) => a + s.u, 0) + ri(r, 0, 1); m.sick = m.rows.find(s => s.name === 'Sickbay'); m.order = m.sick.u + ri(r, 4, 6);
    m.sel = -1; m.over = 0; m.ok = 0;
    const total = () => m.rows.reduce((a, s) => a + s.u, 0);
    const donor = () => m.rows.filter(s => s !== m.sick && s.u > s.min).sort((a, b) => b.p - a.p)[0];
    m.key = (code, down = true) => {
      const d = DIG(code), a = ARROW(code); if (m.state !== 'play' || (!(d >= 1 && d <= 5) && a !== 'U' && a !== 'D')) return false; if (!down) return true;
      if (d) { m.sel = d - 1; return true; } const s = m.rows[m.sel]; if (!s) return true;
      if (a === 'U') { s.u = Math.min(20, s.u + 1); return true; }
      if (s.u <= s.min) return true; if (s !== m.sick && s !== donor()) { m.fault('wrong donor'); return true; } s.u--; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      if (total() > m.out) { m.over += dt; if (m.over > grace) { m.fault('flicker'); m.over = 0; } } else m.over = 0;
      if (m.sick.u >= m.order && total() <= m.out) { m.ok += dt; if (m.ok > 0.5) m.win(); } else m.ok = 0;
    };
    m.hint = () => {
      if (m.sick.u >= m.order) return []; const iS = m.rows.indexOf(m.sick);
      if (total() + 1 <= m.out) return m.sel === iS ? [['ArrowUp', true]] : [['Digit' + (iS + 1), true]];
      const dn = donor(), iD = m.rows.indexOf(dn); return m.sel === iD ? [['ArrowDown', true]] : [['Digit' + (iD + 1), true]];
    };
    m.bad = () => { const i = m.rows.findIndex(s => s.p === 1); return m.sel === i ? 'ArrowDown' : 'Digit' + (i + 1); };
    m.view = () => ({ rows: m.rows.map(s => [s.name, s.u]), order: m.order });
    m.buttons = () => [...m.rows.map((s, i) => ['Digit' + (i + 1), String(i + 1)]), ['ArrowUp', 'Up'], ['ArrowDown', 'Down']];
    m.draw = (c, W, H, P) => {
      m.rows.forEach((s, i) => { const y = 14 + i * 24, on = i === m.sel; box(c, 12, y, 250, 20, on ? 'rgba(125,151,232,.25)' : COL.panel, on ? COL.peri : null, 4);
        txt(c, `${i + 1}`, 20, y + 14, { size: 11, col: COL.peri }); txt(c, s.name, 34, y + 14, { size: 11, col: s === m.sick ? COL.gold : COL.ink }); txt(c, `P${s.p}`, 122, y + 14, { size: 10, col: COL.dim });
        for (let k = 0; k < s.u; k++) c.fillRect(150 + k * 7, y + 5, 5, 10); });
      const t = total(), over = t > m.out; txt(c, `total ${t} / output ${m.out}`, 275, 30, { size: 12, col: over ? COL.warn : COL.ink });
      txt(c, `sickbay ordered ${m.order}`, 275, 52, { size: 12, col: COL.gold }); txt(c, 'BIOBEDS', 275, 82, { size: 10, col: COL.dim });
      for (let k = 0; k < 4; k++) lamp(c, 284 + k * 22, 98, 8, over ? P.bad : P.good, over ? 'triangle' : 'circle');
      txt(c, over ? 'flickering' : 'steady', 275, 126, { size: 11, col: over ? P.bad : P.good });
    };
    return m;
  },
});
