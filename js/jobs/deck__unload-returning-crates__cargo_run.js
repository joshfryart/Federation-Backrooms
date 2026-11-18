// Deck crew: unload returning crates. At each crate hold E to lift it (wait for the lift to come up fully: twisting a half-lifted crate drops
// it), then keep holding and turn your body toward the sled side at a steady pace until the crate is over the sled, and let go to set it down.
// Turning too fast with the load swings it out of your hands; letting go short of the sled leaves the crate in the recovery path.
import { define, machine, room, rf, pick, clamp } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Unload returning crates', type: 'task:cargo_run' },
  title: 'Crate lift and pivot to the sled', dept: 'flight', host: 'room', siteName: 'Crate', verb: 'Unload',
  how: 'Hold E to lift the crate and wait until it is fully up. Still holding, turn steadily toward the sled side (not too fast) until the crate is over the sled, then let go.',
  keys: ['E hold: lift and carry', 'Turn steadily toward the sled', 'Let go over the sled'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'lift and pivot', input: 'e-hold+swing', win: 'each returning crate lifted clean, pivoted onto the sled at a controlled pace and ticked off the arrival list',
    fail: 'twisting with a half-lifted or fast-swinging load so the crate drops, or setting it down short in the recovery path',
    rule: 'The lift meter must be full before you turn. Then the body-turn speed must stay under the strain mark while the pivot gauge fills toward the sled; release only once it is over the sled.' },
  rush: 'Dragged the crates off the ramp and left them by the pad.',
  captions: { dropped: 'crate thuds on the deck', 'left in path': 'crate scrapes on the pad' },
  says: { dropped: 'Dropped it — lift fully, then turn slowly with the load.', 'left in path': 'Set down short of the sled — it is sitting in the recovery path.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crate 1', prop: 'crate' }, { name: 'Crate 2', prop: 'injector_crate' }, { name: 'Crate 3', prop: 'pallet_loaded' }]), r = m.rnd;
    const fast = m.calm ? 2.2 : 1.8;
    m.crates = m.sites.map(() => ({ lift: 0, pivot: 0, side: pick(r, [1, -1]), need: rf(r, 1.0, 1.4), heavy: rf(r, 0.7, 1.1) }));
    const reset = (k) => { k.lift = 0; k.pivot = 0; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, k = m.crates[i], sw = inp.swing || 0;
      if (inp.hold) {
        if (k.lift < 1) { k.lift = Math.min(1, k.lift + dt / k.heavy); if (Math.abs(sw) > 0.6) { m.fault('dropped'); reset(k); } }
        else if (Math.abs(sw) > fast) { m.fault('dropped'); reset(k); }
        else if (Math.sign(sw) === k.side) k.pivot += Math.abs(sw) * dt;
      }
      if (rel && k.lift > 0) { if (k.lift >= 1 && k.pivot >= k.need) { m.ev('tick', { crate: i }); m.finish(i); return; } if (k.pivot > 0.1) m.fault('left in path'); reset(k); }
      s.prog = s.done ? 1 : clamp(k.lift * 0.3 + clamp(k.pivot / k.need) * 0.6, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.crates[i]; if (k.lift < 1) return { at: i, hold: true, swing: 0 }; if (k.pivot < k.need) return { at: i, hold: true, swing: 1.2 * k.side }; return { at: i, hold: false }; };
    m.bad = () => { const k = m.crates[m.next]; return { at: m.next, hold: true, swing: 3 * k.side }; };
    m.view = () => ({ crates: m.crates.map(k => [k.side, +k.need.toFixed(2)]) });
    m.panel = (i) => { const k = m.crates[i]; if (!k) return null; return k.lift < 1 ? { label: 'Lift', value: `${Math.round(k.lift * 100)} % — hold still`, bar: k.lift, band: [0.98, 1] } : { label: `Pivot ${k.side > 0 ? '◀ sled left' : 'sled right ▶'}`, value: k.pivot >= k.need ? 'over the sled — let go' : `${Math.round(k.pivot / k.need * 100)} %`, bar: clamp(k.pivot / k.need), band: [1, 1] }; };
    m.prompt = (i) => { const k = m.crates[i]; return !k ? '' : k.lift < 1 ? 'Hold [E] to lift; keep still until it is fully up' : k.pivot < k.need ? `Keep holding and turn steadily ${k.side > 0 ? 'left' : 'right'} toward the sled` : 'Over the sled: let go of [E]'; };
    return m;
  },
});
