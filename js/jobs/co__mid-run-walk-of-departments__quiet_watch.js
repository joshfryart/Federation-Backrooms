// Captain: mid-run walk of departments. At each department door hold E and pan your view slowly across the room to count the staff at
// their stations (panning too fast skims the room and the count is void: a fault). With the count done, judge the checklist row: a quick
// tap of E ticks it (the count matches the staffing line), holding E for a second flags it for follow-up. A wrong tick or flag is a fault.
import { define, machine, room, ri, clamp } from './kit.js';

const DEPTS = ['Engineering', 'Operations', 'Sickbay', 'Science lab'];

export default define({
  job: { billet: 'co', label: 'Mid-run walk of departments', type: 'task:quiet_watch' },
  title: 'Department headcount walk', dept: 'command', host: 'room', siteName: 'Door', verb: 'Count',
  how: 'At each door hold E and pan slowly across the room to count the staff. Then tap E to tick the row if the count matches the card, or hold E to flag it.',
  keys: ['E hold + slow pan: count', 'E tap: tick', 'E hold 1 s: flag'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'headcount sweep', input: 'e-hold+e-tap+swing', win: 'every department counted with a slow full pan and its checklist row ticked or flagged against that count',
    fail: 'panning so fast the room is skimmed, ticking a row whose count is short, or flagging a row that matches',
    rule: 'Hold E and turn the view at a walking pace until the pan meter fills (too fast voids it). Then compare heads seen with the staffing line: tap E to tick a match, hold E a second to flag a mismatch.' },
  rush: 'Ticked every row on the card from the corridor.',
  captions: { skimmed: 'stylus taps impatiently', 'ticked unseen': 'checklist buzz', 'false flag': 'chief looks puzzled' },
  says: { skimmed: 'Too fast — you skimmed the room. Pan slowly to count.', 'ticked unseen': 'Ticked a row whose headcount does not match. Hold E to flag it.', 'false flag': 'The count matches — tap E to tick it, do not flag it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), DEPTS.map((d, i) => ({ name: `${d} door`, prop: ['console', 'workbench', 'nursestation', 'labbench'][i] }))), r = m.rnd;
    const cap = m.calm ? 1.7 : 1.3, need = 1.0, mis = ri(r, 0, 3);
    m.rows = m.sites.map((_, i) => { const listed = ri(r, 3, 7), off = i === mis || r() < 0.3; return { listed, seen: off ? listed - ri(r, 1, 2) : listed, cover: 0, phase: 'sweep', ht: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, w = m.rows[i], sw = Math.abs(inp.swing || 0);
      if (w.phase === 'sweep') {
        if (inp.hold) { if (sw > cap) { m.fault('skimmed'); w.cover = 0; } else w.cover += sw * dt; if (w.cover >= need) w.phase = 'wait'; }
      } else if (w.phase === 'wait') { if (!inp.hold) w.phase = 'judge'; }
      else {
        const match = w.seen === w.listed;
        if (inp.hold) { w.ht += dt; if (w.ht >= 1.0) { w.ht = 0; w.phase = 'wait'; if (match) m.fault('false flag'); else { m.ev('flag', { site: i }); m.finish(i); return; } } }
        else if (rel) { const t = w.ht; w.ht = 0; if (t > 0 && t < 0.4) { if (match) { m.ev('tick', { site: i }); m.finish(i); return; } m.fault('ticked unseen'); } }
      }
      s.prog = clamp(Math.min(w.cover, need) / need * 0.7 + (w.phase === 'judge' ? w.ht * 0.2 : 0), 0, 0.95);
    };
    m.hint = () => {
      const i = m.next; if (i < 0) return { at: -1 }; const w = m.rows[i];
      if (w.phase === 'sweep') return { at: i, hold: true, swing: 0.9 }; if (w.phase === 'wait') return { at: i, hold: false };
      return { at: i, hold: w.seen === w.listed ? !m.prev : true, swing: 0 };
    };
    m.bad = () => ({ at: m.next, hold: true, swing: 3 });
    m.view = () => ({ rows: m.rows.map(w => [w.listed, w.seen]) });
    m.panel = (i) => {
      const w = m.rows[i]; if (!w) return null; const k = Math.min(w.seen, Math.floor(w.seen * Math.min(1, w.cover / need)));
      return w.phase === 'sweep' ? { label: `Pan the room · card says ${w.listed}`, value: `heads seen ${k}`, bar: w.cover / need } : { label: `Card ${w.listed} · seen ${w.seen}`, value: w.seen === w.listed ? 'matches: tap E to tick' : 'short: hold E to flag', bar: w.ht };
    };
    m.prompt = (i) => { const w = m.rows[i]; return !w ? '' : w.phase === 'sweep' ? 'Hold [E] and pan slowly across the room to count the staff' : w.phase === 'wait' ? 'Let go of [E]' : 'Tap [E] to tick the row, or hold [E] one second to flag it'; };
    return m;
  },
});
