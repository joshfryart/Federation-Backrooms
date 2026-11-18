// Second officer: verify the manifest against the stowage plan. At each open stowage locker, hold E with your hand on the first crate and
// swing your view slowly to the left to run your hand along the stack, touching each crate once while its label is read against the
// manifest line. Swing too fast and you are counting from the doorway (the count restarts). When your hand is on a crate whose label does not
// match its manifest line, let go of E to flag it, then carry on; passing a wrong label without stopping ticks it: a fault.
import { define, machine, room, ri, pick, shuffle, clamp } from './kit.js';

const GOODS = ['ration packs', 'deuterium cells', 'medical stores', 'hull plate', 'seed stock', 'spare EPS couplers', 'water purifiers', 'blankets', 'tool kits'];

export default define({
  job: { billet: 'so', label: 'Verify manifest against the stowage plan', type: 'task:cargo_run' },
  title: 'Crate-by-crate touch count', dept: 'command', host: 'room', siteName: 'Locker', verb: 'Tally',
  how: 'Hold E and swing your view slowly left to run your hand crate by crate along the locker; let go of E on any crate whose label does not match its manifest line to flag it.',
  keys: ['E hold + swing left slowly: next crate', 'let go of E: flag this crate'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'touch-count', input: 'e-hold+swing', win: 'every crate in every locker touched once at walking pace and each mislabelled crate stopped on and flagged',
    fail: 'sweeping the stack too fast to read the labels, or moving past a label that does not match its manifest line',
    rule: 'Hold E and swing the view left at a steady pace to slide your hand along the crates. Too fast and the count restarts. On a MISMATCH crate, release E once to flag it.' },
  rush: 'Counted the crates from the doorway and ticked the whole manifest page.',
  captions: { 'too fast': 'clipboard rattles', 'wrong label ticked': 'manifest pen click' },
  says: { 'too fast': 'Too fast: that was a count from the doorway. Start the locker again, one crate at a time.', 'wrong label ticked': 'That crate\'s label did not match its line, and you ticked it. Stop on a mismatch.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Stowage locker 1', prop: 'crate' }, { name: 'Stowage locker 2', prop: 'pallet_loaded' }, { name: 'Stowage locker 3', prop: 'shelving' }]), r = m.rnd;
    const fast = m.calm ? 2.2 : 1.8, must = ri(r, 0, 2);
    m.lockers = m.sites.map((_, i) => {
      const n = ri(r, 3, 5), goods = shuffle(r, GOODS).slice(0, n), bad = (i === must || r() < 0.4) ? ri(r, 0, n - 1) : -1;
      return { crates: goods.map((g, k) => ({ line: g, label: k === bad ? pick(r, GOODS.filter(x => !goods.includes(x))) : g, flag: false })), hp: 0 };
    });
    const zone = (L) => Math.min(L.crates.length - 1, Math.floor(L.hp * L.crates.length));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, L = m.lockers[i], n = L.crates.length;
      if (rel) { const c = L.crates[zone(L)]; if (c.label !== c.line && !c.flag) { c.flag = true; m.ev('flag', { site: i }); } }
      if (inp.hold && (inp.swing || 0) > fast) { m.fault('too fast'); L.hp = 0; }
      else if (inp.hold && (inp.swing || 0) > 0.25) {
        const k0 = zone(L); L.hp = clamp(L.hp + inp.swing * 0.32 * dt);
        const k1 = Math.floor(L.hp * n); if (k1 > k0 || L.hp >= 1) { const c = L.crates[k0]; if (c.label !== c.line && !c.flag) { m.fault('wrong label ticked'); c.flag = true; } }
        if (L.hp >= 1) { m.finish(i); return; }
      }
      s.prog = L.hp * 0.95;
    };
    m.hint = () => {
      const i = m.next; if (i < 0) return { at: -1 }; const L = m.lockers[i], n = L.crates.length, k = zone(L), c = L.crates[k];
      if (c.label !== c.line && !c.flag && L.hp >= (k + 0.3) / n) return { at: i, hold: false };
      return { at: i, hold: true, swing: 1.2 };
    };
    m.bad = () => ({ at: m.next, hold: true, swing: 2.6 });
    m.view = () => ({ l: m.lockers.map(L => L.crates.map(c => c.line + (c.label !== c.line ? '≠' + c.label : ''))) });
    m.panel = (i) => {
      const L = m.lockers[i]; if (!L) return null; const k = zone(L), c = L.crates[k], mis = c.label !== c.line;
      return { label: `Crate ${k + 1}/${L.crates.length} · manifest: ${c.line}`, value: `label: ${c.label}${mis ? (c.flag ? '  ⚑ flagged' : '  ≠ MISMATCH: let go') : '  ✓'}`, bar: L.hp };
    };
    m.prompt = (i) => { const L = m.lockers[i]; if (!L) return ''; const c = L.crates[zone(L)]; return c.label !== c.line && !c.flag ? 'Label does not match: let go of [E] to flag this crate' : 'Hold [E] and swing your view slowly left, crate by crate'; };
    return m;
  },
});
