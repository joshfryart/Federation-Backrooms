// Botanist: collect alien spores and biological samples. At each sample point: tap E to uncap a tube, hold E to work the swab over the residue
// keeping your aim on it (drifting off means the glove brushes the case: contaminated, start again), then cap the tube with a fresh tap within a
// second of finishing. A late cap lets spores out (a fault, start again).
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'bot', label: 'Collect and log any alien spores or biological samples', type: 'task:survey' },
  title: 'Spore swab and cap', dept: 'sciences', host: 'room', item: 'tricorder_sci', siteName: 'Sample point', verb: 'Swab',
  how: 'At each sample point tap E to uncap a tube, hold E to swab with your aim kept on the residue, then let go and tap E at once to cap it.',
  keys: ['E tap: uncap / cap', 'E hold: swab (keep aim on the residue)'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'swab and cap', input: 'e-tap+e-hold+look', win: 'a clean, capped swab taken at every sample point',
    fail: 'drifting the swab off the residue onto the case, or capping the tube too late',
    rule: 'Three steps per point: tap E to uncap; hold E while keeping your view on the residue mark until the swab bar fills (moving off it contaminates the swab); release and tap E again within a second to cap.' },
  rush: 'Scooped a sample into an open tray and labelled it later.',
  captions: { contaminated: 'glove squeaks on the case', 'left open': 'spores puff' }, says: { contaminated: 'The glove touched the case — contaminated. Fresh tube; keep your aim on the residue.', 'left open': 'Too slow to cap — the spores got out. Fresh tube.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Sample point A', prop: 'labbench' }, { name: 'Specimen tank', prop: 'specimen_tank' }, { name: 'Sample fridge', prop: 'samplefridge' }]), r = m.rnd, tol = m.calm ? 0.16 : 0.11, capT = m.calm ? 1.5 : 1.0;
    m.pts = m.sites.map(() => ({ at: rf(r, -0.3, 0.3), st: 0, swab: 0, wait: 0, need: rf(r, 1.2, 1.8) }));   // st 0 capped, 1 open, 2 swabbed (cap it)
    const reset = (p, why) => { m.fault(why); p.st = 0; p.swab = 0; p.wait = 0; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); const rel = m.released(inp); if (!s) return; const i = m.next, p = m.pts[i];
      if (p.st === 0) { if (inp.press) { p.st = 1; m.ev('uncap', { site: i }); } }
      else if (p.st === 1) { if (inp.hold && !inp.press) { if (Math.abs((inp.look || 0) - p.at) > tol) { reset(p, 'contaminated'); return; } p.swab += dt; if (p.swab >= p.need) { p.st = 2; p.wait = 0; } } }
      else if (p.st === 2) { if (!inp.hold) p.wait += dt; if (inp.press && p.wait > 0) { m.finish(i); return; } if (p.wait > capT) reset(p, 'left open'); }
      void rel; s.prog = s.done ? 1 : clamp((p.st >= 1 ? 0.15 : 0) + 0.75 * p.swab / p.need, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pts[i]; if (p.st === 0) return { at: i, press: true, look: p.at }; if (p.st === 1) return { at: i, hold: true, look: p.at }; return p.wait > 0.1 ? { at: i, press: true, hold: true, look: p.at } : { at: i, look: p.at }; };
    m.bad = () => { const i = m.next, p = m.pts[i]; return p.st === 0 ? { at: i, press: true } : { at: i, hold: true, look: p.at + 0.5 }; };
    m.view = () => ({ pts: m.pts.map(p => +p.at.toFixed(3)) });
    m.panel = (i) => { const p = m.pts[i]; return p ? { label: ['Capped', 'Swabbing', 'CAP IT'][p.st], value: p.st === 2 ? `${Math.max(0, capT - p.wait).toFixed(1)} s` : `${Math.round(p.swab / p.need * 100)} %`, bar: p.st === 2 ? 1 - p.wait / capT : p.swab / p.need } : null; };
    m.prompt = (i) => { const p = m.pts[i]; return !p ? '' : ['Tap [E] to uncap a tube', 'Hold [E] and keep your aim on the residue', 'Let go and tap [E] to cap it — quick!'][p.st]; };
    return m;
  },
});
