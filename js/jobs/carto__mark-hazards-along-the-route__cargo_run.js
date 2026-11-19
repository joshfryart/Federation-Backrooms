// Cartographer, cargo run: mark hazards along the route. At the nav screen, put the stylus (your view) on the route's start at the far left,
// then trace right along the route. On each hazard, hold E to open the hazard menu: it steps through the classes while you hold, and you let
// go on the class its signature calls for. Keep the stylus steady while the menu is open, or the mark smudges off the hazard. Trace past a
// hazard without marking it and the route flashes a warning. Finally tap E at the helm to have the navigator confirm the marks.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const CLASSES = ['Debris', 'Ion storm', 'Grav shear', 'Dust lane'], SIGS = ['scattered mass returns', 'charged particle flux', 'tidal gradient', 'diffuse infrared haze'];
export default define({
  job: { billet: 'carto', label: 'Mark hazards along the route', type: 'task:cargo_run' },
  title: 'Route trace hazard marking', dept: 'sciences', host: 'room', item: 'padd', siteName: 'Station', verb: 'Mark',
  how: 'Start the stylus at the left end of the route and trace right; on each hazard hold E steady and let go when the menu shows the class its signature calls for, then tap E at the helm to confirm.',
  keys: ['look: move the stylus along the route', 'E hold steady: class menu, let go on the class', 'E tap at helm: confirm'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'trace and class', input: 'e-tap+e-hold+look+swing', win: 'route traced from its start with every hazard on it marked in the class its signature calls for, then confirmed by the navigator',
    fail: 'tracing past a hazard without marking it, letting go on the wrong class, or swinging the stylus off the hazard while the menu is open',
    rule: 'Trace left to right. On a hazard hold E: the menu steps Debris, Ion storm, Grav shear, Dust lane; let go on the one its signature names. Keep the view still while holding.' },
  rush: 'Copied the old chart\'s hazard dots onto the route and saved without a class on any of them.',
  captions: { 'unmarked hazard': 'route warning flash', 'wrong class': 'threat level mismatch tone', smudged: 'stylus skip' },
  says: { 'unmarked hazard': 'You traced past a hazard without marking it. The route is flashing: go back to it.', 'wrong class': 'Wrong class for that signature: it changes the threat level.', smudged: 'The stylus moved while the menu was open and the mark slid off.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Nav screen route', prop: 'navstation' }, { name: 'Helm (navigator confirm)', prop: 'helm' }]), r = m.rnd;
    const n = ri(r, 3, 4), tol = m.calm ? 0.09 : 0.07, per = m.calm ? 0.7 : 0.5, still = m.calm ? 0.6 : 0.45;
    const bear = shuffle(r, [0.42, 0.24, 0.06, -0.12, -0.3, -0.46]).slice(0, n).sort((a, b) => b - a);
    m.hz = bear.map(look => { const k = ri(r, 0, 3); return { look, k, sig: SIGS[k], mark: false, passed: false }; });
    m.started = false; m.hT = 0; m.menu = -1;
    const aimed = (lk) => m.hz.find(h => !h.mark && Math.abs(lk - h.look) <= tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return;
      if (m.next === 1) { if (rel) m.finish(1); return; }
      const lk = inp.look || 0; if (lk >= 0.52) m.started = true; if (!m.started) return;
      for (const h of m.hz) { if (!h.mark && !h.passed && lk < h.look - tol - 0.02) { h.passed = true; m.fault('unmarked hazard'); } if (h.passed && lk >= h.look - tol) h.passed = false; }
      const h = aimed(lk);
      if (inp.hold && h) { m.hT += dt; m.menu = Math.floor(m.hT / per) % 4; if (Math.abs(inp.swing || 0) > still) { m.fault('smudged'); m.hT = 0; m.menu = -1; m.prev = false; } }
      if (rel) { if (h && m.menu >= 0) { if (m.menu === h.k) h.mark = true; else m.fault('wrong class'); } m.hT = 0; m.menu = -1; }
      if (m.hz.every(x => x.mark)) m.finish(0); else s.prog = clamp(m.hz.filter(x => x.mark).length / n, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 1) { const t = f % 6 === 0; return { at: 1, hold: t, press: t }; }
      if (!m.started) return { at: 0, look: 0.6 }; const h = m.hz.find(x => !x.mark);
      return { at: 0, look: h.look, hold: !(m.menu === h.k && m.hT % per > per * 0.3), swing: 0 }; };
    m.bad = () => ({ at: 0, look: m.started ? -0.6 : 0.6 });
    m.view = () => ({ hz: m.hz.map(h => [h.look, h.k]) });
    m.panel = (i) => { if (i === 1) return { label: 'Navigator', value: `${m.hz.length} hazards marked · tap to confirm`, bar: 1 };
      if (!m.started) return { label: 'Route start', value: 'put the stylus on the far-left end', bar: 0 };
      const h = m.hz.find(x => !x.mark); if (!h) return { label: '', value: '' }; const side = h.look > 0 ? 'left' : 'right';
      return { label: `Hazard at ${Math.abs(h.look).toFixed(2)} ${side} · sig: ${h.sig}`, value: m.menu >= 0 ? `menu: ${CLASSES[m.menu]}` : `${m.hz.filter(x => x.mark).length}/${m.hz.length} marked`, bar: m.menu >= 0 ? (m.hT % per) / per : 0 }; };
    m.prompt = (i) => i === 1 ? 'Tap [E] to have the navigator confirm the marks' : !m.started ? 'Look to the far left to put the stylus on the start of the route' : 'On a hazard, hold [E] steady; let go on its class (debris=mass, ion=charged, grav=tidal, dust=haze)';
    return m;
  },
});
