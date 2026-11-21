// Quartermaster: stage rations. The dispenser cycles through bars; each tech's allergen card forbids two things. Tap E when the bar showing
// carries neither allergen to drop it in that tech's bag. Tapping on a flagged bar is a fault.
import { define, machine, room, shuffle, pick, clamp } from './kit.js';
const AL = ['nuts', 'dairy', 'gluten', 'soy', 'egg'], BARS = ['Oat bar', 'Trail bar', 'Cheese bar', 'Soy bar', 'Egg bar', 'Seed bar'];

export default define({
  job: { billet: 'qm', label: 'Stage extra rations for long lab shifts', type: 'task:survey' },
  title: 'Stop the dispenser on a safe bar', dept: 'services', host: 'room', siteName: 'Shift bag', verb: 'Pack',
  how: 'Each bag\'s allergen card names two allergens. The dispenser shows one bar at a time with its allergens. Tap E on a bar that has neither of them.',
  keys: ['E tap: drop the bar in the bag'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'catch safe bar', input: 'e-tap', win: 'three shift bags each filled with a bar carrying none of that tech\'s two allergens',
    fail: 'dropping a bar that carries one of the tech\'s allergens into the bag',
    rule: 'The dispenser cycles bars and shows each one\'s allergens. Compare with the bag\'s card and tap E only while a bar with neither allergen is showing.' },
  rush: 'Packed the first bar that came out for every tech and sealed the bags.',
  captions: { allergen: 'allergen flag on bag' }, says: { allergen: 'That bar carries a flagged allergen for this tech.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [0, 1, 2].map(i => ({ name: `Tech ${i + 1} bag`, prop: i === 1 ? 'locker' : 'shelving' }))), r = m.rnd, slot = m.calm ? 1.0 : 0.75;
    m.bars = BARS.map((n, i) => ({ n, al: shuffle(r, AL).slice(0, i % 2 ? 2 : 1) })); m.card = [0, 1, 2].map(() => shuffle(r, AL).slice(0, 2)); m.c = [0, 0, 0]; m.ord = shuffle(r, [0, 1, 2, 3, 4, 5]);
    const show = (i) => m.bars[m.ord[Math.floor(m.c[i] / slot) % 6]], safe = (i) => !show(i).al.some(a => m.card[i].includes(a));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next; m.c[i] += dt;
      if (inp.press) { if (safe(i)) m.finish(i); else m.fault('allergen'); }
      s.prog = s.done ? 1 : 0;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, press: safe(i) && (m.c[i] / slot) % 1 < 0.6 }; };
    m.bad = () => { const i = m.next; return { at: i, press: !safe(i) }; };
    m.view = () => ({ card: m.card, bars: m.bars.map(b => [b.n, b.al]), ord: m.ord });
    m.panel = (i) => { const b = show(i); return { label: `Card: no ${m.card[i].join(', ')}`, value: `${b.n} (${b.al.join(', ')})`, bar: clamp((m.c[i] / slot) % 1) }; };
    m.prompt = () => 'Tap [E] when the bar showing is free of both flagged allergens';
    return m;
  },
});
