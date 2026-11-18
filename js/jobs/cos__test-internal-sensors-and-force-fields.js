// Chief of security: test the internal sensors and force fields. An eight-cell emitter strip shows the grid; three cells are dead. Hold an arrow to
// drag the sweep line along the strip and tap Space when it sits on a dead cell to tag it. A live emitter hums: tagging it writes a healthy field off.
import { define, machine, ARROW, SPACE, clamp, txt, box, lamp, COL } from './kit.js';

const N = 8;
export default define({
  job: { billet: 'cos', label: 'Test internal sensors and force fields', type: 'loop' },
  title: 'Emitter strip sweep tag', dept: 'security', host: 'console', tool: 'Emitter strip',
  how: 'Hold the left or right arrow to drag the sweep line along the emitter strip. When the line sits on a dead emitter, tap Space to tag it. Never tag a live one.',
  keys: ['← → hold: sweep the line', 'Space: tag a dead emitter'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'sweep and tag', input: 'arrows-hold+space', win: 'every dead emitter on the strip tagged with the sweep line and no live one tagged',
    fail: 'tagging a live emitter, so a healthy field is written up as dead',
    rule: 'Hold an arrow to drag the sweep line along the strip. Space tags the emitter under the line. Dead cells show as dark squares; live ones hum as round lamps.' },
  rush: 'Glanced at the strip and wrote every emitter down as live.',
  captions: { 'tagged live': 'strip buzzes' }, says: {},
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.dead = new Set(); while (m.dead.size < 3) m.dead.add(Math.floor(r() * N));
    m.tag = new Set(); m.pos = 0; m.speed = m.calm ? 2.2 : 3;
    const cell = () => Math.min(N - 1, Math.max(0, Math.floor(m.pos)));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = !!down; return true; }
      if (SPACE(code) && down) {
        const c = cell();
        if (m.dead.has(c)) { if (!m.tag.has(c)) { m.tag.add(c); m.ev('tag', { c }); if (m.tag.size === m.dead.size) m.win(); } }
        else m.fault('tagged live');
        return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const d = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0); m.pos = clamp(m.pos + d * m.speed * dt, 0, N - 1); };
    const target = () => [...m.dead].filter(c => !m.tag.has(c)).sort((a, b) => a - b)[0];
    m.hint = () => {
      const t = target(); if (t === undefined) return [];
      const c = cell(); if (c === t) return [['ArrowLeft', false], ['ArrowRight', false], ['Space', true]];
      return c < t ? [['ArrowRight', true], ['ArrowLeft', false]] : [['ArrowLeft', true], ['ArrowRight', false]];
    };
    m.bad = () => {
      const c = cell(); if (!m.dead.has(c)) return ['Space', true];
      const l = [...Array(N).keys()].find(x => !m.dead.has(x)); return [l > c ? 'ArrowRight' : 'ArrowLeft', true];
    };
    m.view = () => ({ dead: [...m.dead].sort((a, b) => a - b) });
    m.buttons = () => [['ArrowLeft', '◀ sweep'], ['Space', 'tag'], ['ArrowRight', 'sweep ▶']];
    m.draw = (c, W, H, P) => {
      const x0 = 40, w = 320, cw = w / N, y = 70, h = 40;
      for (let k = 0; k < N; k++) {
        const x = x0 + k * cw, dead = m.dead.has(k), tg = m.tag.has(k);
        box(c, x + 3, y, cw - 6, h, dead ? 'rgba(240,147,58,.18)' : 'rgba(125,151,232,.14)', dead ? COL.orange : COL.peri, 6);
        lamp(c, x + cw / 2, y + h / 2, 9, dead ? COL.orange : COL.peri, dead ? 'square' : 'circle');
        if (tg) txt(c, 'X', x + cw / 2, y - 6, { size: 12, align: 'center', col: COL.warn });
      }
      const sx = x0 + m.pos * cw + cw / 2;
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(sx, y - 14); c.lineTo(sx, y + h + 14); c.stroke();
      txt(c, `Tagged ${m.tag.size} / ${m.dead.size} dead`, 200, 150, { size: 12, align: 'center', col: COL.ink });
      txt(c, 'hold ← → to sweep, Space to tag', 200, 164, { size: 10, align: 'center', col: COL.dim });
    };
    return m;
  },
});
