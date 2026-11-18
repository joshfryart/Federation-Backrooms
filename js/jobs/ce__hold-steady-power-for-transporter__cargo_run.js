// Chief engineer: hold steady power for the transporter (cargo run). For each cargo cycle the transporter chief calls a buffer figure: trim the
// input valve (Left / Right) until the capacitor needle sits on it, and the pattern lock comes on. From then on the input valve is hands-off:
// any touch drops the lock mid-cycle. Load surges push the needle up; bleed each one with the bleeder valve (Space) before it leaves the band,
// but bleed only into a real surge, because each bleed drops the needle a fixed step.
import { define, machine, ARROW, SPACE, ri, rf, clamp, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'ce', label: 'Hold steady power for transporter', type: 'task:cargo_run' },
  title: 'Pattern lock hands-off bleed', dept: 'engineering', host: 'console', tool: 'Transporter buffer screen',
  how: 'Trim the input valve with Left / Right to the called buffer figure. When PATTERN LOCK lights, leave the input alone: bleed each surge with Space before the needle leaves the band.',
  keys: ['Left / Right input valve (before lock)', 'Space bleeder valve'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'bleed the surge', input: 'arrows+space', win: 'three transport cycles held through pattern lock with the needle inside its band and the input valve untouched',
    fail: 'touching the input valve during lock so the transport drops mid-cycle, or letting a surge (or a needless bleed) carry the needle out of the band',
    rule: 'Before lock, Left / Right trims the input until the needle rests on the call. During lock arrows are forbidden; the needle creeps up in surges and Space bleeds a fixed step off it. Bleed when it is well above the call, not before.' },
  rush: 'Rode the input valve through every lock to keep the needle still.',
  captions: { 'lock dropped': 'transport whine cuts out', 'needle out of band': 'buffer alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 13 : 10, lockDur = 4.5, bleed = 7;
    m.cycles = Array.from({ length: 3 }, () => ({ call: ri(r, 40, 75), surges: [rf(r, 0.4, 1.0), rf(r, 2.0, 2.8)].map(t => ({ t, rate: rf(r, 7, 9.5), d: 1.2 })), start: ri(r, 15, 30) }));
    m.k = 0; m.N = m.cycles[0].start; m.phase = 'set'; m.arm = 0; m.lt = 0; m.rounds = 3; m.round = 0;
    const C = () => m.cycles[m.k];
    const restart = () => { m.phase = 'set'; m.arm = 0; m.lt = 0; m.N = clamp(m.N + rf(r, -18, 18), 5, 95); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { if (m.phase === 'lock') { m.fault('lock dropped'); restart(); } else m.N = clamp(m.N + (a === 'R' ? 4 : -4), 0, 100); return true; }
      if (SPACE(code)) { m.N -= bleed; return true; } return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const c = C();
      if (m.phase === 'set') { m.N = clamp(m.N + Math.sin(m.t * 1.7) * dt * 1.2, 0, 100); if (Math.abs(m.N - c.call) <= 3) { m.arm += dt; if (m.arm >= 0.6) { m.phase = 'lock'; m.lt = 0; } } else m.arm = 0; return; }
      m.lt += dt; for (const s of c.surges) if (m.lt >= s.t && m.lt < s.t + s.d) m.N += s.rate * dt;
      if (Math.abs(m.N - c.call) > band) { m.fault('needle out of band'); restart(); return; }
      if (m.lt >= lockDur) { m.k++; m.round = m.k; if (m.k >= 3) { m.win(); return; } m.phase = 'set'; m.arm = 0; m.N = C().start; }
    };
    m.hint = () => { const c = C(); if (!c) return []; const g = c.call - m.N;
      if (m.phase === 'set') return Math.abs(g) > 2 ? [[g > 0 ? 'ArrowRight' : 'ArrowLeft', true]] : [];
      return m.N - c.call > band * 0.55 ? [['Space', true]] : []; };
    m.bad = () => m.phase === 'lock' ? 'ArrowLeft' : (m.hint()[0] || null);
    m.view = () => ({ cycles: m.cycles.map(c => [c.call, c.start, +c.surges[0].t.toFixed(2)]) });
    m.buttons = () => [['ArrowLeft', '◀ input'], ['ArrowRight', 'input ▶'], ['Space', 'Bleed']];
    m.draw = (c, W, H, P) => { const cy = C() || m.cycles[2], lock = m.phase === 'lock';
      txt(c, `Cycle ${Math.min(3, m.k + 1)}/3 · buffer call ${cy.call}`, 14, 20, { size: 13, col: COL.gold });
      lamp(c, W - 30, 16, 9, lock ? P.good : 'rgba(255,255,255,.15)', lock ? 'square' : 'circle'); txt(c, lock ? 'PATTERN LOCK — hands off input' : 'trim input to the call', W - 46, 20, { size: 11, align: 'right', col: lock ? COL.warn : COL.dim });
      txt(c, 'CAPACITOR', 14, 50, { size: 10, col: COL.peri }); bar(c, 14, 56, W - 28, 18, m.N / 100, { band: [(cy.call - band) / 100, (cy.call + band) / 100], mark: cy.call / 100, col: COL.gold });
      txt(c, `needle ${m.N.toFixed(0)}`, 14, 96, { size: 12 }); if (lock) { txt(c, 'lock', 14, 124, { size: 10, col: COL.peri }); bar(c, 50, 116, W - 64, 8, m.lt / lockDur, { col: P.good }); }
      box(c, 14, H - 30, W - 28, 20, 'rgba(255,255,255,.04)', null, 6); txt(c, 'Space bleeds a fixed step — bleed real surges only', W / 2, H - 16, { size: 10, align: 'center', col: COL.dim }); };
    return m;
  },
});
