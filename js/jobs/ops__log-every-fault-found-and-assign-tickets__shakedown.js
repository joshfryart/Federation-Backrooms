// Ops: log every fault found and assign tickets. Each shakedown fault card shows its system and code on the front; the location and any
// URGENT stamp are written on the back. Flip the card (↑) to read them into the ticket, set the priority (Space) if it is stamped urgent, then
// route the ticket to the matching specialist (digit). Routing a card you never flipped files a ticket with no location.
import { define, machine, DIG, ARROW, SPACE, ri, pick, shuffle, txt, box, COL } from './kit.js';

const SPEC = [['EPS', 'Duty engineer'], ['COM', 'Comms technician'], ['CPU', 'Computer technician'], ['TRN', 'Transporter technician']];
const WHERE = ['Deck 3 junction 14', 'Jefferies tube 7-B', 'Pad 2 underfloor', 'Datacore rack 4', 'Deck 5 aft conduit', 'Bridge sub-panel C', 'Cargo bay relay 2'];

export default define({
  job: { billet: 'ops', label: 'Log every fault found and assign tickets', type: 'task:shakedown' },
  title: 'Fault card flip-and-route', dept: 'operations', host: 'console', tool: 'Ready room ticket form',
  how: 'Flip each fault card (↑) to read its location onto the ticket, press Space to raise the priority if the back is stamped URGENT, then route it to the specialist for its system code (1-4).',
  keys: ['↑ flip the card', 'Space urgent priority', '1-4 route to specialist'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'flip and route', input: 'arrows+digits+space', win: 'five fault tickets filed complete with location, the right urgency and the specialist matching the system code',
    fail: 'routing a card without reading its location off the back, to the wrong specialist, or with the wrong priority',
    rule: 'The front shows system code and fault; the back shows where and whether it is URGENT. Press ↑ to flip (the location copies onto the ticket), Space toggles urgent, the digit files it to that specialist.' },
  rush: 'Filed every card to engineering with "somewhere on deck" for the location.',
  captions: { 'no location': 'specialist asks where', 'wrong specialist': 'ticket bounced back', 'wrong priority': 'duty officer queries priority' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 5, sp = shuffle(r, [0, 1, 2, 3]);
    m.order = sp; m.cards = Array.from({ length: n }, () => { const s = ri(r, 0, 3); return { s, code: `${SPEC[s][0]}-${ri(r, 100, 999)}`, where: pick(r, WHERE), urgent: r() < 0.4, flip: false, pri: false }; });
    if (!m.cards.some(c => c.urgent)) m.cards[ri(r, 0, n - 1)].urgent = true;
    m.k = 0; m.last = -9; m.msg = ''; m.done = []; m.rounds = n; m.round = 0;
    const C = () => m.cards[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code); if (!down) return a === 'U' || SPACE(code) || (!!d && d <= 4); const c = C(); if (!c) return false;
      if (a === 'U') { c.flip = true; m.last = m.t; return true; }
      if (SPACE(code)) { c.pri = !c.pri; m.last = m.t; return true; }
      if (d && d <= 4) {
        m.last = m.t; const who = m.order[d - 1];
        if (!c.flip) { m.fault('no location'); m.msg = 'Ticket has no location — flip the card'; return true; }
        if (who !== c.s) { m.fault('wrong specialist'); m.msg = `${SPEC[who][1]} does not handle ${SPEC[c.s][0]}`; return true; }
        if (c.pri !== c.urgent) { m.fault('wrong priority'); m.msg = c.urgent ? 'Card is stamped URGENT' : 'Card is routine'; c.pri = c.urgent; return true; }
        m.done.push(c.code); m.msg = `${c.code} → ${SPEC[who][1]}`; m.k++; m.round++; if (m.k >= n) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.t - m.last < 0.15) return []; const c = C(); if (!c) return []; if (!c.flip) return [['ArrowUp', true]]; if (c.pri !== c.urgent) return [['Space', true]]; return [[`Digit${m.order.indexOf(c.s) + 1}`, true]]; };
    m.bad = () => { if (m.t - m.last < 0.2) return null; return `Digit${m.order.indexOf(C().s) + 1}`; };
    m.view = () => ({ order: m.order, cards: m.cards.map(c => [c.code, c.where, c.urgent]) });
    m.buttons = () => [['ArrowUp', '↑ Flip'], ['Space', 'Urgent'], ...m.order.map((s, i) => [`Digit${i + 1}`, `${i + 1} ${SPEC[s][1].split(' ')[0]}`])];
    m.draw = (c, W, H, P) => {
      const q = C(); if (!q) return; box(c, 10, 8, 170, 92, q.flip ? 'rgba(247,201,162,.1)' : 'rgba(255,255,255,.06)', COL.gold, 8);
      txt(c, `FAULT CARD ${m.k + 1}/${n} · ${q.flip ? 'back' : 'front'}`, 18, 24, { size: 10, col: COL.dim });
      if (!q.flip) { txt(c, q.code, 18, 50, { size: 18, col: COL.gold }); txt(c, 'shakedown test fault', 18, 72, { size: 11, col: COL.pale }); txt(c, '(location on the back)', 18, 90, { size: 10, col: COL.dim }); }
      else { txt(c, q.where, 18, 50, { size: 12 }); if (q.urgent) { box(c, 18, 62, 76, 22, null, P.bad, 4); txt(c, 'URGENT', 56, 78, { size: 12, col: P.bad, align: 'center' }); } else txt(c, 'routine', 18, 78, { size: 11, col: COL.dim }); }
      box(c, 192, 8, 198, 92, 'rgba(255,255,255,.04)', COL.peri, 8); txt(c, 'TICKET FORM', 200, 24, { size: 10, col: COL.dim });
      txt(c, `code: ${q.code}`, 200, 42, { size: 11 }); txt(c, `location: ${q.flip ? q.where : '—'}`, 200, 60, { size: 11, col: q.flip ? COL.ink : COL.warn }); txt(c, `priority: ${q.pri ? 'URGENT' : 'routine'}`, 200, 78, { size: 11, col: q.pri ? COL.warn : COL.dim });
      m.order.forEach((s, i) => txt(c, `${i + 1} ${SPEC[s][1]} (${SPEC[s][0]})`, 14 + (i % 2) * 196, 118 + Math.floor(i / 2) * 15, { size: 10, col: COL.pale }));
      txt(c, m.msg, 14, H - 6, { size: 11, col: COL.pale });
    };
    return m;
  },
});
