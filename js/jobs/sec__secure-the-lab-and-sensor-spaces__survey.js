// Security, survey: secure the lab and sensor spaces. Every sample case, the sensor rack cover and finally the lab door get the same test:
// grip the handle (hold E) and rattle it hard, left-right-left (swing the view back and forth). A latched one holds for three rattles. One
// that is not properly latched lifts on the first rattle: stop at once, let go, tap E to press the latch home, then rattle it again.
// Rattling on after it lifts forces it open and spills the samples.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Secure the lab and sensor spaces', type: 'task:survey' },
  title: 'Rattle test before lockup', dept: 'security', host: 'room', siteName: 'Latch', verb: 'Rattle',
  how: 'Hold E on each handle and swing your view left-right to rattle it three times. If it LIFTS, let go, tap E to press the latch home, then rattle again.',
  keys: ['E hold + swing left/right: rattle', 'E tap: press a lifted latch home'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'rattle-test', input: 'e-hold+swing+e-tap', win: 'each case, the rack cover and the lab door rattled three times without lifting, every loose latch pressed home first',
    fail: 'rattling on after a latch lifts so the case or door is forced open',
    rule: 'Grip with E and swing hard one way then the other; each reversal is a rattle. Three rattles that hold pass it. LIFTS on the panel: release, tap E, rattle again.' },
  rush: 'Flicked every latch shut and pulled the lab door to behind you.',
  captions: { 'forced open': 'case lid bangs open', lifts: 'latch clacks' },
  says: { 'forced open': 'It lifted and you kept rattling — the case is forced open. Stop and press the latch home.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Sample case 1', prop: 'labbench' }, { name: 'Sample case 2', prop: 'samplefridge' }, { name: 'Sensor rack cover', prop: 'servers' }, { name: 'Lab door', prop: 'airlock_doors' }]), r = m.rnd;
    const loose = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2))), thr = m.calm ? 0.8 : 1.0;
    m.lt = m.sites.map((_, i) => ({ loose: loose.has(i), lifted: false, n: 0, side: 0, heldPrev: false }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, L = m.lt[i];
      if (inp.press && L.lifted && !L.heldPrev) { L.lifted = false; L.loose = false; L.n = 0; L.side = 0; m.ev('pressed home', { site: i }); }
      if (inp.hold) { const sw = inp.swing || 0;
        if (Math.abs(sw) > thr && Math.sign(sw) !== L.side) { if (L.side !== 0) { L.n++;
          if (L.lifted) { m.fault('forced open'); }
          else if (L.loose) { L.lifted = true; m.ev('lifts', { site: i }); }
          else if (L.n >= 3) { L.heldPrev = true; m.finish(i); return; } }
          L.side = Math.sign(sw); } }
      else { if (!L.lifted) L.n = 0; L.side = 0; }
      L.heldPrev = !!inp.hold; s.prog = L.lifted ? 0.1 : clamp(L.n / 3) * 0.9;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const L = m.lt[i];
      if (L.lifted) return L.heldPrev ? { at: i } : { at: i, press: true, hold: true };
      return { at: i, hold: true, swing: Math.floor(f / 6) % 2 ? 1.6 : -1.6 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: true, swing: Math.floor(f / 6) % 2 ? 1.6 : -1.6 });
    m.view = () => ({ loose: m.lt.map(L => L.loose) });
    m.panel = (i) => { const L = m.lt[i]; if (!L) return null; return { label: L.lifted ? 'LIFTS — stop!' : 'Holding', value: `${L.n} / 3 rattles`, bar: clamp(L.n / 3), band: [0.99, 1] }; };
    m.prompt = (i) => { const L = m.lt[i]; if (!L) return ''; return L.lifted ? (L.heldPrev ? 'It lifted! Let go of [E]…' : 'Tap [E] to press the latch home') : 'Hold [E] and swing your view left-right to rattle it three times'; };
    return m;
  },
});
