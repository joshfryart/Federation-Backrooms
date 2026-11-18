// CFO: ready the medical shuttle. Screw down every oxygen bottle seal cap by hand: hold E and swing the view to the right to turn the cap on.
// Some caps go on crooked and bind part way. A binding cap must be backed off (swing left with E held) until the thread drops back in, then run
// on to the click. Forcing on through a bind cross-threads the cap and it leaks mid-evacuation.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Ready the medical shuttle', type: 'task:medical_relief' },
  title: 'Oxygen cap threading with back-off', dept: 'flight', host: 'room', siteName: 'Seal cap', verb: 'Thread',
  how: 'Hold E and swing your view right to screw each oxygen seal cap on until it clicks. If the panel says BINDS, swing left to back it off until it frees, then run it on again.',
  keys: ['E hold + swing right: tighten', 'E hold + swing left: back off'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'rethread', input: 'e-hold+swing', win: 'every oxygen seal cap run on to its click, with each crooked cap backed off and rethreaded first',
    fail: 'forcing a binding cap on so it cross-threads and will leak',
    rule: 'With E held, swinging the view right turns the cap on and swinging left turns it back. A cap that binds part way must be turned back past the bind before going on.' },
  rush: 'Wound every cap down hard with the wrench and trusted the gauges.',
  captions: { 'cross-threaded': 'thread grinds' }, says: { 'cross-threaded': 'Cross-threaded — you forced it through the bind. Back it off when it binds, then run it on.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Oxygen bottle 1', prop: 'shuttle' }, { name: 'Oxygen bottle 2', prop: 'locker' }, { name: 'Oxygen bottle 3', prop: 'shuttle' }]), r = m.rnd;
    const crooked = new Set(shuffle(r, [0, 1, 2]).slice(0, 1 + Math.floor(r() * 2))), give = m.calm ? 0.6 : 0.4;
    m.caps = m.sites.map((_, i) => ({ crooked: crooked.has(i), bind: rf(r, 0.3, 0.6), d: 0, forced: 0, rate: rf(r, 0.45, 0.6) }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, k = m.caps[i], sw = inp.swing || 0;
      if (k.crooked && k.d >= k.bind) k.backing = true;
      if (inp.hold && sw < -0.3) {
        if (k.crooked && k.d >= k.bind) { k.forced += dt; if (k.forced > give) { m.fault('cross-threaded'); k.d = 0.05; k.forced = 0; } }
        else { k.d = Math.min(1, k.d + k.rate * Math.min(2, -sw) * dt); if (k.d >= 1) { m.finish(i); return; } }
      } else k.forced = Math.max(0, k.forced - dt);
      if (inp.hold && sw > 0.3) { k.d = Math.max(0, k.d - k.rate * Math.min(2, sw) * dt); if (k.crooked && k.d < k.bind - 0.15) { k.crooked = false; k.backing = false; m.ev('freed', { site: i }); } }
      s.prog = s.done ? 1 : clamp(k.d * 0.95);
    };
    m.binds = (k) => k.crooked && (k.d >= k.bind || k.backing);
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.caps[i]; return { at: i, hold: true, swing: m.binds(k) ? 1.5 : -1.5 }; };
    m.bad = () => ({ at: m.next, hold: true, swing: -1.5 });
    m.view = () => ({ c: m.caps.map(k => [k.crooked, +k.bind.toFixed(3)]) });
    m.panel = (i) => { const k = m.caps[i]; return k ? { label: m.binds(k) ? 'BINDS' : 'Cap', value: m.binds(k) ? 'back it off' : `${Math.round(k.d * 100)} % on`, bar: k.d } : null; };
    m.prompt = (i) => { const k = m.caps[i]; return !k ? '' : m.binds(k) ? 'It binds — hold [E] and swing left to back the cap off' : 'Hold [E] and swing right to screw the cap on'; };
    return m;
  },
});
