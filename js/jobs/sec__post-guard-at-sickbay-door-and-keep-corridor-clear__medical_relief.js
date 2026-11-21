// Security: post guard at sickbay door. People come up the corridor one at a time. A visitor with a medical pass is admitted (Right); one
// without is turned back (Left). A stretcher waits for the medic's call: only once the MEDIC CALL lamp is lit, hold Space to keep the door
// open while it passes, and let go when it is through. Opening unasked, leaving a stretcher blocked, or deciding a visitor wrongly is a fault.
import { define, machine, ARROW, SPACE, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Post guard at sickbay door and keep corridor clear', type: 'task:medical_relief' },
  title: 'Hold the door for the call', dept: 'security', host: 'console', tool: 'Sickbay door post',
  how: 'Visitor with a pass: Right admits. No pass: Left turns them back. For a stretcher wait for the MEDIC CALL lamp, then hold Space until it is through.',
  keys: ['Right admit', 'Left turn back', 'Space hold the door for a stretcher'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'hold the door', input: 'arrows+space-hold',
    win: 'six arrivals dealt with: passed visitors admitted, unpassed turned back, stretchers let through on the medic call only',
    fail: 'admitting an unpassed visitor, turning back a passed one, opening the door without a call, or a stretcher left blocked too long',
    rule: 'Check the pass: Right admits, Left turns back. A stretcher goes through only after MEDIC CALL lights: hold Space while it passes, then let go.' },
  rush: 'Let everyone through on a nod so the corridor kept moving.',
  captions: { 'unpassed in': 'unpassed visitor admitted', 'wrong turn': 'medical visitor turned back', unasked: 'door opened unasked', blocked: 'stretcher blocked', jam: 'corridor jammed' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, kinds = shuffle(r, ['v', 'v', 'v', 'v', 's', 's']); m.q = kinds.map((k) => ({ k, pass: k === 'v' ? r() < 0.5 : true, age: 0, call: false, p: 0, done: false })); m.i = 0; m.gap = 0.6; m.hold = false; m.un = 0;
    const need = m.calm ? 1.4 : 1.2, wait = m.calm ? 3.6 : 3;
    m.cur = () => (m.gap <= 0 ? m.q[m.i] : null);
    m.fin = () => { m.q[m.i].done = true; m.i++; m.gap = 0.5; if (m.i >= m.q.length) m.win(); };
    m.key = (code, down = true) => { if (m.state !== 'play') return false; if (SPACE(code)) { m.hold = down; return true; } if (!down) return false; const a = ARROW(code), e = m.cur();
      if (a !== 'L' && a !== 'R') return false; if (!e || e.k !== 'v') { m.fault('unasked'); return true; }
      if (a === 'R') { if (e.pass) m.fin(); else { m.fault('unpassed in'); m.fin(); } } else if (e.pass) { m.fault('wrong turn'); m.fin(); } else m.fin(); return true; };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.gap > 0) { m.gap -= dt; if (!(m.hold && m.i < m.q.length)) { m.un = 0; } return; } const e = m.q[m.i]; if (!e) return; e.age += dt;
      if (e.k === 'v') { if (e.age > 2.5) { m.fault('jam'); m.fin(); } m.un = 0; return; }
      e.call = e.age >= 0.6; if (m.hold) { if (!e.call) { m.un += dt; if (m.un > 0.3) { m.fault('unasked'); m.un = 0; } } else { e.p += dt; if (e.p >= need) m.fin(); } } else m.un = 0; if (e.age > 0.6 + wait && m.state === 'play' && !e.done) { m.fault('blocked'); m.fin(); } };
    m.hint = () => { const e = m.cur(); if (!e) return [['Space', false]]; if (e.k === 'v') return e.age > 0.5 ? [[e.pass ? 'ArrowRight' : 'ArrowLeft', true]] : []; return [['Space', e.call]]; };
    m.bad = () => { const e = m.cur(); if (!e) return null; if (e.k === 'v') return e.age > 0.3 ? [e.pass ? 'ArrowLeft' : 'ArrowRight', true] : null; return ['Space', true]; };
    m.view = () => ({ q: m.q.map(e => [e.k, e.pass]) });
    m.buttons = () => [['ArrowLeft', 'Turn back'], ['ArrowRight', 'Admit'], ['Space', 'Hold door']];
    m.draw = (c) => { const e = m.cur(); txt(c, `arrivals ${Math.min(m.i, 6)} / 6`, 14, 20, { size: 11, col: COL.dim }); box(c, 14, 30, 372, 70, COL.panel, COL.peri);
      if (!e) { txt(c, 'corridor clear', 24, 70, { size: 14, col: COL.dim }); return; }
      if (e.k === 'v') { txt(c, 'VISITOR', 24, 54, { size: 14 }); txt(c, e.pass ? '◆ medical pass shown' : 'no pass shown', 24, 82, { size: 14, col: e.pass ? COL.pale : COL.warn }); }
      else { txt(c, 'STRETCHER', 24, 54, { size: 14 }); txt(c, e.call ? 'MEDIC CALL ▲ lit' : 'waiting for medic call', 24, 82, { size: 14, col: e.call ? COL.gold : COL.dim }); box(c, 14, 112, 372, 12, null, COL.dim, 4); c.fillStyle = COL.peri; c.fillRect(16, 114, 368 * Math.min(1, e.p / need), 8); } };
    return m;
  },
});
