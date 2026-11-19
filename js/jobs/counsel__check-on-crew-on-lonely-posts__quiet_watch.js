// Counsellor: check on crew on lonely posts. Walk the engineering corridor to each isolated post. Each crewman shows small signs in different
// places: their hands, their face, the cup beside them. Turn your view onto each sign the panel names and hold E to take it in quietly, then
// finish on the relief rota clock to log the next check-in. Holding E while your eyes are on nothing in particular is staring: it alarms them.
import { define, machine, room, rf, pick, shuffle } from './kit.js';

const SIGNS = [['hands', ['steady', 'a slight shake', 'bitten nails']], ['face', ['shaved', 'unshaved, grey', 'dark circles']], ['cup', ['fresh tea', 'sour, days old', 'empty']],
  ['bunk roll', ['tidy', 'slept in the post', 'untouched']], ['log screen', ['up to date', 'the same line twice', 'blank for hours']]];
export default define({
  job: { billet: 'counsel', label: 'Check on crew on lonely posts', type: 'task:quiet_watch' },
  title: 'Isolation signs read at the post', dept: 'medical', host: 'room', siteName: 'Post', verb: 'Visit',
  how: 'At each post, turn your view onto the sign the panel names (hands, face, cup…) and hold E to take it in; finish on the rota clock to log the check-in. Do not hold E while looking at nothing.',
  keys: ['look at the sign', 'E hold: take it in'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'read the signs', input: 'e-hold+look', win: 'every lonely post visited with each small sign of isolation taken in and the next check-in logged on the rota',
    fail: 'staring at the crewman with nothing to look at, or leaving a sign unread so the decline goes unrecorded',
    rule: 'The panel names a sign and its bearing. Aim the view within ±0.12 rad of it and hold E 0.9 s to read it. Holding E while off every sign for 0.8 s is staring. The last sign is the rota clock.' },
  rush: 'Waved through the hatch window at each post and moved on.',
  captions: { staring: 'crewman shifts uneasily' },
  says: { staring: 'You stood there staring at them. Look at the sign you mean to read.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pump-room post', prop: 'pumpskid' }, { name: 'Relay gallery post', prop: 'relayrack' }, { name: 'Aft monitoring post', prop: 'reactorstation' }]), r = m.rnd;
    const tol = m.calm ? 0.16 : 0.12, need = m.calm ? 0.7 : 0.9;
    m.posts = m.sites.map(() => { const sg = shuffle(r, SIGNS).slice(0, 2).map(([n, v]) => ({ n, see: pick(r, v), at: rf(r, 0.2, 0.5) * (r() < 0.5 ? -1 : 1), t: 0 }));
      sg.push({ n: 'rota clock', see: `next check ${pick(r, ['0400', '0600', '1000', '1400', '2200'])}`, at: rf(r, -0.08, 0.08), t: 0 }); return { sg, k: 0, off: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, p = m.posts[i], g = p.sg[p.k], lk = inp.look || 0;
      if (inp.hold) {
        if (Math.abs(lk - g.at) <= tol) { g.t += dt; p.off = 0; if (g.t >= need) { p.k++; if (p.k >= p.sg.length) { m.finish(i); return; } } }
        else if (!p.sg.some(x => Math.abs(lk - x.at) <= tol)) { p.off += dt; if (p.off > 0.8) { m.fault('staring'); p.off = 0; } }
      } else p.off = 0;
      s.prog = s.done ? 1 : (p.k + Math.min(1, g.t / need)) / p.sg.length * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.posts[i], g = p.sg[p.k]; return { at: i, hold: true, look: g.at }; };
    m.bad = () => ({ at: m.next, hold: true, look: 1.2 });
    m.view = () => ({ posts: m.posts.map(p => p.sg.map(g => [g.n, g.see, +g.at.toFixed(2)])) });
    const side = (a) => Math.abs(a) < 0.1 ? 'ahead' : `${Math.abs(a).toFixed(2)} rad ${a > 0 ? 'left ◀' : 'right ▶'}`;
    m.panel = (i) => { const p = m.posts[i]; if (!p) return null; const g = p.sg[Math.min(p.k, p.sg.length - 1)], read = p.sg.slice(0, p.k).map(x => `${x.n}: ${x.see}`).join(' · ');
      return { label: `Look at: ${g.n} (${side(g.at)})`, value: read || `${p.k} / ${p.sg.length} read`, bar: Math.min(1, g.t / need), band: [0.99, 1] }; };
    m.prompt = (i) => { const p = m.posts[i]; if (!p) return ''; const g = p.sg[Math.min(p.k, p.sg.length - 1)]; return `Turn your eyes to the ${g.n} (${side(g.at)}) and hold [E] to take it in`; };
    return m;
  },
});
