// Holodeck tech: request cleaning stock. Three stock lines are shown as stacks of boxes with a par level. Work out the shortfall (par minus
// boxes on the shelf), key that number in with its digit and press Enter to send the request to the quartermaster tray.
import { define, machine, DIG, ENTER, ri, txt, COL } from './kit.js';
const LINES = ['wipes', 'emitter polish', 'glove packs', 'spray bottles', 'lint cloths'];

export default define({
  job: { billet: 'holo', label: 'Request cleaning stock from stores', type: 'loop' },
  title: 'Order the shortfall to par', dept: 'services', host: 'console', tool: 'Stores request form',
  how: 'Count the boxes drawn for each item and subtract from its par level. Press the digit of that shortfall and Enter to send the request.',
  keys: ['1-9 set the quantity', 'Enter send the request'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'order the shortfall', input: 'digits+enter', win: 'three requests sent for exactly par minus the boxes counted',
    fail: 'sending a request for the wrong quantity so the holodeck runs short or over-orders',
    rule: 'Each stock line shows boxes on hand and a par level. Quantity to request is par minus on-hand. Press that digit, then Enter.' },
  rush: 'Ordered a round number of everything and hoped it would cover the month.',
  captions: { 'wrong quantity': 'request bounced' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 3; m.round = 0;
    const deal = () => { m.item = LINES[ri(r, 0, LINES.length - 1)]; m.par = ri(r, 6, 12); m.have = ri(r, Math.max(0, m.par - 9), m.par - 1); m.need = m.par - m.have; m.qty = 0; };
    deal();
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d) { m.qty = d; return true; }
      if (ENTER(code)) { if (m.qty === m.need) { m.round++; if (m.round >= m.rounds) m.win(); else deal(); } else { m.fault('wrong quantity'); m.qty = 0; } return true; } return false;
    };
    m.hint = () => m.qty !== m.need ? [['Digit' + m.need, true]] : [['Enter', true]];
    m.bad = () => 'Enter';
    m.view = () => ({ item: m.item, par: m.par, have: m.have });
    m.buttons = () => [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => ['Digit' + i, String(i)]).concat([['Enter', 'Send']]);
    m.draw = (c, W, H, P) => { txt(c, `${m.item.toUpperCase()}   par ${m.par}`, 20, 28, { size: 14 });
      for (let i = 0; i < m.have; i++) { c.fillStyle = COL.peri; c.fillRect(20 + (i % 12) * 26, 46 + Math.floor(i / 12) * 26, 22, 20); }
      txt(c, `request qty: ${m.qty || '-'}`, 20, 130, { size: 16, col: COL.gold }); txt(c, `request ${m.round + 1} / ${m.rounds}`, 20, 14, { size: 11, col: COL.dim }); };
    return m;
  },
});
