// Doctor: inspect cargo handlers for strain injuries. Each handler coming off the lift rig lifts a light box (the panel says how the back and
// knees bent), then turns round. Aim at each of the five points along the spine and shoulder and hold E to press it: a flinch adds to the strain
// score, and so does a lift done with a bent back. Score = 1 + flinches + bent back. Then aim far left and hold E to send them back to the rig,
// or far right to send them to sickbay. Four or more goes to sickbay; a low scorer pulled off the rig is a wasted hand; a verdict before all
// five points are pressed is a guess.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const PTS = [['neck', 0.4], ['shoulder', 0.2], ['mid-back', 0], ['lower back', -0.2], ['sacrum', -0.4]];
export default define({
  job: { billet: 'doc', label: 'Inspect cargo handlers for strain injuries', type: 'task:cargo_run' },
  title: 'Spine press strain score', dept: 'medical', host: 'room', siteName: 'Handler', verb: 'Inspect',
  how: 'Aim at each of the five spine points in turn and hold E to press it, watching for a flinch. Then aim far left and hold E to send the handler back to the rig, or far right to send them to sickbay (score 4 or more).',
  keys: ['aim + E hold: press a point', 'far left hold: rig', 'far right hold: sickbay'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'press the spine', input: 'e-hold+look', win: 'each handler pressed at all five spine points, strain scored from flinches and lift posture, and every score of four or more sent to sickbay',
    fail: 'sending a handler back to the rig on a score of four or more, or deciding before every spine point has been pressed',
    rule: 'Five points sit across your view, neck on the left to sacrum on the right. Aim at one and hold E for half a second to press. Score adds one per flinch plus a bent-back lift. Far left hold = rig, far right hold = sickbay.' },
  rush: 'Asked each handler if their back was all right and waved them back to the rig.',
  captions: { 'back to rig injured': 'rig horn', unexamined: 'clipboard slaps', 'fit hand pulled': 'rig foreman grumbles' },
  says: { 'back to rig injured': 'Score four or more and you sent them back to the rig: that is a slipped disc by end of shift.', unexamined: 'Press every point along the spine before you decide.', 'fit hand pulled': 'Low score: that handler is fine for the rig.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Handler 1', prop: 'pallet_loaded' }, { name: 'Handler 2', prop: 'cargo_pad' }, { name: 'Handler 3', prop: 'crate' }]), r = m.rnd;
    const aim = m.calm ? 0.09 : 0.07, press = m.calm ? 0.4 : 0.5, hurt = shuffle(r, [true, false, r() < 0.5]);
    m.hands = m.sites.map((_, i) => { const bent = hurt[i] ? r() < 0.7 : r() < 0.3, nf = hurt[i] ? ri(r, bent ? 2 : 3, 4) : ri(r, 0, bent ? 1 : 2);
      const fl = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, nf)); return { bent, fl: [0, 1, 2, 3, 4].map(k => fl.has(k)), done: [0, 0, 0, 0, 0].map(() => false), acc: 0, at: -1 }; });
    const score = (h) => Math.min(5, 1 + h.fl.filter((f, k) => f && h.done[k]).length + (h.bent ? 1 : 0)), all = (h) => h.done.every(Boolean);
    const zone = (look) => look >= 0.55 ? 'rig' : look <= -0.55 ? 'bay' : PTS.findIndex(p => Math.abs(look - p[1]) <= aim);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, h = m.hands[i], z = zone(inp.look || 0);
      if (!inp.hold || z === -1 || z !== h.at) { h.acc = 0; h.at = inp.hold ? z : -1; }
      if (inp.hold && z !== -1) { h.acc += dt; if (h.acc >= press) { h.acc = -9;
        if (typeof z === 'number') { if (!h.done[z]) { h.done[z] = true; if (h.fl[z]) m.ev('flinch', { site: i, at: z }); } }
        else if (!all(h)) m.fault('unexamined');
        else { const bay = z === 'bay', sc = score(h); if (sc >= 4 && !bay) m.fault('back to rig injured'); else if (sc < 4 && bay) m.fault('fit hand pulled'); else { m.finish(i); return; } } } }
      s.prog = s.done ? 1 : 0.85 * h.done.filter(Boolean).length / 5;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const h = m.hands[i], k = h.done.indexOf(false);
      if (k >= 0) return { at: i, hold: h.acc >= 0, look: PTS[k][1] }; return { at: i, hold: h.acc >= 0, look: score(h) >= 4 ? -0.65 : 0.65 }; };
    m.bad = () => ({ at: m.next, hold: m.hands[m.next]?.acc >= 0, look: 0.65 });
    m.view = () => ({ h: m.hands.map(h => [h.bent, h.fl.map(Number).join('')]) });
    m.panel = (i) => { const h = m.hands[i]; if (!h) return null; const pts = PTS.map((p, k) => h.done[k] ? (h.fl[k] ? '✕' : '○') : '·').join(' ');
      return { label: `Lift: ${h.bent ? 'bent back, stiff knees' : 'squatted, straight back'} · points ${pts}`, value: `score ${score(h)}${all(h) ? '' : ' so far'}`, bar: clamp(Math.max(0, h.acc) / press), band: [0.95, 1] }; };
    m.prompt = (i) => { const h = m.hands[i]; if (!h) return ''; const k = h.done.indexOf(false);
      return k >= 0 ? `Aim at the ${PTS[k][0]} and hold [E] to press (neck far left … sacrum far right)` : 'Far left + hold [E]: back to the rig · far right + hold [E]: to sickbay (score 4+)'; };
    return m;
  },
});
