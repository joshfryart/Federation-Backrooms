// Galley: prepare special-diet and soft-food trays. Each diet card gives a portion (scoops) and a texture. Tap Up once per scoop, then hold Space
// to press the spoon through the food and let go inside the card's texture band (SOFT is mid, SMOOTH is deep), then press Enter to stick the
// patient label on. Too many scoops, a texture outside the band, or labelling a tray that is not ready are faults. Three trays.
import { define, machine, ARROW, SPACE, ENTER, rf, ri, pick, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Prepare special-diet and soft-food trays', type: 'task:medical_relief' },
  title: 'Scoop, mash to texture, label', dept: 'services', host: 'console', tool: 'Diet cards and tray book',
  how: 'Read the diet card. Tap Up once per scoop. Hold Space to mash and let go inside the texture band on the card. Press Enter to label the tray.',
  keys: ['Up tap: one scoop', 'Space hold: press the spoon', 'Enter stick on the label'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'scoop and mash', input: 'arrows+space-hold+enter', win: 'three diet trays each scooped to the card portion, mashed to the card texture band and labelled for the right patient',
    fail: 'too many scoops, releasing the spoon outside the texture band so the food is lumpy or watery, or labelling a tray that is not ready',
    rule: 'Card: N scoops and SOFT or SMOOTH. Tap Up N times, then hold Space and release when the press meter sits in the card band (SOFT is lower, SMOOTH is higher). Then Enter.' },
  rush: 'Spooned a standard portion onto every tray and stuck the labels on.',
  captions: { 'too many scoops': 'spoon clatter', lumpy: 'lumpy squelch', watery: 'watery splash', 'not ready': 'label peel' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, w = m.calm ? 0.07 : 0.05;
    m.T = [0, 1, 2].map(() => { const smooth = r() < 0.5, mid = smooth ? rf(r, 0.78, 0.86) : rf(r, 0.42, 0.55); return { n: ri(r, 1, 3), smooth, mid, sc: 0, mash: false, p: 0, ok: false, who: pick(r, ['Bed 2', 'Bed 4', 'Bed 5', 'Bed 7']) }; });
    m.i = 0; m.rounds = 3; m.round = 0;
    const t = () => m.T[Math.min(2, m.i)];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const k = t(), a = ARROW(code);
      if (a === 'U') { if (down) { if (k.sc >= k.n) m.fault('too many scoops'); else k.sc++; } return true; }
      if (SPACE(code)) { if (down) { if (k.sc === k.n && !k.ok) m.held.S = true; } else if (m.held.S) { m.held.S = false; if (Math.abs(k.p - k.mid) <= w) k.ok = true; else { m.fault(k.p < k.mid ? 'lumpy' : 'watery'); } k.p = 0; } return true; }
      if (!ENTER(code) || !down) return false; if (!k.ok) { m.fault('not ready'); return true; } m.i++; m.round++; if (m.i >= 3) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.S) t().p = Math.min(1.2, t().p + 0.55 * dt); };
    m.hint = () => { const k = t(); if (k.sc < k.n) return [['ArrowUp', true]]; if (!k.ok) return k.p >= k.mid - 0.01 ? [['Space', false]] : [['Space', true]]; return [['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ T: m.T.map(k => [k.n, k.smooth, +k.mid.toFixed(2)]) });
    m.buttons = () => [['ArrowUp', 'Scoop'], ['Space', 'Mash'], ['Enter', 'Label']];
    m.draw = (c, W, H, P) => {
      const k = t(); txt(c, `tray ${Math.min(3, m.i + 1)} / 3  ${k.who}`, 20, 22, { size: 13, col: COL.gold }); txt(c, `${k.n} scoops, ${k.smooth ? 'SMOOTH' : 'SOFT'}`, 20, 46, { size: 15 });
      for (let s = 0; s < 3; s++) box(c, 20 + s * 34, 58, 28, 22, s < k.sc ? COL.gold : null, COL.dim, 4);
      txt(c, 'PRESS', 20, 108, { size: 11, col: COL.dim }); bar(c, 70, 99, 220, 12, Math.min(1, k.p), { band: [k.mid - w, k.mid + w], col: COL.peri });
      txt(c, k.ok ? 'texture right: Enter' : k.sc < k.n ? 'scoop' : 'mash', 300, 109, { size: 12, col: k.ok ? P.good : COL.warn });
    };
    return m;
  },
});
