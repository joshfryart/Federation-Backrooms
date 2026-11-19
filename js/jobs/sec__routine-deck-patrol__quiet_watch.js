// Security, quiet watch: routine deck patrol. At each corridor junction stand and watch the corridor for the length of the watch. Nearly all
// of it is dull. Once in a while a door seal light down one side flicks to OPEN for a moment: turn your head to that side and tap E to note
// it before it settles. When the watch time is up, face ahead and tap E to tick the slate. Tapping at nothing, noting the wrong side, or
// letting an open door slip by are faults.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Routine deck patrol', type: 'task:quiet_watch' },
  title: 'Junction watch on a quiet deck', dept: 'security', host: 'room', item: 'padd', siteName: 'Junction', verb: 'Watch',
  how: 'Stand at each junction and watch. If a door shows OPEN on one side, turn toward that side and tap E. When the watch is up, face ahead and tap E to tick the slate.',
  keys: ['turn toward the open door + E tap: note it', 'face ahead + E tap: tick the junction'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'stand watch', input: 'e-tap+look', win: 'every junction watched to the end and ticked, each brief open-door flicker noted toward the right side in time',
    fail: 'noting doors that were never open, looking to the wrong side, or drifting through a flicker without a note',
    rule: 'The panel stays quiet for long stretches; when it reads DOOR OPEN LEFT or RIGHT, look that way and tap E within a second. When the watch bar fills, look straight ahead and tap E.' },
  rush: 'Walked the round at pace and ticked every junction without stopping.',
  captions: { jumpy: 'slate: nothing there', 'missed door': 'door left open behind you', 'wrong side': 'wrong door noted', early: 'round not finished' },
  says: { jumpy: 'Nothing happened there. Note only a door that shows open.', 'missed door': 'A door flicked open and you missed it.', 'wrong side': 'Wrong side: turn toward the open door before you note it.', early: 'Finish the watch before you tick the junction.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Junction 1', prop: 'airlock_doors' }, { name: 'Junction 2', prop: 'bunk' }, { name: 'Junction 3', prop: 'locker' }, { name: 'Junction 4', prop: 'shelving' }]), r = m.rnd;
    const win = m.calm ? 1.5 : 1.0, D = () => rf(r, 4, 5.2), hits = new Set(); while (hits.size < 2) hits.add(ri(r, 0, 3)); if (r() < 0.4) hits.add(ri(r, 0, 3));
    m.js = m.sites.map((_, i) => { const d = D(); return { D: d, w: 0, ev: hits.has(i) ? { at: rf(r, 1.2, d - win - 0.5), side: r() < 0.5 ? 1 : -1, done: false } : null }; });
    const live = (j) => j.ev && !j.ev.done && j.w >= j.ev.at && j.w <= j.ev.at + win;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, j = m.js[i], l = inp.look || 0; j.w += dt;
      if (j.ev && !j.ev.done && j.w > j.ev.at + win) { j.ev.done = true; m.fault('missed door'); }
      if (inp.press) {
        if (live(j)) { if (Math.sign(l) === j.ev.side && Math.abs(l) > 0.25) { j.ev.done = true; m.ev('noted', { site: i }); } else m.fault('wrong side'); }
        else if (j.w >= j.D) { if (Math.abs(l) < 0.2) { m.finish(i); return; } m.fault('jumpy'); }
        else m.fault(j.w > j.D * 0.6 ? 'early' : 'jumpy');
      }
      s.prog = clamp(j.w / j.D) * 0.9;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const j = m.js[i];
      if (live(j)) return { at: i, look: j.ev.side * 0.4, press: j.w > j.ev.at + 0.3 };
      return { at: i, look: 0, press: j.w >= j.D + 0.1 }; };
    m.bad = (f = 0) => ({ at: m.next, look: 0, press: f % 20 === 5 });
    m.view = () => ({ js: m.js.map(j => (j.ev ? [+j.ev.at.toFixed(2), j.ev.side] : null)) });
    m.panel = (i) => { const j = m.js[i]; if (!j) return null; const o = live(j);
      return { label: o ? `DOOR OPEN ${j.ev.side > 0 ? 'LEFT' : 'RIGHT'}` : j.w >= j.D ? 'Watch complete' : 'Corridor quiet', value: `${Math.min(j.w, j.D).toFixed(1)} / ${j.D.toFixed(1)} s`, bar: clamp(j.w / j.D), band: [0.99, 1] }; };
    m.prompt = (i) => { const j = m.js[i]; if (!j) return ''; return live(j) ? `A door shows open on the ${j.ev.side > 0 ? 'left' : 'right'}: turn that way and tap [E]` : j.w >= j.D ? 'Face straight ahead and tap [E] to tick the slate' : 'Stand and watch the corridor'; };
    return m;
  },
});
