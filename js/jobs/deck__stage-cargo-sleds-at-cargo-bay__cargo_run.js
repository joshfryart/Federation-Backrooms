// Deck crew: stage cargo sleds at the cargo bay. Hold E to push the sled toward the lift plate; it drifts sideways on its own (a bad caster),
// so steer by aiming your view against the drift to keep its wheels on the floor marks. Let go when the wheels reach the plate marks, then tap
// E to lock the brake. Locking with the wheels off the marks lets the sled roll on the lift; pushing past the plate runs it off the end.
import { define, machine, room, rf, pick, clamp } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Stage cargo sleds at cargo bay', type: 'task:cargo_run' },
  title: 'Sled wheel line-up and brake', dept: 'flight', host: 'room', siteName: 'Sled', verb: 'Stage',
  how: 'Hold E to push the sled onto the lift plate and aim your view against its sideways drift. Let go when the wheels sit on the plate marks, then tap E to lock the brake.',
  keys: ['E hold: push', 'Look: steer against the drift', 'E tap: lock the brake'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'push and steer', input: 'e-hold+e-tap+look', win: 'every sled pushed onto the lift with its wheels on the plate marks and its brake locked there',
    fail: 'locking the brake with the wheels off the marks so the sled rolls, or shoving it past the plate',
    rule: 'Pushing moves the sled forward only while E is held (hold again to nudge a parked sled on); the caster pulls it sideways, and your view angle steers back. Release inside the plate band with the wheel offset green, then tap E for the brake.' },
  rush: 'Shoved the sleds roughly onto the plate and kicked the brakes on.',
  captions: { rolled: 'sled rolls on the plate', 'off the plate': 'sled bangs the lift rail' },
  says: { rolled: 'Brake locked off the marks — the sled rolled. Line the wheels up first.', 'off the plate': 'Pushed it past the plate. Walk it back and ease off sooner.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Sled 1', prop: 'hoversled' }, { name: 'Sled 2', prop: 'cart' }, { name: 'Sled 3', prop: 'pallet' }]), r = m.rnd;
    const side = m.calm ? 0.16 : 0.12, half = m.calm ? 0.06 : 0.045;
    m.sleds = m.sites.map(() => ({ pos: 0, off: rf(r, -0.3, 0.3), drift: pick(r, [1, -1]) * rf(r, 0.25, 0.45), mark: rf(r, 0.6, 0.85), sp: rf(r, 0.28, 0.36) }));
    const onMark = (k) => Math.abs(k.pos - k.mark) <= half && Math.abs(k.off) <= side;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, k = m.sleds[i];
      if (k.parked) { if (inp.press) k.tap = 0; if (inp.hold && k.tap != null) { k.tap += dt; if (k.tap > 0.3) { k.parked = false; k.tap = null; } }
        if (rel && k.tap != null) { k.tap = null; if (onMark(k)) { m.finish(i); return; } m.fault('rolled'); k.pos = 0; k.off = rf(r, -0.3, 0.3); k.parked = false; return; } }
      else if (inp.hold) { k.pos += k.sp * dt; k.off = clamp(k.off + (k.drift - 2.2 * (inp.look || 0)) * dt, -1, 1); if (k.pos > 1) { m.fault('off the plate'); k.pos = 0; k.off = rf(r, -0.3, 0.3); } }
      if (rel && !k.parked && k.tap == null && k.pos > 0.05) k.parked = true;
      s.prog = s.done ? 1 : clamp(k.pos / k.mark * 0.9, 0, 0.9);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.sleds[i];
      if (k.parked) { if (!onMark(k)) return { at: i, hold: false }; const t = f % 3 === 0; return { at: i, hold: t, press: t }; }
      if (k.pos >= k.mark) return { at: i, hold: false }; return { at: i, hold: true, look: clamp((k.drift + 3 * k.off) / 2.2, -0.5, 0.5) }; };
    m.bad = (f = 0) => { const k = m.sleds[m.next]; if (!k.parked && k.pos < 0.2) return { at: m.next, hold: true, look: 0 }; const t = f % 3 === 0; return { at: m.next, hold: t, press: t, look: 0 }; };
    m.view = () => ({ sleds: m.sleds.map(k => [+k.mark.toFixed(2), +k.drift.toFixed(2)]) });
    m.panel = (i) => { const k = m.sleds[i]; if (!k) return null; const ok = Math.abs(k.off) <= side; return { label: `Wheels ${ok ? '● on line' : (k.off > 0 ? '◀ off left' : 'off right ▶')}`, value: k.parked ? (onMark(k) ? 'on the marks — tap [E] brake' : 'parked off the marks') : `travel ${Math.round(k.pos * 100)}%`, bar: k.pos, band: [k.mark - half, k.mark + half] }; };
    m.prompt = (i) => { const k = m.sleds[i]; return !k ? '' : k.parked ? 'Tap [E] to lock the brake (only on the marks)' : 'Hold [E] to push; aim against the drift; let go on the plate marks'; };
    return m;
  },
});
