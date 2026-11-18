// Chief science officer: review the sensor anomaly queue. Open the entries lowest confidence first (Up / Down, Space). On the open entry, rerun
// the scan narrower (Right steps the bandwidth dial down to its narrowest stop) and watch the spike on the forward and aft arrays. A real
// contact survives the narrow rerun on BOTH arrays at the SAME bearing: escalate it (2). A spike that vanishes, or that sits at a different
// bearing on the aft array, is an instrument artefact: close it (1). Ruling before the narrow rerun, out of order, or the wrong way is a fault.
import { define, machine, ARROW, SPACE, DIG, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const BW = ['40 MHz', '10 MHz', '2 MHz', '0.5 MHz'];
export default define({
  job: { billet: 'cso', label: 'Review sensor anomaly queue', type: 'loop' },
  title: 'Anomaly rerun on narrow band', dept: 'sciences', host: 'console', tool: 'Anomaly queue terminal',
  how: 'Open the lowest-confidence entry first. Step the bandwidth dial to its narrowest stop, then escalate (2) only if the spike survives on both arrays at the same bearing; otherwise close it as noise (1).',
  keys: ['▲ ▼ pick entry', 'Space open', '▶ narrow bandwidth', '1 close as noise', '2 escalate'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'narrow and rule', input: 'arrows+space+digits', win: 'every queued anomaly opened lowest confidence first, rerun at the narrowest bandwidth and closed or escalated on the two-array bearing agreement',
    fail: 'closing a real contact, escalating an artefact, ruling before the narrow rerun, or opening entries out of confidence order',
    rule: 'Open the lowest confidence entry, step the bandwidth to 0.5 MHz, then compare the forward and aft traces: spike on both at one bearing = escalate (2); gone, or on a different bearing = close (1).' },
  rush: 'Closed the whole queue as sensor noise without rerunning any of it.',
  captions: { 'closed real contact': 'contact lost tone', 'needless alarm': 'bridge alert chirp', 'ruled unrerun': 'rerun reminder beep', 'out of order': 'queue buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 4, confs = shuffle(r, [12, 23, 31, 38, 46, 57, 64, 71]).slice(0, n), kinds = shuffle(r, ['real', 'vanish', 'shift', r() < 0.5 ? 'real' : 'vanish']);
    m.q = confs.map((c, i) => ({ conf: c, brg: ri(r, 3, 33) * 10, arr: r() < 0.5 ? 'forward' : 'aft', kind: kinds[i], done: false, shift: ri(r, 4, 9) * 10 * (r() < 0.5 ? -1 : 1) }));
    m.cur = 0; m.open = -1; m.bw = 0; m.dn = {}; m.bf = 0; m.rounds = n; m.round = 1;
    const lowest = () => { let b = -1; m.q.forEach((e, i) => { if (!e.done && (b < 0 || e.conf < m.q[b].conf)) b = i; }); return b; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code); if (!a && !SPACE(code) && !d) return false;
      const e = down && !m.dn[code]; m.dn[code] = down; if (!e) return true;
      if (m.open < 0) {
        if (a === 'U') m.cur = (m.cur + n - 1) % n; else if (a === 'D') m.cur = (m.cur + 1) % n;
        else if (SPACE(code) && !m.q[m.cur].done) { if (m.cur !== lowest()) m.fault('out of order'); else { m.open = m.cur; m.bw = 0; } }
        return true;
      }
      const q = m.q[m.open];
      if (a === 'R') m.bw = Math.min(3, m.bw + 1); else if (a === 'L') m.bw = Math.max(0, m.bw - 1);
      else if (d === 1 || d === 2) {
        if (m.bw < 3) { m.fault('ruled unrerun'); return true; }
        if (d === 1 && q.kind === 'real') { m.fault('closed real contact'); return true; } if (d === 2 && q.kind !== 'real') { m.fault('needless alarm'); return true; }
        q.done = true; m.open = -1; m.round = Math.min(n, m.q.filter(x => x.done).length + 1); if (lowest() < 0) m.win();
      }
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    const tap = (code) => [[code, !m.dn[code]]];
    m.hint = () => {
      if (m.open < 0) { const t = lowest(); if (t < 0) return []; if (t !== m.cur) return tap((t - m.cur + n) % n <= n / 2 ? 'ArrowDown' : 'ArrowUp'); return tap('Space'); }
      if (m.bw < 3) return tap('ArrowRight'); return tap(m.q[m.open].kind === 'real' ? 'Digit2' : 'Digit1');
    };
    m.bad = () => [m.open < 0 ? 'Space' : 'Digit2', ++m.bf % 2 === 0];
    m.view = () => ({ q: m.q.map(e => [e.conf, e.brg, e.kind]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Open'], ['ArrowLeft', 'Wider'], ['ArrowRight', 'Narrower'], ['Digit1', '1 Close'], ['Digit2', '2 Escalate']];
    m.draw = (c, W, H, P) => {
      m.q.forEach((e, i) => { const y = 14 + i * 26; box(c, 10, y, 120, 22, e.done ? 'rgba(79,208,106,.15)' : 'rgba(255,255,255,.05)', i === m.cur ? COL.gold : null, 4);
        txt(c, `${e.conf}%  ${e.arr}  ${e.brg}°`, 16, y + 15, { size: 11, col: e.done ? COL.dim : COL.ink }); if (e.done) txt(c, '✓', 120, y + 15, { size: 11, align: 'right', col: P.good }); });
      txt(c, 'lowest confidence first', 10, 128, { size: 9, col: COL.dim });
      if (m.open < 0) { txt(c, 'Space: open the selected entry', 150, 70, { size: 12, col: COL.dim }); return; }
      const q = m.q[m.open], nar = m.bw / 3;
      txt(c, `BANDWIDTH ${BW[m.bw]}`, 150, 22, { size: 11, col: m.bw === 3 ? P.good : COL.gold });
      for (const [k, y0] of [['forward', 62], ['aft', 118]]) {
        const own = k === q.arr, on = q.kind === 'real' || (own && q.kind === 'shift') || (q.kind === 'vanish' && nar < 1);
        const bx = q.kind === 'shift' && !own && nar >= 1 ? q.brg + q.shift : q.brg, show = q.kind === 'shift' && !own ? nar >= 1 : on;
        c.strokeStyle = COL.peri; c.lineWidth = 1.5; c.beginPath();
        for (let x = 0; x <= 236; x += 2) { const deg = x / 236 * 360, noise = Math.sin(x * 1.3 + m.t * 7 + y0) * (1 - nar * 0.8) * 6; const sp = show ? 26 * Math.exp(-((deg - bx) ** 2) / 40) : (own && q.kind === 'vanish' ? 26 * (1 - nar) * Math.exp(-((deg - bx) ** 2) / 40) : 0); const y = y0 - sp + noise; x ? c.lineTo(150 + x, y) : c.moveTo(150 + x, y); }
        c.stroke(); txt(c, k.toUpperCase(), 150, y0 + 14, { size: 9, col: COL.dim });
      }
      c.fillStyle = COL.gold; c.fillRect(150 + q.brg / 360 * 236, 30, 1, 104); txt(c, `${q.brg}°`, 152 + q.brg / 360 * 236, 40, { size: 9, col: COL.gold });
      lamp(c, 160, 150, 7, m.bw === 3 ? P.good : COL.warn, m.bw === 3 ? 'circle' : 'triangle'); txt(c, m.bw === 3 ? 'narrow rerun done: 1 close · 2 escalate' : '▶ narrow the band to rerun', 172, 154, { size: 10, col: COL.ink });
    };
    return m;
  },
});
