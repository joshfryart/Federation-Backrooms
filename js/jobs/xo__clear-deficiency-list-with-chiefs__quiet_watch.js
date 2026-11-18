// XO: clear the deficiency list with the chiefs. Work down the list oldest first. Each chief gives a status; mark it fixed, deferred or
// blocked, but only once the line is complete: fixed needs a retest date, deferred a new date, blocked the missing part. A vague answer
// must be pressed for the missing detail first (and sometimes the truth changes). Marking an incomplete or wrong line is a fault.
import { define, machine, DIG, SPACE, shuffle, pick, ri, txt, box, COL } from './kit.js';

const ITEMS = ['Turbolift 3 door sticks', 'Deck 4 fire damper slow', 'Shuttle 2 nav beacon dim', 'Cargo hoist brake squeal', 'Sickbay sterilizer seal', 'Holodeck emitter dead pixel', 'Galley vent fan rattle', 'Aft sensor shroud loose'];
const CHIEF = ['Chief Engineer', 'Ops Chief', 'Deck Chief', 'Quartermaster', 'Chief Medical'];
const PARTS = ['a seal kit', 'two relay cards', 'a damper motor', 'an emitter tile', 'a brake pad set'];
const ST = ['', 'FIXED', 'DEFERRED', 'BLOCKED'];
export default define({
  job: { billet: 'xo', label: 'Clear deficiency list with chiefs', type: 'task:quiet_watch' },
  title: 'Deficiency list date chase', dept: 'command', host: 'console', tool: 'Ready room desk comm and stylus',
  how: 'Work down the list: if a chief\'s answer has no date or part, press them with Space; once the line is complete mark it 1 fixed, 2 deferred or 3 blocked.',
  keys: ['Space press the chief', '1 fixed', '2 deferred', '3 blocked'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'chase dates', input: 'digits+space', win: 'every deficiency line closed with its true status and the date or part that backs it',
    fail: 'marking a line fixed on the chief\'s word with no date, deferring with no new date, or marking the wrong status',
    rule: 'Read the chief\'s answer. If the DATE / PART box is empty, Space presses them for it (the answer may change). Then 1 fixed, 2 deferred, 3 blocked.' },
  rush: 'Marked the whole list deferred to next quarter.',
  captions: { 'incomplete entry': 'stylus refuses', 'wrong mark': 'pad buzz', press: 'chief sighs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, its = shuffle(r, ITEMS).slice(0, 5), wait = m.calm ? 0.9 : 0.7;
    m.rows = its.map((t, i) => {
      const st = ri(r, 1, 3), vague = r() < 0.55, flip = vague && st === 1 && r() < 0.4, day = `stardate ${ri(r, 41100, 41990)}.${ri(r, 1, 9)}`, part = pick(r, PARTS);
      const fin = flip ? 3 : st, det = fin === 3 ? part : day;
      const say = vague ? (st === 1 ? 'Should be fixed now, I think.' : st === 2 ? 'We will get to it, later on.' : 'Waiting on stores, as usual.') : fin === 1 ? `Fixed and retested on ${day}.` : fin === 2 ? `Deferred to ${day}, crew on the reactor.` : `Blocked: no ${part} aboard.`;
      const pressed = flip ? `Actually… still waiting on ${part}.` : fin === 1 ? `Retested on ${day}.` : fin === 2 ? `New date ${day}.` : `Missing ${part}.`;
      return { t, chief: CHIEF[i], st: vague ? st : fin, fin, det: vague ? '' : det, full: det, say, pressed, vague, pr: 0, mark: 0 };
    });
    m.i = 0; m.at = wait; m.rounds = 5; m.round = 0;
    const x = () => m.rows[m.i], live = () => m.t >= m.at, complete = (y) => !!y.det;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const y = x(), d = DIG(code);
      if (SPACE(code)) { if (live() && !y.det && !y.pr) { y.pr = m.t; m.ev('press', { i: m.i }); } return true; }
      if (d < 1 || d > 3) return false; if (!live()) return true;
      if (!complete(y)) { m.fault('incomplete entry'); return true; } if (d !== y.fin) { m.fault('wrong mark'); return true; }
      y.mark = d; m.i++; m.round++; m.at = m.t + wait; if (m.i >= m.rows.length) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const y = x(); if (y && y.pr && !y.det && m.t - y.pr >= wait) { y.det = y.full; y.st = y.fin; } };
    m.hint = () => { const y = x(); if (!y || !live()) return []; if (!y.det) return y.pr ? [] : [['Space', true]]; return [['Digit' + y.fin, true]]; };
    m.bad = () => { const y = x(); return !y || !live() ? null : 'Digit' + (y.det ? y.fin % 3 + 1 : y.st); };
    m.view = () => ({ rows: m.rows.map(y => [y.t, y.fin, y.vague]) });
    m.buttons = () => [['Space', 'Press'], ['Digit1', '1 Fixed'], ['Digit2', '2 Deferred'], ['Digit3', '3 Blocked']];
    m.draw = (c, W, H, P) => {
      m.rows.forEach((y, k) => { const yy = 8 + k * 15, s = k === m.i; txt(c, `${s ? '▶' : ' '} ${y.t}`, 12, yy + 10, { size: 10, col: s ? COL.gold : COL.dim }); if (y.mark) txt(c, ST[y.mark], W - 14, yy + 10, { size: 10, col: P.good, align: 'right' }); });
      const y = x(); if (!y) return; box(c, 8, 86, W - 16, 76, 'rgba(255,255,255,.05)', COL.peri, 8);
      if (!live()) { txt(c, `Calling ${y.chief}…`, 18, 106, { size: 12, col: COL.pale }); return; }
      txt(c, `${y.chief}: "${y.say}"`, 18, 104, { size: 11 }); if (y.pr) txt(c, y.det ? `"${y.pressed}"` : 'pressing…', 18, 122, { size: 11, col: COL.pale });
      txt(c, 'DATE / PART:', 18, 150, { size: 11, col: COL.gold }); txt(c, y.det || '________  (press with Space)', 110, 150, { size: 11, col: y.det ? P.good : COL.warn });
    };
    return m;
  },
});
