// Counsellor: wellness walkabout on the mess deck. Walk the tables. Where a crewman sits alone, hold E to sit down beside them with a cup of
// tea, and keep your eyes half turned away (beside them, not across from them): their openness only grows while you are side-on. Squaring up
// and staring at them reads as an interrogation and they shut down. Once they are talking, let go to jot the one-word note. A table with a
// group at it needs nothing: tap E to note it and move on; sitting down uninvited is intruding.
import { define, machine, room, rf, pick, shuffle, clamp } from './kit.js';

const NOTES = ['tired', 'homesick', 'skipping meals', 'not sleeping', 'fine', 'quiet', 'restless'];
export default define({
  job: { billet: 'counsel', label: 'Wellness walkabout', type: 'loop' },
  title: 'Side-on mess table check-in', dept: 'medical', host: 'room', siteName: 'Table', verb: 'Sit',
  how: 'At a table with someone alone, hold E to sit beside them and keep your view turned a little away until they open up, then let go to jot the note. At a busy table just tap E.',
  keys: ['E hold: sit beside', 'look a little away', 'E tap: busy table'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'sit alongside', input: 'e-tap+e-hold+look', win: 'every withdrawn crewman drawn out by sitting side-on until they talk, busy tables passed by',
    fail: 'staring straight at a crewman so they shut down, leaving before they talk, or sitting down at a busy table',
    rule: 'Hold E at a lone crewman and keep your look 0.2 – 0.6 rad off them: openness rises. Look straight at them and pressure builds. Release once TALKING. Tap E at a busy table.' },
  rush: 'Asked each table "everyone all right?" from the aisle and kept walking.',
  captions: { 'shut down': 'crewman goes quiet', 'no note': 'chair scrapes', intruding: 'conversation stops' },
  says: { 'shut down': 'You stared at them like a duty officer. They clammed up — sit side-on.', 'no note': 'You got up before they said anything.', intruding: 'That table was busy — you barged into their conversation.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Window table', prop: 'table' }, { name: 'Corner table', prop: 'card_table' }, { name: 'Long table', prop: 'table' }, { name: 'Servery bench', prop: 'servery' }]), r = m.rnd;
    const lone = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, r() < 0.5 ? 2 : 3)), rate = m.calm ? 0.34 : 0.45;
    m.tabs = m.sites.map((_, i) => ({ alone: lone.has(i), side: rf(r, 0.25, 0.45) * (r() < 0.5 ? -1 : 1), open: 0, press: 0, held: 0, note: pick(r, NOTES), n: lone.has(i) ? 1 : 2 + Math.floor(r() * 3) }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, d = m.tabs[i], lk = Math.abs(inp.look || 0);
      if (inp.hold) {
        d.held += dt;
        if (!d.alone) { if (d.held > 0.8) { m.fault('intruding'); d.held = -99; } }
        else if (lk < 0.12) { d.press += dt; if (d.press > 1.0) { m.fault('shut down'); d.press = 0; d.open = Math.max(0, d.open - 0.4); } }
        else if (lk <= 0.65) { d.open = clamp(d.open + rate * dt); d.press = Math.max(0, d.press - dt); }
      }
      if (rel) {
        if (!d.alone) { if (d.held > -1 && d.held < 0.8) { m.finish(i); return; } }
        else if (d.open >= 1) { m.finish(i); return; } else if (d.held > 0.3) m.fault('no note');
        d.held = 0;
      }
      s.prog = s.done ? 1 : d.alone ? d.open * 0.9 : 0;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.tabs[i]; return d.alone ? { at: i, hold: d.open < 1, look: d.side } : { at: i, hold: f % 8 < 3 }; };
    m.bad = () => { const i = m.next; return { at: i, hold: true, look: 0 }; };
    m.view = () => ({ tabs: m.tabs.map(d => [d.alone, d.n, d.note, +d.side.toFixed(2)]) });
    m.panel = (i) => { const d = m.tabs[i]; if (!d) return null; return d.alone ? { label: d.open >= 1 ? 'TALKING' : d.press > 0.3 ? 'Tensing up' : 'Openness', value: d.open >= 1 ? `note: ${d.note}` : `${Math.round(d.open * 100)} %`, bar: d.open, band: [0.99, 1] } : { label: `${d.n} seated, chatting`, value: 'tap E: fine', bar: 0 }; };
    m.prompt = (i) => { const d = m.tabs[i]; return !d ? '' : !d.alone ? 'They are fine together — tap [E] to note it and move on' : d.open >= 1 ? 'They are talking — let go of [E] to jot the note' : 'Hold [E] to sit beside them; keep your eyes a little away, not on their face'; };
    return m;
  },
});
