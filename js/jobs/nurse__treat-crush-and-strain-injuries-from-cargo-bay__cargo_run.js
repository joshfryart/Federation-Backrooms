// Nurse: treat crush and strain injuries from the cargo bay. Probe the injured limb segment by segment to find the tender injury and any
// swelling, choose a splint length from the tray, and fit it so it covers the whole injury but sits on no swollen segment. You may only fit
// over segments you have probed.
import { define, machine, ARROW, SPACE, ENTER, DIG, ri, pick, txt, box, COL } from './kit.js';

const LIMBS = [['Left forearm', ['elbow', 'upper', 'mid', 'lower', 'wrist', 'hand', 'palm', 'fingers']], ['Right lower leg', ['knee', 'upper shin', 'mid shin', 'lower shin', 'ankle', 'heel', 'foot', 'toes']], ['Left upper arm', ['shoulder', 'deltoid', 'upper', 'mid', 'lower', 'elbow', 'crook', 'forearm']]];
export default define({
  job: { billet: 'nurse', label: 'Treat crush and strain injuries from cargo bay', type: 'task:cargo_run' },
  title: 'Probe and splint', dept: 'medical', host: 'console', tool: 'Splint tray',
  how: 'Probe along the limb (↑ / ↓ move, Space probe) to find the tender injury and any swelling, pick a splint (1 – 3) and fit it (Enter) over the injury but clear of the swelling.',
  keys: ['↑ / ↓ move', 'Space probe', '1 – 3 splint', 'Enter fit'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'probe and fit', input: 'arrows+space+digits+enter', win: 'both patients splinted over the whole injury with no splint pressing a swollen segment',
    fail: 'fitting a splint that misses part of the injury, presses on swelling, or covers segments you never probed',
    rule: 'Space probes the segment under the marker: TENDER is injury, SWOLLEN must stay free. Splints cover 2, 3 or 4 segments starting at the marker. Every covered segment must be probed first.' },
  rush: 'Wrapped the whole limb in the long splint and sent them back to work.',
  captions: { 'circulation blocked': 'patient gasps', 'injury not covered': 'patient winces', 'fitted blind': 'nurse tuts' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const mk = () => { const [limb, segs] = pick(r, LIMBS), L = ri(r, 2, 4), s = ri(r, 1, 8 - L - 1), a = s + ri(r, 0, L - 1), b = Math.min(s + L - 1, a + ri(r, 0, 1)); const sw = r() < 0.5 ? s - 1 : s + L; const st = Array(8).fill('normal'); for (let k = a; k <= b; k++) st[k] = 'tender'; if (sw >= 0 && sw < 8) st[sw] = 'swollen'; return { limb, segs, st, probed: Array(8).fill(false), sol: [s, L], done: false }; };
    m.pts = [mk(), mk()]; m.k = 0; m.pos = 0; m.len = 2; m.rounds = 2; m.round = 0;
    const P0 = () => m.pts[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code), p = P0();
      if (a === 'U' || a === 'D') { m.pos = Math.max(0, Math.min(7, m.pos + (a === 'D' ? 1 : -1))); return true; }
      if (SPACE(code)) { p.probed[m.pos] = true; return true; }
      if (d >= 1 && d <= 3) { m.len = d + 1; return true; }
      if (ENTER(code)) {
        const cov = Array.from({ length: m.len }, (_, k) => m.pos + k);
        if (cov.at(-1) > 7) { m.fault('injury not covered'); return true; }
        if (cov.some(k => !p.probed[k])) { m.fault('fitted blind'); return true; }
        if (cov.some(k => p.st[k] === 'swollen')) { m.fault('circulation blocked'); return true; }
        if (p.st.some((v, k) => v === 'tender' && !cov.includes(k))) { m.fault('injury not covered'); return true; }
        p.done = true; m.k++; m.round++; m.pos = 0; m.len = 2; if (m.k >= 2) m.win(); return true;
      }
      return false;
    };
    m.hint = () => {
      const p = P0(); if (!p) return []; const [s, L] = p.sol, need = Array.from({ length: L }, (_, k) => s + k).find(k => !p.probed[k]);
      if (need != null) return [[m.pos < need ? 'ArrowDown' : m.pos > need ? 'ArrowUp' : 'Space', true]];
      if (m.len !== L) return [['Digit' + (L - 1), true]]; return [[m.pos < s ? 'ArrowDown' : m.pos > s ? 'ArrowUp' : 'Enter', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ pts: m.pts.map(p => [p.limb, p.st.join(',')]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Probe'], ['Digit1', '1 short'], ['Digit2', '2 mid'], ['Digit3', '3 long'], ['Enter', 'Fit']];
    m.draw = (c, W, H, P) => {
      const p = P0() || m.pts[1]; txt(c, `${p.limb.toUpperCase()}  ·  patient ${Math.min(m.k + 1, 2)} / 2`, 14, 18, { size: 12, col: COL.gold });
      for (let k = 0; k < 8; k++) {
        const y = 26 + k * 17, inS = k >= m.pos && k < m.pos + m.len, v = p.probed[k] ? p.st[k] : null; box(c, 60, y, 150, 15, v === 'tender' ? 'rgba(255,90,72,.35)' : v === 'swollen' ? 'rgba(255,179,71,.4)' : v ? 'rgba(79,208,106,.18)' : 'rgba(255,255,255,.05)', inS ? COL.lav : null, 4);
        txt(c, p.segs[k], 66, y + 12, { size: 10 }); if (v) txt(c, v === 'tender' ? 'TENDER ✚' : v === 'swollen' ? 'SWOLLEN ▲' : 'ok', 206, y + 12, { size: 9, align: 'right', col: v === 'normal' ? P.good : COL.warn });
        if (k === m.pos) txt(c, '▶', 46, y + 12, { size: 12, col: COL.orange });
      }
      txt(c, `Splint: ${['', '', 'short (2)', 'mid (3)', 'long (4)'][m.len]}`, 230, 50, { size: 12, col: COL.pale }); txt(c, 'Cover every TENDER', 230, 80, { size: 10, col: COL.dim }); txt(c, 'Keep SWOLLEN free', 230, 96, { size: 10, col: COL.dim });
    };
    return m;
  },
});
