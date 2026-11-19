// Chief of security: keep order among the evacuees. At each knot of people three voices rise. Face the loudest and hold E to talk them down by
// name (talking to a quieter one only stirs the knot). Then a shove breaks out to one side: swing your view sharply onto the pair to step in
// between, and hold E there to part them before the shove meter fills. A drifting turn is not stepping in; a full meter is a brawl.
import { define, machine, room, rf, ri, pick, clamp } from './kit.js';

const POS = [0.35, 0, -0.35], AIM = 0.12;
export default define({
  job: { billet: 'cos', label: 'Keep order among the evacuees', type: 'task:medical_relief' },
  title: 'Talk down, then step between', dept: 'security', host: 'room', siteName: 'Knot', verb: 'Calm',
  how: 'Face the loudest voice in each knot and hold E to talk them down. When a shove starts, swing your view sharply onto the pair and hold E to stand between them.',
  keys: ['look: face a voice', 'E hold: talk / part them', 'sharp turn: step in'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'talk-down and part', input: 'e-hold+look+swing', win: 'each knot of evacuees settled by talking down its loudest voice and parting the shove that follows before it turns into a brawl',
    fail: 'addressing a quieter voice first, drifting onto a shove instead of stepping in sharply, or letting the shove meter fill',
    rule: 'The panel gives each voice a loudness; face the loudest and hold E. When SHOVE flashes left or right, snap your view onto it with a fast turn, then hold E on the pair for a second.' },
  rush: 'Shouted "Everyone calm down!" from the hatch and moved on.',
  captions: { 'wrong voice': 'crowd mutters louder', brawl: 'scuffle, shouting', drifted: 'shove goes on' },
  says: { 'wrong voice': 'That was not the loudest one — the knot got louder. Face the loudest voice.', brawl: 'Too slow: the shove became a brawl. Step in sooner.', drifted: 'You drifted over — step in with a sharp turn of your head.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Knot by the bulkhead', prop: 'crate' }, { name: 'Knot at the pallets', prop: 'pallet' }, { name: 'Knot at the bay hatch', prop: 'airlock_doors' }]), r = m.rnd;
    const TEN = m.calm ? 9 : 6.5, SHOVE = m.calm ? 3.6 : 2.6, TALK = 0.9, PART = 1.0;
    m.knots = m.sites.map(() => { const loud = POS.map(() => ri(r, 20, 60)), k = ri(r, 0, 2); loud[k] = ri(r, 75, 95); return { loud, k, shoveAt: pick(r, [0, 2]), delay: rf(r, 0.5, 1.4), ph: 0, talk: 0, ten: rf(r, 0.1, 0.3), sh: 0, step: false, part: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, z = m.knots[i], look = inp.look || 0, sw = inp.swing || 0;
      if (z.ph === 0) { z.ten += dt / TEN; if (z.ten >= 1) { m.fault('brawl'); z.ten = 0.4; }
        const v = POS.findIndex(p => Math.abs(look - p) < AIM);
        if (inp.hold && v >= 0) { if (v !== z.k) { if (z.talk >= 0) { m.fault('wrong voice'); z.ten = clamp(z.ten + 0.25); z.talk = -1; } } else if (z.talk >= 0) { z.talk += dt; if (z.talk >= TALK) { z.ph = 1; z.ten = 0.2; } } }
        else if (!inp.hold) z.talk = 0; s.prog = z.ph ? 0.4 : clamp(z.talk / TALK) * 0.4; return; }
      if (z.ph === 1) { z.delay -= dt; if (z.delay <= 0) { z.ph = 2; z.sh = 0; } return; }
      const p = POS[z.shoveAt], on = Math.abs(look - p) < AIM; z.sh += dt / SHOVE;
      if (!z.step && Math.sign(sw) === Math.sign(p) && Math.abs(sw) >= 1.4) z.step = true;
      if (on && inp.hold) { if (!z.step) { if (z.part === 0) m.fault('drifted'); z.part = -1; } else { z.part = Math.max(0, z.part) + dt; if (z.part >= PART) { m.finish(i); return; } } }
      if (z.sh >= 1) { m.fault('brawl'); z.sh = 0; z.step = false; z.part = 0; }
      s.prog = 0.5 + clamp(z.part / PART) * 0.45;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const z = m.knots[i];
      if (z.ph === 0) return { at: i, look: POS[z.k], hold: true }; if (z.ph === 1) return { at: i, look: 0 };
      const p = POS[z.shoveAt]; return z.step ? { at: i, look: p, hold: true } : { at: i, look: p * 0.5, swing: Math.sign(p) * 2 }; };
    m.bad = (f = 0) => { const i = m.next, z = m.knots[i]; return { at: i, look: POS[(z.k + 1) % 3], hold: f % 6 < 3 }; };
    m.view = () => ({ knots: m.knots.map(z => [z.k, z.shoveAt]) });
    m.panel = (i) => { const z = m.knots[i]; if (!z) return null;
      if (z.ph === 0) return { label: 'Voices L · C · R', value: z.loud.map(v => `${v} dB`).join(' · '), bar: z.ten };
      if (z.ph === 1) return { label: 'Knot', value: 'quieter…', bar: 0.2 };
      return { label: `SHOVE ${z.shoveAt === 0 ? '◀ LEFT' : 'RIGHT ▶'}`, value: z.step ? 'between them — hold [E]' : 'step in!', bar: z.sh }; };
    m.prompt = (i) => { const z = m.knots[i]; if (!z) return ''; if (z.ph === 0) return 'Face the loudest voice and hold [E] to talk them down';
      if (z.ph === 1) return 'Watch the knot'; return z.step ? 'Hold [E] between them to part them' : 'Swing your view sharply onto the shove to step in'; };
    return m;
  },
});
