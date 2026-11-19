// Guard: test the brig force-field panel zone by zone. Tap E to fire a zone's test stud; its lamp then pulses with the emitter hum. A healthy
// zone pulses on a steady beat: tap E in time with three pulses to pass it. A zone that stays dark, or pulses out of pattern (long gap, short
// gap), is faulty: hold E to mark it on the panel tag. Tapping off the beat, passing a faulty zone or tagging a healthy one are faults. Last,
// hold E on the cover lock until it seats.
import { define, machine, room, rf, ri, shuffle } from './kit.js';

export default define({
  job: { billet: 'guard', label: 'Test brig force-field panel', type: 'task:shakedown' },
  title: 'Field zone hum beat test', dept: 'security', host: 'room', siteName: 'Zone', verb: 'Test',
  how: 'Tap E to fire each zone’s test stud and watch the lamp. Steady pulses: tap E in time with three of them. Dark or uneven pulses: hold E to tag the zone. Then hold E on the cover lock.',
  keys: ['E tap: fire stud / tap in time', 'E hold: tag a bad zone'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'tap the hum', input: 'e-tap+e-hold+rhythm',
    win: 'every field zone fired, the steady ones passed by tapping along with three hum pulses and the silent or uneven ones tagged, then the cover seated',
    fail: 'tapping out of time with the hum, tapping along with a dead or uneven emitter so it is passed, or tagging a steady zone',
    rule: 'After the stud, watch two pulses. Even spacing: tap E on three pulses. No pulses or uneven gaps: hold E for a second to tag it.' },
  rush: 'Pressed the test stud once for all zones and signed the tag normal.',
  captions: { 'off beat': 'tap misses the hum', 'passed bad': 'emitter crackles', 'tagged good': 'tag stamped wrongly', pulse: 'emitter hums' },
  says: { 'off beat': 'Tap with the pulse, not between them.', 'passed bad': 'That zone was dark or uneven. Hold E to tag it.', 'tagged good': 'That zone hummed steadily. Tap along with it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Field zone A', prop: 'cellfield' }, { name: 'Field zone B', prop: 'cellfield' }, { name: 'Field zone C', prop: 'cellfield' }, { name: 'Panel cover lock', prop: 'cellfield' }]), r = m.rnd;
    const T = m.calm ? 0.85 : 0.7, W = m.calm ? 0.2 : 0.15, bad = shuffle(r, [0, 1, 2]).slice(0, ri(r, 1, 2));
    m.zones = [0, 1, 2].map(i => { const kind = bad.includes(i) ? (r() < 0.5 ? 'dark' : 'uneven') : 'steady', p = []; let t = 0.4 + rf(r, 0, 0.2);
      if (kind !== 'dark') for (let j = 0; j < 14; j++) { p.push(+t.toFixed(3)); t += kind === 'steady' ? T : (j % 2 ? 1.55 : 0.45) * T; }
      return { kind, p, ph: 'idle', lt: 0, hits: 0, last: -1, down: -1, dph: '' }; });
    m.cov = 0;
    const near = (z) => { let b = -1, d = 9; z.p.forEach((t, j) => { const e = Math.abs(z.lt - t); if (e < d) { d = e; b = j; } }); return [b, d]; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 3) { m.cov = inp.hold ? m.cov + dt : 0; if (m.cov >= 0.8) m.finish(3); s.prog = Math.min(0.9, m.cov); return; }
      const z = m.zones[i]; if (z.ph === 'run') z.lt += dt;
      if (inp.press) { z.down = z.lt; z.dph = z.ph; z.downAt = [z.lt, ...near(z)]; if (z.ph === 'idle') { z.ph = 'run'; z.lt = 0; m.ev('stud', { site: i }); } }
      if (inp.hold && z.dph === 'run' && z.lt - z.down >= 1.0) { z.dph = ''; if (z.kind === 'steady') m.fault('tagged good'); else { m.ev('tag', { site: i }); m.finish(i); return; } }
      if (rel && z.dph === 'run' && z.lt - z.down < 0.35) { z.dph = ''; const [, j, d] = z.downAt;
        if (z.kind !== 'steady') m.fault('passed bad'); else if (d > W || j === z.last) m.fault('off beat'); else { z.last = j; z.hits++; if (z.hits >= 3) { m.finish(i); return; } } }
      if (rel) z.dph = '';
      s.prog = z.ph === 'idle' ? 0 : z.kind === 'steady' ? 0.2 + z.hits * 0.23 : 0.2;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 3) return { at: 3, hold: true }; const z = m.zones[i];
      if (z.ph === 'idle') return { at: i, press: !m.prev, hold: !m.prev };
      if (z.kind !== 'steady') return { at: i, hold: z.lt > 1.8, press: z.lt > 1.8 && !m.prev };
      if (m.prev) return { at: i, hold: false }; const [j, d] = near(z); return d < 0.03 && j !== z.last && z.lt > 0.3 ? { at: i, press: true, hold: true } : { at: i, hold: false }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 7 === 0, hold: f % 7 === 0 });
    m.view = () => ({ z: m.zones.map(z => [z.kind, z.p[0] || 0]) });
    m.panel = (i) => { if (i === 3) return { label: 'Cover lock', value: 'hold to seat', bar: Math.min(1, m.cov / 0.8) }; const z = m.zones[i]; if (!z) return null;
      if (z.ph === 'idle') return { label: 'Zone lamp', value: 'stud not fired', bar: 0 };
      const on = z.p.some(t => z.lt >= t && z.lt < t + 0.12), past = z.p.filter(t => t <= z.lt), gap = past.length > 1 ? (past[past.length - 1] - past[past.length - 2]).toFixed(2) : '—';
      return { label: on ? 'Zone lamp ● HUM' : 'Zone lamp ○', value: `last gap ${gap} s · taps ${z.hits} / 3`, bar: on ? 1 : 0 }; };
    m.prompt = (i) => { if (i === 3) return 'Hold [E] on the cover lock until it seats'; const z = m.zones[i]; if (!z) return '';
      return z.ph === 'idle' ? 'Tap [E] to fire the zone test stud' : 'Steady hum: tap [E] with each pulse. Dark or uneven: hold [E] to tag it'; };
    return m;
  },
});
