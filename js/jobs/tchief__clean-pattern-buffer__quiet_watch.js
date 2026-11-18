// Transporter chief: clean the pattern buffer contact board. Move the swab along the row of contact pins and stroke each one until its dark
// residue ring is gone. The swab holds cleaner for three strokes; dip it again in the contact cleaner before it runs dry, because a dry swab
// scrapes the pin. Stroking a pin that is already clean bends it.
import { define, machine, ARROW, SPACE, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'tchief', label: 'Clean pattern buffer', type: 'task:quiet_watch' },
  title: 'Contact pin swab', dept: 'operations', host: 'console', tool: 'Buffer contact board and swab',
  how: 'Left and Right move the swab along the pins; Up strokes the pin it is on, lifting one layer of residue. Space dips the swab in cleaner (it is good for three strokes). Never stroke a clean pin.',
  keys: ['← → move along pins', '↑ stroke', 'Space dip the swab'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'swab the pins', input: 'arrows+space', win: 'every contact pin on the board stroked until its residue ring is gone with a wet swab and no clean pin touched',
    fail: 'stroking a pin that is already clean so it bends, or scraping a pin with a dry swab',
    rule: 'Each pin shows its residue rings. Move to a ringed pin and press Up once per ring. The swab meter shows strokes left: at zero, press Space to dip before stroking again.' },
  rush: 'Wiped the whole board with one dry pass of the swab.',
  captions: { 'bent pin': 'pin creak', 'dry scrape': 'scrape' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 7;
    m.pins = Array.from({ length: N }, () => ({ res: r() < 0.25 ? 0 : ri(r, 1, 3) })); if (m.pins.every(p => !p.res)) m.pins[ri(r, 0, N - 1)].res = 2;
    if (m.pins.every(p => p.res)) m.pins[ri(r, 0, N - 1)].res = 0;
    m.at = ri(r, 0, N - 1); m.wet = 0; m.total = m.pins.reduce((a, p) => a + p.res, 0);
    const left = () => m.pins.reduce((a, p) => a + p.res, 0);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (!a && !SPACE(code)) return false; if (!down) return true;
      if (SPACE(code)) { m.wet = 3; m.ev('dip'); return true; }
      if (a === 'L') m.at = Math.max(0, m.at - 1); else if (a === 'R') m.at = Math.min(N - 1, m.at + 1);
      else if (a === 'U') {
        const p = m.pins[m.at];
        if (!p.res) m.fault('bent pin');
        else if (m.wet <= 0) m.fault('dry scrape');
        else { p.res--; m.wet--; m.ev('stroke', { pin: m.at }); if (!left()) m.win(); }
      }
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      const p = m.pins[m.at]; if (p.res) return [[m.wet > 0 ? 'ArrowUp' : 'Space', true]];
      let best = -1; m.pins.forEach((q, k) => { if (q.res && (best < 0 || Math.abs(k - m.at) < Math.abs(best - m.at))) best = k; });
      return best < 0 ? [] : [[best < m.at ? 'ArrowLeft' : 'ArrowRight', true]];
    };
    m.bad = () => 'ArrowUp';   // strokes straight away: dry swab, then clean pins
    m.view = () => ({ pins: m.pins.map(p => p.res) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', 'Stroke'], ['Space', 'Dip']];
    m.draw = (c, W, H, P) => {
      txt(c, 'CONTACT BOARD', 14, 18, { size: 11, col: COL.dim });
      const gap = (W - 60) / (N - 1);
      m.pins.forEach((p, k) => {
        const x = 30 + k * gap, y = 70;
        for (let j = 0; j < p.res; j++) { c.beginPath(); c.arc(x, y, 9 + j * 5, 0, 6.283); c.strokeStyle = 'rgba(120,80,40,.9)'; c.lineWidth = 4; c.stroke(); }
        c.fillStyle = p.res ? '#c9a46a' : '#e8e2d0'; c.fillRect(x - 3, y - 7, 6, 14);
        txt(c, p.res ? `${p.res}` : 'clean', x, 112, { size: 10, align: 'center', col: p.res ? COL.warn : P.good });
        if (k === m.at) { box(c, x - 20, 40, 40, 80, null, COL.orange, 8); txt(c, '▼ swab', x, 34, { size: 10, align: 'center', col: COL.orange }); }
      });
      txt(c, 'swab', 14, H - 18, { size: 11, col: COL.dim });
      for (let j = 0; j < 3; j++) box(c, 50 + j * 22, H - 30, 18, 14, j < m.wet ? COL.peri : 'rgba(255,255,255,.08)', null, 4);
      txt(c, m.wet ? `${m.wet} stroke${m.wet > 1 ? 's' : ''} left` : 'DRY — dip it', 125, H - 18, { size: 11, col: m.wet ? COL.ink : COL.warn });
      txt(c, `residue ${left()} / ${m.total}`, W - 14, H - 18, { size: 11, align: 'right', col: COL.dim });
    };
    return m;
  },
});
