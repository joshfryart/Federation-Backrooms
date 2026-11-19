// Chief science officer: cross-check the deep scan results with cartography. Each detection shows its offset from the charted point against
// its tolerance ring, and its spectral class against the chart's class. A detection reading outside its ring may be a measurement wobble or a
// true mismatch: remeasure it (Space). If the remeasure lands inside, it was noise: confirm it (1). If it stays outside twice running, or the
// class disagrees with the chart, it is a real mismatch: flag it (2). Mark the sector verified (Enter) only once every detection is resolved.
import { define, machine, ARROW, SPACE, ENTER, DIG, ri, rf, pick, shuffle, txt, box, lamp, COL } from './kit.js';

const CLS = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
export default define({
  job: { billet: 'cso', label: 'Cross-check results with cartography', type: 'task:survey' },
  title: 'Outlier remeasure against the chart', dept: 'sciences', host: 'console', tool: 'Scan-to-chart comparator',
  how: 'Pick a detection (Up / Down). Inside its ring and class matching: confirm (1). Outside the ring: remeasure (Space) first; back inside = confirm, still outside = flag (2). Class mismatch: flag. Then mark the sector verified (Enter).',
  keys: ['▲ ▼ pick', 'Space remeasure', '1 confirm', '2 flag', 'Enter verify sector'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'remeasure outliers', input: 'arrows+space+digits+enter', win: 'each detection confirmed or flagged on a repeated measurement and its spectral class, then the sector marked verified with nothing open',
    fail: 'flagging a one-off wobble, confirming a repeat outlier or class mismatch, or verifying the sector with a detection unresolved',
    rule: 'Outside the ring once proves nothing: Space for a fresh reading. Two outside readings in a row, or a class that differs from the chart = 2 flag. Inside with a matching class = 1 confirm. Enter when all are resolved.' },
  rush: 'Passed the scan to the bridge with a note saying the chart roughly agreed.',
  captions: { 'flagged noise': 'flag tone', 'flagged unchecked': 'flag tone', 'passed mismatch': 'confirm chime', 'confirmed unresolved': 'confirm chime', 'sector unverified': 'verify reject buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, kinds = shuffle(r, ['noise', 'real', pick(r, ['ok', 'class']), pick(r, ['ok', 'noise', 'real'])]);
    m.d = kinds.map((kind, k) => { const ring = ri(r, 3, 8), inside = () => +rf(r, 0.2, 0.85) * ring, outside = () => +rf(r, 1.3, 2.4) * ring, ch = ri(r, 0, 6);
      const reads = kind === 'ok' || kind === 'class' ? [inside(), inside()] : kind === 'noise' ? [outside(), inside()] : [outside(), outside()];
      return { id: `D-${ri(r, 10, 99)}${'abcd'[k]}`, kind, ring, reads: reads.map(v => +v.toFixed(1)), n: 1, cs: CLS[kind === 'class' ? (ch + ri(r, 1, 3)) % 7 : ch], cc: CLS[ch], res: null }; });
    m.c = 0; m.dn = {}; m.bf = 0;
    const last = (x) => x.reads[x.n - 1], outN = (x) => x.reads.slice(0, x.n).filter(v => v > x.ring).length;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), dg = DIG(code); if (!a && !dg && !SPACE(code) && !ENTER(code)) return false;
      const e = down && !m.dn[code]; m.dn[code] = down; if (!e) return true; const x = m.d[m.c];
      if (a === 'U') m.c = (m.c + 3) % 4; else if (a === 'D') m.c = (m.c + 1) % 4;
      else if (SPACE(code)) { if (!x.res) x.n = 2; }
      else if (dg === 1 && !x.res) { if (x.kind === 'real' || x.kind === 'class') m.fault('passed mismatch'); else if (last(x) > x.ring) m.fault('confirmed unresolved'); else x.res = 'confirmed'; }
      else if (dg === 2 && !x.res) { if (x.kind === 'class' || (x.kind === 'real' && outN(x) >= 2)) x.res = 'flagged'; else if (x.kind === 'real') m.fault('flagged unchecked'); else m.fault('flagged noise'); }
      else if (ENTER(code)) { if (m.d.every(y => y.res)) m.win(); else m.fault('sector unverified'); }
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    const tap = (code) => [[code, !m.dn[code]]];
    m.hint = () => {
      const k = m.d.findIndex(y => !y.res); if (k < 0) return tap('Enter'); if (k !== m.c) return tap('ArrowDown'); const x = m.d[k];
      if (x.kind === 'class') return tap('Digit2'); if (last(x) > x.ring && x.n < 2) return tap('Space'); return tap(x.kind === 'real' ? 'Digit2' : 'Digit1');
    };
    m.bad = () => [m.d[m.c].res ? 'Enter' : 'Digit2', ++m.bf % 2 === 0];
    m.view = () => ({ d: m.d.map(x => [x.kind, x.ring, ...x.reads]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Remeasure'], ['Digit1', '1 Confirm'], ['Digit2', '2 Flag'], ['Enter', 'Verify']];
    m.draw = (c, W, H, P) => {
      txt(c, 'DET     OFFSET / RING     CLASS scan·chart', 14, 18, { size: 9, col: COL.dim });
      m.d.forEach((x, i) => { const y = 24 + i * 30, out = last(x) > x.ring, cm = x.cs !== x.cc; box(c, 10, y, 380, 26, 'rgba(255,255,255,.04)', i === m.c ? COL.gold : null, 4);
        txt(c, x.id, 16, y + 17, { size: 11, col: COL.ink }); txt(c, x.reads.slice(0, x.n).map(v => v.toFixed(1)).join(' → ') + `″ / ${x.ring}″`, 76, y + 17, { size: 11, col: out ? COL.warn : COL.pale });
        lamp(c, 210, y + 13, 7, out ? P.bad : P.good, out ? 'triangle' : 'circle'); txt(c, `${x.cs} · ${x.cc}${cm ? '  ≠' : ''}`, 240, y + 17, { size: 11, col: cm ? COL.warn : COL.dim });
        txt(c, x.res ? x.res.toUpperCase() : 'open', 384, y + 17, { size: 10, align: 'right', col: x.res ? P.good : COL.dim }); });
      txt(c, 'Space remeasure · 1 confirm · 2 flag · Enter verify sector', 14, 158, { size: 10, col: COL.dim });
    };
    return m;
  },
});
