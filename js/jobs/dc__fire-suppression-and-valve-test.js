// Damage control: fire suppression and valve test. First hold E at the junction to spin the isolation valve shut. Then at the nozzle line
// pump the test gauge up with steady strokes (tap E about twice a second: a stroke snatched faster than that slams the relief) into the
// marked band, and take your hands off for the timed hold. A sound line holds still; a leaky one drifts. When the hold ends, sign it: a
// short tap of E signs it green, holding E for a second logs a leak. Signing a drifted line green, or logging a sound one, is a fault.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'dc', label: 'Fire suppression and valve test', type: 'loop' },
  title: 'Suppression line pump-and-hold test', dept: 'engineering', host: 'room', siteName: 'Test point', verb: 'Test',
  how: 'Hold E to close the isolation valve. At the gauge, tap E in a steady pumping rhythm to bring the needle into the band, then let it sit for the hold. Tap E to sign a steady line green, or hold E for a second to log one that drifted.',
  keys: ['E hold: spin the valve', 'E tap in rhythm: pump', 'E tap: sign green / E hold: log leak'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'pump and watch', input: 'e-hold+e-tap+rhythm', win: 'line pumped steadily into the test band, left untouched through the timed hold, and signed by what the needle did',
    fail: 'snatching pump strokes so the relief blows, or signing a line green when its needle drifted during the hold',
    rule: 'Pump with E taps no closer than a third of a second apart until the needle is in the band, then stop. After the hold, a needle that stayed put gets a quick tap (green); one that crept down gets a one-second hold (leak).' },
  rush: 'Cracked the valve, saw foam at the nozzle and signed the line.',
  captions: { 'relief blew': 'relief valve shrieks', 'signed a drift': 'pen scratches', 'false leak': 'log beeps', pumped: 'pump stroke' },
  says: { 'relief blew': 'Stroke too fast — the relief blew. Pump in a steady rhythm.', 'signed a drift': 'The needle crept down during the hold. That line leaks: hold E to log it.', 'false leak': 'The needle held steady — that line is green. Tap E to sign it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Isolation valve', prop: 'pumpskid' }, { name: 'Nozzle line gauge', prop: 'tank' }]), r = m.rnd;
    const band = [0.6, 0.8], holdT = m.calm ? 2.5 : 3.0, minGap = m.calm ? 0.24 : 0.3;
    m.valve = 0; m.p = 0; m.gap = 9; m.held = 0; m.hold = 0; m.p0 = 0; m.phase = 'pump';
    m.leak = r() < 0.5; m.drift = m.leak ? rf(r, 0.03, 0.05) : 0; m.vt = rf(r, 1.0, 1.4); m.stroke = rf(r, 0.07, 0.1);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; m.gap += dt;
      if (m.next === 0) { if (inp.hold) m.valve += dt; s.prog = clamp(m.valve / m.vt, 0, 0.95); if (m.valve >= m.vt) m.finish(0); return; }
      if (inp.hold) m.held += dt;
      if (m.phase === 'pump') {
        if (inp.press) { if (m.gap < minGap) { m.fault('relief blew'); m.p = 0.2; } else { m.p += m.stroke; m.ev('pumped'); } m.gap = 0; if (m.p > 0.9) { m.fault('relief blew'); m.p = 0.2; } }
        if (m.p >= band[0] && m.gap > 0.6) { m.phase = 'hold'; m.hold = 0; m.p0 = m.p; }
      } else if (m.phase === 'hold') {
        if (inp.press) { m.phase = 'pump'; m.gap = 0; m.p += m.stroke; return; }
        m.p -= m.drift * dt; m.hold += dt; if (m.hold >= holdT) { m.phase = 'sign'; m.held = 0; }
      } else {
        if (inp.press) m.held = 0;
        if (rel) { const log = m.held >= 0.8; if (log && !m.leak) m.fault('false leak'); else if (!log && m.leak) m.fault('signed a drift'); else { m.finish(1); return; } }
      }
      s.prog = clamp(m.phase === 'pump' ? m.p / band[0] * 0.4 : m.phase === 'hold' ? 0.4 + m.hold / holdT * 0.5 : 0.92, 0, 0.95);
    };
    m.f0 = 0;
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, hold: true };
      if (m.phase === 'pump') { const go = m.p < band[0] && m.gap >= 0.45; return { at: 1, press: go, hold: go }; }
      if (m.phase === 'hold') return { at: 1, hold: false };
      if (m.leak) { const fresh = !m.prev; return { at: 1, press: fresh, hold: m.held < 1.0 || fresh }; } const fresh = !m.prev && m.held === 0; return { at: 1, press: fresh, hold: fresh }; };
    m.bad = (f = 0) => m.next === 0 ? { at: 0, hold: true } : { at: 1, press: f % 4 === 0, hold: f % 4 === 0 };
    m.view = () => ({ leak: m.leak, d: +m.drift.toFixed(3), vt: +m.vt.toFixed(2), s: +m.stroke.toFixed(3) });
    m.panel = (i) => i === 0 ? { label: 'Isolation valve wheel', value: m.valve >= m.vt ? 'closed' : 'turning', bar: m.valve / m.vt }
      : { label: m.phase === 'pump' ? 'Pump to the band' : m.phase === 'hold' ? `Hands off · hold ${m.hold.toFixed(1)} / ${holdT} s` : (m.p0 - m.p > 0.04 ? 'Needle DRIFTED down' : 'Needle held steady'),
        value: `${Math.round(m.p * 200)} psi`, bar: clamp(m.p), band };
    m.prompt = (i) => i === 0 ? 'Hold [E] to spin the isolation valve shut' : m.phase === 'pump' ? 'Tap [E] in a steady rhythm to pump into the band'
      : m.phase === 'hold' ? 'Hands off — watch the needle through the hold' : 'Tap [E] to sign green, or hold [E] one second to log a leak';
    return m;
  },
});
