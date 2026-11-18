// Chief engineer: prioritise sickbay power and life support (medical relief). Patients arrive in waves: each wave pulls the biobed bus down and
// thins sickbay's air, so the scrubber gauge falls too. Power comes only from the holding bus, a finite pool. Pick a feed (1 biobeds, 2
// scrubbers) and hold Space to pour holding-bus power into it. Keep both gauges in their green band; the CMO's priority tag names the one that
// may never dip. Overfeeding trips the feeder and wastes the pool; starving the scrubbers to power the beds is the classic mistake.
import { define, machine, DIG, SPACE, rf, pick, clamp, txt, box, bar, lamp, COL } from './kit.js';

const FEED = ['Biobeds', 'Scrubbers'];
export default define({
  job: { billet: 'ce', label: 'Prioritise sickbay power and life support', type: 'task:medical_relief' },
  title: 'Holding bus feed to sickbay', dept: 'engineering', host: 'console', tool: 'Power allocation board',
  how: 'Press 1 (biobeds) or 2 (scrubbers) to pick a feed, and hold Space to pour holding-bus power into it. Keep both gauges in their band as patients arrive; the CMO\'s tagged one may never dip.',
  keys: ['1 / 2 pick feed', 'Space hold: pour power'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'pour the feed', input: 'digits+space-hold', win: 'every patient wave absorbed with biobeds and scrubbers both kept inside their band from a finite holding bus',
    fail: 'a gauge sagging under its band (the CMO\'s tagged one at once), or overfeeding a feed past its band so the feeder trips and the pool is wasted',
    rule: 'Both gauges fall with every patient wave and keep sliding. Choose the feed with 1 or 2 and hold Space to raise it; let go before the top of its band. When both are low, feed the CMO\'s tagged one first.' },
  rush: 'Pushed everything to the biobeds and let the scrubbers take the rest.',
  captions: { 'biobed drop-out': 'biobed alarm', 'scrubbers sagging': 'air handler labours', overfeed: 'feeder trips with a clack', 'protected feed dipped': 'CMO calls engineering' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, lo = m.calm ? 0.4 : 0.45, hi = 0.85, grace = m.calm ? 2 : 1.4, rate = 0.42, dur = 18;
    m.prio = pick(r, [0, 1]); m.g = [rf(r, 0.62, 0.72), rf(r, 0.62, 0.72)]; m.drain = [rf(r, 0.015, 0.03), rf(r, 0.015, 0.03)];
    m.waves = Array.from({ length: 4 }, (_, k) => ({ t: 1.5 + k * rf(r, 3.4, 4.2), d: [rf(r, 0.12, 0.2), rf(r, 0.06, 0.14)] }));
    m.pool = 2.6; m.sel = -1; m.low = [0, 0]; m.w = 0; m.rounds = 4; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (d === 1 || d === 2) { if (down) m.sel = d - 1; return true; }
      if (SPACE(code)) { m.held.S = down; return true; } return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      while (m.w < m.waves.length && m.t >= m.waves[m.w].t) { m.g[0] -= m.waves[m.w].d[0]; m.g[1] -= m.waves[m.w].d[1]; m.w++; m.round = m.w; }
      for (let k = 0; k < 2; k++) m.g[k] -= m.drain[k] * dt;
      if (m.held.S && m.sel >= 0 && m.pool > 0) { const q = Math.min(m.pool, rate * dt); m.pool -= q; m.g[m.sel] += q; if (m.g[m.sel] > hi) { m.fault('overfeed'); m.g[m.sel] = hi - 0.12; m.pool = Math.max(0, m.pool - 0.25); m.held.S = false; } }
      for (let k = 0; k < 2; k++) { if (m.g[k] < lo) { m.low[k] += dt; if ((k === m.prio && m.low[k] > 0.25) || m.low[k] > grace) { m.fault(k === m.prio ? 'protected feed dipped' : k === 0 ? 'biobed drop-out' : 'scrubbers sagging'); m.g[k] = lo + 0.08; m.low[k] = 0; } } else m.low[k] = 0; }
      if (m.t >= dur) m.win();
    };
    const mid = (lo + hi) / 2;
    m.hint = () => { const need = [0, 1].filter(k => m.g[k] < mid - 0.04).sort((a, b) => (a === m.prio ? -1 : 0) - (b === m.prio ? -1 : 0) || m.g[a] - m.g[b]);
      if (!need.length) return [['Space', false]]; const k = need[0]; if (m.sel !== k) return [['Space', false], ['Digit' + (k + 1), true]]; return [['Space', m.g[k] < mid + 0.05]]; };
    m.bad = () => m.sel !== 0 ? 'Digit1' : ['Space', true];
    m.view = () => ({ prio: m.prio, waves: m.waves.map(w => [+w.t.toFixed(1), +w.d[0].toFixed(2)]) });
    m.buttons = () => [['Digit1', '1 Biobeds'], ['Digit2', '2 Scrubbers'], ['Space', 'Pour (hold)']];
    m.draw = (c, W, H, P) => {
      txt(c, `CMO priority: protect ${FEED[m.prio].toUpperCase()}`, 14, 18, { size: 12, col: COL.warn });
      FEED.forEach((n, k) => { const y = 34 + k * 42, on = k === m.sel; box(c, 10, y, W - 20, 36, on ? 'rgba(240,147,58,.16)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 8);
        lamp(c, 26, y + 18, 8, m.g[k] < lo ? P.bad : P.good, m.g[k] < lo ? 'triangle' : 'circle'); txt(c, `${k + 1} ${n}${k === m.prio ? ' ⛨' : ''}`, 40, y + 16, { size: 12 });
        bar(c, 150, y + 10, W - 176, 14, m.g[k], { band: [lo, hi], col: COL.gold }); });
      txt(c, `holding bus ${Math.round(m.pool / 2.6 * 100)} %`, 14, 136, { size: 11, col: COL.peri }); bar(c, 120, 128, W - 146, 8, m.pool / 2.6, { col: COL.lav });
      txt(c, `patient waves ${m.w}/4 · ${m.held.S ? 'POURING' : 'feed closed'}`, 14, H - 10, { size: 11, col: m.held.S ? COL.warn : COL.dim }); };
    return m;
  },
});
