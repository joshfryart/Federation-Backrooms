// Computer specialist: full core diagnostic and stress test. At each core stack, step the load dial up to the stress setting on the test card one
// notch per tap of E. After every notch the stack temperature climbs and settles: tap again only once the gauge reads SETTLED, or you overdrive
// the stack. At the stress notch keep your hands off for the card's full soak time (a tap stops the run early) so the true peak is recorded.
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'comp', label: 'Full core diagnostic and stress test', type: 'task:shakedown' },
  title: 'Stress dial step-and-soak', dept: 'operations', host: 'room', siteName: 'Stack', verb: 'Stress',
  how: 'At each stack tap E to turn the load dial up one notch. Wait until the temperature gauge reads SETTLED before the next tap. At the stress notch on the card, do not touch it until the soak timer ends and the peak is logged.',
  keys: ['E tap: one notch up', 'hands off during the soak'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'step and soak', input: 'e-tap', win: 'every core stack stepped notch by notch to the card stress setting and soaked for the full card time with its peak logged',
    fail: 'tapping the next notch while the temperature is still climbing, or stopping the stress run before the card time is up',
    rule: 'Each tap adds one load notch; the temperature then rises and levels off. Tap only while the gauge reads SETTLED. At the card notch, tap nothing until the soak bar is full.' },
  rush: 'Wound the load straight up and stopped as soon as the first stack looked fine.',
  captions: { overdriven: 'stack overheat warble', 'stopped early': 'stress run halted' },
  says: { overdriven: 'Still climbing — wait for SETTLED before the next notch.', 'stopped early': 'You stopped the run before the card time; the peak was not reached.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Stack 1 diagnostic panel', prop: 'servers' }, { name: 'Stack 2 diagnostic panel', prop: 'relayrack' }, { name: 'Stack 3 diagnostic panel', prop: 'servers' }]), r = m.rnd;
    const tol = m.calm ? 3 : 2, soak = m.calm ? 2.4 : 2.0;
    m.stk = m.sites.map(() => ({ N: ri(r, 3, 4), base: ri(r, 28, 36), stepT: rf(r, 9, 14), tau: rf(r, 0.3, 0.45), n: 0, T: 0, soak: 0, peak: 0 }));
    m.stk.forEach(s => { s.T = s.base; s.peak = s.base; });
    const target = (s) => s.base + s.n * s.stepT, settled = (s) => Math.abs(s.T - target(s)) < tol;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const st = m.cur(inp); if (!st) return; const i = m.next, s = m.stk[i];
      s.T += (target(s) - s.T) * Math.min(1, dt / s.tau); s.peak = Math.max(s.peak, s.T);
      if (inp.press) {
        if (s.n >= s.N) { if (s.soak > 0) { m.fault('stopped early'); s.soak = 0; } }
        else if (!settled(s)) m.fault('overdriven'); else s.n++;
      }
      if (s.n >= s.N && settled(s)) { s.soak += dt; if (s.soak >= soak) { m.ev('peak', { site: i, peak: Math.round(s.peak) }); m.finish(i); return; } }
      st.prog = clamp((s.n / s.N) * 0.6 + (s.soak / soak) * 0.38, 0, 0.98);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const s = m.stk[i]; return { at: i, press: s.n < s.N && settled(s) }; };
    m.bad = () => ({ at: m.next, press: true });
    m.view = () => ({ s: m.stk.map(s => [s.N, s.base, +s.stepT.toFixed(1)]) });
    m.panel = (i) => {
      const s = m.stk[i]; if (!s) return null; const atS = s.n >= s.N;
      return { label: `Load ${s.n}/${s.N} · ${settled(s) ? '■ SETTLED' : '▲ climbing'}`, value: atS ? `soak ${s.soak.toFixed(1)} / ${soak} s · peak ${Math.round(s.peak)} °C` : `${Math.round(s.T)} °C`, bar: atS ? s.soak / soak : clamp((s.T - s.base) / (s.N * s.stepT)) };
    };
    m.prompt = (i) => { const s = m.stk[i]; return !s ? '' : s.n >= s.N ? 'Stress notch reached — hands off until the soak ends' : settled(s) ? 'Settled: tap [E] for the next load notch' : 'Temperature still climbing — wait'; };
    return m;
  },
});
