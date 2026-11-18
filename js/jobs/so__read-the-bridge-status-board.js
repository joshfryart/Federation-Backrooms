// Second officer: read the bridge status board. Note the loud alert lamp, then sweep the system lights left to right. Every amber light,
// including the dim ones low on the board, gets marked on the pad and its department asked for the cause before you step on. Stepping past an
// unmarked amber light, marking a green one, or walking off before the department answers are faults.
import { define, machine, ARROW, SPACE, shuffle, pick, txt, box, lamp, COL } from './kit.js';

const SYS = ['Warp', 'Impulse', 'Shields', 'Sensors', 'Comms', 'Life supp', 'Transport', 'Deflector', 'Sickbay', 'Holds'];
const CAUSE = { Warp: 'injector three running lean', Impulse: 'exhaust temp creeping up', Shields: 'emitter six slow to cycle', Sensors: 'array drift past tolerance', Comms: 'relay six dropping packets',
  'Life supp': 'scrubber two filter loading', Transport: 'pattern buffer flagging errors', Deflector: 'dish alignment off by a hair', Sickbay: 'dermal unit down for parts', Holds: 'hold three seal sensor flickers' };

export default define({
  job: { billet: 'so', label: 'Read the bridge status board', type: 'loop' },
  title: 'Status board light sweep', dept: 'command', host: 'console', tool: 'Bridge status board and department keys',
  how: 'Note the alert lamp, then step along the system lights left to right; mark every amber light, dim ones too, and wait for its department to give the cause.',
  keys: ['→ step along the board', 'Space mark amber and ask'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'sweep-mark', input: 'arrows+space', win: 'three boards swept in order with every amber system light marked and its cause heard',
    fail: 'stepping past a dim amber light unmarked, marking a green light, or leaving before the department answers',
    rule: 'Space notes the alert lamp, → steps one light right. On an amber light (triangle, sometimes faint) press Space and stay until the cause line appears.' },
  rush: 'Read the alert lamp, saw it was green and wrote "board nominal".',
  captions: { 'missed amber': 'pad stylus taps twice', 'false mark': 'console bloop', 'did not wait': 'comm cuts off', 'lamp skipped': 'alert chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, wait = m.calm ? 1.1 : 0.8;
    m.boards = [0, 1, 2].map(() => {
      const names = shuffle(r, SYS).slice(0, 7), amb = shuffle(r, [0, 1, 2, 3, 4, 5, 6]).slice(0, 1 + Math.floor(r() * 3)), dim = pick(r, amb);
      return { alert: pick(r, ['green', 'green', 'yellow']), lights: names.map((n, i) => ({ n, amber: amb.includes(i), dim: i === dim && r() < 0.8, marked: 0 })) };
    });
    m.rounds = 3; m.round = 0; m.pos = 0; m.noted = false;
    const B = () => m.boards[m.round], L = () => B().lights[m.pos - 1];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'R') {
        if (m.pos === 0 && !m.noted) { m.fault('lamp skipped'); m.noted = true; }
        const x = m.pos > 0 ? L() : null;
        if (x && x.amber && !x.marked) { m.fault('missed amber'); x.marked = -1; }
        else if (x && x.marked > 0 && m.t - x.marked < wait) { m.fault('did not wait'); }
        m.pos++; if (m.pos > 7) { m.round++; m.pos = 0; m.noted = false; if (m.round >= 3) m.win(); }
        return true;
      }
      if (SPACE(code)) {
        if (m.pos === 0) { m.noted = true; return true; }
        const x = L(); if (x.marked) return true;
        if (!x.amber) { m.fault('false mark'); x.marked = -1; return true; }
        x.marked = m.t; m.ev('ask', { sys: x.n }); return true;
      }
      return a === 'L';
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (m.pos === 0) return [[m.noted ? 'ArrowRight' : 'Space', true]];
      const x = L(); if (x.amber && !x.marked) return [['Space', true]]; if (x.marked > 0 && m.t - x.marked < wait + 0.05) return []; return [['ArrowRight', true]];
    };
    m.bad = () => (m.pos > 0 && L().amber && !L().marked) ? 'ArrowRight' : m.pos > 0 && !L().amber && !L().marked ? 'Space' : 'ArrowRight';
    m.view = () => ({ b: m.boards.map(b => [b.alert, b.lights.map(x => x.n + (x.amber ? (x.dim ? '~' : '!') : ''))]) });
    m.buttons = () => [['Space', 'Mark / note'], ['ArrowRight', 'Step →']];
    m.draw = (c, W, H, P) => {
      if (m.round >= 3) return; const b = B();
      box(c, 150, 8, 100, 34, m.pos === 0 ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', m.pos === 0 ? COL.orange : null, 10);
      lamp(c, 170, 25, 11, b.alert === 'green' ? P.good : COL.warn, b.alert === 'green' ? 'circle' : 'diamond'); txt(c, m.noted ? `ALERT ${b.alert.toUpperCase()} ✓` : 'ALERT', 186, 29, { size: 10, col: COL.gold });
      b.lights.forEach((x, i) => {
        const X = 10 + i * 55, sel = m.pos === i + 1; box(c, X, 52, 50, 62, sel ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', sel ? COL.orange : null, 8);
        c.globalAlpha = x.amber && x.dim ? 0.45 : 1; lamp(c, X + 25, 72, 10, x.amber ? COL.warn : P.good, x.amber ? 'triangle' : 'circle'); c.globalAlpha = 1;
        txt(c, x.n, X + 25, 98, { size: 9, align: 'center', col: COL.pale });
        if (x.marked > 0) txt(c, '✎', X + 25, 110, { size: 10, align: 'center', col: COL.gold }); else if (x.marked < 0) txt(c, '✗', X + 25, 110, { size: 10, align: 'center', col: P.bad });
      });
      const x = m.pos > 0 ? L() : null;
      const line = !x ? 'Note the alert lamp first (Space).' : x.marked > 0 ? (m.t - x.marked < wait ? `Calling ${x.n}…` : `${x.n}: "${CAUSE[x.n]}" — logged at ${(m.t / 60 + 14).toFixed(2)}`) : 'Light in view: mark it if amber, step on if green.';
      txt(c, line, 12, 140, { size: 11, col: COL.ink }); txt(c, `Board ${m.round + 1} / 3`, W - 12, 160, { size: 10, col: COL.dim, align: 'right' });
    };
    return m;
  },
});
