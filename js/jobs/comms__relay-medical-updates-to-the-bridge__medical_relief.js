// Comms officer, medical relief: relay medical updates to the bridge. The sickbay officer says each patient's status once, quickly, then the
// line goes quiet. Code it on the bridge report with the exact term from the medical code sheet (1-6): "stabilising" is not "stable",
// "serious" is not "critical". If you did not catch it, hold Space to ask sickbay to say it again; the words come back while you hold.
import { define, machine, DIG, SPACE, pick, shuffle, txt, box, COL } from './kit.js';

const CODES = ['Stable', 'Stabilising', 'Serious', 'Critical', 'In transit', 'Discharged'];
const NAMES = ['Ens. Cole', 'Lt. Varga', 'Crewman Oduya', 'PO Shran', 'Dr. Lenz', 'Ens. Mirek', 'Cadet Imre', 'Colonist Hale'];
const SAY = ['{n} is {s}, over.', 'Update on {n}: {s}.', '{n}, status {s}, repeat {s}.', 'Sickbay to bridge, {n} now {s}.'];

export default define({
  job: { billet: 'comms', label: 'Relay medical updates to the bridge', type: 'task:medical_relief' },
  title: 'Exact-term status relay', dept: 'operations', host: 'console', tool: 'Sickbay update channel and code sheet',
  how: 'Catch each status as sickbay says it and key the exact term from the code sheet (1-6); hold Space to have sickbay say it again rather than guess.',
  keys: ['1-6 code the status', 'Space hold: say again'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'code the word', input: 'digits+space-hold', win: 'every patient coded with the very status word sickbay used, no near-miss terms passed to the bridge',
    fail: 'passing a near term sickbay did not say, such as stable for stabilising',
    rule: 'The update shows for a moment and fades. Press the code-sheet digit for the exact word; if it has gone, hold Space until sickbay repeats it.' },
  rush: 'Wrote "stable" next to every name and sent it up.',
  captions: { 'wrong term': 'bridge queries the report', 'say again': 'sickbay repeats' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, show = m.calm ? 2.2 : 1.5, rep = 0.5;
    const pairs = shuffle(r, [[0, 1], [2, 3], [4, 5], [1, 0], [3, 2]]);
    m.pts = shuffle(r, NAMES).slice(0, 4).map((n, i) => { const s = pairs[i][0]; return { n, s, line: pick(r, SAY).replaceAll('{n}', n).replaceAll('{s}', CODES[s].toLowerCase()), got: -1 }; });
    m.i = 0; m.from = 0.4; m.hold = 0; m.rounds = 4; m.round = 0;
    const visible = () => (m.t >= m.from && m.t < m.from + show) || m.hold >= rep;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (SPACE(code)) { m.held.S = down; if (!down) m.hold = 0; return true; }
      if (!down || !(d >= 1 && d <= 6)) return false; if (m.t < m.from) return true;
      const p = m.pts[m.i]; if (d - 1 !== p.s) { m.fault('wrong term'); return true; }
      p.got = d - 1; m.i++; m.round = m.i; m.from = m.t + 0.6; m.hold = 0; if (m.i >= 4) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.hold = m.held.S ? m.hold + dt : 0; };
    m.hint = () => { if (m.i >= 4 || m.t < m.from) return []; if (!visible()) return [['Space', true]];
      return m.t > m.from + 0.5 || m.hold >= rep ? [['Space', false], ['Digit' + (m.pts[m.i].s + 1), true]] : []; };
    m.bad = () => m.i < 4 && m.t >= m.from ? 'Digit' + ((m.pts[m.i].s + 1) % 6 + 1) : null;
    m.view = () => ({ p: m.pts.map(p => [p.n, p.s]) });
    m.buttons = () => [...CODES.map((c, i) => ['Digit' + (i + 1), `${i + 1} ${c}`]), ['Space', 'Say again (hold)']];
    m.draw = (c, W, H, P) => {
      box(c, 8, 8, 250, 44, 'rgba(255,255,255,.05)', COL.peri, 6); txt(c, 'SICKBAY', 16, 22, { size: 9, col: COL.dim });
      const p = m.pts[Math.min(m.i, 3)]; txt(c, m.i >= 4 ? 'report sent' : visible() ? `"${p.line}"` : m.held.S ? 'asking to say again…' : '— line quiet —', 16, 40, { size: 11, col: visible() ? COL.pale : COL.dim });
      m.pts.forEach((q, i) => txt(c, `${q.n}: ${q.got >= 0 ? CODES[q.got].toUpperCase() : i === m.i ? '_' : ''}`, 16, 74 + i * 20, { size: 11, col: q.got >= 0 ? P.good : COL.ink }));
      box(c, 268, 8, 124, 154, 'rgba(255,255,255,.04)', null, 6); txt(c, 'CODE SHEET', 276, 24, { size: 9, col: COL.gold });
      CODES.forEach((s, i) => txt(c, `${i + 1}  ${s}`, 276, 44 + i * 19, { size: 11 }));
    };
    return m;
  },
});
