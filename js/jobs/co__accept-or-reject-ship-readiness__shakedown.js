// Captain: accept or reject ship readiness. The fault list is longer than the arm screen: scroll it all the way down (hold ↓) before ruling.
// A fault counts as cleared only when it is CLOSED or carries a waiver that has not expired by today's stardate. Accept (1) only when every
// fault is cleared; otherwise reject (2) and name a system that holds the ship back (its number in the systems box). Ruling before reading
// the whole list, accepting with an open fault, rejecting a clean list, or blaming a clean system is a fault. Three reviews.
import { define, machine, ARROW, DIG, ri, pick, shuffle, txt, box, COL } from './kit.js';

const SYS = ['Warp drive', 'Shields', 'Weapons', 'Life support', 'Sensors', 'Transporters'];
const ITEM = ['coupling wear', 'relay lag', 'seal weep', 'firmware fault', 'sensor drift', 'pump noise', 'cable chafe', 'valve stiction'];

export default define({
  job: { billet: 'co', label: 'Accept or reject ship readiness', type: 'task:shakedown' },
  title: 'Readiness verdict on the fault list', dept: 'command', host: 'console', tool: 'Readiness checklist and accept / reject keys',
  how: 'Scroll the whole fault list, count a fault cleared only if closed or under an unexpired waiver, then accept or reject and name the system holding the ship back.',
  keys: ['↑ ↓ hold: scroll', '1 accept', '2 reject', '3-6 name system'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'rule on readiness', input: 'arrows-hold+digits', win: 'three readiness reviews ruled correctly after reading every fault, with each rejection naming a system that really holds the ship back',
    fail: 'ruling before scrolling the whole list, accepting with an open or expired-waiver fault, rejecting a clean list, or blaming a clean system',
    rule: 'Hold ↓ to scroll until the end mark shows. A waiver dated before today has lapsed. All cleared: press 1. Anything open: press 2, then the number (3-6) of a system with an open fault.' },
  rush: 'Accepted the ship on the closed-fault total without reading the waivers.',
  captions: { 'unread list': 'checklist: unread entries', 'accepted open': 'chief engineer objects', 'needless reject': 'XO: "the list is clean, sir"', 'wrong system': 'chief: "not my system, sir"' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, plan = shuffle(r, [true, false, false]), sp = m.calm ? 3.5 : 4.5;
    m.revs = plan.map(clean => {
      const today = ri(r, 48200, 48290), sys = shuffle(r, SYS).slice(0, 4), n = 8;
      const fl = Array.from({ length: n }, () => { const k = r(); return { sys: pick(r, sys), it: pick(r, ITEM), st: k < 0.5 ? 'CLOSED' : 'WAIVED', until: today + ri(r, 1, 40) }; });
      if (!clean) { const bad = shuffle(r, [...Array(n).keys()]).slice(0, ri(r, 1, 2)); for (const i of bad) { if (r() < 0.5) fl[i].st = 'OPEN'; else { fl[i].st = 'WAIVED'; fl[i].until = today - ri(r, 1, 30); } } }
      return { today, sys, fl, open: (s) => fl.some(f => f.sys === s && (f.st === 'OPEN' || (f.st === 'WAIVED' && f.until < today))) };
    });
    m.k = 0; m.off = 0; m.seen = false; m.phase = 'rule'; m.rounds = 3; m.round = 0;
    const R = () => m.revs[m.k], dirty = () => R().sys.some(s => R().open(s));
    const next = () => { m.round++; m.k++; m.off = 0; m.seen = false; m.phase = 'rule'; if (m.k >= 3) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a === 'U' || a === 'D') { m.held[a] = down; return true; } if (!down) return false;
      if (m.phase === 'rule' && (d === 1 || d === 2)) {
        if (!m.seen) { m.fault('unread list'); return true; }
        if (d === 1) { if (dirty()) m.fault('accepted open'); else next(); return true; }
        if (!dirty()) { m.fault('needless reject'); return true; } m.phase = 'blame'; return true;
      }
      if (m.phase === 'blame' && d >= 3 && d <= 6) { if (!R().open(R().sys[d - 3])) { m.fault('wrong system'); return true; } next(); return true; }
      return !!d || !!a;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.D) m.off = Math.min(4, m.off + sp * dt); if (m.held.U) m.off = Math.max(0, m.off - sp * dt); if (m.off >= 3.95) m.seen = true; };
    m.hint = () => {
      if (m.k >= 3) return []; if (!m.seen) return [['ArrowDown', true]]; const rel = ['ArrowDown', false];
      if (m.phase === 'rule') return [rel, ['Digit' + (dirty() ? 2 : 1), true]]; return [rel, ['Digit' + (R().sys.findIndex(s => R().open(s)) + 3), true]];
    };
    m.bad = () => 'Digit1';
    m.view = () => ({ revs: m.revs.map(v => [v.today, v.fl.map(f => [f.sys, f.st, f.until])]) });
    m.buttons = () => [['ArrowUp', '▲ Scroll'], ['ArrowDown', '▼ Scroll'], ['Digit1', '1 Accept'], ['Digit2', '2 Reject'], ...[3, 4, 5, 6].map(k => ['Digit' + k, String(k)])];
    m.draw = (c, W, H, P) => {
      if (m.k >= 3) return; const v = R(); txt(c, `REVIEW ${m.k + 1} / 3 · today SD ${v.today}`, 10, 14, { size: 11, col: COL.gold });
      c.save(); c.beginPath(); c.rect(6, 20, 250, 112); c.clip?.();
      v.fl.forEach((f, i) => { const y = 22 + (i - m.off) * 26; if (y < -10 || y > 140) return; box(c, 8, y, 246, 23, 'rgba(255,255,255,.05)', null, 5); txt(c, `${f.sys}: ${f.it}`, 14, y + 10, { size: 9 }); txt(c, f.st === 'WAIVED' ? `WAIVED to SD ${f.until}` : f.st, 14, y + 20, { size: 8, col: f.st === 'OPEN' ? P.bad : COL.dim }); });
      c.restore?.(); txt(c, m.seen ? '— end of list —' : '▼ more below', 10, 146, { size: 10, col: m.seen ? P.good : COL.warn });
      txt(c, 'SYSTEMS', 270, 18, { size: 10, col: COL.gold }); v.sys.forEach((s, j) => txt(c, `${j + 3}  ${s}`, 270, 36 + j * 16, { size: 10 }));
      txt(c, m.phase === 'blame' ? 'Reject: name the system (3-6)' : '1 accept · 2 reject', 270, 120, { size: 10, col: COL.pale });
    };
    return m;
  },
});
