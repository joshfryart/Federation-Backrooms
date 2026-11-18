// XO: inspect lashings and the stores seal. Pull the locker seal wire to read its clamp stamp against the stores log, then pull each pallet
// strap to feel its give. A strap that gives more than a finger's width gets the ratchet: tap E click by click until the strap stops
// moving, then pull it again to prove it. Judging a strap by a glance, or cranking the ratchet past the stop, is a fault.
import { define, machine, room, ri, shuffle } from './kit.js';

const TIGHT = 12;
export default define({
  job: { billet: 'xo', label: 'Inspect lashings and stores seal', type: 'task:cargo_run' },
  title: 'Strap give and ratchet', dept: 'command', host: 'room', siteName: 'Check', verb: 'Pull',
  how: 'Hold E for a firm pull on the seal wire or strap, then let go to read it. A slack strap needs the ratchet: tap E until it reads STOPPED, then hold E for a proving pull. Log a seal stamp that does not match with a tap.',
  keys: ['E hold: firm pull', 'E tap: one ratchet click / log'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'ratchet', input: 'e-hold+e-tap', win: 'every strap pulled for its give and every slack one ratcheted to the stop and pull-proved, seal stamp read against the log',
    fail: 'calling a strap by a glance instead of a firm pull, or clicking the ratchet on after the strap has stopped moving',
    rule: 'Hold E at least half a second, then let go: the panel shows the give. Over 12 mm is slack: tap E one click at a time until it reads STOPPED, then hold E again to prove it. A click after STOPPED over-strains the strap.' },
  rush: 'Looked along the straps from the hatch and they looked tight.',
  captions: { eyeballed: 'strap twangs', 'over-ratcheted': 'strap creaks', click: 'ratchet click' },
  says: { eyeballed: 'That was a flick, not a pull. Hold [E] for a firm pull.', 'over-ratcheted': 'It had already stopped — that click over-strains the strap.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Stores locker seal', prop: 'locker' }, { name: 'Pallet A strap', prop: 'pallet_loaded' }, { name: 'Pallet B strap', prop: 'pallet' }, { name: 'Pallet C strap', prop: 'crate' }]), r = m.rnd;
    const slack = new Set(shuffle(r, [1, 2, 3]).slice(0, ri(r, 1, 2))), logNo = ri(r, 1000, 9999), pull = m.calm ? 0.35 : 0.45;
    m.ck = m.sites.map((s, i) => i === 0 ? { seal: true, log: logNo, stamp: r() < 0.5 ? logNo : logNo + ri(r, 1, 9) * (r() < 0.5 ? 10 : 1), ph: 'pull', h: 0 }
      : { give: slack.has(i) ? ri(r, 20, 34) : ri(r, 4, TIGHT), step: ri(r, 5, 7), ph: 'pull', h: 0, read: false });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, k = m.ck[i];
      if (inp.hold) k.h += dt; if (!rel) return; const dur = k.h; k.h = 0;
      if (k.ph === 'pull') { if (dur < pull) { m.fault('eyeballed'); return; } k.read = true;
        if (k.seal) { if (k.stamp === k.log) m.finish(i); else k.ph = 'log'; } else if (k.give <= TIGHT) m.finish(i); else k.ph = 'ratchet'; }
      else if (k.ph === 'log') m.finish(i);
      else if (k.ph === 'ratchet') { if (dur >= pull) return; k.give = Math.max(TIGHT - 6, k.give - k.step); m.ev('click', { site: i }); if (k.give <= TIGHT - 6) k.ph = 'retest'; }
      else if (k.ph === 'retest') { if (dur < pull) { m.fault('over-ratcheted'); return; } m.finish(i); }
      if (!m.sites[i].done) s.prog = k.ph === 'pull' ? 0.1 : k.ph === 'retest' ? 0.8 : 0.4;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.ck[i]; if (k.ph === 'ratchet' || k.ph === 'log') return { at: i, hold: f % 2 === 0, press: f % 2 === 0 }; return { at: i, hold: k.h < pull + 0.1 }; };
    m.bad = (f = 0) => { const i = m.next, k = m.ck[i]; if (k.ph === 'retest') return { at: i, hold: f % 2 === 0 }; return { at: i, hold: f % 2 === 0, press: f % 2 === 0 }; };
    m.view = () => ({ ck: m.ck.map(k => k.seal ? [k.log, k.stamp] : [k.give, k.step]) });
    m.panel = (i) => { const k = m.ck[i]; if (!k) return null;
      if (k.seal) return { label: k.ph === 'log' ? 'STAMP MISMATCH — tap to log' : 'Seal wire', value: k.read ? `stamp ${k.stamp} / log ${k.log}` : `log ${k.log}`, bar: Math.min(1, k.h / pull) };
      return { label: k.ph === 'pull' ? 'Firm pull' : k.ph === 'ratchet' ? 'SLACK — ratchet' : 'STOPPED — prove it', value: k.read ? `give ${k.give} mm` : '—', bar: Math.min(1, k.h / pull) }; };
    m.prompt = (i) => { const k = m.ck[i]; if (!k) return ''; return k.ph === 'ratchet' ? 'Tap [E] for one ratchet click at a time until it stops' : k.ph === 'retest' ? 'Stopped — hold [E] for a proving pull' : k.ph === 'log' ? 'Stamp does not match the log — tap [E] to log it' : 'Hold [E] for a firm pull, then let go'; };
    return m;
  },
});
