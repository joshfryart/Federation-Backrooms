// Cook: fortified bland meals. Each patient's diet card gives a calorie, salt and softness setting. Select a dial with Up/Down, change it with
// Left/Right, and serve with Enter once all three dials match the card exactly.
import { define, machine, ARROW, ENTER, ri, txt, box, COL } from './kit.js';
const DIALS = ['calories', 'salt', 'softness'];

export default define({
  job: { billet: 'cook', label: 'Cook bland, high-calorie meals for patients and sickbay staff', type: 'task:medical_relief' },
  title: 'Dial in the diet card', dept: 'services', host: 'console', tool: 'Meal dials and diet cards',
  how: 'Up and Down choose a dial, Left and Right change it. Set calories, salt and softness to the diet card, then press Enter to serve the tray.',
  keys: ['Up / Down: pick dial', 'Left / Right: change it', 'Enter serve'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'dial the diet', input: 'arrows+enter', win: 'three patient trays served with calories, salt and softness all matching their card',
    fail: 'serving a tray whose dials do not match the diet card, such as salty food to a heart patient',
    rule: 'The card gives three target numbers. Choose a dial with Up/Down, change it with Left/Right until it reads the card value, then Enter serves.' },
  rush: 'Ladled the same stew for every bed and let the sickbay sort out who could eat it.',
  captions: { mismatch: 'tray sent back' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 3; m.round = 0;
    const deal = () => { m.card = [ri(r, 6, 9), ri(r, 1, 3), ri(r, 1, 3)]; m.dial = [5, 5, 5]; m.sel = 0; };
    deal();
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U') m.sel = (m.sel + 2) % 3; else if (a === 'D') m.sel = (m.sel + 1) % 3;
      else if (a === 'L' || a === 'R') m.dial[m.sel] = Math.max(1, Math.min(9, m.dial[m.sel] + (a === 'R' ? 1 : -1)));
      else if (ENTER(code)) { if (m.dial.join() === m.card.join()) { m.round++; if (m.round >= m.rounds) m.win(); else deal(); } else { m.fault('mismatch'); } } else return false;
      return true;
    };
    m.hint = () => { const i = m.dial.findIndex((v, k) => v !== m.card[k]); if (i < 0) return [['Enter', true]]; if (m.sel !== i) return [['ArrowDown', true]]; return [[m.dial[i] < m.card[i] ? 'ArrowRight' : 'ArrowLeft', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ card: m.card.slice() });
    m.buttons = () => [['ArrowUp', 'Up'], ['ArrowDown', 'Down'], ['ArrowLeft', 'Less'], ['ArrowRight', 'More'], ['Enter', 'Serve']];
    m.draw = (c, W, H, P) => { DIALS.forEach((d, i) => { const y = 30 + i * 34; box(c, 16, y - 16, 368, 26, m.sel === i ? 'rgba(244,194,91,.18)' : null, m.sel === i ? COL.gold : null, 4);
      txt(c, d, 26, y, { size: 13 }); txt(c, `card ${m.card[i]}`, 190, y, { size: 13, col: COL.pale }); txt(c, `dial ${m.dial[i]}`, 300, y, { size: 13, col: m.dial[i] === m.card[i] ? P.good : COL.ink }); });
      txt(c, `patient ${m.round + 1} / ${m.rounds}`, 16, 140, { size: 11, col: COL.dim }); };
    return m;
  },
});
