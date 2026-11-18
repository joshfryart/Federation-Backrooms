// Comms officer: review the computer specialist queue. Tickets come off the fault queue one at a time. A NEW ticket names a system tag:
// hand it to the specialist (digit) whose tag matches AND who is on shift. A FINISHED ticket carries the specialist's fix note: stamp it
// (Space) only if the note names a cause; send it back for rework (↓) if it just says restarted or is empty.
import { define, machine, DIG, ARROW, SPACE, shuffle, pick, ri, txt, box, lamp, COL, wrapText } from './kit.js';

const TAGS = ['NET', 'STACK', 'ARRAY', 'STORE'];
const ERR = { NET: 'Packet loss on segment 4 to deck 7 relay', STACK: 'Library computer stack overflow in query 9', ARRAY: 'Sensor array buffer stalls at 80 %', STORE: 'Archive write fails checksum on block 12' };
const GOOD = { NET: 'Cause: corroded jack on seg 4 patch, replaced lead', STACK: 'Cause: runaway recursion in query 9, depth cap added', ARRAY: 'Cause: buffer timer drift, re-synced to ship clock', STORE: 'Cause: bad sector on block 12, remapped' };
const VAGUE = ['Restarted, works now', '', 'Fixed', 'Rebooted the node', 'Cleared it'];
const NAMES = ['Ens. Parr', 'Lt. Okoye', 'PO Vasquez', 'Ens. T\'Rell', 'Lt. Haddad', 'CPO Lund'];

export default define({
  job: { billet: 'comms', label: 'Review the computer specialist queue', type: 'loop' },
  title: 'Fault ticket dispatch and sign-off', dept: 'operations', host: 'console', tool: 'Ticket terminal and specialist roster',
  how: 'Give each new ticket to an on-shift specialist with the matching tag, and on finished tickets stamp only fix notes that name a cause; send the rest back.',
  keys: ['1-4 assign', 'Space stamp sign-off', '↓ send back'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'dispatch and vet', input: 'digits+space+arrows', win: 'new tickets given to a free tag-matched specialist and only cause-naming fix notes stamped',
    fail: 'giving a ticket to the wrong or off-shift specialist, stamping a vague fix note, or bouncing a good one',
    rule: 'NEW ticket: press the digit of the on-shift specialist with its tag. DONE ticket: Space stamps a note that says Cause:, ↓ sends back a note that only says restarted.' },
  rush: 'Stamped the whole done pile and let the specialists pick their own tickets.',
  captions: { 'wrong specialist': 'terminal error chirp', 'vague sign-off': 'stamp thud', 'needless rework': 'ticket bounces back' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = shuffle(r, NAMES), tags = shuffle(r, TAGS), off = ri(r, 0, 3);
    m.roster = [0, 1, 2, 3].map(i => ({ n: names[i], tag: tags[i], on: i !== off }));
    m.roster.push({ n: names[4], tag: tags[off], on: true }); m.roster = shuffle(r, m.roster).slice(0, 5);
    const live = m.roster.filter(s => s.on).map(s => s.tag);
    const kinds = shuffle(r, ['new', 'new', 'new', 'done', 'done', r() < 0.5 ? 'new' : 'done']);
    m.tix = kinds.map((k, i) => { const tag = pick(r, live), vague = k === 'done' && (i % 2 === 0 || r() < 0.4); return { k, tag, num: 4100 + ri(r, 0, 899), note: k === 'done' ? (vague ? pick(r, VAGUE) : GOOD[tag]) : '', vague, by: pick(r, m.roster).n }; });
    if (!m.tix.some(x => x.vague)) { const x = m.tix.find(y => y.k === 'done'); x.vague = true; x.note = VAGUE[0]; }
    m.i = 0; m.open = 0; m.rounds = m.tix.length; m.round = 0; const read = m.calm ? 1.2 : 0.9;
    const next = () => { m.i++; m.round = m.i; m.open = m.t; if (m.i >= m.tix.length) m.win(); };
    const T = () => m.tix[m.i];
    m.key = (code, down = true) => {
      const d = DIG(code), a = ARROW(code); if (m.state !== 'play' || !down || !(d || SPACE(code) || a === 'D')) return false;
      if (m.t - m.open < read) return true; const x = T();
      if (x.k === 'new' && d >= 1 && d <= m.roster.length) { const s = m.roster[d - 1]; if (s.tag !== x.tag || !s.on) { m.fault('wrong specialist'); return true; } next(); return true; }
      if (x.k === 'done' && SPACE(code)) { if (x.vague) m.fault('vague sign-off'); next(); return true; }
      if (x.k === 'done' && a === 'D') { if (!x.vague) m.fault('needless rework'); next(); return true; }
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const x = T(); if (!x || m.t - m.open < read) return []; if (x.k === 'done') return [[x.vague ? 'ArrowDown' : 'Space', true]]; const j = m.roster.findIndex(s => s.on && s.tag === x.tag); return [['Digit' + (j + 1), true]]; };
    m.bad = () => { const x = T(); if (!x) return null; if (x.k === 'done') return x.vague ? 'Space' : 'ArrowDown'; const j = m.roster.findIndex(s => !s.on || s.tag !== x.tag); return 'Digit' + (j + 1); };
    m.view = () => ({ r: m.roster.map(s => s.n + s.tag + s.on), t: m.tix.map(x => [x.k, x.tag, x.note]) });
    m.buttons = () => [...m.roster.map((s, i) => ['Digit' + (i + 1), String(i + 1)]), ['Space', 'Stamp'], ['ArrowDown', '▼ Rework']];
    m.draw = (c, W, H, P) => {
      m.roster.forEach((s, i) => { const y = 10 + i * 24; box(c, 6, y, 130, 20, 'rgba(255,255,255,.05)', null, 8); txt(c, `${i + 1} ${s.n}`, 12, y + 14, { size: 10, col: s.on ? COL.ink : COL.dim });
        txt(c, s.tag, 104, y + 14, { size: 9, col: COL.gold }); lamp(c, 128, y + 10, 5, s.on ? P.good : P.bad, s.on ? 'circle' : 'square'); });
      txt(c, 'on shift ● · off ■', 10, 140, { size: 9, col: COL.dim });
      const x = T(); if (!x) return; box(c, 146, 10, 246, 120, 'rgba(255,255,255,.05)', x.k === 'new' ? COL.peri : COL.lav, 8);
      txt(c, `#${x.num} · ${x.k === 'new' ? 'NEW' : 'DONE by ' + x.by}`, 154, 28, { size: 11, col: COL.gold }); txt(c, `tag ${x.tag}`, 384, 28, { size: 11, col: COL.pale, align: 'right' });
      if (m.t - m.open < read) { txt(c, 'opening…', 154, 60, { size: 11, col: COL.dim }); return; }
      wrapText(ERR[x.tag], 40).forEach((l, k) => txt(c, l, 154, 50 + k * 14, { size: 10 }));
      if (x.k === 'done') { txt(c, 'Fix note:', 154, 90, { size: 10, col: COL.dim }); wrapText(x.note ? `"${x.note}"` : '(blank)', 40).forEach((l, k) => txt(c, l, 154, 105 + k * 13, { size: 10, col: COL.pale })); }
      txt(c, `ticket ${m.i + 1} / ${m.tix.length}`, 268, 150, { size: 10, col: COL.dim, align: 'center' });
    };
    return m;
  },
});
