// Deck crew: ready the shuttle for casualty transport. Each stretcher berth folds down onto a twist lock. Hold E to grip the lock and turn your
// view to twist it; somewhere in its travel the tab clicks into its slot. Twist slowly: whip through it and the tab skips the detent. Let go
// right after the click. Letting go before the click leaves the berth unset (it slides on the cabin tilt test); twisting on strips the tab.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Ready the shuttle for casualty transport', type: 'task:medical_relief' },
  title: 'Berth twist-lock to the click', dept: 'flight', host: 'room', siteName: 'Berth', verb: 'Lock',
  how: 'At each berth hold E and slowly turn your view to twist the lock. When the tab clicks, let go at once. Too fast and it skips the detent; let go early and the berth slides on the tilt test.',
  keys: ['E hold + slow view turn: twist', 'Let go on the click'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'twist to click', input: 'e-hold+look+turn', win: 'every stretcher berth lock twisted slowly into its detent and released on the click so none slides on the tilt test',
    fail: 'whipping the lock past its detent, twisting on after the click, or letting go before the tab is set',
    rule: 'Lock angle follows the view while E is held, one way only. The detent is hidden somewhere in the travel; crossing it under the speed mark gives CLICK. Release within a short arc after the click.' },
  rush: 'Slapped the berths down and gave each lock a quick spin.',
  captions: { skipped: 'tab rattles over the slot', stripped: 'lock grinds', 'berth slid': 'berth slides on its rails' },
  says: { skipped: 'Too fast — the tab skipped its slot. Twist slowly.', stripped: 'Twisted past the click — the tab is stripped.', 'berth slid': 'Let go before the click — the berth slid on the tilt test.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Berth 1', prop: 'shuttle' }, { name: 'Berth 2', prop: 'biobed' }, { name: 'Berth 3', prop: 'exam_couch' }]), r = m.rnd;
    const vmax = m.calm ? 1.0 : 0.75, over = m.calm ? 0.16 : 0.12;
    m.locks = m.sites.map(() => ({ det: rf(r, 0.18, 0.42), ang: 0, clicked: false }));
    const reset = (k) => { k.ang = 0; k.clicked = false; k.base = null; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, k = m.locks[i];
      if (inp.hold) { if (k.base == null) k.base = (inp.look || 0) - k.ang; const a = Math.max(k.ang, clamp((inp.look || 0) - k.base, 0, 0.7));
        if (!k.clicked && k.ang < k.det && a >= k.det) { if ((inp.turn || 0) > vmax) { m.fault('skipped'); reset(k); return; } k.clicked = true; m.ev('click', { site: i }); }
        k.ang = a; if (k.clicked && k.ang > k.det + over) { m.fault('stripped'); reset(k); return; } }
      if (rel) { k.base = null; if (k.clicked) { m.finish(i); return; } if (k.ang > 0.05) m.fault('berth slid'); reset(k); }
      s.prog = s.done ? 1 : clamp(k.clicked ? 0.85 : k.ang / 0.7 * 0.7, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.locks[i]; if (k.clicked) return { at: i, hold: false }; return { at: i, hold: true, look: k.ang + (k.base || 0) + 0.015, turn: 0.45 }; };
    m.bad = () => { const k = m.locks[m.next]; return { at: m.next, hold: true, look: k.ang + (k.base || 0) + 0.1, turn: 3 }; };
    m.view = () => ({ det: m.locks.map(k => +k.det.toFixed(2)) });
    m.panel = (i) => { const k = m.locks[i]; if (!k) return null; return { label: k.clicked ? 'CLICK ✓ let go' : 'Twist', value: `${Math.round(k.ang * 130)}°`, bar: k.ang / 0.7 }; };
    m.prompt = (i) => { const k = m.locks[i]; return !k ? '' : k.clicked ? 'Clicked — let go of [E] now' : 'Hold [E] and turn your view slowly to twist the lock until it clicks'; };
    return m;
  },
});
