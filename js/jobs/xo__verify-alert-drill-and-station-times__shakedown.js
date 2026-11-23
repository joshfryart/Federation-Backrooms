// XO: verify alert drill and station times. Trigger the drill and stop each station's stopwatch the moment its manned lamp lights; then
// compare your measured time with the time the station logged and query any log that is far off.
import { define, machine, DIG, shuffle, rf, txt, box, lamp, COL } from './kit.js';

const ST = ['Engineering', 'Sickbay', 'Security', 'Weapons'];
export default define({
  job: { billet: 'xo', label: 'Verify alert drill and station times', type: 'task:shakedown' },
  title: 'Alert drill stopwatch', dept: 'command', host: 'console', tool: 'Bridge drill timer',
  how: 'The drill is running: stop each station\'s clock the instant its lamp lights, then check the time each station logged against yours.',
  keys: ['1 – 4 stop a clock', '1 logged time fair', '2 query it'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'stopwatch', input: 'digits', win: 'every station clock stopped as its lamp lit and every logged time checked against the stopwatch',
    fail: 'stopping a clock whose lamp is still dark, letting a lamp go unstopped, or passing a logged time that is far off',
    rule: 'Phase one: press a station\'s number the moment its lamp lights. Phase two: 1 if its logged time is within a second of yours, 2 to query it.' },
  rush: 'Took every station\'s own logged time and signed the drill off.',
  captions: { 'false stop': 'stopwatch click', 'missed lamp': 'drill buzzer', 'wrong call': 'log chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, win = m.calm ? 1.3 : 0.9, order = shuffle(r, [0, 1, 2, 3]);
    m.st = ST.map((name, i) => ({ name, at: 1.5 + order.indexOf(i) * rf(r, 1.2, 1.8) + rf(r, 0, 0.4), meas: null, off: false, rec: 0, judged: 0 }));
    const nOff = 1 + Math.floor(r() * 2), offs = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, nOff));
    m.phase = 0; m.row = 0; m.rounds = 2; m.round = 0;
    const stop = (s, v) => { s.meas = +v.toFixed(1); const off = offs.has(m.st.indexOf(s)); s.off = off; s.rec = +(s.meas + (off ? (r() < 0.5 ? -1 : 1) * rf(r, 2.5, 5) : rf(r, -0.5, 0.5))).toFixed(1); if (m.st.every(x => x.meas != null)) { m.phase = 1; m.round = 1; } };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (!d) return false;
      if (m.phase === 0) { if (d > 4) return false; const s = m.st[d - 1]; if (s.meas != null) return true; if (m.t < s.at) { m.fault('false stop'); return true; } stop(s, m.t - 1.5 + 0.2); return true; }
      if (d > 2) return false; const s = m.st[m.row]; if ((d === 2) !== s.off) { m.fault('wrong call'); return true; }
      s.judged = d; m.row++; if (m.row >= 4) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.phase === 0) for (const s of m.st) if (s.meas == null && m.t > s.at + win) { m.fault('missed lamp'); stop(s, s.at - 1.5 + win + 0.6); } };
    m.hint = () => { if (m.row >= 4) return []; if (m.phase === 0) { const i = m.st.findIndex(s => s.meas == null && m.t >= s.at + 0.1); return i >= 0 ? [['Digit' + (i + 1), true]] : []; } return [[m.st[m.row].off ? 'Digit2' : 'Digit1', true]]; };
    m.bad = () => { if (m.phase === 0) { const i = m.st.findIndex(s => s.meas == null && m.t < s.at); return i >= 0 ? 'Digit' + (i + 1) : null; } return m.st[m.row].off ? 'Digit1' : 'Digit2'; };
    m.view = () => ({ st: m.st.map(s => [s.at.toFixed(2)]), offs: [...offs] });
    m.buttons = () => m.phase === 0 ? ST.map((n, i) => ['Digit' + (i + 1), `${i + 1} ${n}`]) : [['Digit1', '1 Fair'], ['Digit2', '2 Query']];
    m.draw = (c, W, H, P) => {
      txt(c, m.phase === 0 ? `DRILL RUNNING  ${Math.max(0, m.t - 1.5).toFixed(1)} s` : 'COMPARE LOGGED TIMES', 14, 22, { size: 13, col: COL.gold });
      m.st.forEach((s, i) => {
        const y = 36 + i * 32, lit = m.t >= s.at; box(c, 10, y, W - 20, 26, m.phase === 1 && i === m.row ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', m.phase === 1 && i === m.row ? COL.orange : null, 12);
        lamp(c, 28, y + 13, 9, lit ? P.good : '#2a2748', lit ? 'diamond' : 'circle'); txt(c, `${i + 1}  ${s.name}`, 44, y + 17, { size: 12 });
        if (s.meas != null) txt(c, `stopwatch ${s.meas.toFixed(1)} s`, 190, y + 17, { size: 11, col: COL.pale });
        if (m.phase === 1) txt(c, `logged ${s.rec.toFixed(1)} s`, 300, y + 17, { size: 11, col: COL.peri });
        if (s.judged) txt(c, s.judged === 1 ? '✓' : '?', W - 18, y + 17, { size: 13, col: s.judged === 1 ? P.good : COL.warn, align: 'right' });
      });
    };
    return m;
  },
});
