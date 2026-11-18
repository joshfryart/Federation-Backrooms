// Chief engineer: engineering status to the XO. Four station readings sit behind their numbers: press a station to pull its live value (it
// takes a moment to come up, and goes stale a few seconds later). Write a station's line with Enter only while its reading is live. Mark as
// worries (Space) the two stations running closest to their limits, then Enter on a full pad sends the status. A line written from an
// unopened or stale reading, a worry on a comfortable station, or a send with the worries missing is a report the bridge will find false.
import { define, machine, DIG, SPACE, ENTER, rf, shuffle, txt, box, bar, COL } from './kit.js';

const ST = [['Warp field', 'MC'], ['EPS grid', '%'], ['Gravity plating', 'g'], ['Life support', 'ppm']];
export default define({
  job: { billet: 'ce', label: 'Engineering status to the XO', type: 'loop' },
  title: 'Live-pull status pad', dept: 'engineering', host: 'console', tool: 'Status pad and bridge channel',
  how: 'Press 1 – 4 to pull a station\'s live reading, then Enter to write its line while it is live. Space marks the open station as a worry: pick the two closest to their limit. Enter on a full pad sends it to the bridge.',
  keys: ['1 – 4 pull live reading', 'Enter write line / send', 'Space mark worry'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'pull-live write', input: 'digits+space+enter', win: 'all four status lines written from freshly pulled readings, the two nearest-limit stations marked as worries, and the pad sent',
    fail: 'writing a line from an unopened or stale reading, marking a comfortable station as a worry, or sending the pad without both worries',
    rule: 'A station\'s reading appears a moment after you press its number and turns STALE after a few seconds. Enter writes the open line only while it is LIVE. The margin to the limit is shown: Space the two smallest. Enter on the full pad sends.' },
  rush: 'Sent the standard all-clear line from memory.',
  captions: { 'unverified line': 'bridge queries the report', 'misplaced worry': 'XO: "why is that a worry?"', 'all-clear sent': 'bridge channel click' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, load = 0.7, fresh = m.calm ? 6.5 : 4.5;
    const margins = shuffle(r, [rf(r, 3, 7), rf(r, 8, 12), rf(r, 22, 30), rf(r, 34, 45)]);
    m.st = ST.map(([n, u], k) => ({ n, u, margin: Math.round(margins[k]), val: +rf(r, 20, 90).toFixed(1), age: -1, line: false, worry: false }));
    const order = m.st.map((s, k) => k).sort((a, b) => m.st[a].margin - m.st[b].margin); m.worries = new Set(order.slice(0, 2));
    m.open = -1; m.rounds = 4; m.round = 0;
    const live = (s) => s.age >= load && s.age < load + fresh;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d && d <= 4) { m.open = d - 1; m.st[m.open].age = 0; return true; }
      const s = m.st[m.open];
      if (SPACE(code)) { if (!s) return true; if (!live(s)) { m.fault('unverified line'); return true; } if (!m.worries.has(m.open)) { m.fault('misplaced worry'); return true; } s.worry = true; return true; }
      if (!ENTER(code)) return false;
      if (m.st.every(x => x.line)) { if (m.st.every((x, k) => x.worry === m.worries.has(k))) m.win(); else m.fault('all-clear sent'); return true; }
      if (!s || !live(s)) { m.fault('unverified line'); return true; }
      if (!s.line) { s.line = true; m.round++; } return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.st.forEach(s => { if (s.age >= 0) s.age += dt; s.val = +(s.val + Math.sin(m.t * 1.3 + s.margin) * dt * 0.4).toFixed(2); }); };
    m.hint = () => {
      if (m.st.every(x => x.line)) { const k = m.st.findIndex((x, i) => m.worries.has(i) && !x.worry); if (k < 0) return [['Enter', true]]; }
      const k = m.st.findIndex((x, i) => !x.line || (m.worries.has(i) && !x.worry)); if (k < 0) return [['Enter', true]]; const s = m.st[k];
      if (m.open !== k || s.age >= load + fresh - 0.3) return [['Digit' + (k + 1), true]]; if (!live(s)) return [];
      if (m.worries.has(k) && !s.worry) return [['Space', true]]; return [['Enter', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ st: m.st.map(s => [s.margin, s.val]) });
    m.buttons = () => [...m.st.map((s, k) => ['Digit' + (k + 1), `${k + 1} ${s.n.split(' ')[0]}`]), ['Space', 'Worry'], ['Enter', 'Write / send']];
    m.draw = (c, W, H, P) => {
      m.st.forEach((s, k) => { const y = 10 + k * 32, on = k === m.open, lv = live(s), loading = s.age >= 0 && s.age < load;
        box(c, 10, y, 380, 28, on ? 'rgba(240,147,58,.16)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 8);
        txt(c, `${k + 1} ${s.n}`, 20, y + 18, { size: 12, col: COL.gold });
        txt(c, loading ? 'pulling…' : lv ? `${s.val.toFixed(1)} ${s.u} · ${s.margin} % to limit` : s.age < 0 ? 'not opened' : 'STALE — pull again', 140, y + 18, { size: 11, col: lv ? COL.ink : COL.dim });
        if (lv) bar(c, 140, y + 22, 120, 3, 1 - (s.age - load) / fresh, { col: P.good });
        txt(c, (s.line ? '✓ line' : '') + (s.worry ? '  ⚠ worry' : ''), 384, y + 18, { size: 11, align: 'right', col: s.worry ? COL.warn : P.good }); });
      txt(c, m.st.every(x => x.line) ? 'Pad full — Enter sends to the bridge' : 'Write each line only from a LIVE reading', 14, H - 14, { size: 11, col: COL.peri });
    };
    return m;
  },
});
