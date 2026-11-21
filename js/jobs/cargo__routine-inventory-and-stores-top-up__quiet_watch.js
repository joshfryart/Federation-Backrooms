// Cargo: routine inventory and stores top-up. The console list says every bin is full, but the hand count tells the truth: sealed packs
// (six each) plus loose items. Set the true count with Up/Down, file it (Enter). A bin under its minimum is then topped up (Space).
import { define, machine, ARROW, ENTER, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

const BINS = ['Ration bars', 'Tea leaf', 'Dressings', 'Cutlery packs', 'Filter cloth'];
export default define({
  job: { billet: 'cargo', label: 'Routine inventory and stores top-up', type: 'task:quiet_watch' },
  title: 'True count then top-up', dept: 'services', host: 'console', tool: 'Inventory console and hand counter',
  how: 'Work out the true count for the bin (packs times six plus loose) and set it with Up/Down; Enter files it. If it is under the minimum, press Space to top up from reserve.',
  keys: ['Up/Down set the count', 'Enter file count', 'Space top up'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'count then refill', input: 'arrows+enter+space',
    win: 'every bin filed with its true hand count and every bin under its minimum topped up from reserve',
    fail: 'filing a count that is wrong, or topping up a bin that is already at its minimum, or leaving a short bin',
    rule: 'The counter shows sealed packs of six and loose items per bin. Set the total with Up/Down and press Enter. If the total is below the bin minimum press Space to top up; otherwise do not.' },
  rush: 'Ticked the console list as full without counting the shelves.',
  captions: { 'wrong count': 'count rejected', 'bad top-up': 'reserve mismatch', 'short left': 'bin short alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = m.calm ? 3 : 4;
    m.bins = shuffle(r, BINS).slice(0, n).map(name => { const packs = ri(r, 1, 4), loose = ri(r, 0, 5), min = ri(r, 8, 22); return { name, packs, loose, min, tot: packs * 6 + loose }; });
    m.i = 0; m.set = 5; m.filed = false; m.rounds = n; m.round = 0;
    const next = () => { m.i++; m.round = m.i; m.set = 5; m.filed = false; if (m.i >= n) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const b = m.bins[m.i], a = ARROW(code); if (!b) return false;
      if (!m.filed && (a === 'U' || a === 'D')) { m.set = Math.max(0, Math.min(40, m.set + (a === 'U' ? 1 : -1))); return true; }
      if (ENTER(code) && !m.filed) { if (m.set !== b.tot) { m.fault('wrong count'); return true; } m.filed = true; if (b.tot >= b.min) next(); return true; }
      if (SPACE(code) && m.filed) { next(); return true; } if (SPACE(code)) { m.fault('bad top-up'); return true; } return false;
    };
    m.hint = () => { const b = m.bins[m.i]; if (!b) return []; if (m.filed) return [['Space', true]]; return m.set < b.tot ? [['ArrowUp', true]] : m.set > b.tot ? [['ArrowDown', true]] : [['Enter', true]]; };
    m.bad = () => m.filed ? 'Space' : 'Enter';
    m.view = () => ({ bins: m.bins.map(b => [b.name, b.packs, b.loose, b.min]) });
    m.buttons = () => [['ArrowUp', '+'], ['ArrowDown', '-'], ['Enter', 'File'], ['Space', 'Top up']];
    m.draw = (c, W, H, P) => {
      const b = m.bins[Math.min(m.i, m.bins.length - 1)]; txt(c, `BIN ${m.i + 1} OF ${m.bins.length}: ${b.name}`, 12, 18, { size: 12, col: COL.peri }); txt(c, 'console list: FULL', W - 12, 18, { size: 11, col: COL.dim, align: 'right' });
      for (let k = 0; k < b.packs; k++) box(c, 14 + k * 34, 34, 28, 22, 'rgba(244,194,91,.2)', COL.gold, 3);
      for (let k = 0; k < b.loose; k++) { c.fillStyle = COL.pale; c.beginPath(); c.arc(20 + k * 14, 76, 5, 0, 6.283); c.fill(); }
      txt(c, `sealed packs of 6: ${b.packs}    loose: ${b.loose}    minimum ${b.min}`, 12, 104, { size: 11, col: COL.dim });
      box(c, 12, 116, 150, 36, 'rgba(255,255,255,.06)', m.filed ? P.good : COL.gold, 6); txt(c, `count ${m.set}`, 24, 140, { size: 18 });
      txt(c, m.filed ? (b.tot < b.min ? 'SHORT: Space to top up' : 'filed') : 'Enter to file', 180, 140, { size: 12, col: COL.pale });
    };
    return m;
  },
});
