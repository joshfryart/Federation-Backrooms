// CFO: deck walk-round on a quiet watch. At each pad thump the shuttle's landing strut with the flat of the hand (tap E) and listen. A sound
// strut goes dead quickly; a loose one rattles on. Each pad needs three clean thumps, and a thump only tells you anything once the last one has
// died away: thump again while it is still ringing and the notes run together (a muddled check).
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Deck walk-round', type: 'task:quiet_watch' },
  title: 'Landing strut thump and listen', dept: 'flight', host: 'room', siteName: 'Strut', verb: 'Thump',
  how: 'At each pad tap E to thump the landing strut, then listen until the ring has died away before thumping again. Three clean thumps per strut.',
  keys: ['E tap: thump the strut', 'wait for the ring to die'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'thump-listen', input: 'e-tap', win: 'three clean thumps heard out on each landing strut, so every loose strut is caught by its long rattle',
    fail: 'thumping again while the strut still rings, so the notes run together and a rattle goes unheard',
    rule: 'Tap E to thump. The ring meter jumps and dies away: fast on a sound strut, slowly on a loose one. Thump again only once it is under the quiet line.' },
  rush: 'Slapped each strut once in passing and marked the pads ready.',
  captions: { muddled: 'clanging rattle' }, says: { muddled: 'Muddled — it was still ringing. Let the strut go quiet before the next thump.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pad 1 strut', prop: 'shuttle' }, { name: 'Pad 2 strut', prop: 'pad' }, { name: 'Pad 3 strut', prop: 'shuttle' }, { name: 'Pad 4 strut', prop: 'workpod' }]), r = m.rnd;
    const quiet = m.calm ? 0.3 : 0.22, loose = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, 1 + Math.floor(r() * 2)));
    m.struts = m.sites.map((_, i) => ({ loose: loose.has(i), k: loose.has(i) ? rf(r, 1.3, 1.8) : rf(r, 2.8, 4.2), ring: 0, n: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; for (const k of m.struts) k.ring *= Math.exp(-k.k * dt);
      const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, k = m.struts[i];
      if (inp.press) { if (k.ring > quiet) { m.fault('muddled'); k.n = Math.max(0, k.n - 1); } else k.n++; k.ring = 1; m.ev('thump', { site: i }); }
      if (k.n >= 3 && k.ring < quiet) { m.ev('heard', { site: i, loose: k.loose }); m.finish(i); return; }
      s.prog = s.done ? 1 : clamp(k.n / 3 * 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.struts[i]; return { at: i, press: k.ring < quiet * 0.8 && f % 2 === 0, hold: false }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 6 === 0 });
    m.view = () => ({ s: m.struts.map(k => [k.loose, +k.k.toFixed(2)]) });
    m.panel = (i) => { const k = m.struts[i]; return k ? { label: k.n >= 1 && k.loose ? 'RATTLES' : 'Ring', value: `thumps ${k.n} / 3`, bar: clamp(k.ring), band: [0, quiet] } : null; };
    m.prompt = (i) => { const k = m.struts[i]; return !k ? '' : k.ring > quiet ? 'Listen — wait for the ring to die away' : 'Tap [E] to thump the strut'; };
    return m;
  },
});
