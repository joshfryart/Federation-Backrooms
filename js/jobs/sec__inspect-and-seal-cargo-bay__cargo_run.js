// Security: inspect and seal cargo bay. At each crate hold E to run a hand over the seal and strap for most of a second. An intact seal is done on
// release. A broken seal or strap shows BROKEN: let go, then tap E three times to re-latch it before the two seconds run out. The bay door
// wheel (hold E) only turns once every crate is sound, so a crate left open or a latch left broken is the failure.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Inspect and seal cargo bay', type: 'task:cargo_run' },
  title: 'Check the seal, re-latch the break', dept: 'security', host: 'room', siteName: 'Crate', verb: 'Check',
  how: 'Hold E at each crate to check its seal. If it reads BROKEN, let go and tap E three times to re-latch. Then hold E at the door wheel to seal the bay.',
  keys: ['E hold: check the seal', 'E tap x3: re-latch a broken one', 'E hold at the door wheel'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'inspect then relatch', input: 'e-hold+e-tap',
    win: 'three crate seals checked for a full hold, every broken seal re-latched with three taps, then the bay door wheel turned',
    fail: 'a seal only glanced at, a broken seal left without three taps in time, or the door wheel released early',
    rule: 'Hold E for 0.8 s to check a seal. BROKEN seals need three taps of E within two seconds after you let go. Then hold at the door wheel.' },
  rush: 'Walked the bay, trusted the manifest slate, and sealed the door.',
  captions: { glanced: 'seal not checked', 'open crate': 'crate left open', 'wheel slipped': 'door wheel slipped' },
  says: { glanced: 'You only glanced at that seal. Hold E a little longer.', 'open crate': 'The broken seal was never re-latched. Tap E three times.', 'wheel slipped': 'The door wheel needs a full turn. Keep holding.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crate 1', prop: 'crate' }, { name: 'Crate 2', prop: 'crate' }, { name: 'Crate 3', prop: 'crate' }, { name: 'Bay door wheel', prop: 'airlock_doors' }]), r = m.rnd, need = m.calm ? 1 : 0.8, win = m.calm ? 3 : 2;
    const br = Math.floor(r() * 3), br2 = r() < 0.4 ? (br + 1) % 3 : -1;
    m.cr = m.sites.map((_, i) => ({ broken: i === br || i === br2, tens: ri(r, 40, 99), h: 0, w: -1, tap: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const c = m.cr[m.next], door = m.next === 3;
      if (c.w >= 0) { c.w += dt; if (inp.press) c.tap++; if (c.tap >= 3) { m.finish(m.next); return; } if (c.w > win) { m.fault('open crate'); c.w = -1; c.h = 0; c.tap = 0; } return; }
      if (inp.hold) c.h += dt; const lim = door ? 1.3 : need;
      if (rel) { if (c.h < lim) { m.fault(door ? 'wheel slipped' : 'glanced'); c.h = 0; } else if (c.broken) { c.w = 0; c.tap = 0; } else { m.finish(m.next); return; } }
      s.prog = clamp(c.h / lim) * 0.9;
    };
    m.hint = (f = 0) => { const c = m.cr[m.next]; if (!c) return { at: -1 }; if (c.w >= 0) return f % 2 ? { at: m.next, hold: false } : { at: m.next, hold: true, press: true }; return { at: m.next, hold: c.h < (m.next === 3 ? 1.3 : need) + 0.05 }; };
    m.bad = () => ({ at: m.next, hold: m.cr[m.next] && m.cr[m.next].h < 0.2 });
    m.view = () => ({ br: m.cr.map(c => [c.broken, c.tens]) });
    m.panel = (i) => { const c = m.cr[i]; if (!c) return null; if (i === 3) return { label: 'Door wheel', value: `${c.h.toFixed(1)} s`, bar: clamp(c.h / 1.3) };
      return { label: c.w >= 0 ? `BROKEN - taps ${c.tap} / 3` : c.h < need ? 'Seal: checking' : c.broken ? 'Seal: BROKEN' : `Seal: intact, strap ${c.tens}%`, value: `${c.h.toFixed(1)} s`, bar: clamp(c.h / need) }; };
    m.prompt = (i) => (m.cr[i] && m.cr[i].w >= 0 ? 'Broken seal: tap [E] three times to re-latch' : i === 3 ? 'Hold [E] to turn the door wheel' : 'Hold [E] to check the seal and strap');
    return m;
  },
});
