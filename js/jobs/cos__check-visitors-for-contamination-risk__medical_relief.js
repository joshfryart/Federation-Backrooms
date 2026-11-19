// Chief of security: check visitors for contamination risk. Swab each visitor's cheek with small back-and-forth arcs (E held, short gentle
// swings: a hard swing scrapes). Drop the tube in the rack (tap E) and let the scan run to the end: the lamp sometimes flashes green early
// and then settles amber. Only when the scan bar is full: tap E to pass a green visitor, hold E to hold an amber one.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cos', label: 'Check visitors for contamination risk', type: 'task:medical_relief' },
  title: 'Cheek swab and scan lamp', dept: 'security', host: 'room', siteName: 'Step', verb: 'Screen',
  how: 'Hold E and make small gentle arcs to swab the cheek. At the rack tap E to drop the tube and wait for the scan to finish; then tap E to pass a green lamp or hold E to hold the visitor on amber.',
  keys: ['E hold + small swings: swab', 'E tap: drop / pass', 'E hold: hold visitor'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'swab then wait-out', input: 'e-hold+swing+e-tap', win: 'both visitors swabbed with four gentle arcs and judged on the settled scan lamp, amber held and green passed',
    fail: 'scraping with a hard swing, passing a visitor on an early green before the scan ends, or passing on amber',
    rule: 'A swab stroke counts each time a gentle swing changes direction; a hard swing scrapes. The lamp is only true once the scan bar is full: before that a green flash means nothing.' },
  rush: 'Glanced at the arrival slips and waved everyone in.',
  captions: { scraped: 'visitor flinches', 'early pass': 'airlock hisses open', 'amber passed': 'contamination alarm', 'held clean': 'visitor complains', 'swab lifted': 'swab drops' },
  says: { scraped: 'Too hard — gentle little arcs only.', 'early pass': 'The scan had not finished — that green was premature.', 'amber passed': 'The lamp settled amber and you let them through.', 'held clean': 'The lamp settled green — that visitor was clean.', 'swab lifted': 'You lifted the swab mid-way. Start the swab again.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Visitor 1 cheek', prop: null }, { name: 'Sample rack', prop: 'shelving' }, { name: 'Visitor 2 cheek', prop: null }, { name: 'Sample rack (2nd tube)', prop: 'shelving' }]), r = m.rnd;
    const STROKES = 4, SCAN = m.calm ? 3.2 : 2.6, HARD = 1.8;
    const amb = r() < 0.5; m.vis = [0, 1].map(v => { const amber = v === 0 ? amb : (r() < 0.5 ? !amb : amb); return { amber, early: amber && r() < 0.8, eA: rf(r, 0.2, 0.35), eB: rf(r, 0.55, 0.75), strokes: 0, dir: 0, drop: false, scan: 0 }; });
    let held = 0, prev = false;
    const lampOf = (v) => { const p = v.scan / SCAN; if (!v.drop) return 'off'; if (p >= 1) return v.amber ? 'amber' : 'green'; if (v.early && p > v.eA && p < v.eB) return 'green'; return p > 0.4 ? 'amber' : 'off'; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const hold = !!inp.hold, rel = prev && !hold; if (hold) held += dt; prev = hold;
      for (const v of m.vis) if (v.drop) v.scan = Math.min(SCAN, v.scan + dt);
      const s = m.cur(inp); if (!s) { if (!hold) held = 0; return; } const i = m.next, v = m.vis[i >> 1];
      if (i % 2 === 0) { const sw = inp.swing || 0;
        if (hold) { if (Math.abs(sw) > HARD) { m.fault('scraped'); v.strokes = 0; v.dir = 0; } else if (Math.abs(sw) >= 0.3) { const d = Math.sign(sw); if (d !== v.dir) { if (v.dir) v.strokes++; v.dir = d; } } if (v.strokes >= STROKES) m.finish(i); }
        if (rel && v.strokes > 0 && v.strokes < STROKES) { m.fault('swab lifted'); v.strokes = 0; v.dir = 0; } s.prog = s.done ? 1 : v.strokes / STROKES * 0.9; }
      else { const done = v.scan >= SCAN;
        if (!v.drop) { if (rel && held < 0.4) v.drop = true; }
        else if (hold && held >= 1.0 && held < 5) { held = 5; if (!done) m.fault('early pass'); else if (v.amber) m.finish(i); else m.fault('held clean'); }
        else if (rel && held < 0.4) { if (!done) m.fault('early pass'); else if (!v.amber) m.finish(i); else m.fault('amber passed'); }
        s.prog = s.done ? 1 : v.scan / SCAN * 0.9; }
      if (!hold) held = 0;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const v = m.vis[i >> 1];
      if (i % 2 === 0) return { at: i, hold: true, swing: (Math.floor(f / 8) % 2 ? 0.7 : -0.7) };
      if (!v.drop) return { at: i, hold: f % 4 === 0, press: f % 4 === 0 }; if (v.scan < SCAN) return { at: i };
      return v.amber ? { at: i, hold: true } : { at: i, hold: f % 4 === 0, press: f % 4 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 4 === 0, press: f % 4 === 0, swing: 3 });
    m.view = () => ({ vis: m.vis.map(v => [v.amber, v.early, +v.eA.toFixed(2)]) });
    m.panel = (i) => { const v = m.vis[i >> 1]; if (!v) return null; if (i % 2 === 0) return { label: 'Swab strokes', value: `${v.strokes} / ${STROKES}`, bar: v.strokes / STROKES };
      const l = lampOf(v); return { label: `Scan lamp: ${l === 'green' ? '● GREEN' : l === 'amber' ? '▲ AMBER' : '○ off'}`, value: v.scan >= SCAN ? 'scan complete' : v.drop ? 'scanning…' : 'drop the tube', bar: v.scan / SCAN, band: [0.97, 1] }; };
    m.prompt = (i) => { const v = m.vis[i >> 1]; if (!v) return ''; if (i % 2 === 0) return 'Hold [E] and swab with small gentle arcs';
      if (!v.drop) return 'Tap [E] to drop the tube in the rack'; if (v.scan < SCAN) return 'Wait for the scan to finish — the lamp is not set yet';
      return 'Tap [E] to pass on green, hold [E] to hold the visitor on amber'; };
    return m;
  },
});
