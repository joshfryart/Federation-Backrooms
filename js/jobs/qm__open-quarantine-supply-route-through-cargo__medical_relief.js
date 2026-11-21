// Quartermaster: open the quarantine route. Crates sit across the stretcher lane. Tap E to shove a crate, but only on the beat of the pulse bar:
// an off-beat shove scrapes and tips the crate. Each crate takes a few clean shoves to clear the lane.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Open quarantine supply route through cargo', type: 'task:medical_relief' },
  title: 'Shove crates on the beat', dept: 'services', host: 'room', siteName: 'Crate', verb: 'Clear',
  how: 'Tap E on the beat of the pulse bar to shove the crate one step toward the wall. Tapping between beats scrapes it. A few clean shoves clear each crate from the lane.',
  keys: ['E tap on the beat'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'shove on beat', input: 'e-tap+rhythm', win: 'three lane crates each shoved clear with every shove tapped on the pulse beat',
    fail: 'shoving off the beat so the crate scrapes and tips on its edge',
    rule: 'The bar pulses once a second. Tap E as it peaks: one clean shove moves the crate. Taps between pulses scrape. Three or four shoves clear a crate off the stretcher lane.' },
  rush: 'Kicked the crates aside in a heap and left an edge sticking into the lane.',
  captions: { scrape: 'crate scrapes the deck' }, says: { scrape: 'Off the beat: the crate scraped and tipped.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [0, 1, 2].map(i => ({ name: `Lane crate ${i + 1}`, prop: i === 1 ? 'shelving' : 'locker' }))), r = m.rnd, tol = m.calm ? 0.25 : 0.15;
    m.c = [0, 1, 2].map(() => ({ need: ri(r, 3, 5), n: 0, last: -1 }));
    m.lane = [0, 1, 2].map(() => ri(r, 20, 90));
    const beat = () => Math.round(m.t), off = () => Math.abs(m.t - Math.round(m.t));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, c = m.c[i];
      if (inp.press) { if (off() <= tol) { if (beat() !== c.last) { c.last = beat(); c.n++; if (c.n >= c.need) m.finish(i); } } else { m.fault('scrape'); c.n = Math.max(0, c.n - 1); } }
      s.prog = s.done ? 1 : c.n / c.need * 0.95;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, press: off() <= 0.06 && beat() !== m.c[i].last }; };
    m.bad = () => ({ at: m.next, press: true });
    m.view = () => ({ need: m.c.map(c => c.need), lane: m.lane });
    m.panel = (i) => { const c = m.c[i]; return c ? { label: 'Beat', value: `shoves ${c.n} / ${c.need}${off() <= tol ? '  NOW' : ''}`, bar: clamp(1 - off() * 2), band: [1 - tol * 2, 1] } : null; };
    m.prompt = () => 'Tap [E] on the pulse peak to shove the crate';
    return m;
  },
});
