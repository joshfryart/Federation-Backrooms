// Cook: scrub and sanitise the galley. Grease is pushed toward each surface's drain, never back: hold E and stroke the cloth the way the drain
// arrow points, lift it (let go) to come back. Stroking against the arrow smears the grease back (too much of it is a fault). Once a surface is
// clean, hold the sanitiser cloth still on it for the full contact time.
import { define, machine, room, pick, clamp } from './kit.js';

export default define({
  job: { billet: 'cook', label: 'Scrub and sanitise the galley', type: 'loop' },
  title: 'One-way scrub to the drain', dept: 'services', host: 'room', item: 'mop', siteName: 'Surface', verb: 'Scrub',
  how: 'At each surface hold E and sweep your view toward the drain arrow to push the grease off; let go of E to bring the cloth back. Then hold E still for the sanitiser contact time.',
  keys: ['E hold + turn toward the drain: stroke', 'let go to come back', 'E hold still: sanitise'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'one-way scrub', input: 'e-hold+swing', win: 'every surface pushed clean toward its drain and held under sanitiser for the full contact time',
    fail: 'dragging the cloth back against the drain arrow so the grease is smeared back over',
    rule: 'Only strokes toward the drain arrow (view turning that way with E held) lift grease. Turning the other way with E held smears it back. Then hold E with the view still for three seconds to sanitise.' },
  rush: 'Wiped everything in circles with the same cloth.',
  captions: { smeared: 'cloth squelches' }, says: { smeared: 'Smeared it back — lift the cloth (let go of E) on the return stroke.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Range top', prop: 'range' }, { name: 'Prep counter', prop: 'counter' }, { name: 'Servery', prop: 'servery' }]), r = m.rnd, contact = m.calm ? 2.4 : 3.0;
    m.surf = m.sites.map(() => ({ dir: pick(r, [1, -1]), grime: 1, smear: 0, san: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, u = m.surf[i], sw = inp.swing || 0;
      if (!inp.hold) { u.san = 0; return; }
      if (u.grime > 0) {
        if (Math.sign(sw) === u.dir && Math.abs(sw) > 0.6) u.grime = Math.max(0, u.grime - dt * 0.5 * Math.min(2, Math.abs(sw)));
        else if (Math.sign(sw) === -u.dir && Math.abs(sw) > 0.6) { u.grime = Math.min(1, u.grime + dt * 0.4); u.smear += dt; if (u.smear > 0.8) { m.fault('smeared'); u.smear = 0; } }
      } else if (Math.abs(sw) < 0.2) { u.san += dt; if (u.san >= contact) m.finish(i); } else u.san = 0;
      s.prog = s.done ? 1 : clamp((1 - u.grime) * 0.6 + u.san / contact * 0.35, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.surf[i]; if (u.grime > 0) { const stroke = f % 24 < 16; return { at: i, hold: stroke, swing: stroke ? 1.5 * u.dir : -1.5 * u.dir }; } return { at: i, hold: true, swing: 0 }; };
    m.bad = () => { const i = m.next, u = m.surf[i]; return { at: i, hold: true, swing: -1.5 * u.dir }; };
    m.view = () => ({ dirs: m.surf.map(u => u.dir) });
    m.panel = (i) => { const u = m.surf[i]; return u ? (u.grime > 0 ? { label: `Drain ${u.dir > 0 ? '◀ left' : 'right ▶'}`, value: `grease ${Math.round(u.grime * 100)} %`, bar: 1 - u.grime } : { label: 'Sanitiser contact', value: `${u.san.toFixed(1)} / ${contact} s`, bar: u.san / contact }) : null; };
    m.prompt = (i) => { const u = m.surf[i]; return !u ? '' : u.grime > 0 ? `Hold [E] and stroke toward the drain (${u.dir > 0 ? 'left' : 'right'}); let go to come back` : 'Hold [E] still: sanitiser contact time'; };
    return m;
  },
});
