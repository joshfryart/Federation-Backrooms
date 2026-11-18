// Transporter chief: pad and emitter diagnostic. Lower the alignment scanner arm (hold E) and drive the three-point sweep across the pad by
// turning your view; the arm only reads an emitter coil when you pause on it until its trace locks. A coil whose locked trace sits outside
// the green band is drifting even though the pad average still reads green: lift the arm (let go of E) on it to tag it. Sweeping past an
// unread coil, sweeping on past a drifting one, or lifting on a green one are faults.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'tchief', label: 'Pad and emitter diagnostic', type: 'loop' },
  title: 'Three-point emitter sweep', dept: 'operations', host: 'room', item: 'tricorder_eng', siteName: 'Pad', verb: 'Sweep',
  how: 'Hold E to lower the scanner arm and turn left to drive the sweep. Stop on each emitter until its trace locks; let go of E on a coil whose trace locks outside the band to tag it, sweep on past a green one.',
  keys: ['E hold: arm down', 'turn left: sweep', 'stop on a coil: lock', 'let go: tag a drifting coil'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'pause the sweep', input: 'e-hold+swing', win: 'each pad swept with every emitter coil paused on until its trace locked and the drifting coil tagged by lifting the arm',
    fail: 'sweeping past a coil before its trace locks, sweeping on past a drifting coil, or tagging a green one',
    rule: 'Arm down with E; turning left moves it along the pad. Hold still on each coil mark until LOCKED, then read its trace: in band, keep sweeping; out of band, lift the arm on it.' },
  rush: 'Ran one fast sweep across the pad and logged the pad average.',
  captions: { 'swept past': 'scanner error beep', 'missed drift': 'coil drift alarm', 'false tag': 'tag clunk' },
  says: { 'swept past': 'Swept past a coil before its trace locked. Stop on each coil mark.', 'missed drift': 'That coil was drifting out of the band and you swept on. Lift the arm on it to tag it.', 'false tag': 'That coil read green: no tag needed, sweep on.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pad 1 emitter ring', prop: 'pad' }, { name: 'Pad 2 emitter ring', prop: 'pad' }]), r = m.rnd;
    const zone = m.calm ? 0.07 : 0.05, dwellT = m.calm ? 0.7 : 0.8, speed = 0.35;
    m.pads = m.sites.map(() => {
      const bad = ri(r, 0, 2);
      return { arm: 0, em: [0.2, 0.5, 0.8].map((p, j) => ({ pos: p + rf(r, -0.05, 0.05), read: j === bad ? rf(r, 0.12, 0.25) * (r() < 0.5 ? -1 : 1) : rf(r, -0.06, 0.06), drift: j === bad, dwell: 0, locked: false, done: false })) };
    });
    const cur = (p) => p.em.find(e => !e.done);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, p = m.pads[i], e = cur(p);
      if (rel && e) {
        if (e.locked && e.drift) { e.done = true; m.ev('tag', { site: i }); }
        else if (e.locked) { m.fault('false tag'); e.done = true; }
      }
      if (inp.hold && e) {
        const sw = inp.swing || 0; if (sw > 0) p.arm = clamp(p.arm + sw * speed * dt, 0, 1);
        if (Math.abs(p.arm - e.pos) < zone && Math.abs(sw) < 0.3 && !e.locked) { e.dwell += dt; if (e.dwell >= dwellT) { e.locked = true; m.ev('lock'); } }
        if (p.arm > e.pos + zone) {
          if (!e.locked) { m.fault('swept past'); p.arm = e.pos - zone * 2.4; e.dwell = 0; }
          else if (e.drift) { m.fault('missed drift'); e.done = true; }
          else e.done = true;
        }
      }
      if (!cur(p)) { m.finish(i); return; }
      s.prog = Math.min(0.95, p.em.filter(x => x.done).length / 3 * 0.9 + p.arm * 0.05);
    };
    m.hint = () => {
      const i = m.next; if (i < 0) return { at: -1 }; const p = m.pads[i], e = cur(p); if (!e) return { at: i, hold: true };
      if (e.locked) return e.drift ? { at: i, hold: false } : { at: i, hold: true, swing: 1 };
      return { at: i, hold: true, swing: p.arm < e.pos - zone * 0.6 ? 1 : 0 };
    };
    m.bad = () => ({ at: m.next, hold: true, swing: 2 });
    m.view = () => ({ pads: m.pads.map(p => p.em.map(e => [+e.pos.toFixed(2), +e.read.toFixed(2)])) });
    m.panel = (i) => {
      const p = m.pads[i]; if (!p) return null; const e = cur(p); if (!e) return { label: 'Pad', value: 'swept', bar: 1 };
      const n = p.em.indexOf(e) + 1;
      if (e.locked) return { label: `Coil ${n} trace LOCKED`, value: `${e.read >= 0 ? '+' : ''}${(e.read * 100).toFixed(0)} ${Math.abs(e.read) > 0.1 ? 'OUT OF BAND' : 'in band'} · pad avg green`, bar: clamp(0.5 + e.read * 2), band: [0.3, 0.7] };
      return { label: `Arm → coil ${n}`, value: Math.abs(p.arm - e.pos) < zone ? `hold still ${Math.round(e.dwell / dwellT * 100)} %` : `arm ${Math.round(p.arm * 100)} / mark ${Math.round(e.pos * 100)}`, bar: p.arm, band: [e.pos - zone, e.pos + zone] };
    };
    m.prompt = (i) => {
      const p = m.pads[i], e = p && cur(p); if (!e) return '';
      if (e.locked) return Math.abs(e.read) > 0.1 ? 'Trace out of band: let go of [E] to lift the arm and tag this coil' : 'Trace in band: keep [E] held and turn left to sweep on';
      return 'Hold [E] and turn left to sweep the arm; stop dead on the coil mark until the trace locks';
    };
    return m;
  },
});
