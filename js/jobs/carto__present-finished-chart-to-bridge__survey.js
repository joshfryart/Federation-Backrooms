// Cartographer, survey: present the finished chart to the bridge. At the bridge screen, point at each main body in the order on the slate
// (aim the view at it). The panel gives the body's confidence. A firm body (70 % or more) you name with authority: hold E. An uncertain one
// you must not oversell: tap E to hedge and cite its sweep time. Holding on an uncertain body claims it as certain and draws a rebuke.
// Then tap E at the presentation record to note the officer's decision.
import { define, machine, room, ri, shuffle, pick, clamp } from './kit.js';

const BODIES = ['Kappa IV', 'Gas giant b', 'Moonlet 3', 'Unknown U-12', 'Dust ring', 'Rogue body R-2', 'Ice dwarf', 'Brown dwarf'];
export default define({
  job: { billet: 'carto', label: 'Present finished chart to bridge', type: 'task:survey' },
  title: 'Chart briefing without overclaiming', dept: 'sciences', host: 'room', item: 'padd', siteName: 'Station', verb: 'Present',
  how: 'Aim at each body in slate order: hold E to name a firm body (70 %+), tap E to hedge an uncertain one and cite its sweep time, then tap E at the record.',
  keys: ['aim at the body', 'E hold: name it (firm)', 'E tap: hedge + sweep time (uncertain)'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'name or hedge', input: 'e-hold+e-tap+look', win: 'every main body pointed out in slate order, firm ones named outright and uncertain ones hedged with their sweep time, then the decision recorded',
    fail: 'presenting an uncertain body as certain, hedging a firm one, or pointing at the wrong body',
    rule: 'Aim at the next body. Confidence 70 % or more: hold E to name it. Under 70 %: tap E to hedge and cite the sweep time. Never hold on an uncertain body.' },
  rush: 'Read the body list off the slate in one breath and called the chart final.',
  captions: { overclaimed: 'watch officer: "You are sure of that?"', underclaimed: 'watch officer: "Is it there or not?"', 'wrong body': 'officer frowns' },
  says: { overclaimed: 'That body was under 70 %. Claiming it as certain earns a rebuke: hedge and cite the sweep time.', underclaimed: 'That body was firm. Name it with confidence.', 'wrong body': 'Not that one: follow the order on the slate.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bridge screen', prop: 'sensorstation' }, { name: 'Presentation record', prop: 'captain_chair' }]), r = m.rnd;
    const n = 4, looks = shuffle(r, [-0.45, -0.22, 0.22, 0.45]), names = shuffle(r, BODIES), tol = m.calm ? 0.12 : 0.08, nameT = m.calm ? 0.8 : 0.9;
    const unc = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.b = looks.map((look, i) => ({ look, name: names[i], conf: unc.has(i) ? ri(r, 31, 64) : ri(r, 76, 98), sweep: `${ri(r, 10, 23)}${pick(r, ['05', '20', '35', '50'])}`, done: false }));
    m.k = 0; m.hT = 0; m.spent = false; m.officer = pick(r, ['Cdr. Ishii', 'Lt. Cdr. Bale', 'Cdr. Mensah']);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return;
      if (m.next === 1) { if (rel) m.finish(1); return; }
      const lk = inp.look || 0, b = m.b[m.k], on = Math.abs(lk - b.look) <= tol, other = m.b.some((x, j) => j !== m.k && Math.abs(lk - x.look) <= tol);
      if (inp.hold && !m.spent) { m.hT += dt;
        if (m.hT >= nameT) { m.spent = true; if (other) m.fault('wrong body'); else if (on) { if (b.conf < 70) m.fault('overclaimed'); else m.k++; } } }
      if (rel) { if (!m.spent && m.hT < 0.3) { if (other) m.fault('wrong body'); else if (on) { if (b.conf >= 70) m.fault('underclaimed'); else m.k++; } } m.hT = 0; m.spent = false; }
      if (m.k >= n) { m.finish(0); return; } s.prog = clamp(m.k / n, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 1) { const t = f % 6 === 0; return { at: 1, hold: t, press: t }; }
      const b = m.b[m.k]; if (b.conf >= 70) return { at: 0, look: b.look, hold: !m.spent };
      const t = f % 8 === 0; return { at: 0, look: b.look, hold: t, press: t }; };
    m.bad = () => { const b = m.b.find(x => x.conf < 70); return { at: 0, look: b.look, hold: true }; };
    m.view = () => ({ b: m.b.map(x => [x.look, x.name, x.conf]) });
    m.panel = (i) => { if (i === 1) return { label: 'Presentation record', value: `${m.officer} · decision noted?`, bar: 0 };
      const b = m.b[m.k]; if (!b) return { label: '', value: '' }; const side = b.look > 0 ? 'left' : 'right';
      return { label: `Next: ${b.name} (${Math.abs(b.look).toFixed(2)} ${side})`, value: `confidence ${b.conf} % · sweep ${b.sweep}`, bar: m.hT / nameT, band: [0.3 / nameT, 1] }; };
    m.prompt = (i) => i === 1 ? 'Tap [E] to note the officer\'s decision on the record' : 'Aim at the next body: hold [E] to name it if 70 %+, tap [E] to hedge if under';
    return m;
  },
});
