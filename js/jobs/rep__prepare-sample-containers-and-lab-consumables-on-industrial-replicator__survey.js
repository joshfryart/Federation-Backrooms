// Replicator tech: prepare sample containers and lab consumables. A container may carry a stray filament: hold E about half a second and let go to pick
// it off first. Then mash E in quick taps to press the lid down; the press force fades if you pause, and the lid clicks when it fills.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Prepare sample containers and lab consumables on industrial replicator', type: 'task:survey' },
  title: 'Pick filament, mash the lid', dept: 'services', host: 'room', siteName: 'Container', verb: 'Seal',
  how: 'If the panel says STRAY, hold E half a second and let go to pick the filament. Then tap E quickly, about five times a second, until the press force fills and the lid clicks.',
  keys: ['E hold: pick filament', 'E rapid taps: press lid'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'mash to click', input: 'e-tap+e-hold', win: 'three containers each cleared of stray filament then lid pressed with quick taps until the force bar clicks full',
    fail: 'pressing a lid down over stray filament, or tapping so slowly that the force bar never fills',
    rule: 'Quick taps raise the press force and it drains between taps. A long hold clears filament. Tapping with filament still on is a fault.' },
  rush: 'Pressed each lid down once and stacked the containers in the crate.',
  captions: { 'lid on filament': 'lid crackles on filament', 'weak press': 'lid pops back up' }, says: { 'lid on filament': 'Filament still on the rim: hold E to pick it off before pressing.', 'weak press': 'The lid popped back. Tap faster.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Container 1', prop: 'shelving' }, { name: 'Container 2', prop: 'locker' }, { name: 'Container 3', prop: 'shelving' }]), r = m.rnd, gain = m.calm ? 0.36 : 0.28;
    const st = new Set(shuffle(r, [0, 1, 2]).slice(0, 1 + (r() < 0.5 ? 1 : 0)));
    m.cs = m.sites.map((_, i) => ({ stray: st.has(i), f: 0, lax: 0 })); m.hh = 0; m.idle = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const rel = m.released(inp), s = m.cur(inp); if (!s) { m.hh = 0; return; } const c = m.cs[m.next], i = m.next;
      if (inp.hold) m.hh += dt; c.f = clamp(c.f - 0.7 * dt);
      if (rel) { const h = m.hh; m.hh = 0; if (h < 0.25) { if (c.stray) m.fault('lid on filament'); else { c.f = clamp(c.f + gain); m.idle = 0; if (c.f >= 1) { m.finish(i); return; } } } else if (h >= 0.5 && c.stray) c.stray = false; }
      if (!c.stray && c.f > 0 && c.f < 1) { m.idle += dt; if (m.idle > 1.8 && c.f < 0.05) { m.idle = 0; m.fault('weak press'); } } if (c.f === 0) m.idle += 0;
      s.prog = c.f * 0.9;
    };
    m.hint = (f = 0) => { const c = m.cs[m.next]; if (!c) return { at: -1 }; return c.stray ? { at: m.next, hold: m.hh < 0.55 } : { at: m.next, hold: f % 2 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 12 === 0 });
    m.view = () => ({ cs: m.cs.map(c => c.stray) });
    m.panel = (i) => { const c = m.cs[i]; return c ? { label: c.stray ? 'STRAY' : 'Press', value: c.stray ? 'hold E to pick off' : `${Math.round(c.f * 100)} %`, bar: c.stray ? clamp(m.hh / 0.5) : c.f, band: c.stray ? [0.98, 1] : [0.9, 1] } : null; };
    m.prompt = (i) => m.cs[i] && m.cs[i].stray ? 'Hold [E] half a second, then let go, to pick off the filament' : 'Tap [E] quickly to press the lid down until it clicks';
    return m;
  },
});
