// CMO: report medical readiness to the captain. Each readiness line (beds, staff, supplies, isolation) shows its count and the thresholds from
// the wall card. Rate it 1 green / 2 amber / 3 red, then send the report (Enter). A red line painted green fails the report outright.
import { define, machine, DIG, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Biobeds free', 'Nurses on watch', 'Medical supplies', 'Isolation bays', 'Hypospray stock', 'Stretchers ready'];
export default define({
  job: { billet: 'cmo', label: 'Report medical readiness to captain', type: 'task:shakedown' },
  title: 'Readiness line rating', dept: 'medical', host: 'console', tool: 'Readiness board and wall card',
  how: 'Rate each readiness line against its wall-card thresholds: 1 green, 2 amber, 3 red. Then send the report (Enter). Never paint a red line green.',
  keys: ['1 green', '2 amber', '3 red', 'Enter send report'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'rate readiness lines', input: 'digits+enter',
    win: 'every readiness line rated to its card threshold, then the report sent with the gaps stated honestly',
    fail: 'a red line reported as green, repeated misratings, or sending before every line is rated',
    rule: 'Each line shows a count and its own green and amber cut-offs. Press 1 for at or above green, 2 for at or above amber, 3 for below amber; after the last line press Enter to send.' },
  rush: 'Told the captain everything was green without reading the board.',
  captions: { misrated: 'wrong-rating tone', unfinished: 'report rejected', 'red painted green': 'drill aborted alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = m.calm ? 4 : 5;
    const kinds = shuffle(r, [1, 2, 3, ri(r, 1, 3), ri(r, 1, 3), ri(r, 1, 3)]).slice(0, n); if (!kinds.includes(3)) kinds[ri(r, 0, n - 1)] = 3;
    m.lines = shuffle(r, NAMES).slice(0, n).map((name, i) => { const a = ri(r, 2, 5), g = a + ri(r, 2, 4), k = kinds[i], v = k === 1 ? g + ri(r, 0, 3) : k === 2 ? ri(r, a, g - 1) : ri(r, 0, a - 1); return { name, v, g, a, k }; });
    m.i = 0; m.round = 0; m.rounds = n;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), L = m.lines[m.i];
      if (d >= 1 && d <= 3 && L) { if (d === L.k) { m.i++; m.round = m.i; } else if (L.k === 3 && d === 1) m.fail('red painted green'); else m.fault('misrated'); return true; }
      if (ENTER(code)) { if (m.i >= n) m.win(); else m.fault('unfinished'); return true; }
      return false;
    };
    m.hint = () => m.i >= n ? [['Enter', true]] : [['Digit' + m.lines[m.i].k, true]];
    m.bad = () => { const L = m.lines[m.i]; return L ? 'Digit' + (L.k === 3 ? 1 : (L.k % 3) + 1) : 'Enter'; };
    m.view = () => ({ lines: m.lines.map(l => [l.name, l.v, l.g, l.a]) });
    m.buttons = () => [['Digit1', '1 green'], ['Digit2', '2 amber'], ['Digit3', '3 red'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      txt(c, 'SICKBAY READINESS', 12, 16, { size: 11, col: COL.peri });
      m.lines.forEach((l, i) => { const y = 28 + i * 25, cur = i === m.i; box(c, 10, y - 12, W - 20, 22, cur ? 'rgba(244,194,91,.15)' : 'rgba(255,255,255,.05)', cur ? COL.gold : null, 5);
        txt(c, l.name, 18, y + 3, { size: 12 }); txt(c, String(l.v), 170, y + 3, { size: 14, col: COL.gold }); txt(c, `G >= ${l.g}   A >= ${l.a}`, 220, y + 3, { size: 11, col: COL.dim });
        if (i < m.i) txt(c, ['', 'GREEN', 'AMBER', 'RED'][l.k], W - 18, y + 3, { size: 11, align: 'right', col: l.k === 3 ? P.bad : P.good }); });
      if (m.i >= m.lines.length) txt(c, 'All rated: press Enter to send', W / 2, H - 8, { size: 12, align: 'center', col: COL.pale });
    };
    return m;
  },
});
