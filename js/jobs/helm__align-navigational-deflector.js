// Helm: align the navigational deflector. Hold ← / → to turn the dish alignment knob and listen to the hum on the readout: it swells as the
// dish nears true and fades past it. Lock (Space) on the crest of the hum, then set the density compensation dial (1 light, 2 medium,
// 3 heavy) to what the debris gauge reads NOW, not what you set last time. Locking off the crest, or a dial that does not match, is a fault.
import { define, machine, ARROW, SPACE, DIG, rf, ri, txt, box, bar, COL } from './kit.js';

const DENS = ['light', 'medium', 'heavy'];
export default define({
  job: { billet: 'helm', label: 'Align navigational deflector', type: 'loop' },
  title: 'Deflector hum crest lock', dept: 'flight', host: 'console', tool: 'Deflector alignment knob and density dial',
  how: 'Hold ← / → to turn the alignment knob until the hum is loudest, press Space to lock on the crest, then press 1, 2 or 3 to match the debris gauge.',
  keys: ['← / → hold: turn the knob', 'Space lock', '1 / 2 / 3 density dial'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'crest-lock', input: 'arrows-hold+space+digits', win: 'three alignments locked on the crest of the hum with the compensation dial matched to the live debris gauge',
    fail: 'locking before or after the crest, or setting the compensation dial to the previous reading instead of the gauge',
    rule: 'Holding an arrow turns the knob steadily; the hum bar peaks at true alignment and falls either side. Space locks; then a digit sets light, medium or heavy compensation.' },
  rush: 'Locked the dish wherever it was and left the compensation dial on the last setting.',
  captions: { 'locked off crest': 'hum warbles', 'wrong compensation': 'verify light stays dark' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.045 : 0.032, sp = m.calm ? 0.22 : 0.26, w = 0.16;
    m.rs = Array.from({ length: 3 }, () => ({ peak: rf(r, 0.2, 0.8), dens: ri(r, 0, 2) })); m.rounds = 3; m.round = 0;
    m.dial = ri(r, 0, 2); m.phase = 'sweep'; m.cur = 0;
    const startAt = () => { const p = m.rs[m.cur].peak; m.k = p > 0.5 ? p - rf(r, 0.22, 0.32) : p + rf(r, 0.22, 0.32); };
    startAt(); m.held = {};
    m.hum = () => Math.exp(-(((m.k - m.rs[m.cur].peak) / w) ** 2));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (SPACE(code)) { if (down && m.phase === 'sweep') { if (Math.abs(m.k - m.rs[m.cur].peak) > tol) m.fault('locked off crest'); else { m.phase = 'dial'; m.held = {}; } } return true; }
      if (d >= 1 && d <= 3) {
        if (!down || m.phase !== 'dial') return true; m.dial = d - 1;
        if (m.dial !== m.rs[m.cur].dens) { m.fault('wrong compensation'); return true; }
        m.cur++; m.round = m.cur; if (m.cur >= 3) { m.win(); return true; } m.phase = 'sweep'; startAt(); return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt) || m.phase !== 'sweep') return; if (m.held.L) m.k -= sp * dt; if (m.held.R) m.k += sp * dt; m.k = Math.max(0, Math.min(1, m.k)); };
    m.hint = () => {
      if (m.phase === 'dial') return [['Digit' + (m.rs[m.cur].dens + 1), true]];
      const e = m.rs[m.cur].peak - m.k;
      if (Math.abs(e) <= tol * 0.5) return [['ArrowLeft', false], ['ArrowRight', false], ['Space', true]];
      return [[e > 0 ? 'ArrowRight' : 'ArrowLeft', true], [e > 0 ? 'ArrowLeft' : 'ArrowRight', false]];
    };
    m.bad = () => (m.phase === 'sweep' ? 'Space' : 'Digit' + (((m.rs[m.cur].dens + 1) % 3) + 1));
    m.view = () => ({ rs: m.rs.map(x => [+x.peak.toFixed(3), x.dens]) });
    m.buttons = () => [['ArrowLeft', '◀ knob'], ['ArrowRight', 'knob ▶'], ['Space', 'Lock'], ['Digit1', '1 light'], ['Digit2', '2 medium'], ['Digit3', '3 heavy']];
    m.draw = (c, W, H, P) => {
      const h = m.hum(); txt(c, 'DEFLECTOR HUM', 16, 22, { size: 11, col: COL.dim });
      for (let i = 0; i < 24; i++) { const amp = h * 34 * Math.abs(Math.sin(i * 0.9 + m.t * 14)) + 2; c.fillStyle = COL.peri; c.fillRect(16 + i * 9, 62 - amp, 5, amp * 2); }
      txt(c, `knob ${(m.k * 360).toFixed(0)}°`, 16, 118, { size: 13, col: COL.ink }); bar(c, 16, 126, 220, 8, m.k, { col: COL.gold });
      txt(c, m.phase === 'sweep' ? 'find the crest, then Space' : 'LOCKED · set the dial', 16, 154, { size: 12, col: m.phase === 'sweep' ? COL.pale : P.good });
      box(c, 262, 14, 124, 70, COL.panel, null, 6); txt(c, 'DEBRIS GAUGE', 274, 32, { size: 10, col: COL.dim });
      txt(c, DENS[m.rs[Math.min(2, m.cur)].dens].toUpperCase(), 274, 60, { size: 18, col: COL.warn });
      box(c, 262, 94, 124, 62, COL.panel, null, 6); txt(c, 'COMP DIAL', 274, 112, { size: 10, col: COL.dim });
      txt(c, `${m.dial + 1} · ${DENS[m.dial]}`, 274, 138, { size: 15, col: COL.ink });
    };
    return m;
  },
});
