// Deputy security chief: brig and cell field-check. At each cell hold E and keep your eyes on the viewport long enough to see a full breath.
// Once you have watched, the panel says what you saw. A breathing occupant under a bright lamp is logged. A still figure or a dim field lamp
// opens a welfare alert: look up to the alert key on the frame and hold E on it. Staring on at a still occupant without raising the alert, or
// glancing in and letting go before a full breath, leaves a silent cell unchecked. Sign the welfare board last.
import { define, machine, room, rf, shuffle, pick } from './kit.js';

export default define({
  job: { billet: 'dep', label: 'Brig and cell field-check', type: 'loop' },
  title: 'Cell viewport breath watch', dept: 'security', host: 'room', siteName: 'Cell', verb: 'Watch',
  how: 'At each cell hold E while looking straight through the viewport until you have seen a full breath. If the figure is still or the lamp is dim, look up to the alert key and hold E to raise a welfare alert.',
  keys: ['E hold + look at the viewport: watch', 'look up + E hold: raise the alert'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'watch for breathing', input: 'e-hold+look', win: 'every occupant watched through a whole breath, and each still figure or dim lamp answered with a welfare alert',
    fail: 'glancing away before a full breath, or staring at a still occupant without raising the alert',
    rule: 'Hold E with the view on the viewport: the watch meter fills over a breath, then shows BREATHING, STILL or LAMP DIM. For STILL or DIM look up-left to the alert key and hold E there.' },
  rush: 'Walked the row glancing at the lamps and signed the board.',
  captions: { glanced: 'footsteps move on', unanswered: 'silence from the cell' },
  says: { glanced: 'You looked away before a full breath — watch the occupant longer.', unanswered: 'That figure is not moving — look up to the alert key and raise a welfare alert.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cell 1 viewport', prop: 'cell' }, { name: 'Cell 2 viewport', prop: 'cellfield' }, { name: 'Cell 3 viewport', prop: 'cell' }, { name: 'Welfare board', prop: 'secdesk' }]), r = m.rnd;
    const iss = new Set(shuffle(r, [0, 1, 2]).slice(0, 1 + Math.floor(r() * 2))), stare = m.calm ? 3 : 2.2;
    m.cells = [0, 1, 2].map(i => ({ st: iss.has(i) ? pick(r, ['STILL', 'LAMP DIM']) : 'BREATHING', need: rf(r, 1.3, 1.8) * (m.calm ? 0.8 : 1), w: 0, seen: false, al: 0, st2: 0 }));
    m.sign = 0;
    const onPort = (inp) => Math.abs(inp.look || 0) < 0.25, onKey = (inp) => (inp.look || 0) > 0.35;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 3) { if (inp.hold) { m.sign += dt; if (m.sign >= 0.8) m.finish(3); } s.prog = m.sign / 0.8; return; }
      const c = m.cells[i];
      if (!c.seen) {
        if (inp.hold && onPort(inp)) { c.w += dt; if (c.w >= c.need) { c.seen = true; m.ev('seen', { site: i, st: c.st }); if (c.st === 'BREATHING') { m.finish(i); return; } } }
        else if ((rel || (inp.hold && !onPort(inp))) && c.w > 0.1) { m.fault('glanced'); c.w = 0; }
      } else {
        if (inp.hold && onKey(inp)) { c.al += dt; if (c.al >= 0.6) { m.ev('alert', { site: i }); m.finish(i); return; } } else c.al = 0;
        if (inp.hold && onPort(inp)) { c.st2 += dt; if (c.st2 > stare) { m.fault('unanswered'); c.st2 = 0; } }
      }
      s.prog = c.seen ? 0.6 + 0.3 * c.al / 0.6 : 0.6 * c.w / c.need;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 3) return { at: i, hold: true, look: 0 }; const c = m.cells[i]; return { at: i, hold: true, look: c.seen ? 0.45 : 0 }; };
    m.bad = () => ({ at: m.next, hold: true, look: 0 });
    m.view = () => ({ cells: m.cells.map(c => [c.st, +c.need.toFixed(2)]) });
    m.panel = (i) => { if (i === 3) return { label: 'Welfare board', value: 'sign', bar: m.sign / 0.8 }; const c = m.cells[i]; return c ? (c.seen ? { label: c.st, value: c.st === 'BREATHING' ? 'logged' : 'raise alert', bar: c.al / 0.6, band: [0.97, 1] } : { label: 'Watching', value: `${Math.round(c.w / c.need * 100)} % of a breath`, bar: c.w / c.need }) : null; };
    m.prompt = (i) => { if (i === 3) return 'Hold [E] to sign the welfare board'; const c = m.cells[i]; return !c ? '' : !c.seen ? 'Hold [E] and keep looking through the viewport for a full breath' : 'Not right — look up to the alert key on the frame and hold [E]'; };
    return m;
  },
});
