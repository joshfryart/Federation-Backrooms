// Lab technician, medical relief: culture and pathogen ID. First pick a single clean colony off the plate with the loop (1-4): mixed colonies
// show a second ring or a ragged rim. Then put the streak under the microscope and rack the focus (↑ ↓) until the contrast meter peaks and the
// cell outline sharpens; only then compare it with the reference card and name the organism (1-4). Picking a mixed colony, naming through a blur,
// or naming the wrong organism are faults.
import { define, machine, ARROW, DIG, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const ORG = [['Rod bacillus', 'rod'], ['Cluster coccus', 'cluster'], ['Chain coccus', 'chain'], ['Spirillum', 'spiral'], ['Vibrio', 'comma'], ['Yeast bud', 'bud']];
export default define({
  job: { billet: 'lab', label: 'Culture and pathogen ID', type: 'task:medical_relief' },
  title: 'Loop a colony, focus, name the bug', dept: 'sciences', host: 'console', tool: 'Sterile loop and microscope',
  how: 'Pick a clean single colony (1-4): mixed ones have a second ring or ragged rim. Rack the focus (↑ ↓) until the contrast peaks, then name the organism from the reference card (1-4).',
  keys: ['1-4 pick colony / name organism', '↑ ↓ rack the focus'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'loop, focus, name', input: 'digits+arrows', win: 'a pure colony looped from each plate, its streak racked into sharp focus and the organism named from the reference card',
    fail: 'looping a mixed colony, naming the organism while the image is still blurred, or naming the wrong organism',
    rule: 'Choose the colony with one smooth rim. Then step the focus up or down until the contrast meter peaks (SHARP), read the cell shape and press its number on the card.' },
  rush: 'Took the biggest colony and wrote down the most likely bug.',
  captions: { 'mixed colony': 'mixed growth', blurred: 'image too soft', misidentified: 'ID rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, sharpW = m.calm ? 1 : 0;
    m.cul = [0, 1, 2].map(() => { const card = shuffle(r, ORG).slice(0, 4), pure = ri(r, 0, 3); return { card, ans: ri(r, 0, 3), pure, mixKind: [0, 1, 2, 3].map(() => ri(r, 0, 1)), best: ri(r, 3, 9), focus: 0 }; });
    m.cul.forEach(c => { c.focus = c.best + ri(r, 3, 5) * (r() < 0.5 ? 1 : -1); });
    m.k = 0; m.phase = 'pick'; m.rounds = 3; m.round = 1;
    const C = () => m.cul[m.k], sharp = () => Math.abs(C().focus - C().best) <= sharpW;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code), c = C();
      if (d >= 1 && d <= 4) {
        if (m.phase === 'pick') { if (d - 1 !== c.pure) { m.fault('mixed colony'); return true; } m.phase = 'focus'; return true; }
        if (!sharp()) { m.fault('blurred'); return true; }
        if (d - 1 !== c.ans) { m.fault('misidentified'); return true; }
        m.ev('id', { k: m.k }); m.k++; m.round = Math.min(3, m.k + 1); m.phase = 'pick'; if (m.k >= 3) m.win(); return true;
      }
      if ((a === 'U' || a === 'D') && m.phase === 'focus') { c.focus += a === 'U' ? 1 : -1; return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.state !== 'play') return []; const c = C(); if (m.phase === 'pick') return [[`Digit${c.pure + 1}`, true]]; if (!sharp()) return [[c.focus < c.best ? 'ArrowUp' : 'ArrowDown', true]]; return [[`Digit${c.ans + 1}`, true]]; };
    m.bad = () => (m.phase === 'pick' ? `Digit${(C().pure + 1) % 4 + 1}` : 'Digit1');
    m.view = () => ({ c: m.cul.map(c => [c.pure, c.ans, c.best, c.card.map(o => o[1])]) });
    m.buttons = () => [1, 2, 3, 4].map(n => [`Digit${n}`, `${n}`]).concat([['ArrowUp', 'Focus ↑'], ['ArrowDown', 'Focus ↓']]);
    const cell = (c, kind, x, y, blur) => {
      c.strokeStyle = COL.pale; c.lineWidth = 2 + blur * 3; c.globalAlpha = 1 - Math.min(0.75, blur * 0.25); c.beginPath();
      if (kind === 'rod') { c.rect(x - 18, y - 6, 36, 12); }
      else if (kind === 'cluster') { for (const [dx, dy] of [[-8, -6], [6, -6], [0, 6], [-10, 6], [10, 4]]) { c.moveTo(x + dx + 6, y + dy); c.arc(x + dx, y + dy, 6, 0, 6.283); } }
      else if (kind === 'chain') { for (let i = -2; i <= 2; i++) { c.moveTo(x + i * 12 + 5, y); c.arc(x + i * 12, y, 5, 0, 6.283); } }
      else if (kind === 'spiral') { for (let i = 0; i <= 24; i++) c.lineTo(x - 24 + i * 2, y + Math.sin(i * 0.8) * 8); }
      else if (kind === 'comma') { c.arc(x, y, 14, 0.4, 2.6); }
      else { c.arc(x - 4, y, 10, 0, 6.283); c.moveTo(x + 18, y - 4); c.arc(x + 12, y - 4, 6, 0, 6.283); }
      c.stroke(); c.globalAlpha = 1;
    };
    m.draw = (c, W, H, P) => {
      const cc = C(); if (!cc) return;
      if (m.phase === 'pick') {
        txt(c, 'PLATE: pick one clean colony', 12, 18, { size: 12, col: COL.gold });
        for (let i = 0; i < 4; i++) { const x = 60 + i * 90, y = 90; c.fillStyle = '#e8d9b0'; c.beginPath(); c.arc(x, y, 22, 0, 6.283); c.fill(); if (i !== cc.pure) { if (cc.mixKind[i]) { c.fillStyle = '#b9a37a'; c.beginPath(); c.arc(x + 9, y - 6, 11, 0, 6.283); c.fill(); } else { c.strokeStyle = '#8f7d55'; c.lineWidth = 3; c.beginPath(); for (let a = 0; a <= 24; a++) c.lineTo(x + Math.cos(a / 24 * 6.283) * (24 + (a % 2) * 5), y + Math.sin(a / 24 * 6.283) * (24 + (a % 2) * 5)); c.stroke(); } } txt(c, `${i + 1}`, x, 140, { size: 14, align: 'center' }); }
        return;
      }
      const blur = Math.abs(cc.focus - cc.best), sh = sharp(); box(c, 12, 12, 150, 146, COL.dark, COL.peri, 70); cell(c, cc.card[cc.ans][1], 87, 85, blur);
      const contrast = Math.max(0, 1 - blur / 6); c.fillStyle = sh ? P.good : COL.warn; c.fillRect(172, 150 - contrast * 120, 10, contrast * 120);
      lamp(c, 177, 20, 7, sh ? P.good : COL.warn, sh ? 'circle' : 'triangle'); txt(c, sh ? 'SHARP' : 'soft', 190, 24, { size: 10, col: sh ? P.good : COL.warn });
      txt(c, 'REFERENCE CARD', 236, 40, { size: 10, col: COL.dim }); cc.card.forEach((o, i) => txt(c, `${i + 1}  ${o[0]} (${o[1]})`, 236, 60 + i * 20, { size: 11 }));
    };
    return m;
  },
});
