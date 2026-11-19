// Armory, medical relief: prepare quarantine-escort kits. Each restraint is clicked through its ratchet to the first stop: tap E once per tooth,
// three teeth, and stop there (a fourth click over-ratchets it). Then tug it: a sharp swing of the view yanks the cuff. A sound pawl holds and
// the cuff is packed into the kit case with a tap of E. A worn pawl pops open on the tug: toss that cuff into the reject tray with another sharp
// swing (a fresh one from the locker takes its place). Packing untested or popped cuffs, or tossing good ones, is a fault.
import { define, machine, room, shuffle } from './kit.js';

export default define({
  job: { billet: 'armory', label: 'Prepare quarantine-escort kits and restraints', type: 'task:medical_relief' },
  title: 'Ratchet click and tug test', dept: 'security', host: 'room', siteName: 'Cuff', verb: 'Test',
  how: 'Tap E three times to click the cuff to its first stop, then swing the view sharply to tug it. Held: tap E to pack it. Popped open: swing sharply again to toss it in the reject tray.',
  keys: ['E tap: one ratchet tooth / pack', 'sharp swing: tug / toss'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'click and tug', input: 'e-tap+swing', win: 'every escort-kit restraint ratcheted exactly to its first stop, tug-tested, and packed if it held or tossed if it popped',
    fail: 'clicking past the first stop, packing a cuff before tugging it, packing one that popped, or tossing one that held',
    rule: 'Three taps of E to the first stop, no more. A sharp swing tugs it. HELD: tap E to pack. POPPED: settle, then another sharp swing tosses it.' },
  rush: 'Dropped a pair of cuffs, gloves and tags in each case and latched it.',
  captions: { 'over-ratcheted': 'ratchet grinds', untested: 'case latch clicks', 'dud packed': 'cuff rattles loose', 'tossed good': 'cuff clatters in the tray' },
  says: { 'over-ratcheted': 'Past the first stop: three clicks, no more.', untested: 'Tug it first: a sharp swing of the view.', 'dud packed': 'That cuff popped open on the tug. Toss it (sharp swing), do not pack it.', 'tossed good': 'That cuff held the tug. Tap E to pack it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Kit A left cuff', prop: 'shelving' }, { name: 'Kit A right cuff', prop: 'suitrack' }, { name: 'Kit B left cuff', prop: 'shelving' }, { name: 'Kit B right cuff', prop: 'weaponrack' }]), r = m.rnd;
    const dud = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, r() < 0.5 ? 1 : 2)), sharp = m.calm ? 1.8 : 2.2;
    m.cuffs = [0, 1, 2, 3].map(i => ({ dud: dud.has(i), t: 0, st: 'click', settled: true }));
    const C = () => m.cuffs[m.next];
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const q = C(), sw = Math.abs(inp.swing || 0), jerk = sw > sharp && q.settled;
      if (sw < 0.5) q.settled = true; if (jerk) q.settled = false;
      if (q.st === 'click') { if (inp.press) { q.t++; if (q.t === 3) q.st = 'stop'; } }
      else if (q.st === 'stop') { if (inp.press) m.fault('over-ratcheted'); else if (jerk) q.st = q.dud ? 'popped' : 'held'; }
      else if (q.st === 'held') { if (inp.press) { m.ev('packed'); m.finish(m.next); return; } if (jerk) m.fault('tossed good'); }
      else if (q.st === 'popped') { if (inp.press) m.fault('dud packed'); else if (jerk) { m.ev('tossed'); m.finish(m.next); return; } }
      s.prog = s.done ? 1 : (Math.min(q.t, 3) / 3) * 0.5 + (q.st === 'held' || q.st === 'popped' ? 0.4 : 0);
    };
    m.hint = (f = 0) => {
      const q = C(); if (!q) return { at: -1 }; const tap = f % 6 === 0;
      if (q.st === 'click' || q.st === 'held') return { at: m.next, press: tap, hold: tap, swing: 0 };
      return { at: m.next, swing: q.settled ? 3 : 0 };
    };
    m.bad = (f = 0) => ({ at: m.next, press: f % 5 === 0, hold: f % 5 === 0, swing: 0 });
    m.view = () => ({ dud: m.cuffs.map(q => q.dud) });
    m.panel = (i) => {
      const q = m.cuffs[i]; if (!q) return null;
      const lab = { click: `Ratchet tooth ${q.t} / 3`, stop: 'FIRST STOP — tug it', held: 'HELD the tug', popped: 'POPPED OPEN' }[q.st];
      return { label: lab, value: q.st === 'held' ? 'tap to pack' : q.st === 'popped' ? 'toss it' : `${q.t} clicks`, bar: Math.min(q.t, 3) / 3, band: [0.95, 1] };
    };
    m.prompt = (i) => { const q = m.cuffs[i]; return !q ? '' : { click: 'Tap [E] once per ratchet tooth to the first stop', stop: 'Swing the view sharply to tug the cuff', held: 'It held: tap [E] to pack it in the case', popped: 'It popped: swing sharply again to toss it in the reject tray' }[q.st]; };
    return m;
  },
});
