// Transporter tech: coil and buffer maintenance. Drive each thumb screw down by turning the view with E held. There is no band to aim for:
// you feel the screw seat, the turning goes stiff and the torque figure jumps. Stop there and let go. Keep cranking past the seat and the thread
// strips (the screw is backed out and re-run).
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Coil and buffer maintenance', type: 'task:quiet_watch' },
  title: 'Coil screw seating by feel', dept: 'operations', host: 'room', item: 'toolbag', siteName: 'Screw', verb: 'Seat',
  how: 'At each coil housing hold E and turn your view to drive the thumb screw. When it goes stiff and the torque jumps it has seated: stop turning and let go.',
  keys: ['E hold + turn the view: drive', 'let go when it seats'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'seat by feel', input: 'e-hold+turn', win: 'every thumb screw driven to its first firm resistance and released there',
    fail: 'cranking on after the screw has seated so the thread strips',
    rule: 'Hold E and turn the view to drive the screw. Its seat point is hidden: you know you reached it when the drive slows to a crawl and the torque figure jumps. Let go within half a second.' },
  rush: 'Ran every screw down hard with the driver and called it seated.',
  captions: { stripped: 'thread grinds' }, says: { stripped: 'Stripped — you kept turning after it seated. Backed out; run it again and stop at the first stiffness.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Coil housing A', prop: 'pad' }, { name: 'Coil housing B', prop: 'beampedestal' }, { name: 'Buffer clamp', prop: 'buffertank' }]), r = m.rnd, give = m.calm ? 0.8 : 0.55;
    m.screws = m.sites.map(() => ({ seat: rf(r, 0.45, 0.8), d: 0, torque: 0, over: 0, rate: rf(r, 0.35, 0.5) }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); const rel = m.released(inp); if (!s) return; const i = m.next, k = m.screws[i];
      const driving = inp.hold && (inp.turn || 0) > 0.2, seated = k.d >= k.seat;
      if (driving) { k.d = Math.min(1, k.d + (seated ? 0.06 : k.rate) * Math.min(2, inp.turn) * dt); if (seated) { k.over += dt; k.torque = clamp(0.6 + k.over); } else k.torque = clamp(k.d / k.seat * 0.25); }
      if (seated && k.over > give) { m.fault('stripped'); k.d = 0.15; k.over = 0; k.torque = 0; }
      if (rel && seated && k.over <= give) m.finish(i);
      s.prog = s.done ? 1 : clamp(k.d / Math.max(k.seat, 0.6) * 0.9, 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.screws[i]; const go = k.d < k.seat; return { at: i, hold: go, turn: go ? 1.4 : 0 }; };
    m.bad = () => ({ at: m.next, hold: true, turn: 1.4 });
    m.view = () => ({ seats: m.screws.map(k => +k.seat.toFixed(3)) });
    m.panel = (i) => { const k = m.screws[i]; return k ? { label: 'Torque', value: k.torque > 0.5 ? 'FIRM — let go' : 'running', bar: k.torque } : null; };
    m.prompt = (i) => { const k = m.screws[i]; return !k ? '' : k.d >= k.seat ? 'It has seated — let go of [E] now' : 'Hold [E] and turn your view to drive the screw; feel for the stiffness'; };
    return m;
  },
});
