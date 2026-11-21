// Galley: replicator and equipment round. Four gauges each read noisily, so one reading proves nothing. Select a gauge (Left/Right), press Space to
// run a test sample, and judge the average of its samples against the chart band. Press Enter to call the tech on a gauge whose average is out
// of the band. Calling an in-band gauge, or calling before two samples, is a fault; both off-spec gauges must be called.
import { define, machine, ARROW, SPACE, ENTER, rf, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Replicator and galley equipment round', type: 'loop' },
  title: 'Sample, average and call the tech', dept: 'services', host: 'console', tool: 'Replicator gauges and chart',
  how: 'Pick a gauge with Left/Right. Space runs a test sample; each reading wobbles, so take all four and judge the average against the band. Enter calls the tech on an out-of-band gauge.',
  keys: ['Left/Right choose gauge', 'Space take a sample', 'Enter call the tech'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'average and call', input: 'arrows+space+enter', win: 'both off-spec gauges among four identified from their sampled averages and reported to the tech',
    fail: 'calling the tech on a gauge whose average is inside the chart band, or calling before two samples are taken',
    rule: 'Samples wobble above and below the true value. Take four per gauge, read the average line against the band marks, and press Enter only on a gauge whose average is outside.' },
  rush: 'Glanced at each dial once and called nothing unless a needle was far out.',
  captions: { 'false call': 'handset beep', 'no reading': 'handset beep' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; const off = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, 2));
    m.G = [0, 1, 2, 3].map(i => { const mu = off.has(i) ? 0.5 + (r() < 0.5 ? -1 : 1) * rf(r, 0.2, 0.3) : 0.5 + rf(r, -0.04, 0.04), x = rf(r, 0.08, 0.2), y = rf(r, 0.08, 0.2);
      return { mu, off: off.has(i), n: [x, -x, y, -y], got: [], called: false }; });
    m.sel = 0; m.rounds = 2; m.round = 0; m.G.forEach(g => { g.n = shuffle(r, g.n); });
    m.avg = (g) => (g.got.length ? g.got.reduce((a, b) => a + b, 0) / g.got.length : null);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), g = m.G[m.sel];
      if (a === 'L' || a === 'R') { m.sel = Math.max(0, Math.min(3, m.sel + (a === 'R' ? 1 : -1))); return true; }
      if (SPACE(code)) { if (g.got.length < 4) g.got.push(g.mu + g.n[g.got.length]); return true; }
      if (!ENTER(code) || g.called) return ENTER(code);
      if (g.got.length < 2) m.fault('no reading'); else if (!g.off) m.fault('false call'); else { g.called = true; m.round++; if (m.round >= 2) m.win(); } return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { for (let i = 0; i < 4; i++) { const g = m.G[i], need = g.got.length < 4 || (Math.abs(m.avg(g) - 0.5) > 0.1 && !g.called); if (!need) continue;
      if (m.sel < i) return [['ArrowRight', true]]; if (m.sel > i) return [['ArrowLeft', true]]; return [[g.got.length < 4 ? 'Space' : 'Enter', true]]; } return []; };
    m.bad = () => 'Enter';
    m.view = () => ({ G: m.G.map(g => [+g.mu.toFixed(2), g.off]) });
    m.buttons = () => [['ArrowLeft', 'Gauge -'], ['ArrowRight', 'Gauge +'], ['Space', 'Sample'], ['Enter', 'Call tech']];
    m.draw = (c, W, H, P) => {
      m.G.forEach((g, i) => { const x = 20 + i * 92, on = i === m.sel; box(c, x, 10, 80, 120, on ? 'rgba(125,151,232,.2)' : 'rgba(255,255,255,.05)', on ? COL.peri : null, 6);
        c.fillStyle = 'rgba(240,147,58,.25)'; c.fillRect(x + 8, 20 + 90 * 0.4, 64, 90 * 0.2);
        g.got.forEach(v => { c.fillStyle = COL.dim; c.fillRect(x + 12, 20 + 90 * (1 - v), 18, 2); });
        const a = m.avg(g); if (a !== null) { c.fillStyle = COL.gold; c.fillRect(x + 36, 20 + 90 * (1 - a) - 1, 36, 3); }
        txt(c, g.called ? 'CALLED' : `${g.got.length}/4`, x + 40, 126, { size: 11, col: g.called ? P.good : COL.pale, align: 'center' }); });
    };
    return m;
  },
});
