// Chief science officer: verify hydroponics health with the botanist. Each tray has four leaves along it, worked left to right. Aim at the
// next leaf and tap E to turn it over; its underside shows clean or spotted. A spotted underside is early blight: aim at that leaf and hold E
// to press a blight mark on it before turning the next one. Turning on past an unmarked spot passes the blight (a fault); marking a clean leaf
// is a false alarm (a fault). The tray is signed once its last leaf is turned (and marked if spotted).
import { define, machine, room, ri, rf, clamp } from './kit.js';

const L = [0.36, 0.12, -0.12, -0.36];
export default define({
  job: { billet: 'cso', label: 'Verify hydroponics health with botanist', type: 'loop' },
  title: 'Leaf underside blight check', dept: 'sciences', host: 'room', siteName: 'Tray', verb: 'Turn',
  how: 'Along each tray, aim at the next leaf (left to right) and tap E to turn it over. If the underside is spotted, keep aim on it and hold E to mark the blight before you turn the next leaf.',
  keys: ['aim: leaf', 'E tap: turn the leaf over', 'E hold: mark blight'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'turn leaves', input: 'e-tap+e-hold+look', win: 'every leaf along each hydroponics tray turned over in order and every spotted underside marked before moving on',
    fail: 'turning on past a spotted leaf, or pressing a blight mark on a clean leaf',
    rule: 'Aim at the next leaf, left to right, and tap E: the panel shows its underside. Spotted = hold E on that same leaf to mark it. Clean = aim at the next leaf and tap again.' },
  rush: 'Looked down the tops of the trays and told the botanist they were fine.',
  captions: { 'blight passed': 'leaf rustles back', 'false blight': 'marker squeak' },
  says: { 'blight passed': 'That leaf was spotted underneath — mark it (hold [E]) before you move on.', 'false blight': 'That underside is clean — no mark needed.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Tray 1 (lettuce)', prop: 'growbed' }, { name: 'Tray 2 (soy)', prop: 'nutrient_tanks' }, { name: 'Tray 3 (herbs)', prop: 'plant' }]), r = m.rnd, tol = m.calm ? 0.1 : 0.07, holdT = 0.6;
    m.trays = m.sites.map(() => ({ ph: +rf(r, 5.6, 6.4).toFixed(1), blight: r() < 0.8 ? ri(r, 0, 3) : -1, k: 0, open: -1, marked: false, h: 0, lock: false }));
    const aimed = (inp, j) => j >= 0 && j < 4 && Math.abs((inp.look || 0) - L[j]) <= tol;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, t = m.trays[i];
      if (inp.hold) { t.h += dt; if (t.h >= holdT && !t.lock && aimed(inp, t.open)) { t.lock = true; if (t.open === t.blight && !t.marked) { t.marked = true; if (t.k >= 4) m.finish(i); } else if (t.open !== t.blight) m.fault('false blight'); } }
      if (rel) { if (!t.lock && t.h < 0.35 && t.k < 4 && aimed(inp, t.k)) {
        if (t.open >= 0 && t.open === t.blight && !t.marked) { m.fault('blight passed'); t.marked = true; }
        t.open = t.k++; if (t.k >= 4 && (t.open !== t.blight)) m.finish(i); }
        t.h = 0; t.lock = false; }
      if (!s.done) s.prog = clamp(t.k / 4.2, 0, 0.95);
    };
    const need = (t) => t.open >= 0 && t.open === t.blight && !t.marked;
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const t = m.trays[i]; if (need(t)) return { at: i, look: L[t.open], hold: !t.lock }; const tp = f % 4 === 0; return { at: i, look: L[t.k], hold: tp, press: tp }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const t = m.trays[i], ph = f % 40; return ph < 2 ? { at: i, look: L[Math.min(3, t.k)], hold: ph === 0, press: ph === 0 } : { at: i, look: L[Math.max(0, t.open)], hold: ph > 8 && ph < 32 }; };
    m.view = () => ({ trays: m.trays.map(t => [t.ph, t.blight]) });
    m.panel = (i) => { const t = m.trays[i]; if (!t) return null; const u = t.open < 0 ? 'none turned yet' : t.open === t.blight ? (t.marked ? 'SPOTTED · marked' : 'SPOTTED underside') : 'clean underside';
      return { label: `pH ${t.ph} · leaf ${Math.max(1, t.open + 1)} of 4`, value: u, bar: need(t) ? t.h / holdT : t.k / 4 }; };
    m.prompt = (i) => { const t = m.trays[i]; if (!t) return ''; return need(t) ? `Spotted! Keep aim on leaf ${t.open + 1} and hold [E] to mark the blight` : `Aim at leaf ${t.k + 1} (${['far left', 'left', 'right', 'far right'][t.k]}) and tap [E] to turn it over`; };
    return m;
  },
});
