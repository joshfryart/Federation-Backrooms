// Damage control: tap-test the hull plates before manoeuvres. At each plate run, aim at a plate and tap E to strike it: a sound plate rings
// high, a delaminated one answers dull and low. Strike every plate once; strike a dull one again to chalk it for repair. Chalking a plate that
// rang true is a fault (a good plate pulled for nothing).
import { define, machine, room, ri, shuffle } from './kit.js';

export default define({
  job: { billet: 'dc', label: 'Check hull plates and sensor mounts before maneuvers', type: 'task:survey' },
  title: 'Hull plate tap test', dept: 'engineering', host: 'room', siteName: 'Plate run', verb: 'Tap',
  how: 'At each plate run aim at every plate and tap E to strike it. Listen: a high ring is sound, a dull low note is hollow. Strike a hollow plate a second time to chalk it.',
  keys: ['Aim with the view', 'E tap: strike / chalk'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'sound out', input: 'e-tap+look', win: 'every plate struck once and every hollow-sounding plate chalked, no sound plate chalked',
    fail: 'chalking a plate that rang true, or leaving a run with a hollow plate unchalked',
    rule: 'Aim at a plate and tap E: it answers with a pitch. Above about 600 Hz is sound; a dull note under 400 Hz is hollow. Tap a hollow plate again to chalk it. The run is done when every plate is struck and every hollow one chalked.' },
  rush: 'Walked the run kicking the plates and chalked the ones that looked dented.',
  captions: { 'chalked a sound plate': 'clear ring', ring: 'plate rings high', dull: 'dull thunk' }, says: { 'chalked a sound plate': 'That one rang true — it does not need chalking. Only chalk the dull ones.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Forward plate run', prop: 'maint_stand' }, { name: 'Sensor mount plates', prop: 'crate' }]), r = m.rnd, tol = m.calm ? 0.08 : 0.06;
    m.runs = m.sites.map(() => { const n = 5, hollow = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 1, 2))); return Array.from({ length: n }, (_, k) => ({ b: -0.44 + 0.22 * k, hollow: hollow.has(k), hz: hollow.has(k) ? ri(r, 220, 380) : ri(r, 640, 900), struck: false, chalk: false })); });
    m.last = null;
    const aim = (i, look) => { let best = -1, bd = tol; m.runs[i].forEach((p, k) => { const d = Math.abs((look || 0) - p.b); if (d < bd) { bd = d; best = k; } }); return best; };
    const done = (run) => run.every(p => p.struck && (p.chalk || !p.hollow));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s || !inp.press) return; const i = m.next, run = m.runs[i], k = aim(i, inp.look); if (k < 0) return; const p = run[k];
      if (!p.struck) { p.struck = true; m.last = p; m.ev(p.hollow ? 'dull' : 'ring', { site: i, hz: p.hz }); }
      else if (!p.chalk) { if (!p.hollow) { m.fault('chalked a sound plate'); return; } p.chalk = true; }
      s.prog = run.filter(q => q.struck).length / run.length * 0.9; if (done(run)) m.finish(i);
    };
    const target = (run) => run.findIndex(p => !p.struck || (p.hollow && !p.chalk));
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const k = target(m.runs[i]); return { at: i, look: m.runs[i][k].b, press: f % 4 === 0 }; };
    m.bad = (f = 0) => { const i = m.next, run = m.runs[i], k = run.findIndex(p => !p.hollow); return { at: i, look: run[k].b, press: f % 4 === 0 }; };
    m.view = () => ({ runs: m.runs.map(run => run.map(p => p.hz)) });
    m.panel = (i) => { const run = m.runs[i]; return run ? { label: m.last ? `Last strike ${m.last.hz} Hz` : 'Strike a plate', value: run.map((p, k) => `${k + 1}${p.chalk ? '✗' : p.struck ? '·' : '?'}`).join(' '), bar: run.filter(q => q.struck).length / run.length } : null; };
    m.prompt = (i) => { const run = m.runs[i]; if (!run) return ''; const left = run.filter(p => !p.struck).length; return left ? `Aim at a plate and tap [E] to strike it · ${left} not struck` : 'Tap [E] again on any dull plate to chalk it'; };
    return m;
  },
});
