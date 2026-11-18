// Chief of security: the status brief to the XO. Five incidents are listed in the order they were logged. Put them in urgency order, most severe at the
// top. Up and down pick a row; left and right swap the picked row with its neighbour. Enter sends the brief. The XO acts on the top line first, so a brief
// sent out of order costs a strike.
import { define, machine, ARROW, ENTER, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Hull breach, deck 6', 'Jammed bulkhead door', 'Unlogged visitor aboard', 'Brig field flicker', 'Armoury cradle short'];
export default define({
  job: { billet: 'cos', label: 'Security status to XO', type: 'loop' },
  title: 'Brief the XO in urgency order', dept: 'security', host: 'console', tool: 'Incident brief board',
  how: 'Put the five incidents in urgency order, most severe at the top, using the arrows: up and down pick a row, left and right swap it with its neighbour. Press Enter to send the brief.',
  keys: ['↑ ↓ pick a row', '← → move the row', 'Enter send brief'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'rank by urgency', input: 'arrows+enter', win: 'all five incidents in urgency order when the brief is sent',
    fail: 'sending the brief with an incident out of urgency order, so the XO reads the wrong top line',
    rule: 'Each incident has a severity from 1 to 5. Arrows pick a row and swap it up or down. Enter sends the brief only when the most severe is on top and the list runs down in order.' },
  rush: 'Read the top two items aloud, sent the brief and let the XO sort out the rest.',
  captions: { 'out of order': 'comm chirps' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.sev = shuffle(r, [1, 2, 3, 4, 5]);
    const want = () => NAMES.map((_, i) => i).sort((a, b) => m.sev[b] - m.sev[a]);
    m.order = shuffle(r, NAMES.map((_, i) => i)); if (m.order.every((v, p) => v === want()[p])) [m.order[0], m.order[1]] = [m.order[1], m.order[0]];
    m.pick = 0;
    const sorted = () => m.order.every((v, p) => v === want()[p]);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U') { m.pick = Math.max(0, m.pick - 1); return true; }
      if (a === 'D') { m.pick = Math.min(NAMES.length - 1, m.pick + 1); return true; }
      if (a === 'L' || a === 'R') {
        const j = a === 'L' ? m.pick - 1 : m.pick + 1; if (j < 0 || j >= NAMES.length) return true;
        [m.order[m.pick], m.order[j]] = [m.order[j], m.order[m.pick]]; m.pick = j; return true;
      }
      if (ENTER(code)) { if (sorted()) m.win(); else m.fault('out of order'); return true; }
      return false;
    };
    m.hint = () => {
      const w = want(), p = w.findIndex((v, q) => m.order[q] !== v);
      if (p < 0) return [['Enter', true]];
      const j = m.order.indexOf(w[p]);
      if (m.pick !== j) return [[j > m.pick ? 'ArrowDown' : 'ArrowUp', true]];
      return [['ArrowLeft', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ sev: m.sev.slice() });
    m.buttons = () => [['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowLeft', '← swap up'], ['ArrowRight', 'swap down →'], ['Enter', 'send brief']];
    m.draw = (c, W, H, P) => {
      m.order.forEach((v, p) => {
        const y = 8 + p * 28, on = p === m.pick;
        box(c, 10, y, 380, 24, on ? 'rgba(244,194,91,.18)' : 'rgba(255,255,255,.05)', on ? COL.gold : null, 6);
        txt(c, `${p + 1}.`, 18, y + 16, { size: 12, col: COL.dim });
        txt(c, NAMES[v], 40, y + 16, { size: 12, col: COL.ink });
        txt(c, `sev ${m.sev[v]}`, 372, y + 16, { size: 11, align: 'right', col: COL.peri });
      });
      txt(c, 'Enter sends the brief once the list is sorted', 200, 166, { size: 10, align: 'center', col: COL.dim });
    };
    return m;
  },
});
