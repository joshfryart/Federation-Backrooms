// Environmental tech: test emergency atmosphere isolation and lights (shakedown). Throw the test (Space), then walk the row one fitting at a time
// (Right): you only see the lamp you are standing at. Mark each one shut/lit (Up) or stuck/dead (Down). Slow dampers take a couple of seconds
// to go from amber to red, so a lamp is only stuck once it is still amber three seconds after the throw. At the row's end give the verdict:
// Enter passes it, Space fails it. One stuck damper or dead light fails the whole test.
import { define, machine, ARROW, ENTER, SPACE, ri, rf, txt, box, lamp, bar, COL } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Test emergency atmosphere isolation and lights', type: 'task:shakedown' },
  title: 'Damper row walk and drill verdict', dept: 'engineering', host: 'console', tool: 'Emergency isolation test switch',
  how: 'Space throws the test. Walk the row with Right and mark each lamp: Up if it has gone red (or lit), Down if it is still amber (or dark) three seconds after the throw. At the end, Enter passes the test, Space fails it.',
  keys: ['Space throw / fail the test', 'Right walk on', 'Up shut / lit', 'Down stuck / dead', 'Enter pass the test'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'walk the dampers', input: 'arrows+enter+space', win: 'both the damper row and the emergency light row walked, every fitting marked correctly and the drill given the right pass or fail',
    fail: 'marking an amber damper shut, calling a slow damper stuck before its three seconds, or passing a test with one amber lamp',
    rule: 'Only the fitting under the cursor shows. Red/lit = Up. Still amber/dark after the 3 s timer = Down; before that, wait. At the row end: any Down marked means Space (fail), otherwise Enter (pass).' },
  rush: 'Saw the first damper lamp go red and signed the isolation drill off.',
  captions: { 'amber called shut': 'drill buzzer', hasty: 'damper clunks late', 'wrong verdict': 'bridge query chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 6, STUCK = 3.0;
    m.rows = ['Damper', 'Emergency light'].map(() => { const bad = r() < 0.6 ? ri(r, 0, N - 1) : -1; return Array.from({ length: N }, (_, i) => ({ at: i === bad ? 99 : rf(r, 0.2, 2.4), mark: 0 })); });
    m.row = 0; m.phase = 'throw'; m.since = 0; m.cur = 0; m.cd = 0; m.rounds = 2; m.round = 0;
    const F = () => m.rows[m.row][m.cur], done = (f) => m.since >= f.at, stuckRow = () => m.rows[m.row].some(f => f.at > 50);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); if (!a && !SPACE(code) && !ENTER(code)) return false; m.cd = 0.2;
      if (m.phase === 'throw') { if (SPACE(code)) { m.phase = 'walk'; m.since = 0; m.cur = 0; } return true; }
      if (m.phase === 'verdict') {
        if (!SPACE(code) && !ENTER(code)) return true; if (SPACE(code) !== stuckRow()) { m.fault('wrong verdict'); return true; }
        m.row++; m.round = m.row; if (m.row >= 2) m.win(); else m.phase = 'throw'; return true;
      }
      const f = F();
      if (a === 'U') { if (done(f)) f.mark = 1; else m.fault('amber called shut'); }
      else if (a === 'D') { if (done(f)) m.fault('wrong mark'); else if (m.since < STUCK) m.fault('hasty'); else f.mark = -1; }
      else if (a === 'R' && f.mark) { m.cur++; if (m.cur >= N) m.phase = 'verdict'; }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.cd -= dt; if (m.phase !== 'throw') m.since += dt; };
    m.hint = () => {
      if (m.cd > 0) return []; if (m.phase === 'throw') return [['Space', true]]; if (m.phase === 'verdict') return [[stuckRow() ? 'Space' : 'Enter', true]];
      const f = F(); if (f.mark) return [['ArrowRight', true]]; if (done(f)) return [['ArrowUp', true]]; return m.since >= STUCK + 0.1 ? [['ArrowDown', true]] : [];
    };
    m.bad = () => m.cd > 0 ? null : m.phase === 'throw' ? 'Space' : m.phase === 'verdict' ? 'Enter' : F().mark ? 'ArrowRight' : 'ArrowUp';
    m.view = () => ({ r: m.rows.map(row => row.map(f => f.at > 50 ? -1 : +f.at.toFixed(2))) });
    m.buttons = () => [['Space', 'Throw / FAIL'], ['ArrowRight', 'Walk on'], ['ArrowUp', 'Shut / lit'], ['ArrowDown', 'Stuck / dead'], ['Enter', 'PASS']];
    m.draw = (c, W, H, P) => {
      const name = ['Damper', 'Emergency light'][Math.min(1, m.row)]; txt(c, `${name.toUpperCase()} ROW  (${m.row + 1} / 2)`, 16, 20, { size: 11, col: COL.gold });
      (m.rows[Math.min(1, m.row)] || []).forEach((f, i) => {
        const x = 20 + i * 62, y = 34, here = i === m.cur && m.phase === 'walk'; box(c, x, y, 54, 70, COL.panel, here ? COL.gold : null, 5); txt(c, `${i + 1}`, x + 6, y + 14, { size: 10, col: COL.dim });
        if (here) { const ok = done(f), dmp = m.row === 0; lamp(c, x + 27, y + 38, 13, ok ? (dmp ? P.bad : COL.pale) : (dmp ? COL.warn : COL.dark), ok ? 'circle' : 'triangle'); txt(c, ok ? (dmp ? 'RED' : 'LIT') : (dmp ? 'AMBER' : 'DARK'), x + 8, y + 64, { size: 10 }); }
        else if (f.mark) txt(c, f.mark > 0 ? '✓ shut' : '✗ stuck', x + 6, y + 44, { size: 11, col: f.mark > 0 ? P.good : P.bad });
        else txt(c, '?', x + 22, y + 44, { size: 14, col: COL.dim });
      });
      if (m.phase === 'throw') txt(c, 'Space: throw the test', 16, 132, { size: 13, col: COL.pale });
      else if (m.phase === 'verdict') txt(c, 'Row walked: Enter = PASS, Space = FAIL', 16, 132, { size: 13, col: COL.pale });
      else { txt(c, `since throw ${m.since.toFixed(1)} s (stuck after ${STUCK} s)`, 16, 128, { size: 11, col: COL.pale }); bar(c, 16, 138, 360, 8, m.since / STUCK, { col: m.since >= STUCK ? P.bad : COL.peri }); }
    };
    return m;
  },
});
