// Doc: prepare treatment batches and quarantine bay. Two syringes are drawn millilitre by millilitre (tap E per mL, to the batch sheet line, then
// hold E to cap and label), the quarantine door is sealed with a long hold, and the air filter is tapped round its settings to CLOSED and confirmed.
// An overdrawn tap, a capped short dose or a confirm on an open filter is a fault.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Prepare treatment batches and quarantine bay', type: 'task:medical_relief' },
  title: 'Draw doses and seal the bay', dept: 'medical', host: 'room', siteName: 'Station', verb: 'Prepare',
  how: 'At a vial bench tap E once per millilitre up to the sheet line, then hold E to cap it. Hold E at the bay door until it seals. At the filter tap E to step to CLOSED, then hold to confirm.',
  keys: ['E tap: one millilitre / next setting', 'E hold: cap, seal, confirm'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'draw by millilitre', input: 'e-tap+e-hold', win: 'two syringes drawn exactly to the batch sheet volume and capped, the quarantine door sealed and the air filter confirmed closed',
    fail: 'overdrawing past the sheet line, capping a short dose, or confirming the filter while it is not closed',
    rule: 'Dose bench: each tap draws one millilitre; stop on the sheet figure and hold to cap. Door: hold until the seal bar fills. Filter: tap to cycle OPEN, AUTO, CLOSED; hold to confirm on CLOSED.' },
  rush: 'Eyeballed the syringes and pulled the quarantine door to without checking the filter.',
  captions: { overdrawn: 'syringe squeaks', 'short dose': 'cap clicks', 'filter open': 'filter whine' },
  says: { overdrawn: 'Past the line. That dose is spoiled, start the syringe again.', 'short dose': 'Capped short of the line.', 'filter open': 'The filter is not on CLOSED.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Dose A', prop: 'workbench' }, { name: 'Dose B', prop: 'workbench' }, { name: 'Quarantine door', prop: 'airlock_doors' }, { name: 'Filter switch', prop: 'console' }]), r = m.rnd;
    m.want = [ri(r, 2, 7), ri(r, 2, 7)]; m.d = [0, 0]; m.seal = 0; m.set = ri(r, 0, 1); m.hd = 0; m.lock = -1;
    const names = ['OPEN', 'AUTO', 'CLOSED'];
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { m.hd = 0; return; } const i = m.next;
      if (inp.hold && m.lock !== i) { m.hd += dt;
        if (i === 2) { m.seal = clamp(m.seal + dt / 1.3); if (m.seal >= 1) { m.lock = i; m.finish(i); return; } }
        else if (m.hd >= 0.5) { m.lock = i; m.hd = 0;
          if (i < 2) { if (m.d[i] === m.want[i]) m.finish(i); else { m.fault('short dose'); m.d[i] = 0; } }
          else if (m.set === 2) m.finish(i); else m.fault('filter open'); return; } }
      if (rel) { const tap = m.hd > 0 && m.hd < 0.3 && m.lock !== i; m.hd = 0; if (!inp.hold) m.lock = -1; if (i === 2) m.seal = 0;
        if (tap && i < 2) { if (m.d[i] >= m.want[i]) { m.fault('overdrawn'); m.d[i] = 0; } else m.d[i]++; } else if (tap && i === 3) m.set = (m.set + 1) % 3; }
      s.prog = s.done ? 1 : i < 2 ? m.d[i] / m.want[i] * 0.8 : i === 2 ? m.seal : m.set / 2 * 0.8;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 };
      const holdIt = i < 2 ? m.d[i] === m.want[i] : i === 2 ? true : m.set === 2; return { at: i, hold: holdIt ? true : f % 6 < 3 }; };
    m.bad = (f = 0) => ({ at: Math.max(0, m.next), hold: f % 25 < 20 });
    m.view = () => ({ want: m.want, set: m.set });
    m.panel = (i) => i < 2 ? { label: `Dose ${'AB'[i]}: sheet ${m.want[i]} mL`, value: `${m.d[i]} mL drawn`, bar: m.d[i] / m.want[i], band: [1, 1] } : i === 2 ? { label: 'Door seal', value: `${Math.round(m.seal * 100)} %`, bar: m.seal } : i === 3 ? { label: 'Air filter', value: names[m.set], bar: m.set / 2 } : null;
    m.prompt = (i) => i < 2 ? 'Tap [E] per millilitre; hold [E] to cap on the line' : i === 2 ? 'Hold [E] until the door seals' : 'Tap [E] to step the filter to CLOSED, hold to confirm';
    return m;
  },
});
