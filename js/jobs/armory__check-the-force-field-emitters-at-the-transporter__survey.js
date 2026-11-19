// Armory, survey mission: the transporter pad's emitter posts, clockwise. At each post the containment seam is tested with a feeler stack: tap E
// to slide in the next blade, one size up each time (1 to 6). When a blade binds, the gap is narrower than that blade; a bind at or below the
// finger blade (4) means the seam holds and is logged. If the finger blade slides in, the gap would pass a finger: hold E to hang a breach tag.
// Ram the blades in too fast and one bends; tag a seam that held, or carry on past a finger gap, and it is a fault.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const FINGER = 4;
export default define({
  job: { billet: 'armory', label: 'Check the force-field emitters at the transporter', type: 'task:survey' },
  title: 'Pad seam feeler stack', dept: 'security', host: 'room', siteName: 'Post', verb: 'Feel',
  how: 'Tap E to slide the next feeler blade into the post seam, one size up each time, pausing between blades. A bind at blade 4 or below: the seam holds. If blade 4 (a finger\'s width) slides in, hold E to tag the breach.',
  keys: ['E tap: next blade', 'E hold: breach tag'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'step the feelers', input: 'e-tap+e-hold', win: 'each pad post seam gauged with rising feeler blades until one binds, and every seam that takes the finger blade breach-tagged',
    fail: 'ramming blades in back to back so one bends, tagging a seam that bound below the finger blade, or pushing on past a finger-width gap',
    rule: 'Tap E for the next blade size, at least a beat apart. BINDS at 4 or under: logged. Blade 4 SLIDES: hold E for a second to tag the breach instead of trying blade 5.' },
  rush: 'Ran a thumb down each post seam and logged the pad green.',
  captions: { 'bent a blade': 'feeler blade pings', 'false breach': 'tag tears off', 'breach not tagged': 'pad field hiccups' },
  says: { 'bent a blade': 'Too quick: let each blade come out before the next goes in.', 'false breach': 'That seam bound below the finger blade; it holds. No tag.', 'breach not tagged': 'Blade 4 slid in: that is a finger gap. Hold E to tag it, do not keep going.' },
  create(seed, opts) {
    const posts = ['North post', 'East post', 'South post', 'West post'];
    const m = room(machine(this, seed, opts), posts.map(n => ({ name: `${n} seam`, prop: 'beampedestal' }))), r = m.rnd;
    const br = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, r() < 0.5 ? 1 : 2)), gapMin = m.calm ? 0.2 : 0.3;
    m.seams = posts.map((_, i) => ({ gap: br.has(i) ? rf(r, 4.2, 5.6) : rf(r, 0.6, 3.6), b: 0, st: 'feel', last: 9, held: 0 }));
    const S = () => m.seams[m.next];
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const q = S(); q.last += dt;
      if (inp.hold) { if (q.held >= 0) q.held += dt; }
      if (inp.hold && q.held >= 0.8) {
        q.held = -1; if (q.st === 'breach') { m.ev('tagged'); m.finish(m.next); return; } m.fault('false breach');
      }
      if (rel) {
        if (q.held > 0 && q.held < 0.3) {
          if (q.st === 'breach') m.fault('breach not tagged');
          else if (q.last < gapMin) m.fault('bent a blade');
          else { q.b++; q.last = 0; m.ev('blade', { b: q.b }); if (q.b > q.gap) { m.ev('binds'); m.finish(m.next); return; } if (q.b >= FINGER) q.st = 'breach'; }
        }
        q.held = 0;
      }
      s.prog = s.done ? 1 : clamp(q.b / 6) * 0.9;
    };
    m.hint = (f = 0) => { const q = S(); if (!q) return { at: -1 }; if (q.st === 'breach') return { at: m.next, hold: true }; return { at: m.next, hold: f % 12 < 2, press: f % 12 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 40 < 30, press: f % 40 === 0 });
    m.view = () => ({ gaps: m.seams.map(q => +q.gap.toFixed(2)) });
    m.panel = (i) => {
      const q = m.seams[i]; if (!q) return null;
      return { label: q.st === 'breach' ? 'FINGER GAP — tag it' : q.b ? `Blade ${q.b} SLIDES` : 'Feeler stack', value: q.b ? `${q.b} mm in, next ${q.b + 1}` : 'tap for blade 1', bar: q.b / 6, band: [0, FINGER / 6] };
    };
    m.prompt = (i) => { const q = m.seams[i]; return !q ? '' : q.st === 'breach' ? 'Blade 4 slid in: hold [E] to hang the breach tag' : 'Tap [E] for the next feeler blade; pause between blades'; };
    return m;
  },
});
