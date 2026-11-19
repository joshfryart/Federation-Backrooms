// Botanist, shakedown: verify nutrient pump power draw. At each pump on the bench: tap E to close the clamp meter jaw round the lead while the
// pump is still off, tap E to start the pump on the bench panel, then wait. The start-up surge kicks the needle high and it rings down toward
// the steady running draw; tap E a third time to log the reading only once the needle has stopped moving. Logging while it is still swinging
// records the surge, not the draw (a fault: the pump is stopped and run again). The log compares each draw with the spec plate.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'bot', label: 'Verify nutrient pump power draw', type: 'task:shakedown' },
  title: 'Clamp meter steady-draw read', dept: 'sciences', host: 'room', siteName: 'Pump', verb: 'Read',
  how: 'At each pump tap E to clamp the meter on the lead, tap E to start the pump, then wait for the surge to die away and tap E to log the steady draw.',
  keys: ['E tap: clamp / start / log'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'clamp and read', input: 'e-tap', win: 'every pump clamped cold, started, and its steady running draw logged against the spec plate',
    fail: 'logging the start-up surge while the needle is still ringing instead of the steady draw',
    rule: 'Three taps per pump: clamp, start, log. After the start the needle overshoots and oscillates; the log only counts once the needle sits still.' },
  rush: 'Copied the spec plate figures into the slate without clamping anything.',
  captions: { surge: 'needle twitches, slate rejects the figure' },
  says: { surge: 'That was the start-up surge, not the draw. Stop, restart and wait for the needle to sit still.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pump A lead', prop: 'workbench' }, { name: 'Pump B lead', prop: 'pumpskid' }, { name: 'Pump C lead', prop: 'workbench' }]), r = m.rnd;
    const still = m.calm ? 0.05 : 0.035;
    m.pumps = m.sites.map(() => { const spec = rf(r, 2.4, 4.2); return { spec, draw: spec * rf(r, 0.85, 1.2), st: 0, a: 0, v: 0, z: rf(r, 1.8, 3.2), w: rf(r, 7, 10), logged: null }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, p = m.pumps[i];
      if (p.st === 2) { const f = -p.w * p.w * (p.a - p.draw) - p.z * p.v; p.v += f * dt; p.a += p.v * dt; }
      if (inp.press) {
        if (p.st === 0) { p.st = 1; m.ev('clamp', { site: i }); }
        else if (p.st === 1) { p.st = 2; p.a = p.draw * 2.4; p.v = 0; m.ev('start', { site: i }); }
        else if (Math.abs(p.v) < still * 10 && Math.abs(p.a - p.draw) < still * p.draw) { p.logged = +p.a.toFixed(2); m.finish(i); return; }
        else { m.fault('surge'); p.st = 1; p.a = 0; p.v = 0; }
      }
      s.prog = p.st === 2 ? clamp(0.4 + 0.5 * (1 - Math.abs(p.a - p.draw) / (p.draw * 1.4)), 0.4, 0.9) : p.st * 0.2;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pumps[i];
      if (p.st < 2) return { at: i, press: m.t - (m.lastP ?? -9) > 0.2 ? (m.lastP = m.t, true) : false };
      return { at: i, press: Math.abs(p.v) < still * 5 && Math.abs(p.a - p.draw) < still * p.draw * 0.5 }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 4 === 0 });
    m.view = () => ({ pumps: m.pumps.map(p => [+p.spec.toFixed(2), +p.draw.toFixed(2)]) });
    m.panel = (i) => { const p = m.pumps[i]; if (!p) return null; const lab = ['Jaw open', 'Clamped, pump off', 'Needle'][p.st];
      return { label: `${lab} · spec ${p.spec.toFixed(1)} A`, value: p.st === 2 ? `${p.a.toFixed(2)} A` : '—', bar: clamp(p.a / (p.spec * 2.6)) }; };
    m.prompt = (i) => { const p = m.pumps[i]; return !p ? '' : ['Tap [E] to clamp the meter jaw round the lead', 'Tap [E] to start the pump', 'Wait for the needle to stop moving, then tap [E] to log the draw'][p.st]; };
    return m;
  },
});
