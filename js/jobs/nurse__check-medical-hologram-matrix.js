// Nurse: check the medical hologram matrix. First dial the loaded program version to the one in the sickbay log (Left/Right, Enter). Then the
// self-test lights each emitter in turn: tap Space while a dim emitter is lit. A bright one must be left alone.
import { define, machine, SPACE, ENTER, ARROW, ri, rf, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Check medical hologram matrix', type: 'loop' },
  title: 'Hologram emitter self-test', dept: 'medical', host: 'console', tool: 'Matrix console',
  how: 'Step the version with Left/Right until it matches the log line and press Enter. Then watch the emitters light in turn and tap Space on any that glows dim.',
  keys: ['Left/Right version', 'Enter confirm', 'Space flag dim emitter'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'version then flag', input: 'arrows+enter+space', win: 'matrix version corrected to the log then every dim emitter flagged during the lit-in-turn self-test',
    fail: 'confirming a wrong version, flagging a bright emitter or letting a dim one pass unflagged',
    rule: 'Left/Right sets the version and Enter confirms it. In the self-test emitters light one at a time; Space while a dim one is lit flags it.' },
  rush: 'Assumed the version was right and skipped the emitter self-test.',
  captions: { 'wrong version': 'console error tone', 'false flag': 'dull double tone', 'missed dim': 'hologram flicker hum' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dwell = m.calm ? 1.0 : 0.7;
    m.want = ri(r, 3, 8); m.ver = m.want + (r() < 0.5 ? -ri(r, 1, 2) : ri(r, 1, 2)); m.phase = 0; m.e = 0; m.clk = 0; m.flagged = false;
    const dim = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, 2));
    m.em = Array.from({ length: 6 }, (_, i) => ({ dim: dim.has(i), lvl: dim.has(i) ? rf(r, 0.3, 0.5) : rf(r, 0.85, 1) }));
    const E = () => m.em[m.e], close = () => { if (E().dim && !m.flagged) m.fault('missed dim'); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), own = SPACE(code) || ENTER(code) || a === 'L' || a === 'R'; if (!own) return false; if (!down) return true;
      if (m.phase === 0) { if (a === 'L') m.ver--; else if (a === 'R') m.ver++; else if (ENTER(code)) { if (m.ver === m.want) { m.phase = 1; m.clk = 0; } else m.fault('wrong version'); } }
      else if (SPACE(code) && m.e < 6 && !m.flagged) { if (E().dim) m.flagged = true; else m.fault('false flag'); }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.phase !== 1) return; m.clk += dt;
      if (m.clk >= dwell) { m.clk = 0; close(); if (m.state !== 'play') return; m.e++; m.flagged = false; if (m.e >= 6) m.win(); }
    };
    m.hint = () => m.phase === 0 ? [[m.ver === m.want ? 'Enter' : m.ver < m.want ? 'ArrowRight' : 'ArrowLeft', true]] : m.e < 6 && E().dim && !m.flagged ? [['Space', true]] : [];
    m.bad = () => m.phase === 0 ? 'Enter' : 'Space';
    m.view = () => ({ want: m.want, ver: m.ver, em: m.em.map(e => +e.lvl.toFixed(2)) });
    m.buttons = () => [['ArrowLeft', 'Ver -'], ['ArrowRight', 'Ver +'], ['Enter', 'Confirm'], ['Space', 'Flag dim']];
    m.draw = (c, W, H, P) => {
      txt(c, `Loaded v${m.ver}   log file v${m.want}`, 14, 24, { size: 14, col: m.phase ? P.good : COL.gold });
      m.em.forEach((e, i) => { const on = m.phase === 1 && i === m.e; lamp(c, 40 + i * 62, 80, on ? 20 : 13, on ? `rgba(125,151,232,${(0.25 + e.lvl * 0.75).toFixed(2)})` : 'rgba(255,255,255,.12)', on && e.dim ? 'triangle' : 'circle'); txt(c, i + 1, 36 + i * 62, 118, { col: COL.dim }); });
      txt(c, m.phase ? (m.flagged ? 'dim emitter flagged' : 'self-test running') : 'set the version, then Enter', 14, 150, { size: 12, col: COL.dim });
    };
    return m;
  },
});
