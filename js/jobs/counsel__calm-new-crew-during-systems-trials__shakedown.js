// Counsellor: calm new crew during the systems trials. Coach a panicking crewman's breathing: hold Space through a slow in-breath (about three
// seconds), let go for a longer out-breath (about four). Each good cycle brings the panic down; a rushed breath winds it back up. When they are
// calm enough they press the alarm test button themselves.
import { define, machine, SPACE, pick, txt, bar, COL } from './kit.js';

const NAMES = ['Ensign Okafor', 'Crewman Lind', 'Ensign Moreau', 'Crewman Sato', 'Ensign Ibarra', 'Crewman Petrov'];
export default define({
  job: { billet: 'counsel', label: 'Calm new crew during systems trials', type: 'task:shakedown' },
  title: 'Paced breathing coach', dept: 'medical', host: 'console', tool: 'Mess table, alarm chart',
  how: 'Breathe with them: hold Space through a slow in-breath of about three seconds, let go for an out-breath of about four. Good cycles bring their panic down.',
  keys: ['Space hold: in-breath', 'release: out-breath'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'pace breathing', input: 'space-hold+rhythm', win: 'the crewman brought down from panic to calm with steady coached breaths so they press the alarm test',
    fail: 'rushed or ragged breaths that wind the panic back up',
    rule: 'Hold Space for the in-breath and release for the out-breath. In-breaths of 2.4 – 3.6 s and out-breaths of 3.2 – 4.8 s are good cycles. A breath under 1.5 s is rushed: it is a fault and the panic rises.' },
  rush: 'Told them it was only a drill and went to the next one.',
  captions: { 'rushed breath': 'crewman gasps' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.who = pick(r, NAMES); m.panic = 0.7 + r() * 0.2; m.need = 3; m.good = 0; m.ph = 'out'; m.since = 2.5 + r(); m.lastIn = 0; m.rounds = 3; m.round = 0; m.log = [];
    const judge = (kind, len) => {
      const ok = kind === 'in' ? len >= 2.4 && len <= 3.6 : len >= 3.2 && len <= 4.8; m.log.push([kind, +len.toFixed(1), ok]); if (m.log.length > 6) m.log.shift();
      if (len < 1.5) { m.fault('rushed breath'); m.panic = Math.min(1, m.panic + 0.12); m.good = Math.max(0, m.good - 1); return; }
      if (kind === 'out' && ok && m.lastIn) { m.good++; m.round = m.good; m.panic = Math.max(0, m.panic - 0.25); if (m.good >= m.need) m.win(); }
      if (kind === 'in') m.lastIn = ok;
    };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !SPACE(code)) return false;
      if (down && m.ph === 'out') { if (m.t > 0.3) judge('out', m.since); m.ph = 'in'; m.since = 0; }
      else if (!down && m.ph === 'in') { judge('in', m.since); m.ph = 'out'; m.since = 0; }
      return true;
    };
    m.tick = (dt) => { if (m.live(dt)) m.since += dt; };
    m.hint = () => [['Space', m.ph === 'in' ? m.since < 3.0 : m.since >= 4.0]];
    m.bad = () => (m.since > 0.4 ? ['Space', m.ph === 'out'] : null);
    m.view = () => ({ who: m.who, panic: +m.panic.toFixed(3), since: +m.since.toFixed(3) });
    m.buttons = () => [['Space', 'Breathe in (hold)']];
    m.draw = (c, W, H, P) => {
      const cx = 90, cy = 85, k = m.ph === 'in' ? Math.min(1, m.since / 3) : Math.max(0, 1 - m.since / 4), R = 26 + 36 * k;
      c.strokeStyle = COL.peri; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, 0, 6.283); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.15)'; c.beginPath(); c.arc(cx, cy, 62, 0, 6.283); c.stroke();
      txt(c, m.ph === 'in' ? 'IN…' : 'OUT…', cx, cy + 5, { size: 14, align: 'center', col: COL.gold }); txt(c, `${m.since.toFixed(1)} s`, cx, cy + 22, { size: 10, align: 'center', col: COL.dim });
      txt(c, m.who, 180, 26, { size: 13, col: COL.gold }); txt(c, 'Panic', 180, 50, { size: 10, col: COL.dim }); bar(c, 180, 56, 200, 12, m.panic, { col: m.panic > 0.5 ? COL.warn : P.good });
      txt(c, `good breaths ${m.good} / ${m.need}`, 180, 90, { size: 12, col: COL.pale });
      m.log.forEach(([kind, len, ok], i) => txt(c, `${kind} ${len}s ${ok ? '✓' : '·'}`, 180 + (i % 3) * 66, 116 + Math.floor(i / 3) * 16, { size: 10, col: ok ? P.good : COL.dim }));
    };
    return m;
  },
});
