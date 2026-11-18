// Captain: decide on requests from departments. Each head offers three options with their cost; only one fits the posture cap in force.
// Pick it (1-3), then word the decision: set WHO acts, WHAT they do and BY WHEN (← → slot, ↑ ↓ value) and speak it (Enter). An option that
// breaks the cap is refused, and a sentence with a blank or wrong slot leaves the head guessing: the request stays open and it is a fault.
import { define, machine, DIG, ARROW, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const WHO = ['Engineering', 'Operations', 'Security', 'Medical', 'Science'];
const WHEN = ['now', 'by 1400', 'next watch', 'end of day'];
const ACTS = ['run the spare pump', 'borrow two techs', 'defer the refit', 'shut down deck six', 'pull the spare array', 'double the patrol', 'reroute relay six', 'call in reserves', 'swap shift leads'];

export default define({
  job: { billet: 'co', label: 'Decide on requests from departments', type: 'loop' },
  title: 'Request ruling in plain words', dept: 'command', host: 'console', tool: "Captain's chair comm and decision pad",
  how: 'Pick the one option that fits the posture cap, then word the decision plainly: who acts, what they do and by when, and speak it.',
  keys: ['1-3 option', '← → slot', '↑ ↓ word', 'Enter speak'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'word the order', input: 'digits+arrows+enter', win: 'three requests closed, each with the option inside the posture cap spoken as a complete who-what-when sentence',
    fail: 'approving an option that breaks the posture cap, or speaking a decision with a blank or contradicting slot',
    rule: 'Press the number of the option whose cost fits the cap. Then fill the three sentence slots to match that option card (← → choose slot, ↑ ↓ change word) and press Enter to say it.' },
  rush: 'Said "make it so" to every request and closed them unread.',
  captions: { 'breaks posture': 'chair console buzz', 'vague decision': 'head asks "sir?"' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, heads = shuffle(r, WHO);
    m.reqs = [0, 1, 2].map(k => {
      const cap = ri(r, 20, 40), acts = shuffle(r, ACTS).slice(0, 3), fit = ri(r, 0, 2);
      const opts2 = acts.map((a, j) => ({ what: a, who: pick(r, WHO), when: pick(r, WHEN), power: j === fit ? ri(r, 5, cap - 2) : ri(r, cap + 3, cap + 25) }));
      return { head: heads[k], cap, fit, opts: opts2 };
    });
    m.cur = 0; m.phase = 'pick'; m.slot = 0; m.val = [-1, -1, -1]; m.rounds = 3; m.round = 0;
    const R = () => m.reqs[m.cur], lists = () => [WHO, R().opts.map(o => o.what), WHEN];
    const want = () => { const o = R().opts[R().fit]; return [WHO.indexOf(o.who), R().fit, WHEN.indexOf(o.when)]; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code);
      if (m.phase === 'pick') { if (d >= 1 && d <= 3) { if (d - 1 !== R().fit) m.fault('breaks posture'); else { m.phase = 'word'; m.slot = 0; m.val = [-1, -1, -1]; } return true; } return !!a || ENTER(code); }
      if (a === 'L' || a === 'R') { m.slot = (m.slot + (a === 'R' ? 1 : 2)) % 3; return true; }
      if (a === 'U' || a === 'D') { const n = lists()[m.slot].length; m.val[m.slot] = ((m.val[m.slot] + (a === 'D' ? 1 : n - 1)) % n + n) % n; return true; }
      if (ENTER(code)) {
        const w = want(); if (m.val.some((v, j) => v !== w[j])) { m.fault('vague decision'); return true; }
        m.round++; m.ev('closed', { req: m.cur }); m.cur++; m.phase = 'pick'; if (m.cur >= 3) m.win(); return true;
      }
      return !!d;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (m.cur >= 3) return []; if (m.phase === 'pick') return [['Digit' + (R().fit + 1), true]];
      const w = want(), bad = m.val.findIndex((v, j) => v !== w[j]); if (bad < 0) return [['Enter', true]];
      if (bad !== m.slot) return [['ArrowRight', true]]; return [['ArrowDown', true]];
    };
    m.bad = () => m.phase === 'pick' ? 'Digit' + (((m.reqs[m.cur]?.fit ?? 0) + 1) % 3 + 1) : 'Enter';
    m.view = () => ({ reqs: m.reqs.map(q => [q.head, q.cap, q.fit, q.opts.map(o => [o.what, o.who, o.when, o.power])]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Enter', 'Speak']];
    m.draw = (c, W, H, P) => {
      if (m.cur >= 3) return; const q = R();
      txt(c, `${q.head} head requests a ruling — posture cap: power ≤ ${q.cap} MW`, 8, 16, { size: 11, col: COL.gold });
      q.opts.forEach((o, j) => {
        const y = 24 + j * 30, over = o.power > q.cap, chosen = m.phase === 'word' && j === q.fit;
        box(c, 8, y, W - 16, 27, chosen ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', chosen ? COL.orange : null, 8);
        txt(c, `${j + 1}. ${o.what}`, 14, y + 12, { size: 11 }); txt(c, `${o.who} · ${o.when}`, 14, y + 23, { size: 9, col: COL.dim });
        txt(c, `${o.power} MW ${over ? '▲ over cap' : '● fits'}`, W - 14, y + 17, { size: 10, col: over ? P.bad : P.good, align: 'right' });
      });
      if (m.phase === 'word') {
        const L = lists(), y = 124; txt(c, 'Say:', 8, y + 14, { size: 11, col: COL.pale });
        ['WHO', 'WHAT', 'BY WHEN'].forEach((k, j) => {
          const x = 40 + j * 120, on = j === m.slot; box(c, x, y, 116, 34, on ? 'rgba(125,151,232,.25)' : 'rgba(255,255,255,.05)', on ? COL.peri : null, 6);
          txt(c, k, x + 4, y + 11, { size: 8, col: COL.dim }); txt(c, m.val[j] < 0 ? '?' : L[j][m.val[j]], x + 4, y + 26, { size: 9, col: m.val[j] < 0 ? COL.warn : COL.ink });
        });
      } else txt(c, 'Press the number of the option that fits the cap', 8, 140, { size: 11, col: COL.dim });
    };
    return m;
  },
});
