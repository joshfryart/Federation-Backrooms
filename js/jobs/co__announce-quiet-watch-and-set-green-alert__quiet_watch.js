// Captain: announce quiet watch and set green alert. Click the alert switch down to green (→), then wait: the bridge lamp follows after a
// moment and the status board after that. Only when both read green, hold the PA key (Space) and read the card; let go as the card ends
// (holding on loops the announcement, letting go early cuts it off). Last, confirm the named watch officer on the bill (Enter) once logged on.
import { define, machine, SPACE, ARROW, ENTER, rf, pick, txt, box, bar, lamp, COL } from './kit.js';

const POS = ['Red', 'Amber', 'Green'];
const OFF = ['Lt. Sorensen', 'Lt. Cmdr. Abara', 'Lt. Haddad', 'Lt. Quist'];

export default define({
  job: { billet: 'co', label: 'Announce quiet watch and set green alert', type: 'task:quiet_watch' },
  title: 'Green-alert settle and announce', dept: 'command', host: 'console', tool: 'Chair alert switch and PA key',
  how: 'Turn the alert switch to green and wait for the lamp and the status board to follow; then hold the PA key to read the card, letting go as it ends.',
  keys: ['→ switch toward green', 'Space hold: PA', 'Enter confirm watch bill'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'settle then announce', input: 'arrows+space-hold+enter', win: 'switch, lamp and board all green before a single clean announcement, then the named officer confirmed on the bill',
    fail: 'keying the PA while the lamp or board still reads amber, holding it so the message loops, or cutting it short',
    rule: 'Press → until the switch reads Green and wait for both lamps below to turn green. Then hold Space; release once the card bar is full but before it loops. Enter when the officer shows logged on.' },
  rush: 'Announced green over the PA while the board was still amber.',
  captions: { 'announced on amber': 'PA chirp over amber tone', 'PA looping': 'announcement repeats', 'cut off': 'PA clicks off', 'not logged on': 'watch bill buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, grace = m.calm ? 1.0 : 0.7;
    m.sw = 1; m.lamp = 1; m.board = 1; m.lampLag = rf(r, 0.6, 1.3); m.boardLag = rf(r, 0.6, 1.6); m.since = 0; m.dur = rf(r, 2.2, 3.2);
    m.who = pick(r, OFF); m.logLag = rf(r, 0.5, 1.5); m.pa = 0; m.done = false; m.logT = -1; m.rounds = 3; m.round = 0;
    const green = () => m.lamp === 2 && m.board === 2;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) {
        const was = m.held.S; m.held.S = down; if (m.done) return true;
        if (!was && down) { if (!green()) { m.fault('announced on amber'); m.held.S = false; } m.pa = 0; }
        if (was && !down && m.pa > 0) { if (m.pa < m.dur) { m.fault('cut off'); m.pa = 0; } else { m.done = true; m.round = 2; m.logT = m.t; } }
        return true;
      }
      if (!down) return false; const a = ARROW(code);
      if (a === 'R' || a === 'D') { if (m.sw < 2) { m.sw++; m.since = 0; } return true; }
      if (ENTER(code)) { if (!m.done) return true; if (m.t - m.logT < m.logLag) { m.fault('not logged on'); return true; } m.round = 3; m.win(); return true; }
      return !!a;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.since += dt;
      if (m.lamp !== m.sw && m.since > m.lampLag) { m.lamp = m.sw; if (m.sw === 2) m.round = 1; }
      if (m.board !== m.lamp && m.since > m.lampLag + m.boardLag) m.board = m.lamp;
      if (m.held.S && !m.done && green()) { m.pa += dt; if (m.pa > m.dur + grace) { m.fault('PA looping'); m.pa = 0; } }
    };
    m.hint = () => {
      if (m.sw < 2) return [['ArrowRight', true]]; if (!green()) return [];
      if (!m.done) return [['Space', m.pa < m.dur + 0.1]];
      return m.t - m.logT >= m.logLag + 0.1 ? [['Enter', true]] : [];
    };
    m.bad = () => m.held.S ? ['Space', false] : ['Space', true];
    m.view = () => ({ lags: [+m.lampLag.toFixed(2), +m.boardLag.toFixed(2)], dur: +m.dur.toFixed(2), who: m.who });
    m.buttons = () => [['ArrowRight', 'Switch ▶'], ['Space', 'Hold: PA'], ['Enter', 'Confirm bill']];
    m.draw = (c, W, H, P) => {
      const st = (k) => k === 2 ? [P.good, 'circle'] : k === 1 ? [COL.warn, 'triangle'] : [P.bad, 'square'];
      txt(c, 'ALERT SWITCH', 10, 18, { size: 10, col: COL.gold });
      POS.forEach((p, j) => { box(c, 10 + j * 50, 24, 46, 20, j === m.sw ? 'rgba(240,147,58,.3)' : 'rgba(255,255,255,.05)', j === m.sw ? COL.orange : null, 6); txt(c, p, 33 + j * 50, 38, { size: 10, align: 'center' }); });
      lamp(c, 24, 66, 9, ...st(m.lamp)); txt(c, `bridge lamp: ${POS[m.lamp]}`, 40, 70, { size: 11 });
      lamp(c, 24, 90, 9, ...st(m.board)); txt(c, `status board: ${POS[m.board]}`, 40, 94, { size: 11 });
      txt(c, 'ANNOUNCEMENT CARD', 200, 18, { size: 10, col: COL.gold });
      txt(c, 'Quiet watch in force. Green alert.', 200, 36, { size: 10 }); txt(c, `Watch officer: ${m.who}.`, 200, 50, { size: 10 });
      bar(c, 200, 60, 180, 10, m.done ? 1 : m.pa / m.dur, { col: m.held.S ? COL.warn : COL.peri, mark: 1 });
      txt(c, m.done ? 'announced ✓' : m.held.S ? '● PA live — let go at the end' : 'PA key up', 200, 86, { size: 10, col: m.held.S ? P.bad : COL.dim });
      txt(c, 'WATCH BILL', 200, 112, { size: 10, col: COL.gold });
      const on = m.done && m.t - m.logT >= m.logLag; txt(c, `${m.who}: ${on ? '● logged on' : '○ not yet'}`, 200, 130, { size: 11, col: on ? P.good : COL.dim });
    };
    return m;
  },
});
