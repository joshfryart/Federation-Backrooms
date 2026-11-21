// Galley: cold-store and pantry inventory (quiet watch). A rack of four date-stamped cartons and today's date. Any carton stamped before today
// is expired: press Space (crate mode) then its digit to put it in the spoilage crate. Then press the digit of the oldest in-date carton to
// pull it to the front. Crating a good carton, pulling a newer one forward or using an expired one is a fault. Three racks.
import { define, machine, DIG, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Cold-store and pantry inventory', type: 'task:quiet_watch' },
  title: 'Date stamps: crate then pull oldest', dept: 'services', host: 'console', tool: 'Cold-store rack display',
  how: 'Compare each carton stamp with today. Space then a digit crates an expired carton. When none are expired, press the digit of the oldest carton left to bring it to the front.',
  keys: ['Space then 1 to 4 crate that carton', '1 to 4 pull that carton to the front'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'crate then pull', input: 'digits+space', win: 'three racks each cleared of cartons stamped before today and then the oldest in-date carton pulled forward',
    fail: 'crating a carton that is still in date, pulling a newer carton forward, or pulling an expired one',
    rule: 'Stamps below today are expired: Space, then the digit, sends one to the crate. With none expired, the lowest stamp left is oldest: press its digit.' },
  rush: 'Counted the cartons and assumed the oldest were already at the front.',
  captions: { 'crated good': 'crate thud', 'not oldest': 'carton scrape', 'used expired': 'sour smell' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 3; m.round = 0; m.mode = false; m.today = ri(r, 12, 18);
    const rack = () => { const p = shuffle(r, Array.from({ length: 10 }, (_, k) => m.today + k)).slice(0, 4); if (ri(r, 0, 1)) p[0] = ri(r, m.today - 6, m.today - 1); return shuffle(r, p).map(d => ({ d, out: false })); };
    m.R = [rack(), rack(), rack()];
    const live = () => m.R[Math.min(2, m.round)].filter(c => !c.out), exp = (c) => c.d < m.today;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; if (SPACE(code)) { m.mode = !m.mode; return true; }
      const n = DIG(code); const rk = m.R[m.round]; if (!n || n > 4) return false; const c = rk[n - 1]; if (c.out) return true;
      if (m.mode) { m.mode = false; if (!exp(c)) m.fault('crated good'); else c.out = true; return true; }
      if (exp(c)) { m.fault('used expired'); return true; }
      if (live().some(x => exp(x))) { m.fault('used expired'); return true; }
      const old = Math.min(...live().map(x => x.d)); if (c.d !== old) { m.fault('not oldest'); return true; }
      m.round++; m.mode = false; if (m.round >= 3) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const rk = m.R[Math.min(2, m.round)], e = rk.findIndex(c => !c.out && exp(c));
      if (e >= 0) return [m.mode ? ['Digit' + (e + 1), true] : ['Space', true]];
      const old = Math.min(...rk.filter(c => !c.out).map(c => c.d)); return [['Digit' + (rk.findIndex(c => !c.out && c.d === old) + 1), true]]; };
    m.bad = () => { const rk = m.R[Math.min(2, m.round)]; const mx = Math.max(...rk.filter(c => !c.out).map(c => c.d)); return 'Digit' + (rk.findIndex(c => !c.out && c.d === mx) + 1); };
    m.view = () => ({ today: m.today, R: m.R.map(k => k.map(c => c.d)) });
    m.buttons = () => [['Space', 'Crate mode'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4']];
    m.draw = (c, W, H, P) => {
      const rk = m.R[Math.min(2, m.round)]; txt(c, `TODAY ${m.today}`, 20, 24, { size: 14, col: COL.gold }); txt(c, `rack ${Math.min(3, m.round + 1)} / 3`, 300, 24, { size: 12, col: COL.pale });
      rk.forEach((k, i) => { const x = 20 + i * 92; box(c, x, 40, 80, 60, k.out ? null : 'rgba(255,255,255,.07)', k.out ? COL.dim : (exp(k) ? COL.warn : COL.peri), 6);
        txt(c, k.out ? 'crated' : `${i + 1}`, x + 40, 62, { size: 12, col: COL.dim, align: 'center' }); if (!k.out) txt(c, `best ${k.d}`, x + 40, 88, { size: 16, align: 'center' }); });
      txt(c, m.mode ? 'CRATE MODE: press a digit' : 'pull mode', 20, 126, { size: 13, col: m.mode ? COL.warn : COL.dim });
    };
    return m;
  },
});
