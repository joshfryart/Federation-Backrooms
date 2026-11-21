// Galley: stage emergency ration packs by the lifeboats. The stage list gives a pack count for each lifeboat bay. Press 1, 2 or 3 to pick the bay,
// Up to carry a stack of ten and Space to carry a single pack, then Enter to tick the bay off once its stack equals the list. Piling past the
// list blocks the hatch path (a fault, nothing is added); ticking a bay whose count is off is a fault.
import { define, machine, DIG, ARROW, SPACE, ENTER, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Stage emergency ration packs by the lifeboats', type: 'task:shakedown' },
  title: 'Tens and ones per lifeboat bay', dept: 'services', host: 'console', tool: 'Stage list and lifeboat bays',
  how: 'Pick a bay with 1, 2 or 3. Up carries ten packs, Space carries one. Build the stack to the number on the stage list, then press Enter to tick the bay off.',
  keys: ['1 2 3 pick the bay', 'Up carry ten', 'Space carry one', 'Enter tick the bay'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'stack tens-ones', input: 'digits+arrows+space+enter', win: 'three lifeboat bays each stacked with exactly the listed number of ration packs in tens and ones, then ticked off the stage list',
    fail: 'piling more packs than the list into a bay and blocking the hatch path, or ticking a bay whose count is not the listed number',
    rule: 'The stage list gives a number per bay. Pick the bay, press Up for ten and Space for one until the stack matches, then Enter. Going over the list blocks the hatch.' },
  rush: 'Dumped packs by the boats in rough piles and ticked the list by eye.',
  captions: { 'blocked hatch': 'crate thump', miscount: 'pen scratch' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.want = [ri(r, 12, 38), ri(r, 12, 38), ri(r, 12, 38)]; m.n = [0, 0, 0]; m.tick_ = [false, false, false]; m.sel = 0; m.rounds = 3; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code), s = m.sel;
      if (d >= 1 && d <= 3) { m.sel = d - 1; return true; } if (m.tick_[s] && !ENTER(code)) return a === 'U' || SPACE(code);
      if (a === 'U' || SPACE(code)) { const add = a === 'U' ? 10 : 1; if (m.n[s] + add > m.want[s]) m.fault('blocked hatch'); else m.n[s] += add; return true; }
      if (!ENTER(code) || m.tick_[s]) return ENTER(code); if (m.n[s] !== m.want[s]) { m.fault('miscount'); return true; }
      m.tick_[s] = true; m.round++; if (m.round >= 3) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const b = m.tick_.findIndex(x => !x); if (b < 0) return []; if (m.sel !== b) return [['Digit' + (b + 1), true]]; const left = m.want[b] - m.n[b]; return [left >= 10 ? ['ArrowUp', true] : left > 0 ? ['Space', true] : ['Enter', true]]; };
    m.bad = () => (m.tick_[m.sel] ? 'Digit' + (m.tick_.findIndex(x => !x) + 1) : 'Enter');
    m.view = () => ({ want: m.want.slice() });
    m.buttons = () => [['Digit1', 'Bay 1'], ['Digit2', 'Bay 2'], ['Digit3', 'Bay 3'], ['ArrowUp', '+10'], ['Space', '+1'], ['Enter', 'Tick']];
    m.draw = (c, W, H, P) => {
      m.want.forEach((w, k) => { const x = 20 + k * 124, on = k === m.sel; box(c, x, 14, 112, 108, on ? 'rgba(125,151,232,.2)' : 'rgba(255,255,255,.05)', on ? COL.peri : null, 6);
        txt(c, `BAY ${k + 1}`, x + 56, 34, { size: 12, col: COL.dim, align: 'center' }); txt(c, `list ${w}`, x + 56, 58, { size: 15, col: COL.pale, align: 'center' });
        txt(c, m.n[k], x + 56, 96, { size: 28, col: m.tick_[k] ? P.good : COL.ink, align: 'center' }); if (m.tick_[k]) txt(c, 'ticked', x + 56, 114, { size: 11, col: P.good, align: 'center' }); });
    };
    return m;
  },
});
