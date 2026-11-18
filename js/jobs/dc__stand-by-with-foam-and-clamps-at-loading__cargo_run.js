// Damage control: stand by with foam at loading. Stand at the cargo locker mark with the extinguisher and face the lane. While a crate is in
// the air keep the nozzle on the locker mark (view straight ahead): turning into the lift path (left) while a crate moves is a fault. When a
// landed crate leaks, a spill marker shows in the lane: hold E and sweep the nozzle back and forth across it until it is smothered. Foaming
// with no spill is a fault (wasted foam), and so is leaving a spill unfoamed so it spreads.
import { define, machine, room, ri, rf, clamp } from './kit.js';

const BINS = 4;
export default define({
  job: { billet: 'dc', label: 'Stand by with foam and clamps at loading', type: 'task:cargo_run' },
  title: 'Foam standby at the lift lane', dept: 'engineering', host: 'room', item: 'extinguisher', siteName: 'Standby mark', verb: 'Stand by',
  how: 'Keep your view on the locker mark while a crate is moving. Only when a spill marker appears, turn to it, hold E and sweep the foam across it until it is covered, then come back to the mark.',
  keys: ['Look ahead: hold the mark', 'E hold + sweep: foam the spill'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'hold back', input: 'e-hold+look+swing', win: 'every lift watched from the locker mark and every spill smothered by sweeping foam across it once its crate settled',
    fail: 'turning into the lift path while a crate is moving, foaming nothing, or letting a spill spread',
    rule: 'While the panel says LIFTING keep the view within the locker mark. After a crate lands a spill may appear left in the lane: aim at it, hold E and sweep side to side until all four strips read covered.' },
  rush: 'Leaned on the locker and watched the crates go by.',
  captions: { 'in the lift path': 'crate swings close', 'foam wasted': 'foam hisses', 'spill spread': 'liquid spreads' },
  says: { 'in the lift path': 'Back to the mark — never step into the lane while a crate is moving.', 'foam wasted': 'There is no spill. Save the foam.', 'spill spread': 'That spill spread. Foam it as soon as it shows.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cargo locker mark', prop: 'locker' }]), r = m.rnd, spread = m.calm ? 6 : 4.5;
    const n = 3, spills = ri(r, 2, 3); m.lifts = Array.from({ length: n }, (_, k) => ({ up: rf(r, 1.4, 2.6), spill: k < spills, px: rf(r, 0.22, 0.4), wait: rf(r, 0.6, 1.2) }));
    if (spills < n) m.lifts.push(m.lifts.splice(ri(r, 0, n - 1), 1)[0]);
    m.k = 0; m.ph = 'lift'; m.pt = 0; m.cov = new Array(BINS).fill(false); m.inPath = false; m.waste = 0;
    const L = () => m.lifts[m.k];
    const nextLift = () => { m.k++; m.ph = 'lift'; m.pt = 0; m.inPath = false; m.cov.fill(false); if (m.k >= m.lifts.length) m.finish(0); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const l = L(), look = inp.look || 0; m.pt += dt;
      if (m.ph === 'lift') { if (look > 0.15 && !m.inPath) { m.inPath = true; m.fault('in the lift path'); } if (m.pt >= l.up) { m.ph = 'land'; m.pt = 0; } }
      else if (m.ph === 'land') { if (m.pt >= l.wait) { if (l.spill) { m.ph = 'spill'; m.pt = 0; m.ev('spill', { x: +l.px.toFixed(2) }); } else nextLift(); } }
      else if (m.ph === 'spill') { if (m.pt > spread) { m.fault('spill spread'); nextLift(); return; }
        if (inp.hold && Math.abs(inp.swing || 0) > 0.3) { const b = Math.floor((look - (l.px - 0.08)) / 0.16 * BINS); if (b >= 0 && b < BINS) m.cov[b] = true; }
        if (m.cov.every(Boolean)) { m.ev('smothered'); nextLift(); return; } }
      if (inp.hold && m.ph !== 'spill') { m.waste += dt; if (m.waste > 0.4) { m.fault('foam wasted'); m.waste = 0; } } else if (!inp.hold) m.waste = 0;
      s.prog = clamp((m.k + (m.ph === 'spill' ? m.cov.filter(Boolean).length / BINS * 0.9 : 0)) / m.lifts.length, 0, 0.95);
    };
    m.hint = (f = 0) => { if (m.next < 0) return { at: -1 }; const l = L(); if (m.ph !== 'spill') return { at: 0, hold: false, look: 0, swing: 0 };
      const ph = (f % 16) / 15, back = Math.floor(f / 16) % 2; return { at: 0, hold: true, look: l.px - 0.075 + 0.15 * (back ? 1 - ph : ph), swing: back ? -1.2 : 1.2 }; };
    m.bad = () => ({ at: 0, hold: false, look: 0.3, swing: 0 });
    m.view = () => ({ l: m.lifts.map(l => [+l.up.toFixed(2), l.spill, +l.px.toFixed(2)]) });
    m.panel = () => { const l = L(); if (!l) return { label: 'Loading done', value: '' };
      return m.ph === 'lift' ? { label: `Crate ${m.k + 1}/${m.lifts.length} LIFTING — hold the mark`, value: 'stand by', bar: m.pt / l.up }
        : m.ph === 'land' ? { label: `Crate ${m.k + 1} landed — watch the lane`, value: '…', bar: 1 }
        : { label: `SPILL in the lane (${Math.round(l.px * 57)}° left)`, value: `covered ${m.cov.filter(Boolean).length}/${BINS}`, bar: m.cov.filter(Boolean).length / BINS }; };
    m.prompt = () => m.ph === 'spill' ? 'Turn to the spill, hold [E] and sweep the foam across it' : 'Stay on the locker mark — do not step into the lane';
    return m;
  },
});
