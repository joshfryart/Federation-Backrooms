// Galley: send hot meals to the lab. At each bench the heat mat sits to one side and an instrument cable runs on the other. Hold E to lower the
// covered plate; the descent only advances while the view is lined up on the mat. Drift onto the cable while lowering and the plate clips it
// (a fault, start again); let go before the plate is down and it is dropped.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Send hot meals to the lab', type: 'task:survey' },
  title: 'Lower the plate onto the mat', dept: 'services', host: 'room', siteName: 'Lab bench', verb: 'Serve',
  how: 'At each bench line the view up with the heat mat (the panel says which way it lies) and hold E to lower the plate. Keep clear of the cable side or you clip it.',
  keys: ['look: line up on the mat', 'E hold: lower the plate'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'lower onto mat', input: 'e-hold+look', win: 'three covered plates each lowered onto the heat mat beside an instrument, the view held on the mat and clear of the cable',
    fail: 'lowering while the view is on the instrument cable so the plate clips it, or letting go before the plate is down',
    rule: 'Aim at the mat (bearing on the panel) and hold E: the plate descends only while aimed. If the aim strays onto the cable bearing it clips the cable. Let go early and it drops.' },
  rush: 'Slid the plates onto the bench beside the equipment and hoped.',
  captions: { 'clipped cable': 'cable snags', 'dropped plate': 'plate clatter' },
  says: { 'clipped cable': 'The plate caught an instrument cable. Lift clear and line up on the mat.', 'dropped plate': 'You let go and the plate dropped on the bench.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Spectrometer bench', prop: 'labbench' }, { name: 'Scanner bench', prop: 'labbench' }, { name: 'Culture bench', prop: 'labbench' }]), r = m.rnd, tol = m.calm ? 0.16 : 0.12;
    m.B = m.sites.map(() => { const mat = rf(r, -0.25, 0.25), s = r() < 0.5 ? -1 : 1; return { mat, cab: mat + s * rf(r, 0.28, 0.34), p: 0 }; }); m.look = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, b = m.B[i]; m.look = inp.look || 0;
      if (inp.hold) { if (Math.abs(m.look - b.cab) < tol) { m.fault('clipped cable'); b.p = 0; } else if (Math.abs(m.look - b.mat) < tol) b.p = clamp(b.p + dt / 1.2);
        if (b.p >= 1) { m.finish(i); return; } }
      if (rel && b.p > 0.05) { m.fault('dropped plate'); b.p = 0; }
      s.prog = s.done ? 1 : b.p * 0.9;
    };
    m.hint = () => { const i = m.next; return i < 0 ? { at: -1 } : { at: i, look: m.B[i].mat, hold: true }; };
    m.bad = () => { const i = Math.max(0, m.next); return { at: i, look: m.B[i].cab, hold: true }; };
    m.view = () => ({ B: m.B.map(b => [+b.mat.toFixed(2), +b.cab.toFixed(2)]) });
    m.panel = (i) => { const b = m.B[i]; if (!b) return null; const d = b.mat - m.look; return { label: `Mat ${d > 0.04 ? 'to the left' : d < -0.04 ? 'to the right' : 'ahead'}`, value: `plate ${Math.round(b.p * 100)} %`, bar: b.p }; };
    m.prompt = (i) => 'Line the view up on the heat mat and hold [E] to lower the plate; stay off the cable';
    return m;
  },
});
