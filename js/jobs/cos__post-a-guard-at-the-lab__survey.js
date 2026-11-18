// Chief of security: post a guard at the lab. The duty roster slate rolls through the officers with their hours awake: tap E on one who has
// slept (under 10 h awake); an exhausted pick is a fault. At that officer's bench hold E to brief them all the way through. At the lab door,
// aim at the marked post spot and tap E to stand them there (off the mark is a fault). The officer then signs in at the door panel.
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

const NAMES = ['Ens. Okafor', 'Lt. Varga', 'PO Tanaka', 'Ens. Reyes', 'Lt. Haldane', 'CPO Mbeki', 'Ens. Sorensen', 'PO Castell'];
export default define({
  job: { billet: 'cos', label: 'Post a guard at the lab', type: 'task:survey' },
  title: 'Pick, brief and post a guard', dept: 'security', host: 'room', siteName: 'Step', verb: 'Post',
  how: 'At the roster slate tap E when a rested officer (under 10 h awake) rolls past. At their bench hold E to brief them through. At the lab door aim at the marked spot and tap E.',
  keys: ['E tap: pick / place', 'E hold: brief', 'look: the post spot'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'pick and post', input: 'e-tap+e-hold+look', win: 'a rested officer picked from the rolling roster, briefed in full and stood on the marked post spot at the lab door',
    fail: 'picking an exhausted officer, cutting the brief short, or standing the guard off the post mark',
    rule: 'The roster rolls one name a second; tap only on a name under 10 h awake. Brief by holding E until the brief bar fills. At the door the panel says how far left or right the mark is: aim there and tap.' },
  rush: 'Called the nearest ensign on the comm and told them to watch the lab.',
  captions: { exhausted: 'yawn', 'half briefed': 'officer: "Sorry, sir?"', 'off the mark': 'boots shuffle' },
  says: { exhausted: 'That officer has been up too long to hold a door. Pick someone rested.', 'half briefed': 'You stopped before the brief was done. Start again.', 'off the mark': 'Not on the post mark — they would block the lab door. Aim at the mark.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Duty roster slate', prop: 'console' }, { name: 'Officer at the bench', prop: 'labbench' }, { name: 'Lab door post', prop: null }]), r = m.rnd;
    const ROLL = m.calm ? 1.3 : 0.9, BRIEF = 1.8, TOL = m.calm ? 0.1 : 0.07;
    m.roster = shuffle(r, NAMES).slice(0, 6).map(n => ({ n, h: ri(r, 11, 22) })); const rest = shuffle(r, [1, 2, 3, 4, 5]).slice(0, 2); for (const k of rest) m.roster[k].h = ri(r, 3, 9);
    m.spot = rf(r, -0.3, 0.3); if (Math.abs(m.spot) < 0.08) m.spot = 0.15; m.k = 0; m.roll = 0; m.pick = null; m.brief = 0; let prev = false;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; m.roll += dt; if (m.roll >= ROLL) { m.roll = 0; m.k = (m.k + 1) % m.roster.length; }
      const s = m.cur(inp); const hold = !!inp.hold, rel = prev && !hold; prev = hold; if (!s) return; const i = m.next;
      if (i === 0 && inp.press) { const o = m.roster[m.k]; if (o.h >= 10) m.fault('exhausted'); else { m.pick = o; m.finish(0); } }
      else if (i === 1) { if (hold) m.brief += dt; if (m.brief >= BRIEF) m.finish(1); else if (rel) { if (m.brief > 0.1) m.fault('half briefed'); m.brief = 0; } s.prog = clamp(m.brief / BRIEF) * 0.9; }
      else if (i === 2 && inp.press) { if (Math.abs((inp.look || 0) - m.spot) <= TOL) m.finish(2); else m.fault('off the mark'); }
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 };
      if (i === 0) { const ok = m.roster[m.k].h < 10 && m.roll > 0.1; return { at: 0, press: ok, hold: ok }; }
      if (i === 1) return { at: 1, hold: true }; return { at: 2, look: m.spot, press: f % 4 === 0, hold: f % 4 === 0 }; };
    m.bad = (f = 0) => { const i = m.next; if (i === 0) { const t = m.roster[m.k].h >= 10; return { at: 0, press: t, hold: t }; } return { at: i, hold: f % 10 < 3, press: f % 10 === 0, look: -m.spot }; };
    m.view = () => ({ roster: m.roster.map(o => o.h), spot: +m.spot.toFixed(2) });
    m.panel = (i) => { if (i === 0) { const o = m.roster[m.k]; return { label: o.n, value: `${o.h} h awake`, bar: clamp(o.h / 24), band: [0, 10 / 24] }; }
      if (i === 1) return { label: m.pick ? m.pick.n : 'Officer', value: 'brief: post, watch, who may enter', bar: clamp(m.brief / BRIEF) };
      const deg = Math.round(Math.abs(m.spot) * 57.3); return { label: 'Post mark', value: `${deg}° ${m.spot > 0 ? 'left' : 'right'} of the door`, bar: 0.5 + m.spot }; };
    m.prompt = (i) => i === 0 ? 'Tap [E] when a rested officer (under 10 h awake) comes up' : i === 1 ? 'Hold [E] to give the brief all the way through' : 'Aim at the post mark and tap [E] to stand the guard there';
    return m;
  },
});
