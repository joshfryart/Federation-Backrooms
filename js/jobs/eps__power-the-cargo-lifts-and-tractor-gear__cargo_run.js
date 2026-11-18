// EPS tech: power the cargo lifts and tractor gear (cargo run). Switch the lift feed on and listen to it idle: a clean hum is left alone, a
// grind means switch it straight off and restart it. Hold the tractor coil test button until its warm-up lamp shows. Then set the tractor feed
// detent (aim at it, tap E) to the level the cargo placard gives for this load: underfeed and the lift stalls, overfeed and the coil cooks.
import { define, machine, room, ri, clamp } from './kit.js';

const DET = [0.4, 0.2, 0, -0.2, -0.4];
export default define({
  job: { billet: 'eps', label: 'Power the cargo lifts and tractor gear', type: 'task:cargo_run' },
  title: 'Lift idle, coil warm-up, placard feed', dept: 'engineering', host: 'room', siteName: 'Breaker', verb: 'Power',
  how: 'Tap E to switch the lift feed on and listen: leave a clean hum, switch a grind off and back on. Hold E on the coil test until the lamp is warm. Aim at the placard feed level and tap E.',
  keys: ['E tap: switch / set detent', 'E hold: coil test', 'view: aim at a detent'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'idle-listen and match', input: 'e-tap+e-hold+look', win: 'lift running on a clean idle, the coil warmed on test and the tractor feed set to the placard level',
    fail: 'switching off a clean lift, running a grinding one, letting go of a cold coil, or setting the feed off the placard',
    rule: 'Lift: after spin-up the panel says CLEAN HUM (wait, hands off) or GRINDING (tap E to cut it, tap again to restart). Coil: hold E until WARM, then let go. Feed: five detents left to right; aim at the placard level and tap E.' },
  rush: 'Threw both breakers and set the tractor to full.',
  captions: { 'dropped lift': 'lift winds down', 'gearbox chewed': 'gears grind', 'cold coil': 'coil clicks', 'wrong feed': 'tractor whines' },
  says: { 'dropped lift': 'That idle was clean: switching it off dropped the lift. Leave a clean hum alone.', 'gearbox chewed': 'You let it grind. Cut a grinding lift straight away and restart it.', 'cold coil': 'Let go before the warm-up lamp lit.', 'wrong feed': 'Not the placard level: the tractor is off its rating for this load.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Lift feed breaker', prop: 'baycontrol' }, { name: 'Tractor coil test', prop: 'console' }, { name: 'Tractor feed', prop: 'pallet_loaded' }]), r = m.rnd;
    const spin = 0.8, quiet = 1.4, grace = m.calm ? 2.6 : 2.0, warm = 1.4, tol = m.calm ? 0.09 : 0.07;
    m.grind = r() < 0.55; m.level = ri(r, 1, 5); m.placard = ri(r, 210, 289); m.lift = 'off'; m.lt = 0; m.coil = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) {
        m.lt += dt;
        if (inp.press) { if (m.lift === 'off') { m.lift = 'spin'; m.lt = 0; } else if (m.lift === 'grind') { m.lift = 'off'; m.grind = false; m.lt = 0; } else { m.fault('dropped lift'); m.lift = 'off'; m.lt = 0; } }
        if (m.lift === 'spin' && m.lt >= spin) { m.lift = m.grind ? 'grind' : 'clean'; m.lt = 0; }
        if (m.lift === 'grind' && m.lt > grace) { m.fault('gearbox chewed'); m.lift = 'off'; m.grind = false; m.lt = 0; }
        if (m.lift === 'clean' && m.lt >= quiet) { m.finish(0); return; }
        s.prog = m.lift === 'clean' ? 0.5 + 0.45 * m.lt / quiet : m.lift === 'spin' ? 0.3 : 0; return;
      }
      if (i === 1) { if (inp.hold) m.coil += dt; if (rel) { if (m.coil >= warm) { m.finish(1); return; } m.fault('cold coil'); m.coil = 0; } s.prog = clamp(m.coil / warm) * 0.9; return; }
      if (inp.press) { const d = DET.findIndex(p => Math.abs((inp.look || 0) - p) < tol); if (d < 0) return; if (d + 1 === m.level) m.finish(2); else m.fault('wrong feed'); }
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const p = f % 2 === 0;
      if (i === 0) return (m.lift === 'off' || m.lift === 'grind') ? { at: 0, hold: p, press: p } : { at: 0, hold: false };
      if (i === 1) return { at: 1, hold: m.coil < warm, press: !m.prev && m.coil < warm };
      return { at: 2, hold: p, press: p, look: DET[m.level - 1] };
    };
    m.bad = (f = 0) => { const p = f % 6 === 0; return { at: m.next, hold: p, press: p, look: DET[m.level % 5] }; };
    m.view = () => ({ grind: m.grind, level: m.level });
    m.panel = (i) => i === 0 ? { label: 'Lift idle', value: { off: 'OFF', spin: 'spinning up…', grind: 'GRINDING', clean: 'CLEAN HUM' }[m.lift], bar: m.lift === 'clean' ? m.lt / quiet : 0 }
      : i === 1 ? { label: 'Coil warm-up lamp', value: m.coil >= warm ? 'WARM' : 'cold', bar: clamp(m.coil / warm), band: [1, 1] }
        : { label: `Placard ${m.placard}: feed level ${m.level}`, value: 'levels 1 (left) to 5 (right)', bar: m.level / 5 };
    m.prompt = (i) => i === 0 ? ({ off: 'Tap [E] to switch the lift feed on', spin: 'Listen…', grind: 'It grinds: tap [E] to cut it, then restart', clean: 'Clean hum: leave it running' }[m.lift])
      : i === 1 ? (m.coil >= warm ? 'Lamp warm: let go of [E]' : 'Hold [E] on the coil test button until the lamp is warm')
        : `Aim at feed detent ${m.level} (1 left … 5 right) and tap [E]`;
    return m;
  },
});
