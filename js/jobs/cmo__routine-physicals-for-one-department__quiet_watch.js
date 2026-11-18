// CMO: routine physicals. For each crew member, listen at four chest positions in the order on the card: aim at the position and hold E
// steady through two full breaths (drifting off restarts that position; listening at a position out of order is a skipped spot, a fault).
// Then test the knee reflex: tap E as the swinging hammer meets the tendon mark.
import { define, machine, room, shuffle, rf } from './kit.js';

const POS = [['upper left', 0.28], ['upper right', -0.28], ['lower left', 0.12], ['lower right', -0.12]];
export default define({
  job: { billet: 'cmo', label: 'Routine physicals for one department', type: 'task:quiet_watch' },
  title: 'Stethoscope and reflex physical', dept: 'medical', host: 'room', siteName: 'Crew member', verb: 'Examine',
  how: 'At each crew member aim at the chest position the card names and hold E still for two breaths, all four in order; then tap E as the reflex hammer meets the knee mark.',
  keys: ['Aim with the view', 'E hold: listen', 'E tap: reflex hammer'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'auscultate', input: 'e-hold+e-tap+look', win: 'every crew member heard at four chest positions in order for two breaths each and their reflex struck on the mark',
    fail: 'listening at a position out of the card order, or striking the knee off the tendon mark',
    rule: 'Aim at the named position and hold E: the breath counter needs two full breaths without your aim drifting. Positions go in the card order. Then the hammer swings: tap E when it crosses the knee mark.' },
  rush: 'Listened once through the uniform and signed the department off fit.',
  captions: { 'skipped a spot': 'card rustles', 'missed the tendon': 'patient flinches' }, says: { 'skipped a spot': 'Wrong position — follow the card order.', 'missed the tendon': 'Missed the tendon — wait for the hammer to cross the mark.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crew member 1', prop: 'exam_couch' }, { name: 'Crew member 2', prop: 'biobed' }, { name: 'Crew member 3', prop: 'nursestation' }]), r = m.rnd;
    const tol = m.calm ? 0.06 : 0.045, breath = m.calm ? 1.0 : 0.8, win = m.calm ? 0.16 : 0.11;
    m.pts = m.sites.map(() => ({ order: shuffle(r, [0, 1, 2, 3]), k: 0, held: 0, phase: rf(r, 0, 1), period: rf(r, 1.0, 1.4) }));
    const aimAt = (look) => POS.findIndex(([, b]) => Math.abs((look || 0) - b) < tol);
    const swing = (p) => (m.t / p.period + p.phase) % 1;   // the hammer: mark at 0.5
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, p = m.pts[i];
      if (p.k < 4) {
        const a = aimAt(inp.look), want = p.order[p.k];
        if (inp.hold && a >= 0 && a !== want && a !== p.order[p.k - 1]) { m.fault('skipped a spot'); p.held = 0; return; }
        if (inp.hold && a === want) { p.held += dt; if (p.held >= 2 * breath) { p.k++; p.held = 0; } } else p.held = 0;
      } else if (inp.press) { if (Math.abs(swing(p) - 0.5) <= win / 2) { m.finish(i); return; } m.fault('missed the tendon'); }
      s.prog = s.done ? 1 : (p.k + p.held / (2 * breath)) / 5;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pts[i]; if (p.k < 4) return { at: i, hold: true, look: POS[p.order[p.k]][1] }; return { at: i, press: Math.abs(swing(p) - 0.5) < win / 4 }; };
    m.bad = (f = 0) => { const i = m.next, p = m.pts[i]; return p.k < 4 ? { at: i, hold: true, look: POS[p.order[(p.k + 1) % 4]][1] } : { at: i, press: f % 9 === 0 }; };
    m.view = () => ({ order: m.pts.map(p => p.order) });
    m.panel = (i) => { const p = m.pts[i]; if (!p) return null; return p.k < 4 ? { label: `Listen: ${POS[p.order[p.k]][0]}`, value: `breaths ${Math.floor(p.held / breath)}/2`, bar: p.held / (2 * breath) } : { label: 'Reflex', value: 'tap at the mark', bar: swing(p), band: [0.5 - win / 2, 0.5 + win / 2] }; };
    m.prompt = (i) => { const p = m.pts[i]; return !p ? '' : p.k < 4 ? `Aim at ${POS[p.order[p.k]][0]} of the chest and hold [E] for two breaths` : 'Tap [E] as the hammer crosses the knee mark'; };
    return m;
  },
});
