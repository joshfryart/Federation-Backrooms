// Armory, cargo run: inspect and seal the cargo-bay hazard lockers. Tap E to open a locker and watch its pressure gauge for a moment: a sound
// locker's needle sits in the green band; a leaking one starts in the band and sags out of it. Then either latch the lid (tap E facing the
// locker) or, for a leaker, turn to the hazard log hanging to your left and tap E there to report it instead. A latched lid is sealed by pressing
// the tape flat along the seam with your palm: swing the view across at a steady sweep (too fast and the tape bubbles).
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'armory', label: 'Inspect and seal cargo-bay hazard lockers', type: 'task:cargo_run' },
  title: 'Hazard locker gauge, latch and tape', dept: 'security', host: 'room', siteName: 'Locker', verb: 'Seal',
  how: 'Tap E to open the locker and watch the gauge for a second or so. Needle holding in the green band: tap E at the locker to latch it, then swing the view steadily to press the seal tape flat. Needle sagging out: look left to the hazard log and tap E to report it, and do not seal it.',
  keys: ['E tap: open / latch', 'look left + E: report leak', 'swing: press the tape'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'latch and tape', input: 'e-tap+look+swing', win: 'every hazard locker gauge watched, sound lockers latched and taped flat along the seam, and every leaking one reported to the log unsealed',
    fail: 'latching before the gauge has been watched, sealing a leaking locker, reporting a sound one, or pressing the tape so fast it bubbles',
    rule: 'Open with E and watch the needle at least a second. Holding in the band: tap E facing the locker, then swing steadily until the tape is down. Sagging out: look left at the log and tap E.' },
  rush: 'Slapped tape over every lid seam and signed the tags.',
  captions: { 'latched unread': 'latch drops', 'sealed a leak': 'hiss under the tape', 'false leak': 'log page turns', bubbled: 'tape crackles' },
  says: { 'latched unread': 'You latched before reading the gauge. Watch the needle for a second first.', 'sealed a leak': 'That needle was sagging: it leaks. Report it on the log to your left; never seal a leaker.',
    'false leak': 'That gauge held steady in the band. Latch it and tape it.', bubbled: 'Too fast: the tape bubbled. Press it along at a steady sweep.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Hazard locker H-1', prop: 'crate' }, { name: 'Hazard locker H-2', prop: 'samplefridge' }, { name: 'Hazard locker H-3', prop: 'crate' }]), r = m.rnd;
    const leak = new Set(shuffle(r, [0, 1, 2]).slice(0, r() < 0.6 ? 1 : 2)), watchT = 1.2, fastS = m.calm ? 2.0 : 1.6, logL = 0.32;
    m.lk = [0, 1, 2].map(i => ({ leak: leak.has(i), v0: rf(r, 0.45, 0.62), sag: rf(r, 0.25, 0.4), st: 'shut', w: 0, tape: 0, fast: false }));
    const BAND = [0.38, 0.7], L = () => m.lk[m.next];
    const needle = (k) => k.leak ? k.v0 - k.sag * k.w : k.v0 + Math.sin(k.w * 7) * 0.02;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const k = L(), look = inp.look || 0, sw = Math.abs(inp.swing || 0);
      if (k.st === 'shut' && inp.press) { k.st = 'open'; k.w = 0; return; }
      if (k.st === 'open') {
        k.w += dt;
        if (inp.press) {
          if (k.w < watchT) m.fault('latched unread');
          else if (look > logL) { if (k.leak) { m.ev('reported'); m.finish(m.next); return; } m.fault('false leak'); }
          else if (Math.abs(look) < 0.2) { if (k.leak) m.fault('sealed a leak'); else { k.st = 'tape'; m.ev('latched'); } }
        }
      } else if (k.st === 'tape') {
        if (sw > fastS) { if (!k.fast) { k.fast = true; m.fault('bubbled'); k.tape = Math.max(0, k.tape - 0.3); } }
        else { k.fast = false; if (sw > 0.4) k.tape += sw * dt * 0.7; }
        if (k.tape >= 1) { m.ev('sealed'); m.finish(m.next); return; }
      }
      s.prog = s.done ? 1 : k.st === 'tape' ? 0.4 + clamp(k.tape) * 0.5 : k.st === 'open' ? 0.2 : 0;
    };
    m.hint = (f = 0) => {
      const k = L(); if (!k) return { at: -1 };
      if (k.st === 'shut') return { at: m.next, press: f % 4 === 0, hold: f % 4 === 0 };
      if (k.st === 'open') { if (k.w < watchT + 0.15) return { at: m.next, look: k.leak ? 0.45 : 0 }; return { at: m.next, look: k.leak ? 0.45 : 0, press: true, hold: true }; }
      return { at: m.next, swing: f % 30 < 15 ? 1.1 : -1.1 };
    };
    m.bad = (f = 0) => ({ at: m.next, press: f % 6 === 0, hold: f % 6 === 0, look: 0 });
    m.view = () => ({ lk: m.lk.map(k => [k.leak, +k.v0.toFixed(2)]) });
    m.panel = (i) => {
      const k = m.lk[i]; if (!k) return null;
      if (k.st === 'shut') return { label: 'Locker shut', value: 'tap to open', bar: 0, band: BAND };
      if (k.st === 'open') { const v = clamp(needle(k)); return { label: `Pressure gauge (${k.w.toFixed(1)} s)`, value: v >= BAND[0] && v <= BAND[1] ? 'in green band' : 'OUT OF BAND', bar: v, band: BAND }; }
      return { label: 'Seal tape', value: `${Math.round(clamp(k.tape) * 100)} % pressed`, bar: k.tape };
    };
    m.prompt = (i) => {
      const k = m.lk[i]; if (!k) return '';
      return k.st === 'shut' ? 'Tap [E] to open the locker' : k.st === 'open' ? 'Watch the needle: holding in band → tap [E] to latch; sagging out → look left at the hazard log and tap [E]'
        : 'Swing the view steadily along the seam to press the tape flat';
    };
    return m;
  },
});
