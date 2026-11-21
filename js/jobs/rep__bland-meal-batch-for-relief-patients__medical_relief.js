// Replicator tech: bland meal batch for relief patients. The order lists the allergens flagged for this batch. Four patterns each name their
// ingredients. Press the digit of every pattern that contains a flagged ingredient to veto it; only when all unsafe ones are vetoed does Space print the one left.
import { define, machine, SPACE, DIG, ri, pick, shuffle, txt, box, COL } from './kit.js';

const ING = ['rice', 'oat', 'banana', 'broth', 'egg', 'milk', 'peanut', 'wheat', 'soy', 'fish', 'potato', 'apple'], ALG = ['egg', 'milk', 'peanut', 'wheat', 'soy', 'fish'], SAFE = ['rice', 'oat', 'banana', 'broth', 'potato', 'apple'];
export default define({
  job: { billet: 'rep', label: 'Bland meal batch for relief patients', type: 'task:medical_relief' },
  title: 'Allergen veto gate', dept: 'services', host: 'console', tool: 'Replicator touch panel',
  how: 'Read the flagged allergens. Press 1-4 to veto each pattern that lists a flagged ingredient. When only the safe pattern remains, press Space to print the batch.',
  keys: ['1-4 veto pattern', 'Space print'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'veto unsafe patterns', input: 'digits+space', win: 'two batches each printed only after every pattern containing a flagged allergen was vetoed',
    fail: 'vetoing the safe pattern or printing while an unsafe pattern is still live',
    rule: 'Each pattern lists ingredients. Digit vetoes that pattern if it holds any flagged allergen. Space prints the surviving pattern once all unsafe ones are gone.' },
  rush: 'Picked the plainest-sounding pattern without reading the allergen tags.',
  captions: { 'safe vetoed': 'panel reject tone', 'unscreened print': 'replicator allergen alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.k = 0; m.rounds = 2; m.round = 0;
    m.batches = [0, 1].map(() => { const flag = shuffle(r, ALG).slice(0, 2), safeIdx = ri(r, 0, 3), pats = [0, 1, 2, 3].map(i => i === safeIdx ? shuffle(r, SAFE).slice(0, 3) : shuffle(r, SAFE).slice(0, 2).concat([pick(r, flag)])).map(a => shuffle(r, a)); return { flag, safeIdx, pats, veto: [false, false, false, false] }; });
    const B = () => m.batches[Math.min(m.k, 1)];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (!SPACE(code) && (d < 1 || d > 4)) return false; if (!down) return true; const b = B();
      if (d) { if (b.veto[d - 1]) return true; if (d - 1 === b.safeIdx) m.fault('safe vetoed'); else b.veto[d - 1] = true; }
      else if (b.veto.filter(Boolean).length < 3) m.fault('unscreened print'); else { m.k++; m.round = m.k; if (m.k >= 2) m.win(); }
      return true;
    };
    m.hint = () => { const b = B(), i = b.veto.findIndex((v, k) => !v && k !== b.safeIdx); return i >= 0 ? [['Digit' + (i + 1), true]] : [['Space', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ batches: m.batches.map(b => [b.flag, b.pats]) });
    m.buttons = () => [['Digit1', 'Veto 1'], ['Digit2', 'Veto 2'], ['Digit3', 'Veto 3'], ['Digit4', 'Veto 4'], ['Space', 'Print']];
    m.draw = (c, W, H, P) => {
      const b = B(); txt(c, `Flagged allergens: ${b.flag.join(', ').toUpperCase()}`, 14, 22, { size: 14, col: P.bad });
      b.pats.forEach((p, i) => { const y = 36 + i * 28; box(c, 14, y, W - 28, 24, b.veto[i] ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.08)', b.veto[i] ? COL.dim : null, 6); txt(c, `${i + 1}  ${p.join(', ')}`, 24, y + 17, { size: 12, col: b.veto[i] ? COL.dim : COL.ink }); if (b.veto[i]) txt(c, 'VETOED', W - 24, y + 17, { size: 11, align: 'right', col: P.bad }); });
    };
    return m;
  },
});
