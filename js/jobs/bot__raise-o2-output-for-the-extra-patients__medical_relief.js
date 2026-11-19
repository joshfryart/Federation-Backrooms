// Botanist, medical relief: raise O2 output for the extra patients. Only the front three trays by the sickbay corridor are touched. Each has a
// lamp dial and a nutrient feed, both in notches, and a tray only gives more O2 when both go up together: leapfrog them one notch at a time. A
// lamp two notches ahead of the feed scorches the leaves; a feed two ahead of the lamp burns the roots. Either knocks that tray back down (a
// fault). Bring the lagging O2 gauge up to the sickbay board's need line.
import { define, machine, ARROW, ri, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'bot', label: 'Raise O2 output for the extra patients', type: 'task:medical_relief' },
  title: 'Lamp and feed leapfrog', dept: 'sciences', host: 'console', tool: 'Front tray lamp and feed panel',
  how: '← / → pick a front tray, ↑ raises its lamp a notch, ↓ raises its feed a notch. Keep lamp and feed within one notch of each other until the O2 gauge reaches the need line.',
  keys: ['← / → tray', '↑ lamp +1', '↓ feed +1'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'leapfrog', input: 'arrows', win: 'the O2 gauge brought up to the patient need with every tray lamp and feed kept in step',
    fail: 'raising lamp or feed two notches ahead of the other so the tray scorches or root-burns',
    rule: 'A tray yields the lower of its lamp and feed notches. Alternate them, never letting one get two ahead, across trays, until the lagging gauge meets the need line.' },
  rush: 'Turned all the lamps to full and hoped the feed kept up.',
  captions: { scorched: 'lamp crackle', 'root burn': 'feed line hisses' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, top = 4;
    m.need = ri(r, 7, 9); m.trays = [0, 1, 2].map(() => { const v = ri(r, 0, 1); return { L: v, F: v }; }); m.sel = ri(r, 0, 2); m.g = 0; m.last = -9;
    const yieldOf = () => m.trays.reduce((a, t) => a + Math.min(t.L, t.F), 0);
    m.g = yieldOf();
    const up = (t, k) => { if (t[k] >= top) return; t[k]++; const o = k === 'L' ? 'F' : 'L'; if (t[k] - t[o] >= 2) { m.fault(k === 'L' ? 'scorched' : 'root burn'); t.L = t.F = Math.max(0, t[o] - 1); } };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); if (!a) return false; m.last = m.t;
      if (a === 'L') m.sel = (m.sel + 2) % 3; else if (a === 'R') m.sel = (m.sel + 1) % 3; else up(m.trays[m.sel], a === 'U' ? 'L' : 'F');
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.g += (yieldOf() - m.g) * Math.min(1, dt * (m.calm ? 2 : 1.6)); if (m.g >= m.need - 0.05) m.win(); };
    m.hint = () => { if (m.t - m.last < 0.12) return []; if (yieldOf() >= m.need) return [];
      let best = -1; m.trays.forEach((t, i) => { if (Math.min(t.L, t.F) < top && (best < 0 || Math.min(t.L, t.F) < Math.min(m.trays[best].L, m.trays[best].F))) best = i; });
      if (best !== m.sel) return [['ArrowRight', true]]; const t = m.trays[best]; return [[t.L <= t.F ? 'ArrowUp' : 'ArrowDown', true]]; };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ need: m.need, trays: m.trays.map(t => t.L), sel: m.sel });
    m.buttons = () => [['ArrowLeft', '◀ tray'], ['ArrowRight', 'tray ▶'], ['ArrowUp', 'Lamp +1'], ['ArrowDown', 'Feed +1']];
    m.draw = (c, W, H, P) => {
      m.trays.forEach((t, i) => { const x = 14 + i * 92, on = i === m.sel, gap = t.L - t.F;
        box(c, x, 14, 84, 120, on ? 'rgba(240,147,58,.18)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 8); txt(c, `Front tray ${i + 1}`, x + 42, 30, { size: 10, align: 'center', col: COL.gold });
        for (let n = 0; n < top; n++) { c.fillStyle = n < t.L ? COL.gold : 'rgba(255,255,255,.1)'; c.fillRect(x + 12, 112 - n * 18, 24, 14); c.fillStyle = n < t.F ? COL.peri : 'rgba(255,255,255,.1)'; c.fillRect(x + 48, 112 - n * 18, 24, 14); }
        txt(c, 'lamp', x + 24, 146, { size: 9, align: 'center', col: COL.gold }); txt(c, 'feed', x + 60, 146, { size: 9, align: 'center', col: COL.peri });
        if (gap) lamp(c, x + 42, 44, 6, COL.warn, gap > 0 ? 'triangle' : 'diamond'); });
      txt(c, 'O2 gauge', 300, 26, { size: 11, col: COL.pale }); bar(c, 300, 34, 90, 14, m.g / 12, { mark: m.need / 12 });
      txt(c, `${m.g.toFixed(1)} / need ${m.need}`, 300, 66, { size: 11, col: m.g >= m.need - 0.05 ? P.good : COL.ink });
      txt(c, 'never 2 apart', 300, 100, { size: 10, col: COL.dim }); txt(c, '▲ lamp ahead', 300, 116, { size: 9, col: COL.dim }); txt(c, '◆ feed ahead', 300, 130, { size: 9, col: COL.dim });
    };
    return m;
  },
});
