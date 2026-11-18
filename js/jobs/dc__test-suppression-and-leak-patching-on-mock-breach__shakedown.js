// Damage control: test suppression and leak patching on the mock breach. At the breach plate hold E to run foam and aim along the breach
// outline: foam builds on the strip you aim at and slowly slumps, fastest at one leaky corner. Letting go of E declares the coverage, so only
// let go when every strip is at or over the line; letting go with a strip under it means foam leaking at a corner. Too long on one strip runs
// off. Then at the patch, hold E with the view dead on the plate until the clamp gauge reads full; looking away while pressing slips it.
import { define, machine, room, rf, ri, clamp } from './kit.js';

const N = 6, A = -0.35, W = 0.7 / N;
export default define({
  job: { billet: 'dc', label: 'Test suppression and leak patching on mock breach', type: 'task:shakedown' },
  title: 'Mock breach foam-and-patch test', dept: 'engineering', host: 'room', item: 'extinguisher', siteName: 'Breach', verb: 'Foam',
  how: 'Hold E to foam and aim along the breach until every strip is over the line (foam slumps, one corner fastest), then let go. At the patch hold E with the view steady on the plate until the clamp gauge is full.',
  keys: ['E hold + aim: foam a strip', 'let go: declare coverage', 'E hold, view still: press the patch'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'build coverage', input: 'e-hold+look', win: 'every strip of the breach outline built up over the foam line before release, then the patch pressed and clamped to full',
    fail: 'declaring coverage with foam leaking from a slumped corner, flooding one strip until it runs off, or slipping the patch',
    rule: 'Foam accumulates on the strip you aim at while E is held and slumps away over time, one corner fast. Release only with every strip over the line; over the top mark runs off. Then hold E aimed at the plate centre until clamped.' },
  rush: 'Sprayed the plate white and slapped the patch on.',
  captions: { 'corner leaking': 'foam drips', 'foam runoff': 'foam slops over', 'patch slipped': 'patch slides' },
  says: { 'corner leaking': 'Foam is leaking at a corner — a strip was under the line when you let go.', 'foam runoff': 'Too much on that strip — it is running off. Keep moving.', 'patch slipped': 'Keep the view on the plate while you press the patch.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Mock breach plate', prop: 'heatexch' }, { name: 'Sealant patch', prop: 'pumpskid' }]), r = m.rnd;
    const corner = ri(r, 0, 1) ? N - 1 : 0, fill = m.calm ? 1.6 : 2.0, over = 1.9, tol = m.calm ? 0.16 : 0.12;
    m.cells = Array.from({ length: N }, (_, k) => ({ v: 0, slump: k === corner ? rf(r, 0.25, 0.35) : rf(r, 0.04, 0.12) })); m.press = 0; m.corner = corner;
    const cellAt = (look) => { const k = Math.floor((look - A) / W); return k >= 0 && k < N ? k : -1; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const look = inp.look || 0;
      if (m.next === 0) {
        for (const c of m.cells) c.v = Math.max(0, c.v - c.slump * dt);
        if (inp.hold) { const k = cellAt(look); if (k >= 0) { const c = m.cells[k]; c.v += fill * dt; if (c.v > over) { m.fault('foam runoff'); c.v = 1.2; } } }
        if (rel && m.cells.some(c => c.v > 0)) { if (m.cells.every(c => c.v >= 1)) { m.finish(0); return; } m.fault('corner leaking'); }
        s.prog = clamp(m.cells.reduce((a, c) => a + Math.min(1, c.v), 0) / N * 0.9, 0, 0.95); return;
      }
      if (inp.hold) { if (Math.abs(look) > tol) { m.fault('patch slipped'); m.press = 0; return; } m.press += dt / 2.2; if (m.press >= 1) { m.finish(1); return; } } else m.press = 0;
      s.prog = clamp(m.press * 0.95, 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 1) return { at: 1, hold: true, look: 0 };
      if (m.cells.every(c => c.v >= 1.03)) return { at: 0, hold: false, look: 0 };
      let k = 0; m.cells.forEach((c, j) => { if (c.v < m.cells[k].v) k = j; }); return { at: 0, hold: true, look: A + (k + 0.5) * W }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 30 < 20, look: m.next === 0 ? 0.01 : 0.4 });
    m.view = () => ({ s: m.cells.map(c => +c.slump.toFixed(3)), corner });
    m.panel = (i) => { if (i === 1) return { label: 'Patch clamp gauge', value: `${Math.round(m.press * 100)} %`, bar: m.press, band: [0.99, 1] };
      const lo = Math.min(...m.cells.map(c => c.v)); return { label: 'Foam strips ' + m.cells.map(c => c.v >= 1 ? '█' : c.v > 0.5 ? '▄' : '▁').join(''), value: lo >= 1 ? 'all over the line' : 'under the line', bar: clamp(lo), band: [0.99, 1] }; };
    m.prompt = (i) => i === 1 ? 'Hold [E] with the view on the plate to press and clamp the patch' : 'Hold [E] and aim along the breach; let go only when every strip is over the line';
    return m;
  },
});
