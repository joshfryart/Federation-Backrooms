// Chief engineer: grid, gravity and life support rounds. Down each breaker panel the finger goes breaker by breaker: tap E to lay the back of a
// finger on the breaker (its heat shows only after the touch), flick the view right to move to the next one. A breaker that is warm, or loaded
// over the amps stamped on its case, is about to trip: hold E to rack it back before moving on. Racking a cool, in-rating breaker drops a live
// circuit; flicking past an untouched or a hot breaker is the round's mistake.
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'ce', label: 'Grid, gravity and life support rounds', type: 'loop' },
  title: 'Breaker row heat-and-load touch', dept: 'engineering', host: 'room', siteName: 'Panel', verb: 'Touch',
  how: 'At each panel tap E to touch the breaker under your finger and feel its heat, then flick your view right to the next. Warm, or over its stamped rating? Hold E to rack it back first.',
  keys: ['E tap: touch', 'E hold: rack back', 'flick view right: next breaker'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'touch and rack', input: 'e-tap+e-hold+swing', win: 'every breaker in the junction line touched, and each warm or over-rated one racked back before the finger moves on',
    fail: 'moving past a breaker never touched, passing a warm breaker that reads under its rating, or racking back a cool healthy one',
    rule: 'Tap E to feel the breaker\'s heat; the load against its stamped rating is always shown. Warm OR over rating: hold E one second to rack it. Then flick the view right to move the finger along.' },
  rush: 'Read the load meters from the doorway and logged the line fine.',
  captions: { 'hot breaker passed': 'breaker buzzes', 'untouched breaker': 'panel door creaks', 'tripped live circuit': 'lights dip, clunk' },
  says: { 'hot breaker passed': 'That one was warm — it trips under load. Rack it back before you move on.', 'untouched breaker': 'You have not touched that breaker yet — tap [E] to feel it.', 'tripped live circuit': 'That breaker was cool and in rating — you just dropped a live circuit.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Junction panel A', prop: 'relayrack' }, { name: 'Junction panel B', prop: 'servers' }, { name: 'Plating and scrubber panel', prop: 'scrubber' }]), r = m.rnd, rack = m.calm ? 0.8 : 1.0;
    m.panels = m.sites.map(() => { const kind = shuffle(r, ['warm', 'over', 'ok', 'ok', 'ok']).slice(0, 3);
      return { f: 0, br: kind.map(k => { const rated = ri(r, 4, 9) * 5; return { rated, load: k === 'over' ? rated + ri(r, 2, 6) : Math.round(rated * rf(r, 0.55, 0.9)), heat: k === 'warm' ? rf(r, 0.7, 0.9) : rf(r, 0.1, 0.35), touched: false, racked: false }; }) }; });
    const hot = (b) => b.heat >= 0.6 || b.load > b.rated;
    m.held = 0; m.flick = false; m.was = false;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { m.was = !!inp.hold; return; }
      const i = m.next, p = m.panels[i], b = p.br[p.f], down = inp.hold && !m.was; m.was = !!inp.hold;
      if (down) m.held = 0;
      if (inp.hold) { m.held += dt; if (m.held >= rack && !b.racked) { if (hot(b)) { b.racked = true; b.touched = true; } else { m.fault('tripped live circuit'); m.held = -99; } } }
      if (rel && m.held >= 0 && m.held < 0.4) b.touched = true;
      const sw = -(inp.swing || 0);
      if (!inp.hold && sw > 1.2 && !m.flick) { m.flick = true;
        if (!b.touched) m.fault('untouched breaker'); else if (hot(b) && !b.racked) m.fault('hot breaker passed');
        else if (p.f < 2) p.f++; else m.finish(i); }
      if (sw < 0.3) m.flick = false;
      if (!s.done) s.prog = clamp((p.f + (b.touched ? 0.5 : 0)) / 3, 0, 0.95);
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const p = m.panels[i], b = p.br[p.f];
      if (!b.touched) { const t = f % 6 === 0; return { at: i, hold: t, press: t }; }
      if (hot(b) && !b.racked) return { at: i, hold: true };
      return { at: i, hold: false, swing: f % 4 === 0 ? -1.6 : 0 };
    };
    m.bad = (f = 0) => ({ at: m.next, hold: false, swing: f % 4 === 0 ? -1.6 : 0 });
    m.view = () => ({ panels: m.panels.map(p => p.br.map(b => [b.rated, b.load, +b.heat.toFixed(2)])) });
    m.panel = (i) => { const p = m.panels[i]; if (!p) return null; const b = p.br[p.f];
      return { label: `Breaker ${p.f + 1}/3 · ${b.load} A of ${b.rated} A`, value: b.racked ? 'racked back' : b.touched ? (b.heat >= 0.6 ? 'WARM to the touch' : 'cool') : 'not touched', bar: b.touched ? b.heat : 0, band: [0, 0.6] }; };
    m.prompt = (i) => { const p = m.panels[i]; if (!p) return ''; const b = p.br[p.f]; return !b.touched ? 'Tap [E] to touch the breaker with the back of a finger' : b.racked ? 'Racked. Flick your view right to the next breaker' : 'Warm, or load over its rating? Hold [E] to rack it back. Otherwise flick your view right'; };
    return m;
  },
});
