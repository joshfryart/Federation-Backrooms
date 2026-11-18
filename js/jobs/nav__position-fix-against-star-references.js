// Navigator: position fix against star references. Four star bearings are ruled on the chart, but only three come from the card's stars for this
// watch: the fourth is a bad bearing that misses the small cocked hat the other three make. Strike the stray line out (1 – 4), then take the
// fix (Enter). Fixing with the stray still in, or with a good line struck so only two remain, is a fault.
import { define, machine, DIG, ENTER, rf, ri, pick, shuffle, txt, box, lamp, COL } from './kit.js';

const STARS = ['Vega', 'Deneb', 'Altair', 'Rigel', 'Canopus', 'Arcturus', 'Antares', 'Spica', 'Capella', 'Sirius', 'Procyon', 'Achernar'];
export default define({
  job: { billet: 'nav', label: 'Position fix against star references', type: 'loop' },
  title: 'Cocked-hat star fix', dept: 'flight', host: 'console', tool: 'Chart table and parallel rule',
  how: 'Three of the four bearing lines meet in a small triangle; the fourth misses it. Strike the stray line (1 – 4) and take the fix (Enter).',
  keys: ['1 – 4 strike / restore a line', 'Enter take the fix'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'strike the stray', input: 'digits+enter', win: 'three fixes taken from exactly the three bearings that close a small cocked hat, stray bearing struck out',
    fail: 'taking the fix with the stray bearing still ruled in, or striking a good line and fixing from only two',
    rule: 'Look where the lines cross. The line that passes wide of the little triangle is the stray: press its number to strike it, then Enter to fix the position.' },
  rush: 'Took the fix where the first two lines crossed and logged it.',
  captions: { 'stray line': 'chart table buzz', 'two-line fix': 'pencil snaps' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 3; m.round = 0;
    m.newFix = () => {
      const names = shuffle(r, STARS).slice(0, 4), fx = rf(r, 70, 150), fy = rf(r, 50, 105), base = rf(r, 0, Math.PI), stray = ri(r, 0, 3);
      const angs = shuffle(r, [0, 1, 2, 3].map(k => base + k * Math.PI / 4 + rf(r, -0.12, 0.12)));
      m.fix = { fx, fy, stray, lines: angs.map((a, i) => { const off = i === stray ? (r() < 0.5 ? -1 : 1) * rf(r, m.calm ? 28 : 22, 40) : rf(r, -3, 3); return { name: names[i], a, off, struck: false }; }) };
    };
    m.newFix();
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), f = m.fix;
      if (d >= 1 && d <= 4) { f.lines[d - 1].struck = !f.lines[d - 1].struck; return true; }
      if (!ENTER(code)) return false;
      if (!f.lines[f.stray].struck) { m.fault('stray line'); f.lines.forEach(l => { l.struck = false; }); return true; }
      if (f.lines.some((l, i) => i !== f.stray && l.struck)) { m.fault('two-line fix'); f.lines.forEach(l => { l.struck = false; }); return true; }
      m.round++; m.ev('fix'); if (m.round >= 3) m.win(); else m.newFix(); return true;
    };
    m.hint = () => { const f = m.fix; if (!f.lines[f.stray].struck) return [['Digit' + (f.stray + 1), true]]; const g = f.lines.findIndex((l, i) => i !== f.stray && l.struck); return [[g >= 0 ? 'Digit' + (g + 1) : 'Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ fx: +m.fix.fx.toFixed(1), stray: m.fix.stray, a: m.fix.lines.map(l => +l.a.toFixed(2)) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Enter', 'Take fix']];
    m.draw = (c, W, H, P) => {
      const f = m.fix, X = 12, Y = 12, w = 230, h = 146; box(c, X, Y, w, h, 'rgba(125,151,232,.07)', COL.peri, 4);
      c.save(); c.beginPath(); c.rect(X, Y, w, h); c.clip();
      f.lines.forEach((l, i) => {
        const dx = Math.cos(l.a), dy = Math.sin(l.a), px = X + f.fx - dy * l.off, py = Y + f.fy + dx * l.off;
        c.strokeStyle = l.struck ? 'rgba(168,166,185,.35)' : COL.gold; c.lineWidth = l.struck ? 1 : 2; c.setLineDash?.(l.struck ? [4, 4] : []);
        c.beginPath(); c.moveTo(px - dx * 300, py - dy * 300); c.lineTo(px + dx * 300, py + dy * 300); c.stroke();
        const s = i % 2 ? 1 : -1; txt(c, String(i + 1), px + dx * 58 * s, py + dy * 58 * s - 3, { size: 11, col: l.struck ? COL.dim : COL.pale, align: 'center' });
      });
      c.setLineDash?.([]); c.restore();
      txt(c, 'STAR CARD', 262, 24, { size: 11, col: COL.peri });
      f.lines.forEach((l, i) => { lamp(c, 270, 44 + i * 22, 7, l.struck ? COL.dim : COL.gold, l.struck ? 'square' : 'circle'); txt(c, `${i + 1} ${l.name}${l.struck ? '  struck' : ''}`, 282, 48 + i * 22, { size: 11, col: l.struck ? COL.dim : COL.ink }); });
      txt(c, `fixes ${m.round} / 3`, 262, 146, { size: 11, col: COL.pale });
    };
    return m;
  },
});
