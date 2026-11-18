// Pilot: shuttle preflight walk-around. Clockwise round the hull from the nose, crouching at each seal and running a gloved finger round the
// gasket. The finger only feels anything if it travels slowly and in one piece, left to right: skim it fast and you feel nothing (a fault),
// lift it off part way and the seal is signed un-walked (a fault). Where the gasket snags (a crack or a lifted lip) you must dwell until it
// is felt and noted before moving on. The far-side seal is on the route, so it cannot be skipped.
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

const BINS = 8, SPAN = 0.45;
const centre = (b) => SPAN - (b + 0.5) * (2 * SPAN / BINS);

export default define({
  job: { billet: 'pilot', label: 'Shuttle preflight walk-around', type: 'loop' },
  title: 'Gloved finger round the gaskets', dept: 'flight', host: 'room', siteName: 'Seal', verb: 'Feel',
  how: 'At each seal on the walk round, hold E and slide your view slowly from the left end of the gasket to the right. Where it snags, stop until the snag is noted, then carry on to the end and let go.',
  keys: ['E hold: finger on the gasket', 'turn the view slowly left to right'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'finger the gasket', input: 'e-hold+look+swing',
    win: 'every hatch seal and nozzle gasket on the clockwise route felt end to end with each snag noted',
    fail: 'skimming the finger too fast to feel the rubber, or lifting off part way so a seal is signed without being walked',
    rule: 'Hold E and pan the view from the gasket\'s left end to its right end slower than the feel limit; pause on any SNAG until it is noted; let go only at the far end.' },
  rush: 'Glanced at each seal from standing height and signed the card.',
  captions: { skimmed: 'glove squeaks', 'signed unwalked': 'pen scratch', snag: 'glove catches' },
  says: { skimmed: 'Too fast: your glove skated over the gasket and felt nothing. Slow the sweep down.', 'signed unwalked': 'You lifted off part way: that seal is not walked. Start it again from the left end.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Nose hatch seal', prop: 'shuttle' }, { name: 'Port thruster gasket', prop: 'maint_stand' },
      { name: 'Far-side hatch seal', prop: 'shuttle' }, { name: 'Fuel cover gasket', prop: 'workpod' }]), r = m.rnd;
    const cap = m.calm ? 1.3 : 0.95, need = m.calm ? 0.3 : 0.4;
    const cracked = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.seals = m.sites.map((_, i) => ({ snag: cracked.has(i) ? ri(r, 1, BINS - 2) : -1, wear: +rf(r, 0.1, 0.6).toFixed(2), got: 0, dwell: 0, skim: false, noted: false }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, g = m.seals[i];
      if (inp.hold) {
        if (Math.abs(inp.swing || 0) > cap) { if (!g.skim) { g.skim = true; m.fault('skimmed'); g.got = 0; g.dwell = 0; } }
        else if (!g.skim && g.got < BINS) {
          const look = inp.look || 0;
          if (Math.abs(look - centre(g.got)) < SPAN / BINS) { g.dwell += dt; const want = g.got === g.snag ? need : 0.04;
            if (g.got === g.snag && g.dwell > 0.05 && !g.noted) m.ev('snag', { site: i });
            if (g.dwell >= want) { if (g.got === g.snag) g.noted = true; g.got++; g.dwell = 0; } }
        }
      }
      if (rel) { if (g.got >= BINS && !g.skim) { m.finish(i); return; } if (g.got > 0 && !g.skim) m.fault('signed unwalked'); g.got = 0; g.dwell = 0; g.skim = false; g.noted = false; }
      s.prog = s.done ? 1 : clamp(g.got / BINS) * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const g = m.seals[i]; return g.got >= BINS ? { at: i, hold: false } : { at: i, hold: true, look: centre(g.got), swing: -0.4 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 20 < 12, look: 0, swing: -2.5 });
    m.view = () => ({ seals: m.seals.map(g => [g.snag, g.wear]) });
    m.panel = (i) => { const g = m.seals[i]; if (!g) return null; const on = g.got === g.snag && !g.noted && g.got < BINS;
      return { label: g.skim ? 'SKIMMED' : on ? 'SNAG' : 'Gasket felt', value: g.skim ? 'let go, start again' : on ? 'hold still here…' : `${g.got} / ${BINS}`, bar: g.got / BINS }; };
    m.prompt = (i) => { const g = m.seals[i]; return !g ? '' : g.skim ? 'Too fast. Let go of [E] and start from the left end' : g.got >= BINS ? 'Gasket walked: let go of [E] to tick it'
      : g.got === g.snag && !g.noted ? 'Snag under your glove: hold still until it is noted' : 'Hold [E] and slide slowly left to right along the gasket'; };
    return m;
  },
});
