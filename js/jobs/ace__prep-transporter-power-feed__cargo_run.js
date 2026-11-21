// Assistant Chief Engineer: prep transporter power feed. Work the main breaker lever up one notch at a time (standby, then full), and leave each
// notch only once the voltage needle has settled. Some feeds read in band at idle but sag as soon as the load comes on at full: those must be
// rejected (Space), not accepted. A sound feed is simply held in band under load.
import { define, machine, ARROW, SPACE, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Prep transporter power feed', type: 'task:cargo_run' },
  title: 'Notch the lever, test under load', dept: 'engineering', host: 'console', tool: 'Main breaker lever and voltage meter',
  how: 'Up moves the lever to the next notch, but only once the voltage needle has settled. At full the load comes on: reject a feed that sags (Space), hold one that stays in band.',
  keys: ['Up next notch', 'Down previous notch', 'Space reject the feed'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'notch the lever', input: 'arrows+space',
    win: 'lever stepped through standby into full with each needle settled, then a sound feed held in band under load or a sagging feed rejected',
    fail: 'moving the lever before the needle settles, accepting a feed that sags under load, or rejecting a feed that holds',
    rule: 'Wait for the needle to settle at each notch. At full the load comes on: if the needle drops under the band, press Space; if it holds, just hold.' },
  rush: 'Threw the lever straight to full and trusted the idle reading.',
  captions: { surged: 'feed surge', 'bad feed accepted': 'transporter feed sags', 'false reject': 'feed wrongly rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 2.8 : 2.2; m.n = 0; m.v = 0.05; m.ok = 0; m.load = 0; m.hold = 0; m.sagger = r() < 0.5; m.full = 0.88 + r() * 0.05; m.lo = 0.84; m.band = [0.84, 0.97];
    const tgt = () => m.n === 0 ? 0.05 : m.n === 1 ? 0.5 : (m.load >= 0.4 && m.sagger ? 0.68 : m.full);
    m.settled = () => Math.abs(m.v - tgt()) < 0.015 && m.ok >= 0.3;
    m.key = (code, down = true) => { if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U') { if (m.n >= 2) return true; if (!m.settled() && m.n > 0) { m.fault('surged'); return true; } m.n++; m.ok = 0; m.load = 0; return true; }
      if (a === 'D') { if (m.n > 0) { m.n--; m.ok = 0; m.load = 0; } return true; }
      if (SPACE(code) && m.n === 2) { if (m.load >= 0.4 && m.v < m.lo) m.win(); else m.fault('false reject'); return true; } return false; };
    m.tick = (dt) => { if (!m.live(dt)) return; m.v += (tgt() - m.v) * Math.min(1, dt * k); m.ok = Math.abs(m.v - tgt()) < 0.015 ? m.ok + dt : 0;
      if (m.n === 2 && m.settled() || m.load > 0) m.load += dt; if (m.n === 2 && m.load >= 0.4) { m.hold = m.v >= m.lo ? m.hold + dt : 0; if (m.hold >= 1.3) m.win(); else if (!m.sagger && m.v < m.lo - 0.1) m.fault('bad feed accepted'); }
      if (m.n === 2 && m.sagger && m.load > 6) m.fault('bad feed accepted'); };
    m.hint = () => m.n < 2 ? (m.settled() ? [['ArrowUp', true]] : []) : (m.sagger && m.load >= 0.4 && m.v < m.lo - 0.02 ? [['Space', true]] : []);
    m.bad = () => (m.n === 0 ? 'ArrowUp' : m.n === 1 ? 'ArrowUp' : null);
    m.view = () => ({ sag: m.sagger, full: +m.full.toFixed(3) });
    m.buttons = () => [['ArrowUp', 'Up'], ['ArrowDown', 'Down'], ['Space', 'Reject']];
    m.draw = (c) => { ['OFF', 'STANDBY', 'FULL'].forEach((s, i) => { box(c, 14, 100 - i * 38, 90, 30, COL.panel, m.n === i ? COL.gold : null); txt(c, s, 22, 120 - i * 38, { size: 12, col: m.n === i ? COL.gold : COL.dim }); });
      txt(c, 'FEED VOLTAGE', 130, 24, { size: 10, col: COL.dim }); bar(c, 130, 32, 250, 16, m.v, { band: m.band, col: COL.pale });
      txt(c, m.n === 2 && m.load >= 0.4 ? 'LOAD ON' : m.settled() ? 'settled' : 'settling...', 130, 76, { size: 14, col: m.settled() ? COL.pale : COL.warn });
      txt(c, m.n === 2 ? `held in band ${m.hold.toFixed(1)} s` : '', 130, 100, { size: 12, col: COL.pale }); };
    return m;
  },
});
