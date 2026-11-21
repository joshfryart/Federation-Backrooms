// Cargo: stage sensor drones and sample cases at the shuttlebay. Open each case and look at its tube slots: a tube that rattles needs a foam shim
// (press its slot digit); a snug tube must be left alone. Turn the case so its label faces the door (Space), then stage it (Enter).
import { define, machine, DIG, SPACE, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Stage sensor drones and sample cases at the shuttlebay', type: 'task:survey' },
  title: 'Shim the rattle, label out', dept: 'services', host: 'console', tool: 'Drone case with foam inserts',
  how: 'Press the digit of every tube slot that rattles to shim it; leave snug ones. If the label faces in, press Space to turn the case. Then press Enter to stage it.',
  keys: ['1-4 shim that tube slot', 'Space turn the case', 'Enter stage the case'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'shim and stage', input: 'digits+space+enter',
    win: 'three cases staged with every rattling tube shimmed, no snug tube shimmed, and the label facing the door',
    fail: 'staging a case with a rattling tube (cracked sample), shimming a snug tube, or staging with the label inward',
    rule: 'Tube slots shake when loose. Press the slot digit to shim a loose one only. Space turns the case if the label faces in. Enter stages the case; it fails if any tube still rattles or the label faces in.' },
  rush: 'Stacked the cases by the door without checking the foam.',
  captions: { 'cracked tube': 'glass cracks', overpacked: 'foam squeaks', 'label inward': 'label alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.cases = [0, 1, 2].map(() => { const loose = shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, m.calm ? 1 : 2)); return { loose: [0, 1, 2, 3].map(k => loose.includes(k)), shim: [false, false, false, false], out: r() < 0.5 }; });
    m.i = 0; m.rounds = 3; m.round = 0;
    const open = (c) => c.loose.findIndex((l, k) => l && !c.shim[k]);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const c = m.cases[m.i]; if (!c) return false; const d = DIG(code);
      if (d >= 1 && d <= 4) { if (!c.loose[d - 1]) m.fault('overpacked'); else c.shim[d - 1] = true; return true; }
      if (SPACE(code)) { c.out = !c.out; return true; }
      if (ENTER(code)) { if (open(c) >= 0) m.fault('cracked tube'); else if (!c.out) m.fault('label inward'); else { m.i++; m.round = m.i; if (m.i >= 3) m.win(); } return true; }
      return false;
    };
    m.hint = () => { const c = m.cases[m.i]; if (!c) return []; const k = open(c); return k >= 0 ? [['Digit' + (k + 1), true]] : !c.out ? [['Space', true]] : [['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ cases: m.cases.map(c => [c.loose.map(Number), c.out]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Space', 'Turn'], ['Enter', 'Stage']];
    m.draw = (c, W, H, P) => {
      const k = m.cases[Math.min(m.i, 2)]; txt(c, `CASE ${Math.min(3, m.i + 1)} OF 3`, 12, 18, { size: 11, col: COL.peri });
      for (let s = 0; s < 4; s++) { const x = 30 + s * 90, shake = k.loose[s] && !k.shim[s] ? Math.sin(m.t * 40 + s) * 3 : 0; box(c, x, 36, 60, 70, 'rgba(255,255,255,.05)', k.shim[s] ? P.good : COL.dim, 6);
        box(c, x + 18 + shake, 46, 24, 50, 'rgba(244,194,91,.35)', COL.gold, 8); txt(c, String(s + 1), x + 30, 124, { size: 13, align: 'center' }); if (k.loose[s] && !k.shim[s]) txt(c, 'rattle', x + 30, 112, { size: 9, align: 'center', col: P.bad }); if (k.shim[s]) txt(c, 'shim', x + 30, 112, { size: 9, align: 'center', col: P.good }); }
      txt(c, k.out ? 'label faces DOOR' : 'label faces IN: turn it', W / 2, H - 8, { size: 12, align: 'center', col: k.out ? P.good : P.bad });
    };
    return m;
  },
});
