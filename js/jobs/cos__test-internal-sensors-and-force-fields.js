// Chief of security: test internal sensors and force fields. The brig console says every emitter section is good; the handheld field meter is
// the only truth. Slide the meter along the emitter grid (← →), cycle the field from the console (Space) and watch the needle rise. One cycle
// can mislead (the needle jitters), so each section needs two cycles under the meter before you log it: 1 good, 2 weak, 3 dead (blind).
import { define, machine, ARROW, SPACE, DIG, rf, ri, pick, txt, box, bar, lamp, COL } from './kit.js';

const N = 5, LV = { good: 0.8, weak: 0.4, dead: 0.03 }, KEY = { 1: 'good', 2: 'weak', 3: 'dead' };
const CORR = ['Corridor 3A', 'Corridor 3B', 'Brig lobby', 'Holding aft', 'Turbolift 3'];
export default define({
  job: { billet: 'cos', label: 'Test internal sensors and force fields', type: 'loop' },
  title: 'Emitter grid meter cycling', dept: 'security', host: 'console', tool: 'Handheld field meter on the emitter grid',
  how: 'Move the field meter along the emitter grid (← →) and cycle the field (Space). After two cycles on a section, log it from the needle: 1 good, 2 weak, 3 dead.',
  keys: ['← → move meter', 'Space cycle field', '1 good · 2 weak · 3 dead'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'meter the cycles', input: 'arrows+space+digits', win: 'all five emitter sections graded good, weak or dead from at least two meter cycles each',
    fail: 'logging a section on the console word before the meter has seen two cycles, or grading weak as good or dead as weak',
    rule: 'Park the meter on a section, press Space to pulse the field and read where the needle peaks; after two pulses the average shows. Needle near the top band: 1; middle: 2; flat: 3.' },
  rush: 'Logged every section green because the console said so.',
  captions: { 'logged unread': 'slate beep', 'misgraded': 'error buzz', pulse: 'field hum' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const kinds = ['good', 'weak', 'dead']; const ks = Array.from({ length: N }, () => pick(r, kinds)); if (!ks.includes('dead')) ks[ri(r, 0, N - 1)] = 'dead';
    m.secs = ks.map((k, i) => ({ k, name: CORR[i], reads: [], log: null, jit: Array.from({ length: 6 }, () => rf(r, -0.12, 0.12)) }));
    m.at = 0; m.pulse = 0; m.needle = 0; m.rounds = N; m.round = 0; const PT = m.calm ? 0.7 : 0.5;
    const sec = () => m.secs[m.at], avg = (s) => s.reads.reduce((a, v) => a + v, 0) / (s.reads.length || 1);
    const grade = (s) => { const a = avg(s); return a > 0.6 ? 'good' : a > 0.2 ? 'weak' : 'dead'; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { if (m.pulse <= 0) m.at = Math.max(0, Math.min(N - 1, m.at + (a === 'L' ? -1 : 1))); return true; }
      if (SPACE(code)) { if (m.pulse <= 0) { m.pulse = PT; m.ev('pulse'); } return true; }
      if (d >= 1 && d <= 3) { const s = sec(); if (s.log) return true; if (s.reads.length < 2) { m.fault('logged unread'); return true; }
        s.log = KEY[d]; if (KEY[d] !== s.k) m.fault('misgraded'); m.round = m.secs.filter(x => x.log).length; if (m.secs.every(x => x.log) && m.state === 'play') m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const s = sec();
      if (m.pulse > 0) { m.pulse -= dt; const peak = Math.max(0, LV[s.k] + s.jit[s.reads.length % 6]); m.needle += (peak - m.needle) * Math.min(1, dt * 12); if (m.pulse <= 0) { s.reads.push(peak); m.needle = 0; } }
      else m.needle *= 0.8; };
    m.hint = () => { const i = m.secs.findIndex(s => !s.log); if (i < 0 || m.pulse > 0) return []; if (i !== m.at) return [[i < m.at ? 'ArrowLeft' : 'ArrowRight', true]];
      const s = sec(); if (s.reads.length < 2) return [['Space', true]]; return [['Digit' + { good: 1, weak: 2, dead: 3 }[grade(s)], true]]; };
    m.bad = () => (m.pulse > 0 ? null : sec().log ? 'ArrowRight' : 'Digit1');
    m.view = () => ({ secs: m.secs.map(s => s.k) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Cycle'], ['Digit1', '1 good'], ['Digit2', '2 weak'], ['Digit3', '3 dead']];
    m.draw = (c, W, H, P) => {
      txt(c, 'CONSOLE: ALL SECTIONS NOMINAL', 20, 18, { size: 10, col: COL.dim });
      m.secs.forEach((s, i) => { const x = 20 + i * 72; box(c, x, 26, 64, 60, i === m.at ? 'rgba(244,194,91,.15)' : COL.panel, i === m.at ? COL.gold : null);
        txt(c, s.name, x + 32, 40, { size: 8, align: 'center', col: COL.pale }); txt(c, `cycles ${s.reads.length}`, x + 32, 56, { size: 9, align: 'center', col: COL.dim });
        if (s.reads.length >= 2) txt(c, `avg ${Math.round(avg(s) * 100)}`, x + 32, 70, { size: 10, align: 'center' });
        if (s.log) { lamp(c, x + 32, 80, 5, s.log === 'good' ? P.good : P.bad, s.log === 'good' ? 'circle' : s.log === 'weak' ? 'triangle' : 'square'); } });
      txt(c, 'METER', 20, 108, { size: 10, col: COL.pale }); bar(c, 70, 100, 300, 10, m.needle, { col: m.pulse > 0 ? COL.peri : COL.dim, mark: 0.6 });
      txt(c, 'flat', 70, 124, { size: 9, col: COL.dim }); txt(c, 'weak', 160, 124, { size: 9, col: COL.dim }); txt(c, 'good ▸', 250, 124, { size: 9, col: COL.dim });
      txt(c, m.pulse > 0 ? 'FIELD ON — reading' : 'Space: cycle the field', 20, 146, { size: 11, col: m.pulse > 0 ? COL.gold : COL.ink });
    };
    return m;
  },
});
