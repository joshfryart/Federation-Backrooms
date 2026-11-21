// Assistant Chief Engineer: pre-check EPS for sensor load. Four sensor-branch breakers each show a load percentage; one near its trip point looks
// fine on the meter until it is flipped, and a warm back-of-hand casing only shows on the flip. Flip each (Space) and flag any breaker at 80% or
// more, or warm (Enter). Flagging a sound breaker is a fault; the pre-check is done once every breaker is flipped and every bad one flagged.
import { define, machine, ARROW, SPACE, ENTER, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Pre-check EPS for sensor load', type: 'task:survey' },
  title: 'Flip and flag the hot breaker', dept: 'engineering', host: 'console', tool: 'EPS breaker panel',
  how: 'Left/Right picks a breaker, Space flips it to test (click and heat show up). Press Enter to flag a breaker at 80% or more, or warm.',
  keys: ['Left / Right pick a breaker', 'Space flip to test', 'Enter flag it'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'flip and flag', input: 'arrows+space+enter',
    win: 'all four sensor breakers flipped and every breaker over eighty percent or warm flagged for the Chief',
    fail: 'flagging a sound breaker, or flagging a breaker that was never flipped',
    rule: 'Load shows on the meter; warmth shows only after a flip. Flag any breaker at 80% or more, or warm. Sound ones are left alone.' },
  rush: 'Read the meters from the cover and signed off the pre-check total.',
  captions: { 'false flag': 'sheet flag struck out', untested: 'flagged unflipped breaker' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.sel = 0;
    m.b = Array.from({ length: 4 }, () => ({ load: ri(r, 40, 78), warm: false, flip: false, flag: false })); const hot = ri(r, 0, 3), warm = (hot + ri(r, 1, 3)) % 4;
    m.b[hot].load = ri(r, 80, 94); m.b[warm].warm = true; const bad = (b) => b.load >= 80 || b.warm;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), b = m.b[m.sel];
      if (a === 'L' || a === 'R') { m.sel = (m.sel + (a === 'R' ? 1 : 3)) % 4; return true; }
      if (SPACE(code)) { b.flip = true; return true; }
      if (ENTER(code)) { if (!b.flip) m.fault('untested'); else if (!bad(b)) m.fault('false flag'); else b.flag = true; if (m.b.every(x => x.flip && x.flag === bad(x))) m.win(); return true; } return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const i = m.b.findIndex(x => !x.flip); if (i >= 0) return m.sel === i ? [['Space', true]] : [['ArrowRight', true]];
      const j = m.b.findIndex(x => bad(x) && !x.flag); return j < 0 ? [] : m.sel === j ? [['Enter', true]] : [['ArrowRight', true]]; };
    m.bad = () => { const i = m.b.findIndex(x => !bad(x)); if (m.sel !== i) return 'ArrowRight'; m.b[i].flip = true; return 'Enter'; };
    m.view = () => ({ b: m.b.map(x => [x.load, x.warm]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Flip'], ['Enter', 'Flag']];
    m.draw = (c) => m.b.forEach((b, i) => { const x = 12 + i * 96; box(c, x, 14, 88, 120, COL.panel, m.sel === i ? COL.gold : COL.peri); txt(c, `Branch ${i + 1}`, x + 8, 32, { size: 12 });
      txt(c, `${b.load}%`, x + 8, 62, { size: 24 }); c.fillStyle = COL.warn; c.fillRect(x + 8 + 0.8 * 70, 70, 2, 12); c.fillStyle = COL.peri; c.fillRect(x + 8, 74, b.load * 0.7, 6);
      txt(c, b.flip ? (b.warm ? 'click, WARM' : 'click, cool') : 'not flipped', x + 8, 100, { size: 10, col: b.flip && b.warm ? COL.warn : COL.dim }); if (b.flag) txt(c, '▲ FLAGGED', x + 8, 120, { size: 11, col: COL.warn }); });
    return m;
  },
});
