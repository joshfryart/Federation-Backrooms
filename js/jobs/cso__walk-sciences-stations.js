// Chief science officer: walk the sciences stations with the clipboard. At each station's reagent bin, tap E to lift the next vial and read
// its label. An expired label must be pulled out of stock (hold E) before you lift the next one. When the bin is empty the clipboard shows the
// good-vial count against the stock sheet: initial a full bin (tap E) or write a request line for a short one (hold E). Pulled vials do not
// count, so a bin can go short on you. Passing an expired vial, pulling a good one, or ruling the line wrong is a fault.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'cso', label: 'Walk sciences stations', type: 'loop' },
  title: 'Reagent bin count against the sheet', dept: 'sciences', host: 'room', siteName: 'Bin', verb: 'Tally',
  how: 'At each bin tap E to lift and read each vial. Hold E to pull an EXPIRED one. When the bin is done, tap E to initial a full count or hold E to write a request line if it reads short of the sheet.',
  keys: ['E tap: next vial / initial', 'E hold: pull expired / write request'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'lift and tally', input: 'e-tap+e-hold', win: 'every vial in every station bin read, expired labels pulled, and each bin initialled full or written up short against the stock sheet',
    fail: 'lifting past an expired vial, pulling a good one, or initialling a bin that counts short of the sheet',
    rule: 'Tap E: lift the next vial. EXPIRED shows on the panel: hold E to pull it before the next tap. Bin empty: good count equals sheet = tap to initial; short = hold to write a request.' },
  rush: 'Glanced along the shelves and initialled the clipboard at the door.',
  captions: { 'expired left in bin': 'vial clinks back', 'pulled good stock': 'vial into waste bin', 'short bin missed': 'pen scratch', 'false request': 'page tear' },
  says: { 'expired left in bin': 'That vial was expired — pull it (hold [E]) before lifting the next.', 'pulled good stock': 'That vial was in date — it should have stayed in stock.', 'short bin missed': 'The bin counts short of the sheet — write a request line (hold [E]).', 'false request': 'The count matches the sheet — just initial it (tap [E]).' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bench 1 reagent bin', prop: 'labbench' }, { name: 'Fume hood bin', prop: 'fumehood' }, { name: 'Sample fridge bin', prop: 'samplefridge' }]), r = m.rnd, holdT = 0.7;
    const shortAt = shuffle(r, [0, 1, 2]).slice(0, ri(r, 1, 2));
    m.bins = m.sites.map((_, i) => { const n = ri(r, 4, 6), exp = new Set(r() < 0.6 ? [ri(r, 0, n - 1)] : []); const good = n - exp.size, short = shortAt.includes(i);
      return { vials: [...Array(n)].map((_, k) => exp.has(k)), v: -1, pend: false, sheet: good + (short ? 1 : 0), short, h: 0, lock: false }; });
    const act = (i, b, hold) => {
      const all = b.v >= b.vials.length - 1;
      if (b.pend) { if (hold) b.pend = false; else m.fault('expired left in bin'); return; }
      if (!all) { if (hold) { m.fault('pulled good stock'); return; } b.v++; b.pend = b.vials[b.v]; return; }
      if (hold === b.short) m.finish(i); else m.fault(b.short ? 'short bin missed' : 'false request');
    };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, b = m.bins[i];
      if (inp.hold) { b.h += dt; if (b.h >= holdT && !b.lock) { b.lock = true; act(i, b, true); } }
      if (rel) { if (!b.lock && b.h < 0.4) act(i, b, false); b.h = 0; b.lock = false; }
      if (!s.done) s.prog = clamp((b.v + 1) / (b.vials.length + 1), 0, 0.95);
    };
    m.want = (b) => b.pend ? 'hold' : b.v < b.vials.length - 1 ? 'tap' : b.short ? 'hold' : 'tap';
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const b = m.bins[i]; return m.want(b) === 'hold' ? { at: i, hold: !b.lock } : { at: i, hold: f % 4 === 0 && !b.lock, press: f % 4 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 60 < 30, press: f % 60 === 0 });
    m.view = () => ({ bins: m.bins.map(b => [b.vials.map(Number).join(''), b.sheet]) });
    m.panel = (i) => { const b = m.bins[i]; if (!b) return null; const all = b.v >= b.vials.length - 1 && !b.pend, cnt = b.vials.slice(0, b.v + 1).filter(x => !x).length;
      return all ? { label: `Bin empty · good ${cnt} vs sheet ${b.sheet}`, value: cnt < b.sheet ? 'SHORT' : 'matches', bar: b.h / holdT } : { label: `Vial ${b.v + 1} of ${b.vials.length} · good so far ${cnt}`, value: b.pend ? 'EXPIRED label' : b.v < 0 ? 'lift the first' : 'in date', bar: b.pend ? b.h / holdT : (b.v + 1) / b.vials.length }; };
    m.prompt = (i) => { const b = m.bins[i]; if (!b) return ''; const w = m.want(b); return b.pend ? 'Expired — hold [E] to pull it from stock' : b.v < b.vials.length - 1 ? 'Tap [E] to lift and read the next vial' : w === 'hold' ? 'Short of the sheet — hold [E] to write a request line' : 'Count matches — tap [E] to initial the line'; };
    return m;
  },
});
