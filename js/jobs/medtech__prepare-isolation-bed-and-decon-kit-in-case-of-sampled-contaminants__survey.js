// Medical technician: prepare an isolation bed and decon kit. Nine make-up tasks are on the board in no particular order, each tagged with
// what must already be done (sheet before curtain, curtain before clips, shower before drain test...). Do them with the digit keys in an
// order that never jumps a prerequisite. The curtain has several fasteners: its clip task is pressed once per clip.
import { define, machine, DIG, ri, shuffle, txt, box, COL } from './kit.js';

const T = [['kit', 'Check kit list', []], ['strip', 'Strip biobed', []], ['sheet', 'Fit fresh sheet', ['strip']], ['curtain', 'Hang curtain', ['sheet']],
  ['clips', 'Clip fasteners', ['curtain']], ['shower', 'Set up decon shower', ['kit']], ['drain', 'Test drain', ['shower']], ['stock', 'Stock gown + bag', ['kit', 'sheet']], ['log', 'Log bed READY', ['clips', 'drain', 'stock']]];
export default define({
  job: { billet: 'medtech', label: 'Prepare isolation bed and decon kit in case of sampled contaminants', type: 'task:survey' },
  title: 'Isolation bed make-up order', dept: 'medical', host: 'console', tool: 'Isolation board',
  how: 'Press a task\'s number (1 – 9) to do it. Each task lists what must be finished first; the clip task is pressed once per fastener. Log the bed ready last.',
  keys: ['1 – 9 do that task'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'sequence by prerequisite', input: 'digits', win: 'all nine make-up tasks done with every prerequisite finished first and every curtain fastener clipped before the bed is logged',
    fail: 'starting a task before the one it depends on, such as hanging the curtain on a stripped bed or logging with a clip open',
    rule: 'Cards sit in shuffled slots 1 to 9 with a "needs" line. A card whose needs are all ticked can be done; pressing any other card is out of sequence. Clips take one press per fastener.' },
  rush: 'Threw a sheet on the bed and pulled the curtain round it.',
  captions: { 'out of sequence': 'curtain rail rattles', 'curtain open': 'warning chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, busy = m.calm ? 0.35 : 0.45;
    m.slot = shuffle(r, T.map(t => t[0])); m.clips = ri(r, 3, 5); m.done = {}; m.clipped = 0; m.busy = 0; m.rounds = 9; m.round = 0;
    const need = (id) => T.find(t => t[0] === id)[2], ready = (id) => need(id).every(n => m.done[n]);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (!d) return false; if (m.busy) return true; const id = m.slot[d - 1];
      if (m.done[id]) return true;
      if (!ready(id)) { m.fault(id === 'log' && m.done.curtain && !m.done.clips ? 'curtain open' : 'out of sequence'); return true; }
      m.busy = busy; if (id === 'clips') { m.clipped++; if (m.clipped < m.clips) return true; }
      m.done[id] = true; m.round++; if (id === 'log') m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.busy = Math.max(0, m.busy - dt); };
    m.hint = () => { if (m.busy) return []; const id = T.map(t => t[0]).find(x => !m.done[x] && ready(x)); return id ? [['Digit' + (m.slot.indexOf(id) + 1), true]] : []; };
    m.bad = () => (m.busy ? null : 'Digit' + (m.slot.indexOf('log') + 1));
    m.view = () => ({ s: m.slot.join(','), c: m.clips });
    m.buttons = () => m.slot.map((_, i) => ['Digit' + (i + 1), String(i + 1)]);
    const nm = (id) => T.find(t => t[0] === id)[1];
    m.draw = (c, W, H, P) => {
      txt(c, `ISOLATION BOARD · ${Object.keys(m.done).length} / 9 done`, 14, 15, { size: 12, col: COL.gold });
      m.slot.forEach((id, i) => {
        const x = 10 + (i % 3) * 128, y = 22 + Math.floor(i / 3) * 48, dn = m.done[id];
        box(c, x, y, 122, 44, dn ? 'rgba(79,208,106,.14)' : 'rgba(255,255,255,.05)', dn ? P.good : null, 5);
        txt(c, `${i + 1}`, x + 6, y + 15, { size: 13, col: COL.orange }); txt(c, nm(id), x + 20, y + 15, { size: 10, col: dn ? COL.dim : COL.ink });
        txt(c, dn ? '✓ done' : id === 'clips' ? `clips ${m.clipped}/${m.clips}` : '', x + 116, y + 15, { size: 9, align: 'right', col: dn ? P.good : COL.pale });
        const nd = need(id); txt(c, nd.length ? 'needs: ' + nd.map(n => (m.done[n] ? '✓' : '·') + nm(n).split(' ').slice(-1)[0]).join(' ') : 'needs: nothing', x + 6, y + 34, { size: 8, col: COL.dim });
      });
    };
    return m;
  },
});
