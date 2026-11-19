// Deputy security chief, medical relief: keep the peace at a mess table where two tired crews have fallen out. Each side speaks in turn; let
// them finish (cutting in is a fault), then repeat their point back in your own words by picking the paraphrase (1-3) that keeps what they
// actually said. A distorted restatement makes them pull back and you must try again. Meanwhile the two sides lean in closer; once they are
// over the line, split them up (Space). Stepping in when nobody is leaning is heavy-handed.
import { define, machine, DIG, SPACE, rf, shuffle, txt, box, bar, wrapText, COL } from './kit.js';

const G = [
  ['Your crew took every table at shift change and left us standing with trays.', 'You had nowhere to sit after your shift.', 'You want the other crew banned from the mess.', 'You think they did it on purpose to insult you.'],
  ['Nobody from engineering has cleared their cups in three days.', 'The cups are being left for someone else to clear.', 'Engineering should do all the washing up.', 'You are angry about the replicator menu.'],
  ['The music is loud during our only rest hour.', 'The noise is cutting into your one rest hour.', 'You want music banned on the ship.', 'You never liked their choice of songs.'],
  ['We were told the lounge was booked for us tonight.', 'You were promised the lounge for tonight.', 'You think the booking system is broken forever.', 'You want the lounge every night.'],
  ['He called my team slow in front of the Chief.', 'Being called slow in front of the Chief stung.', 'You want him reported for insubordination.', 'You think your team is slow too.'],
  ['They keep taking the last coffee and not restarting the urn.', 'The urn is left empty after the last cup.', 'You want coffee rationed by department.', 'You think they drink too much coffee.'],
  ['Half our watch was pulled for sickbay and nobody thanked them.', 'Your watch did extra sickbay work without thanks.', 'You want your watch excused from sickbay duty.', 'You think the CMO is ungrateful.'],
  ['Someone moved our kit off the bench without asking.', 'Your kit was moved without anyone asking.', 'You think somebody stole from you.', 'You want the bench assigned by name.'],
];
export default define({
  job: { billet: 'dep', label: 'Keep the peace in mess and lounge', type: 'task:medical_relief' },
  title: 'Mess table grievance restating', dept: 'security', host: 'console', tool: 'Mess table and table pad',
  how: 'Let each speaker finish, then pick the restatement (1-3) that keeps their real point. When the two sides lean in past the line, press Space to split them up.',
  keys: ['1-3 restate their point', 'Space split them up'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'restate grievances', input: 'digits+space', win: 'four grievances heard out in full and each restated faithfully, with the table kept apart until both sides settle',
    fail: 'cutting a speaker off, restating a distorted version of their point, or letting the sides scuffle',
    rule: 'Words appear as the speaker talks; wait until they stop. Then press the number of the paraphrase that keeps their point without adding or blaming. Space only when the lean meter is past its line.' },
  rush: 'Told both tables to grow up and left them to it.',
  captions: { interrupted: 'speaker bristles', misheard: 'speaker pulls back', scuffle: 'chair scrapes', 'heavy-handed': 'startled silence' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 1 / 12 : 1 / 8.5;
    m.items = shuffle(r, G).slice(0, 4).map((g, k) => { const opts3 = shuffle(r, [0, 1, 2]); return { side: k % 2 ? 'Engineering' : 'Medical', say: g[0], opts: opts3.map(j => g[1 + j]), ok: opts3.indexOf(0) + 1, tried: [], talk: rf(r, 1.4, 2.0) }; });
    m.i = 0; m.pt = 0; m.lean = rf(r, 0.1, 0.3); m.rounds = 4; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { if (down) { if (m.lean < 0.5) m.fault('heavy-handed'); m.lean = 0; } return true; }
      const d = DIG(code); if (!d || d > 3) return false; if (!down) return true; const it = m.items[m.i];
      if (m.pt < it.talk) { m.fault('interrupted'); m.pt = 0; return true; }
      if (it.tried.includes(d)) return true;
      if (d !== it.ok) { it.tried.push(d); m.fault('misheard'); return true; }
      m.i++; m.round = m.i; m.pt = 0; if (m.i >= m.items.length) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.pt += dt; m.lean += rate * dt; if (m.lean >= 1) { m.fault('scuffle'); m.lean = 0.3; } };
    m.hint = () => { const it = m.items[m.i]; if (!it) return []; if (m.lean > 0.82) return [['Space', true]]; return m.pt > it.talk + 0.1 ? [['Digit' + it.ok, true]] : []; };
    m.bad = () => 'Digit1';
    m.view = () => ({ items: m.items.map(it => it.say.slice(0, 12) + it.ok) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Space', 'Split them up']];
    m.draw = (c, W, H, P) => {
      const it = m.items[m.i]; txt(c, 'LEAN', 352, 16, { size: 9, col: COL.dim }); bar(c, 330, 22, 60, 8, m.lean, { col: m.lean > 0.75 ? P.bad : COL.peri, mark: 0.75 });
      if (!it) return; txt(c, `${it.side} (${m.i + 1} / 4)`, 14, 16, { size: 11, col: COL.gold });
      const shown = it.say.slice(0, Math.floor(it.say.length * Math.min(1, m.pt / it.talk)));
      wrapText(shown, 52).slice(0, 2).forEach((l, k) => txt(c, l, 14, 38 + k * 15, { size: 12, col: COL.pale }));
      if (m.pt < it.talk) { txt(c, '…listening', 14, 80, { size: 10, col: COL.dim }); return; }
      it.opts.forEach((o, k) => { const y = 74 + k * 30, tried = it.tried.includes(k + 1); box(c, 14, y, 372, 26, COL.panel, tried ? P.bad : 'rgba(255,255,255,.15)', 5);
        txt(c, `${k + 1}  ${o}`, 22, y + 17, { size: 11, col: tried ? COL.dim : COL.ink }); if (tried) txt(c, '✗', 378, y + 17, { size: 12, align: 'right', col: P.bad }); });
    };
    return m;
  },
});
