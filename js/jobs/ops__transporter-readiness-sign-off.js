// Ops: transporter readiness sign-off. Page through the pattern buffer log (tap E per entry), walk onto the pad and hold the hand tester on
// the ground stud (aim the view at it and hold E), then give the verdict at the readiness sheet: hold E to sign if everything read clean, or
// tap E for the lock-out key if any entry was marginal or the ground line is faulty. A wrong verdict either way is a fault.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'ops', label: 'Transporter readiness sign-off', type: 'loop' },
  title: 'Sign or lock out the pad', dept: 'operations', host: 'room', siteName: 'Check', verb: 'Clear',
  how: 'Tap E to page through every buffer log entry, hold the tester on the pad ground stud (aim, hold E), then at the sheet hold E to sign if all was clean, or tap E to lock out on any doubt.',
  keys: ['E tap: next entry / lock-out', 'E hold: test ground / sign'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'sign or lockout', input: 'e-tap+e-hold+look', win: 'buffer log paged, ground stud tested, and the pad signed only when every reading was clean, locked out otherwise',
    fail: 'signing readiness over a marginal entry or bad ground, locking out a clean pad, or shorting the tester off the stud',
    rule: 'Log: tap E for each entry. Pad: aim at the stud and hold E until the tester reads. Sheet: hold E to sign if nothing was marginal; a quick tap presses lock-out.' },
  rush: 'Signed the sheet from the console without setting foot on the pad.',
  captions: { 'signed doubtful': 'chief objects', 'needless lockout': 'lock-out buzzer', 'off the stud': 'tester crackles' },
  says: { 'signed doubtful': 'You signed with a doubtful reading. Any marginal entry or bad ground means lock-out.', 'needless lockout': 'Everything read clean — that pad should have been signed.', 'off the stud': 'The tester is on the deck plate, not the ground stud. Aim at the stud.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pattern buffer log', prop: 'baycontrol' }, { name: 'Pad ground stud', prop: 'pad' }, { name: 'Readiness sheet', prop: 'beampedestal' }]), r = m.rnd;
    const doubt = r() < 0.5, groundBad = doubt && r() < 0.4, sign = m.calm ? 0.9 : 1.2, tol = m.calm ? 0.14 : 0.1;
    m.entries = Array.from({ length: ri(r, 3, 5) }, () => 'CLEAN'); if (doubt && !groundBad) m.entries[ri(r, 0, m.entries.length - 1)] = 'MARGINAL';
    m.stud = (r() < 0.5 ? 1 : -1) * rf(r, 0.18, 0.38); m.ground = groundBad ? 'FAULT' : 'CLEAR'; m.paged = 0; m.test = 0; m.off = 0; m.hold = 0; m.read = false;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.press) { m.paged++; m.ev('page', { n: m.paged }); if (m.paged >= m.entries.length) { m.finish(0); return; } } s.prog = m.paged / m.entries.length; return; }
      if (i === 1) {
        if (inp.hold) { if (Math.abs((inp.look || 0) - m.stud) < tol) { m.test += dt; m.off = 0; } else { m.off += dt; if (m.off > 0.6) { m.fault('off the stud'); m.off = 0; m.test = 0; } } }
        if (m.test >= 1) { m.read = true; if (rel) { m.finish(1); return; } }
        s.prog = clamp(m.test) * 0.9; return;
      }
      if (inp.hold) m.hold += dt;
      if (m.hold >= sign) { m.hold = -99; if (doubt) m.fault('signed doubtful'); else { m.finish(2); return; } }
      if (rel) { if (m.hold > 0 && m.hold < 0.35) { if (doubt) { m.ev('lockout'); m.finish(2); return; } m.fault('needless lockout'); } m.hold = 0; }
      s.prog = clamp(m.hold / sign) * 0.9;
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 };
      if (i === 0) return { at: 0, press: f % 3 === 0 };
      if (i === 1) return { at: 1, look: m.stud, hold: !m.read };
      return doubt ? { at: 2, hold: f % 6 < 2, press: f % 6 === 0 } : { at: 2, hold: m.hold >= 0, look: 0 };
    };
    m.bad = (f = 0) => { const i = m.next; if (i === 0) return { at: 0, press: f % 3 === 0 }; if (i === 1) return { at: 1, look: -m.stud, hold: true }; return doubt ? { at: 2, hold: m.hold >= 0 } : { at: 2, hold: f % 6 < 2, press: f % 6 === 0 }; };
    m.view = () => ({ entries: m.entries, ground: m.ground, stud: +m.stud.toFixed(3) });
    m.panel = (i) => {
      if (i === 0) return { label: 'Buffer log', value: m.paged ? `entry ${m.paged}: ${m.entries[m.paged - 1]}` : `${m.entries.length} entries`, bar: m.paged / m.entries.length };
      if (i === 1) return { label: m.read ? `GROUND ${m.ground}` : 'Tester', value: m.read ? 'reading taken — let go' : `stud is to the ${m.stud > 0 ? 'left' : 'right'}`, bar: clamp(m.test) };
      const found = m.entries.filter(e => e !== 'CLEAN').length + (m.ground === 'FAULT' ? 1 : 0);
      return { label: 'Verdict', value: found ? `${found} doubtful reading` : 'all clean', bar: clamp(m.hold / sign) };
    };
    m.prompt = (i) => i === 0 ? 'Tap [E] to read the next buffer log entry' : i === 1 ? (m.read ? 'Reading taken — let go of [E]' : 'Aim at the ground stud and hold [E] with the tester') : 'Hold [E] to sign if all was clean; tap [E] for lock-out on any doubt';
    return m;
  },
});
