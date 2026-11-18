// Ops: reserve computer time for sciences' data processing. Drag the request's block along the datacore timetable (hold ← →), set the
// priority tag from the request card (digit), and confirm (Enter) once the conflict line has caught up and reads clear. Stores and galley
// slots can share the core; medical and bridge slots cannot. Confirming over a medical or bridge slot, before the line has refreshed, or
// with the wrong tag is a fault.
import { define, machine, ARROW, DIG, ENTER, ri, txt, box, COL } from './kit.js';

const HARD = { M: 'Medical', B: 'Bridge' }, SOFT = { S: 'Stores', G: 'Galley' }, PRI = ['', 'routine', 'high', 'urgent'];

export default define({
  job: { billet: 'ops', label: 'Reserve computer time for data processing', type: 'task:survey' },
  title: 'Datacore timetable booking', dept: 'operations', host: 'console', tool: 'Datacore processing timetable',
  how: 'Hold ← → to drag the sciences block along the timetable, set the priority from the request card (1-3), let the conflict line refresh, and confirm with Enter only when it reads clear.',
  keys: ['← → hold: drag block', '1-3 priority tag', 'Enter confirm'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'drag and book', input: 'arrows-hold+digits+enter', win: 'two processing blocks booked clear of medical and bridge slots with the requested priority tag',
    fail: 'booking over a sickbay or bridge slot, confirming before the conflict line refreshes, or tagging the wrong priority',
    rule: 'The block slides while an arrow is held and snaps to a slot on release. The conflict line refreshes half a second after it stops. Shareable stores and galley slots are fine; M and B are not.' },
  rush: 'Grabbed the first open-looking block and confirmed before the conflict line refreshed.',
  captions: { 'blocked sickbay': 'sickbay records alarm', 'line not read': 'timetable chirps', 'wrong tag': 'scheduler rejects tag' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 24, settle = m.calm ? 0.35 : 0.5, v = m.calm ? 5 : 6.5;
    m.reqs = [0, 1].map(() => ({ len: ri(r, 3, 5), pri: ri(r, 1, 3) })); const t1 = ri(r, 0, 8), t2 = ri(r, 13, N - m.reqs[1].len);
    const keep = new Set(); for (let k = 0; k < m.reqs[0].len; k++) keep.add(t1 + k); for (let k = 0; k < m.reqs[1].len; k++) keep.add(t2 + k);
    m.cells = []; while (m.cells.length < N) { const kind = ri(r, 0, 3), run = ri(r, 1, 4), ch = kind === 0 ? '.' : kind === 1 ? (r() < 0.5 ? 'M' : 'B') : (r() < 0.5 ? 'S' : 'G'); for (let k = 0; k < run && m.cells.length < N; k++) m.cells.push(ch); }
    m.cells = m.cells.map((c, i) => keep.has(i) && HARD[c] ? (r() < 0.5 ? '.' : 'S') : c);
    m.tg = [t1, t2]; m.k = 0; m.x = 10; m.pri = 0; m.still = 9; m.last = -9; m.msg = ''; m.rounds = 2; m.round = 0;
    const Q = () => m.reqs[m.k], pos = () => Math.round(m.x), clash = (p) => { for (let i = p; i < p + Q().len; i++) if (HARD[m.cells[i]] || m.cells[i] === 'X') return true; return false; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { const was = m.held[a]; m.held[a] = down; if (was && !down) m.x = Math.round(m.x); return true; }
      if (!down) return !!DIG(code) || ENTER(code); const d = DIG(code);
      if (d && d <= 3) { m.pri = d; m.last = m.t; return true; }
      if (ENTER(code)) {
        m.last = m.t; const p = pos(), q = Q();
        if (m.still < settle) { m.fault('line not read'); m.msg = 'Conflict line still refreshing'; }
        else if (clash(p)) { m.fault('blocked sickbay'); m.msg = 'That block sits on a medical or bridge slot'; }
        else if (m.pri !== q.pri) { m.fault('wrong tag'); m.msg = `Card says ${PRI[q.pri]}`; }
        else { for (let i = p; i < p + q.len; i++) m.cells[i] = 'X'; m.msg = `Booked slot ${p}–${p + q.len}`; m.k++; m.round++; m.pri = 0; m.x = 10; m.still = 9; if (m.k >= 2) m.win(); }
        return true;
      }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const dir = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0);
      if (dir) { m.x = Math.max(0, Math.min(N - Q().len, m.x + dir * v * dt)); m.still = 0; } else m.still += dt;
    };
    m.hint = () => {
      const q = Q(); if (!q) return []; const tg = m.tg[m.k], dx = tg - m.x;
      if (Math.abs(dx) > 0.45) return [[dx > 0 ? 'ArrowRight' : 'ArrowLeft', true], [dx > 0 ? 'ArrowLeft' : 'ArrowRight', false]];
      if (m.held.L || m.held.R) return [['ArrowLeft', false], ['ArrowRight', false]];
      if (m.t - m.last < 0.15) return []; if (m.pri !== q.pri) return [[`Digit${q.pri}`, true]]; if (m.still < settle + 0.05) return []; return [['Enter', true]];
    };
    m.bad = () => (m.t - m.last < 0.2 ? null : 'Enter');
    m.view = () => ({ cells: m.cells.join(''), reqs: m.reqs.map(q => [q.len, q.pri]) });
    m.buttons = () => [['ArrowLeft', '◀ drag'], ['ArrowRight', 'drag ▶'], ['Digit1', '1 routine'], ['Digit2', '2 high'], ['Digit3', '3 urgent'], ['Enter', 'Confirm']];
    m.draw = (c, W, H, P) => {
      const q = Q(); if (!q) return; const cw = 15, x0 = 20, y0 = 40;
      txt(c, `REQUEST CARD ${m.k + 1}/2 · sciences · ${q.len} h · priority ${PRI[q.pri]}`, 14, 20, { size: 12, col: COL.gold });
      m.cells.forEach((ch, i) => { const hard = HARD[ch] || ch === 'X', soft = SOFT[ch]; box(c, x0 + i * cw, y0, cw - 2, 26, hard ? 'rgba(255,90,72,.35)' : soft ? 'rgba(125,151,232,.25)' : 'rgba(255,255,255,.06)', null, 2); if (ch !== '.') txt(c, ch === 'X' ? 'S·' : ch, x0 + i * cw + 6, y0 + 17, { size: 10, align: 'center' }); });
      box(c, x0 + m.x * cw - 1, y0 - 6, q.len * cw, 38, null, COL.orange, 4);
      for (let h = 0; h <= N; h += 6) txt(c, `${String(h).padStart(2, '0')}00`, x0 + h * cw, y0 + 46, { size: 9, col: COL.dim, align: 'center' });
      const fresh = m.still >= settle, cl = clash(pos());
      txt(c, 'CONFLICT LINE:', 14, 116, { size: 11, col: COL.dim }); txt(c, !fresh ? 'refreshing…' : cl ? '✗ CLASH (medical/bridge)' : '✓ CLEAR', 120, 116, { size: 12, col: !fresh ? COL.warn : cl ? P.bad : P.good });
      txt(c, `tag: ${PRI[m.pri] || '—'}   ·   M medical  B bridge (no sharing)  S stores  G galley (shareable)`, 14, 136, { size: 10, col: COL.pale });
      txt(c, m.msg, 14, H - 10, { size: 11, col: COL.pale });
    };
    return m;
  },
});
