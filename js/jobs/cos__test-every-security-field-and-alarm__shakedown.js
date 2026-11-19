// Chief of security: test every security field and alarm. Trip the alarms strictly in their numbered order (digit). Each trip sounds and its
// matching field emitter lamp should light and stay lit through the watch period; a lamp that never lights, or lights and drops out, must be
// flagged on the test sheet (Enter) before the next alarm will trip. Flagging a lamp that held, or tripping out of turn, is a fault.
import { define, machine, DIG, ENTER, rf, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const N = 6, ZONE = ['Cell 1', 'Cell 2', 'Cell 3', 'Brig door', 'Armory hatch', 'Lift 3'];
export default define({
  job: { billet: 'cos', label: 'Test every security field and alarm', type: 'task:shakedown' },
  title: 'Numbered alarm trip sheet', dept: 'security', host: 'console', tool: 'Brig alarm trip panel',
  how: 'Trip the alarms in number order (1 to 6). Watch the matching emitter lamp to the end of its watch bar: if it is dark at the end, press Enter to flag it before tripping the next.',
  keys: ['1-6 trip that alarm', 'Enter flag a dark lamp'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'trip in turn', input: 'digits+enter', win: 'all six alarms tripped in number order, each emitter lamp watched to the end of its window and every dark or dropped lamp flagged',
    fail: 'tripping out of turn or past an unflagged dark lamp, or flagging a lamp that held',
    rule: 'Only the next number trips. A lamp may light late or light and die, so judge it only when the watch bar is full: lit then means pass (automatic); dark means Enter.' },
  rush: 'Ticked every line on the test sheet from the console summary.',
  captions: { 'out of turn': 'panel buzz', 'skipped dark': 'sheet tears', 'false flag': 'pen scratch', trip: 'alarm whoop' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, WATCH = m.calm ? 2.2 : 1.8;
    const kinds = shuffle(r, ['good', 'good', 'good', 'dark', 'drop', r() < 0.5 ? 'good' : 'drop']);
    m.al = kinds.map((k, i) => ({ k, zone: ZONE[i], on: rf(r, 0.2, 0.8), off: rf(r, 1.0, 1.5), t: -1, res: null }));
    m.cur = 0; m.rounds = N; m.round = 0;
    const lit = (a) => a.t >= a.on && a.k !== 'dark' && !(a.k === 'drop' && a.t >= a.off);
    const advance = () => { m.cur++; m.round = m.cur; if (m.cur >= N) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = m.al[m.cur];
      if (ENTER(code)) { if (a.t >= WATCH && !lit(a)) { a.res = 'flag'; m.ev('flag'); advance(); } else m.fault('false flag'); return true; }
      if (!d || d > N) return false;
      if (a.t >= 0) { if (a.t >= WATCH && !lit(a)) m.fault('skipped dark'); return true; }
      if (d - 1 !== m.cur) { m.fault('out of turn'); return true; }
      a.t = 0; m.ev('trip', { n: d }); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const a = m.al[m.cur]; if (a.t >= 0) { a.t += dt; if (a.t >= WATCH && lit(a)) { a.res = 'ok'; advance(); } } };
    m.hint = () => { const a = m.al[m.cur]; if (!a) return []; if (a.t < 0) return [['Digit' + (m.cur + 1), true]]; return a.t >= WATCH ? [['Enter', true]] : []; };
    m.bad = () => { const a = m.al[m.cur]; return a && a.t < 0 ? 'Digit' + (((m.cur + 1) % N) + 1) : null; };
    m.view = () => ({ kinds: m.al.map(a => a.k) });
    m.buttons = () => [...[1, 2, 3, 4, 5, 6].map(n => ['Digit' + n, `Trip ${n}`]), ['Enter', 'Flag dark']];
    m.draw = (c, W, H, P) => {
      m.al.forEach((a, i) => { const x = 16 + i * 63; box(c, x, 16, 56, 92, i === m.cur ? 'rgba(244,194,91,.14)' : COL.panel, i === m.cur ? COL.gold : null);
        txt(c, `${i + 1}`, x + 28, 34, { size: 15, align: 'center', col: COL.gold }); txt(c, a.zone, x + 28, 50, { size: 8, align: 'center', col: COL.pale });
        if (a.t >= 0 && a.t < WATCH) txt(c, '♪ ♪', x + 28, 66, { size: 10, align: 'center', col: COL.lav });
        const on = a.t >= 0 && lit(a); lamp(c, x + 28, 84, 9, on ? P.good : 'rgba(255,255,255,.12)', on ? 'circle' : 'square');
        if (a.res) txt(c, a.res === 'ok' ? 'PASS' : 'FLAG', x + 28, 104, { size: 9, align: 'center', col: a.res === 'ok' ? P.good : P.bad }); });
      const a = m.al[m.cur]; if (!a) return;
      txt(c, a.t < 0 ? `Trip alarm ${m.cur + 1}` : a.t < WATCH ? 'watching the emitter lamp…' : 'lamp DARK at end of watch: Enter to flag', 16, 128, { size: 11, col: a.t >= WATCH ? COL.warn : COL.ink });
      bar(c, 16, 138, 368, 8, a.t < 0 ? 0 : a.t / WATCH, { col: COL.peri });
    };
    return m;
  },
});
