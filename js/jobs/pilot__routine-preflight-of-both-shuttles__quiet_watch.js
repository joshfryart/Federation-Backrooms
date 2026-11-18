// Pilot: routine preflight of both shuttles. Three check points on each shuttle's underside and canopy (port gear strut, cold-side panel,
// starboard strut; port canopy edge, wipers, starboard edge). On the first shuttle you check them in whatever order you like, and that order
// becomes the drill: on the second shuttle every point must be checked in the SAME order, so nothing gets skipped because the first one looked
// fine. Aim at a point (the panel names what is under your view) and tap E. Tapping bare hull, or breaking the first shuttle's order, is a fault.
import { define, machine, room, rf, shuffle } from './kit.js';

const PTS = [['port gear strut', 'cold-side panel', 'starboard strut'], ['port canopy edge', 'wipers', 'starboard canopy edge']];

export default define({
  job: { billet: 'pilot', label: 'Routine preflight of both shuttles', type: 'task:quiet_watch' },
  title: 'Same order on the second shuttle', dept: 'flight', host: 'room', siteName: 'Check', verb: 'Check',
  how: 'Aim your view at each check point (the panel names what is under your view) and tap E. On shuttle 2, check the points in exactly the order you used on shuttle 1.',
  keys: ['look to aim at a point', 'E tap: check it'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'repeat the round', input: 'e-tap+look',
    win: 'the second shuttle\'s underside and canopy points checked in the identical sequence chosen on the first',
    fail: 'tapping bare hull instead of a check point, or changing the sequence on the second shuttle so a point is passed over',
    rule: 'Sweep your view until the panel names a check point and tap E. Whatever order you use on shuttle 1 must be repeated point for point on shuttle 2.' },
  rush: 'Gave the second shuttle a quick look from the nose because the first was fine.',
  captions: { 'bare hull': 'glove taps metal', 'out of order': 'card rustles' },
  says: { 'bare hull': 'Nothing there: aim until the panel names a check point.', 'out of order': 'Not the order you used on shuttle 1. Same checks, same order.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Shuttle 1 underside', prop: 'shuttle' }, { name: 'Shuttle 1 canopy', prop: 'shuttle' },
      { name: 'Shuttle 2 underside', prop: 'workpod' }, { name: 'Shuttle 2 canopy', prop: 'workpod' }]), r = m.rnd, tol = m.calm ? 0.11 : 0.08;
    const lay = () => { const a = [rf(r, 0.25, 0.42), rf(r, -0.06, 0.06), -rf(r, 0.25, 0.42)]; return a.map(v => +v.toFixed(3)); };
    m.chk = m.sites.map((_, i) => ({ part: i % 2, at: lay(), done: [] }));
    m.pref = [shuffle(r, [0, 1, 2]), shuffle(r, [0, 1, 2])];   // the order the hint player happens to choose on shuttle 1
    m.order = [null, null];                                     // the order actually used on shuttle 1 (per part)
    const under = (c, look) => c.at.findIndex(a => Math.abs((look || 0) - a) < tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, c = m.chk[i]; m.look = inp.look || 0;
      if (inp.press) { const p = under(c, inp.look);
        if (p < 0) m.fault('bare hull');
        else if (!c.done.includes(p)) {
          if (i >= 2 && m.order[c.part][c.done.length] !== p) m.fault('out of order');
          else { c.done.push(p); m.ev('checked', { site: i, p }); if (c.done.length === 3) { if (i < 2) m.order[c.part] = c.done.slice(); m.finish(i); return; } } } }
      s.prog = s.done ? 1 : c.done.length / 3 * 0.9;
    };
    const want = (i) => { const c = m.chk[i]; return (i < 2 ? m.pref[c.part] : m.order[c.part])[c.done.length]; };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.chk[i]; return { at: i, look: c.at[want(i)], press: f % 3 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, look: 0.5, press: f % 3 === 0 });
    m.view = () => ({ at: m.chk.map(c => c.at), pref: m.pref });
    m.panel = (i) => { const c = m.chk[i]; if (!c) return null; const p = under(c, m.look); return { label: p < 0 ? 'bare hull' : PTS[c.part][p] + (c.done.includes(p) ? ' ✓' : ''), value: `${c.done.length} / 3 checked`, bar: c.done.length / 3 }; };
    m.prompt = (i) => { const c = m.chk[i]; if (!c) return ''; const names = PTS[c.part];
      const first = i >= 2 && m.order[c.part] ? `Shuttle 1 order: ${m.order[c.part].map(p => names[p]).join(' → ')}. ` : '';
      return `${first}Aim at a point (${names.filter((_, p) => !c.done.includes(p)).join(', ')}) and tap [E]`; };
    return m;
  },
});
