// XO: department walk-round. The console's fault list is a summary; the real faults are found by hand. At each stop hold E and run your hand
// slowly along the panel row, pipe joint or strap line (turn the view left to right). A fault the console never listed shows up under your
// hand: let go there to log it. Sweep too fast and you feel nothing (a fault); carry on past a fault you felt and it goes unlogged (a fault).
import { define, machine, room, rf, clamp } from './kit.js';

const A = -0.5, B = 0.5;
export default define({
  job: { billet: 'xo', label: 'Department walk-round', type: 'loop' },
  title: 'Walk-round hand trace', dept: 'command', host: 'room', siteName: 'Stop', verb: 'Trace',
  how: 'At each stop hold E and slowly turn from left to right to run your hand along the joint or strap. Let go the moment you feel a fault to log it; reach the end of a clean run, then let go.',
  keys: ['E hold: hand on', 'turn slowly left to right', 'let go at a fault or at the end'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'hand-trace', input: 'e-hold+look+turn', win: 'every stop traced end to end at a feeling pace, and each fault the console missed logged where the hand found it',
    fail: 'sweeping past too fast to feel anything, letting go half way along a clean run, or carrying on past a drip or loose strap',
    rule: 'Hold E and turn the view slowly rightwards: the traced line follows your hand. If the panel reads DRIP or SLACK, let go there. On a clean line, trace to the end mark and let go. Turning faster than a slow walk is skimming.' },
  rush: 'Read the open-fault list off the engineering console and called the walk done.',
  captions: { skimmed: 'hand slaps panel', 'walked past': 'drip hisses on', 'half traced': 'footsteps move on' },
  says: { skimmed: 'Too fast — you felt nothing. Run your hand slowly.', 'walked past': 'You went past it — that joint was wet. Let go where you feel the fault.', 'half traced': 'You stopped half way along. Trace the whole run.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bulkhead panel row', prop: 'relayrack' }, { name: 'Coolant junction joints', prop: 'pumpskid' }, { name: 'Cargo pallet lashings', prop: 'pallet_loaded' }]), r = m.rnd;
    const maxTurn = m.calm ? 1.6 : 1.25, faultAt = r() < 0.5 ? 1 : 2 + Math.floor(r() * 2);   // at least one stop hides a fault
    m.runs = m.sites.map((s, i) => ({ fault: (faultAt & (1 << i)) ? rf(r, -0.25, 0.3) : null, kind: i === 2 ? 'SLACK' : i === 1 ? 'DRIP' : 'HOT PANEL', p: A, felt: 0, cool: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, u = m.runs[i]; u.cool = Math.max(0, u.cool - dt);
      if (inp.hold) {
        if ((inp.turn || 0) > maxTurn) { if (!u.cool) { m.fault('skimmed'); u.cool = 0.8; } u.p = A; u.felt = 0; return; }
        const lk = inp.look || 0; if (lk > u.p && lk - u.p < 0.12) u.p = clamp(lk, A, B);
        if (u.fault != null && u.p >= u.fault) { u.felt += dt; if (u.p > u.fault + 0.14) { m.fault('walked past'); u.p = A; u.felt = 0; } }
      }
      if (rel) {
        if (u.fault != null && u.felt > 0) { m.ev('logged', { site: i }); m.finish(i); return; }
        if (u.fault == null && u.p >= B - 0.02) { m.finish(i); return; }
        if (u.p > A + 0.1) m.fault('half traced'); u.p = A;
      }
      s.prog = (u.p - A) / (B - A) * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.runs[i], hit = u.fault != null && u.felt > 0; return { at: i, hold: !hit && u.p < B - 0.02, look: Math.min(B, u.p + 0.03), turn: 0.9 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: true, look: -0.5 + (f % 10) / 10, turn: 3 });
    m.view = () => ({ runs: m.runs.map(u => u.fault == null ? null : +u.fault.toFixed(2)) });
    m.panel = (i) => { const u = m.runs[i]; if (!u) return null; const hit = u.fault != null && u.felt > 0; return { label: hit ? u.kind + ' — let go' : 'Hand along the line', value: hit ? 'felt it' : `${Math.round((u.p - A) * 100)} %`, bar: (u.p - A) / (B - A), band: [0.97, 1] }; };
    m.prompt = (i) => { const u = m.runs[i]; return !u ? '' : u.fault != null && u.felt > 0 ? 'You felt a fault — let go of [E] to log it' : 'Hold [E] and turn slowly to the right along the line'; };
    return m;
  },
});
