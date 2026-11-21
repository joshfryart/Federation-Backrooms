// Nurse: patient rounds. At each bed the monitor reading is shown beside the last chart entry. A small difference is a tired patient: tap E to
// chart it. A drop or rise of six or more is deterioration: hold E for most of a second and let go to escalate it to the bridge.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Patient rounds', type: 'loop' },
  title: 'Chart or escalate at the bed', dept: 'medical', host: 'room', siteName: 'Bed', verb: 'Read',
  how: 'At each bed compare the reading with the last chart entry. Under six apart: tap E to chart it. Six or more apart: hold E about 0.7 s, then let go to escalate.',
  keys: ['E tap: chart', 'E hold: escalate'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'chart or escalate', input: 'e-tap+e-hold', win: 'every bed charted when its reading is near the last entry and escalated when it has moved six or more',
    fail: 'charting a bed that has deteriorated, or escalating a bed that is stable',
    rule: 'The panel shows now against last chart. Tap E for a small difference; hold E to the mark and let go for a big one.' },
  rush: 'Glanced at each monitor and charted it all as stable.',
  captions: { 'missed decline': 'monitor soft alarm', 'false alarm': 'bridge comm chirp', unsure: 'pen hesitates' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bed 1', prop: 'bunk' }, { name: 'Bed 2', prop: 'nursestation' }, { name: 'Bed 3', prop: 'bunk' }, { name: 'Bed 4', prop: 'locker' }]), r = m.rnd, need = 0.7;
    const dev = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.beds = m.sites.map((_, i) => { const last = ri(r, 66, 84), d = dev.has(i) ? ri(r, 7, 11) * (r() < 0.5 ? -1 : 1) : ri(r, -3, 3); return { last, now: last + d, dev: dev.has(i) }; });
    m.hh = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const rel = m.released(inp), s = m.cur(inp); if (!s) { m.hh = 0; return; } const b = m.beds[m.next];
      if (inp.hold) m.hh += dt;
      if (rel) { const h = m.hh; m.hh = 0; const i = m.next;
        if (h < 0.35) { if (b.dev) m.fault('missed decline'); else m.finish(i); }
        else if (h >= need) { if (b.dev) m.finish(i); else m.fault('false alarm'); } else m.fault('unsure'); }
      s.prog = clamp(m.hh / need) * 0.9;
    };
    m.hint = (f = 0) => { const b = m.beds[m.next]; if (!b) return { at: -1 }; return { at: m.next, hold: b.dev ? m.hh < need + 0.05 : f % 2 === 0 }; };
    m.bad = (f = 0) => { const b = m.beds[m.next]; if (!b) return { at: -1 }; return { at: m.next, hold: b.dev ? f % 2 === 0 : f % 40 < 30 }; };
    m.view = () => ({ beds: m.beds.map(b => [b.last, b.now]) });
    m.panel = (i) => { const b = m.beds[i]; return b ? { label: `last ${b.last}`, value: `now ${b.now} (${b.now - b.last >= 0 ? '+' : ''}${b.now - b.last})`, bar: clamp(m.hh / need), band: [0.95, 1] } : null; };
    m.prompt = () => 'Tap [E] to chart a small change; hold [E] to the mark and release to escalate a big one';
    return m;
  },
});
