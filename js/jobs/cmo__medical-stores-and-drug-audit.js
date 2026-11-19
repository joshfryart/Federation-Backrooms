// CMO: medical stores and drug audit. Tap the vials of each controlled drug out of the locker onto the tray one at a time (Space), in rows
// of ten. Tapping too fast knocks a vial off the tray. When the locker is empty and the tray is short of the ledger, a vial has fallen into
// the cabinet below: search it (↓). Sign the ledger line (Enter) only when the tray count reconciles exactly.
import { define, machine, SPACE, ENTER, ARROW, ri, pick, txt, box, COL } from './kit.js';

const DRUGS = ['Inaprovaline', 'Hyronalin', 'Tri-ox compound', 'Cordrazine', 'Kelotane', 'Polyadrenaline', 'Lectrazine'];
export default define({
  job: { billet: 'cmo', label: 'Medical stores and drug audit', type: 'loop' },
  title: 'Controlled-drug tray tally', dept: 'medical', host: 'console', tool: 'Controlled-drug locker and tray',
  how: 'Tap each vial out of the locker onto the tray (Space) at a steady pace; if the locker empties short of the ledger, search the cabinet below (↓); sign (Enter) when the tray matches the ledger.',
  keys: ['Space tap out a vial', '↓ search below', 'Enter sign the line'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'tally vials', input: 'space+arrows+enter', win: 'three controlled-drug lines tapped out vial by vial and signed with the tray reconciling exactly to the ledger',
    fail: 'signing a line that does not reconcile, tapping so fast a vial rolls off, or searching the cabinet mid-count',
    rule: 'Space moves one vial from locker to tray, no faster than a steady beat. Empty locker but tray short of the ledger: a vial fell, press ↓ to find it. Enter signs only when tray equals ledger.' },
  rush: 'Eyeballed the shelf, wrote the ledger figure in again and locked the cabinet.',
  captions: { discrepancy: 'ledger does not balance', 'knocked a vial': 'vial clinks on the deck', 'searched mid-count': 'drawer scrapes' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = m.calm ? 0.12 : 0.15;
    const names = []; while (names.length < 3) { const n = pick(r, DRUGS); if (!names.includes(n)) names.push(n); }
    m.lines = names.map(name => { const ledger = ri(r, 14, 26), fell = r() < 0.55 ? 1 : 0; return { name, ledger, locker: ledger - fell, below: fell, tray: 0, signed: false }; });
    m.k = 0; m.cool = 0; m.rounds = 3; m.round = 0; m.flash = '';
    const L = () => m.lines[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (!SPACE(code) && !ENTER(code) && a !== 'D') return false; if (!down) return true; const l = L();
      if (SPACE(code)) { if (l.locker <= 0) { m.flash = 'locker is empty'; return true; } if (m.cool > 0) { l.locker--; l.below++; m.fault('knocked a vial'); m.flash = 'a vial rolled off into the cabinet'; return true; } l.locker--; l.tray++; m.cool = gap; m.flash = ''; return true; }
      if (a === 'D') { if (l.locker > 0) { m.fault('searched mid-count'); m.flash = 'finish the count first'; return true; } if (l.below > 0) { l.tray += l.below; l.below = 0; m.flash = 'found it in the cabinet below'; } else m.flash = 'nothing below'; return true; }
      if (l.tray !== l.ledger || l.locker > 0) { m.fault('discrepancy'); m.flash = `tray ${l.tray} ≠ ledger ${l.ledger}`; return true; }
      l.signed = true; m.round++; m.flash = ''; if (++m.k >= 3) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.cool = Math.max(0, m.cool - dt); };
    m.hint = () => { const l = L(); if (!l) return []; if (l.locker > 0) return m.cool <= 0 ? [['Space', true], ['Space', false]] : []; if (l.tray < l.ledger) return [['ArrowDown', true], ['ArrowDown', false]]; return [['Enter', true], ['Enter', false]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ lines: m.lines.map(l => [l.name, l.ledger, l.locker]) });
    m.buttons = () => [['Space', 'Tap out'], ['ArrowDown', 'Search below'], ['Enter', 'Sign']];
    m.draw = (c, W, H, P) => {
      const l = L() || m.lines[2];
      txt(c, `${l.name}`, 16, 22, { size: 14, col: COL.gold }); txt(c, `ledger ${l.ledger}`, 384, 22, { size: 14, align: 'right', col: COL.pale });
      box(c, 16, 34, 110, 90, COL.panel, COL.peri); txt(c, 'LOCKER', 71, 48, { size: 10, align: 'center', col: COL.dim });
      for (let q = 0; q < Math.min(l.locker, 40); q++) { c.fillStyle = COL.lav; c.fillRect(24 + (q % 8) * 12, 56 + Math.floor(q / 8) * 12, 8, 9); }
      txt(c, 'cabinet below ▼', 71, 140, { size: 10, align: 'center', col: COL.dim });
      box(c, 140, 34, 244, 90, COL.panel, COL.gold); txt(c, 'TRAY (rows of ten)', 150, 48, { size: 10, col: COL.dim });
      for (let q = 0; q < l.tray; q++) { const x = 150 + (q % 10) * 22, y = 58 + Math.floor(q / 10) * 18; c.fillStyle = q < l.ledger ? COL.gold : P.bad; c.fillRect(x, y, 14, 12); }
      txt(c, `tray ${l.tray}`, 384, 140, { size: 13, align: 'right', col: l.tray === l.ledger ? P.good : COL.ink });
      txt(c, m.flash, 200, 160, { size: 11, align: 'center', col: COL.warn });
      txt(c, `lines signed ${m.lines.filter(x => x.signed).length} / 3`, 16, 160, { size: 11, col: COL.dim });
    };
    return m;
  },
});
