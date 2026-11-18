// Comms officer, survey: scan subspace bands for signals. The scanner steps through six bands twice. On the first pass just watch where each
// band's streak sits on the waterfall. On the second pass the first sweep shows as a faint ghost above the live row: a streak that comes
// back on the same spot is a contact, however faint, so log it (Enter) while the band is up. A streak in a new spot is noise. Logging on the
// first pass, logging noise, or letting a repeat go by are all faults.
import { define, machine, ENTER, rf, txt, box, COL } from './kit.js';

const BANDS = ['SB-1 2.1 GHz', 'SB-2 3.4 GHz', 'SB-3 4.9 GHz', 'SB-4 6.2 GHz', 'SB-5 7.7 GHz', 'SB-6 9.0 GHz'];

export default define({
  job: { billet: 'comms', label: 'Scan subspace bands for signals', type: 'task:survey' },
  title: 'Two-pass waterfall contact log', dept: 'operations', host: 'console', tool: 'Band scanner and waterfall display',
  how: 'Watch the first sweep, then on the second sweep press Enter on any band whose streak comes back on the same spot, faint or not; ignore streaks that moved.',
  keys: ['Enter log contact'], limit: 30, maxFaults: 2,
  fingerprint: { verb: 'log repeats', input: 'enter', win: 'every streak that reappears in the same place on the second sweep logged, and nothing else',
    fail: 'dismissing a faint repeat as static, logging a streak that moved, or logging before the second pass',
    rule: 'Pass 1: watch only. Pass 2: the ghost of pass 1 sits above each live row; press Enter while the band is up if the live streak lines up with its ghost.' },
  rush: 'Logged the brightest streak on one sweep and called the bands clear.',
  captions: { 'logged noise': 'log entry struck out', 'missed contact': 'faint tone fades', 'too early': 'log entry struck out' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dwell = m.calm ? 1.9 : 1.5;
    const reps = new Set(); while (reps.size < 2 + Math.floor(r() * 2)) reps.add(Math.floor(r() * 6));
    m.bands = BANDS.map((b, i) => { const x1 = rf(r, 0.1, 0.9), rep = reps.has(i); let x2 = x1 + rf(r, -0.015, 0.015);
      if (!rep) { const off = rf(r, 0.15, 0.35) * (x1 > 0.5 ? -1 : 1); x2 = x1 + off; }
      return { b, x1, x2, rep, a1: rf(r, 0.5, 1), a2: rep ? rf(r, 0.25, 0.6) : rf(r, 0.4, 1), logged: false }; });
    m.rounds = 12; m.round = 0;
    const pos = () => { const k = Math.floor(m.t / dwell); return { pass: k < 6 ? 1 : 2, i: k % 6, k, into: m.t - k * dwell }; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !ENTER(code)) return false; const p = pos(); if (p.k >= 12) return true; const b = m.bands[p.i];
      if (p.pass === 1) { m.fault('too early'); return true; } if (b.logged) return true;
      if (!b.rep) { m.fault('logged noise'); b.logged = true; return true; } b.logged = true; return true;
    };
    m.last = 0;
    m.tick = (dt) => {
      if (!m.live(dt)) return; const k = Math.floor(m.t / dwell); m.round = Math.min(12, k + 1);
      while (m.last < k) { if (m.last >= 6) { const b = m.bands[m.last - 6]; if (b.rep && !b.logged) m.fault('missed contact'); } m.last++; }
      if (k >= 12 && m.state === 'play') m.win();
    };
    m.hint = () => { const p = pos(); return p.pass === 2 && p.k < 12 && p.into > 0.5 && m.bands[p.i].rep && !m.bands[p.i].logged ? [['Enter', true]] : []; };
    m.bad = () => 'Enter';
    m.view = () => ({ b: m.bands.map(b => [+b.x1.toFixed(3), +b.x2.toFixed(3), b.rep]) });
    m.buttons = () => [['Enter', 'Log contact']];
    m.draw = (c, W, H, P) => {
      const p = pos(), b = m.bands[Math.min(p.i, 5)], x0 = 20, w = 360, streak = (x, y, h, a) => { c.fillStyle = `rgba(247,201,162,${a})`; c.fillRect(x0 + x * w - 3, y, 6, h); };
      txt(c, `PASS ${Math.min(p.pass, 2)} · ${b.b}`, 20, 18, { size: 12, col: COL.gold }); txt(c, `band ${p.i + 1} / 6`, 380, 18, { size: 10, col: COL.dim, align: 'right' });
      box(c, x0, 30, w, 36, 'rgba(255,255,255,.04)', null, 4); box(c, x0, 74, w, 36, 'rgba(255,255,255,.06)', COL.peri, 4);
      for (let k = 0; k < 40; k++) { const nx = (Math.sin(k * 12.9 + p.k * 7.1 + Math.floor(m.t * 6)) + 1) / 2; c.fillStyle = 'rgba(200,200,255,.12)'; c.fillRect(x0 + nx * w, 76 + (k % 8) * 4, 2, 2); }
      if (p.pass === 2) { streak(b.x1, 32, 32, 0.22); txt(c, 'ghost: pass 1', x0 + 4, 44, { size: 9, col: COL.dim }); streak(b.x2, 76, 32, b.a2); }
      else streak(b.x1, 76, 32, b.a1);
      txt(c, 'live sweep', x0 + 4, 122, { size: 9, col: COL.dim });
      txt(c, p.pass === 1 ? 'first pass: watch only' : b.logged ? (b.rep ? '✓ contact logged' : '✗ logged noise') : 'same spot as the ghost? Enter to log', 20, 148, { size: 11, col: b.logged ? (b.rep ? P.good : P.bad) : COL.pale });
    };
    return m;
  },
});
