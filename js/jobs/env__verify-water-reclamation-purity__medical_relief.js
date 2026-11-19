// Environmental tech: verify water reclamation purity (medical relief). Draw a sample at the plant tap (hold E), hold the vial up to the
// inspection light (look toward the light and hold E): a cloudy sample is dumped and redrawn. At the conductivity meter keep the probe in the
// drop (hold E) while the needle creeps up; only let go once the SETTLED lamp lights. Lifting the probe early logs a falsely low figure.
import { define, machine, room, rf, pick, clamp } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Verify water reclamation purity', type: 'task:medical_relief' },
  title: 'Conductivity probe held to settle', dept: 'engineering', host: 'room', siteName: 'Step', verb: 'Test',
  how: 'Hold E at the tap to fill the vial. Look toward the inspection light and hold E to check the sample is clear (cloudy ones are redrawn). At the meter hold E to keep the probe in, and let go only after the needle settles.',
  keys: ['E hold: fill / inspect / probe', 'look: aim the vial at the light', 'let go once SETTLED'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'settle and read', input: 'e-hold+look', win: 'a clear water sample drawn, checked against the light and read on the conductivity meter only after the needle settled',
    fail: 'lifting the probe while the needle is still creeping so the purity figure reads falsely low',
    rule: 'The meter needle creeps toward the true conductivity and slows down; the lamp says SETTLED when it has stopped. Lift (let go of E) before that and the reading is thrown out.' },
  rush: 'Filled a vial, glanced at the meter and logged the water pure.',
  captions: { 'read too soon': 'meter beeps low' }, says: { 'read too soon': 'Read too soon: the needle was still creeping, so the figure was low. Probe again and wait for SETTLED.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Plant water tap', prop: 'pumpskid' }, { name: 'Inspection light', prop: 'workbench' }, { name: 'Conductivity meter', prop: 'labbench' }]), r = m.rnd;
    m.cloudy = r() < 0.5; m.light = pick(r, [0.35, -0.35]); m.tau = rf(r, 0.5, 0.75); m.cond = rf(r, 0.2, 0.4);
    m.fill = 0; m.see = 0; m.pt = 0; m.draws = 1; const tol = m.calm ? 0.2 : 0.14;
    m.needle = () => m.cond * (1 - Math.exp(-m.pt / m.tau)); m.settled = () => m.pt > m.tau * 3.6;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); const rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.hold) m.fill += dt / 1.0; if (m.fill >= 1) m.finish(0); s.prog = clamp(m.fill); return; }
      if (i === 1) {
        if (inp.hold && Math.abs((inp.look || 0) - m.light) < tol) m.see += dt; else m.see = Math.max(0, m.see - dt);
        if (m.see >= 0.8) { if (m.cloudy) { m.cloudy = false; m.draws++; m.fill = 0; m.see = 0; for (const k of [0, 1]) { m.sites[k].done = false; m.sites[k].prog = 0; } m.next = 0; m.ev('redraw'); return; } m.finish(1); }
        s.prog = clamp(m.see / 0.8 * 0.9); return;
      }
      if (inp.hold) m.pt += dt;
      if (rel) { if (m.settled()) m.finish(2); else { m.fault('read too soon'); m.pt = 0; } }
      s.prog = s.done ? 1 : clamp(m.pt / (m.tau * 3.6) * 0.9, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, hold: true }; if (i === 1) return { at: 1, hold: true, look: m.light }; return { at: 2, hold: !m.settled() }; };
    m.bad = (f = 0) => { const i = m.next; if (i === 0) return { at: 0, hold: true }; if (i === 1) return { at: 1, hold: true, look: m.light }; return { at: 2, hold: f % 24 < 10 }; };
    m.view = () => ({ c: m.cloudy, l: m.light, tau: +m.tau.toFixed(3) });
    m.panel = (i) => {
      if (i === 0) return { label: `Sample vial ${m.draws > 1 ? '(redraw)' : ''}`, value: `${Math.round(m.fill * 100)} % full`, bar: m.fill };
      if (i === 1) return { label: `Light is to your ${m.light > 0 ? 'LEFT' : 'RIGHT'}`, value: m.see > 0.5 ? (m.cloudy ? 'CLOUDY — dump it' : 'clear') : 'hold it to the light', bar: m.see / 0.8 };
      return { label: m.settled() ? 'Needle SETTLED' : m.pt > 0 ? 'Needle creeping…' : 'Probe out', value: `${(m.needle() * 10).toFixed(2)} µS/cm · purity band under 4.5`, bar: m.needle() / 0.5 };
    };
    m.prompt = (i) => i === 0 ? 'Hold [E] to fill the vial at the tap' : i === 1 ? 'Look toward the inspection light and hold [E]' : m.settled() ? 'Settled: let go of [E] to take the reading' : 'Hold [E] to keep the probe in the drop until the needle settles';
    return m;
  },
});
