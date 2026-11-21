// Galley: deliver trays to sickbay. The cart carries four trays in a mixed order, each labelled for a bed. At each biobed only the tray at the
// front of the cart is in reach: tap E to roll the cart round to the next tray, and hold E to lift the cover and set the tray down once its label
// matches the bed. Setting down a tray for another bed is a fault and the tray goes back on the cart.
import { define, machine, room, shuffle } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Deliver trays to sickbay', type: 'task:medical_relief' },
  title: 'Match tray label to bed', dept: 'services', host: 'room', siteName: 'Biobed', verb: 'Deliver',
  how: 'Each bed shows its number and the label on the tray at the front of the cart. Tap E to cycle the cart to the next tray; hold E to set the tray down when the numbers match.',
  keys: ['E tap: cycle the cart', 'E hold: set the tray down'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'cycle the cart', input: 'e-tap+e-hold', win: 'four trays each cycled to the front of the cart until its label matches the bed number and set down there',
    fail: 'setting a tray down at a bed whose number does not match its label',
    rule: 'The panel shows bed number against the front tray label. Different: tap E to bring the next tray round. Same: hold E to put it down. Putting a wrong tray down is a fault.' },
  rush: 'Left the trays on the first free tables and read out the beds.',
  captions: { 'wrong bed': 'tray clatter' },
  says: { 'wrong bed': 'That tray is labelled for a different bed. Put it back and find the right one.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [1, 2, 3, 4].map(k => ({ name: `Biobed ${k}`, prop: 'biobed' }))), r = m.rnd;
    m.beds = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 4); m.cart = shuffle(r, m.beds.slice()); m.hd = 0; m.lock = -1; m.n = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { m.hd = 0; return; } const i = m.next;
      if (inp.hold && m.lock !== i) { m.hd += dt; if (m.hd >= 0.5) { m.hd = 0; m.lock = i; if (m.cart[0] === m.beds[i]) { m.cart.shift(); m.finish(i); } else m.fault('wrong bed'); return; } }
      if (rel) { const tap = m.hd > 0 && m.hd < 0.3 && m.lock !== i; m.hd = 0; if (!inp.hold) m.lock = -1; if (tap) m.cart.push(m.cart.shift()); }
      s.prog = s.done ? 1 : m.cart[0] === m.beds[i] ? 0.6 : 0.2;
    };
    m.hint = (f = 0) => { const i = m.next; return i < 0 ? { at: -1 } : { at: i, hold: m.cart[0] === m.beds[i] ? true : f % 6 < 3 }; };
    m.bad = (f = 0) => { const i = Math.max(0, m.next); return { at: i, hold: m.cart[0] === m.beds[i] ? f % 6 < 3 : f % 25 < 20 }; };
    m.view = () => ({ beds: m.beds.slice(), cart: m.cart.slice() });
    m.panel = (i) => (m.sites[i] ? { label: `Bed ${m.beds[i]} / front tray ${m.cart[0] ?? '-'}`, value: m.cart[0] === m.beds[i] ? 'MATCH' : 'wrong label', bar: m.cart[0] === m.beds[i] ? 1 : 0.3 } : null);
    m.prompt = (i) => (m.cart[0] === m.beds[i] ? 'Labels match: hold [E] to set the tray down' : 'Wrong tray at the front: tap [E] to cycle the cart');
    return m;
  },
});
