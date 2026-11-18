// Deck crew: shuttle walkaround and FOD sweep. Loose bolts and shavings only catch the light when you hold your gaze still and look right at
// them. At each pad, scan the floor with the view held steady; when the glint meter peaks, tap E to lift the piece into the pan. When you think
// the pad is clean, hold E to call it clear. Calling a pad clear with debris still on it is a fault (it gets drawn into an engine).
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Shuttle walkaround and FOD sweep', type: 'loop' },
  title: 'FOD glint hunt on the pads', dept: 'flight', host: 'room', item: 'broom', siteName: 'Pad', verb: 'Sweep',
  how: 'At each pad look slowly across the floor and keep the view still: debris glints when you are right on it. Tap E to lift it into the pan. Hold E to call the pad clear once nothing is left.',
  keys: ['Look: scan the floor (keep still)', 'E tap: lift the piece', 'E hold: call the pad clear'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'glint hunt', input: 'e-tap+e-hold+look+turn', win: 'every hidden bolt and shaving on each pad lifted before the pad is called clear',
    fail: 'calling a pad clear while debris still lies on it, or lifting at bare floor and scattering the sweepings',
    rule: 'Debris only glints when the view is held still and aimed within a hair of it. Tap E on a glint to lift it; the pan counter climbs. Hold E for a second to call the pad clear: any piece left is FOD in an engine.' },
  rush: 'Ran the broom across the middle of each pad and called it clean.',
  captions: { 'FOD left': 'engine intake rattles', scattered: 'sweepings skitter' },
  says: { 'FOD left': 'Debris still on that pad — it would be drawn into an engine. Keep looking.', scattered: 'Nothing there — you scattered the sweepings. Lift only on a glint.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pad 1', prop: 'shuttle' }, { name: 'Pad 2', prop: 'workpod' }, { name: 'Pad 3', prop: 'maint_stand' }]), r = m.rnd;
    const tol = m.calm ? 0.07 : 0.05, still = m.calm ? 0.45 : 0.3, need = m.calm ? 0.8 : 1.0;
    m.pads = m.sites.map(() => { const n = ri(r, 2, 3), bits = []; while (bits.length < n) { const b = rf(r, -0.45, 0.45); if (bits.every(x => Math.abs(x.b - b) > 0.18)) bits.push({ b, got: false, kind: r() < 0.5 ? 'bolt' : 'shaving' }); } return { bits, call: 0, pan: 0 }; });
    const near = (p, look) => p.bits.find(x => !x.got && Math.abs(x.b - (look || 0)) < tol);
    m.glint = (p, inp) => { if ((inp.turn || 0) > still) return 0; let g = 0; for (const x of p.bits) if (!x.got) g = Math.max(g, clamp(1 - Math.abs(x.b - (inp.look || 0)) / 0.25)); return g; };
    m.last = { look: 0, turn: 0 };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, p = m.pads[i]; m.last = inp;
      if (inp.press) { const x = (inp.turn || 0) <= still ? near(p, inp.look) : null; if (x) { x.got = true; p.pan++; m.ev('lift', { site: i, kind: x.kind }); } else p.miss = true; }
      if (inp.hold) p.call += dt; else { if (rel && p.call < 0.3 && p.miss) m.fault('scattered'); p.call = 0; p.miss = false; }
      if (p.call >= need) { p.call = 0; p.miss = false; if (p.bits.some(x => !x.got)) m.fault('FOD left'); else { m.finish(i); return; } }
      s.prog = s.done ? 1 : clamp(p.pan / (p.bits.length + 1), 0, 0.9);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pads[i], x = p.bits.find(b => !b.got); return x ? { at: i, look: x.b, turn: 0, hold: f % 4 === 0, press: f % 4 === 0 } : { at: i, look: 0, turn: 0, hold: true }; };
    m.bad = () => ({ at: m.next, hold: true, look: 0, turn: 0 });
    m.view = () => ({ pads: m.pads.map(p => p.bits.map(x => +x.b.toFixed(2))) });
    m.panel = (i) => { const p = m.pads[i]; if (!p) return null; const g = m.glint(p, m.last); return { label: g > 0.85 ? 'GLINT ✦' : 'Glint', value: `pan ${p.pan}`, bar: g, band: [0.85, 1] }; };
    m.prompt = (i) => { const p = m.pads[i]; return !p ? '' : p.call > 0 ? 'Calling the pad clear… keep holding [E]' : 'Scan slowly and hold still: tap [E] on a glint, hold [E] to call the pad clear'; };
    return m;
  },
});
