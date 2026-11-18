// Deck crew: routine deck walk and tie-down check. A strap can look tight and still give. At each craft grip the strap end (hold E) and tug it
// with a sharp flick of the view; the panel shows how far it gave. A strap that gives must be ratcheted back: tap E once per click until it
// sits in its groove. A click on a strap you have not tugged, or a click past the groove, is a fault (an untested strap, or a stripped ratchet).
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Routine deck walk and tie-down check', type: 'task:quiet_watch' },
  title: 'Tie-down tug and re-tension', dept: 'flight', host: 'room', item: 'cargo_hook', siteName: 'Strap', verb: 'Tug',
  how: 'At each craft hold E and flick your view sharply to tug the strap. If it gives (red mark), let go and tap E once per ratchet click until it sits in the groove. A tight strap passes on the tug.',
  keys: ['E hold + sharp view flick: tug', 'E tap: one ratchet click'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'tug and ratchet', input: 'e-hold+e-tap+swing', win: 'every strap on the pad row tugged, and each one that gave clicked back exactly into its groove',
    fail: 'ratcheting a strap before tugging it, or clicking past the groove and stripping the ratchet',
    rule: 'Hold E and flick the view fast (a tug): the strap reports its give. Zero give passes. A strap that gave shows how many clicks it is short; tap E exactly that many times.' },
  rush: 'Looked down the row; the straps all looked tight.',
  captions: { untested: 'ratchet clicks', stripped: 'ratchet pawl cracks' },
  says: { untested: 'Tug it first — you cannot tell a loose strap by looking.', stripped: 'Past the groove — the ratchet stripped. Count the clicks.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Craft 1 strap', prop: 'shuttle' }, { name: 'Craft 2 strap', prop: 'workpod' }, { name: 'Craft 3 strap', prop: 'hoversled' }, { name: 'Craft 4 strap', prop: 'maint_stand' }]), r = m.rnd;
    const loose = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 2, 3))), flick = m.calm ? 1.6 : 2.0;
    m.straps = m.sites.map((_, i) => ({ short: loose.has(i) ? ri(r, 2, 5) : 0, tugged: false, tug: 0, clicks: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, k = m.straps[i];
      if (inp.press && k.tugged && k.short) { k.clicks++; if (k.clicks > k.short) { m.fault('stripped'); k.clicks = 0; } }
      else if (inp.press && !k.tugged && k.tug === 0) k.armed = true;
      if (inp.hold && !k.tugged) { if (Math.abs(inp.swing || 0) > flick) { k.tug += dt; if (k.tug > 0.15) { k.tugged = true; k.armed = false; m.ev('tug', { site: i, give: k.short }); if (!k.short) { m.finish(i); return; } } } }
      if (!inp.hold && !k.tugged) { if (k.armed && k.tug === 0) k.taps = (k.taps || 0) + 1; k.armed = false; k.tug = 0; if (k.taps >= 2) { m.fault('untested'); k.taps = 0; } }
      if (k.tugged && k.short && k.clicks === k.short && !inp.hold) { m.finish(i); return; }
      s.prog = s.done ? 1 : clamp(k.tugged ? 0.3 + 0.6 * k.clicks / k.short : 0, 0, 0.9);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.straps[i]; if (!k.tugged) return { at: i, hold: true, press: f % 40 === 0, swing: 3 }; const t = f % 4 === 0; return { at: i, hold: t, press: t, swing: 0 }; };
    m.bad = (f = 0) => { const t = f % 4 === 0; return { at: m.next, hold: t, press: t, swing: 0 }; };
    m.view = () => ({ straps: m.straps.map(k => k.short) });
    m.panel = (i) => { const k = m.straps[i]; if (!k) return null; if (!k.tugged) return { label: 'Strap', value: 'untested — tug it', bar: 0 }; return { label: '✖ GIVES', value: `click ${k.clicks} / ${k.short} to the groove`, bar: k.clicks / k.short, band: [1, 1] }; };
    m.prompt = (i) => { const k = m.straps[i]; return !k ? '' : !k.tugged ? 'Hold [E] and flick your view hard to tug the strap' : `It gave: tap [E] ${k.short - k.clicks} more click(s) to the groove`; };
    return m;
  },
});
