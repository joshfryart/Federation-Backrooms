// Quartermaster: log consumed survey stock. For each returned slip the ledger line starts at the slip's claimed quantity. The truth is the
// issue record minus the unused packs back in the bin: adjust with Up/Down and press Enter to commit the line.
import { define, machine, ARROW, ENTER, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Log consumed survey stock', type: 'task:survey' },
  title: 'Balance the ledger line to the record', dept: 'services', host: 'console', tool: 'Ledger form',
  how: 'Each line shows the slip\'s claim, the issue record and the unused packs returned. The true quantity is issued minus unused: nudge the entry with Up/Down and press Enter.',
  keys: ['Up/Down adjust entry', 'Enter commit line'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'balance the line', input: 'arrows+enter', win: 'three ledger lines each committed at the issued-minus-returned quantity, not the slip claim',
    fail: 'committing a line at the slip\'s claimed figure or any other quantity that does not balance with the issue record',
    rule: 'Quantity used = issued on the record minus unused packs in the returns bin. Start from the slip\'s figure, move it with Up/Down to that number, then Enter.' },
  rush: 'Typed the quantities straight off the slips and filed the lot.',
  captions: { 'out of balance': 'ledger drift flagged' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.L = [0, 1, 2].map(i => { const iss = ri(r, 6, 14), unused = ri(r, 1, 4), tru = iss - unused, claim = i === 0 || r() < 0.5 ? tru + (r() < 0.5 ? -ri(r, 1, 2) : ri(r, 1, 2)) : tru; return { iss, unused, tru, claim, v: claim, batch: 'B' + ri(r, 100, 999) }; });
    m.k = 0; m.round = 0; m.rounds = 3;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const l = m.L[m.k]; if (!l) return true; const a = ARROW(code);
      if (a === 'U') l.v = Math.min(30, l.v + 1); else if (a === 'D') l.v = Math.max(0, l.v - 1);
      else if (ENTER(code)) { if (l.v !== l.tru) { m.fault('out of balance'); l.v = l.claim; } else { m.k++; m.round = m.k; if (m.k >= 3) m.win(); } } else return false; return true;
    };
    m.hint = () => { const l = m.L[m.k]; if (!l) return []; return l.v === l.tru ? [['Enter', true]] : [[l.v < l.tru ? 'ArrowUp' : 'ArrowDown', true]]; };
    m.bad = () => { const l = m.L[m.k]; if (!l) return null; return l.v === l.tru ? [l.tru > 1 ? 'ArrowDown' : 'ArrowUp', true] : ['Enter', true]; };
    m.view = () => ({ L: m.L.map(l => [l.batch, l.iss, l.unused, l.claim]) });
    m.buttons = () => [['ArrowUp', '+'], ['ArrowDown', '-'], ['Enter', 'Commit']];
    m.draw = (c, W, H, P) => {
      const l = m.L[Math.min(m.k, 2)]; txt(c, `Line ${m.k + 1}/3   batch ${l.batch}`, 10, 18, { size: 13, col: COL.pale });
      txt(c, `slip says used ${l.claim}`, 10, 52, { size: 13 }); txt(c, `issue record: ${l.iss} issued`, 10, 76, { size: 13 }); txt(c, `returns bin: ${l.unused} unused packs`, 10, 100, { size: 13 });
      box(c, 250, 36, 130, 80, COL.panel, COL.gold); txt(c, 'ENTRY', 315, 58, { size: 10, align: 'center', col: COL.dim }); txt(c, l.v, 315, 100, { size: 32, align: 'center', col: COL.gold });
      txt(c, 'used = issued - unused', 10, 150, { size: 11, col: COL.dim });
    };
    return m;
  },
});
