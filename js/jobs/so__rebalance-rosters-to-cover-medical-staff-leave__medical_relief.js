// Second officer: rebalance rosters to cover medical staff leave. Each empty medical post is covered by borrowing an officer from another
// department (1-4). The lender must hold the post's medical rating, still have rest hours for an 8-hour shift, and their department must stay
// above its minimum manning once they leave. Lenders are scarce: spend a corpsman-rated officer on a first-aid post and the corpsman post may
// have no one left. When every post is covered, Space sends the cover notes to the lending heads.
import { define, machine, DIG, SPACE, shuffle, ri, pick, txt, box, COL } from './kit.js';

const DEPT = ['Engineering', 'Security', 'Science', 'Operations'];
const NM = ['Lt Amadi', 'Ens Boyle', 'CPO Chen', 'Lt Dorsey', 'Ens Eke', 'Lt Flint', 'Ens Garza', 'PO Hale', 'Lt Imre'];
const RT = ['none', 'MED-1 first aid', 'MED-2 corpsman'];

export default define({
  job: { billet: 'so', label: 'Rebalance rosters to cover medical staff leave', type: 'task:medical_relief' },
  title: 'Borrowed medical cover', dept: 'command', host: 'console', tool: 'Medical roster, rating list and fatigue flags',
  how: 'Cover each empty medical post by borrowing a rated, rested officer from a department that can spare one, saving scarce corpsmen for corpsman posts, then send the notes.',
  keys: ['1 – 4 borrow from department', 'Space send cover notes'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'borrow cover', input: 'digits+space', win: 'all empty medical posts covered by lenders whose rating fits, whose hours allow the shift and whose department stays above minimum',
    fail: 'borrowing from a department already at minimum, an unrated or tired officer, or spending the only corpsman on a first-aid post',
    rule: 'For the highlighted post press the lending department\'s number; its next officer must meet the rating and fatigue limit and the department must have a spare. Space sends notes at the end.' },
  rush: 'Marked the leave posts "covered by duty nurse" and closed the roster.',
  captions: { 'at minimum': 'manning alarm', 'not rated': 'roster buzz', 'over fatigue': 'fatigue flag chimes', 'none free': 'empty slot click' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nm = shuffle(r, NM), ord = shuffle(r, [0, 1, 2, 3]);
    const mk = (role, i) => {
      const crew = ri(r, 4, 7), base = { name: DEPT[ord[i]], crew };
      if (role === 'A') return { ...base, min: crew - 1, q: [{ who: nm[0], rt: 2, hrs: ri(r, 0, 4) }] };
      if (role === 'B') return { ...base, min: crew - 2, q: [{ who: nm[1], rt: 1, hrs: ri(r, 0, 4) }, { who: nm[2], rt: 1, hrs: ri(r, 0, 4) }] };
      if (role === 'C') return { ...base, min: crew, q: [{ who: nm[3], rt: 2, hrs: ri(r, 0, 3) }] };
      return { ...base, min: crew - 1, q: [{ who: nm[4], rt: pick(r, [1, 2]), hrs: ri(r, 5, 9) }, { who: nm[5], rt: 0, hrs: 0 }] };
    };
    m.depts = ['A', 'B', 'C', 'D'].map(mk);
    m.posts = shuffle(r, [2, 1, 1]).map((req, i) => ({ req, shift: ['0000-0800', '0800-1600', '1600-2400'][i], by: null }));
    m.pi = 0; m.sent = false; m.rounds = 4; m.round = 0;
    const front = (d) => d.q[0];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (SPACE(code)) { if (m.pi >= 3) { m.sent = true; m.round++; m.win(); } return true; }
      if (!d || d > 4) return false; if (m.pi >= 3) return true; const dp = m.depts[d - 1], o = front(dp), p = m.posts[m.pi];
      if (!o) { m.fault('none free'); return true; } if (dp.crew <= dp.min) { m.fault('at minimum'); return true; }
      if (o.rt < p.req) { m.fault('not rated'); return true; } if (o.hrs + 8 > 12) { m.fault('over fatigue'); return true; }
      dp.q.shift(); dp.crew--; p.by = `${o.who} (${dp.name})`; m.pi++; m.round++; return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (m.pi >= 3) return [['Space', true]]; const p = m.posts[m.pi];
      const k = m.depts.findIndex(d => { const o = front(d); if (!o || d.crew <= d.min || o.hrs + 8 > 12 || o.rt < p.req) return false; return p.req === 2 || o.rt === 1; });
      return k >= 0 ? [['Digit' + (k + 1), true]] : [];
    };
    m.bad = () => { const k = m.depts.findIndex(d => d.crew <= d.min || !front(d)); return 'Digit' + (k + 1); };
    m.view = () => ({ d: m.depts.map(d => [d.name, d.crew, d.min, d.q.map(o => [o.rt, o.hrs])]), p: m.posts.map(p => p.req) });
    m.buttons = () => m.pi >= 3 ? [['Space', 'Send notes']] : m.depts.map((d, i) => ['Digit' + (i + 1), `${i + 1} ${d.name.slice(0, 5)}`]);
    m.draw = (c, W, H, P) => {
      txt(c, 'MEDICAL POSTS ON LEAVE', 10, 14, { size: 10, col: COL.gold });
      m.posts.forEach((p, i) => { const x = 8 + i * 130, cur = i === m.pi; box(c, x, 20, 124, 38, cur ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.04)', cur ? COL.orange : null, 6); txt(c, `${p.shift} · ${RT[p.req].split(' ')[0]}`, x + 6, 34, { size: 10 }); txt(c, p.by ? '✓ ' + p.by.split(' (')[0] : 'EMPTY', x + 6, 50, { size: 9, col: p.by ? P.good : COL.warn }); });
      txt(c, 'LENDING DEPARTMENTS (crew / minimum · next officer)', 10, 74, { size: 10, col: COL.gold });
      m.depts.forEach((d, i) => {
        const y = 80 + i * 20, o = front(d), spare = d.crew > d.min; box(c, 8, y, W - 16, 18, 'rgba(255,255,255,.04)', null, 6);
        txt(c, `${i + 1} ${d.name}`, 14, y + 13, { size: 10 }); txt(c, `${d.crew}/${d.min}${spare ? '' : ' AT MIN'}`, 110, y + 13, { size: 10, col: spare ? COL.pale : COL.warn });
        txt(c, o ? `${o.who} · ${RT[o.rt]} · ${o.hrs} h worked${o.hrs + 8 > 12 ? ' ⚑' : ''}` : '— none free —', 170, y + 13, { size: 10, col: o ? COL.ink : COL.dim });
      });
      if (m.pi >= 3) txt(c, 'All posts covered: Space sends the cover notes.', 10, 166, { size: 10, col: COL.warn });
    };
    return m;
  },
});
