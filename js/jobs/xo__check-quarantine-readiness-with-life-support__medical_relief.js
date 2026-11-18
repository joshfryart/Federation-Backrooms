// XO: check quarantine readiness with life support. The console says the airflow is set; the seal has to prove it. Run your palm slowly
// along each stretch of the quarantine door seal (turn the view gently): the draught you feel grows as your hand nears a leak. Tap E right at
// the strongest draught to mark it for the seal crew. Moving fast you feel nothing; marking where there is no draught is a fault.
import { define, machine, room, rf } from './kit.js';

export default define({
  job: { billet: 'xo', label: 'Check quarantine readiness with life support', type: 'task:medical_relief' },
  title: 'Quarantine seal draught hunt', dept: 'command', host: 'room', siteName: 'Seal stretch', verb: 'Feel',
  how: 'At each stretch of the quarantine seal turn your view slowly along it and watch the draught you feel; tap E exactly where it is strongest to mark the leak.',
  keys: ['Turn slowly along the seal', 'E tap: mark the leak'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'feel for draught', input: 'e-tap+look+turn', win: 'the leak on every stretch of quarantine seal found by the strength of the draught and marked at its strongest point',
    fail: 'marking a spot with no draught, or sweeping so fast that the hand feels nothing',
    rule: 'Turn slowly: the draught bar rises as your aim nears the leak and peaks on it. Turning fast reads zero. Tap E at the peak (bar near full) to mark it; a tap where the bar is low marks a phantom leak.' },
  rush: 'Read the airflow setting off the life support console and marked quarantine ready.',
  captions: { 'phantom draught': 'chalk squeak', marked: 'seal crew acknowledges', draught: 'faint whistle' },
  says: { 'phantom draught': 'Nothing there — the draught was weak. Find where it is strongest.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Seal, hinge side', prop: 'airlock_doors' }, { name: 'Seal, sill', prop: 'scrubber' }, { name: 'Seal, latch side', prop: 'fieldgen' }]), r = m.rnd;
    const slow = m.calm ? 0.9 : 0.7, need = m.calm ? 0.78 : 0.85;
    m.seals = m.sites.map(() => ({ leak: rf(r, -0.4, 0.4), width: rf(r, 0.16, 0.24), felt: 0 }));
    const feel = (u, look, turn) => (turn || 0) > slow ? 0 : Math.max(0, 1 - Math.abs((look || 0) - u.leak) / u.width);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, u = m.seals[i];
      u.felt = feel(u, inp.look, inp.turn); s.prog = u.felt * 0.6;
      if (!inp.press) return; if (u.felt < need) { m.fault('phantom draught'); return; } m.ev('marked', { site: i }); m.finish(i);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, look: m.seals[i].leak, turn: 0.1, press: f % 4 === 3 }; };
    m.bad = (f = 0) => { const i = m.next, u = m.seals[i]; return { at: i, look: u.leak > 0 ? u.leak - 0.35 : u.leak + 0.35, turn: 0.1, press: f % 4 === 3 }; };
    m.view = () => ({ seals: m.seals.map(u => +u.leak.toFixed(2)) });
    m.panel = (i) => { const u = m.seals[i]; return u ? { label: u.felt > 0.85 ? 'Strong draught' : u.felt > 0.3 ? 'Draught' : 'Still air', value: `${Math.round(u.felt * 100)} %`, bar: u.felt, band: [need, 1] } : null; };
    m.prompt = (i) => m.seals[i] ? 'Turn slowly along the seal; tap [E] where the draught is strongest' : '';
    return m;
  },
});
