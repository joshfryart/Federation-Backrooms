// Security: escort stretcher teams from transporter. At each stop, look left at the pad list and right at the patient's wristband to read both
// numbers. A match: hold E to wave the team on. A mismatch: tap E to halt the team. Waving a mismatched patient through, halting a good match,
// or ruling before both numbers were read is the failure.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Escort stretcher teams from transporter', type: 'task:medical_relief' },
  title: 'Compare pad list to wristband', dept: 'security', host: 'room', siteName: 'Stop', verb: 'Check',
  how: 'Look left to read the pad list and right to read the wristband. Same number: hold E to wave the team on. Different: tap E to halt it.',
  keys: ['Look left: pad list', 'Look right: wristband', 'E hold: wave on', 'E tap: halt'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'pad against band', input: 'e-hold+e-tap+look',
    win: 'three stretcher stops passed after reading the pad list and wristband, matches waved on and mismatches halted',
    fail: 'waving on a patient whose wristband differs, halting a correct match, or ruling before reading both numbers',
    rule: 'Look left for the pad-list ID, right for the wristband ID. They match: hold E. They differ: tap E to halt. Read both before ruling.' },
  rush: 'Waved each team along the corridor without reading a single wristband.',
  captions: { 'wrong patient': 'patient handed over unmatched', 'false halt': 'team halted for nothing', unread: 'ruled without reading' },
  says: { 'wrong patient': 'That wristband did not match the pad list.', 'false halt': 'The numbers matched. Wave the team on.', unread: 'Read both the pad list and the wristband first.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Junction 1', prop: 'pad' }, { name: 'Junction 2', prop: 'airlock_doors' }, { name: 'Handover', prop: 'exam_couch' }]), r = m.rnd, need = m.calm ? 0.9 : 0.7;
    const mis = Math.floor(r() * 3), mis2 = r() < 0.4 ? (mis + 1) % 3 : -1;
    m.st = m.sites.map((_, i) => { const pad = ri(r, 100, 899), bad = i === mis || i === mis2; return { pad, band: bad ? pad + ri(r, 1, 9) * (r() < 0.5 ? 1 : -1) : pad, bad, L: false, R: false, h: 0, look: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const k = m.st[m.next]; k.look = inp.look || 0; if (k.look > 0.25) k.L = true; if (k.look < -0.25) k.R = true;
      if (inp.hold) k.h += dt;
      if (rel && k.h > 0) { const tap = k.h < 0.4; k.h = 0;
        if (tap) { if (!k.L || !k.R) m.fault('unread'); else if (k.bad) m.finish(m.next); else m.fault('false halt'); } }
      else if (!rel && k.h >= need) { k.h = 0; if (!k.L || !k.R) m.fault('unread'); else if (k.bad) m.fault('wrong patient'); else m.finish(m.next); return; }
      s.prog = k.L && k.R ? 0.5 : (k.L || k.R ? 0.25 : 0);
    };
    m.hint = (f = 0) => { const k = m.st[m.next]; if (!k) return { at: -1 }; if (!k.L) return { at: m.next, hold: false, look: 0.4 }; if (!k.R) return { at: m.next, hold: false, look: -0.4 };
      if (k.bad) return f % 2 ? { at: m.next, hold: false } : { at: m.next, hold: true, press: true }; return { at: m.next, hold: true }; };
    m.bad = () => { const k = m.st[m.next]; return { at: m.next, hold: true, look: 0, wave: !!k }; };
    m.view = () => ({ st: m.st.map(k => [k.pad, k.band]) });
    m.panel = (i) => { const k = m.st[i]; if (!k) return null; const sh = k.look > 0.25 ? `Pad list ${k.pad}` : k.look < -0.25 ? `Wristband ${k.band}` : 'Look left: pad list / right: wristband';
      return { label: sh, value: `${k.L ? 'pad read' : 'pad -'}  ${k.R ? 'band read' : 'band -'}`, bar: k.L && k.R ? 1 : k.L || k.R ? 0.5 : 0 }; };
    m.prompt = () => 'Look left and right to read both numbers, then hold [E] to wave on or tap [E] to halt';
    return m;
  },
});
