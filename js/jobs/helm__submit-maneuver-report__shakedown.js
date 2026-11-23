// Helm: submit the maneuver report. The report goes to the yard by radio, dictated, not typed. Hold Space to key the microphone while you read the
// report; the level meter shows how loud the transmission is, and the console's input swings with the ship's hum. Hold Up / Down to ride the gain
// and keep the level in the green band. Speak for nine seconds of clean level and the report is read out; garbled for too long and the yard asks you to repeat.
import { define, machine, ARROW, SPACE, rf, txt, box, bar, COL } from './kit.js';

const NEED = 9, LO = 0.4, HI = 0.6;
export default define({
  job: { billet: 'helm', label: 'Submit maneuver report', type: 'task:shakedown' },
  title: 'Dictate the report, ride the gain', dept: 'flight', host: 'console', tool: 'Radio microphone and level meter',
  how: 'Hold Space to talk, and hold Up / Down to turn the gain so the level stays in the green band. Nine seconds of clean level reads the whole report out.',
  keys: ['hold Space: transmit', 'hold Up / Down: gain'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'transmit and trim', input: 'space-hold+arrows-hold',
    win: 'nine seconds of transmission with the level meter kept inside the green band by riding the gain while the hum swings',
    fail: 'staying out of the band for more than three-quarters of a second three times so the yard cannot read the report',
    rule: 'Space keys the mic; the level is the ship\'s swinging hum plus your gain. Hold Up or Down to move the gain and keep the level in the band; seconds only count while Space is held and the level is green.' },
  rush: 'Filed the report with the previous test\'s numbers copied down the page.',
  captions: { garbled: 'yard: transmission garbled, say again' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 0.7 : 1, gr = m.calm ? 1 : 0.8; m.g = rf(r, -0.25, 0.25); m.talk = 0; m.bad_t = 0; m.held = { S: false, U: false, D: false };
    m.ph = [rf(r, 0, 6.28), rf(r, 0, 6.28)]; m.am = [rf(r, 0.14, 0.2) * k, rf(r, 0.07, 0.12) * k]; m.fr = [rf(r, 0.7, 1.0), rf(r, 1.8, 2.4)];
    m.base = () => 0.5 + m.am[0] * Math.sin(m.t * m.fr[0] + m.ph[0]) + m.am[1] * Math.sin(m.t * m.fr[1] + m.ph[1]); m.level = () => m.base() + m.g;
    m.key = (code, down = true) => { if (m.state !== 'play') return false; if (SPACE(code)) { m.held.S = down; return true; } const a = ARROW(code); if (a === 'U' || a === 'D') { m.held[a] = down; return true; } return !!a; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.g += ((m.held.U ? 1 : 0) - (m.held.D ? 1 : 0)) * gr * dt; const l = m.level();
      if (m.held.S) { if (l >= LO && l <= HI) { m.talk += dt; m.bad_t = 0; } else { m.bad_t += dt; if (m.bad_t > 0.75) { m.bad_t = 0; m.fault('garbled'); } } } else m.bad_t = 0;
      if (m.state === 'play' && m.talk >= NEED) m.win();
    };
    m.hint = () => { if (m.state !== 'play') return []; const e = 0.5 - m.level(); return [['Space', true], e > 0.03 ? ['ArrowUp', true] : ['ArrowUp', false], e < -0.03 ? ['ArrowDown', true] : ['ArrowDown', false]]; };
    m.bad = () => null;
    m.view = () => ({ g: +m.g.toFixed(2), a: m.am.map(x => +x.toFixed(2)), p: m.ph.map(x => +x.toFixed(2)) });
    m.buttons = () => [['Space', 'Hold: talk'], ['ArrowUp', '▲ gain'], ['ArrowDown', '▼ gain']];
    m.draw = (c, W, H, P) => {
      const l = Math.max(0, Math.min(1, m.level())), ok = l >= LO && l <= HI; txt(c, 'LEVEL', 14, 26, { size: 10, col: COL.dim }); bar(c, 60, 14, 320, 18, l, { band: [LO, HI], col: ok ? P.good : P.bad });
      txt(c, m.held.S ? (ok ? 'TRANSMITTING' : 'GARBLED') : 'MIC OFF', 200, 70, { size: 16, align: 'center', col: m.held.S ? (ok ? P.good : P.bad) : COL.dim });
      txt(c, `gain ${m.g >= 0 ? '+' : ''}${m.g.toFixed(2)}`, 60, 104, { size: 11, col: COL.pale }); bar(c, 60, 116, 320, 12, m.talk / NEED, {}); txt(c, `${m.talk.toFixed(1)} / ${NEED} s read out`, 200, 150, { size: 11, align: 'center', col: COL.dim });
    };
    return m;
  },
});
