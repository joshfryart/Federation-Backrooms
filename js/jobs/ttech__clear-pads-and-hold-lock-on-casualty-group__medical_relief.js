// Transporter tech: clear the pads and hold lock on the casualty group. First lock the casualty beacons in triage order: every RED before
// any YELLOW, every YELLOW before any GREEN. Then hold the group: each beacon weakens at its own rate, and a lock re-asserted (its number)
// once its light has dropped below the refresh mark comes back to full. Re-asserting a lock that is still strong makes it jitter; a light
// that fades out strands a patient on the pad. Hold the group until the bridge confirms.
import { define, machine, DIG, rf, shuffle, txt, bar, lamp, COL } from './kit.js';

const TRI = [['RED', 'triangle'], ['YELLOW', 'diamond'], ['GREEN', 'circle']];
export default define({
  job: { billet: 'ttech', label: 'Clear pads and hold lock on casualty group', type: 'task:medical_relief' },
  title: 'Casualty lock juggling by triage', dept: 'operations', host: 'console', tool: 'Casualty beacon lock board',
  how: 'Lock the beacons by number in triage order (red, then yellow, then green), then re-lock each one as its light drops under the refresh mark until the bridge confirms.',
  keys: ['1-5 lock / re-lock that beacon'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'juggle locks', input: 'digits', win: 'casualty beacons locked red-yellow-green and every lock light kept alive until the bridge confirms the group',
    fail: 'locking out of triage order, re-locking a strong beacon, or letting a lock light fade out',
    rule: 'Press the numbers of the red beacons first, then yellow, then green. After that each light drains at its own rate: press its number once it is under the white mark, never above it, never let it empty.' },
  rush: 'Locked the whole group in one sweep and waited for the bridge.',
  captions: { 'triage order': 'error buzz', jitter: 'lock warble', stranded: 'beacon drop tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 1.5 : 1, MARK = 0.4;
    const tri = shuffle(r, [0, 1, 2, r() < 0.5 ? 0 : 2, 1]);
    m.bs = tri.map((t, i) => ({ n: `Casualty ${String.fromCharCode(65 + i)}`, t, s: 0, on: false, rate: rf(r, 0.055, 0.12) / k }));
    m.hold = 13 * k; m.held0 = -1; m.rounds = 5; m.round = 0;
    const nextTri = () => Math.min(...m.bs.filter(b => !b.on).map(b => b.t));
    m.key = (code, down = true) => {
      const d = DIG(code); if (!(d >= 1 && d <= 5)) return false; if (m.state !== 'play' || !down) return true; const b = m.bs[d - 1];
      if (!b.on) { if (b.t !== nextTri()) { m.fault('triage order'); return true; } b.on = true; b.s = 1; m.round++; if (m.bs.every(x => x.on)) m.held0 = m.t; return true; }
      if (b.s >= MARK) { m.fault('jitter'); return true; } b.s = 1; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      for (const b of m.bs) if (b.on) { b.s -= b.rate * dt; if (b.s <= 0) { m.fault('stranded'); b.s = 1; } }
      if (m.state === 'play' && m.held0 >= 0 && m.t - m.held0 >= m.hold) m.win();
    };
    m.hint = () => {
      if (m.bs.some(b => !b.on)) { const t = nextTri(), i = m.bs.findIndex(b => !b.on && b.t === t); return [['Digit' + (i + 1), true]]; }
      let lo = -1; m.bs.forEach((b, i) => { if (b.s < MARK - 0.02 && (lo < 0 || b.s < m.bs[lo].s)) lo = i; }); return lo >= 0 ? [['Digit' + (lo + 1), true]] : [];
    };
    m.bad = () => { const i = m.bs.findIndex(b => b.on && b.s > MARK); if (i >= 0) return 'Digit' + (i + 1); const j = m.bs.findIndex(b => !b.on && b.t !== nextTri()); return j >= 0 ? 'Digit' + (j + 1) : null; };
    m.view = () => ({ bs: m.bs.map(b => [b.t, +b.rate.toFixed(3)]) });
    m.buttons = () => [1, 2, 3, 4, 5].map(i => ['Digit' + i, String(i)]);
    m.draw = (c, W, H, P) => {
      const tcol = [P.bad, COL.warn, P.good];
      m.bs.forEach((b, i) => { const y = 16 + i * 28; txt(c, String(i + 1), 18, y + 14, { size: 12, col: COL.dim }); lamp(c, 40, y + 10, 9, tcol[b.t], TRI[b.t][1]);
        txt(c, `${b.n}  ${TRI[b.t][0]}`, 56, y + 14, { size: 11 }); if (b.on) { bar(c, 196, y + 4, 150, 12, b.s, { mark: MARK, col: b.s < MARK ? COL.warn : COL.peri }); if (b.s < MARK) txt(c, 'RE-LOCK', 386, y + 14, { size: 9, col: COL.warn, align: 'right' }); } else txt(c, 'unlocked', 196, y + 14, { size: 10, col: COL.dim }); });
      txt(c, m.held0 < 0 ? 'Lock red, then yellow, then green' : `bridge confirms in ${Math.max(0, m.hold - (m.t - m.held0)).toFixed(0)} s`, 16, 164, { size: 11, col: COL.pale });
    };
    return m;
  },
});
