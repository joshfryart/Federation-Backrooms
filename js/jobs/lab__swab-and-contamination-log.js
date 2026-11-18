// Lab technician: swab and contamination log. Each zone's culture plate is read against the lamp: pan the view slowly across the plate and a
// faint colony only shows on the panel when it is under your eye AND you are moving slowly (a fast pan glides past it). Tap E on each colony to
// ring it. Once the whole plate has been panned slowly, tap E on clear agar to write the zone's log line. Tapping clear agar to ring a
// "colony" is a phantom; logging with a colony un-ringed is the copied-yesterday mistake.
import { define, machine, room, ri, rf, clamp } from './kit.js';

const BINS = 10, binOf = (look) => clamp(Math.floor((look + 0.5) * BINS), 0, BINS - 1);
export default define({
  job: { billet: 'lab', label: 'Swab and contamination log', type: 'loop' },
  title: 'Slow-pan the culture plates', dept: 'sciences', host: 'room', siteName: 'Plate', verb: 'Read',
  how: 'At each plate pan your view slowly from edge to edge: faint growth only shows when you move slowly over it. Tap E on each colony you see, then once the whole plate is read tap E on clear agar to log the zone.',
  keys: ['look slowly across the plate', 'E tap: ring a colony', 'E tap on clear agar: log the zone'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'slow-pan and ring', input: 'e-tap+look+turn', win: 'every zone plate panned edge to edge at reading speed, each faint colony ringed and the zone logged',
    fail: 'logging a plate with a colony left un-ringed, or ringing clear agar as growth',
    rule: 'Pan slowly across the plate: a colony shows only while it is under your eye and your view is turning slowly. Tap E on it. When the read bar is full, tap E on clear agar to log clear or growth.' },
  rush: 'Copied yesterday\'s line into the log: all zones clear.',
  captions: { 'missed growth': 'log rejected', phantom: 'pen scratch' },
  says: { 'missed growth': 'There was growth on that plate you did not ring. Pan slowly and look again.', phantom: 'Nothing there but clear agar.', 'too fast': '' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bench zone plate', prop: 'labbench' }, { name: 'Fridge handle plate', prop: 'samplefridge' }, { name: 'Fume hood plate', prop: 'fumehood' }]), r = m.rnd, w = m.calm ? 0.07 : 0.05;
    m.plates = m.sites.map(() => { const n = ri(r, 0, 2), spots = []; while (spots.length < n) { const a = rf(r, -0.4, 0.4); if (spots.every(s => Math.abs(s.a - a) > 0.2)) spots.push({ a, rung: false }); } return { spots, seen: new Array(BINS).fill(false) }; });
    const under = (p, look) => p.spots.find(s => Math.abs(s.a - look) < w);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, p = m.plates[i], look = inp.look || 0, slow = (inp.turn || 0) < 0.6;
      m.eye = slow ? under(p, look) : null;
      if (slow && Math.abs(look) <= 0.5) p.seen[binOf(look)] = true;
      if (inp.press) {
        const sp = slow ? under(p, look) : null;
        if (sp) { if (!sp.rung) { sp.rung = true; m.ev('ring', { site: i }); } }
        else if (p.seen.every(Boolean)) { if (p.spots.some(x => !x.rung)) { m.fault('missed growth'); p.seen.fill(false); } else { m.finish(i); return; } }
        else m.fault('phantom');
      }
      s.prog = s.done ? 1 : clamp(p.seen.filter(Boolean).length / BINS * 0.9, 0, 0.9);
    };
    // hinted player: pan left to right slowly (≈0.3 rad/s), tap on each colony as it shows, tap on clear agar at the far edge to log
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const p = m.plates[i];
      if (!p.seen.every(Boolean) || p.spots.some(x => !x.rung)) {
        const look = clamp(-0.5 + ((f * 0.012) % 1.0), -0.5, 0.5), sp = under(p, look);
        return { at: i, look, turn: 0.36, press: !!(sp && !sp.rung && f % 3 === 0) };
      }
      return { at: i, look: 0.49, turn: 0.1, press: f % 4 === 0 };
    };
    m.bad = (f = 0) => ({ at: m.next, look: 0.49, turn: 2, press: f % 5 === 0 });
    m.view = () => ({ spots: m.plates.map(p => p.spots.map(s => +s.a.toFixed(2))) });
    m.panel = (i) => { const p = m.plates[i]; if (!p) return null; const read = p.seen.filter(Boolean).length / BINS, rung = p.spots.filter(s => s.rung).length; return { label: m.eye && i === m.next ? (m.eye.rung ? 'Colony (ringed)' : 'COLONY under eye') : `Plate read ${Math.round(read * 100)} %`, value: `${rung} ringed`, bar: read }; };
    m.prompt = (i) => { const p = m.plates[i]; if (!p) return ''; return p.seen.every(Boolean) ? 'Plate read: tap [E] on each colony, then on clear agar to log' : 'Pan slowly across the plate; tap [E] on any colony that shows'; };
    return m;
  },
});
