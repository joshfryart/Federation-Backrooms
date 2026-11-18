// Ops: keep the probe relay link open. Reseat the probe relay card (tap E to draw it, tap again to push it home), run its retaining screw
// down a quarter turn per tap until the driver says SNUG (one more tap cracks the card's edge and the screw must be backed off), then clip the
// meter to the probe test point (aim and hold E) and watch the telemetry figure hold for the full count before letting go to log it.
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'ops', label: 'Keep the probe relay link open', type: 'task:survey' },
  title: 'Probe relay snug-and-watch', dept: 'operations', host: 'room', item: 'toolbag', siteName: 'Step', verb: 'Fix',
  how: 'Tap E twice to reseat the probe card, tap E one quarter turn at a time until the screw reads SNUG (no further), then aim at the test point and hold E until the telemetry has held steady for the full count.',
  keys: ['E tap: reseat / quarter turn', 'look + E hold: watch telemetry'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'snug and watch', input: 'e-tap+e-hold+look', win: 'card reseated, retaining screw stopped exactly at snug, and the telemetry watched steady for the whole count',
    fail: 'turning the screw past snug so the card edge cracks, or logging the link before the telemetry has held',
    rule: 'Each tap at the screw is a quarter turn; the driver note changes from free to SNUG at the right turn. Stop there. At the test point keep the meter aimed while holding E; letting go early or aiming off restarts the count.' },
  rush: 'Pushed the card back in by hand and left the screw finger-loose.',
  captions: { 'over-tightened': 'card edge creaks', unsteady: 'telemetry drops' },
  says: { 'over-tightened': 'Past snug — the card edge cracked. Back it off and stop at the first SNUG.', unsteady: 'You logged it before the figure had held. Hold E until the count completes.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Probe relay card', prop: 'relayrack' }, { name: 'Retaining screw', prop: 'relayrack' }, { name: 'Probe test point', prop: 'servers' }]), r = m.rnd;
    const watch = m.calm ? 2.2 : 3, tol = m.calm ? 0.16 : 0.11;
    m.card = 0; m.snug = ri(r, 4, 7); m.turns = 0; m.tp = +((r() < 0.5 ? 1 : -1) * rf(r, 0.12, 0.35)).toFixed(3); m.w = 0; m.tele = rf(r, 78, 94);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.press) { m.card++; m.ev(m.card === 1 ? 'draw' : 'seat'); if (m.card >= 2) { m.finish(0); return; } } s.prog = m.card / 2; return; }
      if (i === 1) {
        if (inp.press) { m.turns++; if (m.turns > m.snug) { m.fault('over-tightened'); m.turns = m.snug - 2; } else if (m.turns === m.snug) { m.ev('snug'); } }
        if (m.turns === m.snug && inp.hold === false && inp.press === false && rel === false && m.sTime != null && m.t - m.sTime > 0.4) { m.finish(1); return; }
        if (m.turns === m.snug && m.sTime == null) m.sTime = m.t; if (m.turns !== m.snug) m.sTime = null;
        s.prog = clamp(m.turns / (m.snug + 1)); return;
      }
      if (inp.hold) { if (Math.abs((inp.look || 0) - m.tp) < tol) m.w += dt; else m.w = 0; }
      if (m.w >= watch && rel) { m.finish(2); return; }
      if (rel) { if (m.w > 0.1) m.fault('unsteady'); m.w = 0; }
      s.prog = clamp(m.w / watch) * 0.9;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, press: f % 3 === 0 }; if (i === 1) return { at: 1, press: m.turns < m.snug && f % 3 === 0, hold: false }; return { at: 2, look: m.tp, hold: m.w < watch + 0.05 }; };
    m.bad = (f = 0) => { const i = m.next; if (i === 2) return { at: 2, look: m.tp, hold: f % 20 < 10 }; return { at: i, press: f % 3 === 0 }; };
    m.view = () => ({ snug: m.snug, tp: m.tp, tele: +m.tele.toFixed(1) });
    m.panel = (i) => {
      if (i === 0) return { label: 'Card', value: ['seated (drifting)', 'drawn', 'home'][m.card], bar: m.card / 2 };
      if (i === 1) return { label: m.turns === m.snug ? 'SNUG' : 'Driver', value: m.turns === m.snug ? 'stop turning' : `${m.turns} quarter turns · free`, bar: clamp(m.turns / (m.snug + 1)) };
      return { label: 'Telemetry', value: m.w > 0 ? `${(m.tele + Math.sin(m.t * 3) * 0.2).toFixed(1)} % holding ${m.w.toFixed(1)} / ${watch} s` : 'clip the meter on', bar: clamp(m.w / watch) };
    };
    m.prompt = (i) => i === 0 ? 'Tap [E] to draw the card, tap again to push it home' : i === 1 ? (m.turns === m.snug ? 'SNUG — stop there' : 'Tap [E] for each quarter turn; stop at SNUG') : (m.w >= watch ? 'Held steady — let go of [E] to log it' : `Aim at the test point (${m.tp > 0 ? 'left' : 'right'}) and hold [E]`);
    return m;
  },
});
