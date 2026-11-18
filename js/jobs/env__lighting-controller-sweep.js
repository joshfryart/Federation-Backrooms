// Environmental tech: lighting controller sweep. The controller board shows six lighting zones; the flagged ones carry a red fault lamp. Pick a
// flagged zone, seat a replacement panel and reset its breaker (Enter), then watch the zone through its steady minute. A replacement that
// flickers during the watch is another dud: pull it (Space) and the next one is seated. Resetting a zone that was never flagged is a fault.
import { define, machine, ARROW, ENTER, SPACE, ri, rf, shuffle, txt, box, lamp, bar, COL } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Lighting controller sweep', type: 'loop' },
  title: 'Lighting zone steady watch', dept: 'engineering', host: 'console', tool: 'Lighting controller board',
  how: 'Move to a zone with a red fault lamp and press Enter to seat a new panel and reset it. Watch it: if it flickers, pull the panel (Space); if it holds steady through the watch, it clears.',
  keys: ['Arrows pick a zone', 'Enter seat + reset', 'Space pull a flickering panel'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'watch the zone', input: 'arrows+enter+space', win: 'every flagged lighting zone reset and held steady through its full watch, with duds pulled',
    fail: 'resetting a zone that was never flagged, pulling a steady panel, or letting a flickering zone run out its watch',
    rule: 'Only zones with a red triangle lamp are faulty: select one and press Enter. During the watch bar, press Space only if the zone flickers; a steady zone clears by itself.' },
  rush: 'Reset every breaker on the board and walked off before the lights had a minute to show anything.',
  captions: { 'wrong zone': 'breaker clunks', 'pulled good': 'panel unlatched', 'fault left live': 'zone flickers on' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, watch = 2.4, NZ = 6;
    const flagged = shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, 3);
    m.z = Array.from({ length: NZ }, (_, i) => ({ code: `L-${ri(r, 10, 89)}`, flag: flagged.includes(i), clear: false, duds: flagged.includes(i) ? ri(r, 0, 1) : 0, at: 0 }));
    m.cur = 0; m.w = null; m.cd = 0; m.rounds = 3; m.round = 0;
    const startWatch = (z) => { m.w = { z, t: 0, flickAt: z.duds > 0 ? rf(r, 0.5, 1.3) : 99 }; };
    m.flick = () => m.w && m.w.t >= m.w.flickAt;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); m.cd = 0.18;
      if (m.w) { if (SPACE(code)) { if (m.flick()) { m.w.z.duds--; startWatch(m.w.z); } else m.fault('pulled good'); return true; } return !!a || ENTER(code); }
      if (a) { m.cur = (m.cur + ({ L: -1, R: 1, U: -3, D: 3 })[a] + NZ) % NZ; return true; }
      if (ENTER(code)) { const z = m.z[m.cur]; if (z.clear) return true; if (!z.flag) { m.fault('wrong zone'); return true; } startWatch(z); return true; }
      return SPACE(code);
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.cd -= dt; if (!m.w) return; m.w.t += dt;
      if (m.w.t >= watch + (m.calm ? 0.6 : 0)) { if (m.flick()) { m.fault('fault left live'); m.w.z.duds = Math.max(0, m.w.z.duds - 1); } else { m.w.z.clear = true; m.round++; if (m.z.every(z => !z.flag || z.clear)) m.win(); } m.w = null; }
    };
    m.hint = () => {
      if (m.cd > 0) return []; if (m.w) return m.flick() && m.w.t - m.w.flickAt > 0.25 ? [['Space', true]] : [];
      const tgt = m.z.findIndex(z => z.flag && !z.clear); if (tgt < 0) return []; if (tgt === m.cur) return [['Enter', true]];
      return [[tgt > m.cur ? 'ArrowRight' : 'ArrowLeft', true]];
    };
    m.bad = () => { if (m.cd > 0) return null; if (m.w) return m.flick() ? null : 'Space'; return m.z[m.cur].flag ? 'ArrowRight' : 'Enter'; };
    m.view = () => ({ z: m.z.map(z => [z.code, z.flag, z.duds]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Enter', 'Seat + reset'], ['Space', 'Pull panel']];
    m.draw = (c, W, H, P) => {
      m.z.forEach((z, i) => {
        const x = 20 + (i % 3) * 82, y = 18 + Math.floor(i / 3) * 70, on = m.w && m.w.z === z, fl = on && m.flick() && Math.floor(m.t * 12) % 2;
        box(c, x, y, 72, 58, fl ? 'rgba(0,0,0,.6)' : z.clear ? 'rgba(79,208,106,.18)' : COL.panel, i === m.cur ? COL.gold : null);
        txt(c, z.code, x + 8, y + 16, { size: 11, col: COL.pale });
        lamp(c, x + 56, y + 14, 8, z.clear ? P.good : z.flag ? P.bad : COL.dim, z.clear ? 'circle' : z.flag ? 'triangle' : 'square');
        txt(c, z.clear ? 'CLEARED' : z.flag ? 'FAULT' : 'ok', x + 8, y + 46, { size: 11, col: z.flag && !z.clear ? P.bad : COL.dim });
      });
      txt(c, 'WATCH', 280, 30, { size: 12, col: COL.gold });
      if (m.w) { bar(c, 280, 40, 104, 10, m.w.t / (watch + (m.calm ? 0.6 : 0)), { col: COL.peri }); txt(c, m.flick() ? 'FLICKERING' : 'steady', 280, 72, { size: 14, col: m.flick() ? P.bad : P.good }); }
      else txt(c, 'select a fault', 280, 72, { size: 11, col: COL.dim });
      txt(c, `zones cleared ${m.round} / 3`, 280, 140, { size: 11, col: COL.pale });
    };
    return m;
  },
});
