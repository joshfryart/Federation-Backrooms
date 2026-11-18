// Damage control: work the repair queue. Each ticket needs a plate cut on the press to its drawing size. Hold Right to feed the blank under
// the shear: after a moment the feed goes fast and coasts when you let go, so feed fast to near the size, let go, and finish in short
// slow nudges (Left backs off). Enter shears it and the calipers read the plate. Short of the drawing even by a millimetre is scrap (a fault);
// a long plate can be trimmed with another cut, at the cost of a press cycle.
import { define, machine, ARROW, ENTER, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'dc', label: 'Work the repair queue', type: 'loop' },
  title: 'Plate shear to the drawing size', dept: 'engineering', host: 'console', tool: 'Plate press and calipers',
  how: 'Hold Right to feed the blank (it speeds up and coasts), finish slowly near the drawing size, and press Enter to shear. The calipers must read the size or a little over; short is scrap.',
  keys: ['Right hold feed', 'Left hold back off', 'Enter shear'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'shear to size', input: 'arrows-hold+enter', win: 'three ticket plates sheared at or just over their drawing size as read by the calipers',
    fail: 'shearing a plate even slightly short of the drawing, which looks right by eye but leaks under test',
    rule: 'Holding the feed accelerates the blank after half a second and it coasts when released. Feed coarse, let go before the size, inch up slowly, then Enter. Calipers at or up to 1.5 mm over pass; over that needs a trim cut; any short is scrap.' },
  rush: 'Cut the plate by eye against the old one and fitted it.',
  captions: { 'cut short': 'scrap plate clangs', trimmed: 'shear thunks' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 2.5 : 1.5, slow = m.calm ? 18 : 24;
    m.tix = Array.from({ length: 3 }, () => ({ size: ri(r, 120, 260) + ri(r, 0, 9) / 10, part: ['hull patch', 'door plate', 'duct cover', 'bulkhead shim'][ri(r, 0, 3)] }));
    m.round = 0; m.rounds = 3; m.pos = 0; m.v = 0; m.dir = 0; m.hT = 0; m.cyc = 0; m.last = null;
    const tk = () => m.tix[m.round];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'R' || a === 'L') { const d = a === 'R' ? 1 : -1; if (down) { if (m.dir !== d) { m.dir = d; m.hT = 0; } } else if (m.dir === d) m.dir = 0; return true; }
      if (ENTER(code) && down) {
        if (m.cyc > 0) return true; const t = tk(), cut = m.pos; m.cyc = 0.7; m.last = cut;
        if (cut < t.size - 0.05) { m.fault('cut short'); m.pos = 0; m.v = 0; return true; }
        if (cut > t.size + tol) { m.ev('trimmed'); m.pos = cut - 0.4; m.cyc = 1.2; return true; }
        m.round++; m.pos = 0; m.v = 0; if (m.round >= 3) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.cyc = Math.max(0, m.cyc - dt);
      if (m.dir) { m.hT += dt; m.v = m.dir * (m.hT > 0.5 ? 110 : slow); } else if (Math.abs(m.v) > slow + 1) m.v *= Math.pow(0.0005, dt); else m.v = 0;
      if (Math.abs(m.v) < 3 && !m.dir) m.v = 0; m.pos = Math.max(0, m.pos + m.v * dt);
    };
    m.hint = () => { const t = tk(); if (!t || m.cyc > 0) return [['ArrowRight', false]]; const gap = t.size - m.pos;
      if (gap > 30) return [['ArrowRight', true]]; if (m.dir === 1 && m.hT > 0.5) return [['ArrowRight', false]];
      if (Math.abs(m.v) > 3 && !m.dir) return []; if (m.pos < t.size + 0.4) return m.dir === 1 ? (m.hT > 0.4 ? [['ArrowRight', false]] : []) : [['ArrowRight', true]];
      return [['ArrowRight', false], ['Enter', true]]; };
    m.bad = () => (m.cyc <= 0 && m.pos < 5 ? 'Enter' : null);
    m.view = () => ({ tix: m.tix.map(t => t.size) });
    m.buttons = () => [['ArrowLeft', 'Back off'], ['ArrowRight', 'Feed'], ['Enter', 'Shear']];
    m.draw = (c, W, H, P) => {
      const t = tk() || m.tix[2], sx = 300, k = 0.9; txt(c, `Ticket ${Math.min(3, m.round + 1)}/3 · ${t.part}`, 14, 20, { size: 12, col: COL.pale });
      txt(c, `drawing ${t.size.toFixed(1)} mm`, 14, 38, { size: 14, col: COL.gold });
      box(c, 20, 70, 360, 26, 'rgba(255,255,255,.06)', null, 4); c.fillStyle = COL.peri; c.fillRect(sx - m.pos * k, 74, m.pos * k, 18);
      c.strokeStyle = COL.ink; c.setLineDash?.([4, 3]); c.strokeRect(sx - t.size * k, 72, t.size * k, 22); c.setLineDash?.([]);
      c.fillStyle = P.bad; c.fillRect(sx, 62, 3, 42); txt(c, 'SHEAR', sx + 6, 66, { size: 9, col: P.bad });
      txt(c, `feed ${m.pos.toFixed(1)} mm ${m.dir ? (m.hT > 0.5 ? '» fast' : '› slow') : Math.abs(m.v) > 0 ? '~ coasting' : ''}`, 20, 124, { size: 13 });
      if (m.last != null) { const ok = m.last >= t.size - 0.05; txt(c, `calipers: last cut ${m.last.toFixed(1)} mm ${ok ? '' : '✗ SHORT'}`, 20, 146, { size: 12, col: ok ? COL.dim : P.bad }); }
      if (m.cyc > 0) txt(c, 'press cycling…', 280, 146, { size: 11, col: COL.warn });
    };
    return m;
  },
});
