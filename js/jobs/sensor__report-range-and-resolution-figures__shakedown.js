// Sensor officer: report range and resolution figures (shakedown). The calibration record lists the array's elements. Before the range and
// resolution go to the bridge, every element that was NOT a clean pass must be listed with its reason, read from the record's note:
// 1 no power, 2 mount obstructed, 3 out of test time, 4 tested and FAILED. Move down the record (↑ / ↓), key the reason on each such row,
// then send (Enter). The quoted range only comes down to the honest figure once failed elements are listed. Listing a clean element, keying
// the wrong reason, or sending with a gap left off are faults.
import { define, machine, ARROW, DIG, ENTER, ri, pick, shuffle, txt, box, lamp, COL } from './kit.js';

const NOTES = { 1: ['no power to mount', 'EPS feed isolated', 'breaker locked out'], 2: ['scaffold across aperture', 'mount blocked by panel', 'cover plate not removed'],
  3: ['test window closed', 'ran out of time', 'not reached before stand-down'], 4: ['return 40 % low', 'failed: noise floor high', 'failed: lost lock twice'] };
const WHY = ['', 'no power', 'obstructed', 'no time', 'FAILED'];
export default define({
  job: { billet: 'sensor', label: 'Report range and resolution figures', type: 'task:shakedown' },
  title: 'Untested element list before sending', dept: 'sciences', host: 'console', tool: 'Bridge console calibration record',
  how: 'Go down the calibration record (↑ / ↓) and key the reason (1-4) on every element that was not a clean pass, using its note; then send the figures to the bridge (Enter).',
  keys: ['↑ / ↓ move down the record', '1 power · 2 obstructed · 3 time · 4 failed', 'Enter send'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'list the gaps', input: 'arrows+digits+enter', win: 'range and resolution sent with every untested or failed array element listed against the reason its note gives',
    fail: 'sending an optimistic range with an untested or failed element left off, keying a reason the note does not give, or listing a clean element',
    rule: 'Rows marked PASS need nothing. Every other row has a note: read it, move onto the row and key its reason 1-4. The quoted range drops once failures are listed. Enter sends.' },
  rush: 'Read the best element’s range to the bridge as the array’s range.',
  captions: { 'left off': 'bridge trusts a blind spot', 'wrong reason': 'record query', padded: 'bridge queries the list' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 6;
    const kinds = shuffle(r, [0, 0, 0, ri(r, 1, 3), 4, r() < 0.5 ? ri(r, 1, 3) : 0]);
    m.rows = kinds.map((k, i) => ({ id: `E${i + 1}`, k, note: k ? pick(r, NOTES[k]) : '', rng: k === 4 ? ri(r, 18, 26) : k ? 0 : ri(r, 30, 44), res: ri(r, 2, 9) / 10, set: 0 }));
    m.cur = 0; m.round = 0; m.rounds = m.rows.filter(x => x.k).length;
    const quote = () => Math.min(...m.rows.filter(x => !x.k || (x.k === 4 && x.set === 4)).map(x => x.rng));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code); if (!(a === 'U' || a === 'D') && !(d >= 1 && d <= 4) && !ENTER(code)) return !!a; if (!down) return true;
      if (a) { m.cur = Math.max(0, Math.min(N - 1, m.cur + (a === 'D' ? 1 : -1))); return true; }
      if (d) { const w = m.rows[m.cur]; if (w.set) return true; if (!w.k) m.fault('padded'); else if (w.k !== d) m.fault('wrong reason'); else { w.set = d; m.round++; } return true; }
      if (m.rows.some(x => x.k && !x.set)) m.fault('left off'); else m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const t = m.rows.findIndex(x => x.k && !x.set); if (t < 0) return [['Enter', true]]; if (t !== m.cur) return [[t > m.cur ? 'ArrowDown' : 'ArrowUp', true]]; return [['Digit' + m.rows[t].k, true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ r: m.rows.map(x => [x.k, x.rng]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Digit1', '1 power'], ['Digit2', '2 obstr.'], ['Digit3', '3 time'], ['Digit4', '4 failed'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      txt(c, 'CALIBRATION RECORD', 14, 16, { size: 11, col: COL.gold });
      m.rows.forEach((w, i) => { const y = 22 + i * 20; box(c, 14, y, 262, 18, i === m.cur ? 'rgba(244,194,91,.18)' : 'rgba(255,255,255,.04)', i === m.cur ? COL.gold : null, 3);
        txt(c, w.id, 20, y + 13, { size: 11, col: COL.pale }); txt(c, w.k ? (w.k === 4 ? `tested · ${w.rng} kkm · ${w.note}` : `UNTESTED · ${w.note}`) : `PASS · ${w.rng} kkm · ${w.res} mr`, 46, y + 13, { size: 10, col: w.k ? COL.warn : COL.dim });
        if (w.set) { lamp(c, 290, y + 9, 6, P.good, 'diamond'); txt(c, WHY[w.set], 300, y + 13, { size: 9 }); } });
      const q = quote(), lo = Math.max(...m.rows.filter(x => !x.k).map(x => x.res));
      txt(c, `QUOTE  range ${q} 000 km · res ${lo} mr`, 14, 150, { size: 12, col: COL.ink }); txt(c, '1 power 2 obstructed 3 time 4 failed', 14, 164, { size: 9, col: COL.dim });
    };
    return m;
  },
});
