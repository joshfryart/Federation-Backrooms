// Quartermaster: verify a spares kit. Each part's spec tag has to match a foam cutout size in the tray. Slide the part over the cutouts
// (Left/Right) and Down to seat it. A part whose spec fits no cutout is failed with Space; forcing it into a cutout is a fault.
import { define, machine, ARROW, SPACE, ri, shuffle, txt, box, COL } from './kit.js';
const SPEC = ['M6x20', 'M8x25', 'M8x30', 'M10x30', 'M10x40', 'M12x40', 'M12x50'];

export default define({
  job: { billet: 'qm', label: 'Verify spares kits against the stress-test plan', type: 'task:shakedown' },
  title: 'Spec tag fit in the foam tray', dept: 'services', host: 'console', tool: 'Spares tray and spec tags',
  how: 'Read the spec tag on the part in hand. Left/Right to the cutout with that exact spec, Down to seat it. If no cutout carries the spec, press Space to fail the part.',
  keys: ['Left/Right slide', 'Down seat part', 'Space fail part'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'seat or fail', input: 'arrows+space', win: 'four parts each seated in the foam cutout carrying their exact spec tag, with the part that fits none failed',
    fail: 'forcing a part into a cutout of a different spec, or failing a part that had a matching cutout',
    rule: 'Compare the part\'s spec tag with the labels on the foam cutouts. Exact match: slide to it and press Down. No cutout has that spec: Space fails it.' },
  rush: 'Pressed every part into the nearest cutout and ticked the kit as complete.',
  captions: { forced: 'part forced in the foam', 'false fail': 'good part tagged out' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, pool = shuffle(r, SPEC), cut = pool.slice(0, 5), odd = pool[5];
    const parts = shuffle(r, [cut[0], cut[1], cut[2], odd]).map(sp => ({ spec: sp, fit: cut.indexOf(sp) })); m.cut = cut; m.parts = parts; m.k = 0; m.sel = 0; m.round = 0; m.rounds = 4;
    const done = () => { m.k++; m.round = m.k; if (m.k >= 4) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const p = m.parts[m.k]; if (!p) return true; const a = ARROW(code);
      if (a === 'L') m.sel = Math.max(0, m.sel - 1); else if (a === 'R') m.sel = Math.min(4, m.sel + 1);
      else if (a === 'D') { if (p.fit === m.sel) { done(); m.sel = 0; } else m.fault('forced'); }
      else if (SPACE(code)) { if (p.fit >= 0) m.fault('false fail'); else { done(); m.sel = 0; } } else return false; return true;
    };
    m.hint = () => { const p = m.parts[m.k]; if (!p) return []; if (p.fit < 0) return [['Space', true]]; return m.sel === p.fit ? [['ArrowDown', true]] : [[m.sel < p.fit ? 'ArrowRight' : 'ArrowLeft', true]]; };
    m.bad = () => { const p = m.parts[m.k]; if (!p) return null; return p.fit === m.sel ? ['ArrowRight', true] : ['ArrowDown', true]; };
    m.view = () => ({ cut: m.cut, parts: m.parts.map(p => p.spec) });
    m.buttons = () => [['ArrowLeft', '<'], ['ArrowRight', '>'], ['ArrowDown', 'Seat'], ['Space', 'Fail']];
    m.draw = (c, W, H, P) => {
      const p = m.parts[Math.min(m.k, 3)]; txt(c, `part ${m.k + 1}/4  spec ${p.spec}`, 10, 18, { size: 14, col: COL.gold });
      m.cut.forEach((s, i) => { const x = 10 + i * 76; box(c, x, 50, 70, 60, i === m.sel ? COL.panel : 'rgba(255,255,255,.05)', i === m.sel ? COL.gold : COL.dim, 5); txt(c, s, x + 35, 86, { size: 12, align: 'center' }); });
      txt(c, 'slide, Down to seat · Space if no cutout fits', 10, 150, { size: 11, col: COL.dim });
    };
    return m;
  },
});
