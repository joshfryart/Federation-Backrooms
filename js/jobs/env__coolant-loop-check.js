// Environmental tech: coolant loop check. Each valve gland along the plant line weeps a little and the pipe-run listener hisses. Tap E for one
// quarter turn of the wrench, then WAIT: the packing takes a moment to bed in before the hiss and the pressure gauge settle to their new reading.
// Another quarter turn before it has settled is judged on a stale reading and crushes the packing; stop as soon as the hiss is gone.
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Coolant loop check', type: 'loop' },
  title: 'Quarter turns on the weeping glands', dept: 'engineering', host: 'room', item: 'spanner', siteName: 'Gland', verb: 'Tighten',
  how: 'At each valve gland tap E for one quarter turn, then wait for the hiss and the pressure gauge to settle. Turn again only if it still hisses; stop when it is silent.',
  keys: ['E tap: one quarter turn', 'wait for it to settle'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'quarter-turn gland', input: 'e-tap', win: 'every weeping gland silenced and its pressure back in band with no turn made on an unsettled reading',
    fail: 'turning again before the packing settles or after the hiss has stopped, crushing the gland packing',
    rule: 'One tap is a quarter turn. The hiss bar and the pressure needle take a moment to settle after each turn (the panel says SETTLING). Turn again only once it reads SETTLED and still hisses.' },
  rush: 'Cranked every gland down hard and walked off without listening to the line.',
  captions: { crushed: 'packing squeals' }, says: { crushed: 'Crushed the packing: you turned before the reading settled or after the hiss had stopped. It was backed off a turn.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pump A gland', prop: 'pumpskid' }, { name: 'Exchanger gland', prop: 'heatexch' }, { name: 'Return line gland', prop: 'tank' }]), r = m.rnd;
    const lag = m.calm ? 0.55 : 0.75;
    m.g = m.sites.map(() => ({ need: ri(r, 1, 3), turns: 0, since: 9, hiss: 1, shown: 1, p: rf(r, 0.25, 0.45), side: r() < 0.5 ? 'left' : 'right' }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, g = m.g[i];
      g.since += dt;
      if (inp.press) {
        if (g.since < lag || g.turns >= g.need) { m.fault('crushed'); g.turns = Math.max(0, g.turns - 1); }
        else g.turns++;
        g.since = 0;
      }
      g.hiss = clamp(1 - g.turns / g.need); const settled = g.since >= lag;
      if (settled) g.shown = g.hiss; else g.shown += (g.hiss - g.shown) * Math.min(1, dt * 2);
      if (settled && g.turns >= g.need && g.since >= lag + 0.4) m.finish(i);
      s.prog = s.done ? 1 : clamp(g.turns / g.need * 0.9, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const g = m.g[i]; const go = g.since >= lag + 0.05 && g.turns < g.need && f % 2 === 0; return { at: i, press: go, hold: go }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 6 === 0, hold: f % 6 < 2 });
    m.view = () => ({ need: m.g.map(g => g.need), p: m.g.map(g => +g.p.toFixed(2)) });
    m.panel = (i) => { const g = m.g[i]; if (!g) return null; const settled = g.since >= m.g[i].since && g.since >= (m.calm ? 0.55 : 0.75); return { label: settled ? (g.hiss > 0 ? 'SETTLED · hiss' : 'SETTLED · silent') : 'SETTLING…', value: `pressure ${Math.round(60 + (1 - g.shown) * 25 + g.p * 10)} bar`, bar: 1 - g.shown, band: [0.97, 1] }; };
    m.prompt = (i) => { const g = m.g[i]; if (!g) return ''; return g.since < (m.calm ? 0.55 : 0.75) ? 'Wait: the packing is bedding in' : g.turns < g.need ? 'Still hissing: tap [E] for a quarter turn' : 'Silent: hands off the wrench'; };
    return m;
  },
});
