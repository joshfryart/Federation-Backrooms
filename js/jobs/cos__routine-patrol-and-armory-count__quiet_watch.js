// Chief of security, quiet watch: the armory count is done by feel as well as by eye. Aim the view at a cradle and hold E: a cradle with a zapper in it
// has weight, and the feel meter fills in about a second. An empty cradle gives nothing; holding on it for half a second is felt air, a faulty count.
import { define, machine, room, ri, shuffle } from './kit.js';

const N = 6, SPAN = 0.42;
const cellAt = (look) => Math.floor((look + SPAN) / (2 * SPAN) * N), centre = (k) => -SPAN + (k + 0.5) * (2 * SPAN / N);
export default define({
  job: { billet: 'cos', label: 'Routine patrol and armory count', type: 'task:quiet_watch' },
  title: 'Cradle weight feel', dept: 'security', host: 'room', item: 'flashlight', siteName: 'Cradle', verb: 'Feel',
  how: 'At each rack aim at a cradle and hold E until its weight meter fills: loaded cradles fill, empty ones give nothing. Move on once every loaded cradle is felt.',
  keys: ['E hold on a cradle: feel its weight', 'aim at each cradle'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'feel the weight', input: 'e-hold+look', win: 'every loaded cradle on each rack felt to full weight by holding E on it',
    fail: 'holding E on an empty cradle, so the count says a zapper is there when the rack is bare',
    rule: 'Hold E while aimed at a cradle: a loaded one fills to full weight in about a second and then counts. An empty one fills nothing; holding there half a second is a faulty count.' },
  rush: 'Counted the zappers by eye from the doorway and wrote the total.',
  captions: { 'felt air': 'empty click' }, says: { 'felt air': 'Nothing in that cradle. Count only the ones with weight.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Weapon rack', prop: 'weaponrack' }, { name: 'Locker shelf', prop: 'locker' }]), r = m.rnd;
    m.racks = m.sites.map(() => ({ loaded: new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ri(r, 3, 4))), felt: new Set(), fill: {}, air: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return;
      const i = m.next, rk = m.racks[i];
      if (!inp.hold) { rk.air = 0; return; }
      const c = cellAt(inp.look || 0);
      if (c < 0 || c >= N) { rk.air = 0; return; }
      if (rk.loaded.has(c)) {
        rk.air = 0;
        if (!rk.felt.has(c)) {
          rk.fill[c] = Math.min(1, (rk.fill[c] || 0) + dt * 0.9);
          if (rk.fill[c] >= 1) { rk.felt.add(c); m.ev('felt', { site: i, c }); if (rk.felt.size === rk.loaded.size) { m.finish(i); return; } }
        }
      } else { rk.air += dt; if (rk.air > 0.5) { m.fault('felt air'); rk.air = 0; } }
      s.prog = rk.felt.size / rk.loaded.size * 0.9;
    };
    m.hint = () => {
      const i = m.next; if (i < 0) return { at: -1 }; const rk = m.racks[i];
      const k = [...rk.loaded].filter(c => !rk.felt.has(c)).sort((a, b) => a - b)[0];
      return { at: i, hold: true, look: centre(k) };
    };
    m.bad = () => {
      const i = m.next; if (i < 0) return { at: -1 }; const rk = m.racks[i];
      const e = [0, 1, 2, 3, 4, 5].find(c => !rk.loaded.has(c));
      return { at: i, hold: true, look: centre(e) };
    };
    m.view = () => ({ racks: m.racks.map(rk => [...rk.loaded].sort((a, b) => a - b)) });
    m.panel = (i) => { const rk = m.racks[i]; return rk ? { label: 'Cradles felt', value: `${rk.felt.size} / ${rk.loaded.size}`, bar: rk.felt.size / rk.loaded.size } : null; };
    m.prompt = (i) => (m.racks[i] ? 'Hold [E] on a cradle until its weight meter fills' : '');
    return m;
  },
});
