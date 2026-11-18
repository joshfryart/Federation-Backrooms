// Second officer: walk the decks. At each department the senior person on shift answers what you ask. A general question gets a general
// answer; "what is failing?" may be dodged once and has to be pressed; "since when?" only makes sense once you have the item. Write the line
// in the bulkhead log only when it holds both the item and the time: logging a vague answer, or asking "since when" first, is a fault.
import { define, machine, DIG, SPACE, shuffle, ri, pick, txt, box, COL, wrapText } from './kit.js';

const DECK = [['Engineering', 'Chief Okafor', ['coolant pump two', 'injector three']], ['Sickbay', 'Nurse Halvorsen', ['dermal regenerator', 'isolation seal']],
  ['Security', 'Lt Brandt', ['brig forcefield emitter', 'armory door reader']], ['Science', 'Ens Tamura', ['spectrometer lamp', 'sample freezer']],
  ['Operations', 'Lt Varga', ['relay six', 'pattern buffer']], ['Galley', 'Cook Abara', ['replicator two', 'cold store door seal']]];
const VAGUE = ['"Oh, the usual, nothing to worry about."', '"Fine, all fine. Busy shift."', '"Bits and pieces, you know how it is."'];
const DODGE = ['"Nothing major, honestly."', '"Couple of niggles, we are on it."'];

export default define({
  job: { billet: 'so', label: 'Walk the decks', type: 'loop' },
  title: 'Deck walk: press for the specific', dept: 'command', host: 'console', tool: 'Corridor log book and comm badge',
  how: 'At each deck ask the senior person the right questions until you have the failing item and when it started, then write it in the bulkhead log.',
  keys: ['1 general', '2 what is failing?', '3 since when?', 'Space write in log'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'press for specifics', input: 'digits+space', win: 'four decks walked with each log line holding the exact failing item and the hour it began',
    fail: 'writing a vague or half answer in the log, or asking since when before the item is named',
    rule: '2 asks what is failing (ask again if dodged), 3 asks since when once the item is named, Space writes the line; 1 only gets small talk.' },
  rush: 'Asked "all well?" at each door and wrote "nil to report" four times.',
  captions: { 'vague entry': 'log page rustles', 'leading question': 'awkward pause' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, talk = m.calm ? 1.0 : 0.7;
    m.decks = shuffle(r, DECK).slice(0, 4).map(([d, who, items]) => ({ d, who, item: pick(r, items), since: `${ri(r, 1, 11)}${pick(r, ['00', '15', '30', '45'])}`.padStart(4, '0'), dodges: r() < 0.5 ? 1 : 0, gotItem: false, gotTime: false, line: 'Waiting for you to ask.', busy: 0 }));
    m.rounds = 4; m.round = 0;
    const D = () => m.decks[m.round];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), x = D(); if (!x) return false;
      if (d >= 1 && d <= 3) {
        if (m.t < x.busy) return true; x.busy = m.t + talk;
        if (d === 1) x.line = pick(r, VAGUE);
        else if (d === 2) { if (x.dodges > 0) { x.dodges--; x.line = pick(r, DODGE); } else { x.gotItem = true; x.line = `"It is the ${x.item}. It keeps faulting."`; } }
        else { if (!x.gotItem) { m.fault('leading question'); x.line = '"Since when… what, exactly?"'; } else { x.gotTime = true; x.line = `"The ${x.item} started at ${x.since} this watch."`; } }
        m.ev('ask', { q: d }); return true;
      }
      if (SPACE(code)) {
        if (m.t < x.busy) return true;
        if (!x.gotItem || !x.gotTime) { m.fault('vague entry'); x.busy = m.t + talk; x.line = 'The log line reads like a shrug. Ask again.'; return true; }
        m.round++; if (m.round >= 4) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const x = D(); if (!x || m.t < x.busy) return []; return [[!x.gotItem ? 'Digit2' : !x.gotTime ? 'Digit3' : 'Space', true]]; };
    m.bad = () => { const x = D(); return x && m.t >= x.busy ? (x.gotItem ? 'Space' : 'Digit3') : null; };
    m.view = () => ({ d: m.decks.map(x => [x.d, x.item, x.since, x.dodges]) });
    m.buttons = () => [['Digit1', '1 General'], ['Digit2', '2 Failing?'], ['Digit3', '3 Since?'], ['Space', 'Write log']];
    m.draw = (c, W, H, P) => {
      const x = D(); m.decks.forEach((y, i) => { box(c, 8 + i * 98, 6, 92, 20, i === m.round ? 'rgba(240,147,58,.25)' : 'rgba(255,255,255,.04)', i === m.round ? COL.orange : null, 8); txt(c, (i < m.round ? '✓ ' : '') + y.d, 54 + i * 98, 20, { size: 10, align: 'center', col: i < m.round ? P.good : COL.pale }); });
      if (!x) return; txt(c, `${x.who}, ${x.d}`, 12, 46, { size: 12, col: COL.gold });
      wrapText(m.t < x.busy ? '…' : x.line, 58).slice(0, 2).forEach((s, i) => txt(c, s, 12, 66 + i * 16, { size: 11 }));
      box(c, 8, 104, W - 16, 58, 'rgba(255,255,255,.05)', COL.peri, 8); txt(c, 'BULKHEAD LOG — this deck', 16, 120, { size: 10, col: COL.peri });
      txt(c, `item: ${x.gotItem ? x.item : '— not named —'}`, 16, 138, { size: 11, col: x.gotItem ? COL.ink : COL.dim }); txt(c, `since: ${x.gotTime ? x.since : '— not asked —'}`, 16, 154, { size: 11, col: x.gotTime ? COL.ink : COL.dim });
    };
    return m;
  },
});
