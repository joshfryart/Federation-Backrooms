// Reactor specialist: coolant loop cross-check. Read the manifold flow gauge, then lay a hand flat on the outlet pipe and run it slowly along
// the length (hold E and sweep the view) feeling for the cold patch under the frost mark; let go on it to chalk it. A hand swept too fast
// feels nothing and has to start again. Last, at the core sheet, set the flow figure beside the core temperature: more than ten percent under
// normal is drift and must be reported (hold E); in step it is just signed (tap E). Calling it the wrong way is a fault.
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Coolant loop cross-check', type: 'loop' },
  title: 'Coolant pipe hand-run and drift call', dept: 'engineering', host: 'room', siteName: 'Check', verb: 'Feel',
  how: 'Tap E at the flow gauge to read it. At the outlet pipe hold E and sweep your view slowly to run your hand along; let go on the cold patch. At the sheet: flow over 10 % under normal, hold E to report drift, else tap E to sign.',
  keys: ['E tap: read / sign', 'E hold + slow sweep: run the hand', 'E hold long: report drift'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'run the hand', input: 'e-tap+e-hold+swing', win: 'the frost cold patch found by a slow hand-run and the flow-versus-core drift called correctly',
    fail: 'sweeping the hand too fast to feel the pipe, letting go off the cold patch, or signing a drifting loop',
    rule: 'On the pipe, the hand only feels while the view sweeps slowly; a fast sweep is skimmed. Release E where the felt temperature drops. At the sheet compare flow to normal: under 90 % hold E to report, else tap E.' },
  rush: 'Read the flow gauge from across the bay and wrote it next to the core figure.',
  captions: { skimmed: 'hand slides off the pipe', 'wrong spot': 'chalk scrape', 'missed drift': 'coolant alarm', 'false drift': 'bridge query chime' },
  says: { skimmed: 'Too fast: your hand felt nothing. Sweep slowly along the pipe.', 'wrong spot': 'That stretch of pipe is warm; the cold patch is elsewhere.', 'missed drift': 'Flow is more than ten percent short: that is drift, report it (hold E).', 'false drift': 'Flow is within ten percent: sign it (tap E), no report.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Manifold flow gauge', prop: 'pumpskid' }, { name: 'Outlet pipe', prop: 'heatexch' }, { name: 'Core sheet', prop: 'reactorstation' }]), r = m.rnd;
    const fast = m.calm ? 2.0 : 1.6, zw = m.calm ? 0.16 : 0.12;
    m.flow = r() < 0.5 ? ri(r, 72, 88) : ri(r, 92, 104); m.core = ri(r, 1900, 2120); m.cold = rf(r, 0.35, 0.8); m.pos = 0; m.hT = 0; m.cool = 0; m.read = false;
    const drift = () => m.flow < 90;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      m.cool = Math.max(0, m.cool - dt); const held = m.hT; m.hT = inp.hold ? m.hT + dt : 0;
      if (i === 0) { if (rel) { m.read = true; m.finish(0); } s.prog = inp.hold ? 0.5 : 0; return; }
      if (i === 1) {
        if (inp.hold) { const sw = Math.abs(inp.swing || 0); if (sw > fast) { if (!m.cool) { m.fault('skimmed'); m.cool = 0.5; } m.pos = 0; } else m.pos += sw * 0.5 * dt; if (m.pos > 1) { m.fault('wrong spot'); m.pos = 0; } }
        if (rel && m.pos > 0.03) { if (Math.abs(m.pos - m.cold) <= zw / 2) { m.finish(1); return; } m.fault('wrong spot'); m.pos = 0; }
        s.prog = clamp(m.pos) * 0.9; return;
      }
      if (inp.hold && m.hT >= 1.0) { if (drift()) { m.ev('reported'); m.finish(2); } else { m.fault('false drift'); m.hT = -10; } return; }
      if (rel && held > 0 && held < 0.4) { if (!drift()) m.finish(2); else m.fault('missed drift'); }
      s.prog = clamp(Math.max(0, m.hT)) * 0.9;
    };
    m.felt = () => Math.round(m.core / 30 + 8 - 34 * Math.max(0, 1 - Math.abs(m.pos - m.cold) / (zw * 0.8)));
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, hold: f % 2 === 0 };
      if (i === 1) return { at: 1, hold: m.pos < m.cold, swing: 0.9 }; return drift() ? { at: 2, hold: true } : { at: 2, hold: f % 2 === 0 }; };
    m.bad = (f = 0) => { const i = m.next; if (i === 0) return { at: 0, hold: f % 2 === 0 }; return { at: i, hold: true, swing: 2.6 }; };
    m.view = () => ({ flow: m.flow, core: m.core, cold: +m.cold.toFixed(3) });
    m.panel = (i) => i === 0 ? { label: 'Flow gauge', value: m.read ? `${m.flow} % of normal` : 'tap E to read', bar: m.read ? m.flow / 110 : 0 }
      : i === 1 ? { label: 'Hand on pipe', value: m.pos > 0 ? `${m.felt()} °C under the palm` : 'hold E, sweep slowly', bar: clamp(m.pos) }
      : { label: `Flow ${m.flow} % · core ${m.core} K`, value: m.hT > 0 ? 'holding: report drift' : 'tap sign · hold report', bar: clamp(Math.max(0, m.hT)), band: [0.97, 1] };
    m.prompt = (i) => i === 0 ? 'Tap [E] to read the manifold flow gauge' : i === 1 ? 'Hold [E] and sweep your view slowly along the pipe; let go where it turns cold' : 'Flow under 90 % of normal: hold [E] to report drift. Otherwise tap [E] to sign';
    return m;
  },
});
