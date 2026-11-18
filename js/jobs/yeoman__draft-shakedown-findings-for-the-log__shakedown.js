// Yeoman: draft the shakedown findings for the log. Work through the drill and test sheets one at a time. Each defect goes into the findings
// draft with its figure quoted exactly: roll the line's figure counter (hold Space, it speeds up), trim it a step at a time (↑ ↓) and commit
// (Enter). Some sheets carry a second defect pencilled in the margin; it stays flagged until it has its own line. Turning the page (→) on a
// flagged margin note loses that defect.
import { define, machine, ARROW, SPACE, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const DEF = [['Seal 4 leak rate', 'l/min', 100], ['Plasma conduit 2 hot spot', '°C', 1], ['Turbolift B stall time', 's', 10], ['Deflector ripple', '%', 1], ['Coolant pump 3 vibration', 'mm/s', 10],
  ['Hatch 9 close time', 's', 10], ['Gravity plate 12 drift', '%', 10], ['Comm relay 5 drop-outs', 'per hr', 1], ['EPS tap 6 overvolt', 'V', 1], ['Shuttle clamp 2 slip', 'mm', 1]];
const fmt = (v, div) => (div === 1 ? String(v) : (v / div).toFixed(div === 100 ? 2 : 1));

export default define({
  job: { billet: 'yeoman', label: 'Draft shakedown findings for the log', type: 'task:shakedown' },
  title: 'Quote each defect figure, margins included', dept: 'command', host: 'console', tool: 'Defect sheets and findings draft',
  how: 'Hold Space to roll the findings line\'s figure up (it speeds up), trim it with ↑ ↓, and commit with Enter when it reads exactly the sheet\'s figure. Transcribe any margin note the same way before turning the page (→).',
  keys: ['Space hold: roll the figure', '↑ ↓ trim one step', 'Enter commit the line', '→ next sheet'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'roll and quote', input: 'space-hold+arrows+enter', win: 'every defect on three sheets, pencilled margin notes included, quoted in the findings draft with its exact figure',
    fail: 'committing a figure that differs from the source sheet, or turning the page while a margin defect is still untranscribed',
    rule: 'Hold Space to spin the counter up (faster the longer you hold), let go near the sheet figure and step ↑ ↓ to it exactly, then Enter. A flagged margin note needs its own line before → turns the page.' },
  rush: 'Logged "minor defects, see sheets" and filed the sheets.',
  captions: { misquoted: 'red pen circles the figure', 'margin lost': 'page turns over a pencilled note' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, accel = m.calm ? 10 : 16, defs = shuffle(r, DEF); let p = 0;
    const mk = () => { const [name, unit, div] = defs[p++]; return { name, unit, div, v: ri(r, 12, 94), done: false }; };
    const withMargin = shuffle(r, [true, ri(r, 0, 1) === 1, false]);
    m.sheets = [0, 1, 2].map(i => ({ src: pick(r, ['Drill sheet', 'Test sheet', 'Defect note']), lines: withMargin[i] ? [mk(), { ...mk(), margin: true }] : [mk()] }));
    m.s = 0; m.fig = 0; m.hold = 0; m.rounds = 3; m.round = 1; m.log = [];
    const S = () => m.sheets[m.s], L = () => S()?.lines.find(l => !l.done);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (SPACE(code)) { m.held.S = down; if (!down) { m.hold = 0; m.fig = Math.floor(m.fig); } return true; }
      if (a === 'U' || a === 'D') { if (down) m.fig = (Math.floor(m.fig) + (a === 'U' ? 1 : 99)) % 100; return true; }
      if (ENTER(code)) { if (!down) return true; const l = L(); if (!l) return true;
        if (Math.floor(m.fig) !== l.v) { m.fault('misquoted'); return true; } l.done = true; m.log.push(`${l.name} ${fmt(l.v, l.div)} ${l.unit}`); m.fig = 0; return true; }
      if (a === 'R') { if (!down) return true; if (L()) { m.fault('margin lost'); L().done = true; m.fig = 0; }
        if (!L()) { m.s++; if (m.s >= 3) { if (m.state === 'play') m.win(); } else m.round = m.s + 1; } return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.S) { m.hold += dt; m.fig = (m.fig + (3 + accel * m.hold) * dt) % 100; } };
    m.hint = () => { const l = L(); if (!l) return [['Space', false], ['ArrowRight', true]]; const f = Math.floor(m.fig), e = l.v - f;
      if (e > 6 && f < l.v) return [['Space', true]]; if (m.held.S) return [['Space', false]]; if (e === 0) return [['Enter', true]]; return [[e > 0 ? 'ArrowUp' : 'ArrowDown', true]]; };
    m.bad = () => { const l = L(); if (!l) return 'ArrowRight'; return Math.floor(m.fig) !== l.v ? 'Enter' : 'ArrowUp'; };
    m.view = () => ({ sh: m.sheets.map(s => s.lines.map(l => [l.name, l.v, !!l.margin])) });
    m.buttons = () => [['Space', 'Roll (hold)'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Enter', 'Commit'], ['ArrowRight', 'Next sheet ▶']];
    m.draw = (c, W, H, P) => {
      const sh = S(); if (!sh) return; const l = L(); box(c, 8, 8, 196, 124, 'rgba(247,242,230,.9)', COL.lav, 4); txt(c, `${sh.src} ${m.s + 1}/3`, 16, 24, { size: 10, col: '#3a3456' });
      const main = sh.lines[0]; txt(c, main.name, 16, 46, { size: 11, col: '#1a1630' }); txt(c, `${fmt(main.v, main.div)} ${main.unit}`, 16, 64, { size: 14, col: '#1a1630' });
      const mg = sh.lines[1]; if (mg) { c.save(); c.translate(150, 98); c.rotate(-0.12); txt(c, `margin: ${mg.name.split(' ').slice(0, 3).join(' ')}`, 0, 0, { size: 8, align: 'center', col: '#55507a', w: 400 });
        txt(c, `${fmt(mg.v, mg.div)} ${mg.unit}`, 0, 14, { size: 10, align: 'center', col: '#55507a' }); c.restore(); }
      txt(c, 'FINDINGS DRAFT', 216, 20, { size: 10, col: COL.peri }); m.log.slice(-4).forEach((s, i) => txt(c, `✓ ${s}`.slice(0, 32), 216, 36 + i * 13, { size: 9, col: P.good }));
      if (l) { txt(c, `${l.margin ? '▲ MARGIN ' : ''}${l.name}`.slice(0, 30), 216, 100, { size: 10, col: l.margin ? COL.warn : COL.ink });
        box(c, 216, 106, 120, 26, COL.panel, COL.gold, 6); txt(c, `${fmt(Math.floor(m.fig), l.div)} ${l.unit}`, 276, 124, { size: 14, align: 'center', col: COL.gold }); }
      else txt(c, 'sheet done: → next sheet', 216, 120, { size: 10, col: P.good });
      txt(c, `${sh.lines.filter(x => !x.done).length} open on this sheet`, 8, H - 12, { size: 10, col: COL.pale });
    };
    return m;
  },
});
