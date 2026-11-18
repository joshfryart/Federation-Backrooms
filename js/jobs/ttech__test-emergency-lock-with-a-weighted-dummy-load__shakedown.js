// Transporter tech: test the emergency lock with a weighted dummy load. Heave the dummy off the rack (hold E all the way up, let go at the
// top). At each test pad, hold E and turn your view to wind the manual key switch a quarter turn until the lock engages. Then let go and
// watch the tilt indicator through the timed hold. A lock that does not hold lets the heavy dummy creep over slowly: tap E once the tilt
// passes the mark to stop the test and log it. Stopping a test that is holding, or watching a creeping dummy go past the mark, is a fault.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Test emergency lock with a weighted dummy load', type: 'task:shakedown' },
  title: 'Dummy-load lock hold and tilt watch', dept: 'operations', host: 'room', item: 'spanner', siteName: 'Step', verb: 'Test',
  how: 'Heave the dummy (hold E to the top, let go). At each pad hold E and turn to wind the key until it engages, then watch the tilt: tap E only if it creeps past the mark.',
  keys: ['E hold: heave / wind the key (turn the view)', 'E tap: stop the test on a creep'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'watch for creep', input: 'e-hold+turn+e-tap', win: 'dummy heaved, each pad lock wound on and its timed hold watched, every slow creep stopped and logged at the mark',
    fail: 'dropping the dummy before the top, stopping a test that is holding, or letting a creeping dummy pass the mark unstopped',
    rule: 'Lift: hold E until the bar tops out, then release. Key: hold E and turn the view a quarter turn. Hold: release E and watch the tilt; tap E within a second of it crossing the mark, otherwise leave it until the timer ends.' },
  rush: 'Turned the key, saw the lock light and logged the test passed.',
  captions: { 'dropped dummy': 'heavy thud', 'stopped a good test': 'error buzz', 'missed creep': 'dummy slides' },
  says: { 'dropped dummy': 'Let go before the dummy was up: it dropped back. Hold all the way.', 'stopped a good test': 'That lock was holding: the tilt never reached the mark.', 'missed creep': 'The dummy crept past the mark and you let it go.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Dummy rack', prop: 'shelving' }, { name: 'Test pad lock', prop: 'pad' }, { name: 'Pedestal pad lock', prop: 'beampedestal' }]), r = m.rnd;
    const HOLD = m.calm ? 5 : 3.6, MARK = 0.5, LATE = m.calm ? 1.3 : 1.0, creep = r() < 0.5;
    m.lift = 0; m.pads = [creep, r() < 0.5 || !creep].map(sh => ({ sh, key: 0, on: false, w: 0, tilt: 0, start: rf(r, 0.6, 1.4), rate: rf(r, 0.28, 0.4), wob: rf(r, 0, 6), over: -1 }));
    const tiltOf = (p) => p.sh ? Math.max(0, (p.w - p.start) * p.rate) + 0.04 * Math.sin(p.w * 5 + p.wob) : 0.2 + 0.12 * Math.sin(p.w * 2.2 + p.wob);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.hold) m.lift = Math.min(1, m.lift + 0.6 * dt); if (rel) { if (m.lift >= 1) { m.finish(0); return; } m.fault('dropped dummy'); m.lift = 0; } s.prog = m.lift * 0.9; return; }
      const p = m.pads[i - 1];
      if (!p.on) { if (inp.hold && (inp.turn || 0) > 0.2) p.key = Math.min(1, p.key + 0.45 * Math.min(2, inp.turn) * dt); if (p.key >= 1) { p.on = true; m.ev('lock engaged', { site: i }); } s.prog = p.key * 0.3; return; }
      if (inp.hold && !inp.press) return;   // still holding from the key turn
      p.w += dt; p.tilt = clamp(tiltOf(p)); s.prog = 0.3 + clamp(p.w / HOLD) * 0.65;
      if (p.tilt >= MARK && p.over < 0) p.over = p.w;
      if (inp.press) { if (p.over >= 0) { m.ev('creep logged', { site: i }); m.finish(i); } else m.fault('stopped a good test'); return; }
      if (p.over >= 0 && p.w - p.over > LATE) { m.fault('missed creep'); if (m.state === 'play') m.finish(i); return; }
      if (p.w >= HOLD && p.over < 0) m.finish(i);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, hold: m.lift < 1 };
      const p = m.pads[i - 1]; if (!p.on) return { at: i, hold: true, turn: 1.4 }; return { at: i, press: p.over >= 0 && p.w - p.over > 0.15 && f % 3 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 20 < 10 });
    m.view = () => ({ pads: m.pads.map(p => [p.sh, +p.start.toFixed(2), +p.rate.toFixed(2)]) });
    m.panel = (i) => { if (i === 0) return { label: 'Lift', value: m.lift >= 1 ? 'UP — let go' : `${Math.round(m.lift * 100)} %`, bar: m.lift };
      const p = m.pads[i - 1]; if (!p) return null; if (!p.on) return { label: 'Key switch', value: `${Math.round(p.key * 90)}°`, bar: p.key };
      return { label: `Tilt · hold ${Math.max(0, HOLD - p.w).toFixed(1)} s`, value: p.tilt >= MARK ? 'PAST MARK' : 'level', bar: p.tilt, band: [0, MARK] }; };
    m.prompt = (i) => { if (i === 0) return m.lift >= 1 ? 'Dummy is up — let go of [E]' : 'Hold [E] to heave the dummy all the way up'; const p = m.pads[i - 1]; if (!p) return '';
      return !p.on ? 'Hold [E] and turn your view to wind the key switch' : p.tilt >= MARK ? 'It is creeping past the mark — tap [E] to stop the test' : 'Let go of [E] and watch the tilt until the timer runs out'; };
    return m;
  },
});
