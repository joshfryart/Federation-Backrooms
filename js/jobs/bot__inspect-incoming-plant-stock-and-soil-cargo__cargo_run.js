// Botanist, cargo run: inspect incoming plant stock and soil cargo. At each crate, hold E to set the pry bar under the lid and rock it: swing
// your view left, then right, then left; only each change of direction lifts the lid a notch (a steady turn does nothing). Once the lid is off the
// panel gives the soil probe smell and what the magnifier shows. Grade the crate: a quick tap of E passes it; hold E for a full second to paint
// the red stripe and send it to the quarantine bay. Passing a crate with rot or blight brings blight into the arboretum; striping a clean crate
// wastes good stock. Both are faults.
import { define, machine, room, ri, pick, shuffle, clamp } from './kit.js';

const CLEAN = [['earthy', 'clean leaves'], ['loamy', 'firm white roots'], ['damp peat', 'glossy leaves']];
const ROT = [['sulphur', 'brown leaf spots'], ['sour rot', 'grey mould at the root ball'], ['earthy', 'fine webbing under leaves'], ['musty', 'dark slime at the base']];
export default define({
  job: { billet: 'bot', label: 'Inspect incoming plant stock and soil cargo', type: 'task:cargo_run' },
  title: 'Crate prying and blight grading', dept: 'sciences', host: 'room', item: 'crowbar', siteName: 'Crate', verb: 'Inspect',
  how: 'Hold E and rock the pry bar by swinging your view left and right until the lid comes off. Read the probe and magnifier: tap E to pass a clean crate, hold E one second to stripe a bad one.',
  keys: ['E hold + rock the view: pry', 'E tap: pass', 'E hold 1 s: red stripe'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'pry and grade', input: 'e-hold+e-tap+swing', win: 'every crate levered open by rocking the bar, then passed clean or striped for quarantine correctly',
    fail: 'passing a crate with rot or blight into the arboretum, or striping clean stock',
    rule: 'Only reversals of your swing direction lift the lid. With it open, any bad smell or mark means hold E for the stripe; a clean crate gets a short tap.' },
  rush: 'Read the manifest tags and signed the sheet without opening a crate.',
  captions: { 'blight passed': 'leaf spots spread on the bed', 'stock binned': 'good trays tipped in quarantine' },
  says: { 'blight passed': 'That crate had rot or blight in it and you passed it. Stripe it next time.', 'stock binned': 'That crate was clean: you striped good stock.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crate 1', prop: 'crate' }, { name: 'Crate 2', prop: 'pallet_loaded' }, { name: 'Crate 3', prop: 'crate' }]), r = m.rnd;
    const bad = shuffle(r, [true, false, ri(r, 0, 1) === 1]), need = m.calm ? 4 : 5, stripeT = 1.0;
    m.crates = m.sites.map((_, i) => ({ bad: bad[i], tag: `M-${ri(r, 1000, 9999)}`, find: pick(r, bad[i] ? ROT : CLEAN), lid: 0, dir: 0, open: false, armed: false, held: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, c = m.crates[i];
      if (!c.open) {
        const sw = inp.swing || 0, d = sw > 0.6 ? 1 : sw < -0.6 ? -1 : 0;
        if (inp.hold && d && d !== c.dir) { if (c.dir) c.lid++; c.dir = d; if (c.lid >= need) { c.open = true; m.ev('open', { site: i }); } }
        s.prog = 0.5 * c.lid / need; return;
      }
      if (!c.armed) { if (!inp.hold) c.armed = true; return; }
      if (inp.hold) { c.held += dt; if (c.held >= stripeT) { if (!c.bad) m.fault('stock binned'); m.finish(i); return; } }
      if (rel) { if (c.held < 0.35) { if (c.bad) m.fault('blight passed'); m.finish(i); return; } c.held = 0; }
      s.prog = clamp(0.5 + 0.45 * c.held / stripeT, 0.5, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.crates[i];
      if (!c.open) return { at: i, hold: true, swing: f % 8 < 4 ? 2 : -2 };
      if (!c.armed) return { at: i, hold: false };
      return c.bad ? { at: i, hold: true, press: c.held === 0 } : (c.held === 0 ? { at: i, hold: true, press: true } : { at: i, hold: false }); };
    m.bad = (f = 0) => { const i = m.next, c = m.crates[i]; if (!c.open || !c.armed) return { at: i, hold: !c.open, swing: f % 8 < 4 ? 2 : -2 };
      return c.bad ? (c.held === 0 ? { at: i, hold: true, press: true } : { at: i, hold: false }) : { at: i, hold: true }; };
    m.view = () => ({ crates: m.crates.map(c => [c.tag, c.bad, c.find]) });
    m.panel = (i) => { const c = m.crates[i]; if (!c) return null; if (!c.open) return { label: `Lid ${c.tag}`, value: `${c.lid}/${need} levers`, bar: c.lid / need };
      return { label: `Probe: ${c.find[0]} · lens: ${c.find[1]}`, value: c.held ? 'striping…' : 'tap pass / hold stripe', bar: c.held / stripeT }; };
    m.prompt = (i) => { const c = m.crates[i]; return !c ? '' : !c.open ? 'Hold [E] and rock the bar: swing your view left, right, left…' : 'Clean: tap [E] to pass. Any rot or blight: hold [E] one second to stripe it'; };
    return m;
  },
});
