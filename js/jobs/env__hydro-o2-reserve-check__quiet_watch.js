// Environmental tech: hydro O2 reserve check (quiet watch). The log book's level marker starts on the LAST logged figure. Read the reserve tank
// gauge yourself: hold Up/Down to slide the marker onto the needle and log it (Enter). The book then works out the drop rate since the last
// entry; if it is steeper than the rate limit, call the ACE (Space), otherwise file it (Enter). Logging the old figure unread is the classic slip.
import { define, machine, ARROW, ENTER, SPACE, rf, ri, clamp, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Hydro O2 reserve check', type: 'task:quiet_watch' },
  title: 'Reserve gauge read against the book', dept: 'engineering', host: 'console', tool: 'Reserve tank gauge and log book',
  how: 'Hold Up/Down to slide the log marker onto the reserve gauge needle, then Enter to log. If the drop rate shown is over the limit call the ACE (Space), else file it (Enter).',
  keys: ['Up / Down hold: slide the marker', 'Enter log / file', 'Space call the ACE'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'mark the level', input: 'arrows-hold+enter+space', win: 'three reserve readings marked on the needle and each drop rate filed or called to the ACE correctly',
    fail: 'logging the old book figure without reading the gauge, misreading the needle, or filing a drop rate steeper than the limit',
    rule: 'The marker starts on last watch\'s figure. Slide it onto the gauge needle (within the tolerance ticks) and press Enter. Then compare the drop rate with the limit: over it, Space; under it, Enter.' },
  rush: 'Copied the last reserve figure into the book and initialled it.',
  captions: { copied: 'pen scratch', misread: 'log rejected', 'drop unreported': 'ACE comm buzz', 'false alarm': 'ACE sighs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.02 : 0.013, LIM = 1.5;
    let b = rf(r, 0.7, 0.9); m.chk = []; for (let i = 0; i < 3; i++) { const hrs = ri(r, 2, 4), steep = r() < 0.5, rate = steep ? rf(r, 2.0, 3.2) : rf(r, 0.4, 1.0); const g = b - rate * hrs / 100; m.chk.push({ book: b, g, hrs, rate }); b = g; }
    m.i = 0; m.mk = m.chk[0].book; m.moved = false; m.phase = 'read'; m.cd = 0; m.rounds = 3; m.round = 0;
    const C = () => m.chk[m.i];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { m.held[a] = down && m.phase === 'read'; return true; }
      if (!down || !(ENTER(code) || SPACE(code))) return !!a; m.cd = 0.3; const k = C();
      if (m.phase === 'read') { if (SPACE(code)) return true; if (Math.abs(m.mk - k.g) <= tol) { m.phase = 'call'; return true; } m.fault(m.moved ? 'misread' : 'copied'); return true; }
      const over = k.rate > LIM; if (SPACE(code) && !over) { m.fault('false alarm'); return true; } if (ENTER(code) && over) { m.fault('drop unreported'); return true; }
      m.i++; m.round = m.i; if (m.i >= 3) { m.win(); return true; } m.mk = C().book; m.moved = false; m.phase = 'read'; m.held = {}; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.cd -= dt; const v = (m.held.U ? 1 : 0) - (m.held.D ? 1 : 0); if (v) { m.mk = clamp(m.mk + v * 0.12 * dt); m.moved = true; } };
    m.hint = () => {
      const k = C(); if (!k) return []; if (m.phase === 'read') { const d = k.g - m.mk, dead = tol * 0.45; if (Math.abs(d) > dead) return [['ArrowUp', d > 0], ['ArrowDown', d < 0]]; return m.cd > 0 ? [['ArrowUp', false], ['ArrowDown', false]] : [['ArrowUp', false], ['ArrowDown', false], ['Enter', true]]; }
      return m.cd > 0 ? [] : [[k.rate > LIM ? 'Space' : 'Enter', true]];
    };
    m.bad = () => m.cd > 0 ? null : 'Enter';
    m.view = () => ({ c: m.chk.map(k => [+k.g.toFixed(3), +k.rate.toFixed(2)]) });
    m.buttons = () => [['ArrowUp', 'Marker ▲'], ['ArrowDown', 'Marker ▼'], ['Enter', 'Log / file'], ['Space', 'Call ACE']];
    m.draw = (c, W, H, P) => {
      const k = C(); if (!k) return; const x0 = 24, y0 = 14, h = 136, lo = 0.5, sc = (v) => y0 + h - clamp((v - lo) / 0.5) * h;
      box(c, x0, y0, 44, h, 'rgba(255,255,255,.07)', null, 4); for (let t = 0; t <= 10; t++) c.fillRect(x0, y0 + t * h / 10, t % 5 ? 6 : 12, 1);
      c.fillStyle = COL.ink; c.fillRect(x0, sc(k.g) - 1, 44, 2);
      c.fillStyle = COL.gold; c.beginPath(); const ym = sc(m.mk); c.moveTo(x0 + 46, ym); c.lineTo(x0 + 60, ym - 7); c.lineTo(x0 + 60, ym + 7); c.fill();
      c.fillStyle = COL.dim; c.fillRect(x0 - 6, sc(k.g + tol), 4, sc(k.g - tol) - sc(k.g + tol));
      txt(c, 'GAUGE', x0, y0 + h + 14, { size: 9, col: COL.dim });
      txt(c, `book, last watch: ${(k.book * 100).toFixed(1)} %`, 120, 30, { size: 12, col: COL.dim });
      txt(c, `your marker: ${(m.mk * 100).toFixed(1)} %${m.moved ? '' : ' (unread copy)'}`, 120, 52, { size: 13, col: m.moved ? COL.ink : COL.warn });
      if (m.phase === 'call') {
        const over = k.rate > LIM; txt(c, `drop ${k.rate.toFixed(1)} %/h over ${k.hrs} h`, 120, 84, { size: 15, col: over ? P.bad : P.good });
        txt(c, `rate limit ${LIM.toFixed(1)} %/h  ${over ? '▲ OVER' : '● under'}`, 120, 104, { size: 12, col: COL.pale }); bar(c, 120, 114, 240, 8, k.rate / 4, { mark: LIM / 4, col: over ? P.bad : P.good });
      } else txt(c, 'slide the marker onto the needle, Enter', 120, 90, { size: 11, col: COL.dim });
      txt(c, `checks logged ${m.round} / 3`, 120, 150, { size: 11, col: COL.pale });
    };
    return m;
  },
});
