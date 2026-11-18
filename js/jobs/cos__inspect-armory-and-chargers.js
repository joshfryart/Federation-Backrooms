// Chief of security: inspect the armory and chargers. Each rack has five charger lamps. A red lamp, or an amber one that never climbs to green,
// is a stuck cell: aim the view along the row and tap E on it to tag it for the armory log. Tagging a lamp that is green wastes the log.
import { define, machine, room, ri, shuffle } from './kit.js';

const N = 5, SPAN = 0.42;
const cellAt = (look) => Math.floor((look + SPAN) / (2 * SPAN) * N), centre = (k) => -SPAN + (k + 0.5) * (2 * SPAN / N);
export default define({
  job: { billet: 'cos', label: 'Inspect armory and chargers', type: 'loop' },
  title: 'Charger lamp row tag', dept: 'security', host: 'room', item: 'flashlight', siteName: 'Rack', verb: 'Read',
  how: 'At each rack, aim the view along the row of five charger lamps. Tap E on each red or stuck amber lamp to tag it. Leave the green ones alone.',
  keys: ['E tap: tag a stuck lamp', 'aim along the lamp row'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'read lamp row', input: 'e-tap+look', win: 'every red or stuck amber lamp on each rack tagged and no green lamp tagged',
    fail: 'tagging a full green lamp, so the armory log names a cell that was fine',
    rule: 'Five lamps per rack. Aim at one and tap E if it is red or amber and not climbing. Green means full: never tag it.' },
  rush: 'Glanced along the racks and signed the log with the lamps as they stood.',
  captions: { 'tagged green': 'stylus taps the log' }, says: { 'tagged green': 'That lamp is green. Only tag the stuck ones.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Charger rack', prop: 'chargerack' }, { name: 'Weapon rack', prop: 'weaponrack' }]), r = m.rnd;
    m.racks = m.sites.map(() => ({ bad: new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 1, 2))), tagged: new Set() }));
    const good = (i) => [0, 1, 2, 3, 4].find(c => !m.racks[i].bad.has(c));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s || !inp.press) return;
      const i = m.next, rk = m.racks[i], c = cellAt(inp.look || 0);
      if (c < 0 || c >= N || rk.tagged.has(c)) return;
      if (rk.bad.has(c)) { rk.tagged.add(c); m.ev('tag', { site: i, cell: c }); if (rk.tagged.size === rk.bad.size) m.finish(i); }
      else m.fault('tagged green');
      s.prog = rk.tagged.size / rk.bad.size * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const rk = m.racks[i], k = [...rk.bad].find(c => !rk.tagged.has(c));
      return { at: i, look: centre(k), press: true }; };
    m.bad = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, look: centre(good(i)), press: true }; };
    m.view = () => ({ racks: m.racks.map(rk => [...rk.bad].sort((a, b) => a - b)) });
    m.panel = (i) => { const rk = m.racks[i]; return rk ? { label: 'Lamps tagged', value: `${rk.tagged.size} / ${rk.bad.size}`, bar: rk.tagged.size / rk.bad.size } : null; };
    m.prompt = (i) => (m.racks[i] ? 'Aim along the row and tap [E] on each red or stuck lamp' : '');
    return m;
  },
});
