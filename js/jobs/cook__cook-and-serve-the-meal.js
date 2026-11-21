// Cook: cook and serve the meal. Rice on the stove scorches unless the spoon drags it off the base: alternate Left and Right to stir (the same
// way twice does nothing). Doneness is hidden: lift the lid and press a grain (Space) to read it, and plate (Enter) only on "just right".
import { define, machine, ARROW, SPACE, ENTER, rf, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'cook', label: 'Cook and serve the meal', type: 'loop' },
  title: 'Stir, press a grain, plate', dept: 'services', host: 'console', tool: 'Stove and heavy pot',
  how: 'Stir the rice by alternating Left and Right so it never catches. Press a grain with Space to learn how done it is, then plate with Enter.',
  keys: ['Left / Right alternate: stir', 'Space press a grain', 'Enter plate the portions'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'stir and plate', input: 'arrows+space+enter', win: 'rice plated while a grain press says just right and the base never caught',
    fail: 'plating hard or mushy rice, or letting the base scorch through while stirring stopped',
    rule: 'Scorch climbs until you stir: Left then Right then Left. Press a grain with Space to read hard, just right or mushy; Enter plates the pot.' },
  rush: 'Served it from the pot as it came, scorched at the bottom and raw on top.',
  captions: { scorched: 'burnt smell alarm', 'bad plate': 'dish clatters back' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.p = 0; m.scorch = 0.1; m.last = null; m.shown = null; m.shownT = 0; m.from = rf(r, 0.52, 0.66); m.to = m.from + 0.2; m.rate = rf(r, 0.09, 0.115);
    const read = () => m.p < m.from ? 'hard' : m.p <= m.to ? 'just right' : 'mushy';
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { if (a !== m.last) { m.scorch = Math.max(0, m.scorch - 0.16); m.last = a; } return true; }
      if (SPACE(code)) { m.shown = read(); m.shownT = 1.6; return true; }
      if (ENTER(code)) { if (read() === 'just right') m.win(); else { m.fault('bad plate'); m.p = Math.max(m.p, 0.3); } return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.p += dt * m.rate; m.scorch += dt * 0.13; if (m.shownT > 0 && (m.shownT -= dt) <= 0) m.shown = null;
      if (m.scorch >= 1) { m.scorch = 0.4; m.fault('scorched'); }
    };
    m.hint = () => {
      const o = [];
      if (m.scorch > 0.35) o.push([m.last === 'L' ? 'ArrowRight' : 'ArrowLeft', true]);
      if (m.shown === 'just right') o.push(['Enter', true]); else if (m.shown === null && m.p >= m.from + 0.02) o.push(['Space', true]);
      return o;
    };
    m.bad = () => 'Enter';
    m.view = () => ({ from: +m.from.toFixed(3), rate: +m.rate.toFixed(3) });
    m.buttons = () => [['ArrowLeft', 'Stir L'], ['ArrowRight', 'Stir R'], ['Space', 'Press grain'], ['Enter', 'Plate']];
    m.draw = (c, W, H, P) => {
      txt(c, 'BASE SCORCH', 24, 30, { size: 11, col: COL.dim }); bar(c, 24, 38, 240, 12, m.scorch, { col: m.scorch > 0.7 ? P.bad : COL.gold });
      txt(c, `last stir: ${m.last || '-'}`, 24, 76, { size: 12, col: COL.pale });
      txt(c, m.shown ? `grain: ${m.shown}` : 'lid down', 24, 108, { size: 18, col: m.shown === 'just right' ? P.good : COL.ink });
      txt(c, 'Enter plates', 24, 140, { size: 11, col: COL.dim });
    };
    return m;
  },
});
