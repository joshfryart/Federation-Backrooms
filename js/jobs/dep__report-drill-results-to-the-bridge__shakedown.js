// Deputy security chief, shakedown: report the lockdown drill to the bridge. The drill log lists each door with the seal time its officer
// reported, or NO SEAL. Fill the bridge form a row at a time: key the seal time in tenths of a second (4.7 s -> 4 7) and press Enter. A door
// that never sealed gets no time at all: flag the row red (Space) and commit it (Enter). A keying slip, a time typed against a failed door, or
// a failed row committed without its red flag, would send the bridge a clean form over a seal failure. The last Enter submits.
import { define, machine, DIG, SPACE, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const DOORS = ['Brig entry', 'Cell block', 'Armory link', 'Corridor 4', 'Cargo access', 'Turbolift lobby', 'Shuttle lobby', 'Aft bulkhead'];
export default define({
  job: { billet: 'dep', label: 'Report drill results to the bridge', type: 'task:shakedown' },
  title: 'Drill seal-time form entry', dept: 'security', host: 'console', tool: 'Bridge drill report form',
  how: 'For each row type the seal time from the drill log in tenths (4.7 s is 4 then 7) and press Enter. For a NO SEAL door press Space to flag it red, then Enter. Enter on SUBMIT sends it.',
  keys: ['1-9 key the seal time', 'Space flag the row red', 'Enter commit row / submit'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'key in times', input: 'digits+enter+space', win: 'every drill door copied onto the bridge form with its exact seal time, failed seals flagged red, and the form submitted',
    fail: 'mis-keying a seal time, timing a door that never sealed, or committing a failed door without its red flag',
    rule: 'The highlighted form row matches the same line of the drill log. Type its time digit by digit and Enter; a NO SEAL line takes Space (red flag) then Enter, with no digits.' },
  rush: 'Typed "all doors sealed, good drill" and sent it up.',
  captions: { 'mis-keyed': 'form field flashes', 'timed a failure': 'form field flashes', 'unflagged failure': 'bridge queries the form' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 5, fails = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 1, 2)));
    m.rows = shuffle(r, DOORS).slice(0, n).map((d, i) => ({ d, fail: fails.has(i), t: `${ri(r, 1, 9)}${ri(r, 1, 9)}`, typed: '', flag: false, done: false }));
    m.i = 0; m.rounds = n; m.round = 0;
    const clear = (w) => { const o = m.rows[m.i]; m.fault(w); o.typed = ''; o.flag = false; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code) || (code === 'Digit0' || code === 'Numpad0' ? 10 : 0), sp = SPACE(code), en = ENTER(code);
      if (!d && !sp && !en) return false; if (!down) return true;
      if (m.i >= n) { if (en) m.win(); return true; }
      const o = m.rows[m.i];
      if (d) { if (o.fail) { clear('timed a failure'); return true; } o.typed += d === 10 ? '0' : String(d); if (!o.t.startsWith(o.typed)) clear('mis-keyed'); return true; }
      if (sp) { if (!o.fail) { clear('mis-keyed'); return true; } o.flag = true; return true; }
      if (o.fail ? !o.flag : o.typed !== o.t) { clear(o.fail ? 'unflagged failure' : 'mis-keyed'); return true; }
      o.done = true; m.i++; m.round = m.i; return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.i >= n) return [['Enter', true]]; const o = m.rows[m.i]; if (o.fail) return [[o.flag ? 'Enter' : 'Space', true]]; return o.typed.length < o.t.length ? [['Digit' + o.t[o.typed.length], true]] : [['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ rows: m.rows.map(o => o.d + (o.fail ? 'X' : o.t)) });
    m.buttons = () => [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => ['Digit' + d, String(d)]).concat([['Space', 'Red flag'], ['Enter', 'Enter']]);
    m.draw = (c, W, H, P) => {
      txt(c, 'DRILL LOG', 14, 16, { size: 10, col: COL.peri }); txt(c, 'BRIDGE FORM', 196, 16, { size: 10, col: COL.gold });
      m.rows.forEach((o, k) => { const y = 24 + k * 24, cur = k === m.i;
        txt(c, o.d, 14, y + 15, { size: 11, col: cur ? COL.ink : COL.dim }); txt(c, o.fail ? 'NO SEAL' : `${o.t[0]}.${o.t[1]} s`, 176, y + 15, { size: 11, align: 'right', col: o.fail ? COL.warn : COL.pale });
        box(c, 196, y, 190, 20, o.flag ? 'rgba(255,90,72,.18)' : COL.panel, cur ? COL.gold : 'rgba(255,255,255,.12)', 4);
        txt(c, o.d.split(' ')[0], 204, y + 14, { size: 10, col: COL.dim });
        txt(c, o.flag ? 'RED — no seal' : o.typed ? `${o.typed[0]}${o.typed.length > 1 ? '.' + o.typed[1] : '.'} s` : cur ? '_' : '', 300, y + 14, { size: 11, col: o.flag ? P.bad : COL.ink });
        if (o.done) lamp(c, 376, y + 10, 6, o.flag ? P.bad : P.good, o.flag ? 'triangle' : 'circle'); });
      box(c, 196, 148, 190, 18, m.i >= n ? 'rgba(244,194,91,.25)' : COL.panel, m.i >= n ? COL.gold : null, 4); txt(c, m.i >= n ? 'SUBMIT — press Enter' : `row ${m.i + 1} / ${n}`, 291, 161, { size: 10, align: 'center', col: m.i >= n ? COL.gold : COL.dim });
    };
    return m;
  },
});
