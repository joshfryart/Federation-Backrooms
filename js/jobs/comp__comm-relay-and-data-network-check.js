// Computer specialist: comm relay and data network check. Ping each relay in the chain (its digit) and compare the reply time with the baseline
// card. One slow reply is line noise; a relay is only high when two pings in a row both come back over baseline. Report it (Space) then, and
// never on a single slow reply. Every relay must be pinged at least once.
import { define, machine, DIG, SPACE, ri, rf, shuffle, txt, box, COL } from './kit.js';

const N = 5;
export default define({
  job: { billet: 'comp', label: 'Comm relay and data network check', type: 'loop' },
  title: 'Relay chain double-ping', dept: 'operations', host: 'console', tool: 'Ops console relay chain view',
  how: 'Ping each relay with its number and compare the reply with the baseline card. If a reply is slow, ping that relay again: only two slow replies in a row make it high. Then press Space to report it by handset.',
  keys: ['1-5 ping relay', 'Space report the last relay pinged as high'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'double-ping', input: 'digits+space', win: 'every relay in the chain pinged and each relay confirmed slow on two consecutive pings reported, none on one',
    fail: 'reporting a relay from a single slow reply, or reporting one whose replies sit under baseline',
    rule: 'A digit pings that relay and its reply lands half a second later. Space reports the last relay pinged. Report only after its last two replies both read over the baseline card.' },
  rush: 'Called in the first slow reply as a fault and moved on.',
  captions: { 'single ping': 'comms officer sighs', 'false report': 'handset click, nothing found' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, high = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 1, 2)));
    m.relays = Array.from({ length: N }, (_, i) => {
      const base = ri(r, 12, 40), noisy = !high.has(i) && r() < 0.6;
      const seq = Array.from({ length: 8 }, (_, k) => high.has(i) ? Math.round(base * rf(r, 1.4, 1.9)) : (noisy && k % 2 === 0 && r() < 0.8) ? Math.round(base * rf(r, 1.4, 2.0)) : Math.round(base * rf(r, 0.6, 0.95)));
      return { base, high: high.has(i), seq, n: 0, hist: [], reported: false };
    });
    m.last = -1; m.pend = null; m.rounds = N; m.round = 0;
    const slow = (q, v) => v > q.base;
    const done = (q) => q.reported || (q.hist.length && !slow(q, q.hist[q.hist.length - 1]));
    const check = () => { m.round = m.relays.filter(done).length; if (m.relays.every(q => q.hist.length && done(q)) && m.relays.every(q => !q.high || q.reported)) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= N) { if (!m.pend) { m.pend = { i: d - 1, t: 0 }; m.last = d - 1; } return true; }
      if (!SPACE(code)) return false; if (m.pend || m.last < 0) return true;
      const q = m.relays[m.last], h = q.hist; if (q.reported) return true;
      if (h.length >= 2 && slow(q, h[h.length - 1]) && slow(q, h[h.length - 2])) { q.reported = true; m.ev('report', { relay: m.last }); check(); }
      else if (h.length && slow(q, h[h.length - 1])) m.fault('single ping'); else m.fault('false report');
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || !m.pend) return; m.pend.t += dt; if (m.pend.t < 0.5) return;
      const q = m.relays[m.pend.i]; q.hist.push(q.seq[q.n % q.seq.length]); q.n++; m.pend = null; check();
    };
    m.hint = () => {
      if (m.pend) return []; const i = m.relays.findIndex(q => !done(q) || !q.hist.length); if (i < 0) return []; const q = m.relays[i], h = q.hist;
      if (!h.length || m.last !== i) return [['Digit' + (i + 1), true]];
      return h.length >= 2 && slow(q, h[h.length - 1]) && slow(q, h[h.length - 2]) ? [['Space', true]] : [['Digit' + (i + 1), true]];
    };
    m.bad = () => { if (m.pend) return null; const q = m.relays[m.last]; return q && q.hist.length && !q.reported ? 'Space' : 'Digit' + ri(r, 1, N); };
    m.view = () => ({ r: m.relays.map(q => [q.base, q.high, q.seq[0]]) });
    m.buttons = () => [...Array.from({ length: N }, (_, i) => ['Digit' + (i + 1), `Ping ${i + 1}`]), ['Space', 'Report high']];
    m.draw = (c, W, H, P) => {
      txt(c, 'RELAY   BASE   REPLIES (ms)', 14, 16, { size: 10, col: COL.dim });
      m.relays.forEach((q, i) => {
        const y = 24 + i * 26, on = i === m.last; box(c, 10, y, W - 20, 22, on ? 'rgba(240,147,58,.16)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 8);
        txt(c, `R${i + 1}`, 18, y + 15, { size: 12, col: COL.gold }); txt(c, `${q.base}`, 66, y + 15, { size: 12, col: COL.pale });
        q.hist.slice(-6).forEach((v, k) => txt(c, (v > q.base ? '▲' : '·') + v, 112 + k * 40, y + 15, { size: 11, col: v > q.base ? P.bad : P.good }));
        if (q.reported) txt(c, 'REPORTED', W - 80, y + 15, { size: 10, col: COL.warn });
        if (m.pend && m.pend.i === i) txt(c, 'pinging…', W - 80, y + 15, { size: 10, col: COL.peri });
      });
      txt(c, 'Two slow in a row = high. One slow = noise: ping again.', 14, H - 6, { size: 10, col: COL.dim });
    };
    return m;
  },
});
