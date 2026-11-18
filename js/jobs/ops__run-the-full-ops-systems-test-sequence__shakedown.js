// Ops: run the full ops systems test sequence. The test card lists the systems in the order they must be run, but the program numbers them
// differently: run the card's next test by its program number (digit). Read the result line, then walk to that system's panel (→) and look
// at its lamp. Agree (Space) only if the line says PASS and the lamp agrees; note a fault (Enter) for a FAIL or for a lamp that disagrees.
import { define, machine, DIG, ARROW, SPACE, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const SYS = ['EPS distribution', 'Subspace comms', 'Transporter buffer', 'Main computer', 'Sensor bus', 'Shuttle bay doors', 'Internal comms'];

export default define({
  job: { billet: 'ops', label: 'Run the full ops systems test sequence', type: 'task:shakedown' },
  title: 'Test sequence line-and-lamp', dept: 'operations', host: 'console', tool: 'Datacore test sequence program',
  how: 'Run each test in the card\'s order by its program number, read the result line, walk to the system\'s panel (→) to see its lamp, then agree (Space) if PASS and lamp green, or note it (Enter) if either says fault.',
  keys: ['1-5 run test', '→ walk to panel', 'Space agree', 'Enter note fault'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'run and cross-check', input: 'digits+arrows+space+enter', win: 'every test run in card order with its result line cross-checked against the physical panel lamp and every disagreement noted',
    fail: 'running a test out of card order, judging before seeing the lamp, passing a lamp that disagrees, or noting a clean test',
    rule: 'Card order is not program order: find the next card system in the program list and press its number. When the result line shows, press → to walk to the panel; Space if PASS + green lamp, Enter otherwise.' },
  rush: 'Ran the whole program from the console and copied the result lines onto the card.',
  captions: { 'out of order': 'sequence program beeps', 'lamp unchecked': 'test chief points at the panel', 'missed fault': 'hidden fault alarm', 'false fault': 'test chief re-runs it' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 5, run = m.calm ? 0.45 : 0.6, walk = m.calm ? 0.45 : 0.6;
    m.prog = shuffle(r, SYS).slice(0, n).map(name => ({ name, pass: true, lamp: true })); m.card = shuffle(r, [...Array(n).keys()]);
    const f = shuffle(r, [...Array(n).keys()]); m.prog[f[0]].lamp = false; if (r() < 0.6) { m.prog[f[1]].pass = false; m.prog[f[1]].lamp = false; }
    m.k = 0; m.ph = 'console'; m.c = 0; m.last = -9; m.msg = ''; m.notes = []; m.rounds = n; m.round = 0;
    const cur = () => m.prog[m.card[m.k]], bad = (s) => !s.pass || !s.lamp;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code), a = ARROW(code); if (!down) return !!d || a === 'R' || SPACE(code) || ENTER(code);
      if (d && d <= n) { m.last = m.t; if (m.ph !== 'console') return true; if (d - 1 !== m.card[m.k]) { m.fault('out of order'); m.msg = `Card says ${cur().name} next`; return true; } m.ph = 'run'; m.c = 0; return true; }
      if (a === 'R') { m.last = m.t; if (m.ph === 'result') { m.ph = 'walk'; m.c = 0; } return true; }
      if (SPACE(code) || ENTER(code)) {
        m.last = m.t; if (m.ph === 'console' || m.ph === 'run') return true; const s = cur();
        if (m.ph !== 'panel') { m.fault('lamp unchecked'); m.msg = 'Walk to the panel and look at its lamp first'; return true; }
        if (SPACE(code) && bad(s)) { m.fault('missed fault'); m.msg = `${s.name} lamp or line shows a fault`; return true; }
        if (ENTER(code) && !bad(s)) { m.fault('false fault'); m.msg = `${s.name} passed clean`; return true; }
        if (ENTER(code)) m.notes.push(s.name); m.msg = ENTER(code) ? `${s.name} noted on the card` : `${s.name} agrees`; m.k++; m.round++; m.ph = 'console'; if (m.k >= n) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.ph === 'run' || m.ph === 'walk') { m.c += dt; if (m.ph === 'run' && m.c >= run) m.ph = 'result'; if (m.ph === 'walk' && m.c >= walk) m.ph = 'panel'; } };
    m.hint = () => { if (m.t - m.last < 0.15) return []; const s = cur(); if (!s) return []; if (m.ph === 'console') return [[`Digit${m.card[m.k] + 1}`, true]]; if (m.ph === 'result') return [['ArrowRight', true]]; if (m.ph === 'panel') return [[bad(s) ? 'Enter' : 'Space', true]]; return []; };
    m.bad = () => { if (m.t - m.last < 0.2) return null; return m.ph === 'console' ? `Digit${((m.card[m.k] + 1) % n) + 1}` : 'Space'; };
    m.view = () => ({ prog: m.prog.map(s => [s.name, s.pass, s.lamp]), card: m.card });
    m.buttons = () => [...m.prog.map((s, i) => [`Digit${i + 1}`, `${i + 1}`]), ['ArrowRight', '→ panel'], ['Space', 'Agree'], ['Enter', 'Note']];
    m.draw = (c, W, H, P) => {
      txt(c, 'PROGRAM', 14, 16, { size: 10, col: COL.dim }); m.prog.forEach((s, i) => txt(c, `${i + 1} ${s.name}`, 14, 32 + i * 15, { size: 11, col: m.card.indexOf(i) < m.k ? COL.dim : COL.ink }));
      txt(c, 'TEST CARD ORDER', 150, 16, { size: 10, col: COL.dim }); m.card.forEach((p, j) => txt(c, `${j < m.k ? '✓' : j === m.k ? '▶' : '·'} ${m.prog[p].name}`, 150, 32 + j * 15, { size: 11, col: j === m.k ? COL.gold : COL.dim }));
      const s = cur(); if (!s) return; box(c, 290, 10, 100, 100, 'rgba(255,255,255,.05)', COL.peri, 8);
      txt(c, m.ph === 'panel' ? 'AT THE PANEL' : 'CONSOLE', 340, 26, { size: 10, col: COL.dim, align: 'center' });
      if (m.ph === 'run') txt(c, 'running…', 340, 60, { size: 12, align: 'center', col: COL.warn });
      if (['result', 'walk', 'panel'].includes(m.ph)) txt(c, s.pass ? 'line: PASS' : 'line: FAIL', 340, 48, { size: 12, align: 'center', col: s.pass ? P.good : P.bad });
      if (m.ph === 'walk') txt(c, 'walking…', 340, 80, { size: 11, align: 'center', col: COL.warn });
      if (m.ph === 'panel') { lamp(c, 340, 80, 12, s.lamp ? P.good : COL.warn, s.lamp ? 'circle' : 'triangle'); txt(c, s.lamp ? 'lamp green' : 'lamp AMBER', 340, 104, { size: 10, align: 'center' }); }
      txt(c, `noted: ${m.notes.join(', ') || '—'}`, 14, 120, { size: 10, col: COL.pale }); txt(c, m.msg, 14, H - 10, { size: 11, col: COL.pale });
    };
    return m;
  },
});
