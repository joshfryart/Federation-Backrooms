// Second officer: walk the decks and spot-check logs. At each department's wall stand, tap E to turn through the last three log entries.
// An entry more than an hour after the one before it, or a latest entry that contradicts the department's status lamp, is a gap: hold E on
// that page to pencil it. The last page is the spot-check line: hold E there to initial. Initialling with a gap unmarked, or pencilling a
// sound entry, is a fault.
import { define, machine, room, ri, pick } from './kit.js';

const WORK = ['coolant check done', 'pump rounds logged', 'filter swap complete', 'sensor sweep clean', 'stores count matched', 'door seals tested', 'relay test run'];
const fmt = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}${String(min % 60).padStart(2, '0')}`;

export default define({
  job: { billet: 'so', label: 'Walk the decks and spot-check logs', type: 'task:quiet_watch' },
  title: 'Department log spot-check', dept: 'command', host: 'room', siteName: 'Log stand', verb: 'Spot-check',
  how: 'Tap E to turn through the last three entries; hold E on any entry with an hour-long gap or that contradicts the lamp to pencil it, then hold E on the spot-check line to initial.',
  keys: ['E tap: next entry', 'E hold: pencil a gap / initial'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'spot-check', input: 'e-tap+e-hold', win: 'each department log read through its last three entries, every time gap or lamp contradiction pencilled, then initialled',
    fail: 'initialling a log with an unmarked hour gap, or pencilling an entry that is sound',
    rule: 'Tap E to turn a page. Hold E (most of a second) to write: on an entry, a gap mark; on the final spot-check line, your initials.' },
  rush: 'Glanced at the tidy handwriting and initialled every book.',
  captions: { 'initialled a gap': 'pencil scratch', 'false mark': 'eraser rub' },
  says: { 'initialled a gap': 'You initialled a book with a gap in it. Pencil every gap first.', 'false mark': 'That entry was sound; no mark needed.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Engineering log stand', prop: 'shelving' }, { name: 'Sickbay log stand', prop: 'drawers' }, { name: 'Security log stand', prop: 'issuecounter' }]), r = m.rnd;
    const hold = m.calm ? 0.6 : 0.7, gapStand = ri(r, 0, 2);
    m.books = m.sites.map((_, i) => {
      let t = ri(r, 6, 10) * 60 + pick(r, [0, 15, 30, 45]); const prev = t; const lampAmber = r() < 0.4, mustGap = i === gapStand || r() < 0.4;
      const gapAt = mustGap ? ri(r, 0, lampAmber ? 1 : 2) : -1;
      const ent = [0, 1, 2].map(k => { t += k === gapAt ? ri(r, 75, 150) : ri(r, 20, 50); return { at: t, what: pick(r, WORK), bad: k === gapAt, marked: false }; });
      if (lampAmber) { ent[2].what = 'all nominal, nothing open'; ent[2].bad = true; }
      return { prev, lamp: lampAmber ? 'AMBER' : 'green', ent, page: 0 };
    });
    m.h = 0; m.acted = false;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, b = m.books[i];
      if (inp.hold) { m.h += dt; if (m.h >= hold && !m.acted) { m.acted = true;
        if (b.page < 3) { const e = b.ent[b.page]; if (!e.marked) { if (e.bad) { e.marked = true; m.ev('pencil', { site: i }); } else m.fault('false mark'); } }
        else if (b.ent.some(e => e.bad && !e.marked)) m.fault('initialled a gap'); else { m.finish(i); m.h = 0; m.acted = false; return; } } }
      if (rel) { if (m.h < 0.3 && b.page < 3) b.page++; m.h = 0; m.acted = false; }
      s.prog = b.page / 3 * 0.9;
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const b = m.books[i];
      if (m.acted) return { at: i, hold: false };
      const write = b.page === 3 || (b.ent[b.page].bad && !b.ent[b.page].marked);
      return { at: i, hold: write ? true : (m.h === 0 && f % 3 === 0) };
    };
    m.bad = (f = 0) => { const i = m.next, b = m.books[i]; if (!b) return { at: -1 }; return { at: i, hold: b.page < 3 ? f % 3 === 0 : f % 30 < 25 }; };
    m.view = () => ({ b: m.books.map(b => [b.lamp, b.ent.map(e => fmt(e.at) + (e.bad ? '!' : ''))]) });
    m.panel = (i) => {
      const b = m.books[i]; if (!b) return null; const hb = Math.min(1, m.h / hold);
      if (b.page === 3) return { label: `Spot-check line (lamp ${b.lamp})`, value: b.ent.map(e => e.marked ? '✎' : '✓').join(' ') + ' — hold E to initial', bar: hb };
      const e = b.ent[b.page], before = b.page ? b.ent[b.page - 1].at : b.prev;
      return { label: `Entry ${b.page + 1}/3 · lamp ${b.lamp}`, value: `${fmt(e.at)} ${e.what} (prev ${fmt(before)})${e.marked ? ' ✎ gap marked' : ''}`, bar: hb };
    };
    m.prompt = (i) => { const b = m.books[i]; return !b ? '' : b.page === 3 ? 'Hold [E] to initial the spot-check line' : 'Tap [E] for the next entry; hold [E] to pencil a gap or contradiction'; };
    return m;
  },
});
