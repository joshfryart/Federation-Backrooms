// Botanist, survey: quarantine-check samples against the beds. The sample rack holds twelve tubes in a 4 by 3 grid; each tube carries a leaf
// glyph. The bed's species card at the top shows the glyph that belongs in this bed. Move the lens over the rack with the arrow keys and press Space
// on every tube whose glyph does not match the card: that tube is foreign and goes to the quarantine shelf. Tag nothing that matches. Enter closes
// the check once every foreign tube is tagged.
import { define, machine, ARROW, SPACE, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const MARKS = ['circle', 'triangle', 'square', 'diamond'], COLS = 4, ROWS = 3;
export default define({
  job: { billet: 'bot', label: 'Quarantine-check samples against the beds', type: 'task:survey' },
  title: 'Tag the foreign tubes on the rack', dept: 'sciences', host: 'console', tool: 'Sample rack and hand lens',
  how: 'The species card shows the bed\'s leaf glyph. Move the lens with the arrows over the 4 by 3 rack and press Space on every tube with a different glyph; Enter closes the check.',
  keys: ['arrows: move the lens', 'Space: tag as foreign', 'Enter: close the check'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'tag the foreign', input: 'arrows+space+enter',
    win: 'every foreign tube on a twelve-tube rack tagged with the lens and the check closed with nothing else tagged',
    fail: 'tagging a tube whose glyph matches the card, or closing the check while a foreign tube is untagged',
    rule: 'Walk the lens over the rack with the arrows. A tube whose glyph is not the card\'s glyph gets Space (tag); matching tubes are left alone. Enter closes once every foreign tube is tagged.' },
  rush: 'Glanced at the tubes and waved them all through to the beds.',
  captions: { 'good tube': 'tube tagged by mistake', 'missed tube': 'check closed with a foreign tube left in the rack' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.cx = 0; m.cy = 0; m.card = ri(r, 0, 3); const odd = new Set(shuffle(r, Array.from({ length: COLS * ROWS }, (_, i) => i)).slice(0, ri(r, 3, 5)));
    m.rack = Array.from({ length: COLS * ROWS }, (_, i) => ({ g: odd.has(i) ? (m.card + ri(r, 1, 3)) % 4 : m.card, foreign: odd.has(i), tag: false }));
    const at = () => m.cy * COLS + m.cx;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a) { if (down) { if (a === 'L') m.cx = Math.max(0, m.cx - 1); if (a === 'R') m.cx = Math.min(COLS - 1, m.cx + 1); if (a === 'U') m.cy = Math.max(0, m.cy - 1); if (a === 'D') m.cy = Math.min(ROWS - 1, m.cy + 1); } return true; }
      if (!down) return SPACE(code) || ENTER(code);
      if (SPACE(code)) { const t = m.rack[at()]; if (!t.foreign) m.fault('good tube'); else t.tag = true; return true; }
      if (ENTER(code)) { if (m.rack.every(t => !t.foreign || t.tag)) m.win(); else m.fault('missed tube'); return true; } return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (m.state !== 'play') return []; let best = -1, bd = 99; m.rack.forEach((t, i) => { if (t.foreign && !t.tag) { const d = Math.abs(i % COLS - m.cx) + Math.abs(Math.floor(i / COLS) - m.cy); if (d < bd) { bd = d; best = i; } } });
      if (best < 0) return [['Enter', true]]; const bx = best % COLS, by = Math.floor(best / COLS); if (bx !== m.cx) return [[bx > m.cx ? 'ArrowRight' : 'ArrowLeft', true]]; if (by !== m.cy) return [[by > m.cy ? 'ArrowDown' : 'ArrowUp', true]]; return [['Space', true]];
    };
    m.bad = () => (m.rack[at()].foreign ? 'ArrowRight' : 'Space');
    m.view = () => ({ card: m.card, rack: m.rack.map(t => t.g) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowRight', '▶'], ['Space', 'Tag'], ['Enter', 'Close']];
    m.draw = (c, W, H, P) => {
      box(c, 14, 8, 120, 40, COL.panel, COL.gold, 6); txt(c, 'BED CARD', 22, 22, { size: 9, col: COL.dim }); lamp(c, 100, 28, 12, COL.gold, MARKS[m.card]); txt(c, `${m.rack.filter(t => t.foreign && t.tag).length}/${m.rack.filter(t => t.foreign).length} tagged`, 22, 40, { size: 9, col: COL.dim });
      m.rack.forEach((t, i) => { const x = 150 + (i % COLS) * 58, y = 12 + Math.floor(i / COLS) * 50, on = i === at(); box(c, x, y, 52, 44, t.tag ? '#4a2a2a' : COL.panel, on ? COL.gold : COL.dim, 5); lamp(c, x + 26, y + 22, 12, t.tag ? COL.warn : COL.peri, MARKS[t.g]); if (t.tag) txt(c, 'Q', x + 44, y + 12, { size: 10, col: COL.warn }); });
    };
    return m;
  },
});
