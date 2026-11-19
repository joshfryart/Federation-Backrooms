// Counsellor: fitness-for-duty review. Three stations. At the biobed, sweep the penlight across the crewman's eyes by turning the view slowly
// one way then back (two sweeps; whip it across and you dazzle them). At the grip dynamometer, hold E while they squeeze and keep holding until
// the reading peaks, then let go to record it. At the review sheet, tap E to flip the verdict between DUTY and REST and hold E to co-sign.
// Grip under 40 % of baseline, or sluggish pupils, means REST: clearing an impaired officer is the failure that matters.
import { define, machine, room, rf, pick, clamp } from './kit.js';

const WHO = ['Lt. Okonjo', 'Ensign Vasquez', 'Lt. Cmdr. Ilse', 'Ensign Park', 'Chief Abara', 'Lt. Fenn'];
export default define({
  job: { billet: 'counsel', label: 'Fitness-for-duty review', type: 'loop' },
  title: 'Penlight, grip and co-sign review', dept: 'medical', host: 'room', siteName: 'Station', verb: 'Review', item: 'flashlight',
  how: 'Sweep the penlight slowly across their eyes and back, hold E through the grip squeeze until it peaks, then at the sheet tap E to choose DUTY or REST and hold E to co-sign.',
  keys: ['turn slowly: penlight sweep', 'E hold: grip test / sign', 'E tap: flip verdict'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'assess and co-sign', input: 'e-tap+e-hold+swing', win: 'pupils and grip measured against the baseline card and the right duty or rest verdict co-signed',
    fail: 'dazzling the eyes with a fast sweep, recording grip before the peak, or clearing an officer whose grip or pupils have dropped',
    rule: 'Turn the view at a slow steady speed for two opposite sweeps; hold E till the grip shows PEAK then release; tap E flips DUTY / REST, hold E 1 s signs. Grip < 40 % or SLUGGISH = REST.' },
  rush: 'Asked "you feeling all right?" and signed them back on.',
  captions: { dazzled: 'crewman flinches', 'no reading': 'dynamometer beeps', 'cleared impaired': 'physician objects', 'benched fit officer': 'physician raises an eyebrow' },
  says: { dazzled: 'Too fast — you flashed the light straight in their eyes. Sweep slowly.', 'no reading': 'You let go before the grip peaked.', 'cleared impaired': 'Their readings say rest — you cleared an impaired officer.', 'benched fit officer': 'Their readings are fine — no grounds to stand them down.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Biobed — pupils', prop: 'biobed' }, { name: 'Grip dynamometer', prop: 'exam_couch' }, { name: 'Review sheet', prop: 'nursestation' }]), r = m.rnd;
    const kind = pick(r, ['fit', 'grip', 'eyes']), fast = m.calm ? 2.6 : 2.2;
    m.who = pick(r, WHO); m.sluggish = kind === 'eyes'; m.peak = kind === 'grip' ? rf(r, 0.22, 0.36) : rf(r, 0.55, 0.92); m.rest = kind !== 'fit';
    m.sw = { dir: r() < 0.5 ? 1 : -1, acc: 0, n: 0 }; m.gr = { v: 0, top: false, rec: null }; m.sheet = { v: 'DUTY', held: 0 };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) {
        const w = inp.swing || 0, sp = Math.abs(w);
        if (sp > fast) { m.fault('dazzled'); m.sw.acc = 0; return; }
        if (sp > 0.25 && Math.sign(w) === m.sw.dir) { m.sw.acc += sp * dt; if (m.sw.acc >= 0.8) { m.sw.n++; m.sw.acc = 0; m.sw.dir = -m.sw.dir; if (m.sw.n >= 2) m.finish(0); } }
        s.prog = s.done ? 1 : (m.sw.n + m.sw.acc / 0.8) / 2 * 0.9; return;
      }
      if (i === 1) {
        const g = m.gr; if (inp.hold) { if (!g.top) { g.v = Math.min(m.peak, g.v + 0.45 * dt); if (g.v >= m.peak) g.top = true; } else g.v = Math.max(0, g.v - 0.15 * dt); }
        if (rel) { if (g.top) { g.rec = m.peak; m.finish(1); return; } if (g.v > 0.02) m.fault('no reading'); g.v = 0; }
        s.prog = s.done ? 1 : g.v / Math.max(m.peak, 0.01) * 0.9; return;
      }
      const h = m.sheet; if (inp.hold) { h.held += dt; if (h.held >= 1 && h.held < 50) { if ((h.v === 'REST') !== m.rest) { m.fault(m.rest ? 'cleared impaired' : 'benched fit officer'); h.held = 99; } else { m.finish(2); return; } } }
      if (rel) { if (h.held > 0 && h.held < 0.4) h.v = h.v === 'DUTY' ? 'REST' : 'DUTY'; h.held = 0; }
      s.prog = s.done ? 1 : Math.min(1, h.held) * 0.9;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, swing: 0.9 * m.sw.dir };
      if (i === 1) return { at: 1, hold: !m.gr.top }; const want = m.rest ? 'REST' : 'DUTY'; return m.sheet.v !== want ? { at: 2, hold: f % 8 < 3 } : { at: 2, hold: true }; };
    m.bad = (f = 0) => { const i = m.next; if (i === 0) return { at: 0, swing: 4 }; if (i === 1) return { at: 1, hold: f % 20 < 8 }; return { at: 2, hold: true }; };
    m.view = () => ({ who: m.who, kind, peak: +m.peak.toFixed(2) });
    m.panel = (i) => i === 0 ? { label: m.sw.n >= 2 ? (m.sluggish ? 'SLUGGISH' : 'BRISK') : 'Penlight sweep', value: `${m.sw.n} / 2 ${m.sw.dir > 0 ? '◀' : '▶'}`, bar: (m.sw.n + m.sw.acc / 0.8) / 2 }
      : i === 1 ? { label: m.gr.top ? 'PEAK' : 'Grip vs baseline', value: `${Math.round(m.gr.v * 100)} % (pupils ${m.sluggish ? 'SLUGGISH' : 'BRISK'})`, bar: m.gr.v, band: [0, 0.4] }
      : i === 2 ? { label: `Verdict: ${m.sheet.v}`, value: `grip ${Math.round((m.gr.rec ?? 0) * 100)} % · pupils ${m.sluggish ? 'SLUGGISH' : 'BRISK'}`, bar: Math.min(1, m.sheet.held) } : null;
    m.prompt = (i) => i === 0 ? `Turn the view slowly ${m.sw.dir > 0 ? 'left' : 'right'} to sweep the penlight across ${m.who}'s eyes` : i === 1 ? (m.gr.top ? 'Peak reached — let go of [E] to record it' : 'Hold [E] while they squeeze; wait for the peak')
      : 'Tap [E] to flip DUTY / REST (grip under 40 % or sluggish pupils = REST); hold [E] to co-sign';
    return m;
  },
});
