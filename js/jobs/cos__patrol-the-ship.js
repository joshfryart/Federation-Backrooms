// Chief of security: patrol the ship. At each door seam hold the hand lamp on (E) and sweep it slowly along the seam: only a slow pass lights a
// section well enough to clear it; a fast swing shows nothing. A pried seam throws a glint in one section: hold the lamp still on it to confirm.
// Swinging the lamp right off the seam loses your place (a fault).
import { define, machine, room, ri } from './kit.js';

const N = 8, SPAN = 0.42, cellAt = (look) => Math.floor((look + SPAN) / (2 * SPAN) * N);
export default define({
  job: { billet: 'cos', label: 'Patrol the ship', type: 'loop' },
  title: 'Seam check by hand lamp', dept: 'security', host: 'room', item: 'flashlight', siteName: 'Seam', verb: 'Check',
  how: 'At each door seam hold E to shine the lamp and sweep your view slowly along the seam until every section is lit. If a section glints, hold the lamp still on it.',
  keys: ['E hold: lamp on', 'sweep the view slowly'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'sweep-cover', input: 'e-hold+swing', win: 'every section of every seam covered by a slow lamp pass and any glint confirmed with a steady hold',
    fail: 'swinging the lamp off the seam, so the place is lost and the seam must be started again',
    rule: 'With E held, each section of the seam clears only while the lamp moves slowly across it (fast swings show nothing). A glinting section is a pried seam: hold the lamp still on it for a second.' },
  rush: 'Walked the corridor with the lamp pointed at the floor.',
  captions: { 'lost the seam': 'lamp clicks', glint: 'metal glint' }, says: { 'lost the seam': 'Off the seam — start that seam again and keep the lamp on it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Airlock seam', prop: 'airlock_doors' }, { name: 'Cell door seam', prop: 'cellfield' }, { name: 'Cargo hatch seam', prop: 'crate' }]), r = m.rnd, slow = m.calm ? 1.3 : 0.9;
    m.seams = m.sites.map(() => ({ lit: Array(N).fill(0), glint: r() < 0.45 ? ri(r, 0, N - 1) : -1, still: 0, ok: false }));
    const clear = (z) => z.lit.every(v => v >= 0.35) && (z.glint < 0 || z.ok);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s || !inp.hold) return; const i = m.next, z = m.seams[i], look = inp.look || 0;
      if (Math.abs(look) > SPAN + 0.25) { m.fault('lost the seam'); z.lit.fill(0); z.ok = false; return; }
      const k = cellAt(look); if (k < 0 || k >= N) return; const sw = Math.abs(inp.swing || 0);
      if (sw < slow) z.lit[k] = Math.min(1, z.lit[k] + dt * 1.6);
      if (k === z.glint && z.lit[k] >= 0.35) { if (sw < 0.15) { z.still += dt; if (z.still > 1 && !z.ok) { z.ok = true; m.ev('glint', { site: i }); } } else z.still = 0; }
      s.prog = z.lit.reduce((a, v) => a + Math.min(1, v / 0.35), 0) / N * 0.9; if (clear(z)) m.finish(i);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const z = m.seams[i]; let k = z.lit.findIndex(v => v < 0.35); const still = k < 0; if (still) k = z.glint; return { at: i, hold: true, look: -SPAN + (k + 0.5) * (2 * SPAN / N), swing: still ? 0 : 0.4 }; };
    m.bad = () => ({ at: m.next, hold: true, look: 0.9, swing: 3 });
    m.view = () => ({ glints: m.seams.map(z => z.glint) });
    m.panel = (i) => { const z = m.seams[i]; return z ? { label: 'Seam lit', value: z.lit.map((v, k) => k === z.glint && v >= 0.35 ? (z.ok ? '✶' : '!') : v >= 0.35 ? '■' : '□').join(''), bar: z.lit.filter(v => v >= 0.35).length / N } : null; };
    m.prompt = (i) => { const z = m.seams[i]; if (!z) return ''; return z.glint >= 0 && z.lit[z.glint] >= 0.35 && !z.ok ? 'A glint! Hold the lamp still on it' : 'Hold [E] and sweep the lamp slowly along the seam'; };
    return m;
  },
});
