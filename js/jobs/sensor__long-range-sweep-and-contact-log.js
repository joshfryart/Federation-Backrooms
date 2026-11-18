// Sensor officer: long-range sweep and contact log. The sweep arm turns round the bearing ring; real contacts paint on every pass, noise
// paints once and is gone. Tag (Space) each real contact as the arm crosses it. Then pull the noise filter up (← / →) until the background
// is gone but every tagged contact still shows, and log it (Enter).
import { define, machine, ARROW, SPACE, ENTER, ri, rf, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'sensor', label: 'Long-range sweep and contact log', type: 'loop' },
  title: 'Sweep ring tag and filter', dept: 'sciences', host: 'console', tool: 'Long-range sensor scope',
  how: 'Tag each real contact (Space) as the sweep arm crosses it: real ones paint every pass, noise only once. Then set the noise filter (← / →) and log it (Enter).',
  keys: ['Space tag', '← / → filter', 'Enter log'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'tag returns', input: 'arrows+space+enter', win: 'every persistent return tagged as the arm crossed it and the filter set between the noise and the weakest contact',
    fail: 'tagging a one-pass noise return or empty sky, or filtering so high a real contact vanishes',
    rule: 'The arm sweeps once every three seconds. A return that paints on two passes is real: press Space as the arm crosses it. When all are tagged, raise the filter until the speckle is gone but no tagged contact fades, then Enter.' },
  rush: 'Logged everything that lit up on one pass.',
  captions: { 'tagged noise': 'scope chirp', 'nothing there': 'scope chirp', 'filtered a contact out': 'contact lost tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, per = m.calm ? 3.6 : 3.0, win = 0.12;
    m.real = Array.from({ length: 3 }, (_, k) => ({ b: (k + rf(r, 0.15, 0.85)) / 3, s: rf(r, 0.45, 0.9), tag: false }));
    m.noise = Array.from({ length: 4 }, () => ({ b: rf(r, 0, 1), pass: ri(r, 0, 2), s: rf(r, 0.1, 0.35) }));
    let minReal = Math.min(...m.real.map(c => c.s)); const maxNoise = Math.max(...m.noise.map(c => c.s));
    m.lo = Math.ceil(maxNoise * 10 + 0.01); m.hi = Math.floor(minReal * 10 - 0.01); if (m.hi < m.lo) m.hi = m.lo; m.real.forEach(c => { c.s = Math.max(c.s, (m.lo + 0.6) / 10); }); minReal = Math.min(...m.real.map(c => c.s));
    m.f = 0; m.phase = 0; m.arm = 0; m.rounds = 2; m.round = 0;
    const pass = () => Math.floor(m.t / per), near = (b) => { const d = Math.abs(((m.arm - b + 1.5) % 1) - 0.5); return d < win / 2; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (m.phase === 0 && SPACE(code)) { const c = m.real.find(c => !c.tag && near(c.b)); if (c && pass() >= 1) { c.tag = true; if (m.real.every(x => x.tag)) { m.phase = 1; m.round = 1; } } else m.fault(m.noise.some(n => n.pass === pass() && near(n.b)) || c ? 'tagged noise' : 'nothing there'); return true; }
      if (m.phase === 1 && (a === 'L' || a === 'R')) { m.f = Math.max(0, Math.min(10, m.f + (a === 'R' ? 1 : -1))); return true; }
      if (m.phase === 1 && ENTER(code)) { if (m.f < m.lo) m.fault('noise left in'); else if (m.f / 10 >= minReal) m.fault('filtered a contact out'); else m.win(); return true; }
      return SPACE(code) || ENTER(code) || !!a;
    };
    m.tick = (dt) => { if (m.live(dt)) m.arm = (m.t / per) % 1; };
    m.hint = () => { if (m.phase === 0) return pass() >= 1 && m.real.some(c => !c.tag && near(c.b) && Math.abs(((m.arm - c.b + 1.5) % 1) - 0.5) < 0.03) ? [['Space', true]] : []; return [[m.f < m.lo ? 'ArrowRight' : m.f > m.lo ? 'ArrowLeft' : 'Enter', true]]; };
    m.bad = () => (m.phase === 0 ? (m.real.some(c => near(c.b)) ? null : 'Space') : 'Enter');
    m.view = () => ({ real: m.real.map(c => +c.b.toFixed(3)), noise: m.noise.map(n => +n.b.toFixed(3)) });
    m.buttons = () => [['Space', 'Tag'], ['ArrowLeft', '◀ filter'], ['ArrowRight', 'filter ▶'], ['Enter', 'Log']];
    m.draw = (c, W, H, P) => {
      const cx = 90, cy = 85, R = 70, xy = (b, k) => [cx + Math.sin(b * 6.283) * R * k, cy - Math.cos(b * 6.283) * R * k];
      c.strokeStyle = 'rgba(125,151,232,.4)'; c.lineWidth = 1; for (const k of [0.33, 0.66, 1]) { c.beginPath(); c.arc(cx, cy, R * k, 0, 6.283); c.stroke(); }
      const [ax, ay] = xy(m.arm, 1); c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(ax, ay); c.stroke();
      const fade = (b) => Math.max(0, 1 - ((m.arm - b + 1) % 1) * 2.2), fl = m.f / 10;
      m.real.forEach((q, k) => { if (q.s <= fl && m.phase === 1) return; const a = m.phase === 1 ? 1 : fade(q.b); if (a <= 0) return; const [x, y] = xy(q.b, 0.4 + k * 0.2); c.globalAlpha = a; c.fillStyle = q.tag ? P.good : COL.ink; c.beginPath(); c.arc(x, y, 4 + q.s * 3, 0, 6.283); c.fill(); c.globalAlpha = 1; });
      m.noise.forEach((n, k) => { if (m.phase === 1 ? n.s <= fl : n.pass !== pass()) return; const a = m.phase === 1 ? 0.6 : fade(n.b); if (a <= 0) return; const [x, y] = xy(n.b, 0.3 + k * 0.17); c.globalAlpha = a * 0.8; c.fillStyle = COL.lav; c.fillRect(x - 2, y - 2, 4, 4); c.globalAlpha = 1; });
      txt(c, m.phase === 0 ? `PASS ${pass() + 1}  ·  tagged ${m.real.filter(q => q.tag).length} / 3` : 'NOISE FILTER', 190, 30, { size: 12, col: COL.gold });
      if (m.phase === 1) { bar(c, 190, 44, 190, 12, m.f / 10, { col: COL.peri }); txt(c, `filter ${m.f}`, 190, 76, { size: 12 }); txt(c, 'Speckle gone, contacts kept → Enter', 190, 98, { size: 10, col: COL.dim }); }
      else txt(c, 'Real contacts paint every pass', 190, 54, { size: 10, col: COL.dim });
    };
    return m;
  },
});
