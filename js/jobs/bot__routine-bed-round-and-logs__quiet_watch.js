// Botanist, quiet watch: routine bed round and logs. At each tray, sweep your gaze along its whole length, end to end. Somewhere on some trays
// there is a small change (a brown leaf edge, a fungal bloom) that only shows on the panel while your aim is right over it. Log it with a tap of
// E while aimed at it, so the note names the exact spot. A tray with nothing on it is ticked with E only after the whole length was swept.
// Ticking a tray you have not fully swept, ticking past a change, or logging a spot where nothing is are all faults.
import { define, machine, room, rf, ri, pick, clamp } from './kit.js';

const MARKS = ['brown leaf edge', 'grey fungal bloom', 'wilting stem', 'pale new growth'];
export default define({
  job: { billet: 'bot', label: 'Routine bed round and logs', type: 'task:quiet_watch' },
  title: 'Tray sweep and exact log', dept: 'sciences', host: 'room', item: 'padd', siteName: 'Tray', verb: 'Log',
  how: 'Sweep your view along each tray from end to end. If the panel shows a change under your aim, tap E right there to log it; if the whole tray is clean, tap E to tick it.',
  keys: ['look along the tray: sweep', 'E tap: log the spot / tick the tray'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'sweep and log', input: 'e-tap+look', win: 'every tray swept end to end, each small change logged at its exact spot, clean trays ticked',
    fail: 'ticking a tray before sweeping all of it, ticking past a change, or a vague note logged off the spot',
    rule: 'Turn your view slowly across the tray: the coverage bar fills. A change shows only while your aim is over it; tap E there. Clean tray: tap E once coverage is full.' },
  rush: 'Ticked the whole column of trays from the doorway.',
  captions: { skipped: 'slate flags a gap', missed: 'next shift finds the bloom', vague: 'note smudged' },
  says: { skipped: 'You ticked that tray without looking along all of it. Sweep end to end first.', missed: 'There was a change on that tray and you ticked it clean.', vague: 'Nothing there: a note must name the exact spot.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Tray 1', prop: 'growbed' }, { name: 'Tray 2', prop: 'growbed' }, { name: 'Tray 3', prop: 'plant' }, { name: 'Tray 4', prop: 'growbed' }]), r = m.rnd;
    const W = 0.42, tol = m.calm ? 0.09 : 0.06, cells = 12, n = ri(r, 1, 2);
    const hit = new Set(); while (hit.size < n) hit.add(ri(r, 0, 3));
    m.trays = m.sites.map((_, i) => ({ spot: hit.has(i) ? rf(r, -0.34, 0.34) : null, what: pick(r, MARKS), seen: new Array(cells).fill(false), dir: 1 }));
    const cov = (p) => p.seen.filter(Boolean).length / cells, cell = (l) => Math.floor(clamp((l + W) / (2 * W), 0, 0.999) * cells);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, p = m.trays[i], l = inp.look || 0; m.lastLook = l;
      if (Math.abs(l) <= W) p.seen[cell(l)] = true;
      if (inp.press) { const on = p.spot != null && Math.abs(l - p.spot) <= tol;
        if (on) { m.ev('logged', { site: i }); m.finish(i); return; }
        if (cov(p) < 1) m.fault(Math.abs(l) <= W && p.spot != null && cov(p) > 0.9 ? 'vague' : 'skipped');
        else if (p.spot != null) m.fault('missed'); else { m.finish(i); return; } }
      s.prog = clamp(cov(p) * 0.9, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.trays[i]; const k = p.seen.findIndex(x => !x);
      const tgt = k < 0 ? 0 : -W + (k + 0.5) * (2 * W / cells);
      if (p.spot != null && p.seen[cell(p.spot)]) return { at: i, look: p.spot, press: true };
      return k < 0 ? { at: i, look: 0, press: true } : { at: i, look: tgt }; };
    m.bad = () => ({ at: m.next, look: 0, press: true });
    m.view = () => ({ trays: m.trays.map(p => (p.spot == null ? null : [+p.spot.toFixed(3), p.what])) });
    m.panel = (i) => { const p = m.trays[i]; if (!p) return null; const here = p.spot != null && Math.abs((m.lastLook ?? 9) - p.spot) <= tol; return { label: here ? `CHANGE HERE: ${p.what}` : 'Swept', value: `${Math.round(cov(p) * 100)} %`, bar: cov(p), band: [0.99, 1] }; };
    m.prompt = (i) => { const p = m.trays[i]; if (!p) return '';
      return p.spot != null && p.seen[cell(p.spot)] ? `Change seen: ${p.what}. Aim right at it and tap [E] to log the spot` : cov(p) < 1 ? `Look slowly along the whole tray (${Math.round(cov(p) * 100)} % swept)` : 'Tray clean end to end: tap [E] to tick it'; };
    return m;
  },
});
