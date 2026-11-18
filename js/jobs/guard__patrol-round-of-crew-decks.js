// Guard: patrol round of the crew decks. Pull every door handle on the round. A sound latch takes the full test pull (hold E until the pull
// meter reaches the test mark, then let go). A faulty latch gives part-way: let go at once and it is logged. Keep hauling on a latch that gave
// and the door flies open (a fault); letting go of a sound one before the test mark leaves it untested (a fault).
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'guard', label: 'Patrol round of crew decks', type: 'loop' },
  title: 'Door latch pull test', dept: 'security', host: 'room', siteName: 'Door', verb: 'Pull',
  how: 'At each door hold E to pull the handle steadily up to the test mark, then let go. If the latch gives before the mark, let go straight away: that door is logged as faulty.',
  keys: ['E hold: pull', 'let go at the mark or when it gives'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'pull-test', input: 'e-hold', win: 'every door handle pulled to the test load, and every latch that gives released at once and logged',
    fail: 'letting go of a sound latch before the test load, or hauling on after a latch gives so the door flies open',
    rule: 'Hold E: the pull meter climbs. Reach the test mark and release to pass a sound latch. If the meter suddenly reads GIVES, release within half a second to log it.' },
  rush: 'Rattled each handle once on the way past.',
  captions: { 'flew open': 'door bangs open', untested: 'latch clicks back', gives: 'latch clunks' }, says: { 'flew open': 'It gave and you kept pulling — the door flew open. Let go the moment it gives.', untested: 'Let go too soon — pull right up to the test mark.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cabin 1 door', prop: 'airlock_doors' }, { name: 'Cabin 2 door', prop: 'bunk' }, { name: 'Head door', prop: 'locker' }, { name: 'Stores hatch', prop: 'shelving' }]), r = m.rnd;
    const bad = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, 1 + Math.floor(r() * 2))), late = m.calm ? 0.75 : 0.5;
    m.doors = m.sites.map((_, i) => ({ faulty: bad.has(i), giveAt: rf(r, 0.3, 0.7), pull: 0, gave: 0, rate: rf(r, 0.55, 0.75) }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, d = m.doors[i];
      if (inp.hold) { d.pull = clamp(d.pull + d.rate * dt, 0, 1); if (d.faulty && !d.gave && d.pull >= d.giveAt) { d.gave = 1e-6; m.ev('gives', { site: i }); } if (d.gave) { d.gave += dt; if (d.gave > late) { m.fault('flew open'); d.gave = 0; d.pull = 0; } } }
      if (rel) { if (d.gave) { m.finish(i); return; } if (d.pull >= 1 && !d.faulty) { m.finish(i); return; } if (d.pull > 0.05) { m.fault('untested'); } d.pull = 0; }
      s.prog = s.done ? 1 : d.pull * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.doors[i]; return { at: i, hold: !d.gave && d.pull < 1 }; };
    m.bad = (f = 0) => { const i = m.next; return { at: i, hold: f % 40 < 20 }; };
    m.view = () => ({ doors: m.doors.map(d => [d.faulty, +d.giveAt.toFixed(2)]) });
    m.panel = (i) => { const d = m.doors[i]; return d ? { label: d.gave ? 'GIVES' : 'Pull', value: d.gave ? 'let go!' : `${Math.round(d.pull * 100)} %`, bar: d.pull, band: [0.97, 1] } : null; };
    m.prompt = (i) => { const d = m.doors[i]; return !d ? '' : d.gave ? 'The latch gave — let go of [E] now' : 'Hold [E] to pull the handle up to the test mark, then let go'; };
    return m;
  },
});
