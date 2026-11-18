// EPS tech: replace worn power taps. Close the feed valve, then wait: the conduit bleeds down and the feed lamp fades over a few seconds. Only
// when the lamp is DARK is it safe to put the wrench on the worn tap's four bolts; a bolt cracked while the lamp still glows draws a live arc.
// Seat the spare, then crack the feed valve back open slowly: spinning it open slams the full load onto the new tap.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'eps', label: 'Replace worn power taps', type: 'loop' },
  title: 'Bleed-down before the wrench', dept: 'engineering', host: 'room', item: 'hydrospanner', siteName: 'Step', verb: 'Swap',
  how: 'Hold E and turn to close the feed valve. At the tap, wait for the feed lamp to go dark, tap E once per bolt, hold E to seat the spare. Reopen the valve with a slow turn.',
  keys: ['E hold + turn: work the valve', 'E tap: crack a bolt', 'E hold: seat the spare'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'bleed then unbolt', input: 'e-hold+turn+e-tap', win: 'the worn tap swapped only after the feed lamp bled fully dark, and the feed brought back with a gentle valve turn',
    fail: 'cracking a bolt while the conduit is still live, or spinning the feed valve open so the load slams on',
    rule: 'Closing the valve does not kill the feed at once: the lamp fades over two to three seconds. Tap E on a bolt only when the lamp reads DARK. On reopening, turn the view slowly; a fast spin is a surge.' },
  rush: 'Unbolted the tap with the feed still humming and hoped it held.',
  captions: { 'live arc': 'arc crack', surge: 'conduit bangs' },
  says: { 'live arc': 'Live arc! The lamp was still glowing. Wait for the conduit to bleed down dark.', surge: 'You spun the valve open and the load slammed on. Turn it back slowly.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Feed valve: close', prop: 'pumpskid' }, { name: 'Worn tap', prop: 'relayrack' }, { name: 'Feed valve: reopen', prop: 'heatexch' }]), r = m.rnd;
    const fast = m.calm ? 2.3 : 1.9, seatT = 1.0;
    m.bleed = rf(r, 1.6, 3.0); m.bolts = 4; m.closedAt = -1; m.v = 0; m.seat = 0; m.open = 0; m.slam = 0;
    const live = () => m.closedAt < 0 ? 1 : clamp(1 - (m.t - m.closedAt) / m.bleed);
    m.live01 = live;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, turn = inp.turn || 0;
      if (i === 0) { if (inp.hold && turn > 0.3) m.v += 0.5 * Math.min(2, turn) * dt; s.prog = clamp(m.v) * 0.95; if (m.v >= 1) { m.closedAt = m.t; m.finish(0); } return; }
      if (i === 1) {
        if (m.bolts > 0) { if (inp.press) { if (live() > 0) m.fault('live arc'); else { m.bolts--; m.ev('bolt', { left: m.bolts }); } } }
        else if (inp.hold) { m.seat += dt; if (m.seat >= seatT) { m.finish(1); return; } } else m.seat = 0;
        s.prog = (4 - m.bolts) / 4 * 0.6 + m.seat / seatT * 0.35; return;
      }
      m.slam = Math.max(0, m.slam - dt);
      if (inp.hold && turn > fast && !m.slam) { m.fault('surge'); m.open = 0; m.slam = 0.6; }
      else if (inp.hold && turn > 0.3) m.open += 0.45 * Math.min(fast, turn) * dt;
      s.prog = clamp(m.open) * 0.95; if (m.open >= 1) m.finish(2);
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 };
      if (i === 0) return { at: 0, hold: true, turn: 1.4 };
      if (i === 1) { if (m.bolts > 0) { if (live() > 0) return { at: 1, hold: false }; const p = f % 4 === 0; return { at: 1, hold: p, press: p }; } return { at: 1, hold: true, press: !m.prev }; }
      return { at: 2, hold: true, turn: 1.0 };
    };
    m.bad = (f = 0) => { const i = m.next; if (i === 0) return { at: 0, hold: true, turn: 1.4 }; if (i === 1) { const p = f % 4 === 0; return { at: 1, hold: p, press: p }; } return { at: 2, hold: true, turn: 3 }; };
    m.view = () => ({ bleed: +m.bleed.toFixed(2) });
    m.panel = (i) => {
      if (i === 0) return { label: 'Feed valve', value: `${Math.round(clamp(m.v) * 100)} % shut`, bar: clamp(m.v) };
      if (i === 1) { const l = live(); return m.bolts > 0 ? { label: l > 0 ? 'Feed lamp LIVE' : 'Feed lamp DARK', value: l > 0 ? `${Math.round(l * 100)} % bleeding` : `${m.bolts} bolts left`, bar: 1 - l } : { label: 'Seat spare', value: `${Math.round(m.seat / seatT * 100)} %`, bar: m.seat / seatT }; }
      return { label: 'Reopen feed', value: m.slam ? 'TOO FAST' : `${Math.round(clamp(m.open) * 100)} % open`, bar: clamp(m.open) };
    };
    m.prompt = (i) => i === 0 ? 'Hold [E] and turn your view to close the feed valve' : i === 1 ? (m.bolts > 0 ? (live() > 0 ? 'Wait: the feed lamp is still bleeding down' : 'Lamp dark: tap [E] once per bolt') : 'Hold [E] to seat the spare tap') : 'Hold [E] and turn slowly to reopen the feed';
    return m;
  },
});
