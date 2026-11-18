// Captain: review trial results with heads. Run down the results sheets (↑ ↓). Circle every measured value outside its spec band (1), call
// its chief (2) and close it (3) only once the chief has given a fix and a date. Some chiefs first say the fault is minor and needs nothing:
// do not accept that; insist (2 again) until they commit to a fix and a date. Circling an in-band value, or closing a fault with no date, is
// a fault.
import { define, machine, ARROW, DIG, ri, rf, shuffle, pick, txt, box, COL } from './kit.js';

const ROWS = [['Engineering', 'Warp field symmetry', '%', 97, 100], ['Engineering', 'Coolant flow', 'l/s', 40, 55], ['Operations', 'Transporter lock', 's', 1, 3], ['Security', 'Phaser recharge', 's', 4, 7],
  ['Science', 'Sensor drift', 'mrad', 0, 4], ['Medical', 'Biobed sync', 'ms', 10, 30], ['Operations', 'Comm latency', 'ms', 5, 20], ['Engineering', 'EPS ripple', '%', 0, 3]];
const FIX = ['replace the coupling', 'recalibrate the array', 'swap the injector', 'flush and re-seal', 'reseat the relay', 'firmware patch'];
const DATE = ['SD 48213', 'SD 48215', 'SD 48216', 'SD 48219', 'SD 48222'];

export default define({
  job: { billet: 'co', label: 'Review trial results with heads', type: 'task:shakedown' },
  title: 'Spec circling and fix-date insist', dept: 'command', host: 'console', tool: 'Trial results sheets and desk comm',
  how: 'Circle each measured value outside its spec band, call its chief, refuse "it is minor", and close the fault only once a fix and a date are on the sheet.',
  keys: ['↑ ↓ row', '1 circle', '2 call / insist', '3 close with date'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'circle and insist', input: 'arrows+digits', win: 'every out-of-spec value circled and closed with a chief’s fix and date, no minor brush-off accepted',
    fail: 'circling a value inside its band, or closing a circled fault on a chief’s say-so without a fix date',
    rule: 'Compare measured with the spec band on each row; 1 circles it if outside. 2 calls the chief; if the answer is "minor", press 2 again to insist. 3 closes only when the answer names a fix and a date.' },
  rush: 'Took the chiefs’ word that everything was minor and filed the sheets.',
  captions: { 'false circle': 'chief: "that is in spec, sir"', 'accepted minor': 'red circle left open' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rows = shuffle(r, ROWS).slice(0, 6), out = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ri(r, 2, 3))), wait = m.calm ? 0.6 : 0.8;
    m.rows = rows.map(([d, n, u, lo, hi], i) => { const span = hi - lo, o = out.has(i), v = o ? (r() < 0.5 ? lo - rf(r, 0.15, 0.6) * span : hi + rf(r, 0.15, 0.6) * span) : lo + rf(r, 0.1, 0.9) * span;
      return { d, n, u, lo, hi, v: +v.toFixed(1), out: o, minor: o && r() < 0.6, circ: false, call: -1, asks: 0, closed: false, fix: pick(r, FIX), date: pick(r, DATE) }; });
    m.sel = 0; m.rounds = out.size; m.round = 0;
    const reply = (w) => w.call < 0 || m.t - w.call < wait ? null : w.minor && w.asks < 2 ? 'minor' : 'dated';
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code), w = m.rows[m.sel];
      if (a === 'U' || a === 'D') { m.sel = (m.sel + (a === 'D' ? 1 : 5)) % 6; return true; }
      if (d === 1) { if (w.circ) return true; if (!w.out) { m.fault('false circle'); return true; } w.circ = true; return true; }
      if (d === 2) { if (!w.circ || w.closed) return true; if (w.call < 0 || reply(w)) { w.call = m.t; w.asks++; } return true; }
      if (d === 3) { if (!w.circ || w.closed) return true; if (reply(w) !== 'dated') { m.fault('accepted minor'); return true; } w.closed = true; m.round++; if (m.rows.every(x => !x.out || x.closed)) m.win(); return true; }
      return !!a || !!d;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      const i = m.rows.findIndex(x => x.out && !x.closed); if (i < 0) return []; if (m.sel !== i) return [['ArrowDown', true]]; const w = m.rows[i];
      if (!w.circ) return [['Digit1', true]]; const rp = reply(w); if (w.call < 0 || rp === 'minor') return [['Digit2', true]]; return rp === 'dated' ? [['Digit3', true]] : [];
    };
    m.bad = () => { const i = m.rows.findIndex(x => !x.out); return m.sel !== i ? 'ArrowDown' : 'Digit1'; };
    m.view = () => ({ rows: m.rows.map(w => [w.n, w.v, w.out, w.minor]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Digit1', '1 Circle'], ['Digit2', '2 Call / insist'], ['Digit3', '3 Close']];
    m.draw = (c, W, H, P) => {
      txt(c, 'measured', 196, 12, { size: 9, col: COL.dim }); txt(c, 'spec', 250, 12, { size: 9, col: COL.dim });
      m.rows.forEach((w, i) => {
        const y = 16 + i * 20, on = i === m.sel; box(c, 6, y, W - 12, 18, on ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 6);
        txt(c, `${w.d}: ${w.n}`, 12, y + 13, { size: 9 }); txt(c, `${w.v} ${w.u}`, 196, y + 13, { size: 10 }); txt(c, `${w.lo}–${w.hi}`, 250, y + 13, { size: 9, col: COL.dim });
        if (w.circ) { c.strokeStyle = P.bad; c.lineWidth = 1.5; c.beginPath(); c.ellipse(214, y + 9, 26, 9, 0, 0, 6.283); c.stroke(); }
        const rp = reply(w), st = w.closed ? `✓ ${w.date}` : !w.circ ? '' : w.call < 0 ? 'call chief' : !rp ? 'calling…' : rp === 'minor' ? '"It is minor, sir."' : `${w.fix}, ${w.date}`;
        txt(c, st, W - 10, y + 13, { size: 8, col: w.closed ? P.good : rp === 'minor' ? COL.warn : COL.pale, align: 'right' });
      });
      txt(c, `faults closed ${m.round} / ${m.rounds}`, 10, 152, { size: 10, col: COL.dim });
    };
    return m;
  },
});
