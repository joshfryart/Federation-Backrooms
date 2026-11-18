// EPS tech: check transporter pad feed (cargo run). A lit lamp proves nothing: hold the test button with the breaker pressed to its stop
// (E held) until the pad lamp has gone green and STAYED green under load. A breaker sitting halfway lets the lamp flicker back to red: let go,
// reseat it (tap E) and test again. Then run the back of your hand along each feed cable at a steady pace (E held, turning the view) to feel
// for heat; skimming along too fast misses a hot spot.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'eps', label: 'Check transporter pad feed', type: 'task:cargo_run' },
  title: 'Pad lamp under load, cable by hand', dept: 'engineering', host: 'room', siteName: 'Feed point', verb: 'Prove',
  how: 'Hold E on the pad test until the lamp is green and stays green for the load count. If it flickers red, let go, tap E to reseat the breaker, and test again. Then hold E and turn slowly along each cable.',
  keys: ['E hold: test under load', 'E tap: reseat breaker', 'E hold + turn slowly: trace cable'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'load-hold and trace', input: 'e-hold+e-tap+swing', win: 'the pad lamp held green for the full load count on a seated breaker and every feed cable traced at hand pace',
    fail: 'pressing on through a red flicker, letting go before the load count, or skimming along a cable too fast to feel heat',
    rule: 'Hold E: the lamp goes red to green, then the load count must run out. A flicker to red means the breaker is halfway: release within half a second and tap E to seat it. On the cables, turn the view steadily but under the speed mark.' },
  rush: 'Saw the pad lamp lit and called the feed good.',
  captions: { 'feed dropped': 'pad feed drops', unproven: 'test released', skimmed: 'hand skims' },
  says: { 'feed dropped': 'The lamp went red and you held on: the pad feed dropped. Let go and reseat the breaker.', unproven: 'Let go before the load count finished: the feed is unproven.', skimmed: 'Too fast along the cable: you could not feel a hot spot at that pace.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pad breaker and test', prop: 'beampedestal' }, { name: 'Pad feed cable', prop: 'pad' }, { name: 'Buffer feed cable', prop: 'buffertank' }]), r = m.rnd;
    const green = 0.8, proof = 2.6, late = m.calm ? 0.7 : 0.5, fast = m.calm ? 1.8 : 1.4;
    m.loose = r() < 0.6; m.flickAt = rf(r, 1.0, 1.8); m.h = 0; m.ph = 'test'; m.fl = 0; m.cab = [0, 0]; m.skim = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) {
        if (m.ph === 'reseat') { if (inp.press) { m.ph = 'test'; m.loose = false; m.h = 0; } s.prog = 0.2; return; }
        if (m.ph === 'flick') { if (inp.hold) { m.fl += dt; if (m.fl > late) { m.fault('feed dropped'); m.fl = 0; } } if (rel || !inp.hold) { m.ph = 'reseat'; m.fl = 0; } return; }
        if (inp.hold) { m.h += dt; if (m.loose && m.h >= m.flickAt) { m.ph = 'flick'; m.fl = 0; m.ev('flicker'); return; } if (m.h >= proof) { m.finish(0); return; } }
        if (rel && m.h < proof) { m.fault('unproven'); m.h = 0; }
        s.prog = clamp(m.h / proof) * 0.9; return;
      }
      m.skim = Math.max(0, m.skim - dt); const k = i - 1, sw = Math.abs(inp.swing || 0);
      if (inp.hold && sw > fast && !m.skim) { m.fault('skimmed'); m.cab[k] = Math.max(0, m.cab[k] - 0.4); m.skim = 0.7; }
      else if (inp.hold && sw > 0.35 && sw <= fast) m.cab[k] += 0.5 * sw * dt;
      s.prog = clamp(m.cab[k]) * 0.95; if (m.cab[k] >= 1) m.finish(i);
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 };
      if (i === 0) { if (m.ph === 'flick') return { at: 0, hold: false }; if (m.ph === 'reseat') { const p = f % 2 === 0; return { at: 0, hold: p, press: p }; } return { at: 0, hold: true, press: !m.prev }; }
      return { at: i, hold: true, swing: (f % 40 < 20 ? 1 : -1) * 1.0 };
    };
    m.bad = (f = 0) => m.next === 0 ? { at: 0, hold: f % 40 < 20, press: f % 40 === 0 } : { at: m.next, hold: true, swing: 2.5 };
    m.view = () => ({ loose: m.loose, at: +m.flickAt.toFixed(2) });
    m.panel = (i) => {
      if (i === 0) { const lamp = m.ph !== 'test' ? 'RED (flicker)' : m.h >= green ? 'GREEN' : m.h > 0 ? 'red → …' : 'red'; return { label: `Pad lamp ${lamp}`, value: m.ph === 'reseat' ? 'breaker halfway: reseat' : `load count ${Math.max(0, proof - m.h).toFixed(1)} s`, bar: clamp(m.h / proof) }; }
      const k = i - 1; return { label: m.skim ? 'TOO FAST' : 'Cable traced', value: `${Math.round(clamp(m.cab[k]) * 100)} %`, bar: clamp(m.cab[k]) };
    };
    m.prompt = (i) => i === 0 ? (m.ph === 'flick' ? 'It flickered red: let go of [E] now' : m.ph === 'reseat' ? 'Tap [E] to push the breaker fully home' : 'Hold [E] on the test button until the load count runs out')
      : 'Hold [E] and turn your view steadily along the cable; not too fast';
    return m;
  },
});
