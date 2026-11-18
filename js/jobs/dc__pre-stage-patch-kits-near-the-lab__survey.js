// Damage control: pre-stage patch kits near the lab. The carry case has numbered foam slots, each cut for one item and size. Items come off
// the shelf one at a time: press the number of the empty slot that fits it. Sealant tubes carry an expiry stamp: one past today's date goes in
// the reject bin (9). Packing an expired tube, forcing an item into the wrong slot or binning a good item are faults. The case is staged once
// every slot is full.
import { define, machine, DIG, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const SLOTS = [['Plate', 'L'], ['Plate', 'M'], ['Plate', 'S'], ['Clamp', 'M'], ['Clamp', 'S'], ['Tube', '']];
export default define({
  job: { billet: 'dc', label: 'Pre-stage patch kits near the lab', type: 'task:survey' },
  title: 'Foam-slot case packing', dept: 'engineering', host: 'console', tool: 'Patch kit carry case',
  how: 'Press the number of the empty foam slot cut for the item in hand (kind and size). Read each sealant tube\'s stamp: past today\'s date, press 9 for the reject bin.',
  keys: ['1-6 foam slot', '9 reject bin'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'pack by size', input: 'digits', win: 'every foam slot of the case filled with its own kind and size, and no expired sealant tube packed',
    fail: 'leaving an expired sealant tube in the case where it gets grabbed in a hurry, or jamming kit into the wrong slot',
    rule: 'Each foam slot is labelled with a kind and a size. Press the number of the empty slot that matches the item in hand. A tube whose EXP stamp is earlier than today goes to 9, the reject bin.' },
  rush: 'Tipped the shelf into the case and shut the lid.',
  captions: { 'expired packed': 'case latch clicks', 'wrong slot': 'foam squeaks', 'good binned': 'bin clunks' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, today = ri(r, 140, 320);
    m.today = today; m.slots = shuffle(r, SLOTS.concat([['Tube', '']])).map(([k, z]) => ({ k, z, full: false }));
    const items = m.slots.map(s => ({ k: s.k, z: s.z, exp: s.k === 'Tube' ? today + ri(r, 2, 60) : 0 }));
    for (let n = ri(r, 2, 3); n > 0; n--) items.push({ k: 'Tube', z: '', exp: today - ri(r, 1, 25) });
    m.queue = shuffle(r, items); m.qi = 0; m.round = 0; m.rounds = m.slots.length; m.flash = '';
    const cur = () => m.queue[m.qi], expired = (it) => it.k === 'Tube' && it.exp < m.today;
    const fits = (it, s) => s && !s.full && s.k === it.k && s.z === it.z;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (!d) return false; const it = cur(); if (!it) return true;
      if (d === 9) { if (!expired(it)) { m.fault('good binned'); m.flash = 'that tube is in date'; return true; } m.qi++; m.flash = 'rejected'; return true; }
      const s = m.slots[d - 1]; if (!s) return true;
      if (expired(it) && fits(it, s)) { m.fault('expired packed'); m.flash = `EXP ${it.exp} is before today`; m.qi++; return true; }
      if (!fits(it, s)) { m.fault('wrong slot'); m.flash = 'does not fit that slot'; return true; }
      s.full = true; m.qi++; m.round++; m.flash = ''; if (m.slots.every(x => x.full)) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const it = cur(); if (!it) return []; if (expired(it)) return [['Digit9', true]]; const k = m.slots.findIndex(s => fits(it, s)); return [['Digit' + (k + 1), true]]; };
    m.bad = () => { const it = cur(); if (!it) return null; if (expired(it)) { const k = m.slots.findIndex(s => fits(it, s)); return k >= 0 ? 'Digit' + (k + 1) : 'Digit1'; } return 'Digit9'; };
    m.view = () => ({ s: m.slots.map(s => s.k + s.z), q: m.queue.map(i => i.k + i.z + i.exp) });
    m.buttons = () => [...m.slots.map((_, k) => ['Digit' + (k + 1), String(k + 1)]), ['Digit9', '9 bin']];
    m.draw = (c, W, H, P) => {
      txt(c, `Today ${m.today}`, 14, 18, { size: 12, col: COL.pale });
      const it = cur(); if (it) { box(c, 14, 28, 150, 54, COL.panel, COL.gold, 6); txt(c, `${it.k}${it.z ? ' · size ' + it.z : ''}`, 22, 50, { size: 14 });
        if (it.k === 'Tube') txt(c, `EXP ${it.exp}`, 22, 72, { size: 13, col: it.exp < m.today ? P.bad : COL.ink }); }
      m.slots.forEach((s, k) => { const x = 180 + (k % 4) * 54, y = 30 + Math.floor(k / 4) * 54; box(c, x, y, 48, 46, s.full ? 'rgba(79,208,106,.18)' : COL.dark, s.full ? P.good : COL.dim, 6);
        txt(c, String(k + 1), x + 4, y + 13, { size: 10, col: COL.gold }); txt(c, s.k, x + 24, y + 28, { size: 10, align: 'center' }); txt(c, s.full ? '✓' : s.z, x + 24, y + 41, { size: 10, align: 'center', col: COL.dim }); });
      lamp(c, 30, 110, 9, COL.warn, 'triangle'); txt(c, '9 reject bin', 46, 114, { size: 11, col: COL.dim });
      if (m.flash) txt(c, m.flash, 14, 150, { size: 12, col: COL.warn });
    };
    return m;
  },
});
