// Galley: prepare extended-hours field rations. The field sheet lists what each meal type needs besides the meal: a mix of heat pad (1),
// spoon (2), label (3) and wet-wipe (4). Drop exactly those into each pack with the digit keys, then press Enter to clip the seal. A missing
// item at sealing, or an item the sheet does not list, is a fault. Four packs.
import { define, machine, DIG, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['heat pad', 'spoon', 'label', 'wet wipe'], MEALS = ['stew', 'noodle', 'oat bar', 'soup', 'rice'];

export default define({
  job: { billet: 'galley', label: 'Prepare extended-hours field rations for science teams', type: 'task:survey' },
  title: 'Kit each pack then clip the seal', dept: 'services', host: 'console', tool: 'Field sheet and ration packs',
  how: 'Read the field sheet line for the pack. Press the digit for each listed item: 1 heat pad, 2 spoon, 3 label, 4 wet wipe. When the pack has all of them press Enter to clip it shut.',
  keys: ['1 heat pad', '2 spoon', '3 label', '4 wet wipe', 'Enter clip the seal'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'kit and clip', input: 'digits+enter', win: 'four ration packs each kitted with exactly the items its field sheet line lists and then clipped sealed',
    fail: 'clipping a pack that is missing a listed item, or adding an item that the field sheet line does not list',
    rule: 'The sheet shows what this meal type needs. Press each needed digit once; do not add others. Enter seals the pack, only when nothing listed is still missing.' },
  rush: 'Stuffed packs from memory and clipped them without checking the sheet.',
  captions: { missing: 'clip snaps open', extra: 'pack rustle' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, meals = shuffle(r, MEALS);
    m.P = [0, 1, 2, 3].map(k => ({ meal: meals[k], need: shuffle(r, [1, 2, 3, 4]).slice(0, ri(r, 2, 3)).sort(), has: [] })); m.i = 0; m.rounds = 4; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const p = m.P[Math.min(3, m.i)], d = DIG(code);
      if (d >= 1 && d <= 4) { if (!p.need.includes(d) || p.has.includes(d)) m.fault('extra'); else p.has.push(d); return true; }
      if (!ENTER(code)) return false; if (p.has.length < p.need.length) { m.fault('missing'); return true; }
      m.i++; m.round++; if (m.i >= 4) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const p = m.P[Math.min(3, m.i)], n = p.need.find(x => !p.has.includes(x)); return [n ? ['Digit' + n, true] : ['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ P: m.P.map(p => [p.meal, p.need]) });
    m.buttons = () => [['Digit1', 'Heat pad'], ['Digit2', 'Spoon'], ['Digit3', 'Label'], ['Digit4', 'Wipe'], ['Enter', 'Clip seal']];
    m.draw = (c, W, H, P) => {
      const p = m.P[Math.min(3, m.i)]; txt(c, `pack ${Math.min(4, m.i + 1)} / 4: ${p.meal}`, 20, 24, { size: 14, col: COL.gold });
      NAMES.forEach((n, k) => { const x = 20 + k * 92, need = p.need.includes(k + 1), has = p.has.includes(k + 1);
        box(c, x, 40, 82, 50, has ? 'rgba(125,200,140,.25)' : 'rgba(255,255,255,.06)', need ? COL.peri : COL.dim, 6);
        txt(c, `${k + 1} ${n}`, x + 41, 62, { size: 12, align: 'center' }); txt(c, has ? 'in pack' : need ? 'LISTED' : 'not listed', x + 41, 80, { size: 11, col: has ? P.good : need ? COL.warn : COL.dim, align: 'center' }); });
      txt(c, 'Enter clips the seal', 20, 118, { size: 12, col: COL.pale });
    };
    return m;
  },
});
