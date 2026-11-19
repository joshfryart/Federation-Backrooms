// Sensor officer: run a full-spectrum scan and bracket the peaks (survey). The spectral trace fills from the low end. Each of the target's
// peaks gets a pair of frequency cursors that start loose and off-centre: slide the pair (← / →) and squeeze it (↑) or open it (↓) until
// both of the peak's shoulders sit just inside, then save it to the scan record (Enter). A cursor inside a shoulder clips the peak (the
// bracket shows CLIP); saving a clipped peak gives the CSO a wrong composition, saving a loose one drags noise in. Both are faults.
import { define, machine, ARROW, ENTER, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'sensor', label: 'Run full-spectrum scan and bracket', type: 'task:survey' },
  title: 'Spectral peak shoulder bracketing', dept: 'sciences', host: 'console', tool: 'Spectrum console',
  how: 'For each spectral peak, slide the cursor pair (← / →) and squeeze it (↑) or open it (↓) until both shoulders sit just inside, then save with Enter.',
  keys: ['← / → slide bracket', '↑ squeeze · ↓ open', 'Enter save peak'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'bracket shoulders', input: 'arrows+enter', win: 'three spectral peaks saved with frequency cursors snug outside both shoulders, neither clipped nor loose',
    fail: 'saving a bracket that clips a shoulder of the peak, or one so wide it takes in background noise',
    rule: 'Slide the cursor pair over the peak, squeeze it until a cursor is about to touch a shoulder mark (it turns CLIP if it goes inside), and save when both are snug.' },
  rush: 'Saved the whole band as one bracket and let the CSO sort it out.',
  captions: { 'clipped peak': 'clip warning', 'loose bracket': 'noise floor hiss' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 3, fillT = m.calm ? 1.6 : 1.2, slack = m.calm ? 4 : 3;
    const cs = [ri(r, 22, 30), ri(r, 44, 56), ri(r, 70, 78)];
    m.pk = cs.map(c => { const h = ri(r, 3, 7), k = ri(r, 4, 9), s = ri(r, -5, 5) || 3; return { c, h, a: 0.5 + r() * 0.5, lo: c - h - 1 - k + s, hi: c + h + 1 + k + s, saved: false }; });
    m.i = 0; m.round = 1; m.rounds = N;
    const P = () => m.pk[m.i], clip = (p) => p.lo > p.c - p.h || p.hi < p.c + p.h, loose = (p) => p.lo < p.c - p.h - slack || p.hi > p.c + p.h + slack;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!a && !ENTER(code)) return false; if (!down || m.t < fillT) return true; const p = P();
      if (a === 'L') { p.lo--; p.hi--; } else if (a === 'R') { p.lo++; p.hi++; } else if (a === 'U') { if (p.hi - p.lo > 2) { p.lo++; p.hi--; } } else if (a === 'D') { p.lo--; p.hi++; }
      else { if (clip(p)) m.fault('clipped peak'); else if (loose(p)) m.fault('loose bracket'); else { p.saved = true; m.i++; if (m.i >= N) m.win(); else m.round++; } }
      p.lo = Math.max(0, p.lo); p.hi = Math.min(100, p.hi); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.t < fillT || m.i >= N) return []; const p = P(), cc = (p.lo + p.hi) / 2;
      if (cc < p.c - 0.5) return [['ArrowRight', true]]; if (cc > p.c + 0.5) return [['ArrowLeft', true]]; if (p.hi - p.lo > 2 * p.h + 2) return [['ArrowUp', true]]; return [['Enter', true]]; };
    m.bad = () => { if (m.t < fillT) return null; const p = P(); return p.hi - p.lo > 4 ? 'ArrowUp' : 'Enter'; };
    m.view = () => ({ pk: m.pk.map(p => [p.c, p.h]) });
    m.buttons = () => [['ArrowLeft', '◀ slide'], ['ArrowRight', 'slide ▶'], ['ArrowUp', 'Squeeze'], ['ArrowDown', 'Open'], ['Enter', 'Save']];
    const y = (f) => { let v = 0.04 + 0.02 * Math.sin(f * 1.7) * Math.sin(f * 0.37); for (const p of m.pk) v += p.a * Math.exp(-((f - p.c) ** 2) / (2 * (p.h / 2) ** 2)); return v; };
    m.draw = (c, W, H, Pl) => {
      const X = (f) => 14 + f * 3.7, Y = (v) => 140 - v * 100; box(c, 12, 20, 376, 124, 'rgba(255,255,255,.04)', null, 4);
      const upto = Math.min(100, (m.t / fillT) * 100); c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); for (let f = 0; f <= upto; f += 0.5) (f ? c.lineTo(X(f), Y(y(f))) : c.moveTo(X(f), Y(y(f)))); c.stroke();
      m.pk.forEach((p, i) => { if (!p.saved) return; c.fillStyle = 'rgba(79,208,106,.15)'; c.fillRect(X(p.lo), 22, X(p.hi) - X(p.lo), 120); txt(c, 'saved', X(p.c) - 12, 34, { size: 9, col: COL.dim }); });
      if (m.i < N && m.t >= fillT) { const p = P(), bad = clip(p), col = bad ? Pl.bad : loose(p) ? COL.warn : Pl.good;
        c.fillStyle = COL.dim; for (const f of [p.c - p.h, p.c + p.h]) c.fillRect(X(f) - 1, Y(y(f)) - 4, 2, 8);
        c.fillStyle = col; c.fillRect(X(p.lo) - 1, 22, 3, 120); c.fillRect(X(p.hi) - 1, 22, 3, 120);
        txt(c, bad ? 'CLIP' : loose(p) ? 'loose' : 'snug', X(p.hi) + 5, 40, { size: 11, col }); }
      txt(c, m.t < fillT ? 'scanning band…' : `PEAK ${Math.min(N, m.i + 1)} / ${N}  ·  ${m.i < N ? `${(P().lo * 0.4 + 2).toFixed(1)}–${(P().hi * 0.4 + 2).toFixed(1)} THz` : ''}`, 14, 14, { size: 11, col: COL.pale });
      txt(c, '← → slide · ↑ squeeze · ↓ open · Enter save', 14, 160, { size: 10, col: COL.dim });
    };
    return m;
  },
});
