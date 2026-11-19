// Counsellor: watch for fatigue in the science shift. Standing at the back of the lab, you see four analysts' entry streams scroll toward the
// NOW line. Most entries are clean; a tired analyst re-enters the same reading (↺) or stalls for a long pause (zz). Move to the analyst's row
// (↑ / ↓) and flag the sign (Space) as it crosses NOW. When two analysts each show two signs, call the rest break (Enter). Flagging a clean
// entry is a false alarm; a sign that scrolls past unflagged is bad data logged; calling the break too early is crying wolf.
import { define, machine, ARROW, SPACE, ENTER, rf, ri, shuffle, txt, box, COL } from './kit.js';

const ANALYSTS = ['Dr. Seo', 'Lt. Marr', 'Ens. Adeyemi', 'Dr. Rask', 'Ens. Kahn', 'Lt. Duval'];
export default define({
  job: { billet: 'counsel', label: 'Watch for fatigue in the science shift', type: 'task:survey' },
  title: 'Fatigue signs on the entry stream', dept: 'medical', host: 'console', tool: 'Science shift log, sensor timestamps',
  how: 'Move to an analyst\'s row with ↑ / ↓ and press Space as a ↺ re-entry or zz pause crosses the NOW line. Once two analysts show two signs each, press Enter to call the rest break.',
  keys: ['↑ / ↓ row', 'Space flag sign', 'Enter rest break'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'flag fatigue', input: 'arrows+space+enter', win: 'the fatigue signs of two tired analysts flagged as they happen and a rest break called once both show the pattern',
    fail: 'flagging clean entries, letting re-entries and stalls scroll past into the log, or calling the break before the pattern is there',
    rule: 'Entries scroll left to NOW. Select the row and press Space while a ↺ or zz sits on NOW. Two flagged signs makes an analyst TIRED; Enter with two TIRED analysts calls the break.' },
  rush: 'Told the whole shift to take five and left.',
  captions: { 'false flag': 'analyst looks up, puzzled', 'bad data': 'error chime', 'cried wolf': 'lead analyst sighs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, win = m.calm ? 0.5 : 0.35, names = shuffle(r, ANALYSTS).slice(0, 4), tired = shuffle(r, [0, 1, 2, 3]).slice(0, 2);
    m.rows = names.map(n => ({ n, flags: 0 })); m.ev2 = []; let t = rf(r, 1.8, 2.4); const per = [0, 0];
    while (per[0] < 3 || per[1] < 3) { let w = r() < 0.5 ? 0 : 1; if (per[w] >= 3) w = 1 - w; per[w]++; m.ev2.push({ row: tired[w], at: t, kind: r() < 0.5 ? '↺' : 'zz', done: false, miss: false }); t += rf(r, 1.0, 1.5) * (m.calm ? 1.25 : 1); }
    m.noise = []; for (let row = 0; row < 4; row++) for (let x = rf(r, 0.3, 1); x < t + 4; x += rf(r, 0.6, 1.1)) if (!m.ev2.some(e => e.row === row && Math.abs(e.at - x) < win + 0.25)) m.noise.push({ row, at: x });
    m.sel = ri(r, 0, 3); m.rounds = 4; m.round = 0;
    const tiredN = () => m.rows.filter(x => x.flags >= 2).length;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { m.sel = Math.max(0, Math.min(3, m.sel + (a === 'D' ? 1 : -1))); return true; }
      if (SPACE(code)) { const e = m.ev2.find(x => x.row === m.sel && !x.done && !x.miss && Math.abs(x.at - m.t) <= win); if (!e) { if (!m.ev2.some(x => x.row === m.sel && x.done && m.t - x.at < 0.6)) m.fault('false flag'); return true; }
        e.done = true; m.rows[m.sel].flags++; m.round = Math.min(4, m.rows.reduce((s, x) => s + Math.min(2, x.flags), 0)); return true; }
      if (ENTER(code)) { if (tiredN() >= 2) m.win(); else m.fault('cried wolf'); return true; }
      return !!a;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const e of m.ev2) if (!e.done && !e.miss && m.t > e.at + win) { e.miss = true; m.fault('bad data'); } };
    m.hint = () => {
      if (tiredN() >= 2) return [['Enter', true]]; const e = m.ev2.find(x => !x.done && !x.miss); if (!e) return [];
      if (m.sel !== e.row) return [[m.sel < e.row ? 'ArrowDown' : 'ArrowUp', true]]; return Math.abs(e.at - m.t) <= win * 0.6 ? [['Space', true]] : [];
    };
    m.bad = () => 'Space';
    m.view = () => ({ names, ev: m.ev2.map(e => [e.row, e.kind, +e.at.toFixed(2)]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Flag'], ['Enter', 'Rest break']];
    m.draw = (c, W, H, P) => {
      const NX = 150, px = 46; txt(c, `TIRED analysts ${tiredN()} / 2`, 14, 16, { size: 11, col: COL.gold }); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(NX, 22, 2, 140); txt(c, 'NOW', NX, 19, { size: 9, align: 'center', col: COL.dim });
      m.rows.forEach((row, i) => { const y = 30 + i * 34; box(c, 8, y, 384, 28, i === m.sel ? 'rgba(125,151,232,.16)' : 'rgba(255,255,255,.03)', i === m.sel ? COL.peri : null, 4);
        txt(c, row.n, 14, y + 13, { size: 10, col: COL.pale }); txt(c, row.flags >= 2 ? 'TIRED ▲' : `${row.flags} flag${row.flags === 1 ? '' : 's'}`, 14, y + 24, { size: 9, col: row.flags >= 2 ? COL.warn : COL.dim });
        for (const n of m.noise) if (n.row === i) { const x = NX + (n.at - m.t) * px; if (x > 96 && x < 392) { c.fillStyle = 'rgba(243,238,230,.35)'; c.fillRect(x - 3, y + 10, 6, 8); } }
        for (const e of m.ev2) if (e.row === i) { const x = NX + (e.at - m.t) * px; if (x > 96 && x < 392) txt(c, e.done ? '✓' : e.kind, x, y + 19, { size: 13, align: 'center', col: e.done ? P.good : e.miss ? P.bad : COL.warn }); } });
    };
    return m;
  },
});
