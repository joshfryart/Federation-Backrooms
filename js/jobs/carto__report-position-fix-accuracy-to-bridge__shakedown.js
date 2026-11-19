// Cartographer, shakedown: report position-fix accuracy to the bridge. Tap E at the lab terminal to pull the fix error log onto your slate.
// On the bridge, the error plot on the nav screen spreads the fixes across it: sweep the view over them (the panel reads the error of the
// fix you are on) and tap E on the WORST fix to point it out; pointing at a milder one hides the worst figure. Then the navigator asks if
// it is inside the safe limit: look left and tap E for "inside", look right and tap E for "outside".
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'carto', label: 'Report position-fix accuracy to bridge', type: 'task:shakedown' },
  title: 'Worst-fix report to the navigator', dept: 'sciences', host: 'room', item: 'padd', siteName: 'Station', verb: 'Report',
  how: 'Tap E at the terminal to pull the log, sweep the view over the fixes on the nav screen and tap E on the worst one, then look left (inside) or right (outside) and tap E to answer the limit question.',
  keys: ['E tap: pull log / point / answer', 'look: sweep the error plot', 'answer: left inside, right outside'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'point out worst', input: 'e-tap+look', win: 'the worst position fix found on the error plot and pointed out, and the limit question answered plainly and correctly',
    fail: 'pointing at a milder fix so the worst figure stays hidden, or telling the navigator the error is inside the limit when it is not (or the reverse)',
    rule: 'Sweep the error plot; the panel reads each fix as you pass it. Tap E on the largest error. Then compare it with the safe limit: look left + tap = inside, look right + tap = outside.' },
  rush: 'Read out the mean error on the bridge and left the worst fix off the report.',
  captions: { 'hid the worst': 'navigator: "and the worst one?"', misreported: 'navigator: "that is not what the log says"' },
  says: { 'hid the worst': 'That is not the worst fix. The navigator corrects you: the worst figure was hidden.', misreported: 'Wrong call on the limit. Compare the worst fix with the safe limit and say it plainly.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Lab terminal (fix log)', prop: 'console' }, { name: 'Nav screen error plot', prop: 'navstation' }]), r = m.rnd;
    const tol = m.calm ? 0.09 : 0.07, looks = shuffle(r, [-0.44, -0.22, 0, 0.22, 0.44]), worst = ri(r, 0, 4);
    m.lim = +rf(r, 0.3, 0.5).toFixed(2); const wv = +(m.lim + (r() < 0.5 ? -1 : 1) * rf(r, 0.04, 0.12)).toFixed(2);
    m.fix = looks.map((look, i) => ({ look, e: i === worst ? wv : +rf(r, 0.05, wv - 0.06).toFixed(2), n: i + 1 }));
    m.worst = worst; m.inside = wv <= m.lim; m.mean = +(m.fix.reduce((a, f) => a + f.e, 0) / m.fix.length).toFixed(2);
    m.ph = 'point'; m.print = 0; m.lk = 0;
    const on = (lk) => m.fix.findIndex(f => Math.abs(lk - f.look) <= tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const lk = inp.look || 0; m.lk = lk;
      if (m.next === 0) { if (inp.press && m.print === 0) m.print = 0.01; if (m.print > 0) { m.print += dt; if (m.print >= 1) m.finish(0); } s.prog = clamp(m.print, 0, 0.95); return; }
      if (!inp.press) return;
      if (m.ph === 'point') { const k = on(lk); if (k < 0) return; if (k !== m.worst) m.fault('hid the worst'); else m.ph = 'answer'; s.prog = 0.5; return; }
      if (Math.abs(lk) < 0.3) return; if ((lk > 0) === m.inside) m.finish(1); else m.fault('misreported');
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const t = f % 8 === 0;
      if (i === 0) return { at: 0, hold: t && m.print === 0, press: t && m.print === 0 };
      const look = m.ph === 'point' ? m.fix[m.worst].look : m.inside ? 0.45 : -0.45; return { at: 1, look, hold: t, press: t }; };
    m.bad = (f = 0) => { const t = f % 8 === 0; if (m.next === 0) return { at: 0, hold: t, press: t }; const k = (m.worst + 1) % 5; return { at: 1, look: m.fix[k].look, hold: t, press: t }; };
    m.view = () => ({ f: m.fix.map(x => [x.look, x.e]), lim: m.lim });
    m.panel = (i) => {
      if (i === 0) return { label: 'Fix error log', value: m.print >= 1 ? 'on slate' : m.print > 0 ? 'printing…' : 'tap to pull', bar: m.print };
      if (m.ph === 'answer') return { label: `Inside the safe limit (${m.lim.toFixed(2)} au)?`, value: m.lk > 0.3 ? 'answer: INSIDE' : m.lk < -0.3 ? 'answer: OUTSIDE' : 'look left = inside · right = outside', bar: 0 };
      const k = on(m.lk); return { label: `mean ${m.mean} au · ${m.fix.length} fixes · limit ${m.lim.toFixed(2)}`, value: k >= 0 ? `fix ${m.fix[k].n}: error ${m.fix[k].e.toFixed(2)} au` : 'sweep across the error plot', bar: k >= 0 ? clamp(m.fix[k].e / (m.lim * 1.5)) : 0, band: [0, 1 / 1.5] };
    };
    m.prompt = (i) => i === 0 ? 'Tap [E] to pull the fix error log onto your slate' : m.ph === 'point' ? 'Sweep the error plot and tap [E] on the worst fix' : 'Look left and tap [E] for inside the limit, right for outside';
    return m;
  },
});
