// Galley: rotate stores, older stock first. Each shelf holds four cartons spread across the view, each with a best-before date. Aim at a carton
// and tap E to take it: anything dated before today goes to the spoilage crate first, then the remaining cartons are pulled forward oldest to
// newest. Taking an in-date carton while an expired one is still on the shelf, or a newer one before an older one, is a fault.
import { define, machine, room, ri, shuffle } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Rotate stores: use older stock first', type: 'task:cargo_run' },
  title: 'Aim and pull the oldest carton', dept: 'services', host: 'room', siteName: 'Shelf', verb: 'Rotate',
  how: 'Four cartons sit left to right across each shelf. Aim at one and tap E to take it. Expired cartons (dated before today) go first; then take the rest oldest date first.',
  keys: ['look: aim at a carton', 'E tap: take it'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'point to oldest', input: 'look+e-tap', win: 'three shelves of four cartons emptied in date order, any expired carton crated before the in-date ones are pulled oldest first',
    fail: 'taking an in-date carton while an expired one remains, or taking a newer carton before an older one',
    rule: 'Aim the view at a carton to read its date on the panel and tap E to take it. Dates under today: take those first. Otherwise the lowest date left is the one to take next.' },
  rush: 'Slid the nearest cartons forward without reading the date stamps.',
  captions: { 'used expired': 'sour smell', 'newer first': 'carton scrape' },
  says: { 'used expired': 'An expired carton is still on the shelf: crate it first.', 'newer first': 'That one is newer than another on the shelf: take the oldest first.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Shelf A', prop: 'shelving' }, { name: 'Shelf B', prop: 'shelving' }, { name: 'Shelf C', prop: 'shelving' }]), r = m.rnd; m.today = ri(r, 12, 18); m.lk = -1;
    m.Y = [-0.36, -0.12, 0.12, 0.36].map(y => y); const tol = m.calm ? 0.12 : 0.1;
    m.S = m.sites.map(() => { const p = shuffle(r, Array.from({ length: 10 }, (_, k) => m.today + k)).slice(0, 4); if (ri(r, 0, 1)) p[0] = ri(r, m.today - 6, m.today - 1); return shuffle(r, p).map(d => ({ d, out: false })); });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, sh = m.S[i];
      const k = m.Y.findIndex(y => Math.abs((inp.look || 0) - y) < tol); m.lk = k;
      if (inp.press && k >= 0 && !sh[k].out) { const c = sh[k], left = sh.filter(x => !x.out), ex = (x) => x.d < m.today;
        if (!ex(c) && left.some(ex)) m.fault('used expired'); else if (!ex(c) && c.d !== Math.min(...left.map(x => x.d))) m.fault('newer first'); else { c.out = true; if (sh.every(x => x.out)) { m.finish(i); return; } } }
      s.prog = sh.filter(x => x.out).length / 4 * 0.9;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const sh = m.S[i], left = sh.map((c, k) => [c, k]).filter(([c]) => !c.out), ex = left.filter(([c]) => c.d < m.today);
      const [, k] = ex.length ? ex[0] : left.reduce((a, b) => (b[0].d < a[0].d ? b : a)); return { at: i, look: m.Y[k], press: f % 3 === 0 }; };
    m.bad = (f = 0) => { const i = Math.max(0, m.next), left = m.S[i].map((c, k) => [c, k]).filter(([c]) => !c.out), [, k] = left.reduce((a, b) => (b[0].d > a[0].d ? b : a)); return { at: i, look: m.Y[k], press: f % 3 === 0 }; };
    m.view = () => ({ today: m.today, S: m.S.map(s => s.map(c => c.d)) });
    m.panel = (i) => { const sh = m.S[i]; if (!sh) return null; const c = sh[m.lk]; return { label: `Today ${m.today}: ` + sh.map(x => (x.out ? '--' : x.d)).join(' '), value: c ? (c.out ? 'taken' : `carton ${m.lk + 1}: ${c.d}${c.d < m.today ? ' EXPIRED' : ''}`) : 'aim at a carton', bar: sh.filter(x => x.out).length / 4 }; };
    m.prompt = (i) => 'Aim at a carton and tap [E]: expired first, then oldest date first';
    return m;
  },
});
