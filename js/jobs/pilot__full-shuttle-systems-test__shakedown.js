// Pilot: full shuttle systems test. The test rig runs each system in the card's order. Every reading wanders while the system warms up (and
// often passes through the spec band on the way to somewhere else), so a verdict is only worth anything after the warm-up timer runs out. The
// battery and fuel sensors drift between runs: re-run them (Space) and judge the second reading. ↑ passes, ↓ rejects. Judging a cold reading,
// judging a drifting sensor on one run, or the wrong verdict are faults; marginal readings just outside spec must be rejected.
import { define, machine, rf, shuffle, txt, box, bar, COL, ARROW, SPACE } from './kit.js';

const SYS = [['Engine output', '%', 80, 96], ['Life support O₂', '%', 19, 23], ['Navigation drift', 'mrad', 0, 4], ['Battery charge', '%', 85, 100], ['Fuel sensor', '%', 48, 62]];

export default define({
  job: { billet: 'pilot', label: 'Full shuttle systems test', type: 'task:shakedown' },
  title: 'Warm-up before the verdict', dept: 'flight', host: 'console', tool: 'Diagnostic test rig',
  how: 'Wait for each system\'s warm-up bar to run out, then judge the settled reading against its spec: ↑ pass, ↓ reject. Battery and fuel drift: press Space to re-run them and judge the second reading.',
  keys: ['↑ pass', '↓ reject', 'Space re-run'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'settle and rule', input: 'arrows+space',
    win: 'every system ruled on its settled post-warm-up value, drifting sensors re-run once, marginal readings rejected',
    fail: 'passing a reading taken during warm-up, ruling a drifting sensor on a single run, or passing a value just outside spec',
    rule: 'Each reading wanders until the warm-up bar empties; only then press up to pass or down to reject against the printed spec. Battery and fuel need a Space re-run first.' },
  rush: 'Ticked the test card off the first readings on the rig.',
  captions: { 'cold read': 'rig: warm-up incomplete', 'single read': 'rig: re-run required', 'wrong verdict': 'card error tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, WARM = m.calm ? 2.2 : 1.8, RERUN = 1.2;
    const val = (lo, hi, ok) => { const w = hi - lo; return ok ? rf(r, lo + w * 0.15, hi - w * 0.15) : (lo > 0 && r() < 0.5 ? lo - rf(r, 0.03, 0.12) * w : hi + rf(r, 0.03, 0.12) * w); };
    m.sys = SYS.map(([name, unit, lo, hi], k) => { const twice = k >= 3, ok = r() < 0.55, settle = val(lo, hi, ok), first = twice ? val(lo, hi, !ok) : settle;
      const start = (lo + hi) / 2 + rf(r, -0.3, 0.3) * (hi - lo); return { name, unit, lo, hi, twice, ok, v1: +first.toFixed(1), v2: +settle.toFixed(1), start: +start.toFixed(1) }; });
    m.order = [0, 1, 2, ...shuffle(r, [3, 4])]; m.k = 0; m.w = 0; m.runs = 1; m.flash = 0; m.msg = ''; m.round = 1; m.rounds = 5;
    const S = () => m.sys[m.order[m.k]], target = () => (m.runs >= 2 ? S().v2 : S().v1);
    m.reading = () => { const s = S(), dur = m.runs >= 2 ? RERUN : WARM, f = Math.min(1, m.w / dur), from = m.runs >= 2 ? s.v1 : s.start;
      return f >= 1 ? target() : from + (target() - from) * f + Math.sin(m.w * 9) * (s.hi - s.lo) * 0.25 * (1 - f); };
    const warming = () => m.w < (m.runs >= 2 ? RERUN : WARM);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), sp = SPACE(code); if (a !== 'U' && a !== 'D' && !sp) return false; if (!down) return true;
      const s = S();
      if (sp) { if (s.twice && m.runs < 2 && !warming()) { m.runs = 2; m.w = 0; } return true; }
      if (warming()) { m.fault('cold read'); m.flash = 0.7; m.msg = 'STILL WARMING'; return true; }
      if (s.twice && m.runs < 2) { m.fault('single read'); m.flash = 0.7; m.msg = 'RE-RUN FIRST'; return true; }
      const inSpec = target() >= s.lo && target() <= s.hi;
      if ((a === 'U') !== inSpec) { m.fault('wrong verdict'); m.flash = 0.7; m.msg = 'WRONG VERDICT'; return true; }
      m.ev('ruled', { sys: s.name, pass: a === 'U' }); m.k++; m.w = 0; m.runs = 1; if (m.k >= 5) m.win(); else m.round = m.k + 1; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); m.w += dt; };
    m.hint = () => { if (m.k >= 5 || warming()) return []; const s = S(); if (s.twice && m.runs < 2) return [['Space', true], ['Space', false]];
      const k = target() >= s.lo && target() <= s.hi ? 'ArrowUp' : 'ArrowDown'; return [[k, true], [k, false]]; };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ sys: m.sys.map(s => [s.v1, s.v2, s.ok]), order: m.order });
    m.buttons = () => [['ArrowUp', '▲ Pass'], ['ArrowDown', '▼ Reject'], ['Space', 'Re-run']];
    m.draw = (c, W, H, P) => {
      const s = S() || m.sys[m.order[4]], v = m.k < 5 ? m.reading() : s.v2, span = (s.hi - s.lo) * 2, base = s.lo - (s.hi - s.lo) / 2;
      txt(c, `TEST CARD ${Math.min(m.k + 1, 5)} / 5 · ${s.name.toUpperCase()}`, 12, 18, { size: 11, col: COL.peri });
      txt(c, `${v.toFixed(1)} ${s.unit}`, 12, 54, { size: 24, col: COL.gold }); txt(c, `spec ${s.lo}–${s.hi} ${s.unit}`, 180, 50, { size: 12, col: COL.pale });
      bar(c, 12, 66, 300, 12, (v - base) / span, { band: [(s.lo - base) / span, (s.hi - base) / span], mark: (v - base) / span, col: 'rgba(0,0,0,0)' });
      const dur = m.runs >= 2 ? RERUN : WARM; txt(c, warming() ? 'WARM-UP' : 'settled', 12, 104, { size: 11, col: warming() ? COL.warn : P.good });
      bar(c, 80, 95, 160, 10, 1 - Math.min(1, m.w / dur), { col: COL.lav });
      if (s.twice) txt(c, `drifting sensor · run ${m.runs} of 2${m.runs < 2 ? ' · re-run (Space)' : ''}`, 12, 126, { size: 11, col: COL.ink });
      box(c, 300, 92, 88, 40, 'rgba(255,255,255,.05)', null, 6); txt(c, `${m.k} ruled`, 344, 117, { size: 12, col: COL.dim, align: 'center' });
      if (m.flash > 0) txt(c, m.msg, W - 12, H - 10, { size: 12, col: P.bad, align: 'right' });
    };
    return m;
  },
});
