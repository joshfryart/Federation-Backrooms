// Chief engineer: routine core and grid walk-round (quiet watch). At each stop the field hum plays against the reference tone. Hold E and turn
// your view to wind the pitch dial: the two tones beat against each other, slower as they come together. Hold the beat nearly still to lock
// the hum's pitch. Then compare it with last watch's figure: within the limit, let go to log normal; past it, flick your view hard toward the
// comm panel (E still held) to call the XO. Calling every dial "in range" while the hum has shifted is the watch's mistake.
import { define, machine, room, ri, rf, pick, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'ce', label: 'Routine core and grid walk-round', type: 'task:quiet_watch' },
  title: 'Field hum beat matching', dept: 'engineering', host: 'room', item: 'flashlight', siteName: 'Stop', verb: 'Listen',
  how: 'Hold E and turn your view to wind the pitch dial until the beat against the hum almost stops. Then compare with last watch: in limit, let go to log normal; shifted, flick your view hard with E held to call the XO.',
  keys: ['E hold + turn: wind the pitch dial', 'let go: log normal', 'E held + hard flick: call the XO'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'null the beat', input: 'e-hold+swing', win: 'the hum pitch locked at every stop by stilling the beat, and each shift past last watch\'s limit called to the XO',
    fail: 'winding the dial so far off the hum that the note is lost, logging a shifted hum as normal, or calling the XO over a hum within limit',
    rule: 'Turning the view with E held winds the dial; the beat rate is the gap between dial and hum. Keep it under one beat a second for a moment to lock. Locked: release to log normal, or flick hard (E held) if the pitch moved past the limit since last watch.' },
  rush: 'Glanced at the dials, all in range, and logged the watch as normal.',
  captions: { 'lost the note': 'tones clash', 'drift logged normal': 'hum wavers', 'false call': 'XO: "all in range, Chief"' },
  says: { 'lost the note': 'The dial is far off the hum — the beat is a jangle. Wound back to the reference; listen for the beat slowing.', 'drift logged normal': 'The hum had moved past last watch\'s limit. That needed a call to the XO.', 'false call': 'That hum was within limit of last watch — no call needed.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Containment rail', prop: 'warpcore' }, { name: 'Field strength dial', prop: 'fieldgen' }, { name: 'Injector panel', prop: 'reactorstation' }, { name: 'Breaker lamp line', prop: 'relayrack' }]), r = m.rnd;
    const REF = 440, lim = 3, still = m.calm ? 1.3 : 0.9, lockT = m.calm ? 0.9 : 1.2, moved = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.stops = m.sites.map((_, i) => { const shift = moved.has(i) ? pick(r, [-1, 1]) * rf(r, 4.5, 7) : pick(r, [-1, 1]) * rf(r, 0, 2); const last = REF + rf(r, -6, 6);
      return { hum: last + shift, last, dial: REF, lock: 0, phase: 'tune', shifted: Math.abs(shift) > lim }; });
    const humAt = (s) => s.hum + 0.25 * Math.sin(m.t * 2);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const st = m.cur(inp), rel = m.released(inp); if (!st) return; const i = m.next, s = m.stops[i], sw = inp.swing || 0;
      if (s.phase === 'tune') {
        if (inp.hold) { s.dial -= clamp(sw, -1.4, 1.4) * 6 * dt; const beat = Math.abs(s.dial - humAt(s));
          if (beat > 12) { m.fault('lost the note'); s.dial = REF; s.lock = 0; } else if (beat < still) { s.lock += dt; if (s.lock >= lockT) { s.phase = 'judge'; s.dial = s.hum; } } else s.lock = 0; }
        else s.lock = 0;
      } else {
        if (inp.hold && Math.abs(sw) > 1.6) { if (s.shifted) m.finish(i); else { m.fault('false call'); s.phase = 'tune'; s.lock = 0; s.dial = REF; } }
        else if (rel) { if (!s.shifted) m.finish(i); else { m.fault('drift logged normal'); s.phase = 'tune'; s.lock = 0; s.dial = REF; } }
      }
      if (!st.done) st.prog = s.phase === 'judge' ? 0.8 : clamp(0.7 - Math.abs(s.dial - s.hum) / 20, 0, 0.7);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const s = m.stops[i];
      if (s.phase === 'tune') return { at: i, hold: true, swing: -clamp((s.hum - s.dial) / 2, -1.2, 1.2) };
      return s.shifted ? { at: i, hold: true, swing: 2.2 } : { at: i, hold: false, swing: 0 }; };
    m.bad = () => ({ at: m.next, hold: true, swing: 1.3 });
    m.view = () => ({ stops: m.stops.map(s => [+s.hum.toFixed(2), +s.last.toFixed(2)]) });
    m.panel = (i) => { const s = m.stops[i]; if (!s) return null; const beat = Math.abs(s.dial - humAt(s));
      return s.phase === 'tune' ? { label: 'Beat against the hum', value: beat > 12 ? 'jangle' : `${beat.toFixed(1)} per s`, bar: clamp(1 - beat / 12), band: [1 - still / 12, 1] }
        : { label: `Hum ${s.hum.toFixed(1)} Hz · last watch ${s.last.toFixed(1)} Hz`, value: `moved ${Math.abs(s.hum - s.last).toFixed(1)} Hz (limit ${lim})`, bar: clamp(Math.abs(s.hum - s.last) / 8), band: [0, lim / 8] }; };
    m.prompt = (i) => { const s = m.stops[i]; return !s ? '' : s.phase === 'tune' ? 'Hold [E] and turn your view to wind the dial until the beat slows to a stop' : 'Moved past the limit? Flick your view hard with [E] held to call the XO. Within it? Let go to log normal'; };
    return m;
  },
});
