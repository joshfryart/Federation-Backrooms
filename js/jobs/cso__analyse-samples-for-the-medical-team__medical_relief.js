// Chief science officer: analyse samples for the medical team. The spectrometer trace shows peaks along the wavelength axis. Pick a library
// compound (Up / Down) and slide its line comb along the trace (left / right): when every tooth of the comb sits on a peak, fit it (Space).
// The vial-seal polymer is in the library too: its peaks are contamination, not illness, and must be fitted away like any compound. Peaks
// left unfitted go to sickbay as findings. Fitting a comb that is off its peaks, or sending (Enter) while a present compound is unfitted, is a fault.
import { define, machine, ARROW, SPACE, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const LIB = [['Seal polymer', [0, 2, 9]], ['Tricyclic toxin', [0, 5, 7]], ['Iron chelate', [0, 3, 11]], ['Retroviral RNA', [0, 6]], ['Nitrile salt', [0, 4, 8, 10]], ['Spore lipid', [0, 1, 6]]], N = 40;
export default define({
  job: { billet: 'cso', label: 'Analyse samples for the medical team', type: 'task:medical_relief' },
  title: 'Spectral comb fit for sickbay', dept: 'sciences', host: 'console', tool: 'Spectrometer and reference library',
  how: 'Choose a library compound (Up / Down) and slide its line comb along the trace (left / right). When every tooth lands on a peak, fit it with Space. Fit every compound present, the seal-polymer contamination included, then send to sickbay with Enter.',
  keys: ['▲ ▼ library compound', '◀ ▶ slide the comb', 'Space fit', 'Enter send results'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'slide the comb', input: 'arrows+space+enter', win: 'every library compound present in the vial fitted by sliding its whole line comb onto the trace peaks, contamination included, before the results go to sickbay',
    fail: 'fitting a comb whose teeth miss the peaks, or sending results with a present compound or the seal contamination still unfitted',
    rule: 'A compound fits only where every tooth of its comb sits on a peak. Slide until all teeth light, Space to fit. Enter when no present compound is left; what remains are the unmatched findings.' },
  rush: 'Matched the biggest peak by eye and sent the rest as unknown.',
  captions: { 'false match': 'library reject tone', 'missed compound': 'sickbay query ping' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, order = shuffle(r, [1, 2, 3, 4, 5]), pres = [0, ...order.slice(0, ri(r, 1, 2))];
    if (r() < 0.4) pres.shift();
    m.pos = {}; const peaks = new Set();
    for (const k of pres) { const p = ri(r, 3, N - 13); m.pos[k] = p; for (const d of LIB[k][1]) peaks.add(p + d); }
    m.unk = ri(r, 2, N - 2); while (peaks.has(m.unk)) m.unk = (m.unk + 3) % N; peaks.add(m.unk); m.peaks = peaks;
    m.sel = 0; m.off = LIB.map(() => 0); m.fit = new Set(); m.dn = {}; m.bf = 0;
    const lines = (k, o) => LIB[k][1].map(d => o + d), sits = (k, o) => lines(k, o).every(x => peaks.has(x));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!a && !SPACE(code) && !ENTER(code)) return false;
      const e = down && !m.dn[code]; m.dn[code] = down; if (!e) return true;
      if (a === 'U') m.sel = (m.sel + LIB.length - 1) % LIB.length; else if (a === 'D') m.sel = (m.sel + 1) % LIB.length;
      else if (a === 'L') m.off[m.sel] = Math.max(0, m.off[m.sel] - 1); else if (a === 'R') m.off[m.sel] = Math.min(N - 12, m.off[m.sel] + 1);
      else if (SPACE(code)) { if (m.fit.has(m.sel)) return true; if (sits(m.sel, m.off[m.sel])) m.fit.add(m.sel); else m.fault('false match'); }
      else if (ENTER(code)) { if (pres.every(k => m.fit.has(k))) m.win(); else m.fault('missed compound'); }
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    const tap = (code) => [[code, !m.dn[code]]];
    m.hint = () => { const k = pres.find(x => !m.fit.has(x)); if (k == null) return tap('Enter'); if (m.sel !== k) return tap('ArrowDown'); const o = m.off[k];
      if (o !== m.pos[k]) return tap(o < m.pos[k] ? 'ArrowRight' : 'ArrowLeft'); return tap('Space'); };
    m.bad = () => ['Space', ++m.bf % 2 === 0];
    m.view = () => ({ pres, pos: m.pos, unk: m.unk });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Fit'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      const x0 = 12, w = 376, X = (i) => x0 + (i + 0.5) / N * w, base = 96; c.strokeStyle = COL.dim; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, base); c.lineTo(x0 + w, base); c.stroke();
      const owned = new Set(); for (const k of m.fit) for (const x of lines(k, m.off[k])) owned.add(x);
      for (const p of peaks) { c.strokeStyle = owned.has(p) ? COL.dim : COL.peri; c.lineWidth = 3; c.beginPath(); c.moveTo(X(p), base); c.lineTo(X(p), base - 30 - (p * 7) % 25); c.stroke(); }
      if (!m.fit.has(m.sel)) for (const x of lines(m.sel, m.off[m.sel])) { const on = peaks.has(x); c.strokeStyle = on ? P.good : COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(X(x), 18); c.lineTo(X(x), 36); c.stroke(); txt(c, on ? '●' : '○', X(x), 46, { size: 9, align: 'center', col: on ? P.good : COL.gold }); }
      txt(c, 'wavelength →', x0, base + 12, { size: 9, col: COL.dim });
      LIB.forEach(([nm], k) => txt(c, `${m.fit.has(k) ? '✓ ' : ''}${nm}`, 12 + (k % 3) * 128, 128 + Math.floor(k / 3) * 16, { size: 10, col: k === m.sel ? COL.gold : m.fit.has(k) ? P.good : COL.dim }));
      txt(c, `unfitted peaks: ${[...peaks].filter(p => !owned.has(p)).length}`, 388, 162, { size: 10, align: 'right', col: COL.pale });
    };
    return m;
  },
});
