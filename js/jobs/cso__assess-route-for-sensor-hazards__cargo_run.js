// Chief science officer: assess the planned route for sensor hazards. Walk the probe cursor along the course (hold right, left to back up).
// The dust and radiation map only gives a band's density once the cursor is inside it. Drop a hazard marker (Space) on every band that reads
// at or over the hazard line (40 %); faint bands are not worth a detour. Send the list to navigation (Enter) once every hazard band is marked.
// Marking a faint band, dropping a marker off any band, or sending with a hazard unmarked is a fault.
import { define, machine, ARROW, SPACE, ENTER, ri, rf, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'cso', label: 'Assess route for sensor hazards', type: 'task:cargo_run' },
  title: 'Route density walk and markers', dept: 'sciences', host: 'console', tool: 'Course plotter density overlay',
  how: 'Hold right to walk the probe along the planned course; inside each band its density appears. Press Space to drop a hazard marker on bands at or over 40 %, ignore fainter ones, then send the list with Enter.',
  keys: ['▶ hold: walk the course', '◀ hold: back up', 'Space drop marker', 'Enter send to navigation'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'probe the course', input: 'arrows-hold+space+enter', win: 'every dense band crossing the planned course found by walking the probe along it and marked, with faint bands left alone, before sending to navigation',
    fail: 'marking a faint band as a detour, dropping a marker off any band, or sending navigation a route with a dense band unmarked',
    rule: 'Density shows only while the probe sits inside a band. 40 % or more: Space to mark it. Under 40 %: walk on. Enter when no dense band is left unmarked.' },
  rush: 'Sent navigation the route with a note to keep an eye out for dust.',
  captions: { 'needless detour': 'detour chime', 'marker off band': 'marker reject buzz', 'flew through field': 'navigation alert' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, sp = m.calm ? 18 : 22, thr = 40, n = ri(r, 4, 5);
    const kinds = shuffle(r, ['haz', 'haz', 'faint', ...Array(n - 3).fill(0).map(() => (r() < 0.5 ? 'haz' : 'faint'))]);
    m.bands = kinds.map((k, j) => { const w = rf(r, 6, 9), c = 12 + (j + 0.5) * (80 / n) + rf(r, -3, 3); return { a: c - w / 2, b: c + w / 2, dens: k === 'haz' ? ri(r, thr, 85) : ri(r, 12, thr - 6), mk: false, kind: k }; });
    m.x = 0; m.dn = {}; m.bf = 0;
    const inBand = () => m.bands.find(b => m.x >= b.a && m.x <= b.b);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (a === 'L' || a === 'R') { m.dn[a] = down; return true; } if (a) return true; if (!SPACE(code) && !ENTER(code)) return false;
      const e = down && !m.dn[code]; m.dn[code] = down; if (!e) return true;
      if (SPACE(code)) { const b = inBand(); if (!b) m.fault('marker off band'); else if (b.dens < thr) m.fault('needless detour'); else b.mk = true; }
      else { if (m.bands.every(b => b.kind !== 'haz' || b.mk)) m.win(); else m.fault('flew through field'); }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.x = Math.max(0, Math.min(100, m.x + ((m.dn.R ? 1 : 0) - (m.dn.L ? 1 : 0)) * sp * dt)); };
    m.hint = () => {
      const b = m.bands.find(y => y.kind === 'haz' && !y.mk); if (!b) return [['ArrowRight', false], ['Enter', !m.dn.Enter]];
      const c = (b.a + b.b) / 2, w = (b.b - b.a) / 3; if (m.x < c - w) return [['ArrowRight', true], ['ArrowLeft', false]]; if (m.x > c + w) return [['ArrowRight', false], ['ArrowLeft', true]];
      return [['ArrowRight', false], ['ArrowLeft', false], ['Space', !m.dn.Space]];
    };
    m.bad = () => ['Space', ++m.bf % 2 === 0];
    m.view = () => ({ bands: m.bands.map(b => [+b.a.toFixed(1), b.dens]) });
    m.buttons = () => [['ArrowLeft', '◀ back'], ['ArrowRight', 'walk ▶'], ['Space', 'Mark hazard'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      const x0 = 14, w = 372, X = (v) => x0 + v / 100 * w; box(c, x0, 20, w, 80, 'rgba(255,255,255,.03)', COL.dim, 4);
      for (const b of m.bands) { c.fillStyle = 'rgba(185,155,230,.18)'; c.fillRect(X(b.a), 22, X(b.b) - X(b.a), 76); if (b.mk) { txt(c, '⚠', (X(b.a) + X(b.b)) / 2, 40, { size: 14, align: 'center', col: P.bad }); } }
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, 70); for (let v = 0; v <= 100; v += 5) c.lineTo(X(v), 70 + Math.sin(v * 0.11) * 8); c.stroke();
      txt(c, 'START', x0, 114, { size: 9, col: COL.dim }); txt(c, 'WAYPOINT', x0 + w, 114, { size: 9, col: COL.dim, align: 'right' });
      c.fillStyle = COL.ink; c.beginPath(); c.arc(X(m.x), 70 + Math.sin(m.x * 0.11) * 8, 6, 0, 6.283); c.fill();
      const b = inBand(); txt(c, b ? `DENSITY ${b.dens} %` : 'clear space', 14, 140, { size: 14, col: b ? (b.dens >= thr ? COL.warn : COL.pale) : COL.dim });
      txt(c, `hazard line ${thr} % · marked ${m.bands.filter(y => y.mk).length}`, 386, 140, { size: 10, col: COL.dim, align: 'right' });
    };
    return m;
  },
});
