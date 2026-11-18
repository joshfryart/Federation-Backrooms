// Second officer: rebalance rosters. Each fatigue-flagged watchstander needs a swap partner from the free list who holds the rating for the
// post and who stays inside the 12-hour limit once the shift is added. Swap, then send the department head the note: the swap only commits
// when the note goes. A partner without the rating, or one the swap would push over the limit, is refused; moving on with a swap unsent is a fault.
import { define, machine, ARROW, SPACE, ENTER, shuffle, ri, pick, txt, box, COL } from './kit.js';

const RATE = ['Helm', 'Ops', 'Tac', 'Sci', 'Eng'];
const NAMES = ['Adeyemi', 'Brook', 'Castellan', 'Dvorak', 'Eskildsen', 'Fontaine', 'Gallo', 'Hirano', 'Ilves', 'Jessup', 'Kovacs', 'Lund'];

export default define({
  job: { billet: 'so', label: 'Rebalance rosters', type: 'loop' },
  title: 'Fatigue shift swap', dept: 'command', host: 'console', tool: 'Duty roster screen and desk comm',
  how: 'For each fatigue-flagged name pick a free partner holding the post rating whose hours stay under 12 with the shift added, swap, then send the department note.',
  keys: ['↑ ↓ flagged name', '← → free partner', 'Space swap', 'Enter send note'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'swap shifts', input: 'arrows+space+enter', win: 'every fatigue-flagged name swapped with a rated partner who stays inside the hour limit, each swap committed by a note',
    fail: 'swapping in an unrated partner or one the shift pushes over twelve hours, or leaving a swap unsent',
    rule: '↑↓ picks the flagged name, ←→ the free partner. Space swaps if the partner has the rating and hours + shift ≤ 12; Enter sends the note to commit it.' },
  rush: 'Struck the fatigue flags off the roster without moving anyone.',
  captions: { 'no rating': 'roster buzz', 'fatigue tripped': 'fatigue flag chimes', 'note not sent': 'comm light blinks' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nm = shuffle(r, NAMES), rates = shuffle(r, RATE);
    m.flag = [0, 1, 2].map(i => ({ who: nm[i], post: rates[i], shift: ri(r, 4, 6), hrs: ri(r, 13, 16), done: false, pend: -1 }));
    const free = m.flag.map((f, i) => ({ who: nm[3 + i], rates: shuffle(r, [f.post, pick(r, RATE)]).filter((x, k, a) => a.indexOf(x) === k), hrs: ri(r, 0, 12 - f.shift), used: false, for: i }));
    const tf = pick(r, m.flag), uf = pick(r, m.flag);
    free.push({ who: nm[6], rates: [tf.post], hrs: 12 - tf.shift + ri(r, 1, 3), used: false, for: -1 });
    free.push({ who: nm[7], rates: RATE.filter(x => x !== uf.post).slice(0, 2), hrs: ri(r, 0, 3), used: false, for: -1 });
    m.free = shuffle(r, free); m.sel = 0; m.pc = 0; m.rounds = 3; m.round = 0;
    const F = () => m.flag[m.sel], P = () => m.free[m.pc];
    const step = (d) => { if (F().pend >= 0 && !F().done) { m.fault('note not sent'); m.free[F().pend].used = false; F().pend = -1; } m.sel = (m.sel + d + 3) % 3; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), f = F();
      if (a === 'U' || a === 'D') { step(a === 'D' ? 1 : -1); return true; }
      if (a === 'L' || a === 'R') { if (f.pend < 0) m.pc = (m.pc + (a === 'R' ? 1 : m.free.length - 1)) % m.free.length; return true; }
      if (SPACE(code)) {
        if (f.done || f.pend >= 0) return true; const p = P(); if (p.used) return true;
        if (!p.rates.includes(f.post)) { m.fault('no rating'); return true; }
        if (p.hrs + f.shift > 12) { m.fault('fatigue tripped'); return true; }
        f.pend = m.pc; p.used = true; return true;
      }
      if (ENTER(code)) { if (f.pend >= 0 && !f.done) { f.done = true; m.round++; m.ev('note', { who: f.who }); if (m.flag.every(x => x.done)) m.win(); } return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      const f = F(); if (f.pend >= 0 && !f.done) return [['Enter', true]];
      const j = m.flag.findIndex(x => !x.done); if (j < 0) return []; if (j !== m.sel) return [['ArrowDown', true]];
      const want = m.free.findIndex(p => p.for === j); return want !== m.pc ? [['ArrowRight', true]] : [['Space', true]];
    };
    m.bad = () => { const f = F(), p = P(); if (f.done) return 'ArrowDown'; const ok = !p.used && p.rates.includes(f.post) && p.hrs + f.shift <= 12; return ok ? 'ArrowRight' : 'Space'; };
    m.view = () => ({ f: m.flag.map(f => [f.who, f.post, f.shift]), p: m.free.map(p => [p.who, p.rates, p.hrs]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Swap'], ['Enter', 'Send note']];
    m.draw = (c, W, H, P_) => {
      txt(c, 'FATIGUE FLAGS (limit 12 h)', 10, 16, { size: 10, col: COL.gold });
      m.flag.forEach((f, i) => {
        const y = 22 + i * 24, s = i === m.sel; box(c, 6, y, 188, 20, s ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.04)', s ? COL.orange : null, 8);
        txt(c, `${f.done ? '✓' : f.pend >= 0 ? '…' : '⚑'} ${f.who}  ${f.post} ${f.shift} h  (${f.hrs} h on)`, 12, y + 14, { size: 10, col: f.done ? P_.good : COL.ink });
      });
      txt(c, 'FREE LIST', 10, 108, { size: 10, col: COL.gold });
      m.free.forEach((p, i) => {
        const x = 6 + i * 78, s = i === m.pc; box(c, x, 114, 74, 50, s ? 'rgba(125,151,232,.25)' : 'rgba(255,255,255,.04)', s ? COL.peri : null, 8);
        txt(c, p.who, x + 37, 128, { size: 10, align: 'center', col: p.used ? COL.dim : COL.ink }); txt(c, p.rates.join('/'), x + 37, 142, { size: 9, align: 'center', col: COL.pale });
        txt(c, `${p.hrs} h worked`, x + 37, 156, { size: 9, align: 'center', col: COL.dim });
      });
      const f = F(); if (f.pend >= 0 && !f.done) txt(c, 'Swap pending: Enter sends the department note', 200, 40, { size: 10, col: COL.warn });
    };
    return m;
  },
});
