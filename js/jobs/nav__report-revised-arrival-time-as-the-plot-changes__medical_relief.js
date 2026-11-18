// Navigator: report the revised arrival time as the plot changes. Each reroute leaves the arrival form showing the OLD time. Work the new one
// out (ship's time now plus the new transit), key it in as four digits (HHMM), set the REVISED flag (Space) and send (Enter) before the
// report deadline. Sending the old time, a wrong sum or an unflagged figure misleads sickbay; missing the deadline leaves them staging
// for the wrong time.
import { define, machine, DIG, SPACE, ENTER, ri, rf, txt, box, bar, lamp, COL } from './kit.js';

const hm = (min) => { min = ((min % 1440) + 1440) % 1440; return String(Math.floor(min / 60)).padStart(2, '0') + String(min % 60).padStart(2, '0'); };
const dig = (code) => (code === 'Digit0' || code === 'Numpad0') ? 0 : DIG(code) || null;
export default define({
  job: { billet: 'nav', label: 'Report revised arrival time as the plot changes', type: 'task:medical_relief' },
  title: 'Revised arrival report', dept: 'flight', host: 'console', tool: 'Arrival report form',
  how: 'After each reroute key the new arrival (time now + transit) as HHMM with the number keys, set REVISED (Space) and send (Enter) before the deadline.',
  keys: ['0 – 9 arrival time HHMM', 'Space REVISED flag', 'Enter send'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'retime and send', input: 'digits+space+enter', win: 'three reroutes each answered in time with the recalculated arrival keyed in and the revised flag set',
    fail: 'sending the old or a mis-added time, sending without the revised flag, or letting the report deadline lapse',
    rule: 'The form shows ship\'s time and the new transit. Add them, type the four digits of the new arrival, press Space so REVISED shows, then Enter, all before the deadline bar empties.' },
  rush: 'Re-sent the arrival time already on the form after the reroute.',
  captions: { 'wrong time': 'sickbay query chirp', 'flag unset': 'form buzz', stale: 'deadline tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dl = m.calm ? 12 : 8; m.rounds = 3; m.round = 0;
    m.now = ri(r, 0, 287) * 5; m.old = m.now + ri(r, 20, 50) * 5; m.ch = null; m.wait = 0.5;
    const change = () => { m.now += ri(r, 2, 6) * 5; const tr = ri(r, 13, 58) * 5; let ans = hm(m.now + tr); if (ans === hm(m.old)) ans = hm(m.now + tr + 5); m.ch = { tr: ans === hm(m.now + tr) ? tr : tr + 5, ans, buf: '', flag: false, left: dl, why: ['debris bend', 'speed cut', 'hazard reroute', 'new beacon'][ri(r, 0, 3)] }; };
    const next = () => { m.old = m.now + m.ch.tr; m.ch = null; m.wait = rf(r, 0.8, 1.5); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = dig(code), c = m.ch;
      if (d == null && !SPACE(code) && !ENTER(code)) return false; if (!c) return true;
      if (d != null) { c.buf = c.buf.length >= 4 ? String(d) : c.buf + d; return true; }
      if (SPACE(code)) { c.flag = !c.flag; return true; }
      if (c.buf !== c.ans) { m.fault('wrong time'); c.buf = ''; return true; }
      if (!c.flag) { m.fault('flag unset'); return true; }
      m.round++; m.ev('sent', { eta: c.ans }); next(); if (m.round >= 3) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (!m.ch) { m.wait -= dt; if (m.wait <= 0) change(); return; } m.ch.left -= dt; if (m.ch.left <= 0) { m.fault('stale'); next(); } };
    m.hint = () => { const c = m.ch; if (!c) return []; if (c.buf !== c.ans) { const b = c.ans.startsWith(c.buf) ? c.buf : ''; return [['Digit' + c.ans[b.length], true]]; } return [[c.flag ? 'Enter' : 'Space', true]]; };
    m.bad = () => (m.ch ? 'Enter' : null);
    m.view = () => ({ now: m.now, old: m.old });
    m.buttons = () => [...'1234567890'].map(k => ['Digit' + k, k]).concat([['Space', 'REVISED'], ['Enter', 'Send']]);
    m.draw = (c, W, H, P) => {
      const ch = m.ch; box(c, 14, 12, 372, 146, 'rgba(125,151,232,.06)', COL.peri, 4);
      txt(c, `ARRIVAL REPORT · sent ${m.round} / 3`, 24, 30, { size: 12, col: COL.peri });
      txt(c, `ship's time ${hm(m.now).slice(0, 2)}:${hm(m.now).slice(2)}`, 24, 54, { size: 12 });
      if (!ch) { txt(c, 'plot steady: no change', 24, 80, { size: 12, col: COL.dim }); return; }
      txt(c, `REROUTE (${ch.why}): new transit ${Math.floor(ch.tr / 60)} h ${String(ch.tr % 60).padStart(2, '0')} m`, 24, 76, { size: 12, col: COL.warn });
      const shown = ch.buf ? ch.buf.padEnd(4, '_') : hm(m.old);
      txt(c, 'Est. arrival', 24, 104, { size: 11, col: COL.dim }); txt(c, `${shown.slice(0, 2)}:${shown.slice(2)}${ch.buf ? '' : '  (old)'}`, 110, 106, { size: 18, col: ch.buf ? COL.gold : COL.dim });
      lamp(c, 270, 100, 8, ch.flag ? P.good : COL.dim, ch.flag ? 'circle' : 'square'); txt(c, ch.flag ? 'REVISED' : 'not flagged', 284, 104, { size: 11, col: ch.flag ? P.good : COL.dim });
      txt(c, 'deadline', 24, 140, { size: 10, col: COL.dim }); bar(c, 80, 132, 290, 9, ch.left / dl, { col: ch.left < 2.5 ? COL.warn : COL.peri });
    };
    return m;
  },
});
