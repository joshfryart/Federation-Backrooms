// Captain: declare relief complete. Watch the status board: the treated-patient count climbs toward the number the relief was sent for, and
// the checklist lines close one by one. Tap Space to declare complete only when the count matches and every line is closed. The medical
// lamp then takes a moment to switch back to routine; once it has, hold the PA key (Space) through the whole announcement.
import { define, machine, SPACE, ri, rf, pick, txt, bar, lamp, COL } from './kit.js';

const LINES = ['Casualties stabilised', 'Evacuees fed and berthed', 'Stores handed over', 'Surface teams recovered', 'Local medics briefed'];
const SITE = ['Tessen III', 'Halvar camp', 'Corvan II', 'Station Rho'];

export default define({
  job: { billet: 'co', label: 'Declare relief complete', type: 'task:medical_relief' },
  title: 'Relief-complete count and PA', dept: 'command', host: 'console', tool: 'Relief checklist screen and PA key',
  how: 'Wait until the treated count reaches its target and every checklist line closes, tap Space to declare, then wait for the lamp and hold Space through the announcement.',
  keys: ['Space tap: declare', 'Space hold: PA'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'wait out count', input: 'space+space-hold', win: 'relief declared at the moment the count and checklist agree, announced in full after the lamp shows routine',
    fail: 'declaring while the count is short or a line is open, keying the PA before the lamp changes, or cutting the announcement off',
    rule: 'Do nothing while the count is short or any line is open. When both are complete, tap Space. When the medical lamp reads ROUTINE, hold Space until the announcement bar fills, then let go.' },
  rush: 'Declared the relief over as soon as the last shuttle docked.',
  captions: { 'count short': 'sickbay: "we are still treating, sir"', 'announced early': 'lamp still amber', 'cut off': 'PA clicks off' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = ri(r, 3, 5), target = ri(r, 9, 24), dur = m.calm ? 2.2 : 1.8;
    m.target = target; m.site = pick(r, SITE); m.lines = LINES.slice(0, n).map(l => ({ l, at: rf(r, 1.2, 6.5) }));
    m.arr = []; let t = 0.4; for (let k = 0; k < target; k++) { t += rf(r, 0.12, 0.45); m.arr.push(+t.toFixed(2)); }
    m.phase = 'wait'; m.dec = 0; m.lampLag = rf(r, 0.8, 1.8); m.pa = 0; m.dur = dur; m.rounds = 3; m.round = 0;
    const count = () => m.arr.filter(a => a <= m.t).length, ready = () => count() >= target && m.lines.every(x => x.at <= m.t), lampOn = () => m.phase === 'pa' && m.t - m.dec >= m.lampLag;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !SPACE(code)) return false; const was = m.held.S; m.held.S = down;
      if (!was && down) {
        if (m.phase === 'wait') { if (!ready()) { m.fault('count short'); return true; } m.phase = 'pa'; m.dec = m.t; m.round = 1; m.ev('declared'); m.held.S = false; return true; }
        if (!lampOn()) { m.fault('announced early'); m.held.S = false; return true; } m.pa = 0; m.round = 2;
      }
      if (was && !down && m.phase === 'pa' && m.pa > 0) { if (m.pa < m.dur) { m.fault('cut off'); m.pa = 0; } else { m.round = 3; m.win(); } }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.phase === 'pa' && m.held.S && lampOn()) m.pa += dt; };
    m.hint = () => {
      if (m.phase === 'wait') return ready() ? [['Space', !m.held.S]] : [['Space', false]];
      if (!lampOn()) return [['Space', false]]; return [['Space', m.pa < m.dur + 0.1]];
    };
    m.bad = () => ['Space', !m.held.S];
    m.view = () => ({ target, lines: m.lines.map(x => +x.at.toFixed(2)), arr: m.arr.length, last: m.arr[m.arr.length - 1] });
    m.buttons = () => [['Space', 'Declare / hold PA']];
    m.draw = (c, W, H, P) => {
      const k = count(); txt(c, `RELIEF · ${m.site}`, 10, 16, { size: 11, col: COL.gold });
      txt(c, `treated ${k} / ${target}`, 10, 40, { size: 16, col: k >= target ? P.good : COL.ink }); bar(c, 10, 48, 180, 8, k / target, { col: COL.peri });
      m.lines.forEach((x, j) => { const ok = x.at <= m.t; txt(c, `${ok ? '✓' : '○'} ${x.l}`, 10, 76 + j * 15, { size: 10, col: ok ? P.good : COL.dim }); });
      const on = lampOn(); lamp(c, 228, 34, 10, on ? P.good : COL.warn, on ? 'circle' : 'triangle'); txt(c, `medical: ${on ? 'ROUTINE' : 'RELIEF'}`, 244, 38, { size: 11 });
      txt(c, m.phase === 'wait' ? (ready() ? 'count and checklist agree — declare' : 'not complete yet') : 'declared ✓', 220, 66, { size: 10, col: m.phase === 'wait' && !ready() ? COL.dim : COL.pale });
      txt(c, 'PA', 220, 96, { size: 10, col: COL.dim }); bar(c, 240, 88, 150, 10, m.pa / m.dur, { col: m.held.S ? COL.warn : COL.peri, mark: 1 });
      txt(c, `"Relief at ${m.site} complete, ${target} treated. Medical to routine."`, 10, 160, { size: 9, col: m.held.S ? COL.ink : COL.dim });
    };
    return m;
  },
});
