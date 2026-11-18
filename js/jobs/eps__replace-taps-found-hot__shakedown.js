// EPS tech: replace taps found hot (shakedown). Turn the flagged tap slowly under the bench lamp (E held, turning the view) so the light
// rakes across every contact; spin it and pitting slips past unseen. At the spares locker flick through the trays (tap E) to the spare whose
// rating matches the hot tap's label and take it (hold E). Then run each terminal screw with the torque driver and keep pressing until it CLICKS.
import { define, machine, room, ri, pick, clamp } from './kit.js';

const RAT = ['40 A', '60 A', '80 A', '100 A'];
export default define({
  job: { billet: 'eps', label: 'Replace taps found hot', type: 'task:shakedown' },
  title: 'Lamp-rake, rated spare, driver click', dept: 'engineering', host: 'room', item: 'toolbag', siteName: 'Bench step', verb: 'Replace',
  how: 'At the bench hold E and turn slowly to rake the lamp over the contacts. At the locker tap E to flick to the spare with the matching rating and hold E to take it. At the terminals hold E until the driver clicks.',
  keys: ['E hold + turn slowly: inspect', 'E tap: next tray / E hold: take', 'E hold to the click'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'rake and match', input: 'e-hold+turn+e-tap', win: 'every contact raked slowly under the lamp, the spare of the matching rating fitted and both terminals driven to the clutch click',
    fail: 'spinning the tap past the lamp too fast to see pitting, fitting a spare of the wrong rating, or easing off a terminal before the click',
    rule: 'Bench: turning the view with E held rotates the tap; above the speed mark nothing is seen and it counts as skipped. Locker: short taps step through trays; hold to take the one whose rating matches. Terminals: hold E until CLICK, then let go.' },
  rush: 'Swapped the tap like for like without looking at why it ran hot.',
  captions: { skipped: 'tap spins in the light', 'wrong rating': 'label mismatch tone', 'under-torqued': 'driver eases off' },
  says: { skipped: 'Too fast: the pitting slid past the lamp. Turn it slowly.', 'wrong rating': 'That spare is the wrong rating for this junction. Match the hot tap\'s label.', 'under-torqued': 'You eased off before the driver clicked: that terminal is loose.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bench lamp', prop: 'workbench' }, { name: 'Spares locker', prop: 'locker' }, { name: 'Tap terminals', prop: 'relayrack' }]), r = m.rnd;
    const maxT = m.calm ? 1.3 : 1.0, tapT = 0.3, takeT = 0.8;
    m.need = ri(r, 0, 3); m.trays = [0, 1, 2, 3].sort(() => r() - 0.5); m.tray = ri(r, 0, 3); if (m.trays[m.tray] === m.need) m.tray = (m.tray + 1) % 4;
    m.pit = pick(r, ['contact 1', 'contact 2', 'contact 3']); m.insp = 0; m.spin = 0; m.h = 0; m.screw = 0; m.tq = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, turn = inp.turn || 0;
      if (i === 0) {
        m.spin = Math.max(0, m.spin - dt);
        if (inp.hold && turn > maxT) { if (!m.spin) { m.fault('skipped'); m.insp = Math.max(0, m.insp - 0.3); m.spin = 0.7; } }
        else if (inp.hold && turn > 0.2) m.insp += 0.45 * turn * dt;
        s.prog = clamp(m.insp) * 0.95; if (m.insp >= 1) m.finish(0); return;
      }
      if (i === 1) {
        if (inp.hold) { m.h += dt; if (m.h >= takeT) { if (m.trays[m.tray] === m.need) { m.finish(1); return; } m.fault('wrong rating'); m.h = -99; } }
        if (rel) { if (m.h > 0 && m.h < tapT) m.tray = (m.tray + 1) % 4; m.h = 0; }
        s.prog = 0.3; return;
      }
      if (inp.hold) m.tq = Math.min(1.3, m.tq + 0.7 * dt);
      if (rel) { if (m.tq >= 1) { m.screw++; if (m.screw >= 2) { m.finish(2); return; } } else if (m.tq > 0.1) m.fault('under-torqued'); m.tq = 0; }
      s.prog = (m.screw + clamp(m.tq)) / 2 * 0.95;
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 };
      if (i === 0) return { at: 0, hold: true, turn: 0.8 };
      if (i === 1) { if (m.trays[m.tray] === m.need) return { at: 1, hold: true, press: !m.prev }; const p = f % 4 < 2; return { at: 1, hold: p, press: f % 4 === 0 }; }
      return { at: 2, hold: m.tq < 1, press: !m.prev && m.tq < 1 };
    };
    m.bad = () => m.next === 0 ? { at: 0, hold: true, turn: 2.5 } : { at: m.next, hold: true };
    m.view = () => ({ need: m.need, trays: m.trays, pit: m.pit });
    m.panel = (i) => i === 0 ? { label: m.spin ? 'TOO FAST: blurred' : m.insp >= 0.6 ? `Pitting on ${m.pit}` : 'Raking the contacts', value: `${Math.round(clamp(m.insp) * 100)} % seen`, bar: clamp(m.insp) }
      : i === 1 ? { label: `Hot tap label: ${RAT[m.need]}`, value: `tray ${m.tray + 1}: ${RAT[m.trays[m.tray]]}`, bar: clamp(m.h / takeT) }
        : { label: m.tq >= 1 ? 'CLICK' : `Terminal ${m.screw + 1} of 2`, value: m.tq >= 1 ? 'let go' : 'driving', bar: clamp(m.tq) };
    m.prompt = (i) => i === 0 ? 'Hold [E] and turn your view slowly to rake the lamp across the contacts' : i === 1 ? 'Tap [E] to flick to the next tray; hold [E] to take the spare matching the label' : (m.tq >= 1 ? 'Clicked: let go of [E]' : 'Hold [E] on the torque driver until it clicks');
    return m;
  },
});
