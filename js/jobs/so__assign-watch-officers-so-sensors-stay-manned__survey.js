// Second officer: assign watch officers so sensors stay manned. Each long sensor scan runs longer than any one rested officer may stand.
// The first officer is fixed; pick the relief (↑ / ↓) and slide the handover hour (← / →) so the first officer stops before their rest limit
// and the relief, who must hold the post's rating, can finish the scan inside theirs. Enter books the pair; a split that overruns either
// officer's hours, or an unrated relief, is refused.
import { define, machine, ARROW, ENTER, shuffle, ri, pick, txt, box, bar, COL } from './kit.js';

const POSTS = [['Long-range array', 'LR'], ['Gravimetric sweep', 'GRAV'], ['Subspace listen', 'SUB'], ['Lateral array', 'LAT'], ['Particle count', 'PART']];
const OFF = ['Lt Achebe', 'Ens Bjork', 'Lt Cruz', 'Ens Dahl', 'Lt Eze', 'Ens Faro', 'Lt Grieg', 'Ens Holm', 'Lt Iqbal', 'Ens Joss', 'Lt Kaur', 'Ens Lark'];

export default define({
  job: { billet: 'so', label: 'Assign watch officers so sensors stay manned', type: 'task:survey' },
  title: 'Sensor scan handover split', dept: 'command', host: 'console', tool: 'Sensor watch bill and fatigue meter',
  how: 'Choose a rated relief for each long scan and slide the handover hour so both officers finish inside their rest hours, then book it.',
  keys: ['↑ ↓ relief officer', '← → handover hour', 'Enter book'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'set handover', input: 'arrows+enter', win: 'every long sensor scan split at an hour both rated officers can stand inside their rest limits',
    fail: 'booking a split that runs an officer past rest hours, or a relief without the post rating',
    rule: 'The first officer can stand A hours, the relief B. Put the handover at hour h with h ≤ A and scan length − h ≤ B; the relief must show the post code.' },
  rush: 'Put one officer on each scan end to end and hoped the fatigue meter was wrong.',
  captions: { 'over rest': 'fatigue meter alarm', 'not rated': 'watch bill buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nm = shuffle(r, OFF), slack = m.calm ? 3 : 2;
    m.scans = shuffle(r, POSTS).slice(0, 3).map(([post, code], i) => {
      const L = ri(r, 9, 14), a = ri(r, 4, L - 3), b = L - a + ri(r, 0, slack - 1) + 1, o = 1 + i * 4, other = pick(r, POSTS.filter(p => p[1] !== code))[1];
      const rel = shuffle(r, [{ who: nm[o + 1], rates: [code, other], hrs: b, ok: true }, { who: nm[o + 2], rates: [other], hrs: L, ok: false }, { who: nm[o + 3], rates: [code], hrs: Math.max(1, L - a - ri(r, 1, 3)), ok: false }]);
      return { post, code, L, first: { who: nm[o], hrs: a }, rel, ri: 0, h: ri(r, 0, 1) ? 0 : L, done: false };
    });
    m.rounds = 3; m.round = 0;
    const S = () => m.scans[m.round];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), s = S(); if (!s) return false;
      if (a === 'U' || a === 'D') { s.ri = (s.ri + (a === 'D' ? 1 : 2)) % 3; return true; }
      if (a === 'L' || a === 'R') { s.h = Math.max(0, Math.min(s.L, s.h + (a === 'R' ? 1 : -1))); return true; }
      if (ENTER(code)) {
        const rel = s.rel[s.ri];
        if (!rel.rates.includes(s.code)) { m.fault('not rated'); return true; }
        if (s.h > s.first.hrs || s.L - s.h > rel.hrs) { m.fault('over rest'); return true; }
        s.done = true; m.round++; m.ev('book', { post: s.code, h: s.h }); if (m.round >= 3) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      const s = S(); if (!s) return []; const rel = s.rel[s.ri]; if (!rel.ok) return [['ArrowDown', true]];
      const lo = s.L - rel.hrs, hi = s.first.hrs; if (s.h < lo) return [['ArrowRight', true]]; if (s.h > hi) return [['ArrowLeft', true]]; return [['Enter', true]];
    };
    m.bad = () => { const s = S(); if (!s) return null; const rel = s.rel[s.ri]; return rel.ok && s.h <= s.first.hrs && s.L - s.h <= rel.hrs ? 'ArrowDown' : 'Enter'; };
    m.view = () => ({ s: m.scans.map(s => [s.code, s.L, s.first.hrs, s.rel.map(x => x.hrs)]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀ hour'], ['ArrowRight', 'hour ▶'], ['Enter', 'Book']];
    m.draw = (c, W, H, P) => {
      const s = S(); if (!s) return; const rel = s.rel[s.ri];
      txt(c, `${s.post} [${s.code}]  ${s.L} h scan`, 10, 18, { size: 12, col: COL.gold }); txt(c, `scan ${m.round + 1} / 3`, W - 10, 18, { size: 10, col: COL.dim, align: 'right' });
      const X = 20, Wd = W - 40, u = Wd / s.L; box(c, X, 34, Wd, 24, 'rgba(255,255,255,.06)', null, 6);
      c.fillStyle = 'rgba(125,151,232,.55)'; c.fillRect(X, 36, s.h * u, 20); c.fillStyle = 'rgba(244,194,91,.55)'; c.fillRect(X + s.h * u, 36, (s.L - s.h) * u, 20);
      c.fillStyle = '#fff'; c.fillRect(X + s.h * u - 1, 30, 3, 32); txt(c, `handover at hour ${s.h}`, X + s.h * u, 74, { size: 10, align: 'center' });
      const ovA = s.h > s.first.hrs, ovB = s.L - s.h > rel.hrs;
      txt(c, `First: ${s.first.who}  stands ${s.h} h of ${s.first.hrs} h rest left ${ovA ? '⚠ OVER' : '✓'}`, 12, 96, { size: 11, col: ovA ? COL.warn : COL.ink });
      bar(c, 12, 102, 180, 8, s.h / Math.max(1, s.first.hrs) / 1.5, { mark: 1 / 1.5, col: ovA ? P.bad : P.good });
      txt(c, `Relief ▲▼: ${rel.who} [${rel.rates.join(' ')}]  stands ${s.L - s.h} h of ${rel.hrs} h ${!rel.rates.includes(s.code) ? '⚠ NOT RATED' : ovB ? '⚠ OVER' : '✓'}`, 12, 130, { size: 11, col: ovB || !rel.rates.includes(s.code) ? COL.warn : COL.ink });
      bar(c, 12, 136, 180, 8, (s.L - s.h) / Math.max(1, rel.hrs) / 1.5, { mark: 1 / 1.5, col: ovB ? P.bad : P.good });
    };
    return m;
  },
});
