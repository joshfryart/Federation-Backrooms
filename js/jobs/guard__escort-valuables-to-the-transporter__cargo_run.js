// Guard: escort the valuables case to the transporter. Keep a grip on the handle the whole way (hold E). At each corridor corner turn your
// view round to the new heading and hold it there while you check the handle is tight. Turn too sharply with the case in hand and it swings
// out against the wall; let go and the case drops and has to be picked up again. At the pad keep holding, still and square, until the
// operator has signed, then let go to hand it over. Letting go before the receipt is an unsupervised handoff.
import { define, machine, room, rf, pick } from './kit.js';

export default define({
  job: { billet: 'guard', label: 'Escort valuables to the transporter', type: 'task:cargo_run' },
  title: 'Valuables case corner carry', dept: 'security', host: 'room', siteName: 'Corner', verb: 'Carry',
  how: 'Hold E to keep your grip on the case. At each corner turn your view smoothly to the new heading and hold it until the handle check fills. At the pad stay still until the receipt is signed, then let go.',
  keys: ['E hold: grip the case', 'turn smoothly round each corner'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'carry round corners', input: 'e-hold+look+turn',
    win: 'the sealed case carried through every corner on its new heading without a swing or a drop and released only once the pad receipt is signed',
    fail: 'cornering so sharply the case swings into the bulkhead, loosening the grip so it drops, or letting go at the pad before the receipt',
    rule: 'Keep E held. Turn your view to the marked heading at an easy pace and hold it there; a fast turn swings the case. At the pad, stand still with E held until signed, then release.' },
  rush: 'Swung the case along by its strap and left it on the pad.',
  captions: { swung: 'case clangs the bulkhead', dropped: 'case thuds on the deck', unsigned: 'operator calls after you' },
  says: { swung: 'Too sharp — the case swung into the wall. Turn smoothly.', dropped: 'You let go of the case. Pick it up and keep a grip.', unsigned: 'Wait for the receipt before you let go.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'First corner', prop: 'airlock_doors' }, { name: 'Second corner', prop: 'locker' }, { name: 'Transporter pad', prop: 'pad' }]), r = m.rnd;
    const fast = m.calm ? 2.2 : 1.7, need = m.calm ? 0.9 : 0.7, tol = m.calm ? 0.11 : 0.08;
    m.legs = [0, 1, 2].map(k => ({ head: k === 2 ? 0 : pick(r, [-1, 1]) * rf(r, 0.3, 0.48), dw: 0, grip: false }));
    m.cool = 0; m.sign = m.calm ? 1.4 : 1.1;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, L = m.legs[i];
      m.cool = Math.max(0, m.cool - dt);
      if (rel && L.grip) { if (i === 2 && L.dw >= m.sign) { m.finish(2); return; } m.fault(i === 2 && L.dw > 0.2 ? 'unsigned' : 'dropped'); L.dw = 0; L.grip = false; }
      if (!inp.hold) { s.prog = 0; return; } L.grip = true;
      if ((inp.turn || 0) > fast && m.cool <= 0) { m.fault('swung'); m.cool = 0.8; L.dw = 0; }
      const on = Math.abs((inp.look || 0) - L.head) < tol && (i < 2 || (inp.turn || 0) < 0.3);
      L.dw = on ? L.dw + dt : 0;
      if (i < 2 && L.dw >= need) { m.finish(i); return; }
      s.prog = Math.min(1, L.dw / (i < 2 ? need : m.sign)) * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const L = m.legs[i];
      if (i === 2 && L.dw >= m.sign) return { at: 2, hold: false, look: 0, turn: 0 }; return { at: i, hold: true, look: L.head, turn: i === 2 ? 0 : 0.8 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: true, look: 0, turn: f % 30 < 2 ? 3 : 0 });
    m.view = () => ({ heads: m.legs.map(L => +L.head.toFixed(2)) });
    m.panel = (i) => { const L = m.legs[i]; if (!L) return null;
      if (i === 2) return { label: L.dw >= m.sign ? 'SIGNED: let go' : 'Receipt', value: L.grip ? `signing ${Math.round(Math.min(1, L.dw / m.sign) * 100)} %` : 'grip the case', bar: Math.min(1, L.dw / m.sign) };
      return { label: `Heading ${L.head > 0 ? 'left' : 'right'}`, value: L.grip ? `handle check ${Math.round(Math.min(1, L.dw / need) * 100)} %` : 'grip the case', bar: Math.min(1, L.dw / need) }; };
    m.prompt = (i) => { const L = m.legs[i]; if (!L) return '';
      return i === 2 ? (L.dw >= m.sign ? 'Receipt signed: let go of [E] to hand over' : 'Hold [E] and stand still until the operator signs')
        : `Hold [E] and turn smoothly ${L.head > 0 ? 'left' : 'right'} to the new heading`; };
    return m;
  },
});
