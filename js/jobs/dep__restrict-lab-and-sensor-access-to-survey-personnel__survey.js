// Deputy security chief, survey mission: hold the lab door for survey personnel only. Each person in the queue shows a badge; admit them
// (Enter) only if the name is on the access list AND the badge clearance reads SURVEY, otherwise turn them back (Space). While the door is
// open behind someone you admitted, a second figure may slip in on their heels: stop the tailgater (Space) before the door shuts. A Space on
// an open door with nobody behind is a false stop that holds up the survey crew.
import { define, machine, SPACE, ENTER, ri, rf, shuffle, txt, box, lamp, COL } from './kit.js';

const NAMES = ['Adeyemi', 'Brooks', 'Chen', 'Dahl', 'Esposito', 'Farrow', 'Gupta', 'Haas', 'Ivers', 'Jorund', 'Kaur', 'Lindqvist', 'Moreau', 'Nakata'];
export default define({
  job: { billet: 'dep', label: 'Restrict lab and sensor access to survey personnel', type: 'task:survey' },
  title: 'Lab door badge and tailgate watch', dept: 'security', host: 'console', tool: 'Lab door access panel',
  how: 'Admit (Enter) only people on the access list whose badge reads SURVEY; turn everyone else back (Space). While the door is open, press Space if someone slips in behind.',
  keys: ['Enter admit', 'Space turn back / stop the tailgater'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'gatekeep', input: 'enter+space', win: 'six people at the lab door admitted or turned back correctly, with every tailgater stopped before the door shut',
    fail: 'admitting someone off the list or without survey clearance, letting a tailgater slip in, or turning back cleared crew',
    rule: 'Read the badge against the list: name listed and clearance SURVEY -> Enter, anything else -> Space. After an admit the door stays open briefly; Space only if a second figure appears behind.' },
  rush: 'Waved through anyone in a science tunic.',
  captions: { tailgated: 'door hisses shut on two', 'unauthorised in': 'lab alarm chirp', 'turned away cleared': 'grumble from the queue', 'false stop': 'startled crewman', stalled: 'queue shuffles' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nm = shuffle(r, NAMES), open = m.calm ? 2.2 : 1.6, wait = m.calm ? 6 : 4.5;
    m.list = nm.slice(0, 6).sort();
    const kinds = shuffle(r, ['ok', 'ok', 'ok', 'off', 'crew', r() < 0.5 ? 'ok' : 'off']);
    m.q = kinds.map((k, i) => ({ n: k === 'off' ? nm[6 + i] : pick1(m.list, i), cl: k === 'crew' ? 'CREW' : 'SURVEY', ok: k === 'ok' }));
    const okIdx = m.q.map((v, i) => v.ok ? i : -1).filter(i => i >= 0), tg = new Set(shuffle(r, okIdx).slice(0, ri(r, 1, 2)));
    m.q.forEach((v, i) => { v.tail = tg.has(i); v.ta = rf(r, 0.35, 0.6) * open; });
    m.i = 0; m.ph = 'walk'; m.t = 0; m.pt = 0; m.caught = false; m.rounds = m.q.length; m.round = 0;
    function pick1(list, i) { return list[(i * 5 + 3) % list.length]; }
    const next = () => { m.i++; m.round = m.i; m.ph = 'walk'; m.pt = 0; m.caught = false; if (m.i >= m.q.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const sp = SPACE(code), en = ENTER(code); if (!sp && !en) return false; if (!down) return true;
      const v = m.q[m.i];
      if (m.ph === 'door') { if (en) { if (v.ok) { m.ph = 'open'; m.pt = 0; } else { m.fault('unauthorised in'); next(); } } else { if (v.ok) m.fault('turned away cleared'); next(); } }
      else if (m.ph === 'open' && sp) { if (v.tail && m.pt >= v.ta && !m.caught) { m.caught = true; m.ev('caught', { i: m.i }); } else m.fault('false stop'); }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.pt += dt; const v = m.q[m.i];
      if (m.ph === 'walk' && m.pt > 0.5) { m.ph = 'door'; m.pt = 0; }
      else if (m.ph === 'door' && m.pt > wait) { m.fault('stalled'); m.pt = 0; }
      else if (m.ph === 'open' && m.pt > open) { if (v.tail && !m.caught) m.fault('tailgated'); next(); }
    };
    m.hint = () => { const v = m.q[m.i]; if (!v) return []; if (m.ph === 'door' && m.pt > 0.3) return [[v.ok ? 'Enter' : 'Space', true]]; if (m.ph === 'open' && v.tail && !m.caught && m.pt >= v.ta + 0.1) return [['Space', true]]; return []; };
    m.bad = () => (m.ph === 'door' ? 'Enter' : null);
    m.view = () => ({ q: m.q.map(v => v.n + v.cl + (v.tail ? 'T' : '')) });
    m.buttons = () => [['Enter', 'Admit'], ['Space', 'Turn back / Stop']];
    m.draw = (c, W, H, P) => {
      box(c, 268, 8, 122, 154, COL.panel, 'rgba(255,255,255,.12)', 6); txt(c, 'ACCESS LIST · SURVEY', 276, 22, { size: 9, col: COL.peri });
      m.list.forEach((n, k) => txt(c, n, 278, 40 + k * 18, { size: 11 }));
      const v = m.q[m.i]; if (!v) return;
      box(c, 108, 18, 60, 120, m.ph === 'open' ? 'rgba(79,208,106,.15)' : 'rgba(255,255,255,.05)', m.ph === 'open' ? P.good : COL.dim, 4); txt(c, m.ph === 'open' ? 'OPEN' : 'DOOR', 138, 152, { size: 10, align: 'center', col: COL.dim });
      if (m.ph !== 'walk') { box(c, 14, 30, 86, 58, COL.panel, COL.gold, 6); txt(c, v.n, 22, 52, { size: 12 }); txt(c, v.cl, 22, 74, { size: 11, col: v.cl === 'SURVEY' ? COL.peri : COL.warn }); }
      if (m.ph === 'open') { lamp(c, 138, 70, 10, COL.ink, 'circle'); if (v.tail && m.pt >= v.ta && !m.caught) { lamp(c, 90, 76, 11, P.bad, 'triangle'); txt(c, 'BEHIND!', 60, 104, { size: 11, col: P.bad }); } if (m.caught) txt(c, 'stopped', 60, 104, { size: 11, col: P.good }); }
      txt(c, `Person ${m.i + 1} / ${m.q.length}`, 14, 160, { size: 11, col: COL.pale });
    };
    return m;
  },
});
