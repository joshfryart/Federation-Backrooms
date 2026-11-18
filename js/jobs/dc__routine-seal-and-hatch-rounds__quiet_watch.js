// Damage control: routine seal and hatch rounds on a quiet watch. Every door lamp shows green, so the ear does the work: hold E to put the
// listening probe on the seam and sweep it along from the left corner. The hiss meter climbs as the probe nears a faint leak. A quick tap of
// E (press and let go) tags the door at the probe's spot. A door that stays at baseline the whole seam is passed by letting go at the end.
// Tagging where there is no hiss is a fault; sweeping the whole seam past a hiss and letting go untagged is a fault.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const A = -0.4, B = 0.4, BINS = 8;
export default define({
  job: { billet: 'dc', label: 'Routine seal and hatch rounds', type: 'task:quiet_watch' },
  title: 'Listening probe along the seam', dept: 'engineering', host: 'room', siteName: 'Door seam', verb: 'Listen',
  how: 'Hold E to listen with the probe and sweep along the seam. If the hiss meter climbs above baseline, find its peak and tap E there to tag the door. If the whole seam stays at baseline, let go at the end to pass it.',
  keys: ['E hold + aim: listen along the seam', 'E quick tap: tag at the probe'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'pinpoint the hiss', input: 'e-hold+e-tap+look', win: 'every green-lamped door listened along its whole seam, and each faint hiss tagged at its loudest point',
    fail: 'passing a hissing seam because the lamp shows green, or tagging a quiet stretch of seal',
    rule: 'With E held, the hiss meter reads louder the closer the probe is to a leak. A quick tap tags at the probe; tag at the peak. A seam that reads baseline from corner to corner passes when you let go at the end.' },
  rush: 'Walked past the doors checking the lamps were green.',
  captions: { 'false tag': 'tag tears off', 'passed a hiss': 'faint hiss', hiss: 'hiss rises' },
  says: { 'false tag': 'Nothing hissing there — tag only where the meter peaks.', 'passed a hiss': 'There was a hiss on that seam. Sweep back, find the peak and tap E to tag it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Port cargo door', prop: 'airlock_doors' }, { name: 'Lift hatch', prop: 'cargo_pad' }, { name: 'Stores hatch', prop: 'shelving' }]), r = m.rnd;
    const tol = m.calm ? 0.09 : 0.06, leaky = new Set(shuffle(r, [0, 1, 2]).slice(0, r() < 0.5 ? 1 : 2));
    m.d = m.sites.map((_, i) => ({ leak: leaky.has(i), src: rf(r, -0.2, 0.3), base: Math.round(rf(r, 12, 18)), lk: A, held: 0, cov: new Array(BINS).fill(false) }));
    m.level = (d, look) => d.base + (d.leak ? 30 * clamp(1 - Math.abs(look - d.src) / 0.25) : 0);
    const full = (d) => d.cov.every(Boolean);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, d = m.d[i], look = inp.look || 0;
      if (inp.hold) { d.held += dt; d.lk = look; const b = Math.floor((look - A) / (B - A) * BINS); if (b >= 0 && b < BINS) d.cov[b] = true; else if (look >= B) d.cov[BINS - 1] = true; }
      if (rel) {
        const tap = d.held < 0.25; d.held = 0;
        if (tap) { if (d.leak && Math.abs(look - d.src) < tol) { m.ev('tagged', { site: i }); m.finish(i); return; } m.fault('false tag'); return; }
        if (full(d)) { if (d.leak) { m.fault('passed a hiss'); d.cov.fill(false); return; } m.finish(i); return; }
      }
      s.prog = s.done ? 1 : d.cov.filter(Boolean).length / BINS * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.d[i];
      if (!d.leak) return full(d) ? { at: i, hold: false, look: d.lk } : { at: i, hold: true, look: Math.min(B, d.lk + 0.015) };
      if (d.lk < d.src - 0.01) return { at: i, hold: true, look: d.lk + 0.015 };
      return m.prev ? { at: i, hold: false, look: d.src } : { at: i, press: true, hold: true, look: d.src }; };
    m.bad = (f = 0) => { const t = f % 6 === 0; return { at: m.next, press: t, hold: t, look: A }; };
    m.view = () => ({ d: m.d.map(d => [d.leak, +d.src.toFixed(2), d.base]) });
    m.panel = (i) => { const d = m.d[i]; if (!d) return null; const lv = m.level(d, d.lk), on = d.held > 0;
      return { label: `Lamp green · hiss ${on ? Math.round(lv) + ' dB' : '— (hold E)'} · baseline ${d.base}`, value: `seam ${d.cov.filter(Boolean).length}/${BINS}`, bar: on ? clamp(lv / 50) : 0, band: [d.base / 50, (d.base + 4) / 50] }; };
    m.prompt = (i) => { const d = m.d[i]; if (!d) return ''; return full(d) && !d.leak ? 'Whole seam at baseline — let go of [E] to pass it' : 'Hold [E] and sweep the probe along the seam; quick-tap [E] at a hiss peak to tag'; };
    return m;
  },
});
