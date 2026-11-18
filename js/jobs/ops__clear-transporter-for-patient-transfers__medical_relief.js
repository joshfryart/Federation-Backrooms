// Ops: clear the transporter for patient transfers. Key the sickbay's destination coordinates from the transfer card into the pad panel digit
// by digit. The worn keypad sometimes bounces onto the next key, so read every digit back on the panel and delete (←) any that came out wrong.
// Once the lock light is green, sickbay reads its numbers back; they may read off an old card, so query (↓) until they match, then clear (Enter).
import { define, machine, DIG, ARROW, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'ops', label: 'Clear transporter for patient transfers', type: 'task:medical_relief' },
  title: 'Patient coordinate key-and-verify', dept: 'operations', host: 'console', tool: 'Pad coordinate panel and handset',
  how: 'Type the card\'s coordinates (1-9), checking each digit on the panel and deleting a bounced one with ←. When the lock light is green, compare sickbay\'s read-back: ↓ to ask again if it differs, Enter to clear the pad when it matches.',
  keys: ['1-9 key a digit', '← delete last digit', '↓ ask sickbay again', 'Enter clear the pad'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'key and verify', input: 'digits+arrows+enter', win: 'two patient transfers cleared with every coordinate digit verified on the panel and matched by sickbay\'s read-back',
    fail: 'clearing with a bounced digit on the panel, before the lock light, or against a sickbay read-back from an old card',
    rule: 'Each key press shows on the panel; a bounced key shows the neighbouring digit, so delete it with ← and retype. After five good digits the lock charges; then sickbay reads back. ↓ queries a mismatch, Enter clears a match.' },
  rush: 'Keyed the numbers in from memory and hit clear before sickbay answered.',
  captions: { 'wrong digit': 'pad error tone', 'no lock': 'lock alarm', 'old card': 'sickbay shouts stop' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, lockT = m.calm ? 0.6 : 0.8, rbT = 0.5;
    m.pts = [0, 1].map(() => { const card = Array.from({ length: 5 }, () => ri(r, 1, 9)), bounce = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 1, 2))); const old = r() < 0.6 ? card.map((d, i) => i === ri(r, 0, 4) ? (d % 9) + 1 : d) : null; return { card, bounce, old, ent: [], tried: new Set(), lock: 0, asked: false }; });
    m.pts.forEach(p => { if (p.old && p.old.join('') === p.card.join('')) p.old[0] = (p.old[0] % 9) + 1; });
    m.k = 0; m.last = -9; m.msg = ''; m.rounds = 2; m.round = 0;
    const P_ = () => m.pts[m.k], good = (p) => p.ent.length === 5 && p.ent.every((d, i) => d === p.card[i]), rb = (p) => (p.old && !p.asked ? p.old : p.card);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code), a = ARROW(code); if (!down) return !!d || !!a || ENTER(code); const p = P_(); if (!p) return false;
      if (d) { m.last = m.t; if (p.ent.length >= 5) return true; const i = p.ent.length; let v = d; if (p.bounce.has(i) && !p.tried.has(i)) { p.tried.add(i); v = d === 9 ? 8 : d + 1; } p.ent.push(v); p.lock = 0; return true; }
      if (a === 'L') { m.last = m.t; p.ent.pop(); p.lock = 0; return true; }
      if (a === 'D') { m.last = m.t; if (p.lock >= lockT + rbT) { p.asked = true; m.msg = 'Sickbay: reading again from the new card'; } return true; }
      if (ENTER(code)) {
        m.last = m.t;
        if (!good(p)) { m.fault('wrong digit'); m.msg = 'Panel does not match the card'; }
        else if (p.lock < lockT + rbT) { m.fault('no lock'); m.msg = 'Wait for the lock light and sickbay\'s read-back'; }
        else if (rb(p).join('') !== p.card.join('')) { m.fault('old card'); m.msg = 'Sickbay read back different numbers'; }
        else { m.msg = `Pad cleared for patient ${m.k + 1}`; m.k++; m.round++; if (m.k >= 2) m.win(); }
        return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const p = P_(); if (p && good(p)) p.lock += dt; };
    m.hint = () => {
      if (m.t - m.last < 0.15) return []; const p = P_(); if (!p) return [];
      const bad = p.ent.findIndex((d, i) => d !== p.card[i]); if (bad >= 0) return [['ArrowLeft', true]];
      if (p.ent.length < 5) return [[`Digit${p.card[p.ent.length]}`, true]]; if (p.lock < lockT + rbT + 0.05) return [];
      return [[rb(p).join('') !== p.card.join('') ? 'ArrowDown' : 'Enter', true]];
    };
    m.bad = () => (m.t - m.last < 0.2 ? null : 'Enter');
    m.view = () => ({ pts: m.pts.map(p => [p.card.join(''), [...p.bounce], p.old && p.old.join('')]) });
    m.buttons = () => [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => [`Digit${d}`, `${d}`]), ['ArrowLeft', '← del'], ['ArrowDown', '↓ ask'], ['Enter', 'Clear']];
    m.draw = (c, W, H, P) => {
      const p = P_(); if (!p) return; txt(c, `PATIENT TRANSFER CARD ${m.k + 1}/2`, 14, 20, { size: 11, col: COL.dim }); txt(c, p.card.join(' '), 14, 44, { size: 22, col: COL.gold });
      txt(c, 'PAD PANEL', 200, 20, { size: 11, col: COL.dim });
      for (let i = 0; i < 5; i++) { const v = p.ent[i], x = 200 + i * 36; box(c, x, 26, 30, 30, 'rgba(255,255,255,.06)', i === p.ent.length ? COL.orange : null, 5); if (v != null) txt(c, v, x + 15, 48, { size: 18, align: 'center', col: v === p.card[i] ? COL.ink : P.bad }); }
      const lk = good(p) && p.lock >= lockT; lamp(c, 24, 84, 9, lk ? P.good : COL.dim, lk ? 'circle' : 'square'); txt(c, lk ? 'LOCK GREEN · buffer ready' : good(p) ? 'lock charging…' : 'no lock', 40, 89, { size: 12, col: lk ? P.good : COL.dim });
      txt(c, 'SICKBAY READ-BACK:', 14, 118, { size: 11, col: COL.dim }); txt(c, p.lock >= lockT + rbT ? rb(p).join(' ') : '—', 150, 118, { size: 16, col: COL.pale });
      txt(c, m.msg, 14, H - 10, { size: 11, col: COL.pale });
    };
    return m;
  },
});
