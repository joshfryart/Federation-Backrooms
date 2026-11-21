// Assistant Chief Engineer: boost sickbay power and life support. Turn the allocation knob (hold E and swing the view left) to raise the
// medical allocation. Each turn pulls the air handler down: the O2 readout falls while you turn and recovers when you stop. Keep O2 above
// the starved mark while you climb to the target on both panels; turning on regardless starves the air handler.
import { define, machine, room, clamp } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Boost sickbay power and life support', type: 'task:medical_relief' },
  title: 'Turn the knob, watch the oxygen', dept: 'engineering', host: 'room', siteName: 'Panel', verb: 'Boost',
  how: 'Hold E and swing the view left to turn the allocation knob up. O2 falls while you turn; stop turning to let it recover before you go on.',
  keys: ['E hold + swing left: turn the knob', 'stop turning: O2 recovers'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'step and recover', input: 'e-hold+swing',
    win: 'allocation raised to target on both sickbay panels while keeping the O2 readout above the starved mark',
    fail: 'turning the knob continuously so the oxygen readout falls below the starved mark',
    rule: 'Turning pulls O2 down; pausing lets it climb back. Alternate turn and pause so O2 never drops under the mark.' },
  rush: 'Cranked the allocation to the order and left the air handler to cope.',
  captions: { starved: 'air handler starved' },
  says: { starved: 'The air handler is starving. Pause the knob and let O2 recover.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Sickbay distribution panel', prop: 'relayrack' }, { name: 'Ops allocation panel', prop: 'console' }]), r = m.rnd, rate = m.calm ? 0.3 : 0.38, drop = m.calm ? 0.4 : 0.5;
    m.al = m.sites.map(() => ({ a: 0, o2: 1, tgt: 0.9 + r() * 0.1 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const k = m.al[m.next], turning = inp.hold && (inp.swing || 0) > 0.3;
      if (turning) { k.a += rate * dt; k.o2 -= drop * dt; } else k.o2 = Math.min(1, k.o2 + 0.5 * dt);
      if (k.o2 < 0.45) { m.fault('starved'); k.o2 = 0.7; }
      s.prog = clamp(k.a / k.tgt) * 0.95; if (k.a >= k.tgt) m.finish(m.next);
    };
    m.hint = () => { const k = m.al[m.next]; if (!k) return { at: -1 }; if (!k.go && k.o2 < 0.62) k.go = true; if (k.go && k.o2 > 0.85) k.go = false; return { at: m.next, hold: true, swing: k.go ? 0 : 1 }; };
    m.bad = () => ({ at: m.next, hold: true, swing: 1 });
    m.view = () => ({ tgt: m.al.map(k => +k.tgt.toFixed(3)) });
    m.panel = (i) => { const k = m.al[i]; if (!k) return null; return { label: `O2 ${Math.round(k.o2 * 100)} %${k.o2 < 0.6 ? ' LOW' : ''}`, value: `alloc ${Math.round(k.a / k.tgt * 100)} %`, bar: k.o2, band: [0.6, 1] }; };
    m.prompt = () => 'Hold [E] and swing left to turn the knob; pause when O2 sags';
    return m;
  },
});
