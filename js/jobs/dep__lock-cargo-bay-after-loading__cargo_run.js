// Deputy security chief, cargo run: lock the cargo bay once the last crate is in. At each hatch tap E to drop it, then keep your hands off and
// LISTEN: the hatch has to settle before you know whether the seal caught. CLICK and the lamp goes green. NO CLICK leaves the lamp amber: tap E
// again to lift and re-seat it. Grabbing a hatch while it is still falling or settling jams it. Walk away from an amber hatch and the bay key
// will not turn: it sends you back to that hatch.
import { define, machine, room, rf, shuffle } from './kit.js';

export default define({
  job: { billet: 'dep', label: 'Lock cargo bay after loading', type: 'task:cargo_run' },
  title: 'Hatch drop and listen lock-up', dept: 'security', host: 'room', siteName: 'Hatch', verb: 'Drop',
  how: 'Tap E to drop each hatch, then wait and listen. If it does not click, tap E again to re-seat it. Do not touch it while it settles. Turn the bay key last.',
  keys: ['E tap: drop / re-seat the hatch', 'wait for the click'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'drop and listen', input: 'e-tap', win: 'every hatch dropped and heard to click shut, any that stayed silent re-seated, then the bay key turned on a green board',
    fail: 'grabbing a hatch before it has settled so it jams, or turning the key with a hatch that never clicked',
    rule: 'Tap E: the hatch falls and settles for about a second (hands off). Then CLICK = green, done; NO CLICK = amber, tap again to re-seat. The key refuses while any lamp is amber.' },
  rush: 'Slammed the main door, turned the key and trusted the lamps.',
  captions: { jammed: 'hatch grinds', 'open hatch': 'key will not turn', click: 'hatch clicks home', 'no click': 'dull thud' },
  says: { jammed: 'You grabbed it before it settled — the hatch jammed. Drop it and keep your hands off until it answers.', 'open hatch': 'An amber hatch never caught. Go back and re-seat it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Main bay door', prop: 'airlock_doors' }, { name: 'Side hatch', prop: 'crate' }, { name: 'Loading hatch', prop: 'shuttle' }, { name: 'Bay lock key', prop: 'console' }]), r = m.rnd;
    const two = new Set(shuffle(r, [0, 1, 2]).slice(0, 1 + Math.floor(r() * 2))), linger = m.calm ? 3.5 : 2.5;
    m.h = [0, 1, 2].map(i => ({ drops: two.has(i) ? 2 : 1, fall: rf(r, 0.35, 0.55), lis: rf(r, 0.45, 0.7), ph: 'up', t: 0, n: 0, lamp: 'off' }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next;
      if (i === 3) { if (inp.press) { const j = m.h.findIndex(h => h.lamp !== 'green'); if (j >= 0) { m.fault('open hatch'); m.sites[j].done = false; m.sites[j].prog = 0; m.next = j; m.h[j].ph = 'amber'; m.h[j].t = 0; } else m.finish(3); } return; }
      const h = m.h[i];
      if (h.ph === 'up' || h.ph === 'amber') { if (inp.press) { h.ph = 'fall'; h.t = 0; h.n++; h.lamp = 'off'; } else if (h.ph === 'amber') { h.t += dt; if (h.t > linger) m.finish(i); } }
      else { if (inp.press) { m.fault('jammed'); h.ph = 'up'; h.n = Math.max(0, h.n - 1); return; }
        h.t += dt; if (h.ph === 'fall' && h.t >= h.fall) { h.ph = 'listen'; h.t = 0; } else if (h.ph === 'listen' && h.t >= h.lis) { if (h.n >= h.drops) { h.lamp = 'green'; m.ev('click', { site: i }); m.finish(i); return; } h.ph = 'amber'; h.lamp = 'amber'; h.t = 0; m.ev('no click', { site: i }); } }
      s.prog = h.ph === 'fall' ? 0.3 : h.ph === 'listen' ? 0.6 : h.ph === 'amber' ? 0.4 : 0;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = f % 4 === 0 && (i === 3 || m.h[i].ph === 'up' || m.h[i].ph === 'amber'); return { at: i, press: p, hold: p }; };
    m.bad = (f = 0) => { const p = f % 4 === 0; return { at: m.next, press: p, hold: p }; };
    m.view = () => ({ h: m.h.map(h => [h.drops, +h.fall.toFixed(2), +h.lis.toFixed(2)]) });
    m.panel = (i) => { if (i === 3) return { label: 'Bay lamps', value: m.h.map(h => h.lamp === 'green' ? 'SEALED' : h.lamp === 'amber' ? 'AMBER' : '—').join(' · '), bar: m.h.filter(h => h.lamp === 'green').length / 3 }; const h = m.h[i]; return h ? { label: h.ph === 'amber' ? 'NO CLICK — lamp amber' : h.ph === 'listen' ? 'Listening…' : h.ph === 'fall' ? 'Falling…' : 'Hatch open', value: h.ph === 'amber' ? 're-seat it' : h.ph === 'up' ? 'drop it' : 'hands off', bar: h.ph === 'listen' ? h.t / h.lis : h.ph === 'fall' ? h.t / h.fall : 0 } : null; };
    m.prompt = (i) => { if (i === 3) return 'Tap [E] to turn the bay lock key'; const h = m.h[i]; return !h ? '' : h.ph === 'up' ? 'Tap [E] to drop the hatch' : h.ph === 'amber' ? 'No click — tap [E] to lift and re-seat it' : 'Hands off — listen for the seal to catch'; };
    return m;
  },
});
