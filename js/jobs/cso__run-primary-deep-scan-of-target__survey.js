// Chief science officer: run the primary deep scan of the target. Key the band from the bridge's order card (digit), turn the bearing wheel
// (hold left / right) until the crosshair sits on the target and the lock light comes on, then hold the scan key (Space) to integrate. The
// signal-to-noise meter climbs only while the lock holds; the target drifts, so keep correcting the wheel while you hold. Let go before the
// SNR clears its threshold and the scan is saved noisy (a fault, start again). Two targets.
import { define, machine, ARROW, SPACE, DIG, ri, rf, clamp, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'cso', label: 'Run primary deep scan of target', type: 'task:survey' },
  title: 'Deep scan lock and integrate', dept: 'sciences', host: 'console', tool: 'Deep scan console',
  how: 'Key the band from the order card (1-4). Hold left / right to turn the bearing wheel onto the target until LOCK lights, then hold Space to integrate, still steering to keep the lock, and let go only once the SNR passes its threshold.',
  keys: ['1-4 band', '◀ ▶ hold: bearing wheel', 'Space hold: integrate'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'integrate on lock', input: 'digits+arrows-hold+space-hold', win: 'each target keyed on its ordered band and integrated under a held lock until the signal-to-noise clears its threshold before release',
    fail: 'keying the wrong band, integrating without parameters, or letting go of the scan key before the SNR threshold',
    rule: 'Digit = the band on the order card. Hold arrows to steer the crosshair onto the drifting target (LOCK lamp). Hold Space: SNR rises while locked and sinks when not. Release only above the threshold line.' },
  rush: 'Took a two-second snapshot and saved it as the deep scan.',
  captions: { 'wrong band': 'parameter reject tone', 'noisy scan': 'static hiss', 'no parameters': 'console buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 2.2 : 1.5, wheel = 6, thr = 1;
    m.tg = [0, 1].map(() => ({ band: ri(r, 1, 4), tb: rf(r, 40, 320), dr: rf(r, 0.35, 0.6) * (r() < 0.5 ? -1 : 1), gain: rf(r, 0.24, 0.32), range: +rf(r, 0.4, 3.5).toFixed(2), it: ri(r, 3, 6) * 10, off: rf(r, 10, 22) * (r() < 0.5 ? -1 : 1) }));
    m.i = 0; m.bandSet = 0; m.snr = 0; m.dn = {}; m.bf = 0; m.rounds = 2; m.round = 1; m.b = m.tg[0].tb + m.tg[0].off;
    const T = () => m.tg[m.i], locked = () => Math.abs(m.b - T().tb) < tol;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { m.dn[a] = down; return true; } if (a) return true;
      if (d) { if (down && !m.dn[code]) { if (d === T().band) m.bandSet = d; else m.fault('wrong band'); } m.dn[code] = down; return true; }
      if (!SPACE(code)) return false;
      if (down && !m.dn.S) { m.dn.S = true; if (!m.bandSet) { m.fault('no parameters'); m.dn.S = 'x'; } }
      else if (!down && m.dn.S) { const was = m.dn.S; m.dn.S = false; if (was === true) { if (m.snr >= thr) { m.i++; m.round = 2; if (m.i >= 2) m.win(); else { m.bandSet = 0; m.snr = 0; m.b = T().tb + T().off; } } else { m.fault('noisy scan'); m.snr = 0; } } }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const t = T(); t.tb += t.dr * dt * (1 + 0.5 * Math.sin(m.t * 1.7));
      m.b += ((m.dn.R ? 1 : 0) - (m.dn.L ? 1 : 0)) * wheel * dt;
      if (m.dn.S === true) m.snr = clamp(m.snr + (locked() ? t.gain : -0.4) * dt, 0, 1.4);
    };
    m.hint = () => {
      const t = T(); if (!t) return []; if (!m.bandSet) return [['Digit' + t.band, !m.dn['Digit' + t.band]]];
      const e = t.tb - m.b, out = [['ArrowRight', e > 0.5], ['ArrowLeft', e < -0.5]];
      out.push(['Space', m.snr < thr && (m.dn.S === true || locked())]); return out;
    };
    m.bad = () => ['Space', ++m.bf % 2 === 0];
    m.view = () => ({ tg: m.tg.map(t => [t.band, +t.tb.toFixed(1), +t.off.toFixed(1)]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['ArrowLeft', '◀ wheel'], ['ArrowRight', 'wheel ▶'], ['Space', 'Scan (hold)']];
    m.draw = (c, W, H, P) => {
      const t = T(); if (!t) return; box(c, 10, 10, 120, 70, 'rgba(247,201,162,.08)', COL.pale, 4);
      txt(c, `ORDER CARD ${m.i + 1}/2`, 16, 26, { size: 10, col: COL.dim }); txt(c, `band ${t.band}`, 16, 44, { size: 13, col: m.bandSet ? P.good : COL.gold });
      txt(c, `range ${t.range} ly · ${t.it} s`, 16, 60, { size: 10, col: COL.ink }); txt(c, `brg ≈ ${Math.round(t.tb)}°`, 16, 74, { size: 10, col: COL.ink });
      const cx = 230, sc = 4; box(c, 140, 10, 180, 70, 'rgba(255,255,255,.04)', COL.dim, 4);
      const tx = cx + (t.tb - m.b) * sc; c.fillStyle = COL.peri; c.beginPath(); c.arc(Math.max(146, Math.min(314, tx)), 45, 5, 0, 6.283); c.fill();
      c.strokeStyle = locked() ? P.good : COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 12, 45); c.lineTo(cx + 12, 45); c.moveTo(cx, 25); c.lineTo(cx, 65); c.stroke();
      txt(c, `wheel ${m.b.toFixed(1)}°`, 146, 76, { size: 10, col: COL.dim });
      lamp(c, 345, 30, 9, locked() ? P.good : '#333', locked() ? 'circle' : 'triangle'); txt(c, 'LOCK', 360, 34, { size: 10, col: locked() ? COL.ink : COL.dim });
      txt(c, 'SIGNAL / NOISE', 10, 104, { size: 10, col: COL.dim }); bar(c, 10, 112, 300, 14, m.snr / 1.4, { mark: thr / 1.4, col: m.snr >= thr ? P.good : COL.gold });
      txt(c, m.dn.S === true ? 'integrating… hold' : m.bandSet ? 'hold Space to integrate' : 'key the band first', 10, 146, { size: 11, col: COL.pale });
    };
    return m;
  },
});
