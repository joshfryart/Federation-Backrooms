// Medtech: inspect incoming medical stores. Hold E to raise a vial to the light: expiry reads out at once, cloudiness only after the vial has
// been held up a moment. Release a good vial early to shelve it; keep holding past the bin mark to drop a bad one in the red bin.
import { define, machine, room, ri, pick, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'medtech', label: 'Inspect incoming medical stores and log expiry', type: 'task:cargo_run' },
  title: 'Vial light check and bin call', dept: 'medical', host: 'room', siteName: 'Carton', verb: 'Check',
  how: 'Hold E to lift the vial to the light. Once it reads out, let go to shelve a good vial, or keep holding to the bin mark to bin an expired, near-expiry or cloudy one.',
  keys: ['E hold: vial to the light', 'let go = shelve', 'hold on to the bin mark = red bin'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'light-check', input: 'e-hold', win: 'four vials judged by how long each is held up, bad ones binned and sound ones shelved',
    fail: 'shelving a cloudy or short-dated vial, binning a sound one, or letting go before the vial has been read',
    rule: 'Hold E: the expiry shows quickly, cloudiness a moment later. Let go after the read-out to shelve; hold on past the bin mark to put it in the red bin.' },
  rush: 'Shelved the cartons on the lot code without holding a single vial to the light.',
  captions: { 'shelved bad': 'degraded-stock alarm', 'binned good': 'waste tone', unread: 'vial dropped back' },
  says: { 'shelved bad': 'That vial was expired or cloudy and went on the shelf.', 'binned good': 'A sound vial went in the red bin.', unread: 'Hold it up until the read-out shows before you let go.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [0, 1, 2, 3].map(i => ({ name: `Carton ${i + 1}`, prop: i % 2 ? 'locker' : 'shelving' }))), r = m.rnd;
    const kinds = shuffle(r, ['good', pick(r, ['expired', 'near']), 'cloudy', pick(r, ['good', 'near', 'expired'])]), reveal = m.calm ? 0.65 : 0.85, binAt = reveal + 0.8;
    m.vials = kinds.map(k => ({ kind: k, lot: 'L' + ri(r, 100, 999), days: k === 'expired' ? -ri(r, 1, 30) : k === 'near' ? ri(r, 1, 2) : ri(r, 5, 40), bad: k !== 'good', h: 0, lock: false }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, v = m.vials[i];
      if (inp.hold && !v.lock) { v.h += dt; if (v.h >= binAt + 0.35) { v.lock = true; if (v.bad) m.finish(i); else { m.fault('binned good'); v.h = 0; } } }
      if (rel) { const h = v.h; v.h = 0; if (v.lock) v.lock = false; else if (h > 0.08) { if (h < reveal) m.fault('unread'); else if (v.bad) m.fault('shelved bad'); else m.finish(i); } }
      s.prog = s.done ? 1 : clamp(v.h / binAt) * 0.9;
    };
    m.hint = () => { const v = m.vials[m.next]; if (!v) return { at: -1 }; return { at: m.next, hold: v.bad || v.h < reveal + 0.1 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 10 < 4 });
    m.view = () => ({ v: m.vials.map(v => [v.kind, v.lot, v.days]) });
    m.panel = (i) => { const v = m.vials[i]; if (!v) return null; const seen = v.h >= 0.35, cl = v.h >= reveal; return { label: 'Lot ' + v.lot, value: !seen ? 'at a glance: looks fine' : `exp ${v.days >= 0 ? 'in ' + v.days + ' d' : Math.abs(v.days) + ' d ago'}${cl ? (v.kind === 'cloudy' ? ' · CLOUDY' : ' · clear') : ''}`, bar: v.h / (binAt + 0.35), band: [binAt / (binAt + 0.35), 1] }; };
    m.prompt = (i) => 'Hold [E] to raise the vial to the light; let go to shelve, hold on to the bin mark for the red bin';
    return m;
  },
});
