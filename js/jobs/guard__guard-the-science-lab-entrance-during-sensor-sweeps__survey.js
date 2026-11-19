// Guard: hold the science lab entrance while sensor sweeps run. One arrival at a time steps up to the door. Off the sweep list: turn them back.
// Carrying a sample case: ask to see the seal first, and turn them back if it is broken. Everyone else may go in, but never while the status
// board shows SWEEP LIVE: they have to wait for the gap, and a scientist kept waiting too long pushes past you. Admitting mid-sweep, waving in
// an unshown or broken seal or someone off the list, turning back a listed scientist, or being pushed past are faults.
import { define, machine, ARROW, SPACE, ENTER, rf, ri, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const LIST = ['Dr. Anand', 'Lt. Mbeki', 'Ens. Torvik', 'Dr. Laszlo', 'Sci. Quill', 'Ens. Paget'], OFF = ['Cmdr. Rusk', 'Tech Varga', 'Ens. Lowe'];
export default define({
  job: { billet: 'guard', label: 'Guard the science lab entrance during sensor sweeps', type: 'task:survey' },
  title: 'Lab door sweep-gap admission', dept: 'security', host: 'console', tool: 'Sweep list and status board',
  how: 'Check each arrival against the sweep list. Case carriers show their seal (Up) first. Admit (Enter) listed people only between sweeps; turn back (Space) anyone off the list or with a broken seal.',
  keys: ['↑ ask to see the case seal', 'Enter admit', 'Space turn back'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'admit between sweeps', input: 'arrows+space+enter',
    win: 'six arrivals dealt with: listed people admitted only in the gaps between live sweeps, case seals seen first, and the unlisted or broken-sealed sent back',
    fail: 'opening the door during a live sweep, admitting an unshown seal or an unlisted visitor, or keeping a scientist so long they shove past',
    rule: 'Read the name against the list and look for a case. Up shows the seal. Space sends back unlisted or broken seals; Enter admits, but only while the board reads CLEAR.' },
  rush: 'Propped the lab door and let the science team sort out who belonged.',
  captions: { 'mid-sweep': 'sweep alarm warbles', unsealed: 'case latch clicks', unlisted: 'lab door hisses', 'turned crew': 'indignant protest', 'pushed past': 'shoulder barge' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 6, pat = m.calm ? 7.5 : 5.4;
    const names = shuffle(r, LIST), offs = shuffle(r, OFF), offIdx = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ri(r, 1, 2)));
    m.q = Array.from({ length: N }, (_, k) => { const listed = !offIdx.has(k), cas = r() < 0.5; return { name: listed ? names[k] : offs[k % 3], listed, cas, broken: cas && listed && r() < 0.35, shown: false }; });
    m.sw = []; let t = rf(r, 0.2, 1.0); while (t < 80) { const a = t, b = t + rf(r, 2.0, 2.8); m.sw.push([+a.toFixed(2), +b.toFixed(2)]); t = b + rf(r, 2.6, 3.4); }
    m.i = 0; m.wait = 0; m.gap = 0; m.held = {}; m.rounds = N; m.round = 0;
    m.live_ = () => m.sw.some(([a, b]) => m.t >= a && m.t < b);
    const ok = (p) => p.listed && !p.broken;
    const next = () => { m.i++; m.round = m.i; m.wait = 0; m.gap = 0.4; if (m.i >= N) m.win(); };
    m.key = (code, down = true) => {
      const a = ARROW(code); if (m.state !== 'play' || !(a === 'U' || SPACE(code) || ENTER(code))) return false;
      if (!down) { m.held[code] = false; return true; } if (m.held[code] || m.gap > 0) return true; m.held[code] = true; const p = m.q[m.i];
      if (a === 'U') { if (p.cas) p.shown = true; return true; }
      if (SPACE(code)) { if (ok(p)) m.fault('turned crew'); m.ev('turn back', { name: p.name }); next(); return true; }
      if (m.live_()) { m.fault('mid-sweep'); return true; }
      if (!p.listed) m.fault('unlisted'); else if (p.cas && (!p.shown || p.broken)) m.fault('unsealed');
      m.ev('admit', { name: p.name }); next(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.gap > 0) { m.gap -= dt; return; } m.wait += dt; if (m.wait > pat) { m.fault('pushed past'); next(); } };
    m.hint = () => { const h = Object.keys(m.held).find(k => m.held[k]); if (h) return [[h, false]]; const p = m.q[m.i]; if (!p || m.gap > 0) return [];
      if (!p.listed) return [['Space', true]]; if (p.cas && !p.shown) return [['ArrowUp', true]]; if (p.broken) return [['Space', true]]; return m.live_() ? [] : [['Enter', true]]; };
    m.bad = () => { const h = Object.keys(m.held).find(k => m.held[k]); if (h) return [h, false]; const p = m.q[m.i]; if (!p || m.gap > 0) return null; return ok(p) ? ['Space', true] : ['Enter', true]; };
    m.view = () => ({ q: m.q.map(p => [p.name, p.cas, p.broken]), sw: m.sw.slice(0, 3) });
    m.buttons = () => [['ArrowUp', 'Seal?'], ['Enter', 'Admit'], ['Space', 'Turn back']];
    m.draw = (c, W, H, P) => {
      const live = m.live_(); box(c, 16, 10, 150, 26, live ? 'rgba(255,179,71,.18)' : 'rgba(79,208,106,.12)', live ? P.bad : P.good, 4);
      lamp(c, 30, 23, 7, live ? P.bad : P.good, live ? 'triangle' : 'circle'); txt(c, live ? 'SWEEP LIVE' : 'CLEAR', 44, 28, { size: 12, col: live ? P.bad : P.good });
      txt(c, 'SWEEP LIST', 16, 54, { size: 10, col: COL.gold }); LIST.forEach((n, k) => txt(c, n, 16, 70 + k * 15, { size: 10, col: COL.dim }));
      const p = m.q[m.i]; if (p && m.gap <= 0) {
        box(c, 180, 10, 206, 112, 'rgba(255,255,255,.04)', COL.peri, 4); txt(c, p.name, 192, 34, { size: 15 });
        txt(c, p.cas ? 'carrying a sample case' : 'no case', 192, 56, { size: 11, col: COL.pale });
        if (p.cas) txt(c, !p.shown ? 'seal: not shown' : p.broken ? 'seal: BROKEN ✖' : 'seal: intact ✓', 192, 76, { size: 11, col: !p.shown ? COL.dim : p.broken ? P.bad : P.good });
        txt(c, 'patience', 192, 102, { size: 10, col: COL.dim }); bar(c, 246, 94, 128, 10, 1 - m.wait / pat, { col: m.wait > pat * 0.7 ? COL.warn : COL.peri });
      }
      txt(c, `logged ${m.i} / ${N}`, 384, 150, { size: 11, align: 'right', col: COL.pale });
    };
    return m;
  },
});
