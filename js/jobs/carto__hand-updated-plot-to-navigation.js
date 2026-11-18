// Cartographer: hand the updated plot to navigation. Hold E at the nav console to load the plot from the case until the screen confirms it.
// At the hazard board, aim the view at each hazard mark and keep E held while you ask: the navigator looks, then nods or says "say again".
// Let go before the nod and the hazard stays unconfirmed. Then hold E square-on to log the handoff; logging with any hazard unconfirmed is the
// failure that matters (navigation steers into it).
import { define, machine, room, ri, rf, shuffle, pick, clamp } from './kit.js';

const NAMES = ['Kestrel shoal', 'Dust lane 4', 'Ion eddy', 'Rogue body K-9', 'Grav shear', 'Ice field'];
export default define({
  job: { billet: 'carto', label: 'Hand updated plot to navigation', type: 'loop' },
  title: 'Plot handoff hazard nods', dept: 'sciences', host: 'room', item: 'padd', siteName: 'Station', verb: 'Hand over',
  how: 'Hold E to load the plot, then aim at each hazard mark and keep E held until the navigator nods, then hold E square-on to log the handoff.',
  keys: ['E hold: load / ask / log', 'aim the view at a hazard mark'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'point for nods', input: 'e-hold+look', win: 'plot loaded and every hazard mark confirmed aloud by the navigator before the handoff is logged',
    fail: 'letting go before the navigator nods, or logging the handoff with a hazard still unconfirmed',
    rule: 'Aim at a hazard mark and hold E while the navigator answers; a nod confirms it, "say again" means keep holding. Log only when every mark shows a nod.' },
  rush: 'Dropped the plot into the nav console and walked off without walking the hazards.',
  captions: { 'cut off': 'navigator: "wait, which one?"', unconfirmed: 'proximity alarm' },
  says: { 'cut off': 'You let go before the navigator answered. That hazard is not confirmed.', unconfirmed: 'Logged with a hazard unconfirmed. The navigator never heard about it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Nav console (load plot)', prop: 'navstation' }, { name: 'Hazard board and handoff log', prop: 'helm' }]), r = m.rnd;
    const n = ri(r, 3, 4), slots = shuffle(r, [-0.45, -0.25, 0.25, 0.45]).slice(0, n).sort((a, b) => b - a), tol = m.calm ? 0.12 : 0.08;
    const nm = shuffle(r, NAMES); m.hz = slots.map((look, i) => ({ look, name: nm[i], wait: rf(r, 0.8, 1.6), again: r() < 0.35, heard: 0, ok: false }));
    m.load = 0; m.loadNeed = m.calm ? 1.2 : 1.5; m.logT = 0; m.navName = pick(r, ['Lt. Okafor', 'Ens. Varo', 'Lt. Sefton']);
    const aimed = (lk) => m.hz.find(h => Math.abs(lk - h.look) <= tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, lk = inp.look || 0;
      if (i === 0) { if (inp.hold) m.load += dt; if (m.load >= m.loadNeed) m.finish(0); s.prog = clamp(m.load / m.loadNeed, 0, 0.95); return; }
      if (i === 1) {
        const h = aimed(lk);
        if (inp.hold && h && !h.ok) { h.heard += dt; if (h.heard >= h.wait) { if (h.again) { h.again = false; h.heard = 0; m.ev('say again'); } else { h.ok = true; m.ev('nod'); } } }
        if (rel || (inp.hold && !h)) for (const x of m.hz) { if (x.heard > 0 && !x.ok) { m.fault('cut off'); } x.heard = 0; }
        if (inp.hold && Math.abs(lk) < 0.1) { m.logT += dt; if (m.logT >= 0.8) { if (m.hz.every(x => x.ok)) { m.finish(1); return; } m.fault('unconfirmed'); m.logT = 0; } } else m.logT = 0;
        s.prog = m.hz.filter(x => x.ok).length / m.hz.length * 0.95;
      }
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i !== 1) return { at: i, hold: true, look: 0 };
      const h = m.hz.find(x => !x.ok); return { at: 1, hold: true, look: h ? h.look : 0 }; };
    // bad: logs the handoff straight away, hazards unconfirmed
    m.bad = () => ({ at: m.next, hold: true, look: 0 });
    m.view = () => ({ hz: m.hz.map(h => [h.look, h.name, +h.wait.toFixed(2)]) });
    m.panel = (i) => {
      if (i === 0) return { label: 'Plot load', value: m.load >= m.loadNeed ? 'LOADED' : `${Math.round(m.load / m.loadNeed * 100)} %`, bar: m.load / m.loadNeed };
      if (i === 1) { const h = m.hz.find(x => x.heard > 0) || m.hz.find(x => !x.ok); if (m.logT > 0 || !h) return { label: 'Handoff log (look square-on)', value: `${m.hz.filter(x => x.ok).length}/${m.hz.length} nodded · ${m.navName}`, bar: m.logT / 0.8 };
        const side = h.look > 0 ? 'left' : 'right'; return { label: `${h.name} (${Math.abs(h.look).toFixed(2)} ${side})`, value: h.heard > 0 ? `${m.navName} looking…` : `${m.hz.filter(x => x.ok).length}/${m.hz.length} nodded`, bar: h.heard / h.wait }; }
      return { label: '', value: '' };
    };
    m.prompt = (i) => i === 0 ? 'Hold [E] to load the plot until the screen confirms' : i === 1 ? 'Aim at each hazard mark and keep [E] held until the navigator nods; hold [E] square-on to log the handoff' : '';
    return m;
  },
});
