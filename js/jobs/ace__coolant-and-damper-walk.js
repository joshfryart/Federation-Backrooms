// Assistant Chief Engineer: coolant and damper walk. At each damper casing, hold E to feel the actuator for a full second. A sticking louver
// shows as a STUTTER in the buzz before any indicator moves: let go and tap E within a moment to hang the red tag. A smooth buzz needs no tag;
// tagging a sound damper is a false tag, and walking off from a stutter leaves the louver untagged.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Coolant and damper walk', type: 'loop' },
  title: 'Feel the stutter, then tag it', dept: 'engineering', host: 'room', siteName: 'Damper', verb: 'Feel',
  how: 'Hold E on each casing for about a second to feel the buzz. If it stutters, let go and tap E to tag it; a smooth buzz needs no tag.',
  keys: ['E hold: feel the casing', 'E tap after letting go: red tag'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'feel then tag', input: 'e-hold+e-tap',
    win: 'three damper casings felt for a full second, each stuttering louver tagged and each smooth one left untagged',
    fail: 'letting go too soon, tagging a smooth casing, or leaving a stuttering louver without its red tag',
    rule: 'Hold E for 1.2 s and read the buzz. A stutter means a sticking louver: release then tap E within two seconds. Smooth buzz: just release.' },
  rush: 'Glanced at the position indicators and logged them without touching a casing.',
  captions: { 'short feel': 'casing not felt long enough', 'false tag': 'red tag on a sound damper', untagged: 'sticking louver left untagged' },
  says: { 'short feel': 'Hold for a full second to feel the pattern.', 'false tag': 'That one buzzed smooth. No tag needed.', untagged: 'It stuttered. Tap E to hang the red tag.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Damper 1', prop: 'heatexch' }, { name: 'Damper 2', prop: 'pumpskid' }, { name: 'Damper 3', prop: 'relayrack' }]), r = m.rnd, need = m.calm ? 1.5 : 1.2;
    const bad = Math.floor(r() * 3), bad2 = r() < 0.4 ? (bad + 1) % 3 : -1;
    m.dm = m.sites.map((_, i) => ({ stut: i === bad || i === bad2, ph: rf(r, 0, 6), h: 0, wait: -1 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const d = m.dm[m.next];
      if (d.wait >= 0) { d.wait += dt; if (inp.press && !rel) { if (d.stut) m.finish(m.next); else m.fault('false tag'); d.wait = -1; d.h = 0; return; } if (d.wait > 2) { m.fault('untagged'); d.wait = -1; d.h = 0; } return; }
      if (inp.hold) d.h += dt;
      if (rel) { if (d.h < need) { m.fault('short feel'); d.h = 0; } else if (d.stut) d.wait = 0; else { m.finish(m.next); return; } }
      s.prog = clamp(d.h / need) * 0.9;
    };
    m.hint = (f = 0) => { const d = m.dm[m.next]; if (!d) return { at: -1 }; if (d.wait >= 0) return f % 2 ? { at: m.next, hold: false } : { at: m.next, hold: true, press: true }; return { at: m.next, hold: d.h < need + 0.05 }; };
    m.bad = () => ({ at: m.next, hold: m.dm[m.next] && m.dm[m.next].h < 0.3 });
    m.view = () => ({ stut: m.dm.map(d => [d.stut, +d.ph.toFixed(2)]) });
    m.panel = (i) => { const d = m.dm[i]; if (!d) return null; const st = d.h > 0.5 && d.stut && Math.sin(d.h * 14 + d.ph) > 0.2;
      return { label: d.wait >= 0 ? 'STUTTER - tap E to tag' : d.h < 0.4 ? 'Buzz: reading' : d.stut ? (st ? 'Buzz: ..-. stutter' : 'Buzz: -- gap') : 'Buzz: smooth', value: `${d.h.toFixed(1)} s`, bar: clamp(d.h / need) }; };
    m.prompt = (i) => (m.dm[i] && m.dm[i].wait >= 0 ? 'It stuttered: tap [E] to hang the red tag' : 'Hold [E] on the casing to feel the buzz');
    return m;
  },
});
