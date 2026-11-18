// Captain: captain's log and standing orders. Hold the recorder key (Space) to dictate each log line; when a line stumbles, let go at once and
// retake it (keeping a stumbled line on the record is a fault). Then turn the posture selector (← / →) to the posture the standing orders page
// requires and save (Enter); saving with the selector on the old posture contradicts the orders: a fault.
import { define, machine, SPACE, ARROW, ENTER, rf, shuffle, pick, txt, box, bar, lamp, COL } from './kit.js';

const LINES = ["Captain's log, stardate", 'Ship holding position at', 'Watch rotation completed without', 'Sensor sweep of the sector shows', 'Crew morale steady; no further'];
const POST = ['Green', 'Yellow', 'Red', 'Grey'];
const SHAPE = { Green: 'circle', Yellow: 'triangle', Red: 'square', Grey: 'diamond' };

export default define({
  job: { billet: 'co', label: "Captain's log and standing orders", type: 'loop' },
  title: 'Log dictation and posture match', dept: 'command', host: 'console', tool: 'Log recorder and orders binder',
  how: 'Hold Space to dictate each log line. If a line stumbles, let go straight away and say it again. Then set the posture selector to the orders page and save.',
  keys: ['Space hold: record', '← → posture', 'Enter save'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'dictate and retake', input: 'space-hold+arrows+enter', win: 'every log line recorded clean with stumbles retaken, saved with the selector on the ordered posture',
    fail: 'recording through a stumble so it stays in the log, or saving while the selector still shows the old posture',
    rule: 'Hold Space and each line records. A STUMBLE flag means release now; the next hold retakes the line clean. Finally match the selector to the orders page with ← / → and press Enter.' },
  rush: 'Rattled off the log in one breath and left the posture selector where it was.',
  captions: { 'stumble kept': 'garbled playback', 'old posture': 'binder snaps shut' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, L = m.calm ? 1.4 : 1.1, stum = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, 3));
    m.lines = LINES.map((s, i) => ({ s: s + ' ' + pick(r, ['…', '— mark.', 'as logged.', '— end line.']), stum: stum.has(i), at: rf(r, 0.3, 0.7), flag: false, done: false }));
    m.req = pick(r, POST); m.sel = (POST.indexOf(m.req) + 1 + Math.floor(r() * 3)) % 4; m.cur = 0; m.prog = 0; m.phase = 'log'; m.rounds = 6; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) {
        const was = m.held.S; m.held.S = down;
        if (was && !down && m.phase === 'log') { const l = m.lines[m.cur]; if (l.flag) { l.flag = false; l.stum = false; m.ev('retake', { line: m.cur }); } m.prog = 0; }
        return true;
      }
      if (!down) return false; const a = ARROW(code);
      if (m.phase === 'post' && (a === 'L' || a === 'R')) { m.sel = (m.sel + (a === 'R' ? 1 : 3)) % 4; return true; }
      if (ENTER(code)) { if (m.phase !== 'post') return true; if (POST[m.sel] !== m.req) { m.fault('old posture'); return true; } m.round++; m.win(); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.phase !== 'log' || !m.held.S) return; const l = m.lines[m.cur];
      m.prog += dt / L; if (l.stum && !l.flag && m.prog >= l.at) { l.flag = true; m.ev('stumble', { line: m.cur }); }
      if (m.prog >= 1) { if (l.flag) { m.fault('stumble kept'); l.flag = false; l.kept = true; } l.done = true; m.round++; m.cur++; m.prog = 0; if (m.cur >= m.lines.length) m.phase = 'post'; }
    };
    m.hint = () => {
      if (m.phase === 'log') { const l = m.lines[m.cur]; return [['Space', !l.flag]]; }
      if (m.held.S) return [['Space', false]]; return POST[m.sel] !== m.req ? [['ArrowRight', true]] : [['Enter', true]];
    };
    m.bad = () => m.phase === 'log' ? ['Space', true] : POST[m.sel] === m.req ? 'ArrowRight' : 'Enter';
    m.view = () => ({ stum: m.lines.map(l => l.stum), at: m.lines.map(l => +l.at.toFixed(2)), req: m.req, sel: m.sel });
    m.buttons = () => [['Space', 'Hold: record'], ['ArrowLeft', '◀ Posture'], ['ArrowRight', 'Posture ▶'], ['Enter', 'Save log']];
    m.draw = (c, W, H, P) => {
      m.lines.forEach((l, i) => {
        const y = 8 + i * 19, on = i === m.cur && m.phase === 'log';
        box(c, 6, y, 250, 17, on ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 8);
        txt(c, l.s, 12, y + 12, { size: 9, col: l.done ? (l.kept ? COL.warn : COL.ink) : on ? COL.pale : COL.dim });
        if (l.done) txt(c, l.kept ? '✗ garbled' : '✓', 252, y + 12, { size: 9, col: l.kept ? P.bad : P.good, align: 'right' });
        if (on && l.flag) txt(c, '▲ STUMBLE — let go', 250, y + 12, { size: 9, col: P.bad, align: 'right' });
      });
      bar(c, 6, 106, 250, 8, m.phase === 'log' ? m.prog : 1, { col: m.held.S ? COL.warn : COL.peri });
      txt(c, m.held.S ? '● REC' : 'recorder idle', 6, 130, { size: 11, col: m.held.S ? P.bad : COL.dim });
      txt(c, 'ORDERS PAGE', 270, 20, { size: 10, col: COL.gold }); txt(c, `posture: ${m.req}`, 270, 38, { size: 13, col: COL.ink });
      txt(c, 'DESK SELECTOR', 270, 70, { size: 10, col: COL.gold }); const s = POST[m.sel];
      lamp(c, 282, 88, 8, s === 'Green' ? P.good : s === 'Red' ? P.bad : COL.warn, SHAPE[s]); txt(c, s, 296, 92, { size: 13, col: s === m.req ? P.good : COL.warn });
      txt(c, m.phase === 'post' ? (s === m.req ? 'matches — Enter save' : 'does not match orders') : 'finish the log first', 270, 116, { size: 10, col: COL.dim });
    };
    return m;
  },
});
