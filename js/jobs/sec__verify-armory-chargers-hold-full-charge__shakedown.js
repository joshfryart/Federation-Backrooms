// Security: verify armory chargers hold full charge. Every charger lamp reads green, but the lamp lies. Pick a charger (1-4), then hold Space to
// clip the charge meter to the zapper contacts: the needle needs a full second of contact to settle on the real level. A level under the full
// mark is a faulty charger, so flag it with Enter. Flagging an unread charger, or one that really is full, is a fault.
import { define, machine, DIG, SPACE, ENTER, ri, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Verify armory chargers hold full charge', type: 'task:shakedown' },
  title: 'Clip the meter, ignore the lamp', dept: 'security', host: 'console', tool: 'Charge meter and charger rack',
  how: 'Pick a charger (1-4) and hold Space for a second to clip the meter on. A reading under the full mark means a faulty charger: press Enter to flag it.',
  keys: ['1-4 pick a charger', 'Space hold: clip the meter', 'Enter flag as faulty'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'clip and read', input: 'digits+space-hold+enter',
    win: 'all four chargers read off the contacts for a full second and every one under the full mark flagged despite a green lamp',
    fail: 'flagging a charger that was never read, flagging one that reads full, or trusting a green lamp over the meter',
    rule: 'All lamps are green. Hold Space on a charger for 1 s to read its true level. Below the FULL mark: Enter to flag it faulty.' },
  rush: 'Went by the green lamps and signed the engineering slip.',
  captions: { unread: 'flagged without a meter reading', 'false flag': 'good charger flagged' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, need = m.calm ? 1.3 : 1; m.sel = 0; m.sp = false;
    const bad = ri(r, 0, 3), bad2 = r() < 0.4 ? (bad + 1) % 4 : -1; m.ch = [0, 1, 2, 3].map(i => ({ lv: i === bad || i === bad2 ? ri(r, 42, 78) / 100 : ri(r, 96, 100) / 100, h: 0, read: false, flag: false, f: i === bad || i === bad2 }));
    m.chk = () => { if (m.ch.every(c => c.read && c.flag === c.f)) m.win(); };
    m.key = (code, down = true) => { if (m.state !== 'play') return false; if (SPACE(code)) { m.sp = down; return true; } if (!down) return false; const d = DIG(code), c = m.ch[m.sel];
      if (d >= 1 && d <= 4) { m.sel = d - 1; return true; }
      if (ENTER(code)) { if (!c.read) m.fault('unread'); else if (!c.f) m.fault('false flag'); else { c.flag = true; m.chk(); } return true; } return false; };
    m.tick = (dt) => { if (!m.live(dt)) return; const c = m.ch[m.sel]; if (m.sp) { c.h = Math.min(need, c.h + dt); if (c.h >= need) c.read = true; } else if (!c.read) c.h = 0; m.chk(); };
    m.hint = () => { const i = m.ch.findIndex(c => !c.read || c.flag !== c.f); if (i < 0) return []; const c = m.ch[i]; if (m.sel !== i) return [['Space', false], ['Digit' + (i + 1), true]]; if (!c.read) return [['Space', true]]; return [['Space', false], ['Enter', true]]; };
    m.bad = () => { m.sel = m.ch.findIndex(c => !c.read); return 'Enter'; };
    m.view = () => ({ ch: m.ch.map(c => [c.lv, c.f]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Space', 'Clip'], ['Enter', 'Flag']];
    m.draw = (c) => m.ch.forEach((q, i) => { const x = 10 + i * 96; box(c, x, 12, 90, 140, COL.panel, m.sel === i ? COL.gold : COL.dim); txt(c, `${i + 1}  lamp ● GREEN`, x + 6, 30, { size: 10, col: COL.pale });
      txt(c, q.read ? `${Math.round(q.lv * 100)} %` : q.h > 0 ? 'reading...' : 'no reading', x + 6, 66, { size: q.read ? 24 : 12, col: q.read && q.f ? COL.warn : COL.ink }); bar(c, x + 6, 78, 76, 8, q.read ? q.lv : q.h / need * 0.5, { mark: 0.95, col: q.read ? COL.pale : COL.dim });
      txt(c, q.flag ? '▲ FAULTY' : q.read && q.f ? 'under FULL' : '', x + 6, 112, { size: 11, col: COL.warn }); });
    return m;
  },
});
