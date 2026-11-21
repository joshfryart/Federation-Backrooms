// Cargo: clear a sample storage rack. The seal tag on each case is on a different side of it. Hold E and look at the tag until it reads. A sound
// seal: let go and the case goes on the trolley. A broken seal: keep holding until the sheet says HELD, then let go. Letting go early loads a breach.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Clear a sample storage rack in the bay', type: 'task:survey' },
  title: 'Read the seal before lifting', dept: 'services', host: 'room', siteName: 'Shelf', verb: 'Clear',
  how: 'Hold E on the case and look at its seal tag (side shown) until it reads. Sound: let go to trolley it. BROKEN: keep holding until it says HELD, then let go.',
  keys: ['E hold: lift the case', 'look: at the tag side', 'let go: sound = trolley, broken = after HELD'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'read the seal', input: 'e-hold+look',
    win: 'every case lifted, its seal tag read, sound ones trolleyed and broken ones held on the sheet',
    fail: 'letting go of a case with a broken seal before it is held, or lifting without reading the tag',
    rule: 'Hold E and aim your view at the tag side shown on the panel; the tag reads after a second. Sound seal: release to place the case on the trolley. Broken seal: keep holding until HELD shows, then release.' },
  rush: 'Slid the cases onto the trolley without checking the seals.',
  captions: { breach: 'seal alarm chirps', unread: 'case rattles' },
  says: { breach: 'That seal was broken: you loaded a breached case.', unread: 'You let go before the tag was read.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Rack shelf 1', prop: 'shelving' }, { name: 'Rack shelf 2', prop: 'locker' }]), r = m.rnd;
    const bad = shuffle(r, [0, 1, 2, 3]).slice(0, 1 + Math.floor(r() * 2)), side = () => (r() < 0.5 ? -0.3 : 0.3);
    m.cases = Array.from({ length: 4 }, (_, k) => ({ broken: bad.includes(k), side: side(), rd: 0, hd: 0 }));
    m.k = 0; const need = m.calm ? 0.8 : 1.0, held = 1.0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const c = m.cases[m.k];
      if (inp.hold) { if (Math.abs((inp.look || 0) - c.side) < 0.2) c.rd += dt; if (c.rd >= need && c.broken) c.hd += dt; }
      if (rel) {
        if (c.rd < need) m.fault('unread'); else if (c.broken && c.hd < held) m.fault('breach'); else { m.k++; if (m.k % 2 === 0) m.finish(m.next); }
        c.rd = 0; c.hd = 0; if (m.k >= 4 && m.state === 'play') m.win();
      }
      s.prog = s.done ? 1 : clamp((m.k % 2) / 2 + c.rd / need * 0.25, 0, 0.95);
    };
    m.hint = () => { const c = m.cases[m.k]; if (!c || m.next < 0) return { at: -1 }; return { at: m.next, look: c.side, hold: !(c.rd >= need && (!c.broken || c.hd >= held)) }; };
    m.bad = () => { const c = m.cases[m.k]; return { at: m.next, look: c ? c.side : 0, hold: c && c.rd < need + 0.3 }; };
    m.view = () => ({ cases: m.cases.map(c => [c.broken, c.side]) });
    m.panel = (i) => { const c = m.cases[m.k]; if (!c) return null; const read = c.rd >= need; return { label: `Tag on the ${c.side < 0 ? 'right' : 'left'}`, value: !read ? 'reading...' : c.broken ? (c.hd >= held ? 'BROKEN: HELD' : 'BROKEN: hold') : 'SOUND: let go', bar: read ? 1 : c.rd / need }; };
    m.prompt = () => { const c = m.cases[m.k]; return !c ? '' : `Hold [E] and look ${c.side < 0 ? 'right' : 'left'} at the seal tag`; };
    return m;
  },
});
