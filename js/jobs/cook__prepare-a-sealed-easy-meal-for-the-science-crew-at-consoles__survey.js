// Cook: pack the console tray. Items come one at a time; place each on the Left or Right side of the tray to keep it balanced (the tray tips
// past a weight difference of four). Messy items (crumbly, drippy) must go in the covered box instead (Up) so nothing sheds near a console.
import { define, machine, ARROW, ri, pick, txt, COL } from './kit.js';
const ITEMS = [['soup pouch', 4, 0], ['bread roll', 2, 1], ['water cup', 3, 0], ['fork', 1, 0], ['paste tub', 2, 1], ['napkins', 1, 0], ['fruit cup', 3, 1], ['tea flask', 4, 0]];

export default define({
  job: { billet: 'cook', label: 'Prepare a sealed, easy meal for the science crew at consoles', type: 'task:survey' },
  title: 'Balance the one-handed tray', dept: 'services', host: 'console', tool: 'Covered tray',
  how: 'Each item has a weight. Press Left or Right to set it on that side and keep the tray level; press Up to put a messy item in the covered box.',
  keys: ['Left / Right: set on that side', 'Up: covered box'], limit: 24, maxFaults: 3,
  fingerprint: { verb: 'balance tray pack', input: 'arrows', win: 'six items packed with the tray level and every messy item in the covered box',
    fail: 'tipping the tray past the weight limit or setting a messy item out in the open',
    rule: 'Items arrive with a weight and a MESSY tag. Left or Right puts it on that side, keeping the difference within four; Up covers a messy one.' },
  rush: 'Piled it all on one side of the tray and carried it with a thumb on the soup.',
  captions: { tipped: 'tray rattles', messy: 'crumbs on the console' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.q = []; for (let i = 0; i < 6; i++) m.q.push(pick(r, ITEMS)); m.k = 0; m.L = 0; m.R = 0; m.rounds = 6; m.round = 0;
    m.key = (code, down = true) => {
      const a = ARROW(code); if (m.state !== 'play' || !down || !a || a === 'D') return false; const it = m.q[m.k];
      if (a === 'U') { if (!it[2]) { m.fault('messy'); return true; } } else { if (it[2]) { m.fault('messy'); return true; }
        const l = m.L + (a === 'L' ? it[1] : 0), rr = m.R + (a === 'R' ? it[1] : 0); if (Math.abs(l - rr) > 4) { m.fault('tipped'); return true; } m.L = l; m.R = rr; }
      m.k++; m.round = m.k; if (m.k >= m.q.length) m.win(); return true;
    };
    m.hint = () => { const it = m.q[m.k]; if (!it) return []; return [[it[2] ? 'ArrowUp' : (m.L <= m.R ? 'ArrowLeft' : 'ArrowRight'), true]]; };
    m.bad = () => (m.q[m.k] && m.q[m.k][2] ? 'ArrowLeft' : 'ArrowUp');
    m.view = () => ({ q: m.q.map(i => i[0] + i[1] + i[2]) });
    m.buttons = () => [['ArrowLeft', 'Left'], ['ArrowUp', 'Cover'], ['ArrowRight', 'Right']];
    m.draw = (c, W, H, P) => { const it = m.q[m.k] || ['done', 0, 0], tilt = (m.R - m.L) / 8;
      txt(c, `NEXT: ${it[0]}  (weight ${it[1]})`, 20, 28, { size: 15 }); if (it[2]) txt(c, 'MESSY - covered box (Up)', 20, 52, { size: 12, col: P.bad });
      c.save && c.save(); c.fillStyle = COL.peri; c.fillRect(70, 110 - tilt * 30, 260, 8); c.restore && c.restore();
      txt(c, `L ${m.L}`, 70, 140, { size: 13 }); txt(c, `R ${m.R}`, 330, 140, { size: 13, align: 'right' }); txt(c, `${m.k} / ${m.q.length} packed`, 20, 14, { size: 11, col: COL.dim }); };
    return m;
  },
});
