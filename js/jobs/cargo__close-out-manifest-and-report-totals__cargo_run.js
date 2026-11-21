// Cargo: close out the manifest and report the totals. Each category row lists received, late arrivals, damaged and returned crates. The net is
// received plus late minus damaged minus returned: press its digit, then Enter sends the total to the quartermaster once every row is netted.
import { define, machine, DIG, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const CATS = ['Ration crates', 'Spare parts', 'Medical stock', 'Sample cases', 'Fuel cells'];
export default define({
  job: { billet: 'cargo', label: 'Close out manifest and report totals', type: 'task:cargo_run' },
  title: 'Net the manifest rows', dept: 'services', host: 'console', tool: 'Manifest close-out sheet',
  how: 'For each row work out the net: received + late - damaged - returned. Press that digit. When every row is netted press Enter to report it.',
  keys: ['1-9 the net for this row', 'Enter report totals'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'net the totals', input: 'digits+enter',
    win: 'every manifest row netted correctly and the totals sent to the quartermaster',
    fail: 'keying a wrong net, repeatedly, or sending the report before every row is netted',
    rule: 'Each row shows received, late, damaged and returned counts. Net = received + late - damaged - returned. Press the net digit for the highlighted row; after the last row press Enter to send.' },
  rush: 'Reported the manifest total as shipped without netting the damaged crates.',
  captions: { 'wrong net': 'entry rejected', early: 'report refused' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = m.calm ? 3 : 4;
    m.rows = shuffle(r, CATS).slice(0, n).map(name => { const rec = ri(r, 4, 7), late = ri(r, 0, 2), dmg = ri(r, 0, 2), ret = ri(r, 0, 1); return { name, rec, late, dmg, ret, net: rec + late - dmg - ret }; });
    m.i = 0; m.rounds = n; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), row = m.rows[m.i];
      if (d && row) { if (d === row.net) { m.i++; m.round = m.i; } else m.fault('wrong net'); return true; }
      if (ENTER(code)) { if (m.i >= n) m.win(); else m.fault('early'); return true; } return false;
    };
    m.hint = () => m.i >= n ? [['Enter', true]] : [['Digit' + m.rows[m.i].net, true]];
    m.bad = () => m.i >= n ? 'Enter' : 'Digit' + (m.rows[m.i].net % 9 + 1);
    m.view = () => ({ rows: m.rows.map(x => [x.name, x.rec, x.late, x.dmg, x.ret]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['Digit6', '6'], ['Digit7', '7'], ['Digit8', '8'], ['Digit9', '9'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      txt(c, 'ROW', 14, 18, { size: 10, col: COL.dim }); ['recv', 'late', 'dmg', 'ret', 'NET'].forEach((h, k) => txt(c, h, 190 + k * 42, 18, { size: 10, col: COL.dim, align: 'center' }));
      m.rows.forEach((x, i) => { const y = 30 + i * 28, cur = i === m.i; box(c, 8, y - 4, W - 16, 24, cur ? 'rgba(244,194,91,.15)' : 'rgba(255,255,255,.04)', cur ? COL.gold : null, 5);
        txt(c, x.name, 16, y + 13, { size: 12 }); [x.rec, '+' + x.late, '-' + x.dmg, '-' + x.ret].forEach((v, k) => txt(c, v, 190 + k * 42, y + 13, { size: 13, align: 'center', col: COL.pale }));
        txt(c, i < m.i ? x.net : '?', 358, y + 13, { size: 14, align: 'center', col: i < m.i ? P.good : COL.dim }); });
      if (m.i >= m.rows.length) txt(c, 'All netted: Enter to send', W / 2, H - 10, { size: 12, align: 'center', col: COL.gold });
    };
    return m;
  },
});
