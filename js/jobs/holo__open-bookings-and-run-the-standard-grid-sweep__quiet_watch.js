// Holodeck tech: standard grid sweep. Three emitters each have a tone dial that drifts steadily out of band. Left/Right chooses the emitter,
// Up/Down trims its tone. Keep all three inside their bands for two straight seconds and the sweep readout reaches full, opening the bookings.
import { define, machine, ARROW, rf, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Open bookings and run the standard grid sweep', type: 'task:quiet_watch' },
  title: 'Trim three drifting emitter tones', dept: 'services', host: 'console', tool: 'Grid sweep panel',
  how: 'Each emitter tone drifts. Left and Right pick an emitter, Up and Down trim it. Hold all three inside the band for two seconds to open bookings.',
  keys: ['Left / Right: pick emitter', 'Up / Down: trim its tone'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'trim the grid', input: 'arrows', win: 'all three emitter tones held inside their bands for two straight seconds',
    fail: 'letting an emitter drift far out of band unseen, three times',
    rule: 'Tones start off-centre and keep drifting away. Select with Left/Right, nudge with Up/Down. A tone far past its band is an interlock fault.' },
  rush: 'Opened the booking board without watching the sweep readout settle.',
  captions: { drift: 'interlock drift tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 0.09 : 0.07, hold = m.calm ? 1.5 : 2; m.sel = 0; m.ok = 0;
    m.tone = [0, 1, 2].map(() => 0.5 + (r() < 0.5 ? -1 : 1) * rf(r, 0.1, 0.16)); m.dir = m.tone.map(t => t > 0.5 ? 1 : -1); m.rate = m.tone.map(() => rf(r, 0.015, 0.03));
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'L') m.sel = (m.sel + 2) % 3; else if (a === 'R') m.sel = (m.sel + 1) % 3; else if (a === 'U') m.tone[m.sel] += 0.04; else if (a === 'D') m.tone[m.sel] -= 0.04; else return false; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; let all = true;
      m.tone.forEach((t, i) => { m.tone[i] += m.dir[i] * m.rate[i] * dt; const d = Math.abs(m.tone[i] - 0.5); if (d > band) all = false; if (d > 0.25) { m.fault('drift'); m.tone[i] = 0.5 + m.dir[i] * 0.12; } });
      if (all) { m.ok += dt; if (m.ok >= hold) m.win(); } else m.ok = 0;
    };
    m.hint = () => { const i = m.tone.findIndex(t => Math.abs(t - 0.5) > 0.03); if (i < 0) return []; if (i !== m.sel) return [['ArrowRight', true]]; return [[m.tone[i] > 0.5 ? 'ArrowDown' : 'ArrowUp', true]]; };
    m.bad = () => null;
    m.view = () => ({ tone: m.tone.map(t => +t.toFixed(3)), rate: m.rate.map(t => +t.toFixed(3)) });
    m.buttons = () => [['ArrowLeft', 'Prev'], ['ArrowRight', 'Next'], ['ArrowUp', 'Tone +'], ['ArrowDown', 'Tone -']];
    m.draw = (c, W, H, P) => { m.tone.forEach((t, i) => { const y = 28 + i * 34; txt(c, `${m.sel === i ? '>' : ' '} E${i + 1}`, 16, y + 10, { size: 13, col: m.sel === i ? COL.gold : COL.ink });
      bar(c, 70, y, 300, 14, Math.max(0, Math.min(1, t)), { band: [0.5 - band, 0.5 + band], col: Math.abs(t - 0.5) <= band ? P.good : COL.warn }); });
      txt(c, `sweep readout ${Math.round(m.ok / hold * 100)} %`, 16, 140, { size: 12, col: COL.pale }); };
    return m;
  },
});
