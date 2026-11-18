// Chief engineer: run the systems drill with all crews (shakedown). The scenario is called and the stopwatch runs. Each crew lead reports
// their checklist steps as they finish them; tick a crew's step (its number) only once its report is on the board, and promptly, because the
// drill is timed. Some reports come in with a safety call missing: do not tick those. Press Space to arm QUERY, then the crew's number, and
// they redo the step. A tick with no report in, a slow tick, a fumbled step passed as done, or a query on a clean report is a fault.
import { define, machine, DIG, SPACE, rf, shuffle, txt, box, lamp, COL } from './kit.js';

const CREWS = ['Warp core crew', 'EPS crew', 'Damage control', 'Environmental'];
const STEPS = ['isolate the bus', 'rig the bypass', 'seal the section', 'start the scrubbers', 'secure the injectors', 'man the fire pump', 'swap to backup', 'muster at station'];
const MISS = ['no isolation call', 'no all-clear given', 'no lockout tag', 'no headcount'];
export default define({
  job: { billet: 'ce', label: 'Run systems drill with all crews', type: 'task:shakedown' },
  title: 'Drill board sign-offs', dept: 'engineering', host: 'console', tool: 'Drill checklist and stopwatch',
  how: 'When a crew\'s report comes up on the board, press its number to tick the step — promptly, the drill is timed. A report with a safety call missing gets Space (query) and then the crew\'s number instead.',
  keys: ['1 – 4 tick a crew\'s reported step', 'Space arm query'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'sign off reports', input: 'digits+space', win: 'every crew\'s drill steps ticked promptly after their report, and each report missing a safety call queried and redone',
    fail: 'ticking before a crew has reported (a false sign-off), ticking slowly, passing a report with a safety call missing, or querying a clean report',
    rule: 'Reports pop up on a crew\'s row at uneven times. A clean report: press the crew number within a couple of seconds. A report flagged with a missing safety call: Space, then the number, to send it back.' },
  rush: 'Ticked the whole checklist as the crews ran off to their stations.',
  captions: { 'false sign-off': 'crew lead: "we are not done"', 'slow tick': 'stopwatch beeps', 'fumble passed': 'XO notes a missed safety call', 'needless query': 'crew lead sighs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, late = m.calm ? 3.5 : 2.5, steps = shuffle(r, STEPS), missN = 2;
    m.crews = CREWS.map((n, c) => ({ n, list: [steps[c * 2], steps[c * 2 + 1]], k: 0, rep: null }));
    const evs = []; m.crews.forEach((cr, c) => { let t = 0.6; cr.list.forEach((_, s) => { t += rf(r, 1.2, 3.4); evs.push({ c, s, t }); }); });
    const bad = new Set(shuffle(r, evs.map((_, i) => i)).slice(0, missN)); m.evs = evs.map((e, i) => ({ ...e, miss: bad.has(i) ? MISS[i % MISS.length] : null })).sort((a, b) => a.t - b.t);
    m.q = false; m.done = 0; m.rounds = 8; m.round = 0;
    const tryReport = () => { for (const e of m.evs) { const cr = m.crews[e.c]; if (!e.out && m.t >= e.t && !cr.rep && cr.k === e.s) { e.out = true; cr.rep = { miss: e.miss, age: 0 }; } } };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false;
      if (SPACE(code)) { m.q = !m.q; return true; }
      const d = DIG(code); if (!d || d > 4) return false; const cr = m.crews[d - 1], q = m.q; m.q = false;
      if (!cr.rep) { m.fault(q ? 'needless query' : 'false sign-off'); return true; }
      if (q) { if (cr.rep.miss) { m.evs.push({ c: d - 1, s: cr.k, t: m.t + 1.4, miss: null }); cr.rep = null; } else m.fault('needless query'); return true; }
      if (cr.rep.miss) { m.fault('fumble passed'); m.evs.push({ c: d - 1, s: cr.k, t: m.t + 1.4, miss: null }); cr.rep = null; return true; }
      cr.rep = null; cr.k++; m.done++; m.round = m.done; if (m.done >= 8) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; tryReport(); m.crews.forEach(cr => { if (cr.rep && !cr.rep.miss) { cr.rep.age += dt; if (cr.rep.age > late) { m.fault('slow tick'); cr.rep.age = 0; } } }); };
    m.hint = () => { const c = m.crews.findIndex(cr => cr.rep); if (c < 0) return m.q ? [['Space', true]] : []; const miss = !!m.crews[c].rep.miss;
      if (miss !== m.q) return [['Space', true]]; return [['Digit' + (c + 1), true]]; };
    m.bad = () => { const c = m.crews.findIndex(cr => !cr.rep && cr.k < 2); return 'Digit' + ((c < 0 ? 0 : c) + 1); };
    m.view = () => ({ evs: m.evs.map(e => [e.c, e.s, +e.t.toFixed(2), e.miss]) });
    m.buttons = () => [...m.crews.map((cr, k) => ['Digit' + (k + 1), `${k + 1} ${cr.n.split(' ')[0]}`]), ['Space', 'Query']];
    m.draw = (c, W, H, P) => {
      txt(c, `Stopwatch ${m.t.toFixed(1)} s`, 14, 16, { size: 12, col: COL.gold }); txt(c, m.q ? 'QUERY ARMED — pick a crew' : 'tick mode', W - 14, 16, { size: 11, align: 'right', col: m.q ? COL.warn : COL.dim });
      m.crews.forEach((cr, k) => { const y = 24 + k * 34, rp = cr.rep; box(c, 10, y, W - 20, 30, rp ? (rp.miss ? 'rgba(255,179,71,.18)' : 'rgba(79,208,106,.16)') : 'rgba(255,255,255,.04)', rp ? (rp.miss ? COL.warn : P.good) : null, 8);
        txt(c, `${k + 1} ${cr.n}`, 20, y + 13, { size: 11, col: COL.gold }); txt(c, `${cr.k}/2 ticked`, W - 20, y + 13, { size: 10, align: 'right', col: COL.dim });
        if (rp) { lamp(c, 28, y + 22, 5, rp.miss ? COL.warn : P.good, rp.miss ? 'triangle' : 'circle'); txt(c, `REPORTED: ${cr.list[cr.k]}${rp.miss ? ' — ' + rp.miss : ''}`, 40, y + 26, { size: 10 }); }
        else txt(c, cr.k < 2 ? `working: ${cr.list[cr.k]}` : 'all steps done ✓', 20, y + 26, { size: 10, col: COL.dim }); });
    };
    return m;
  },
});
