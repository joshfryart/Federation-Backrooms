// Medical technician: baseline scans on duty crew. Hold the scanner trigger (E) and pan the view slowly across the crew member standing on the
// marked spot: face, chest, palms. The scan only advances while you pan, it stops at each marked point until you hold still long enough for
// the reading to lock, and a pan faster than the scanner can sample throws the whole sweep away (re-scan from the face).
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const CREW = ['Ensign Vale', 'Lt Okafor', 'Crewman Diaz', 'Ensign Holt', 'Lt Saavik-Ro', 'Petty Officer Ng'];
export default define({
  job: { billet: 'medtech', label: 'Run baseline scans on duty crew on request', type: 'task:quiet_watch' },
  title: 'Slow scanner sweep with lock points', dept: 'medical', host: 'room', item: 'tricorder_med', siteName: 'Crew member', verb: 'Scan',
  how: 'Hold E and pan your view slowly across the crew member. At each marked point (face, chest, palms) stop and hold still until the reading locks. Pan too fast and the sweep is lost.',
  keys: ['E hold: scanner on', 'pan slowly', 'hold still at each mark'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'slow sweep', input: 'e-hold+swing', win: 'each crew member swept face to palms at sampling pace with the reading locked at every marked point',
    fail: 'panning faster than the scanner samples so the sweep is thrown away and must restart',
    rule: 'Scan progress grows only while E is held and the view pans. At a mark it stops: keep the view still for half a second to lock. A pan faster than the pace line resets the sweep.' },
  rush: 'Waved the scanner past them once and filed whatever it showed.',
  captions: { 'too fast': 're-scan chirp' }, says: { 'too fast': 'Too fast — the scanner lost the sample. Start the sweep again from the face, slower.' },
  create(seed, opts) {
    const names = (r) => shuffle(r, CREW).slice(0, 3);
    const m = machine(this, seed, opts), r = m.rnd, who = names(r); room(m, [{ name: who[0], prop: 'biobed' }, { name: who[1], prop: 'exam_couch' }, { name: who[2], prop: 'nursestation' }]);
    const fast = m.calm ? 1.15 : 0.95, lockT = m.calm ? 0.4 : 0.5;
    m.sw = who.map(() => ({ pts: [rf(r, 0.14, 0.24), rf(r, 0.42, 0.56), rf(r, 0.72, 0.84)], pos: 0, lk: 0, still: 0, drift: +rf(r, -3, 3).toFixed(1) }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, u = m.sw[i], sp = Math.abs(inp.swing || 0);
      if (!inp.hold) { u.still = 0; return; }
      if (sp > fast) { m.fault('too fast'); u.pos = 0; u.lk = 0; u.still = 0; s.prog = 0; return; }
      const stop = u.lk < 3 ? u.pts[u.lk] : 1;
      if (u.lk < 3 && u.pos >= stop) { if (sp < 0.15) { u.still += dt; if (u.still >= lockT) { u.lk++; u.still = 0; } } else u.still = 0; }
      else { u.pos = Math.min(stop, u.pos + sp * dt * 0.6); if (u.lk >= 3 && u.pos >= 1) { m.finish(i); return; } }
      s.prog = clamp(u.pos * 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.sw[i], atMark = u.lk < 3 && u.pos >= u.pts[u.lk]; return { at: i, hold: true, swing: atMark ? 0 : -0.6 }; };
    m.bad = () => { const i = m.next; return i < 0 ? { at: -1 } : { at: i, hold: true, swing: -1.8 }; };
    m.view = () => ({ who, p: m.sw.map(u => u.pts.map(x => +x.toFixed(2))) });
    const MK = ['face', 'chest', 'palms'];
    m.panel = (i) => { const u = m.sw[i]; if (!u) return null; const atMark = u.lk < 3 && u.pos >= u.pts[u.lk];
      return { label: atMark ? `Hold still: locking ${MK[u.lk]}` : u.lk < 3 ? `Pan slowly to the ${MK[u.lk]} mark` : 'Pan off the palms', value: atMark ? `${Math.round(u.still / lockT * 100)} %` : `${u.lk}/3 locked`, bar: u.pos, band: u.lk < 3 ? [u.pts[u.lk] - 0.02, u.pts[u.lk] + 0.02] : [0.97, 1] }; };
    m.prompt = (i) => { const u = m.sw[i]; return !u ? '' : u.lk < 3 && u.pos >= u.pts[u.lk] ? 'Keep [E] held and the view still until the reading locks' : 'Hold [E] and pan the view slowly across them'; };
    return m;
  },
});
