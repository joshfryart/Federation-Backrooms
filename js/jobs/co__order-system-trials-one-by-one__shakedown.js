// Captain: order system trials one by one. The trial list on the arm screen gives the order; the trial keys on the console are numbered by
// panel position, not by list order. Press the key of the next system on the list and wait while its trial runs. If it fails, the list
// locks: call the chief engineer (Enter), wait for the fix, then rerun it. Starting a trial while one runs, out of order, or on a locked
// list is a fault.
import { define, machine, DIG, ENTER, ri, rf, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const SYS = ['Impulse drive', 'Warp field', 'Phaser banks', 'Deflectors', 'Transporters', 'Life support', 'Tractor beam', 'Sensors'];

export default define({
  job: { billet: 'co', label: 'Order system trials one by one', type: 'task:shakedown' },
  title: 'Paced trial sequence', dept: 'command', host: 'console', tool: 'Trial list and trial keys',
  how: 'Start each system trial in list order by finding its key on the panel, wait for the result, and when one fails call the chief and rerun it before moving on.',
  keys: ['1-5 trial key', 'Enter call the chief'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'pace the trials', input: 'digits+enter', win: 'every system trialled in list order, each started only after the last finished, with failures fixed by the chief and rerun',
    fail: 'starting a trial while another is still running, skipping ahead in the list, or pressing on past a failed system',
    rule: 'Find the next list system among the numbered panel keys and press its number. Wait while its bar runs. PASS moves on; FAIL locks the list: Enter calls the chief, and after the fix press that key again.' },
  rush: 'Fired off every trial at once and read the results afterwards.',
  captions: { 'overlapping trial': 'trial key buzz', 'out of order': 'engineering: "that is not next, sir"', 'locked list': 'list locked tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, list = shuffle(r, SYS).slice(0, 5), fails = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 1, 2))), fixT = m.calm ? 1.0 : 1.3;
    m.list = list.map((s, i) => ({ s, dur: rf(r, 1.0, 1.7), fail: fails.has(i), res: null, peak: rf(r, 0.4, 0.95) })); m.pad = shuffle(r, [0, 1, 2, 3, 4]);
    m.i = 0; m.run = -1; m.lock = false; m.call = -1; m.fixed = false; m.rounds = 5; m.round = 0;
    const keyOf = (li) => m.pad.indexOf(li) + 1;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= 5) {
        if (m.run >= 0) { m.fault('overlapping trial'); return true; } const li = m.pad[d - 1];
        if (m.lock && !(m.fixed && li === m.i)) { m.fault('locked list'); return true; } if (li !== m.i) { m.fault('out of order'); return true; }
        m.run = m.t; m.lock = false; m.call = -1; m.fixed = false; m.list[li].rerun = m.list[li].res === 'FAIL'; return true;
      }
      if (ENTER(code)) { if (m.lock && m.call < 0) { m.call = m.t; m.ev('chief'); } return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (m.call >= 0 && !m.fixed && m.t - m.call >= fixT) m.fixed = true;
      if (m.run >= 0) { const x = m.list[m.i]; if (m.t - m.run >= x.dur) { m.run = -1; if (x.fail && !x.rerun) { x.res = 'FAIL'; m.lock = true; } else { x.res = 'PASS'; m.i++; m.round++; if (m.i >= 5) m.win(); } } }
    };
    m.hint = () => { if (m.run >= 0 || m.i >= 5) return []; if (m.lock) return m.call < 0 ? [['Enter', true]] : m.fixed ? [['Digit' + keyOf(m.i), true]] : []; return [['Digit' + keyOf(m.i), true]]; };
    m.bad = () => 'Digit' + keyOf((m.i + 1) % 5);
    m.view = () => ({ list: m.list.map(x => [x.s, x.fail]), panel: m.pad });
    m.buttons = () => [1, 2, 3, 4, 5].map(k => ['Digit' + k, `${k} ${m.list[m.pad[k - 1]].s.split(' ')[0]}`]).concat([['Enter', 'Call chief']]);
    m.draw = (c, W, H, P) => {
      txt(c, 'TRIAL LIST', 10, 14, { size: 10, col: COL.gold });
      m.list.forEach((x, j) => {
        const y = 20 + j * 22, on = j === m.i; box(c, 8, y, 180, 19, on ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 6);
        txt(c, `${j + 1}. ${x.s}`, 14, y + 13, { size: 10 });
        if (x.res) txt(c, x.res === 'PASS' && j < m.i ? '✓ PASS' : '✗ FAIL', 184, y + 13, { size: 9, col: x.res === 'PASS' && j < m.i ? P.good : P.bad, align: 'right' });
      });
      txt(c, 'TRIAL KEYS', 206, 14, { size: 10, col: COL.gold });
      m.pad.forEach((li, k) => { const y = 20 + k * 22; box(c, 204, y, 100, 19, 'rgba(125,151,232,.12)', null, 6); txt(c, `${k + 1}  ${m.list[li].s}`, 210, y + 13, { size: 9 }); });
      if (m.run >= 0) { const x = m.list[m.i], k = (m.t - m.run) / x.dur; bar(c, 312, 30, 80, 10, k, { col: COL.peri }); txt(c, 'running…', 312, 56, { size: 10, col: COL.pale }); bar(c, 312, 64, 80, 6, x.peak * Math.abs(Math.sin(m.t * 6)), { col: COL.lav }); }
      if (m.lock) { lamp(c, 320, 96, 8, P.bad, 'square'); txt(c, 'LIST LOCKED', 332, 100, { size: 10, col: P.bad }); txt(c, m.call < 0 ? 'Enter: call chief' : m.fixed ? 'fixed — rerun' : 'chief working…', 312, 118, { size: 9, col: COL.pale }); }
    };
    return m;
  },
});
