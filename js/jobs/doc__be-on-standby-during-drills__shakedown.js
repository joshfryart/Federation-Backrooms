// Doc: be on standby during drills. A long quiet watch at the biobed with the drill timer running. Two kinds of event break the quiet: the drill
// calls for the probe (Enter to clip it on) and the oxygen figure drops (Space to call it out). Each must be answered inside its window and with
// the right key; pressing when nothing has happened, or the wrong key, breaks the watch.
import { define, machine, SPACE, ENTER, rf, ri, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Be on standby during drills', type: 'task:shakedown' },
  title: 'Standby watch at the biobed', dept: 'medical', host: 'console', tool: 'Vitals monitor and drill timer',
  how: 'Wait and watch the monitor. When the drill calls the probe press Enter; when the oxygen figure drops press Space to call it. Press nothing while the monitor is steady.',
  keys: ['Enter clip the probe on call', 'Space call a dropping oxygen figure'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'stand watch', input: 'space+enter', win: 'four quiet-stretch events answered in turn: the probe clipped on each drill call and the oxygen drop called out each time',
    fail: 'pressing during a steady monitor, using the wrong key for an event, or letting an event sit past its window',
    rule: 'Most of the time nothing happens: do not press. A PROBE CALL banner wants Enter, a falling oxygen figure wants Space, both within about two seconds.' },
  rush: 'Stood by the door and only looked at the monitor when someone shouted.',
  captions: { jumpy: 'monitor chirp', 'wrong call': 'monitor chirp', missed: 'drop alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, win = m.calm ? 3.2 : 2.2; let t = rf(r, 3, 4.5);
    const kinds = [0, 1, 0, 1].sort(() => r() - 0.5); m.ev4 = kinds.map((k) => { const e = { a: t, k, done: false }; t += rf(r, 3.5, 4.5); return e; });
    m.rounds = 4; m.round = 0;
    const act = () => m.ev4.find(e => !e.done && m.t >= e.a);
    const done = (e) => { e.done = true; m.round++; if (m.round >= 4) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const k = SPACE(code) ? 1 : ENTER(code) ? 0 : -1; if (k < 0) return false; const e = act();
      if (!e) m.fault('jumpy'); else if (e.k !== k) m.fault('wrong call'); else done(e); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const e = act(); if (e && m.t > e.a + win) { e.done = true; m.round++; m.fault('missed'); } };
    m.o2 = () => { const e = act(); return e && e.k === 1 ? Math.max(86, 97 - (m.t - e.a) * 6) : 97 - 0.4 * Math.sin(m.t * 1.7); };
    m.hint = () => { const e = act(); return e && m.t - e.a > 0.5 ? [[e.k ? 'Space' : 'Enter', true]] : []; };
    m.bad = () => (act() ? null : 'Space');
    m.view = () => ({ ev: m.ev4.map(e => [+e.a.toFixed(2), e.k]) });
    m.buttons = () => [['Enter', 'Clip probe'], ['Space', 'Call O2 drop']];
    m.draw = (c, W, H, P) => {
      const e = act(), o = m.o2(); box(c, 20, 14, 150, 80, '#0d0c18', COL.dim, 6); txt(c, `${o.toFixed(0)}`, 95, 68, { size: 40, col: e && e.k ? COL.warn : P.good, align: 'center' }); txt(c, 'SpO2 %', 95, 86, { size: 10, col: COL.dim, align: 'center' });
      txt(c, 'DRILL TIMER', 195, 28, { size: 11, col: COL.dim }); txt(c, `${Math.floor(m.t)} s`, 195, 56, { size: 24 });
      if (e && !e.k) txt(c, 'PROBE CALL', 195, 90, { size: 16, col: COL.gold }); else if (e) txt(c, 'O2 FALLING', 195, 90, { size: 16, col: COL.warn }); else txt(c, 'steady', 195, 90, { size: 14, col: COL.dim });
      if (e) bar(c, 195, 100, 170, 8, Math.max(0, 1 - (m.t - e.a) / win), { col: COL.peri });
      txt(c, `events answered ${m.round} / 4`, 20, 124, { size: 12, col: COL.pale });
    };
    return m;
  },
});
