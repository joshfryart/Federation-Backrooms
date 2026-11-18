// Chief of security: test the brig force field and sensors. Hold the field meter flat on each of three grid points (E held, view still) until
// the needle settles, then let go to note it. Pull the panel lever to drop the field and let it go to bring it back: one point's needle stays
// low after recovery although the lamp shows green. At the brig slate, tap E once per number of that point, then hold E to write it.
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cos', label: 'Test brig force field and sensors', type: 'task:quiet_watch' },
  title: 'Field meter, lever and slate', dept: 'security', host: 'room', item: 'tricorder_sec', siteName: 'Point', verb: 'Meter',
  how: 'Hold E with your view still on each grid point until the needle settles, then let go. Hold the lever down, let it go, and watch which needle stays low. At the slate tap E that point\'s number of times, then hold E.',
  keys: ['E hold, view still: read', 'E taps: point number', 'E long hold: write it'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'settle then tap-out', input: 'e-hold+turn+e-tap', win: 'three grid points read with a settled needle, the field dropped and recovered, and the dead point tapped out by number on the slate',
    fail: 'lifting the meter before the needle settles, a short lever pull, or writing the wrong point number on the slate',
    rule: 'Turning the view jiggles the meter and restarts the settle. Hold the lever at least a second. On the slate each short tap adds one to the point number; a long hold writes it.' },
  rush: 'Read the lamps on the field panel and wrote "all green".',
  captions: { jiggled: 'needle swings', 'read early': 'meter clicks', 'short pull': 'lever snaps back', 'wrong point': 'slate buzz' },
  says: { 'read early': 'The needle had not settled — hold the meter still until it does.', 'short pull': 'Hold the lever down until the field drops fully.', 'wrong point': 'That is not the point whose needle stayed low. Tap the number again.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Grid point 1', prop: 'cellfield' }, { name: 'Grid point 2', prop: 'cell' }, { name: 'Grid point 3', prop: 'cellfield' },
      { name: 'Field panel lever', prop: 'secdesk' }, { name: 'Brig slate', prop: 'console' }]), r = m.rnd;
    const SET = m.calm ? 0.8 : 1.0, DROP = 1.0, STEADY = 0.3;
    m.dead = ri(r, 1, 3); m.pts = [1, 2, 3].map(n => ({ v: rf(r, 0.7, 0.9), after: n === m.dead ? rf(r, 0.12, 0.28) : rf(r, 0.7, 0.9), settle: 0, read: false }));
    m.lever = 0; m.rec = 0; m.taps = 0; let held = 0, prev = false;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); const hold = !!inp.hold, rel = prev && !hold; if (hold) held += dt; prev = hold; if (!s) { if (!hold) held = 0; return; } const i = m.next;
      if (i < 3) { const p = m.pts[i]; if (hold) { if ((inp.turn || 0) > STEADY) { if (p.settle > 0.3) m.ev('jiggled'); p.settle = 0; } else p.settle += dt; }
        if (rel) { if (p.settle >= SET) { p.read = true; m.finish(i); } else if (held > 0.05) m.fault('read early'); p.settle = 0; }
        s.prog = s.done ? 1 : clamp(p.settle / SET) * 0.9; }
      else if (i === 3) { if (hold) m.lever = Math.min(1.5, m.lever + dt); if (rel) { if (m.lever >= DROP) { m.rec = 0.001; m.finish(i); } else { m.fault('short pull'); } m.lever = 0; } s.prog = clamp(m.lever / DROP) * 0.9; }
      else { if (hold && held >= 1.0) { if (m.taps === m.dead) m.finish(i); else { m.fault('wrong point'); m.taps = 0; held = -10; } }
        if (rel && held > 0 && held < 0.4) m.taps = Math.min(3, m.taps + 1); s.prog = m.taps / 4; }
      if (m.rec > 0) m.rec = Math.min(2, m.rec + dt); if (!hold) held = 0;
    };
    m.needle = (k) => { const p = m.pts[k]; if (m.rec > 0) return clamp(m.rec) * p.after; return p.v; };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i < 3) return { at: i, hold: m.pts[i].settle < SET + 0.1, turn: 0 };
      if (i === 3) return { at: 3, hold: m.lever < DROP + 0.1 };
      if (m.taps < m.dead) return { at: 4, hold: f % 6 < 2, press: f % 6 === 0 }; return { at: 4, hold: true }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 10 < 5, press: f % 10 === 0, turn: 1.5 });
    m.view = () => ({ dead: m.dead, pts: m.pts.map(p => +p.v.toFixed(2)) });
    m.panel = (i) => { if (i < 3) { const p = m.pts[i]; return { label: p.settle >= SET ? 'Settled' : 'Needle', value: `${Math.round(m.needle(i) * 100)} hum`, bar: clamp(p.settle / SET), band: [0.95, 1] }; }
      if (i === 3) return { label: 'Lever', value: m.lever >= DROP ? 'FIELD DOWN — let go' : 'pulling', bar: clamp(m.lever / DROP) };
      return { label: `Point no. ${m.taps}`, value: `after recovery: ${[0, 1, 2].map(k => `P${k + 1} ${Math.round(m.needle(k) * 100)}`).join(' · ')}`, bar: m.taps / 3 }; };
    m.prompt = (i) => i < 3 ? 'Hold [E] and keep your view still until the needle settles, then let go' : i === 3 ? 'Hold [E] to pull the lever until the field drops, then let go'
      : 'Tap [E] once per number of the point that stayed low, then hold [E] to write it';
    return m;
  },
});
