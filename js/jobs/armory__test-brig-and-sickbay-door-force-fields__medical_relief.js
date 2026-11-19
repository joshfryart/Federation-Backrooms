// Armory, medical relief: test the sickbay and brig door force-fields. Hold the field tester's sensor to the door frame at hip height, then at
// shoulder height. A sound field buzzes on a steady pulse; tap E in time with each of four pulses to take the reading. A flickering field drops
// a pulse: do not tap into the gap. When the four-pulse reading of a flickering corner ends, hold E to log the dip on the door card for the
// Deputy. Tapping off the pulse, or letting a pulse go by untapped, is a fault.
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'armory', label: 'Test brig and sickbay door force-fields', type: 'task:medical_relief' },
  title: 'Door-field pulse reading', dept: 'security', host: 'room', siteName: 'Frame', verb: 'Read',
  how: 'Tap E in time with each buzz pulse of the field, four pulses per frame point. If a pulse drops out, leave the gap untapped, then hold E afterwards to log the dip.',
  keys: ['E tap: on each pulse', 'E hold: log a dip'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'tap the buzz', input: 'e-tap+e-hold+rhythm', win: 'four field pulses tapped on time at hip and shoulder of both doors, with every dropped pulse left alone and logged as a dip',
    fail: 'tapping between pulses or into a dropped pulse, letting a pulse pass untapped, or leaving a flickering corner unlogged',
    rule: 'The panel flashes BUZZ on each pulse of a steady beat: tap E on it. A missing pulse means the field flickers: no tap there, then hold E once the reading ends.' },
  rush: 'Waved a hand through each doorway and felt it push back.',
  captions: { 'off the buzz': 'tester squawks', 'missed a pulse': 'field buzz', 'dip unlogged': 'indicator flickers' },
  says: { 'off the buzz': 'That tap was off the pulse (or into a dropped one). Tap only on BUZZ.', 'missed a pulse': 'A pulse went by untapped. Tap E on each BUZZ.', 'dip unlogged': 'A pulse dropped there. Hold E to log the dip on the door card.' },
  create(seed, opts) {
    const names = ['Sickbay door, hip height', 'Sickbay door, shoulder height', 'Brig door, hip height', 'Brig door, shoulder height'];
    const m = room(machine(this, seed, opts), names.map((n, i) => ({ name: n, prop: i < 2 ? 'airlock_doors' : 'cellfield' }))), r = m.rnd;
    const win = m.calm ? 0.18 : 0.12, flick = ri(r, 0, 3), flick2 = r() < 0.4 ? (flick + 2) % 4 : -1;
    m.pts = names.map((_, i) => { const P = rf(r, 0.55, 0.7) * (m.calm ? 1.2 : 1), drop = i === flick || i === flick2 ? ri(r, 1, 3) : -1; return { P, drop, tt: 0, hit: [0, 0, 0, 0], st: 'read', h: 0, w: 0 }; });
    const Q = () => m.pts[m.next];
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const q = Q();
      if (q.st === 'read') {
        q.tt += dt;
        if (inp.press) { const k = [0, 1, 2, 3].find(k => k !== q.drop && !q.hit[k] && Math.abs(q.tt - q.P * (k + 1)) < win); if (k == null) m.fault('off the buzz'); else q.hit[k] = 1; }
        for (let k = 0; k < 4; k++) if (k !== q.drop && !q.hit[k] && q.tt > q.P * (k + 1) + win) { q.hit[k] = 2; m.fault('missed a pulse'); }
        if (q.tt > q.P * 4 + win) { if (q.drop < 0) { m.finish(m.next); return; } q.st = 'dip'; q.w = 0; }
      } else {
        q.w += dt; q.h = inp.hold ? q.h + dt : 0;
        if (q.h >= 0.8) { m.ev('dip logged'); m.finish(m.next); return; }
        if (q.w > (m.calm ? 4 : 3)) { m.fault('dip unlogged'); q.w = 0; }
      }
      s.prog = s.done ? 1 : q.st === 'dip' ? 0.6 + clamp(q.h / 0.8) * 0.3 : clamp(q.tt / (q.P * 4)) * 0.6;
    };
    m.hint = () => {
      const q = Q(); if (!q) return { at: -1 };
      if (q.st === 'dip') return { at: m.next, hold: true };
      const k = [0, 1, 2, 3].find(k => k !== q.drop && !q.hit[k] && Math.abs(q.tt + 1 / 60 - q.P * (k + 1)) < 0.04);
      return { at: m.next, press: k != null, hold: k != null };
    };
    m.bad = (f = 0) => ({ at: m.next, press: f % 7 === 0, hold: f % 7 === 0 });
    m.view = () => ({ pts: m.pts.map(q => [+q.P.toFixed(2), q.drop]) });
    m.panel = (i) => {
      const q = m.pts[i]; if (!q) return null;
      if (q.st === 'dip') return { label: 'PULSE DROPPED', value: 'hold to log the dip', bar: clamp(q.h / 0.8) };
      const ph = q.tt / q.P, k = Math.round(ph) - 1, on = k >= 0 && k < 4 && k !== q.drop && Math.abs(q.tt - q.P * (k + 1)) < 0.08;
      return { label: on ? 'BUZZ' : '·', value: `pulses ${q.hit.filter(x => x === 1).length} / ${q.drop < 0 ? 4 : 3}`, bar: on ? 1 : 0.1 };
    };
    m.prompt = (i) => { const q = m.pts[i]; return !q ? '' : q.st === 'dip' ? 'A pulse dropped: hold [E] to log the dip on the door card' : 'Tap [E] on each BUZZ pulse; leave any gap untapped'; };
    return m;
  },
});
