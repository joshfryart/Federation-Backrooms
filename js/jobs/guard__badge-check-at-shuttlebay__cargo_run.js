// Guard: badge check at the shuttlebay. Each person boarding holds their badge to the reader: tap E to read it, and wait for the display. The
// display compares the badge name with the manifest. CLEAR: wave them forward with a sweep of the view to the right. Name MISMATCH or NO BADGE:
// wave them aside with a sweep to the left. Waving before the reader has finished, waving a mismatch aboard, sending a cleared crewman aside,
// or leaving someone standing at the reader holding up the line are faults.
import { define, machine, room, ri, shuffle } from './kit.js';

const CREW = ['Ens. Abara', 'Lt. Corwen', 'PO Haddad', 'Ens. Maro', 'Tech Lindqvist', 'Lt. Okafor', 'Cpl. Rue', 'Ens. Teague'];
export default define({
  job: { billet: 'guard', label: 'Badge check at shuttlebay', type: 'task:cargo_run' },
  title: 'Shuttlebay reader and wave-on', dept: 'security', host: 'room', siteName: 'Reader', verb: 'Check',
  how: 'Tap E to read each badge and wait for the display. CLEAR: sweep your view right to wave them aboard. MISMATCH or NO BADGE: sweep left to wave them aside. Keep the line moving.',
  keys: ['E tap: read the badge', 'sweep right: aboard', 'sweep left: aside'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'read and wave', input: 'e-tap+swing',
    win: 'every boarder at both reader points read, cleared names waved aboard and mismatched or badgeless people waved aside without stalling the line',
    fail: 'waving someone on before the reader finishes, sending a wrong-name badge aboard, turning a cleared crewman aside, or stalling the queue',
    rule: 'Tap E, wait for the reader to show CLEAR, MISMATCH or NO BADGE. Then a quick sweep of the view: right sends them aboard, left sends them aside.' },
  rush: 'Waved the whole queue up the ramp and counted heads afterwards.',
  captions: { unread: 'reader still chirping', 'let aboard': 'boarding ramp chime', 'turned aside': 'grumbled complaint', stalled: 'queue mutters' },
  says: { unread: 'Wait for the reader before you wave them on.', 'let aboard': 'That badge did not match the manifest.', 'turned aside': 'That one read CLEAR. Wave them aboard.', stalled: 'The line is backing up. Wave them on.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Badge reader', prop: 'baycontrol' }, { name: 'Shuttle hatch reader', prop: 'shuttle' }]), r = m.rnd;
    const nm = shuffle(r, CREW), bad = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ri(r, 2, 3))), rd = m.calm ? 0.8 : 0.55, stall = m.calm ? 4.5 : 3.2;
    m.ppl = Array.from({ length: 6 }, (_, k) => { const b = bad.has(k), kind = !b ? 'clear' : r() < 0.5 ? 'nobadge' : 'mismatch';
      return { name: nm[k], kind, shown: kind === 'mismatch' ? nm[(k + 3) % 8] : nm[k], ph: 'wait', rt: 0, wt: 0 }; });
    m.k = [0, 0]; m.armed = true;
    const who = (i) => m.ppl[i * 3 + m.k[i]];
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, p = who(i), sw = inp.swing || 0;
      if (p.ph === 'wait' && inp.press) { p.ph = p.kind === 'nobadge' ? 'shown' : 'read'; p.rt = 0; }
      if (p.ph === 'read') { p.rt += dt; if (p.rt >= rd) p.ph = 'shown'; }
      if (p.ph === 'shown') { p.wt += dt; if (p.wt > stall) { m.fault('stalled'); p.wt = 0; } }
      if (Math.abs(sw) < 0.4) m.armed = true;
      if (m.armed && Math.abs(sw) > 1.1) { m.armed = false;
        if (p.ph !== 'shown') { m.fault('unread'); }
        else { const fwd = sw < 0; if (fwd && p.kind !== 'clear') m.fault('let aboard'); if (!fwd && p.kind === 'clear') m.fault('turned aside');
          m.ev(fwd ? 'aboard' : 'aside', { name: p.name }); m.k[i]++; if (m.k[i] >= 3) { m.finish(i); return; } } }
      s.prog = m.k[i] / 3 * 0.95;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = who(i);
      if (p.ph === 'wait') return { at: i, press: true, swing: 0 }; if (p.ph === 'read') return { at: i, swing: 0 };
      return { at: i, swing: m.armed ? (p.kind === 'clear' ? -2 : 2) : 0 }; };
    m.bad = (f = 0) => ({ at: m.next, swing: f % 6 < 3 ? -2 : 0 });
    m.view = () => ({ ppl: m.ppl.map(p => [p.name, p.kind]) });
    m.panel = (i) => { const p = m.ppl[i * 3 + (m.k[i] || 0)]; if (!p || m.k[i] >= 3) return { label: 'Reader', value: 'done', bar: 1 };
      const val = p.ph === 'wait' ? `${p.name} waiting` : p.ph === 'read' ? 'reading…' : p.kind === 'clear' ? `CLEAR ✓ ${p.shown}` : p.kind === 'nobadge' ? 'NO BADGE ✖' : `MISMATCH ✖ ${p.shown} ≠ ${p.name}`;
      return { label: `Boarder ${m.k[i] + 1} / 3`, value: val, bar: p.ph === 'read' ? p.rt / rd : p.ph === 'shown' ? 1 : 0 }; };
    m.prompt = (i) => { const p = m.ppl[i * 3 + (m.k[i] || 0)]; if (!p) return '';
      return p.ph === 'wait' ? 'Tap [E] to read the badge' : p.ph === 'read' ? 'Wait for the reader…' : p.kind === 'clear' ? 'CLEAR: sweep your view right to wave them aboard' : 'Sweep your view left to wave them aside'; };
    return m;
  },
});
