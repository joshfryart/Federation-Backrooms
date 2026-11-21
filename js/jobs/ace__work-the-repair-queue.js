// Assistant Chief Engineer: work the repair queue. At the bench each replacement connector is pushed home by holding E. A seated connector gives
// one firm CLICK; a connector that is only pressed gives a soft click first and seats a little further on. Let go right after a soft click and
// it is only pressed in (fails under load); keep pushing past the firm click and the pins bend.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Work the repair queue', type: 'loop' },
  title: 'Push through the soft click', dept: 'engineering', host: 'room', siteName: 'Connector', verb: 'Seat',
  how: 'Hold E to push the connector in. A soft click is only pressed; keep going until the firm CLICK, then let go at once.',
  keys: ['E hold: push the connector', 'E up on the firm click'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'push past click', input: 'e-hold',
    win: 'three connectors pushed home and released just after their firm click on the bench',
    fail: 'letting go on a soft click so it is only pressed, letting go before any click, or pushing on past the firm click',
    rule: 'Hold E to push. Some connectors click softly halfway: keep pushing. Release at the firm click; holding on after it bends the pins.' },
  rush: 'Pressed each connector until it looked flush and closed the ticket.',
  captions: { 'pressed only': 'connector pops out under load', unseated: 'connector not seated', bent: 'pins bend' },
  says: { 'pressed only': 'That was only a soft click. Push on to the firm click.', unseated: 'Not clicked home yet.', bent: 'You pushed past the click and bent the pins.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Connector A', prop: 'workbench' }, { name: 'Connector B', prop: 'relayrack' }, { name: 'Connector C', prop: 'workbench' }]), r = m.rnd, sp = m.calm ? 0.4 : 0.55;
    m.cn = m.sites.map(() => { const loose = r() < 0.6; return { loose, soft: ri(r, 40, 55) / 100, firm: loose ? ri(r, 88, 95) / 100 : ri(r, 68, 78) / 100, p: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const c = m.cn[m.next];
      if (inp.hold) { c.p += sp * dt; if (c.p > c.firm + 0.35 * sp * 1.5) { m.fault('bent'); c.p = 0; } }
      if (rel) { if (c.p >= c.firm) { m.finish(m.next); return; } m.fault(c.loose && c.p >= c.soft ? 'pressed only' : c.p > 0.2 ? 'unseated' : 'unseated'); c.p = 0; }
      s.prog = clamp(c.p) * 0.9;
    };
    m.hint = () => { const c = m.cn[m.next] || { p: 0, firm: 1 }; return { at: m.next, hold: c.p < c.firm + 0.02 }; };
    m.bad = () => { const c = m.cn[m.next] || { loose: false, soft: 0, p: 0 }; return { at: m.next, hold: !(c.p >= 0.3) }; };
    m.view = () => ({ cn: m.cn.map(c => [c.loose, c.soft, c.firm]) });
    m.panel = (i) => { const c = m.cn[i]; if (!c) return null; return { label: c.p >= c.firm ? 'FIRM CLICK - let go' : c.loose && c.p >= c.soft ? 'soft click... keep pushing' : 'Pushing', value: `${Math.round(clamp(c.p) * 100)} %`, bar: clamp(c.p) }; };
    m.prompt = () => 'Hold [E] to push the connector in; let go on the firm click';
    return m;
  },
});
