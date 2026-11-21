// Security: enforce quarantine line if ordered. The order names the pass symbol and door. Each person arrives with a pass: Digit 2 lets a
// matching pass across, Digit 1 turns anyone else back. Some people push at the tape; hold Space to brace the line and slow them (bracing
// tires you, so let go between pushers). A pusher who gets to the tape before the call, or any wrong call, breaks the quarantine.
import { define, machine, DIG, SPACE, ri, pick, shuffle, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Enforce quarantine line if ordered', type: 'task:medical_relief' },
  title: 'Brace the tape, rule on the pass', dept: 'security', host: 'console', tool: 'Quarantine line tape',
  how: 'Compare each pass with the order. 2 lets a matching pass across, 1 turns back anything else. Hold Space to brace against someone pushing the line.',
  keys: ['1 turn back', '2 let across', 'Space hold to brace'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'brace and rule', input: 'digits+space-hold',
    win: 'five people ruled on against the order pass and door while the tape held against every pusher',
    fail: 'letting across a pass that does not match, turning back one that does, or a pusher reaching the tape before the call',
    rule: 'The order names a symbol and a door; a pass must match both. 2 lets across, 1 turns back. Hold Space to slow a pusher; bracing drains your strength.' },
  rush: 'Waved people over the tape after a quick look at their faces.',
  captions: { 'wrong cross': 'unpassed person across the line', 'wrong turn': 'valid pass turned away', pushed: 'line crossed' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, S = ['◆', '▲', '●', '■'], D = ['A', 'B', 'C']; m.os = pick(r, S); m.od = pick(r, D);
    const flags = shuffle(r, [true, true, false, false, false]); m.q = flags.map((ok, i) => ({ ok, sym: ok ? m.os : pick(r, S.filter(x => x !== m.os)), door: ok ? m.od : (r() < 0.5 ? m.od : pick(r, D.filter(x => x !== m.od))), pusher: i % 2 === 0 || r() < 0.3, age: 0, push: 0 }));
    for (const e of m.q) if (!e.ok && e.sym === m.os && e.door === m.od) e.door = D.find(x => x !== m.od); m.i = 0; m.gap = 0.6; m.st = 1; m.brace = false;
    m.cur = () => (m.gap <= 0 ? m.q[m.i] : null); m.fin = () => { m.i++; m.gap = 0.5; if (m.i >= m.q.length) m.win(); };
    m.key = (code, down = true) => { if (m.state !== 'play') return false; if (SPACE(code)) { m.brace = down; return true; } if (!down) return false; const d = DIG(code), e = m.cur();
      if (d !== 1 && d !== 2) return false; if (!e) { m.fault('wrong turn'); return true; }
      if (d === 2) { if (!e.ok) m.fault('wrong cross'); } else if (e.ok) m.fault('wrong turn'); if (m.state === 'play') m.fin(); return true; };
    m.tick = (dt) => { if (!m.live(dt)) return; m.st = Math.max(0, Math.min(1, m.st + (m.brace && m.st > 0 ? -0.4 : 0.3) * dt)); if (m.gap > 0) m.gap -= dt; const e = m.cur(); if (!e) return; e.age += dt;
      const braced = m.brace && m.st > 0; e.push += (e.pusher ? (braced ? 0.15 : 1.2) : 0.2) * dt * (m.calm ? 0.8 : 1); if (e.push >= 1) { m.fault('pushed'); if (m.state === 'play') m.fin(); } };
    m.hint = () => { const e = m.cur(); if (!e) return [['Space', false]]; const k = [['Space', e.pusher]]; if (e.age > 1) k.push(['Digit' + (e.ok ? 2 : 1), true]); return k; };
    m.bad = () => { const e = m.cur(); return e && e.age > 0.3 ? 'Digit' + (e.ok ? 1 : 2) : null; };
    m.view = () => ({ o: [m.os, m.od], q: m.q.map(e => [e.sym, e.door, e.pusher]) });
    m.buttons = () => [['Digit1', 'Turn back'], ['Digit2', 'Let across'], ['Space', 'Brace']];
    m.draw = (c) => { box(c, 14, 10, 372, 28, COL.panel, COL.gold); txt(c, `ORDER: pass ${m.os}  door ${m.od}`, 24, 30, { size: 13, col: COL.gold }); const e = m.cur();
      txt(c, `person ${Math.min(m.i + 1, 5)} / 5`, 14, 56, { size: 10, col: COL.dim }); if (e) { txt(c, `pass ${e.sym}  door ${e.door}`, 24, 84, { size: 18 }); txt(c, e.pusher ? 'PUSHING at the tape' : 'waiting at the tape', 24, 106, { size: 12, col: e.pusher ? COL.warn : COL.dim }); bar(c, 220, 70, 160, 10, e.push, { col: COL.warn }); txt(c, 'push', 220, 66, { size: 9, col: COL.dim }); }
      txt(c, 'strength', 14, 140, { size: 10, col: COL.dim }); bar(c, 70, 132, 140, 10, m.st, { col: COL.pale }); };
    return m;
  },
});
