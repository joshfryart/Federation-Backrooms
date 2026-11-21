// Galley: serve the regular meals on time. Hold Space to run the scoop into a bowl; the stream surges and slows, and the portion must be let
// go on the rim line (not short, not slopped over). The hot shelf drains by a bowl each time and flashes LOW at one bowl left: Enter reloads
// it from the oven, but only when it is low. Serving from an empty shelf, or reloading early, is a fault.
import { define, machine, SPACE, ENTER, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Serve the regular meals on time', type: 'task:quiet_watch' },
  title: 'Level scoop and hot shelf', dept: 'services', host: 'console', tool: 'Hot shelf and portion scoop',
  how: 'Hold Space to fill the bowl and let go on the rim line; the stream surges, so judge it. When the hot shelf flashes LOW press Enter to reload it.',
  keys: ['Space hold: fill the bowl, release at the rim', 'Enter reload the hot shelf when LOW'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'level the scoop', input: 'space-hold+enter', win: 'five bowls filled level with the rim line for the queue while the hot shelf is reloaded once it shows low',
    fail: 'a short or slopped portion, serving from an empty hot shelf, or reloading the shelf before it is low',
    rule: 'Hold Space; the bowl fills at a surging speed. Release in the rim band. The shelf shows LOW at one bowl left: press Enter then, not earlier, and never run it to nothing.' },
  rush: 'Ladled roughly and let the crew take what they got.',
  captions: { short: 'thin splash', slopped: 'splash and slop', 'cold food': 'empty shelf clatter', 'early reload': 'oven door clang' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, ph = rf(r, 0, 6), base = rf(r, 0.45, 0.6) * (m.calm ? 0.8 : 1), lo = m.calm ? 0.85 : 0.9;
    m.fill = 0; m.shelf = 3; m.cool = 0; m.rounds = 5; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { const was = m.held.S; m.held.S = !!down; if (was && !down && m.fill > 0.03) rel(); return true; }
      if (ENTER(code)) { if (down) { if (m.shelf <= 1) m.shelf += 4; else m.fault('early reload'); } return true; } return false;
    };
    const rel = () => { const f = m.fill; m.fill = 0;
      if (m.shelf <= 0) { m.fault('cold food'); return; } if (f < lo) { m.fault('short'); return; }
      m.shelf--; m.round++; m.cool = 0.4; if (m.round >= 5) m.win(); };
    m.tick = (dt) => { if (!m.live(dt)) return; m.cool = Math.max(0, m.cool - dt);
      if (m.held.S && m.cool <= 0) { m.fill += base * (1 + 0.5 * Math.sin(m.t * 3 + ph)) * dt; if (m.fill > 1.08) { m.fill = 0; m.held.S = false; m.cool = 0.5; m.fault('slopped'); } } };
    m.hint = () => { if (m.shelf <= 1 && m.shelf < 4 && m.fill === 0) return [['Enter', true]]; return m.fill >= lo + 0.02 ? [['Space', false]] : [['Space', true]]; };
    m.bad = () => (m.fill > 0.1 ? ['Space', false] : ['Space', true]);
    m.view = () => ({ base: +base.toFixed(2), ph: +ph.toFixed(2) });
    m.buttons = () => [['Space', 'Scoop'], ['Enter', 'Reload shelf']];
    m.draw = (c, W, H, P) => {
      box(c, 30, 20, 80, 100, 'rgba(255,255,255,.06)', COL.dim, 8); c.fillStyle = COL.gold; c.fillRect(34, 20 + 100 - m.fill * 90 - 6, 72, m.fill * 90);
      c.fillStyle = P.good; c.fillRect(26, 20 + 100 - lo * 90 - 6, 88, 3); txt(c, 'RIM', 118, 20 + 100 - lo * 90 - 2, { size: 10, col: P.good });
      txt(c, 'HOT SHELF', 220, 34, { size: 11, col: COL.dim }); for (let k = 0; k < 5; k++) box(c, 220 + k * 30, 44, 24, 24, k < m.shelf ? COL.gold : null, COL.dim, 4);
      txt(c, m.shelf <= 1 ? 'LOW - Enter' : 'ok', 220, 92, { size: 14, col: m.shelf <= 1 ? COL.warn : COL.dim }); txt(c, `served ${m.round} / 5`, 220, 120, { size: 13, col: COL.pale });
    };
    return m;
  },
});
