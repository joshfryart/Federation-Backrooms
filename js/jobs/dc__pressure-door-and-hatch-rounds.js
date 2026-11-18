// Damage control: pressure door and hatch rounds. At each hatch press the seal gauge head to the gasket (hold E, keep the view still) until
// the needle settles. A needle that falls away is a weeping gasket: let go at once and it is red-tagged. A needle that holds still has to be
// confirmed by feel: keep E held and trace the seal slowly from the left corner to the right. A cold line under the fingertip is a weep too:
// let go there to tag it. Skimming the trace too fast, letting go of a sound hatch half-checked or tracing on past a weep are faults.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const L0 = -0.4, L1 = 0.4;
export default define({
  job: { billet: 'dc', label: 'Pressure door and hatch rounds', type: 'loop' },
  title: 'Gasket gauge and fingertip trace', dept: 'engineering', host: 'room', item: 'tricorder_eng', siteName: 'Hatch', verb: 'Gauge',
  how: 'Hold E with the view still until the seal gauge settles. If the needle drops, let go to tag the hatch. If it holds, keep E held and trace the seal slowly left to right; let go at a cold line to tag it.',
  keys: ['E hold, view still: gauge', 'E hold + slow turn right: trace', 'let go: tag a weep'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'gauge and trace', input: 'e-hold+look+turn', win: 'every hatch gasket gauged then fingertip-traced corner to corner, each weeping gasket tagged where it weeps',
    fail: 'skimming the gasket too fast to feel a draft, signing a sound hatch half-checked, or carrying on past a dropping needle or cold line',
    rule: 'Hold E still until the needle settles; a falling needle means release to tag. A steady needle needs a slow trace of the seal from the left corner rightward with E held; release at a cold line to tag, or at the right corner if none.' },
  rush: 'Glanced at each dogging handle and logged the hatch line as tight.',
  captions: { skimmed: 'fingertip skids', 'half-checked': 'gauge clicks off', 'passed a weep': 'faint hiss' },
  says: { skimmed: 'Too fast — you cannot feel a draft at that speed. Start the trace again from the left corner.', 'half-checked': 'You let go before the check was done. Gauge it again.', 'passed a weep': 'That one is weeping — let go and tag it the moment you find it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cargo bay door', prop: 'airlock_doors' }, { name: 'Deck hatch 2', prop: 'baycontrol' }, { name: 'Deck hatch 3', prop: 'cargo_pad' }]), r = m.rnd;
    const settleT = m.calm ? 1.0 : 1.2, maxTurn = m.calm ? 1.1 : 0.9, react = m.calm ? 1.0 : 0.7;
    const kinds = shuffle(r, ['drop', 'draft', r() < 0.5 ? 'ok' : (r() < 0.5 ? 'drop' : 'draft')]);
    m.h = m.sites.map((_, i) => ({ kind: kinds[i], psi: Math.round(rf(r, 28, 34) * 10) / 10, at: rf(r, -0.2, 0.3), settle: 0, cov: L0, phase: 'gauge', warn: 0 }));
    const reset = (h) => { h.settle = 0; h.cov = L0; h.phase = 'gauge'; h.warn = 0; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, h = m.h[i], turn = inp.turn || 0, look = inp.look || 0;
      if (rel) {
        if (h.warn > 0) { m.ev('tagged', { site: i }); m.finish(i); return; }
        if (h.phase === 'trace' && h.cov >= L1 - 0.01) { m.finish(i); return; }
        if (h.settle > 0.3 || h.phase === 'trace') m.fault('half-checked'); reset(h); return;
      }
      if (!inp.hold) return;
      if (h.warn > 0) { h.warn += dt; if (h.warn > react) { m.fault('passed a weep'); h.warn = 1e-6; } }
      else if (h.phase === 'gauge') {
        if (turn > 0.6) h.settle = 0; else h.settle += dt;
        if (h.settle >= settleT) { if (h.kind === 'drop') { h.warn = 1e-6; m.ev('needle drops', { site: i }); } else h.phase = 'trace'; }
      } else {
        if (turn > maxTurn) { m.fault('skimmed'); h.cov = L0; return; }
        if (Math.abs(look - h.cov) < 0.08 && look > h.cov) h.cov = Math.min(L1, look);
        if (h.kind === 'draft' && h.cov >= h.at) { h.warn = 1e-6; m.ev('cold line', { site: i }); }
      }
      s.prog = s.done ? 1 : clamp(h.settle / settleT * 0.4 + (h.phase === 'trace' ? (h.cov - L0) / (L1 - L0) * 0.5 : 0), 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const h = m.h[i]; if (h.warn > 0) return { at: i, hold: false };
      if (h.phase === 'gauge') return { at: i, hold: true, look: L0, turn: 0 }; if (h.cov >= L1 - 0.01) return { at: i, hold: false, look: L1 };
      return { at: i, hold: true, look: h.cov + 0.012, turn: 0.36 }; };
    m.bad = () => { const i = m.next, h = m.h[i]; return { at: i, hold: true, look: h.cov + 0.03, turn: h.phase === 'trace' ? 2.4 : 0 }; };
    m.view = () => ({ h: m.h.map(h => [h.kind, h.psi, +h.at.toFixed(2)]) });
    m.panel = (i) => { const h = m.h[i]; if (!h) return null;
      if (h.warn > 0) return { label: h.phase === 'gauge' ? 'NEEDLE DROPPING' : 'COLD LINE', value: 'let go: red tag', bar: 1 };
      if (h.phase === 'gauge') return { label: 'Seal gauge settling', value: h.settle > 0.4 ? `${h.psi} psi` : '…', bar: h.settle / settleT };
      return { label: `Steady ${h.psi} psi · trace the seal`, value: `${Math.round((h.cov - L0) / (L1 - L0) * 100)} % of the edge`, bar: (h.cov - L0) / (L1 - L0) }; };
    m.prompt = (i) => { const h = m.h[i]; if (!h) return ''; if (h.warn > 0) return 'It weeps — let go of [E] now to tag it';
      return h.phase === 'gauge' ? 'Hold [E] and keep still: let the needle settle' : h.cov >= L1 - 0.01 ? 'Right corner reached — let go of [E]' : 'Keep [E] held and turn slowly right along the seal'; };
    return m;
  },
});
