// Assistant Chief Engineer: divert extra power to sensors. Every step up of the sensor feeder dips the shared bus voltage, which then creeps
// back. Climb to the ordered allocation one step at a time, never stepping while the bus is still low enough that another dip would drop it
// below minimum, then lock the relay with Enter. Locking at the wrong level is a fault too.
import { define, machine, ARROW, ENTER, ri, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Divert extra power to sensors', type: 'task:survey' },
  title: 'Stair-step the sensor feed', dept: 'engineering', host: 'console', tool: 'Feeder selector and bus gauge',
  how: 'Press Up to raise the sensor feeder one step; each step dips the bus, which recovers slowly. Reach the ordered level, then press Enter to lock.',
  keys: ['Up raise a step', 'Down back off a step', 'Enter lock the relay'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'stair-step feed', input: 'arrows+enter',
    win: 'feeder raised to the ordered level in steps without the bus voltage falling under minimum, then the relay locked',
    fail: 'stepping up on a low bus so it falls under minimum, or locking the relay at the wrong allocation',
    rule: 'Each Up step costs bus voltage which recovers slowly; wait for the needle to recover before the next step. Lock at the ordered level.' },
  rush: 'Slammed the feeder to the ordered level in one move and let the bus fall where it may.',
  captions: { 'bus sag': 'bus under-voltage tone', 'wrong level': 'relay locked at wrong level' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.tgt = ri(r, 4, 6); m.a = 0; m.v = 1; m.min = 0.6; m.dip = 0.12 + r() * 0.03; m.rec = m.calm ? 0.55 : 0.4;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U' && m.a < 8) { m.a++; m.v -= m.dip; if (m.v < m.min) { m.fault('bus sag'); m.v = 0.85; } return true; }
      if (a === 'D' && m.a > 0) { m.a--; return true; }
      if (ENTER(code)) { if (m.a === m.tgt) m.win(); else m.fault('wrong level'); return true; } return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const rest = 1 - 0.01 * m.a; m.v = Math.min(rest, m.v + m.rec * dt); };
    m.safe = () => m.v - m.dip >= m.min + 0.06;
    m.hint = () => m.a < m.tgt ? (m.safe() ? [['ArrowUp', true]] : []) : [['Enter', true]];
    m.bad = () => (m.a < 8 ? 'ArrowUp' : 'Enter');
    m.view = () => ({ tgt: m.tgt, dip: +m.dip.toFixed(3) });
    m.buttons = () => [['ArrowUp', 'Step up'], ['ArrowDown', 'Step down'], ['Enter', 'Lock']];
    m.draw = (c) => { txt(c, `ordered level ${m.tgt}`, 14, 22, { size: 13, col: COL.gold }); txt(c, `sensor feed ${m.a}`, 14, 44, { size: 13 });
      for (let i = 0; i < 8; i++) box(c, 14 + i * 24, 54, 20, 18, i < m.a ? COL.peri : COL.panel, i + 1 === m.tgt ? COL.gold : null, 3);
      txt(c, 'BUS VOLTAGE', 14, 100, { size: 10, col: COL.dim }); bar(c, 14, 106, 260, 14, m.v, { band: [m.min, 1], col: m.v < m.min + 0.08 ? COL.warn : COL.pale, mark: m.min });
      txt(c, m.safe() ? 'recovered: safe to step' : 'recovering...', 14, 140, { size: 11, col: m.safe() ? COL.pale : COL.warn }); };
    return m;
  },
});
