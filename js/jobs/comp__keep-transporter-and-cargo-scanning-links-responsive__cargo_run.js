// Computer specialist: keep the transporter and cargo scanning links responsive. Purge the stale entries from the scanner link buffer (cursor
// Up / Down, Space purges the selected one; a live entry must stay), then set the link priority dial (Left / Right) so a test lookup meets the
// cargo card's time while the transporter chief's own scans stay under their limit. Test lookups run on their own every few seconds.
import { define, machine, ARROW, SPACE, ri, shuffle, clamp, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'comp', label: 'Keep transporter and cargo scanning links responsive', type: 'task:cargo_run' },
  title: 'Scanner link buffer and priority', dept: 'operations', host: 'console', tool: 'Transporter scanner link console',
  how: 'Select each buffer entry older than 30 s (Up / Down) and purge it (Space). Then turn the priority dial (Left / Right) until the cargo lookup is inside the card time without stalling the chief\'s scans. Three test lookups in a row must pass.',
  keys: ['Up / Down select entry', 'Space purge entry', 'Left / Right priority dial'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'purge then share', input: 'arrows+space', win: 'stale scanner buffer entries purged and three automatic test lookups in a row passing for both cargo and the transporter chief',
    fail: 'purging a live buffer entry, cargo lookups over the card time, or so much cargo priority that the chief\'s scans stall',
    rule: 'Stale entries slow every cargo lookup. Each priority notch takes cargo time down and adds to the chief\'s scan time; only a narrow band of notches keeps both under their limits when the next test runs.' },
  rush: 'Cranked cargo priority to full and left the buffer clogged.',
  captions: { 'purged live entry': 'pattern buffer warning', 'lookup slow': 'lookup timeout tone', 'chief stalled': 'transporter chief grumbles' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 6, ns = ri(r, 2, 3), stale = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ns));
    m.buf = Array.from({ length: n }, (_, i) => ({ id: `PB-${ri(r, 100, 999)}`, age: stale.has(i) ? ri(r, 34, 90) : ri(r, 2, 22) }));
    m.p = ri(r, 0, 2); m.lo = ri(r, 3, 6); m.w = m.calm ? 2 : 1; m.c0 = ri(r, 140, 180); m.t0 = ri(r, 40, 70);
    m.lc = m.c0 - 12 * m.lo; m.lt = m.t0 + 9 * (m.lo + m.w); m.sel = 0; m.nt = 5; m.gap = m.calm ? 3.6 : 3; m.streak = 0; m.last = null; m.rounds = 3; m.round = 0;
    const cargo = () => m.c0 + 15 * m.buf.filter(b => b.age > 30).length - 12 * m.p, chief = () => m.t0 + 9 * m.p;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { m.sel = clamp(m.sel + (a === 'D' ? 1 : -1), 0, m.buf.length - 1); return true; }
      if (a === 'L' || a === 'R') { m.p = clamp(m.p + (a === 'R' ? 1 : -1), 0, 10); return true; }
      if (!SPACE(code)) return false; const b = m.buf[m.sel]; if (!b) return true;
      if (b.age <= 30) { m.fault('purged live entry'); return true; }
      m.buf.splice(m.sel, 1); m.sel = clamp(m.sel, 0, m.buf.length - 1); m.ev('purge', { id: b.id }); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.buf.forEach(b => { b.age += dt; }); m.nt -= dt; if (m.nt > 0) return; m.nt = m.gap;
      const c = cargo(), t = chief(); m.last = [c, t];
      if (c > m.lc) { m.fault('lookup slow'); m.streak = 0; } else if (t > m.lt) { m.fault('chief stalled'); m.streak = 0; } else { m.streak++; }
      m.round = m.streak; if (m.streak >= 3) m.win();
    };
    m.hint = () => {
      const k = m.buf.findIndex(b => b.age > 30); if (k >= 0) return k === m.sel ? [['Space', true]] : [[k > m.sel ? 'ArrowDown' : 'ArrowUp', true]];
      const tg = m.lo + Math.floor(m.w / 2); return m.p < tg ? [['ArrowRight', true]] : m.p > tg ? [['ArrowLeft', true]] : [];
    };
    m.bad = () => 'ArrowRight';
    m.view = () => ({ b: m.buf.map(b => b.age), lo: m.lo, c: m.c0 });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Purge'], ['ArrowLeft', '◀ dial'], ['ArrowRight', 'dial ▶']];
    m.draw = (c, W, H, P) => {
      txt(c, 'LINK BUFFER', 14, 16, { size: 10, col: COL.dim });
      m.buf.forEach((b, i) => { const y = 22 + i * 21, old = b.age > 30; box(c, 10, y, 150, 18, i === m.sel ? 'rgba(240,147,58,.18)' : 'rgba(255,255,255,.04)', i === m.sel ? COL.orange : null, 5); txt(c, `${b.id}  ${Math.round(b.age)} s ${old ? '▲old' : ''}`, 18, y + 13, { size: 11, col: old ? COL.warn : COL.ink }); });
      const cg = cargo(), ch = chief();
      txt(c, `Priority dial ${m.p} / 10 → cargo`, 180, 22, { size: 12, col: COL.gold }); bar(c, 180, 28, 200, 8, m.p / 10, { col: COL.gold });
      txt(c, `Cargo lookup ${cg} ms  (card ≤ ${m.lc}) ${cg > m.lc ? '✗' : '✓'}`, 180, 62, { size: 11, col: cg > m.lc ? P.bad : P.good });
      txt(c, `Chief scan ${ch} ms  (limit ≤ ${m.lt}) ${ch > m.lt ? '✗' : '✓'}`, 180, 82, { size: 11, col: ch > m.lt ? P.bad : P.good });
      txt(c, `Next test lookup in ${Math.max(0, m.nt).toFixed(1)} s`, 180, 110, { size: 11, col: COL.peri }); txt(c, `Passed in a row: ${m.streak} / 3`, 180, 128, { size: 11, col: COL.pale });
    };
    return m;
  },
});
