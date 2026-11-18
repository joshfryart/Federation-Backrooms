// Computer specialist: keep the medical database mirrored. The mirror lag is high: hold Space to run a manual sync until the bar ends (letting go
// aborts it). A finished bar proves nothing, so open a patient record on both copies and compare them field by field (Up / Down): Enter on a
// field that differs flags it and the sync must run again; Enter on LOG files the check once the copies agree.
import { define, machine, ARROW, SPACE, ENTER, ri, pick, shuffle, clamp, txt, box, bar, COL } from './kit.js';

const FIELDS = ['Blood type', 'Allergies', 'Last dose', 'Dose time', 'Triage tag'];
const VALS = [['O-', 'A+', 'B+', 'AB-'], ['none', 'penicillin', 'latex', 'sulfa'], ['4 mg', '6 mg', '8 mg', '2 mg'], ['0610', '0645', '0720', '0755'], ['RED', 'YELLOW', 'GREEN', 'BLUE']];
export default define({
  job: { billet: 'comp', label: 'Keep the medical database mirrored', type: 'task:medical_relief' },
  title: 'Mirror sync and record diff', dept: 'operations', host: 'console', tool: 'Mirror status screen',
  how: 'Hold Space to sync the mirror until the bar finishes. Then compare the live and mirror record row by row (Up / Down): Enter on a row that differs to flag it and sync again, or Enter on LOG when every row agrees.',
  keys: ['Space hold: manual sync', 'Up / Down choose row', 'Enter flag row / log'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'sync and diff', input: 'space-hold+arrows+enter', win: 'two patient records synced to the mirror and compared row by row, every stale mirror row caught and re-synced before logging',
    fail: 'letting go mid-sync, logging a mirror that still holds a stale row, flagging a row that matches, or logging before syncing',
    rule: 'Space must stay held for the whole sync. Then read each row live versus mirror; Enter on the one that differs sends you back to sync, Enter on LOG when they all match.' },
  rush: 'Logged the mirror as synced the moment the bar finished.',
  captions: { 'sync aborted': 'sync abort beep', 'stale logged': 'stale data warning', 'false stale': 'record matches tone', 'not synced': 'mirror lag alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, slen = m.calm ? 2.0 : 1.6, names = shuffle(r, ['Ensign Vale', 'Lt. Okoro', 'Crewman Dax', 'Dr. Imre', 'PO Hask']);
    m.recs = [0, 1].map(k => {
      const live = FIELDS.map((_, j) => pick(r, VALS[j])), stale = k === 0 || r() < 0.5 ? ri(r, 0, FIELDS.length - 1) : -1;
      const mir = live.slice(); if (stale >= 0) mir[stale] = VALS[stale][(VALS[stale].indexOf(live[stale]) + ri(r, 1, 3)) % 4];
      return { who: names[k], live, mir, stale, lag: ri(r, 25, 90) };
    });
    m.i = 0; m.ph = 'sync'; m.sp = 0; m.syn = false; m.row = 0; m.rounds = 2; m.round = 0;
    const R = () => m.recs[m.i], LOG = FIELDS.length;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { if (m.ph === 'sync' && !down && m.syn && m.sp > 0.05) { m.fault('sync aborted'); m.sp = 0; } m.syn = !!down; return true; }
      if (!down) return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { if (m.ph === 'cmp') m.row = clamp(m.row + (a === 'D' ? 1 : -1), 0, LOG); return true; }
      if (!ENTER(code)) return false; if (m.ph !== 'cmp') { m.fault('not synced'); return true; } const q = R();
      if (m.row === LOG) {
        if (q.stale >= 0) { m.fault('stale logged'); return true; }
        m.round++; m.ev('logged', { rec: m.i }); if (m.i + 1 >= m.recs.length) m.win(); else { m.i++; m.ph = 'sync'; m.sp = 0; m.row = 0; } return true;
      }
      if (m.row === q.stale) { q.mir[q.stale] = q.live[q.stale]; q.stale = -1; q.lag = ri(r, 8, 20); m.ph = 'sync'; m.sp = 0; m.ev('flagged'); }
      else m.fault('false stale');
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.ph === 'sync' && m.syn) { m.sp += dt / slen; if (m.sp >= 1) { m.sp = 1; m.ph = 'cmp'; R().lag = ri(r, 0, 2); m.row = 0; } } };
    m.hint = () => {
      if (m.ph === 'sync') return [['Space', true]]; if (m.syn) return [['Space', false]];
      const q = R(), tg = q.stale >= 0 ? q.stale : LOG; return m.row === tg ? [['Enter', true]] : [[m.row < tg ? 'ArrowDown' : 'ArrowUp', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ r: m.recs.map(q => [q.live.join(','), q.stale]) });
    m.buttons = () => [['Space', 'Sync (hold)'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Enter', 'Flag / Log']];
    m.draw = (c, W, H, P) => {
      const q = R(); txt(c, `${m.i + 1}/2  ${q.who}`, 14, 16, { size: 12, col: COL.gold }); txt(c, `mirror lag ${q.lag} s`, 200, 16, { size: 11, col: q.lag > 20 ? P.bad : P.good });
      bar(c, 300, 8, 86, 10, m.sp, { col: COL.peri });
      if (m.ph === 'sync') { txt(c, m.syn ? 'SYNCING… keep holding' : 'Hold Space to run the manual sync', 14, 80, { size: 13, col: m.syn ? COL.peri : COL.dim }); return; }
      txt(c, 'LIVE', 140, 34, { size: 10, col: COL.dim }); txt(c, 'MIRROR', 260, 34, { size: 10, col: COL.dim });
      FIELDS.forEach((f, j) => {
        const y = 40 + j * 20; box(c, 10, y, W - 20, 18, j === m.row ? 'rgba(240,147,58,.18)' : 'rgba(255,255,255,.03)', j === m.row ? COL.orange : null, 4);
        txt(c, f, 18, y + 13, { size: 11, col: COL.dim }); txt(c, q.live[j], 140, y + 13, { size: 11 }); txt(c, q.mir[j], 260, y + 13, { size: 11 });
      });
      const y = 40 + LOG * 20; box(c, 10, y, 120, 18, m.row === LOG ? 'rgba(240,147,58,.18)' : 'rgba(255,255,255,.03)', m.row === LOG ? COL.orange : null, 4); txt(c, 'LOG IN MIRROR BOOK', 18, y + 13, { size: 10, col: COL.pale });
    };
    return m;
  },
});
