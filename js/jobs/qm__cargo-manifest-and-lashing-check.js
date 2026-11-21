// Quartermaster: lashing check. Hold E and give the strap a hard swing of the view to tug it: the give reads out. Firm: let go and move on.
// Slack: after letting go, tap E twice to cinch it. Letting go without a real tug leaves the strap untested.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Cargo manifest and lashing check', type: 'loop' },
  title: 'Tug the strap then cinch slack', dept: 'services', host: 'room', siteName: 'Pallet', verb: 'Tug',
  how: 'Hold E and swing the view sharply to tug the strap. If it reads firm, let go. If it gives 25 mm or more, let go and tap E twice to cinch it.',
  keys: ['E hold + swing: tug', 'E tap x2: cinch slack strap'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'tug then cinch', input: 'e-hold+swing+e-tap', win: 'three pallet straps each tugged hard, the slack ones cinched with two taps and the firm ones left alone',
    fail: 'letting go of a strap without a real tug, so a slack strap goes unfound',
    rule: 'Hold E and swing the view to tug. The panel reads the give: under 25 mm is firm, so release. Over 25 mm is slack: release, then tap E twice to cinch.' },
  rush: 'Looked at each strap, called it tight and signed the manifest.',
  captions: { untested: 'strap left unchecked' }, says: { untested: 'You let go without a hard tug. A strap that looks tight can still be slack.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [0, 1, 2].map(i => ({ name: `Pallet ${i + 1} strap`, prop: i === 1 ? 'locker' : 'shelving' }))), r = m.rnd;
    m.p = [0, 1, 2].map(i => ({ give: i === 1 || r() < 0.4 ? ri(r, 28, 45) : ri(r, 4, 14), tug: false, rel: false, taps: 0, h: 0, slack: false })); m.p.forEach(p => p.slack = p.give >= 25);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, p = m.p[i];
      if (inp.hold && !p.rel) { p.h += dt; if (Math.abs(inp.swing || 0) > 1.0 && !p.tug) { p.tug = true; m.ev('tug', { site: i }); } }
      if (rel && !p.rel) { if (!p.tug) { if (p.h > 0.1) m.fault('untested'); p.h = 0; } else if (!p.slack) m.finish(i); else p.rel = true; }
      else if (p.rel && inp.press && ++p.taps >= 2) m.finish(i);
      s.prog = s.done ? 1 : p.tug ? (p.slack ? 0.5 + p.taps * 0.2 : 0.8) : clamp(p.h) * 0.3;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.p[i]; if (!p.tug) return { at: i, hold: true, swing: 1.6 }; if (!p.rel) return { at: i, hold: false }; return { at: i, hold: f % 2 === 0, press: f % 2 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 30 < 15, swing: 0 });
    m.view = () => ({ give: m.p.map(p => p.give) });
    m.panel = (i) => { const p = m.p[i]; return p ? { label: 'Strap give', value: p.tug ? `${p.give} mm ${p.slack ? 'SLACK: tap twice' : 'firm'}` : 'untested', bar: p.tug ? clamp(p.give / 50) : 0, band: [0, 0.5] } : null; };
    m.prompt = (i) => m.p[i]?.rel ? 'Slack: tap [E] twice to cinch' : 'Hold [E] and swing the view to tug the strap';
    return m;
  },
});
