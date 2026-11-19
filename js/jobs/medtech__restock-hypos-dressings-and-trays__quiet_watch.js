// Medical technician: restock hypos, dressings and trays on a quiet watch. Each shelf slot is filled to its marked line one pack at a time,
// oldest stock at the front. Read the expiry on the pack in hand against the pack at the front of the slot: a pack that expires later is
// slid in at the back (tap E); one that expires sooner than the front pack must go in front of it (hold E to push the row back).
import { define, machine, room, ri, clamp } from './kit.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], D = (n) => `${MON[n % 12]} ${2400 + Math.floor(n / 12)}`;
export default define({
  job: { billet: 'medtech', label: 'Restock hypos, dressings and trays', type: 'task:quiet_watch' },
  title: 'Oldest-to-front shelf rotation', dept: 'medical', host: 'room', siteName: 'Slot', verb: 'Restock',
  how: 'Fill each slot to its line one pack at a time. Compare the pack\'s expiry with the front pack: later expiry, tap E (back of the row); sooner expiry, hold E to push it in at the front.',
  keys: ['E tap: pack to the back', 'E hold: pack to the front'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'rotate stock', input: 'e-tap+e-hold', win: 'every slot filled to its marked line with the soonest-expiring pack always at the front of the row',
    fail: 'shelving a sooner-dated pack behind newer stock so it expires unused at the back',
    rule: 'Panel: expiry in hand vs expiry at the front. Expires later or same: quick tap E puts it at the back. Expires sooner: hold E until it slides to the front.' },
  rush: 'Shoved the new packs in at the front of every shelf.',
  captions: { 'rotation wrong': 'shelf clatters' }, says: { 'rotation wrong': 'Wrong end — the soonest expiry must sit at the front. Compare the dates before you place the pack.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Hypo case shelf', prop: 'med_dispenser' }, { name: 'Dressing pack shelf', prop: 'shelving' }, { name: 'Sterile tray cart', prop: 'drawers' }]), r = m.rnd;
    const holdT = 0.55;
    m.slots = m.sites.map(() => {
      const front = ri(r, 6, 30), n = ri(r, 3, 4), soon = ri(r, 0, n - 1); let f = front; const packs = [];
      for (let k = 0; k < n; k++) { const e = k === soon || r() < 0.25 ? f - ri(r, 1, 5) : f + ri(r, 0, 9); packs.push(e); f = Math.min(f, e); }
      return { front, packs, k: 0, line: n };
    });
    m.dur = 0; m.lock = false;
    const place = (i, toFront) => { const u = m.slots[i], e = u.packs[u.k], wantFront = e < u.front; if (toFront !== wantFront) m.fault('rotation wrong'); u.front = Math.min(u.front, e); u.k++; if (u.k >= u.line) m.finish(i); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { m.dur = 0; return; } const i = m.next;
      if (inp.hold) { if (m.lock) return; m.dur += dt; if (m.dur >= holdT) { m.lock = true; m.dur = 0; place(i, true); } }
      else { if (rel && !m.lock && m.dur > 0) place(i, false); m.dur = 0; m.lock = false; }
      if (!s.done) s.prog = clamp(m.slots[i].k / m.slots[i].line * 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.slots[i], front = u.packs[u.k] < u.front; return front ? { at: i, hold: !m.lock } : { at: i, hold: !m.lock && m.dur < 0.1 && f % 4 < 2 }; };
    m.bad = (f = 0) => { const i = m.next; return i < 0 ? { at: -1 } : { at: i, hold: f % 4 < 2 }; };
    m.view = () => ({ s: m.slots.map(u => u.front + ':' + u.packs.join(',')) });
    m.panel = (i) => { const u = m.slots[i]; if (!u) return null; if (u.k >= u.line) return { label: 'At the line', value: 'full', bar: 1 };
      return { label: `In hand: exp ${D(u.packs[u.k])}`, value: `front: exp ${D(u.front)} · ${u.k}/${u.line} to line`, bar: m.dur ? clamp(m.dur / holdT) : u.k / u.line, band: m.dur ? [0.95, 1] : undefined }; };
    m.prompt = (i) => { const u = m.slots[i]; return !u || u.k >= u.line ? '' : 'Expires later than the front pack: tap [E]. Expires sooner: hold [E] to push it to the front'; };
    return m;
  },
});
