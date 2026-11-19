// CMO: stand ready for injuries during drills (shakedown). Wait at the biobed with the hypospray charged, watching the drill feed. Nothing
// to do until a simulated casualty is called: then tap E at once to take them onto the bed (inside the call window; late is a failed
// response, early is jumping the drill). Then hold your hand until the dose order is read out, and only then tap E to give the drill dose.
import { define, machine, room, rf } from './kit.js';

export default define({
  job: { billet: 'cmo', label: 'Stand ready for injuries during drills', type: 'task:shakedown' },
  title: 'Drill casualty call standby', dept: 'medical', host: 'room', siteName: 'Casualty', verb: 'Respond', item: 'hypospray',
  how: 'Stand at the biobed and wait. When the drill feed calls a casualty tap E straight away to take them on; then wait for the dose order before you tap E again to give the drill dose.',
  keys: ['E tap: take the casualty', 'E tap after the order: dose'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'answer the call', input: 'e-tap', win: 'three drill casualties taken onto the biobed inside the call window and dosed only after the order was read out',
    fail: 'reacting before the casualty is called, answering the call late, or giving the dose before the order',
    rule: 'Long quiet waits, then a casualty call: tap E within the window to take them on. A second, separate wait for the dose order: tap E only once it has been read out. Any tap early is a fault.' },
  rush: 'Stood by the door with the hypo and let the nurse take the drill casualties.',
  captions: { 'jumped the drill': 'drill officer: not yet', 'late response': 'drill officer marks a late response', 'dose without order': 'drill officer: no order given' },
  says: { 'jumped the drill': 'No casualty has been called yet.', 'late response': 'Too slow — the casualty waited.', 'dose without order': 'Wait for the dose order before you dose.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Drill casualty 1', prop: 'biobed' }, { name: 'Drill casualty 2', prop: 'biobed' }, { name: 'Drill casualty 3', prop: 'biobed' }]), r = m.rnd;
    const win = m.calm ? 1.4 : 1.0;
    m.cas = m.sites.map(() => ({ quiet: rf(r, 1.0, 2.8), order: rf(r, 0.8, 2.0) }));
    m.ph = 0; m.w = 0;   // ph 0 quiet, 1 called, 2 waiting for the order, 3 order given
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, c = m.cas[i]; m.w += dt;
      if (m.ph === 0) { if (inp.press) { m.fault('jumped the drill'); return; } if (m.w >= c.quiet) { m.ph = 1; m.w = 0; } }
      else if (m.ph === 1) { if (inp.press) { m.ph = 2; m.w = 0; } else if (m.w > win) { m.fault('late response'); m.ph = 0; m.w = 0; c.quiet = 1.0; } }
      else if (m.ph === 2) { if (inp.press) { m.fault('dose without order'); return; } if (m.w >= c.order) { m.ph = 3; m.w = 0; } }
      else if (inp.press) { m.finish(i); m.ph = 0; m.w = 0; return; }
      s.prog = [0, 0.3, 0.5, 0.8][m.ph];
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, press: (m.ph === 1 && m.w > 0.2) || m.ph === 3 }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 12 === 0 });
    m.view = () => ({ c: m.cas.map(c => [+c.quiet.toFixed(2), +c.order.toFixed(2)]) });
    m.panel = (i) => { if (!m.cas[i]) return null; return [{ label: 'Drill feed', value: 'standing by… no call', bar: 0 }, { label: 'CASUALTY CALLED', value: 'take them on: tap [E] now', bar: 1 - m.w / win },
      { label: 'Casualty on the bed', value: 'airway clear · awaiting dose order', bar: 0 }, { label: 'DOSE ORDER READ', value: 'give the drill dose: tap [E]', bar: 1 }][m.ph]; };
    m.prompt = () => ['Wait at the biobed for the drill call — do not move early', 'Casualty called: tap [E] now', 'Hold off: wait for the dose order', 'Dose order given: tap [E] with the hypospray'][m.ph];
    return m;
  },
});
