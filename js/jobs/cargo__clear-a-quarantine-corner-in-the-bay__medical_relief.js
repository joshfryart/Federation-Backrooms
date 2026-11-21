// Cargo: clear a quarantine corner in the bay. Glove up first (hold E at the glove locker). Then clear each crate: a SEALED crate is lifted with a
// quick tap of E; a LEAKING crate must be bagged by holding E for a full second. Tapping a leaker spills it; bagging a sound crate wastes the bag.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Clear a quarantine corner in the bay', type: 'task:medical_relief' },
  title: 'Lift or bag by crate state', dept: 'services', host: 'room', siteName: 'Crate', verb: 'Clear',
  how: 'Hold E at the glove locker to glove up. At each crate read the panel: SEALED, tap E to lift it; LEAKING, hold E about a second to bag it.',
  keys: ['E hold: glove up / bag a leaker', 'E tap: lift a sealed crate'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'lift or bag', input: 'e-tap+e-hold',
    win: 'gloves on, then every quarantine crate lifted when sealed or bagged when leaking',
    fail: 'tapping a leaking crate so it spills, or bagging a sound crate',
    rule: 'After gloving up, read each crate on the panel. A sealed crate takes a quick tap of E to lift. A leaking crate needs E held for a full second to bag it. The wrong action spills or wastes the bag.' },
  rush: 'Shoved the crates out of the corner bare-handed.',
  captions: { spill: 'liquid splashes', 'wasted bag': 'bag rips' },
  says: { spill: 'You lifted a leaking crate: it spilled.', 'wasted bag': 'That crate was sealed: no bag needed.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Glove locker', prop: 'locker' }, { name: 'Crate 1', prop: 'crate' }, { name: 'Crate 2', prop: 'pallet_loaded' }, { name: 'Crate 3', prop: 'shelving' }]), r = m.rnd;
    m.leak = [false, r() < 0.7, r() < 0.5, r() < 0.5]; if (!m.leak.some(Boolean)) m.leak[ri(r, 1, 3)] = true; m.hd = 0;
    const need = m.calm ? 0.8 : 1.0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { m.hd = 0; return; } const i = m.next;
      if (inp.hold) m.hd += dt;
      if (rel) { const d = m.hd; m.hd = 0;
        if (i === 0) { if (d >= 0.7) m.finish(0); }
        else if (d < 0.45) { if (m.leak[i]) m.fault('spill'); else m.finish(i); }
        else if (d >= need) { if (m.leak[i]) m.finish(i); else m.fault('wasted bag'); } }
      s.prog = s.done ? 1 : clamp(m.hd / need * 0.9, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, hold: m.hd < (i === 0 ? 0.8 : m.leak[i] ? need + 0.1 : 0.1) }; };
    m.bad = () => { const i = m.next; return { at: i, hold: m.hd < (i === 0 ? 0.8 : 0.1) }; };
    m.view = () => ({ leak: m.leak.map(Number) });
    m.panel = (i) => i === 0 ? { label: 'Gloves', value: 'hold [E] to glove up', bar: clamp(m.hd / 0.7, 0, 1) } : { label: `Crate ${i}`, value: m.leak[i] ? 'LEAKING: hold to bag' : 'SEALED: tap to lift', bar: clamp(m.hd / need, 0, 1), band: m.leak[i] ? [1 - 0.05, 1] : undefined };
    m.prompt = (i) => i === 0 ? 'Hold [E] to pull the gloves on' : m.leak[i] ? 'It is leaking: hold [E] for a second to bag it' : 'It is sealed: tap [E] to lift it';
    return m;
  },
});
