// Holodeck tech: calm program setup. The request card gives a brightness and a sound level. Hold Up/Down to move the scenery brightness and
// Left/Right for the sound. The room readout follows the sliders slowly; press Enter to open the room only once both readouts have settled
// inside the card's band.
import { define, machine, ARROW, ENTER, rf, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Run a calm relaxation program for off-shift survey crew', type: 'task:survey' },
  title: 'Match the card, wait for the readout', dept: 'services', host: 'console', tool: 'Program sliders',
  how: 'Hold Up/Down for brightness and Left/Right for sound until the room readout settles in the card band. Then press Enter to open the room.',
  keys: ['Up / Down hold: brightness', 'Left / Right hold: sound', 'Enter open the room'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'match the card', input: 'arrows-hold+enter', win: 'room readouts settled inside the request card bands before the room was opened',
    fail: 'opening the room while the readouts are still outside the card bands, three times',
    rule: 'The readouts lag the sliders. Hold arrows to move brightness and sound toward the card, let both readouts settle in band, and only then press Enter.' },
  rush: 'Opened the room on the default scene and trusted it felt calm enough.',
  captions: { 'not settled': 'room opened too soon' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 9 : 6; m.card = [rf(r, 15, 35), rf(r, 55, 85)]; if (r() < 0.5) m.card = m.card.reverse(); m.sl = [50, 50]; m.ro = [50, 50];
    m.key = (code, down = true) => {
      const a = ARROW(code); if (m.state !== 'play') return false;
      if (a) { const h = m.held; h[a] = down; return true; }
      if (down && ENTER(code)) { if (ok()) m.win(); else m.fault('not settled'); return true; } return false;
    };
    const ok = () => m.ro.every((v, i) => Math.abs(v - m.card[i]) <= band && Math.abs(m.sl[i] - v) < 2.5);
    m.tick = (dt) => {
      if (!m.live(dt)) return; const h = m.held; m.sl[0] = Math.max(0, Math.min(100, m.sl[0] + ((h.U ? 1 : 0) - (h.D ? 1 : 0)) * 40 * dt)); m.sl[1] = Math.max(0, Math.min(100, m.sl[1] + ((h.R ? 1 : 0) - (h.L ? 1 : 0)) * 40 * dt));
      for (let i = 0; i < 2; i++) m.ro[i] += (m.sl[i] - m.ro[i]) * Math.min(1, dt / 0.7);
    };
    m.hint = () => { const d0 = m.card[0] - m.sl[0], d1 = m.card[1] - m.sl[1]; if (ok()) return [['Enter', true], ['ArrowUp', false], ['ArrowDown', false], ['ArrowLeft', false], ['ArrowRight', false]];
      return [['ArrowUp', d0 > 1.5], ['ArrowDown', d0 < -1.5], ['ArrowRight', d1 > 1.5], ['ArrowLeft', d1 < -1.5]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ card: m.card.map(v => Math.round(v)) });
    m.buttons = () => [['ArrowUp', 'Bright +'], ['ArrowDown', 'Bright -'], ['ArrowRight', 'Sound +'], ['ArrowLeft', 'Sound -'], ['Enter', 'Open']];
    m.draw = (c, W, H, P) => ['BRIGHTNESS', 'SOUND'].forEach((n, i) => { const y = 34 + i * 50, lo = (m.card[i] - band) / 100, hi = (m.card[i] + band) / 100; txt(c, n, 16, y - 8, { size: 11, col: COL.dim });
      bar(c, 16, y, 360, 12, m.ro[i] / 100, { band: [lo, hi], col: Math.abs(m.ro[i] - m.card[i]) <= band ? P.good : COL.gold, mark: m.sl[i] / 100 }); });
    return m;
  },
});
