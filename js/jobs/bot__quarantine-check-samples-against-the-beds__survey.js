// Botanist, survey: quarantine-check samples against the beds. Each tube's site code points to a bed on the roster, and that bed has a species
// card. The hand lens only shows one trait at a time (leaf shape, leaf edge, spore shape, colour): step the lens through every trait comparing
// the sample with the card, then call it: all four agree = MATCH, exactly one differs = NEAR, two or more = NO MATCH (red tag, quarantine shelf).
// Calling before every trait was under the lens is a snap call; clearing a no-match is a false clear that lets foreign spores into the beds.
import { define, machine, ARROW, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const TRAITS = [['Leaf shape', ['lanceolate', 'ovate', 'cordate', 'palmate', 'linear']], ['Leaf edge', ['entire', 'serrate', 'lobed', 'crenate']],
  ['Spore shape', ['globose', 'ellipsoid', 'reniform', 'fusiform']], ['Colour', ['deep green', 'blue-green', 'olive', 'red-veined']]];
const BEDS = ['B-1 Tomatillo', 'B-2 Kale', 'B-3 Vulcan mint', 'B-4 Bajoran yam', 'B-5 Chard', 'B-6 Leola root'];
const CALLS = ['MATCH', 'NEAR', 'NO MATCH'];
export default define({
  job: { billet: 'bot', label: 'Quarantine-check samples against the beds', type: 'task:survey' },
  title: 'Trait-by-trait species comparison', dept: 'sciences', host: 'console', tool: 'Hand lens and species card',
  how: 'Step the lens through all four traits with ↑ / ↓ and compare the sample with its bed’s card. ← / → picks MATCH, NEAR (one trait differs) or NO MATCH (two or more); Enter files it.',
  keys: ['↑ / ↓ lens trait', '← / → verdict', 'Enter file'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'compare traits', input: 'arrows+enter', win: 'three tubes graded match, near or no match after every trait was compared under the lens',
    fail: 'clearing a foreign sample as a match or near, or filing a grade before all traits were viewed',
    rule: 'Only one trait shows under the lens. View all four (ticks), count how many differ from the card: none = MATCH, one = NEAR, two or more = NO MATCH. Then Enter.' },
  rush: 'Glanced at the tubes and waved them all through to the beds.',
  captions: { 'false clear': 'quarantine klaxon', 'snap call': 'lens clicks: traits unviewed', 'wrong call': 'roster disagrees' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const kinds = shuffle(r, [0, 1, 2]).map(k => k === 0 ? 2 : k === 1 ? pick(r, [0, 1]) : pick(r, [1, 2]));
    m.tubes = kinds.map(v => { const card = TRAITS.map(([, o]) => pick(r, o)), sample = card.slice(), nd = v === 0 ? 0 : v === 1 ? 1 : ri(r, 2, 3);
      for (const t of shuffle(r, [0, 1, 2, 3]).slice(0, nd)) sample[t] = pick(r, TRAITS[t][1].filter(x => x !== card[t]));
      return { code: `S-${ri(r, 100, 999)}`, bed: pick(r, BEDS), card, sample, ans: v, call: null }; });
    m.k = 0; m.lens = 0; m.seen = [true, false, false, false]; m.sel = 0; m.rounds = 3; m.round = 0;
    const T = () => m.tubes[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), t = T();
      if (a === 'U' || a === 'D') { m.lens = (m.lens + (a === 'D' ? 1 : 3)) % 4; m.seen[m.lens] = true; return true; }
      if (a === 'L' || a === 'R') { m.sel = (m.sel + (a === 'R' ? 1 : 2)) % 3; return true; }
      if (ENTER(code)) {
        if (m.seen.some(x => !x)) { m.fault('snap call'); return true; }
        if (m.sel !== t.ans) { m.fault(t.ans === 2 ? 'false clear' : 'wrong call'); return true; }
        t.call = m.sel; m.k++; m.round++; m.lens = 0; m.seen = [true, false, false, false]; m.sel = 0; if (m.k >= m.tubes.length) m.win(); return true; }
      return false;
    };
    m.hint = () => { const t = T(); if (!t) return []; if (m.seen.some(x => !x)) return [['ArrowDown', true]]; return m.sel !== t.ans ? [['ArrowRight', true]] : [['Enter', true]]; };
    m.bad = () => { const t = T(); if (!t) return null; if (m.seen.some(x => !x)) return 'Enter'; return m.sel === t.ans ? 'ArrowRight' : 'Enter'; };
    m.view = () => ({ tubes: m.tubes.map(t => [t.code, t.bed, t.card, t.sample]) });
    m.buttons = () => [['ArrowUp', 'Lens ▲'], ['ArrowDown', 'Lens ▼'], ['ArrowLeft', '◀ call'], ['ArrowRight', 'call ▶'], ['Enter', 'File']];
    m.draw = (c, W, H, P) => {
      const t = T() || m.tubes[m.tubes.length - 1];
      txt(c, `Tube ${t.code}  →  bed ${t.bed}`, 14, 20, { size: 12, col: COL.gold });
      TRAITS.forEach(([name], i) => { const on = i === m.lens, y = 32 + i * 24; box(c, 14, y, 250, 20, on ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 6);
        txt(c, `${m.seen[i] ? '✓' : '·'} ${name}`, 22, y + 14, { size: 11, col: m.seen[i] ? COL.ink : COL.dim });
        if (on) { const same = t.sample[i] === t.card[i]; txt(c, `${t.sample[i]} | card: ${t.card[i]}`, 120, y + 14, { size: 10, col: same ? P.good : P.bad }); txt(c, same ? '=' : '≠', 256, y + 14, { size: 12, align: 'right', col: same ? P.good : P.bad }); } });
      CALLS.forEach((s, i) => { box(c, 14 + i * 84, 134, 78, 24, i === m.sel ? 'rgba(125,151,232,.3)' : 'rgba(255,255,255,.04)', i === m.sel ? COL.peri : null, 8); txt(c, s, 53 + i * 84, 150, { size: 11, align: 'center' }); });
      m.tubes.forEach((u, i) => txt(c, `${u.code} ${u.call != null ? CALLS[u.call] : i === m.k ? '◀' : ''}`, 282, 40 + i * 18, { size: 10, col: u.call != null ? (u.call === 2 ? P.bad : P.good) : COL.dim }));
      txt(c, 'none differ = MATCH', 282, 110, { size: 9, col: COL.dim }); txt(c, 'one differs = NEAR', 282, 124, { size: 9, col: COL.dim }); txt(c, '2+ differ = NO MATCH', 282, 138, { size: 9, col: COL.dim });
    };
    return m;
  },
});
