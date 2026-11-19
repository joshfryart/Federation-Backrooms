// Counsellor: visit the cargo handlers during loading. Walk the loading bays. At each handler, tap E first to ask whether the rota has given
// them a break. Had one: on to the next. Skipped it: hold E to pass them water from the cooler, keeping steady. Asks for a hand: hold E and
// take the crate for them, keeping your view steady while you carry it. Grabbing in without asking, swinging round with a load, or letting go
// early all cost the visit.
import { define, machine, room, pick, shuffle, clamp } from './kit.js';

const NAMES = ['Brodie', 'Akande', 'Sølvberg', 'Fitch', 'Ramires', 'Hollis', 'Twelvetrees', 'Ngata'];
export default define({
  job: { billet: 'counsel', label: 'Visit the cargo handlers during loading', type: 'task:cargo_run' },
  title: 'Water and a hand on the loading line', dept: 'medical', host: 'room', siteName: 'Handler', verb: 'Visit',
  how: 'Tap E to ask each handler about their break. If they skipped it, hold E to hand them water; if they ask for a hand, hold E to carry the crate. Keep your view steady while you carry.',
  keys: ['E tap: ask', 'E hold: water / carry', 'keep steady'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'ask then carry', input: 'e-tap+e-hold+turn', win: 'every handler asked about their break, water passed to those who skipped it and the crate carried for whoever asked for a hand',
    fail: 'grabbing in before asking, slopping the water or dropping the crate by turning sharply, or putting it down early',
    rule: 'Tap E (under 0.4 s) to ask. Panel then says HAD A BREAK, SKIPPED (hold E 1 s: water) or GIVE US A HAND (hold E 2.5 s: carry). While holding, turning faster than 0.9 rad/s spills or drops.' },
  rush: 'Shouted "drink some water!" across the bay and left.',
  captions: { barged: 'handler startles', spilled: 'water splashes', dropped: 'crate thuds', 'put down early': 'handler grunts' },
  says: { barged: 'You grabbed in without asking how they were.', spilled: 'Turned too fast — the water went everywhere.', dropped: 'You swung round and dropped the crate.', 'put down early': 'You put it down before they were done.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bay 1 handler', prop: 'crate' }, { name: 'Lift rig handler', prop: 'pallet_loaded' }, { name: 'Sled handler', prop: 'hoversled' }, { name: 'Bay 4 handler', prop: 'cart' }]), r = m.rnd;
    const needs = shuffle(r, ['water', 'carry', pick(r, ['water', 'ok']), pick(r, ['ok', 'carry'])]), steady = m.calm ? 1.2 : 0.9;
    m.hs = m.sites.map((_, i) => ({ name: NAMES[(i + Math.floor(r() * 8)) % 8], need: needs[i], asked: false, held: 0, prog: 0, dur: needs[i] === 'carry' ? 2.5 : 1.0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, h = m.hs[i];
      if (inp.hold) {
        h.held += dt;
        if (!h.asked) { if (h.held > 0.6 && h.held < 50) { m.fault('barged'); h.held = 99; } }
        else if (h.need !== 'ok') { if ((inp.turn || 0) > steady) { m.fault(h.need === 'carry' ? 'dropped' : 'spilled'); h.prog = 0; h.held = 99; } else if (h.held < 50) { h.prog = clamp(h.prog + dt / h.dur); if (h.prog >= 1) { m.finish(i); return; } } }
      }
      if (rel) {
        if (!h.asked && h.held < 0.4) { h.asked = true; if (h.need === 'ok') { m.finish(i); return; } }
        else if (h.asked && h.held < 50 && h.prog > 0.05 && h.prog < 1) { m.fault('put down early'); h.prog = 0; }
        h.held = 0;
      }
      s.prog = s.done ? 1 : (h.asked ? 0.2 : 0) + h.prog * 0.7;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const h = m.hs[i]; return !h.asked ? { at: i, hold: f % 8 < 3, turn: 0 } : { at: i, hold: true, turn: 0.2 }; };
    m.bad = (f = 0) => { const i = m.next, h = m.hs[i]; return !h?.asked ? { at: i, hold: true } : { at: i, hold: true, turn: 2.5 }; };
    m.view = () => ({ hs: m.hs.map(h => [h.name, h.need]) });
    const said = { ok: 'HAD A BREAK', water: 'SKIPPED IT — water', carry: 'GIVE US A HAND — carry' };
    m.panel = (i) => { const h = m.hs[i]; if (!h) return null; return { label: h.asked ? said[h.need] : `${h.name} — ask first`, value: h.asked && h.need !== 'ok' ? `${Math.round(h.prog * 100)} %` : '', bar: h.prog }; };
    m.prompt = (i) => { const h = m.hs[i]; if (!h) return ''; return !h.asked ? `Tap [E] to ask ${h.name} whether they have had a break` : h.need === 'carry' ? 'Hold [E] to carry the crate — keep your view steady' : 'Hold [E] to pass water from the cooler — steady'; };
    return m;
  },
});
