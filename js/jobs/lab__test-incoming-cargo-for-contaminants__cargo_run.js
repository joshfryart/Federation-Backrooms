// Lab technician, cargo run: test incoming cargo for contaminants. At each crate item, hold E and draw the swab across its outer surface in ONE
// unbroken stroke (turn your view steadily one way); stopping or doubling back smudges the swab and it is redone. Let go: the swab goes into
// the field reader and its needle swings, then settles. Only once it has settled: a quick tap of E tags the item clear; a long hold seals the
// item in a bag. Tagging before the needle settles, or the wrong tag, is a fault.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'lab', label: 'Test incoming cargo for contaminants', type: 'task:cargo_run' },
  title: 'Single-stroke swab, settle, tag', dept: 'sciences', host: 'room', siteName: 'Item', verb: 'Swab',
  how: 'Hold E and turn steadily one way to draw one unbroken swab stroke, then let go. Wait for the reader needle to settle: low needle, tap E (clear); high needle, hold E (seal it).',
  keys: ['E hold + steady turn: one stroke', 'wait for the needle', 'E tap: clear · E hold: seal'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'stroke then tag', input: 'e-hold+swing+e-tap', win: 'every crate item swabbed in one unbroken stroke and tagged clear or sealed from the settled reader needle',
    fail: 'breaking or doubling back the swab stroke, tagging while the needle still swings, or clearing a contaminated item',
    rule: 'With E held, turn one way without pausing until the stroke bar fills. Release. When the needle reads SETTLED, a short tap is CLEAR and a one-second hold is SEAL; the red zone means seal.' },
  rush: 'Swabbed the top crate and waved the rest through.',
  captions: { smudged: 'swab smudged', premature: 'reader beeps', 'wrong tag': 'reader alarm' },
  says: { smudged: 'The stroke broke: fresh swab, one steady pass.', premature: 'The needle had not settled.', 'wrong tag': 'Wrong tag for that reading.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crate 1 item', prop: 'crate' }, { name: 'Crate 2 item', prop: 'pallet_loaded' }, { name: 'Crate 3 item', prop: 'crate' }]), r = m.rnd;
    const settleT = m.calm ? 1.4 : 1.8, sealT = 0.9, hot = new Set([ri(r, 0, 2)]); if (r() < 0.4) hot.add(ri(r, 0, 2));
    m.items = m.sites.map((_, i) => ({ hot: hot.has(i), val: hot.has(i) ? rf(r, 0.65, 0.9) : rf(r, 0.1, 0.35), amp: rf(r, 0.25, 0.45), stroke: 0, dir: 0, phase: 'swab', rt: 0, hd: 0, ph: rf(r, 0, 6) }));
    m.needle = (it) => clamp(it.val + it.amp * Math.exp(-it.rt * 2.2) * Math.sin(it.rt * 11 + it.ph) * (it.rt < settleT ? 1 : 0));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, it = m.items[i], sw = inp.swing || 0;
      if (it.phase === 'swab') {
        if (inp.hold) {
          if (Math.abs(sw) > 0.5 && (it.dir === 0 || Math.sign(sw) === it.dir)) { it.dir = Math.sign(sw); it.stroke = clamp(it.stroke + dt * 0.8); }
          else if (it.stroke > 0.05) { m.fault('smudged'); it.stroke = 0; it.dir = 0; }
          if (it.stroke >= 1) { it.phase = 'wait'; }
        } else if (rel && it.stroke > 0) { m.fault('smudged'); it.stroke = 0; it.dir = 0; }
      } else if (it.phase === 'wait') { if (!inp.hold) { it.phase = 'read'; it.rt = 0; } }
      else {
        it.rt += dt;
        if (inp.hold) { if (it.rt < settleT) { m.fault('premature'); it.rt = 0; it.hd = 0; } else { it.hd += dt; if (it.hd >= sealT) { if (it.hot) { m.ev('seal', { site: i }); m.finish(i); return; } m.fault('wrong tag'); it.hd = -99; } } }
        else if (rel) { if (it.hd > 0 && it.hd < 0.4) { if (!it.hot) { m.ev('clear', { site: i }); m.finish(i); return; } m.fault('wrong tag'); } it.hd = 0; }
      }
      s.prog = s.done ? 1 : it.phase === 'swab' ? it.stroke * 0.5 : it.phase === 'wait' ? 0.5 : 0.5 + clamp(it.rt / settleT) * 0.4;
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const it = m.items[i];
      if (it.phase === 'swab') return { at: i, hold: true, swing: 1.4 }; if (it.phase === 'wait') return { at: i, hold: false };
      if (it.rt < settleT + 0.1) return { at: i, hold: false };
      return it.hot ? { at: i, hold: true } : { at: i, hold: f % 12 < 3 };
    };
    m.bad = (f = 0) => ({ at: m.next, hold: true, swing: f % 10 < 5 ? 1.4 : -1.4 });
    m.view = () => ({ it: m.items.map(x => [x.hot, +x.val.toFixed(2)]) });
    m.panel = (i) => { const it = m.items[i]; if (!it) return null; if (it.phase !== 'read') return { label: 'Swab stroke', value: `${Math.round(it.stroke * 100)} %`, bar: it.stroke }; const st = it.rt >= settleT, v = m.needle(it); return { label: st ? (v > 0.5 ? 'SETTLED: HIGH' : 'SETTLED: low') : 'Needle swinging', value: `${Math.round(v * 100)}`, bar: v, band: [0.5, 1] }; };
    m.prompt = (i) => { const it = m.items[i]; if (!it) return ''; if (it.phase === 'swab') return 'Hold [E] and turn steadily one way: one unbroken swab stroke'; if (it.phase === 'wait') return 'Let go of [E]: the swab goes in the reader'; return it.rt < settleT ? 'Wait for the needle to settle' : 'Low: tap [E] to tag clear · High (red zone): hold [E] to seal'; };
    return m;
  },
});
