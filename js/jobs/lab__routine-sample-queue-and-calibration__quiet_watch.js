// Lab technician, quiet watch: routine sample queue and calibration. Two things at once. Feed the queue: when the bench instrument is idle,
// load the next tube (Space); loading while a run is still going jams the carousel. And between runs keep half an eye on the drift marker:
// it creeps slowly, and when it passes its tick you note it in the log (Enter), which re-zeroes it. Noting before it is past the tick is a
// false note; letting it run on to the limit uncorrected is a missed drift.
import { define, machine, SPACE, ENTER, ri, rf, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'lab', label: 'Routine sample queue and calibration', type: 'task:quiet_watch' },
  title: 'Feed the queue, note the creep', dept: 'sciences', host: 'console', tool: 'Bench instrument and drift indicator',
  how: 'Load the next tube (Space) whenever the instrument goes idle, never mid-run. Watch the drift marker: once it creeps past its tick, note it in the log (Enter).',
  keys: ['Space load next tube', 'Enter note the drift'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'feed and note', input: 'space+enter', win: 'the whole tube queue run through the bench instrument with every drift creep past the tick noted',
    fail: 'loading a tube mid-run so the carousel jams, noting drift that has not passed its tick, or letting drift reach the limit unnoted',
    rule: 'Space loads the next tube, only while the lamp says IDLE. Enter notes the drift, only once the marker is past its tick and before it reaches the red limit.' },
  rush: 'Ran the whole queue back to back and never looked at the drift indicator.',
  captions: { jammed: 'carousel grinds', 'false note': 'pen scratch', 'missed drift': 'drift alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 0.7 : 1;
    m.queue = ri(r, 6, 8); m.done = 0; m.runLeft = 0; m.runs = Array.from({ length: m.queue }, () => rf(r, 1.4, 2.4));
    m.tick0 = rf(r, 0.5, 0.6); m.limitD = 0.9; m.rate = rf(r, 0.07, 0.1) * k; m.drift = rf(r, 0, 0.2); m.notes = 0;
    m.rounds = m.queue; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false;
      if (SPACE(code)) { if (m.runLeft > 0) { m.fault('jammed'); return true; } if (m.done < m.queue) { m.runLeft = m.runs[m.done] * k; m.ev('load'); } return true; }
      if (ENTER(code)) { if (m.drift < m.tick0) { m.fault('false note'); return true; } m.notes++; m.drift = 0; m.ev('note'); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      if (m.runLeft > 0) { m.runLeft -= dt; if (m.runLeft <= 0) { m.runLeft = 0; m.done++; m.round = m.done; if (m.done >= m.queue && m.drift < m.tick0) { m.win(); return; } } }
      m.drift += m.rate * dt * (m.runLeft > 0 ? 1.4 : 1);
      if (m.drift >= m.limitD) { m.fault('missed drift'); m.drift = 0; }
      if (m.done >= m.queue && m.drift < m.tick0 && m.notes > 0) m.win();
    };
    m.hint = () => { const out = []; if (m.drift >= m.tick0 + 0.03) out.push(['Enter', true]); else if (m.runLeft <= 0 && m.done < m.queue) out.push(['Space', true]); return out; };
    m.bad = () => (m.runLeft > 0 ? 'Space' : null);
    m.view = () => ({ q: m.queue, runs: m.runs.map(x => +x.toFixed(2)), tick: +m.tick0.toFixed(2) });
    m.buttons = () => [['Space', 'Load tube'], ['Enter', 'Note drift']];
    m.draw = (c, W, H, P) => {
      const idle = m.runLeft <= 0; lamp(c, 30, 34, 12, idle ? P.good : COL.warn, idle ? 'circle' : 'triangle');
      txt(c, idle ? 'IDLE: load next' : `RUNNING ${m.runLeft.toFixed(1)} s`, 50, 39, { size: 14, col: idle ? P.good : COL.warn });
      txt(c, `queue ${m.queue - m.done - (idle ? 0 : 1)} waiting · ${m.done} run`, 50, 58, { size: 11, col: COL.pale });
      for (let i = 0; i < m.queue; i++) box(c, 250 + i * 17, 26, 12, 30, i < m.done ? COL.peri : (i === m.done && !idle) ? COL.gold : COL.panel, COL.dim, 3);
      txt(c, 'DRIFT', 14, 104, { size: 10, col: COL.dim });
      bar(c, 60, 94, 320, 14, m.drift / 1, { mark: m.tick0, col: m.drift >= m.tick0 ? COL.warn : COL.lav });
      c.fillStyle = P.bad; c.fillRect(60 + m.limitD * 320 - 1, 88, 3, 26); txt(c, 'limit', 60 + m.limitD * 320, 128, { size: 9, col: P.bad, align: 'center' });
      txt(c, 'tick', 60 + m.tick0 * 320, 128, { size: 9, col: '#fff', align: 'center' });
      txt(c, m.drift >= m.tick0 ? 'past the tick: note it' : 'creeping…', 60, 150, { size: 12, col: m.drift >= m.tick0 ? COL.warn : COL.dim });
      txt(c, `notes ${m.notes}`, 380, 150, { size: 11, col: COL.pale, align: 'right' });
    };
    return m;
  },
});
