// Deck crew: move cargo sleds. Crates of different weight sit across the sled deck; the balance marker shows where their combined weight
// sits. Pick a crate (1-4) and hold Left / Right to slide it (heavy crates drag slowly). When the marker sits in the centre notch, Enter pushes
// the sled onto the lift plate. Push it off-centre and the plate tilts and the crates spill (a fault, and they land in a new heap).
import { define, machine, DIG, ARROW, ENTER, rf, ri, clamp, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Move cargo sleds', type: 'loop' },
  title: 'Sled deck weight balancing', dept: 'flight', host: 'console', tool: 'Sled deck and balance marker',
  how: 'Pick a crate with 1-4 and hold Left or Right to slide it across the sled deck. When the balance marker sits in the centre notch, press Enter to push the sled onto the lift.',
  keys: ['1-4 pick a crate', 'Left / Right hold: slide it', 'Enter push onto the lift'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'slide to balance', input: 'digits+arrows-hold+enter', win: 'three sleds pushed onto the lift with their weight centred on the deck',
    fail: 'pushing a sled whose combined weight sits off-centre so the lift plate tilts and spills it',
    rule: 'The marker is the weight-average of the crates. Slide crates (heavier ones move slower) until the marker is inside the centre notch, then Enter. Outside the notch the plate tilts.' },
  rush: 'Shoved the sleds on as they came and caught what fell.',
  captions: { tipped: 'crates crash off the lift' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.07 : 0.05;
    const heap = () => { const n = ri(r, 3, 4); let cs; do { cs = Array.from({ length: n }, () => ({ x: rf(r, 0.05, 0.95), w: ri(r, 1, 6) * 20 })); } while (Math.abs(com(cs) - 0.5) < 0.15); return cs; };
    const com = (cs) => cs.reduce((a, c) => a + c.x * c.w, 0) / cs.reduce((a, c) => a + c.w, 0);
    m.sleds = [heap(), heap(), heap()]; m.s = 0; m.sel = 0; m.dir = 0; m.rounds = 3; m.round = 1;
    const S = () => m.sleds[m.s];
    m.com = () => com(S());
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const n = DIG(code), a = ARROW(code);
      if (n) { if (down && n <= S().length) m.sel = n - 1; return true; }
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (ENTER(code)) { if (!down) return true; if (Math.abs(m.com() - 0.5) > tol) { m.fault('tipped'); m.sleds[m.s] = heap(); m.sel = 0; return true; }
        m.ev('lift', { sled: m.s }); m.s++; m.sel = 0; m.round = Math.min(3, m.s + 1); if (m.s >= 3) m.win(); return true; }
      return a ? true : false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const c = S()?.[m.sel]; if (!c) return; const v = (m.calm ? 0.28 : 0.35) * 60 / (c.w + 40); c.x = clamp(c.x + ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * v * dt, 0.03, 0.97); };
    m.hint = () => {
      const cs = S(); if (!cs) return []; const e = m.com() - 0.5;
      if (Math.abs(e) <= tol * 0.5) return [['ArrowLeft', false], ['ArrowRight', false], ['Enter', true]];
      const tw = cs.reduce((a, c) => a + c.w, 0); let best = 0, bv = -1;
      cs.forEach((c, k) => { const room = e > 0 ? c.x - 0.03 : 0.97 - c.x, gain = Math.min(room * c.w / tw, Math.abs(e)) * 60 / (c.w + 40); if (gain > bv) { bv = gain; best = k; } });
      const out = []; if (best !== m.sel) out.push(['Digit' + (best + 1), true]);
      out.push(e > 0 ? ['ArrowRight', false] : ['ArrowLeft', false], e > 0 ? ['ArrowLeft', true] : ['ArrowRight', true]); return out;
    };
    m.bad = () => 'Enter';
    m.view = () => ({ sleds: m.sleds.map(cs => cs.map(c => [+c.x.toFixed(2), c.w])) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['ArrowLeft', '◀ slide'], ['ArrowRight', 'slide ▶'], ['Enter', 'Push to lift']];
    m.draw = (c, W, H, P) => {
      const cs = S(); if (!cs) return; const x0 = 30, w = 340, y0 = 96;
      txt(c, `Sled ${m.s + 1} / 3`, 16, 20, { size: 13, col: COL.gold });
      box(c, x0, y0, w, 14, COL.panel, COL.dim, 3);
      cs.forEach((k, j) => { const s = 14 + k.w / 6; box(c, x0 + k.x * w - s / 2, y0 - s, s, s, j === m.sel ? COL.orange : COL.peri, j === m.sel ? '#fff' : null, 2); txt(c, `${j + 1}`, x0 + k.x * w, y0 - s / 2 + 4, { size: 11, align: 'center', col: COL.dark }); txt(c, `${k.w}kg`, x0 + k.x * w, y0 + 28, { size: 9, align: 'center', col: COL.dim }); });
      const cm = m.com(), ok = Math.abs(cm - 0.5) <= tol; c.strokeStyle = '#4fd06a'; c.lineWidth = 2; c.strokeRect(x0 + (0.5 - tol) * w, y0 + 34, 2 * tol * w, 14);
      c.fillStyle = ok ? P.good : P.bad; c.beginPath(); c.moveTo(x0 + cm * w, y0 + 34); c.lineTo(x0 + cm * w - 7, y0 + 48); c.lineTo(x0 + cm * w + 7, y0 + 48); c.fill();
      txt(c, ok ? 'BALANCED — Enter to push' : `balance ${cm < 0.5 ? '◀ port heavy' : 'starboard heavy ▶'}`, 200, 30, { size: 12, align: 'center', col: ok ? P.good : COL.warn });
    };
    return m;
  },
});
