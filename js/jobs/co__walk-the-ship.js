// Captain: walk the ship. At each stop a crew member talks to you while they move about. Hold E to stop and talk, and keep your eyes on
// their face (they drift left and right as they work) until they have finished; their reply sets the morale note. Looking away while they
// speak reads as not caring (a fault), and letting go before they finish is walking off mid-sentence (a fault).
import { define, machine, room, rf, pick, shuffle, clamp } from './kit.js';

const CREW = ['Ens. Okafor', 'Lt. Varga', "Crewman T'Lin", 'PO Brannock', 'Ens. Mirov', 'Lt. Achebe', 'Crewman Duvall', 'Ens. Raske'];
const SAY = ['Double shifts are wearing on us, sir.', 'The new rota is working well.', 'Replicator on deck six keeps failing.', 'Quiet week — good to see you down here.', 'We could use a spare tech.', 'Pumps sound rough at full flow.'];

export default define({
  job: { billet: 'co', label: 'Walk the ship', type: 'loop' },
  title: 'Eye-contact morale walk', dept: 'command', host: 'room', siteName: 'Stop', verb: 'Greet',
  how: 'At each stop hold E to talk with the crew member and keep looking at their face as they move about, until they finish speaking; then walk on.',
  keys: ['E hold: talk', 'look: keep their face in view'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'hold eye contact', input: 'e-hold+look', win: 'each crew member heard out to the end of their reply while their moving face stays in view',
    fail: 'glancing away while someone is talking, or letting go and walking off before the reply is finished',
    rule: 'Hold E to talk. The reply only advances while your view is on the face marker, which drifts as they work; off it for over half a second is a fault. Let go only when the reply is done.' },
  rush: 'Nodded at a few faces on the way to the mess and called it a walkabout.',
  captions: { 'looked away': 'conversation falters', 'walked off': 'footsteps leaving' },
  says: { 'looked away': 'They trail off — you were looking past them. Keep your eyes on their face.', 'walked off': 'You walked off mid-sentence. Hear them out before moving on.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Corridor crewman', prop: 'table' }, { name: 'Warp core rail', prop: 'console' }, { name: 'Sickbay ward doors', prop: 'nursestation' }, { name: 'Mess table', prop: 'card_table' }]), r = m.rnd;
    const tol = m.calm ? 0.26 : 0.18, names = shuffle(r, CREW);
    m.talk = m.sites.map((_, i) => ({ who: names[i], say: pick(r, SAY), b0: rf(r, -0.25, 0.25), amp: rf(r, 0.12, 0.28), w: rf(r, 0.9, 1.6), ph: rf(r, 0, 6), need: rf(r, 2.3, 3.2), heard: 0, off: 0 }));
    m.face = (k) => { const c = m.talk[k]; return c.b0 + c.amp * Math.sin(m.t * c.w + c.ph); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, c = m.talk[i];
      if (inp.hold) {
        const on = Math.abs((inp.look || 0) - m.face(i)) < tol;
        if (on) { c.heard += dt; c.off = 0; } else if (c.heard > 0) { c.off += dt; if (c.off > 0.5) { m.fault('looked away'); c.off = 0; c.heard = Math.max(0, c.heard - 1); } }
        if (c.heard >= c.need) { m.ev('note', { site: i }); m.finish(i); return; }
      }
      if (rel && c.heard > 0.1) { m.fault('walked off'); c.heard = 0; }
      s.prog = clamp(c.heard / c.need * 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, hold: true, look: m.face(i) }; };
    m.bad = () => { const i = m.next; return { at: i, hold: true, look: m.face(Math.max(0, i)) + 0.7 }; };
    m.view = () => ({ talk: m.talk.map(c => [c.who, c.say, +c.b0.toFixed(2), +c.need.toFixed(2)]) });
    m.panel = (i) => { const c = m.talk[i]; if (!c) return null; const f = m.face(i); return { label: `${c.who} — face ${f > 0.03 ? '◀ left' : f < -0.03 ? 'right ▶' : 'ahead'} ${Math.abs(f).toFixed(2)}`, value: c.heard >= c.need * 0.5 ? `"${c.say}"` : 'talking…', bar: c.heard / c.need }; };
    m.prompt = (i) => { const c = m.talk[i]; return !c ? '' : `Hold [E] to talk with ${c.who}; keep your view on their face until they finish`; };
    return m;
  },
});
