// Pilot: stand ready for launch. A long stand-by at the launch console with nothing to do but keep the bridge order lamp in view. The lamp
// lights at random for comm checks: acknowledge each with Space inside the time allowed. The bay status board blinks too, and it is not a call.
// After the comm checks the lamp comes on as the LAUNCH call: flip the key cover and start the sequence with Enter. A missed call, an answer
// to nothing, or launching on an ordinary comm check are faults.
import { define, machine, ri, rf, txt, box, lamp, COL, SPACE, ENTER } from './kit.js';

export default define({
  job: { billet: 'pilot', label: 'Stand ready for launch', type: 'task:quiet_watch' },
  title: 'Launch console stand-by', dept: 'flight', host: 'console', tool: 'Bridge order lamp',
  how: 'Watch the bridge order lamp. When it lights for a comm check, press Space before the window closes. Ignore the bay status board. When it shows LAUNCH, press Enter to start the sequence.',
  keys: ['Space acknowledge', 'Enter launch'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'answer the lamp', input: 'space+enter',
    win: 'every random comm check acknowledged inside its window, then the launch call answered with the sequence',
    fail: 'letting a comm check go unanswered, answering the status board blink, or launching on a plain comm check',
    rule: 'The order lamp lights at random: press Space within the window for a comm check and Enter when it reads LAUNCH; the blinking status board is never a call.' },
  rush: 'Sat at the console reading a padd and caught the call late.',
  captions: { 'missed call': 'bridge chime repeats', 'false ack': 'comm click', 'early launch': 'abort klaxon', 'ack only': 'bridge repeats call' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, WIN = m.calm ? 2.8 : 2;
    m.calls = []; let t = rf(r, 1.5, 2.5); const n = ri(r, 3, 4);
    for (let k = 0; k < n; k++) { m.calls.push({ at: +t.toFixed(2), launch: false }); t += rf(r, 2.6, 4.2); } m.calls.push({ at: +t.toFixed(2), launch: true });
    m.blinks = Array.from({ length: 8 }, () => +rf(r, 0.5, t + 2).toFixed(2)).sort((a, b) => a - b);
    m.k = 0; m.rounds = m.calls.length; m.round = 1; m.flash = 0;
    const lit = () => { const c = m.calls[m.k]; return c && m.t >= c.at ? c : null; };
    const answer = () => { m.ev('answered', { k: m.k }); m.k++; m.round = Math.min(m.rounds, m.k + 1); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const s = SPACE(code), e = ENTER(code); if (!s && !e) return false; if (!down) return true;
      const c = lit();
      if (s) { if (!c) { m.fault('false ack'); m.flash = 0.5; } else if (c.launch) { m.fault('ack only'); m.flash = 0.5; } else answer(); }
      if (e) { if (c && c.launch) { m.ev('launch'); m.win(); } else { m.fault('early launch'); m.flash = 0.5; } }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); const c = lit();
      if (c && m.t - c.at > WIN) { m.fault('missed call'); if (m.state !== 'play') return; c.at = m.t + rf(r, 1.2, 2); }   // the bridge calls again
    };
    m.hint = () => { const c = lit(); if (!c || m.t - c.at < 0.4) return [['Space', false], ['Enter', false]]; return c.launch ? [['Enter', true], ['Enter', false]] : [['Space', true], ['Space', false]]; };
    m.bad = () => 'Space';
    m.view = () => ({ calls: m.calls.map(c => c.at), blinks: m.blinks.slice(0, 3) });
    m.buttons = () => [['Space', 'Acknowledge'], ['Enter', 'Launch']];
    m.draw = (c, W, H, P) => {
      const cl = lit(); txt(c, 'BRIDGE ORDER', 70, 22, { size: 11, col: COL.peri, align: 'center' });
      lamp(c, 70, 72, 30, cl ? (cl.launch ? P.bad : P.good) : '#2a2838', cl ? (cl.launch ? 'triangle' : 'circle') : 'square');
      txt(c, cl ? (cl.launch ? 'LAUNCH' : 'COMM CHECK') : '—', 70, 122, { size: 13, col: cl ? COL.ink : COL.dim, align: 'center' });
      if (cl) { const left = Math.max(0, WIN - (m.t - cl.at)); box(c, 30, 130, 80 * left / WIN, 6, COL.gold, null, 3); }
      txt(c, 'BAY STATUS', 230, 22, { size: 11, col: COL.peri }); const on = m.blinks.some(b => m.t >= b && m.t < b + 0.5);
      for (let k = 0; k < 2; k++) { box(c, 230, 34 + k * 30, 140, 24, 'rgba(255,255,255,.06)', null, 5); txt(c, `Shuttle ${k + 1}: ready`, 240, 51 + k * 30, { size: 11, col: COL.pale }); lamp(c, 355, 46 + k * 30, 7, on && k === 0 ? COL.warn : '#3a3850', 'diamond'); }
      txt(c, 'Bay pressure 101 kPa · steady', 230, 112, { size: 11, col: COL.dim });
      txt(c, `Comm checks answered: ${Math.min(m.k, m.calls.length - 1)} / ${m.calls.length - 1}`, 230, 134, { size: 11, col: COL.ink });
      if (m.flash > 0) txt(c, 'BRIDGE: SAY AGAIN?', W - 12, H - 10, { size: 11, col: P.bad, align: 'right' });
    };
    return m;
  },
});
