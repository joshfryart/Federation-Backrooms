// Sensor officer: aim the arrays at the survey target (survey). Two controls, the pointing wheel (bearing) and the elevation dial
// (declination). At each, hold E to grip it and turn your view gently until the target's return sits on the crosshair (the panel shows
// how far off it is and which way). The target creeps a little as the ship moves, so keep following it. Hold it centred with a steady hand
// until the lock light has held green for the full count. Wrenching the control (a fast turn while gripping) smears the lock: a fault.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'sensor', label: 'Aim arrays at survey target', type: 'task:survey' },
  title: 'Wheel and dial onto the crosshair', dept: 'sciences', host: 'room', siteName: 'Control', verb: 'Aim',
  how: 'Hold E on the pointing wheel, then the elevation dial, and turn the view slowly until the return is centred; hold it there steadily until the lock count completes.',
  keys: ['E hold: grip the control', 'look: move the return', 'turn slowly: no wrenching'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'steady on crosshair', input: 'e-hold+look+turn', win: 'bearing wheel and elevation dial each kept on the creeping target with a steady grip until the lock light holds for a full count',
    fail: 'wrenching a gripped control so the array slips and the survey data smears, or letting go so the target walks off the crosshair',
    rule: 'Grip with E and follow the OFF figure on the panel by turning your view toward it, slowly. Inside the ring and steady, the lock count fills; a fast turn while gripping is a slip.' },
  rush: 'Spun the wheel to roughly the right number and threw the lock.',
  captions: { slipped: 'array mount grinds', lock: 'lock tone' },
  says: { slipped: 'You wrenched the control and the array slipped off target. Small, slow movements.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pointing wheel', prop: 'sensorstation' }, { name: 'Elevation dial', prop: 'console' }]), r = m.rnd;
    const ring = m.calm ? 0.07 : 0.05, lockT = m.calm ? 1.4 : 1.6, jerk = 1.3;
    m.ax = m.sites.map(() => ({ t0: (r() < 0.5 ? -1 : 1) * rf(r, 0.15, 0.35), amp: rf(r, 0.03, 0.06), w: rf(r, 0.5, 0.9), ph: rf(r, 0, 6.28), lock: 0, cool: 0, aim: 0, scale: Math.round(rf(r, 20, 340)) }));
    const tgt = (a) => a.t0 + a.amp * Math.sin(m.t * a.w + a.ph);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, a = m.ax[i]; a.cool = Math.max(0, a.cool - dt);
      if (!inp.hold) { a.lock = Math.max(0, a.lock - dt); s.prog = 0.9 * a.lock / lockT; return; }
      a.aim = inp.look || 0; const turn = inp.turn || 0;
      if (turn > jerk && a.cool <= 0) { m.fault('slipped'); a.cool = 1; a.lock = 0; return; }
      if (Math.abs(a.aim - tgt(a)) < ring && turn < 0.5) { a.lock += dt; if (a.lock >= lockT) { m.ev('lock', { site: i }); m.finish(i); return; } } else a.lock = Math.max(0, a.lock - 2 * dt);
      s.prog = clamp(0.9 * a.lock / lockT, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, hold: true, look: tgt(m.ax[i]), turn: 0.1 }; };
    m.bad = () => ({ at: m.next, hold: true, look: 0, turn: 2 });
    m.view = () => ({ ax: m.ax.map(a => [+a.t0.toFixed(3), a.scale]) });
    m.panel = (i) => { const a = m.ax[i]; if (!a) return null; const off = tgt(a) - a.aim, deg = Math.round(off * 57);
      return { label: a.lock > 0 ? 'LOCK' : 'Return', value: `${i ? 'elev' : 'bearing'} ${a.scale}° · off ${deg > 0 ? '◀ ' : deg < 0 ? '▶ ' : ''}${Math.abs(deg)}°`, bar: a.lock / lockT, band: [0.97, 1] }; };
    m.prompt = (i) => { const a = m.ax[i]; return !a ? '' : a.lock > 0 ? 'Keep holding [E] and stay steady on the crosshair' : 'Hold [E] to grip the control and turn your view slowly toward the arrow until the return centres'; };
    return m;
  },
});
