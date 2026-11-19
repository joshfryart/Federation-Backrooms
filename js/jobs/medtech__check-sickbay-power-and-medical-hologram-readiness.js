// Medical technician: check sickbay power and medical hologram readiness. Press each bed's test switch (Space) and watch the monitor boot.
// A boot that dips once may be an intermittent supply flicker: test it again before deciding. Two dips in a row is a real fault: log it
// (Enter). A clean boot is signed off (→). Logging a single dip, or signing off a bed whose last boot dipped, is the mistake.
import { define, machine, SPACE, ENTER, ARROW, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const UNITS = ['Biobed 1', 'Biobed 2', 'Biobed 3', 'Biobed 4', 'Surgical bed', 'Hologram emitter'];
export default define({
  job: { billet: 'medtech', label: 'Check sickbay power and medical hologram readiness', type: 'loop' },
  title: 'Boot test, retest, then log', dept: 'medical', host: 'console', tool: 'Sickbay power panel',
  how: 'Test each unit (Space) and watch it boot. A clean boot: sign it off (→). A dip: test again. Dips twice in a row: log the fault for the nurse (Enter).',
  keys: ['Space test switch', '→ sign off', 'Enter log fault'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'retest before logging', input: 'space+enter+arrows', win: 'every bed and the emitter booted clean and signed off, or dipped on two tests running and logged as a fault',
    fail: 'logging a one-off supply flicker as a fault, or signing off a unit whose last boot dipped',
    rule: 'Space runs a boot test (PASS or DIP). One DIP proves nothing: test again. → signs off a unit whose last test passed; Enter logs a unit that dipped twice in a row.' },
  rush: 'Saw the bed lights on and ticked the panel as ready.',
  captions: { 'logged a flicker': 'nurse queries the log', 'signed off a dip': 'bed monitor flickers out', 'false fault': 'nurse queries the log' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, boot = m.calm ? 0.8 : 0.6;
    const names = shuffle(r, UNITS.slice(0, 5)).slice(0, 4).concat(UNITS[5]); const kinds = shuffle(r, ['ok', 'dip', 'fault', 'ok', ri(r, 0, 1) ? 'dip' : 'fault']);
    m.u = names.map((n, i) => ({ n, kind: kinds[i], hist: [], volts: ri(r, 230, 244) }));
    m.k = 0; m.busy = 0; m.rounds = m.u.length; m.round = 0;
    const U = () => m.u[m.k], last = () => U()?.hist.at(-1), twoDips = () => { const h = U().hist; return h.length >= 2 && h.at(-1) === 'DIP' && h.at(-2) === 'DIP'; };
    const next = () => { m.k++; m.round++; if (m.k >= m.u.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), u = U();
      if (SPACE(code)) { if (!m.busy) m.busy = boot; return true; }
      if (m.busy) return SPACE(code) || ENTER(code) || a === 'R';
      if (a === 'R') { if (last() !== 'PASS') m.fault('signed off a dip'); next(); return true; }
      if (ENTER(code)) { if (twoDips()) next(); else m.fault(last() === 'DIP' ? 'logged a flicker' : 'false fault'); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (!m.busy) return; m.busy = Math.max(0, m.busy - dt);
      if (!m.busy) { const u = U(), n = u.hist.length; u.hist.push(u.kind === 'fault' || (u.kind === 'dip' && n === 0) ? 'DIP' : 'PASS'); }
    };
    m.hint = () => { if (m.busy || !U()) return []; const l = last(); return [[!l ? 'Space' : l === 'PASS' ? 'ArrowRight' : twoDips() ? 'Enter' : 'Space', true]]; };
    m.bad = () => (m.busy ? null : 'ArrowRight');
    m.view = () => ({ u: m.u.map(u => u.n + ':' + u.kind) });
    m.buttons = () => [['Space', 'Test'], ['ArrowRight', 'Sign off →'], ['Enter', 'Log fault']];
    m.draw = (c, W, H, P) => {
      txt(c, 'SICKBAY POWER PANEL · boot tests', 16, 16, { size: 12, col: COL.gold });
      m.u.forEach((u, i) => {
        const y = 24 + i * 24, cur = i === m.k; box(c, 14, y, 250, 20, cur ? 'rgba(125,151,232,.18)' : 'rgba(255,255,255,.04)', cur ? COL.lav : null, 4);
        txt(c, u.n, 22, y + 14, { size: 11, col: i < m.k ? COL.dim : COL.ink });
        u.hist.slice(-4).forEach((h, j) => { lamp(c, 150 + j * 18, y + 10, 6, h === 'PASS' ? P.good : P.bad, h === 'PASS' ? 'circle' : 'triangle'); });
        if (i < m.k) txt(c, twoDipsOf(u) ? 'LOGGED' : 'SIGNED', 258, y + 14, { size: 9, align: 'right', col: COL.dim });
      });
      const u = U(); if (!u) return; const l = last();
      txt(c, m.busy ? 'BOOTING…' : l ? `last test: ${l}` : 'not tested', 280, 46, { size: 13, col: l === 'DIP' && !m.busy ? COL.warn : COL.ink });
      if (m.busy) { box(c, 280, 56, 100, 8, 'rgba(255,255,255,.1)'); c.fillStyle = COL.peri; c.fillRect(280, 56, 100 * (1 - m.busy / boot), 8); }
      txt(c, `supply ${m.busy && u.kind !== 'ok' && (u.kind === 'fault' || !u.hist.length) ? Math.round(u.volts * 0.6) : u.volts} V`, 280, 84, { size: 11, col: COL.pale });
      txt(c, l === 'DIP' && !twoDips() ? 'one dip: retest' : twoDips() ? 'two dips: log it' : '', 280, 104, { size: 10, col: COL.dim });
    };
    const twoDipsOf = (u) => u.hist.length >= 2 && u.hist.at(-1) === 'DIP' && u.hist.at(-2) === 'DIP';
    return m;
  },
});
