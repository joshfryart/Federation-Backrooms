// Counsellor: debrief the sensor team after a long scan. Sit with the team and ask each of the three (1 – 3) what they saw, in their own words,
// before you touch the replay. Then scrub the scan timeline (hold ← / →) to the moment the signal went strange and mark it with Space. Last,
// one of them will blame themselves: press their number to name the guilt back as something they can put down. Scrubbing or marking before
// everyone has spoken is taking the debrief over.
import { define, machine, ARROW, SPACE, DIG, ri, rf, pick, shuffle, txt, box, COL } from './kit.js';

const TEAM = ['Ens. Albescu', 'Lt. Navarro', 'Cmn. Teague', 'Ens. Wu', 'Dr. Ostrova', 'PO Mensah'];
const GUILT = ['"It was my watch. I should have caught it."', '"I looked away for a minute. That was on me."', '"If I had flagged it sooner…"'];
export default define({
  job: { billet: 'counsel', label: 'Debrief the sensor team after a long scan', type: 'task:survey' },
  title: 'Scan replay debrief', dept: 'medical', host: 'console', tool: 'Scan timeline, debrief log',
  how: 'Ask all three what they saw (1 – 3) before touching the replay. Then hold ← / → to scrub to where the trace went strange, mark it with Space, and press the number of whoever blames themselves.',
  keys: ['1 – 3 ask / name it back', '← / → hold: scrub', 'Space mark'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'hear then scrub', input: 'arrows-hold+digits+space', win: 'every team member heard first, the strange moment found together on the replay, and the self-blame named back',
    fail: 'scrubbing or marking before everyone has spoken, marking the wrong moment, or naming back the wrong person',
    rule: 'Press 1 – 3 to hear each member. Then hold ← / → to move the replay cursor and press Space on the spike (within 2 s). Then press the number of the member whose line is self-blame.' },
  rush: 'Put the scan report on the table and told them it happens.',
  captions: { 'took over': 'team falls silent', 'wrong moment': 'analyst shakes head', 'wrong person': 'awkward pause' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 3 : 2, len = 60, sp = 11;
    m.team = shuffle(r, TEAM).slice(0, 3); m.spike = ri(r, 14, 54); m.cur = pick(r, [2, 58]); m.guilty = ri(r, 0, 2); m.line = pick(r, GUILT);
    m.saw = m.team.map(() => m.spike + ri(r, -6, 6)); m.heard = [false, false, false]; m.ph = 'ask'; m.rounds = 3; m.round = 0;
    m.trace = Array.from({ length: len + 1 }, (_, k) => 0.35 + 0.08 * Math.sin(k * 0.7 + r() * 2) + (Math.abs(k - m.spike) <= 1 ? 0.45 - 0.15 * Math.abs(k - m.spike) : 0));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; if (down && m.ph === 'ask') m.fault('took over'); return true; }
      if (!down) return SPACE(code) || (d >= 1 && d <= 3);
      if (d >= 1 && d <= 3) { if (m.ph === 'ask') { m.heard[d - 1] = true; m.round = m.heard.filter(Boolean).length; if (m.heard.every(Boolean)) m.ph = 'scrub'; }
        else if (m.ph === 'guilt') { if (d - 1 === m.guilty) m.win(); else m.fault('wrong person'); } return true; }
      if (SPACE(code)) { if (m.ph === 'ask') m.fault('took over'); else if (m.ph === 'scrub') { if (Math.abs(m.cur - m.spike) <= tol) m.ph = 'guilt'; else m.fault('wrong moment'); } return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt) || m.ph !== 'scrub') return; const v = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0); m.cur = Math.max(0, Math.min(len, m.cur + v * sp * dt)); };
    m.hint = () => {
      if (m.ph === 'ask') return [['Digit' + (m.heard.indexOf(false) + 1), true]];
      if (m.ph === 'guilt') return [['Digit' + (m.guilty + 1), true]];
      const e = m.spike - m.cur; if (Math.abs(e) > 0.6) return [[e > 0 ? 'ArrowRight' : 'ArrowLeft', true], [e > 0 ? 'ArrowLeft' : 'ArrowRight', false]];
      return [['ArrowLeft', false], ['ArrowRight', false], ['Space', true]];
    };
    m.bad = () => 'Space';
    m.view = () => ({ team: m.team, spike: m.spike, saw: m.saw, guilty: m.guilty });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['ArrowLeft', '◀ scrub'], ['ArrowRight', 'scrub ▶'], ['Space', 'Mark']];
    m.draw = (c, W, H, P) => {
      m.team.forEach((n, i) => { const y = 14 + i * 20; txt(c, `${i + 1} ${n}`, 14, y + 4, { size: 11, col: COL.gold });
        txt(c, m.heard[i] ? (m.ph === 'guilt' && i === m.guilty ? m.line : `"It went odd around T+${m.saw[i]} s."`) : '(not asked yet)', 120, y + 4, { size: 10, col: m.heard[i] ? COL.pale : COL.dim }); });
      const X = 20, Y = 78, Wd = 360, Hh = 60; box(c, X - 4, Y - 4, Wd + 8, Hh + 22, 'rgba(255,255,255,.04)', m.ph === 'scrub' ? COL.peri : null, 4);
      c.strokeStyle = m.ph === 'ask' ? 'rgba(255,255,255,.2)' : COL.peri; c.lineWidth = 2; c.beginPath(); m.trace.forEach((v, k) => { const x = X + k / len * Wd, y = Y + Hh - v * Hh; k ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
      const cx = X + m.cur / len * Wd; c.fillStyle = COL.gold; c.fillRect(cx - 1, Y - 2, 3, Hh + 4); txt(c, `T+${Math.round(m.cur)} s`, cx, Y + Hh + 14, { size: 10, align: 'center', col: COL.gold });
      txt(c, m.ph === 'ask' ? 'Hear everyone before the replay' : m.ph === 'scrub' ? 'Scrub to the spike, Space to mark' : 'Who is blaming themselves? Press their number', 386, 160, { size: 10, align: 'right', col: COL.dim });
    };
    return m;
  },
});
