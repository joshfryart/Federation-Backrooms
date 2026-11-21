// Security: test force fields and internal sensors. Hold E to bring an emitter up on the test rig and read its strength against the spec plate.
// A sound emitter climbs past spec and plateaus: let go once it has settled. A weak emitter plateaus under the spec: keep holding for a long
// hold to mark it out of spec. Passing a weak emitter, or marking a sound one, lowers the test score.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Test force fields and internal sensors', type: 'task:shakedown' },
  title: 'Hold the emitter to its plateau', dept: 'security', host: 'room', siteName: 'Emitter', verb: 'Test',
  how: 'Hold E to bring the emitter up. If strength settles above the spec line, let go. If it plateaus under spec, keep holding until the mark registers.',
  keys: ['E hold: bring the emitter up', 'release when settled over spec', 'keep holding when under spec'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'hold to mark weak', input: 'e-hold',
    win: 'three emitters tested on the rig, sound ones released after the plateau and weak ones marked out of spec by a long hold',
    fail: 'letting go before the plateau, passing an emitter that settled under spec, or marking a sound emitter weak',
    rule: 'Strength climbs then plateaus. Over spec: release after it settles. Under spec: hold on until it marks (3.4 s). Do not mark a sound one.' },
  rush: 'Ticked every emitter on the result sheet from the lamp alone.',
  captions: { 'too soon': 'test cut short', 'weak passed': 'weak field passed as good', 'false mark': 'sound emitter marked weak' },
  says: { 'too soon': 'Wait for the strength to settle before letting go.', 'weak passed': 'That field settled under spec. Hold on to mark it weak.', 'false mark': 'That emitter was in spec. Release it after it settles.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Emitter A', prop: 'cellfield' }, { name: 'Emitter B', prop: 'cellfield' }, { name: 'Emitter C', prop: 'cellfield' }]), r = m.rnd, spec = 0.9, mark = m.calm ? 3.8 : 3.4, tset = 1.9;
    const w = Math.floor(r() * 3), w2 = r() < 0.4 ? (w + 1) % 3 : -1;
    m.em = m.sites.map((_, i) => { const weak = i === w || i === w2; return { weak, P: weak ? rf(r, 0.6, 0.84) : rf(r, 0.93, 1), s: 0, h: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const sit = m.cur(inp), rel = m.released(inp); if (!sit) return; const e = m.em[m.next];
      if (inp.hold) { e.h += dt; e.s += (e.P - e.s) * Math.min(1, dt * 2.2); if (e.h >= mark) { if (e.weak) m.finish(m.next); else { m.fault('false mark'); e.h = 0; e.s = 0; } return; } }
      if (rel) { if (e.h < tset) m.fault('too soon'); else if (e.weak) m.fault('weak passed'); else { m.finish(m.next); return; } e.h = 0; e.s = 0; }
      sit.prog = clamp(e.h / mark) * 0.9;
    };
    m.hint = () => { const e = m.em[m.next]; if (!e) return { at: -1 }; return { at: m.next, hold: e.weak ? true : e.h < tset + 0.05 }; };
    m.bad = () => ({ at: m.next, hold: m.em[m.next] && m.em[m.next].h < 0.4 });
    m.view = () => ({ em: m.em.map(e => [e.weak, +e.P.toFixed(3)]) });
    m.panel = (i) => { const e = m.em[i]; if (!e) return null; return { label: `Strength ${Math.round(e.s * 100)} %  (spec ${Math.round(spec * 100)})`, value: e.h >= tset && e.weak ? 'under spec - keep holding' : e.h >= tset ? 'settled' : 'climbing', bar: e.s, band: [spec, 1] }; };
    m.prompt = () => 'Hold [E] to bring the emitter up; release if it settles over spec, keep holding if not';
    return m;
  },
});
