// Pilot: fuel and flight log update. Each new log line opens pre-filled with the previous entry's figure, which is never quite the tank's
// level now. Dial the figure on the gauge panel into the log, digit wheel by digit wheel (up/down turns the wheel under the cursor, left/right
// moves the cursor), and file it with Enter. Filing the old figure untouched is the from-memory mistake; any other mismatch is a log that
// disagrees with the tank. Both are faults.
import { define, machine, ri, pick, shuffle, txt, box, bar, COL, ARROW, ENTER } from './kit.js';

const SHIPS = ['Shuttle Halley', 'Shuttle Cochrane', 'Shuttle Galileo', 'Shuttle Magellan', 'Shuttle Drake'];
const digits = (v) => String(v).padStart(3, '0').split('').map(Number);

export default define({
  job: { billet: 'pilot', label: 'Fuel and flight log update', type: 'loop' },
  title: 'Fuel figures dialled into the log', dept: 'flight', host: 'console', tool: 'Flight log console',
  how: 'Each log line starts with the LAST entry\'s figure. Dial in the figure on the gauge panel: ↑/↓ turn the digit wheel under the cursor, ←/→ move the cursor, Enter files the line.',
  keys: ['← → cursor', '↑ ↓ digit', 'Enter file'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'dial the wheels', input: 'arrows+enter',
    win: 'every shuttle fuel line filed with exactly the gauge figure, not the stale prefill',
    fail: 'filing the previous entry\'s figure from memory, or a figure that disagrees with the tank',
    rule: 'The log opens on the previous figure. Turn each digit wheel with up and down, move along with left and right, and press Enter once it matches the gauge.' },
  rush: 'Wrote the fuel figures down from memory of the morning.',
  captions: { 'copied from last': 'error chirp', 'log disagrees': 'error chirp' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, ships = shuffle(r, SHIPS);
    m.lines = [0, 1, 2].map(k => { const ship = ships[k], gauge = ri(r, 180, 960);
      let prev = digits(gauge); const n = ri(r, 1, 2); for (let j = 0; j < n; j++) { const p = ri(r, 0, 2); prev[p] = (prev[p] + pick(r, [1, 2, 3, 7, 8, 9])) % 10; }
      return { ship, gauge, prev: +prev.join('') }; });
    m.round = 1; m.rounds = 3; m.i = 0; m.cur = 0; m.w = digits(m.lines[0].prev); m.flash = 0;
    const L = () => m.lines[m.i];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), e = ENTER(code); if (!a && !e) return false; if (!down) return true;
      if (a === 'L') m.cur = Math.max(0, m.cur - 1); else if (a === 'R') m.cur = Math.min(2, m.cur + 1);
      else if (a === 'U') m.w[m.cur] = (m.w[m.cur] + 1) % 10; else if (a === 'D') m.w[m.cur] = (m.w[m.cur] + 9) % 10;
      else if (e) { const v = +m.w.join(''), l = L();
        if (v === l.gauge) { m.ev('filed', { v }); m.i++; if (m.i >= m.lines.length) { m.win(); return true; } m.round = m.i + 1; m.cur = 0; m.w = digits(L().prev); }
        else { m.fault(v === l.prev ? 'copied from last' : 'log disagrees'); m.flash = 0.7; } }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); };
    m.hint = () => { if (!L()) return []; const g = digits(L().gauge), j = g.findIndex((x, k) => x !== m.w[k]); if (j < 0) return [['Enter', true], ['Enter', false]];
      const k = j !== m.cur ? (j < m.cur ? 'ArrowLeft' : 'ArrowRight') : ((g[j] - m.w[j] + 10) % 10 <= 5 ? 'ArrowUp' : 'ArrowDown'); return [[k, true], [k, false]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ lines: m.lines.map(l => [l.ship, l.gauge, l.prev]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowRight', '▶'], ['Enter', 'File line']];
    m.draw = (c, W, H, P) => {
      const l = L() || m.lines[2]; txt(c, 'GAUGE PANEL', 12, 18, { size: 11, col: COL.peri }); txt(c, l.ship, 12, 36, { size: 12, col: COL.pale });
      txt(c, (l.gauge / 10).toFixed(1) + ' %', 12, 64, { size: 22, col: COL.gold }); bar(c, 12, 74, 150, 10, l.gauge / 1000, {});
      txt(c, 'FLIGHT LOG', 210, 18, { size: 11, col: COL.peri }); txt(c, `${l.ship}  fuel`, 210, 36, { size: 11, col: COL.dim });
      for (let k = 0; k < 3; k++) { const x = 210 + k * 40 + (k === 2 ? 14 : 0); box(c, x, 46, 32, 40, 'rgba(255,255,255,.07)', k === m.cur ? COL.gold : COL.dim, 5); txt(c, m.w[k], x + 16, 74, { size: 20, align: 'center' }); }
      txt(c, '.', 290, 80, { size: 20 }); txt(c, '%', 344, 74, { size: 14, col: COL.dim });
      txt(c, `last entry: ${(l.prev / 10).toFixed(1)} %`, 210, 104, { size: 10, col: COL.dim });
      for (let k = 0; k < m.i; k++) txt(c, `✓ ${m.lines[k].ship}  ${(m.lines[k].gauge / 10).toFixed(1)} %`, 12, 112 + k * 14, { size: 10, col: P.good });
      if (m.flash > 0) txt(c, 'LOG ≠ GAUGE', W - 12, H - 10, { size: 12, col: P.bad, align: 'right' });
    };
    return m;
  },
});
