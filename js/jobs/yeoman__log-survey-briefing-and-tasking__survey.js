// Yeoman: log the survey briefing and tasking. The bridge order gives each department its target and its start and end times. Copy each
// time window into the tasking log; the order line is in view only until your pen touches the log, so read it, then write it out from
// memory. Enter lifts the pen to look again (and the half-written window is struck through). A wrong figure puts that department to work
// at the wrong time.
import { define, machine, DIG, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const DEPTS = [['Geology', 'Ridge K3'], ['Stellar cartography', 'Pulsar B-12'], ['Xenobiology', 'Moon 2 basin'], ['Atmospherics', 'Storm cell 7'], ['Astrophysics', 'Dust lane D'], ['Hydrology', 'Ice cap north']];
const digit = (code) => (code === 'Digit0' || code === 'Numpad0' ? 0 : DIG(code) || -1);
const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, '0') + String(min % 60).padStart(2, '0');

export default define({
  job: { billet: 'yeoman', label: 'Log survey briefing and tasking', type: 'task:survey' },
  title: 'Tasking log copied from the bridge order', dept: 'command', host: 'console', tool: 'Briefing sheet and tasking log',
  how: 'Read the department\'s time window on the bridge order, then type its eight figures (0-9) into the log. Once you start writing the order is covered; Enter looks again but strikes the half-written line.',
  keys: ['0-9 write a figure', 'Enter look at the order again'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'copy from memory', input: 'digits+enter', win: 'four departments logged with start and end times identical to the bridge order',
    fail: 'writing a figure that differs from the order so a department works to the wrong window',
    rule: 'The bridge order line shows only while your pen is up. Read the eight figures of the start and end time, type them; the order hides at the first figure. Enter shows it again but wipes the line.' },
  rush: 'Wrote "per bridge order" against every department.',
  captions: { 'mis-copied': 'pen scratch', 'look again': 'page turns' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.lines = shuffle(r, DEPTS).slice(0, 4).map(([dept, target]) => { const a = ri(r, 36, 100) * 10, b = a + pick(r, [40, 60, 80, 90, 110, 130]); return { dept, target, code: hhmm(a) + hhmm(b) }; });
    m.k = 0; m.typed = ''; m.peek = true; m.rounds = 4; m.round = 1;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = digit(code);
      if (ENTER(code)) { if (down) { if (m.typed) m.ev('look again'); m.typed = ''; m.peek = true; } return true; }
      if (d < 0) return false; if (!down) return true; const ln = m.lines[m.k]; m.peek = false;
      if (String(d) !== ln.code[m.typed.length]) { m.fault('mis-copied'); m.typed = ''; m.peek = true; return true; }
      m.typed += d; if (m.typed.length === 8) { m.k++; m.typed = ''; m.peek = true; if (m.k >= 4) m.win(); else m.round = m.k + 1; } return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const ln = m.lines[m.k]; if (!ln) return []; const d = ln.code[m.typed.length]; return [[d === '0' ? 'Digit0' : `Digit${d}`, true]]; };
    m.bad = () => { const ln = m.lines[m.k]; if (!ln) return null; const d = (+ln.code[m.typed.length] + 1) % 10; return d === 0 ? 'Digit0' : `Digit${d}`; };
    m.view = () => ({ lines: m.lines.map(l => [l.dept, l.code]) });
    m.buttons = () => [...'1234567890'.split('').map(d => [`Digit${d}`, d]), ['Enter', 'Look']];
    m.draw = (c, W, H, P) => {
      const ln = m.lines[m.k]; if (!ln) return; box(c, 8, 8, 384, 44, 'rgba(255,255,255,.06)', COL.peri, 6); txt(c, 'BRIDGE ORDER', 16, 22, { size: 9, col: COL.peri });
      txt(c, `${ln.dept} · ${ln.target}`, 16, 42, { size: 12 });
      if (m.peek) txt(c, `${ln.code.slice(0, 4)} – ${ln.code.slice(4)}`, 384, 42, { size: 16, align: 'right', col: COL.gold }); else { box(c, 270, 26, 118, 22, COL.panel, COL.dim, 4); txt(c, 'pen down: covered', 329, 41, { size: 9, align: 'center', col: COL.dim }); }
      txt(c, 'TASKING LOG', 16, 70, { size: 9, col: COL.peri });
      m.lines.forEach((l, i) => { const y = 86 + i * 18, done = i < m.k, cur = i === m.k; txt(c, `${done ? '✓' : cur ? '▸' : '·'} ${l.dept}`, 16, y, { size: 11, col: done ? P.good : cur ? COL.ink : COL.dim });
        const s = done ? l.code : cur ? m.typed.padEnd(8, '_') : '________'; txt(c, `${s.slice(0, 4)} – ${s.slice(4)}`, 384, y, { size: 13, align: 'right', col: done ? P.good : COL.ink, font: 'monospace' }); });
    };
    return m;
  },
});
