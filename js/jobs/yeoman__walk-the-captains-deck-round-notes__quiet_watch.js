// Yeoman: walk the captain's deck round notes. At each station read the captain's note to the officer on duty. The officer talks: a nod, a
// "will do", an answer about something else, and somewhere in there the real answer to this note. Tap E on the real answer (specific, and
// about this note) to write it beside the note. Taking a nod or an off-topic answer lets the small complaint grow into a crisis.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const NOTES = [
  ['Pump 3 whine reported by night watch', 'Pump 3 bearing reseated at 0930, whine gone.'], ['Port nav lamp flickering', 'Port nav lamp swapped at 1040; steady since.'],
  ['Sensor pallet 2 drifting off true', 'Pallet 2 re-zeroed, drift now under 0.1 degree.'], ['Comms log missing hour 0300', 'Hour 0300 restored from the backup buffer.'],
  ['Helm chair squeaks on turns', 'Chair pivot greased at shift change, silent now.'], ['Ops display ghosting on panel 4', 'Panel 4 driver reset at 1115; no ghosting.'],
  ['Long-range array alignment due', 'Array alignment finished at 0820, logged.'], ['Relay 7 static on channel 2', 'Relay 7 filter replaced; channel 2 clean.']];
const NODS = ['Aye, sir.', 'Will do.', 'Noted, I\'ll look into it.', 'Understood.', 'On my list.', 'Yes, yeoman.'];

export default define({
  job: { billet: 'yeoman', label: 'Walk the captain\'s deck round notes', type: 'task:quiet_watch' },
  title: 'Pin a real answer to each round note', dept: 'command', host: 'room', siteName: 'Station', verb: 'Ask',
  how: 'At each station the officer answers the captain\'s note in turns. Tap E only when they give the real answer: specific, and about this note. Nods and answers about something else do not count.',
  keys: ['E tap: write the answer down'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'pin the answer', input: 'e-tap', win: 'each station note answered with the officer\'s specific on-topic reply written beside it',
    fail: 'writing down a nod or an answer to a different note as if it closed the item',
    rule: 'The panel shows the note and the officer\'s current words, which change every second or so. Tap E while the words give a concrete fix for this note; never on a bare acknowledgement or another station\'s fix.' },
  rush: 'Read the notes out at a walk and took every nod as done.',
  captions: { nod: 'officer: "aye"', 'off topic': 'officer shrugs' },
  says: { nod: 'That was a nod, not an answer. The note stays open.', 'off topic': 'That answer was about a different note. Wait for this one.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Helm', prop: 'helm' }, { name: 'Ops station', prop: 'opsstation' }, { name: 'Sensor station', prop: 'sensorstation' }, { name: 'Comms station', prop: 'commsstation' }]), r = m.rnd;
    const per = m.calm ? 1.9 : 1.35, notes = shuffle(r, NOTES);
    m.st = m.sites.map((_, i) => { const [note, real] = notes[i], other = notes[(i + 4) % notes.length][1], nods = shuffle(r, NODS).slice(0, 2);
      return { note, lines: shuffle(r, [{ s: real, ok: 1 }, { s: other, off: 1 }, { s: nods[0] }, { s: nods[1] }]), ph: rf(r, 0, per * 4) }; });
    const say = (u) => { const k = Math.floor(u.ph / per) % u.lines.length; return { line: u.lines[k], frac: (u.ph % per) / per }; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, u = m.st[i]; u.ph += dt;
      if (inp.press) { const { line } = say(u); if (line.ok) { m.finish(i); return; } m.fault(line.off ? 'off topic' : 'nod'); }
      s.prog = clamp(u.ph / (per * 4)) * 0.5;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const { line, frac } = say(m.st[i]); return { at: i, press: !!line.ok && frac > 0.3 && frac < 0.8 && f % 2 === 0, hold: false }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const { line } = say(m.st[i]); return { at: i, press: !line.ok && f % 3 === 0 }; };
    m.view = () => ({ st: m.st.map(u => [u.note, u.lines.map(l => !!l.ok)]) });
    m.panel = (i) => { const u = m.st[i]; if (!u) return null; const { line, frac } = say(u); return { label: u.note, value: `"${line.s}"`, bar: 1 - frac }; };
    m.prompt = (i) => (m.st[i] ? 'Listen: tap [E] only on the specific answer to this note' : '');
    return m;
  },
});
