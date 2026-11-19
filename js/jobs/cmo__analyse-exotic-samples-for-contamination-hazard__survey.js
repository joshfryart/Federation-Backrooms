// CMO: analyse exotic samples for contamination hazard (survey). The spectrometer shows the sample's peak list; the hazard library's nearest
// signature is laid over it as a ghost. Hold ← / → to slide the ghost along until its peaks sit on the sample's (the match meter peaks
// there), read the match against the threshold lines, and classify: 1 safe (under 50 %), 2 quarantine (50-80 %), 3 hazard (over 80 %).
import { define, machine, ARROW, DIG, rf, ri, shuffle, txt, bar, COL } from './kit.js';

const SIGS = ['Tellurian prion analogue', 'Silicate spore coat', 'Retroviral capsid lipid', 'Metagenic toxin', 'Polyaromatic biofilm', 'Thalaron-damaged protein'];
export default define({
  job: { billet: 'cmo', label: 'Analyse exotic samples for contamination hazard', type: 'task:survey' },
  title: 'Spectral signature overlay match', dept: 'medical', host: 'console', tool: 'Spectrometer and hazard library',
  how: 'Hold ← / → to slide the library signature over the sample spectrum until its peaks line up, then classify by the match: 1 safe, 2 quarantine, 3 hazard.',
  keys: ['← / → hold slide signature', '1 safe', '2 quarantine', '3 hazard'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'overlay the signature', input: 'arrows-hold+digits', win: 'three exotic samples aligned against the hazard library and classified safe, quarantine or hazard by the match threshold',
    fail: 'classifying before the signature is aligned, or clearing a sample whose match is over the threshold',
    rule: 'Hold an arrow to slide the ghost signature; the match meter peaks when its peaks sit on the sample peaks. Then classify by the threshold lines: under 50 % safe, 50-80 % quarantine, over 80 % hazard.' },
  rush: 'Glanced at the strongest peak, called it inert and released the canister.',
  captions: { 'unaligned read': 'library chimes: no lock', 'cleared a contaminant': 'containment alarm', 'false quarantine': 'quarantine log overruled' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, spd = m.calm ? 0.2 : 0.25, w = m.calm ? 0.05 : 0.04;
    const tiers = shuffle(r, [0, 1, 2, ri(r, 0, 2)]).slice(0, 3), names = shuffle(r, SIGS);
    m.smp = tiers.map((tier, k) => {
      const sig = [0, rf(r, 0.08, 0.14), rf(r, 0.2, 0.28)], at = rf(r, 0.15, 0.6), hit = tier + 1;
      const peaks = sig.slice(0, hit).map(s => ({ x: at + s, h: rf(r, 0.5, 1) }));
      while (peaks.length < 5) { const x = rf(r, 0.05, 0.95); if (peaks.every(p => Math.abs(p.x - x) > 0.05) && sig.every(s => Math.abs(at + s - x) > 0.05)) peaks.push({ x, h: rf(r, 0.25, 0.9) }); }
      const M = [rf(r, 0.25, 0.42), rf(r, 0.56, 0.74), rf(r, 0.86, 0.97)][tier];
      let o = rf(r, 0.05, 0.7); if (Math.abs(o - at) < 0.2) o = at > 0.4 ? at - 0.3 : at + 0.3;
      return { name: names[k], sig, at, peaks, M, tier, o };
    });
    m.k = 0; m.rounds = 3; m.round = 0; m.flash = '';
    const S = () => m.smp[m.k], score = (s) => s.M * Math.exp(-(((s.o - s.at) / (w * 1.5)) ** 2));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; } if (!(d >= 1 && d <= 3)) return false; if (!down) return true; const s = S();
      if (Math.abs(s.o - s.at) > w) { m.fault('unaligned read'); m.flash = 'signature not aligned: no match lock'; return true; }
      if (d - 1 < s.tier) { m.fault('cleared a contaminant'); m.flash = 'match is over that threshold'; return true; }
      if (d - 1 > s.tier) { m.fault('false quarantine'); m.flash = 'match is under that threshold'; return true; }
      m.round++; m.flash = `${s.name}: ${['SAFE', 'QUARANTINE', 'HAZARD'][s.tier]}`; m.held = {}; if (++m.k >= 3) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const s = S(); if (!s) return; s.o = Math.max(0, Math.min(0.75, s.o + ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * spd * dt)); };
    m.hint = () => { const s = S(); if (!s) return []; const d = s.at - s.o;
      if (Math.abs(d) > w * 0.3) return [[d > 0 ? 'ArrowRight' : 'ArrowLeft', true], [d > 0 ? 'ArrowLeft' : 'ArrowRight', false]];
      return [['ArrowRight', false], ['ArrowLeft', false], ['Digit' + (s.tier + 1), true]]; };
    m.bad = () => 'Digit1';
    m.view = () => ({ s: m.smp.map(s => [+s.at.toFixed(3), s.tier]) });
    m.buttons = () => [['ArrowLeft', '◀ slide'], ['ArrowRight', 'slide ▶'], ['Digit1', '1 safe'], ['Digit2', '2 quarantine'], ['Digit3', '3 hazard']];
    m.draw = (c, W, H, P) => {
      const s = S() || m.smp[2], x0 = 14, y0 = 120, ww = 280, sc = score(s);
      txt(c, `Sample ${Math.min(m.k + 1, 3)} / 3 · library: ${s.name}`, x0, 14, { size: 11, col: COL.dim });
      c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(x0, y0, ww, 1);
      for (const p of s.peaks) { c.fillStyle = COL.gold; c.fillRect(x0 + p.x * ww - 2, y0 - p.h * 90, 4, p.h * 90); }
      c.strokeStyle = COL.peri; c.lineWidth = 2; c.setLineDash?.([4, 3]); for (const q of s.sig) { const x = x0 + (s.o + q) * ww; c.beginPath(); c.moveTo(x, y0 + 14); c.lineTo(x, y0 - 96); c.stroke(); } c.setLineDash?.([]);
      txt(c, 'sample ▮  library ┆', x0, y0 + 30, { size: 10, col: COL.dim });
      txt(c, 'MATCH', 350, 14, { size: 10, align: 'center', col: COL.dim }); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(335, 22, 30, 100);
      c.fillStyle = sc >= 0.8 ? P.bad : sc >= 0.5 ? COL.warn : P.good; c.fillRect(339, 122 - sc * 100, 22, sc * 100);
      for (const [v, l] of [[0.5, 'Q'], [0.8, 'H']]) { c.fillStyle = '#fff'; c.fillRect(331, 122 - v * 100, 38, 2); txt(c, l, 374, 126 - v * 100, { size: 10, col: COL.ink }); }
      txt(c, `${Math.round(sc * 100)} %`, 350, 138, { size: 13, align: 'center' }); txt(c, m.flash, 390, 162, { size: 11, align: 'right', col: COL.warn });
    };
    return m;
  },
});
