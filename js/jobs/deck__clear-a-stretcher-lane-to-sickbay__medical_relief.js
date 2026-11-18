// Deck crew: clear a stretcher lane to sickbay. The lane plan lists what is near the stretcher route: how far each thing sticks into the lane
// from the port or starboard wall, and any cable at knee height. Carry an item clear by holding its number for as long as it takes to carry
// (heavy things take longer). The lane is ready when the gap between the worst intrusions on each side fits the stretcher and no trip cable
// is left. Letting go mid-carry drops it back in the lane; hauling something that was never in the lane wastes the carry.
import { define, machine, DIG, rf, ri, shuffle, pick, txt, box, bar, COL } from './kit.js';

const NAMES = ['tool crate', 'spare locker', 'fuel hose', 'sled', 'parts bin', 'ladder', 'drum'];
export default define({
  job: { billet: 'deck', label: 'Clear a stretcher lane to sickbay', type: 'task:medical_relief' },
  title: 'Stretcher lane clearance gauge', dept: 'flight', host: 'console', tool: 'Stretcher lane plan',
  how: 'Hold an item’s number to carry it clear; hold until its carry bar fills. Clear only what narrows the lane below stretcher width, plus every knee-height cable.',
  keys: ['1-6 hold: carry that item clear'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'carry clear', input: 'digits', win: 'the lane gap between the worst port and starboard intrusions reaches stretcher width and no knee-height trip is left',
    fail: 'dropping a half-carried item back in the lane, or spending carries on things that were never in the route',
    rule: 'Each item shows its intrusion in cm from its wall. Gap = lane width minus the worst port and starboard intrusion. Hold a digit for the item’s carry time; release early and it drops. Items at 0 cm are not in the way.' },
  rush: 'Kicked the big crates aside and hoped the stretcher fits.',
  captions: { dropped: 'crate thumps down', 'needless carry': 'wasted trip' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, W = 140, need = 80;
    const nm = shuffle(r, NAMES);
    function gap() { const mx = (s) => Math.max(0, ...m.items.filter(x => !x.gone && !x.trip && x.side === s).map(x => x.cm)); return W - mx('P') - mx('S'); }
    m.gap = gap; m.ok = function () { return gap() >= need && !m.items.some(x => x.trip && !x.gone); };
    for (;;) {
      m.items = Array.from({ length: 6 }, (_, k) => ({ name: nm[k], side: pick(r, ['P', 'S']), cm: ri(r, 0, 4) === 0 ? 0 : ri(r, 10, 55), trip: false, carry: rf(r, 0.6, 1.3) * (m.calm ? 0.8 : 1), gone: false }));
      const t = ri(r, 0, 5); m.items[t].trip = true; m.items[t].name = 'power cable'; m.items[t].cm = ri(r, 30, 60); m.items[t].carry = 0.5;
      if (m.items.some(x => x.cm === 0 && !x.trip) && !m.ok()) break;
    }
    m.cur = -1; m.prog = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const n = DIG(code); if (!n || n > 6) return false; const x = m.items[n - 1];
      if (down) { if (m.cur !== n - 1 && !x.gone) { m.cur = n - 1; m.prog = 0; } return true; }
      if (m.cur === n - 1) { if (m.prog < x.carry) m.fault('dropped'); m.cur = -1; m.prog = 0; } return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.cur < 0) return; const x = m.items[m.cur]; m.prog += dt;
      if (m.prog >= x.carry) { x.gone = true; m.ev('carried', { item: x.name }); m.cur = -1; m.prog = 0; if (x.cm === 0) m.fault('needless carry'); if (m.ok() && m.state === 'play') m.win(); }
    };
    m.pickNext = () => { const t = m.items.findIndex(x => x.trip && !x.gone); if (t >= 0) return t; let b = -1; m.items.forEach((x, k) => { if (!x.gone && !x.trip && x.cm > 0 && (b < 0 || x.cm > m.items[b].cm)) b = k; }); return b; };
    m.hint = () => { if (m.cur >= 0) return [['Digit' + (m.cur + 1), true]]; const k = m.pickNext(); return k >= 0 ? [['Digit' + (k + 1), true]] : []; };
    m.bad = () => { const k = m.items.findIndex(x => !x.gone); return k < 0 ? null : ['Digit' + (k + 1), m.cur !== k]; };
    m.view = () => ({ items: m.items.map(x => [x.side, x.cm, x.trip]) });
    m.buttons = () => m.items.map((x, k) => ['Digit' + (k + 1), `${k + 1}`]);
    m.draw = (c, Wc, H, P) => {
      const g = gap(), ok = m.ok(); txt(c, 'STRETCHER LANE', 16, 18, { size: 12, col: COL.gold });
      m.items.forEach((x, k) => { const y = 32 + k * 19, a = x.gone ? COL.dim : x.trip ? COL.warn : COL.ink;
        txt(c, `${k + 1}  ${x.name}`, 16, y + 10, { size: 11, col: a }); txt(c, x.gone ? 'cleared' : x.trip ? '⚠ knee height' : `${x.side === 'P' ? 'port' : 'stbd'} ${x.cm} cm`, 150, y + 10, { size: 11, col: a });
        if (k === m.cur) bar(c, 250, y + 2, 60, 8, m.prog / x.carry, { col: COL.peri }); });
      box(c, 322, 30, 64, 110, 'rgba(255,255,255,.04)', ok ? P.good : P.bad, 4);
      txt(c, 'gap', 354, 50, { size: 10, align: 'center', col: COL.dim }); txt(c, `${g}`, 354, 80, { size: 22, align: 'center', col: g >= need ? P.good : P.bad });
      txt(c, `need ${need}`, 354, 100, { size: 10, align: 'center', col: COL.dim }); txt(c, ok ? 'CLEAR ✓' : 'BLOCKED ✖', 354, 128, { size: 11, align: 'center', col: ok ? P.good : P.bad });
    };
    return m;
  },
});
