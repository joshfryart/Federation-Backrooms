// Damage control: repair locker and breather audit. Each tray is pulled forward and its kit comes off one item at a time. Aim left at the tray
// slot and tap E to put a sound item back, or aim right at the inspection bin to pull a breather with a cracked seal. Then the tray must match
// its printed count: aim at the stores cart (straight ahead) and tap E once per missing item. Slotting a cracked breather, binning a sound item
// or drawing more from the cart than the sheet needs are faults.
import { define, machine, room, ri, pick, shuffle } from './kit.js';

const KIT = ['patch plate', 'hose clamp', 'breather', 'sealant tube', 'breather'];
export default define({
  job: { billet: 'dc', label: 'Repair locker and breather audit', type: 'loop' },
  title: 'Locker tray slot-or-bin audit', dept: 'engineering', host: 'room', siteName: 'Tray', verb: 'Audit',
  how: 'Each item comes off the tray in turn: aim left and tap E to slot it, or aim right and tap E to bin a breather with a cracked seal. Then aim ahead at the cart and tap E for each item the sheet is short.',
  keys: ['Aim left: tray slot', 'Aim right: inspection bin', 'Aim ahead: stores cart', 'E tap: place / draw'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'slot or bin', input: 'e-tap+look', win: 'every tray item slotted or binned by its seal, and each tray topped up from the cart to exactly its printed count',
    fail: 'slotting a breather with a cracked seal as a full kit item, binning sound kit, or overdrawing the stores cart',
    rule: 'The panel names the item in hand and its seal. Aim left and tap E to slot it, aim right and tap E to bin a cracked breather. When the tray is empty-handed, aim ahead and tap E once per item short of the sheet count.' },
  rush: 'Counted the rows by eye and signed the sheet.',
  captions: { 'cracked counted': 'seal crackles', 'good kit binned': 'bin clatters', overdrawn: 'cart rattles' },
  says: { 'cracked counted': 'That breather seal is cracked — it goes in the inspection bin, not the tray.', 'good kit binned': 'That item was sound. Only cracked breathers go in the bin.', overdrawn: 'The tray already matches the sheet — no more from the cart.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Patch tray', prop: 'shelving' }, { name: 'Clamp tray', prop: 'drawers' }, { name: 'Breather tray', prop: 'locker' }]), r = m.rnd;
    const aimTol = m.calm ? 0.14 : 0.1;
    m.trays = m.sites.map(() => {
      const n = ri(r, 3, 4), items = Array.from({ length: n }, () => ({ name: pick(r, KIT), cracked: false })); items[0].name = 'breather'; items[0].cracked = true;
      for (const it of items.slice(1)) if (it.name === 'breather' && r() < 0.3) it.cracked = true;
      const list = shuffle(r, items); return { items: list, k: 0, slotted: 0, sheet: list.filter(x => !x.cracked).length + ri(r, 0, 2) };
    });
    const zone = (look = 0) => look > 0.3 - aimTol && look < 0.3 + aimTol ? 'slot' : look < -0.3 + aimTol && look > -0.3 - aimTol ? 'bin' : Math.abs(look) < aimTol ? 'cart' : null;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s || !inp.press) return; const i = m.next, t = m.trays[i], z = zone(inp.look);
      if (t.k < t.items.length) { const it = t.items[t.k]; if (z === 'slot') { if (it.cracked) { m.fault('cracked counted'); t.k++; return; } t.slotted++; t.k++; }
        else if (z === 'bin') { if (!it.cracked) { m.fault('good kit binned'); return; } t.k++; m.ev('binned', { site: i }); } }
      else if (z === 'cart') { if (t.slotted >= t.sheet) { m.fault('overdrawn'); return; } t.slotted++; }
      s.prog = (t.k + t.slotted) / (t.items.length + t.sheet) * 0.9;
      if (t.k >= t.items.length && t.slotted === t.sheet) m.finish(i);
    };
    const right = (t) => t.k < t.items.length ? (t.items[t.k].cracked ? -0.3 : 0.3) : 0;
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, look: right(m.trays[i]), press: f % 5 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, look: 0.3, press: f % 5 === 0 });
    m.view = () => ({ t: m.trays.map(t => [t.sheet, t.items.map(x => x.name[0] + (x.cracked ? 'x' : ''))]) });
    m.panel = (i) => { const t = m.trays[i]; if (!t) return null; const it = t.items[t.k];
      return { label: it ? `In hand: ${it.name}${it.name === 'breather' ? (it.cracked ? ' · seal CRACKED' : ' · seal sound') : ''}` : 'Tray vs sheet', value: `slotted ${t.slotted} / sheet ${t.sheet}`, bar: t.slotted / t.sheet }; };
    m.prompt = (i) => { const t = m.trays[i]; if (!t) return ''; if (t.k < t.items.length) return 'Aim left (slot) or right (inspection bin) and tap [E]';
      return t.slotted < t.sheet ? `Short ${t.sheet - t.slotted}: aim ahead at the stores cart and tap [E]` : ''; };
    return m;
  },
});
