// Holodeck tech: reset a booked session in three stops. Clear the floor props (tap E once per prop), purge the room (hold E until the matter
// counter reads zero; it creeps back if you stop early) and arm the three interlocks (tap E only while the lamp is green).
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Reset a booked session', type: 'loop' },
  title: 'Clear, purge to zero, arm on green', dept: 'services', host: 'room', siteName: 'Reset step', verb: 'Reset',
  how: 'Tap E to clear each prop, hold E at the purge panel until the matter counter hits zero, then tap E at the interlocks only when their lamp is green.',
  keys: ['E tap: clear a prop', 'E hold: purge', 'E tap on green: arm'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'purge to zero', input: 'e-tap+e-hold', win: 'floor cleared, matter counter held to zero and all three interlocks armed on green',
    fail: 'letting go of the purge with matter left, or arming an interlock while its lamp is amber',
    rule: 'Tap E per prop. At the purge panel hold E until the counter is 0; let go early and it rebounds. At the interlocks a tap counts only on green.' },
  rush: 'Kicked the props aside, skipped the purge and armed the interlocks without looking at the lamps.',
  captions: { residue: 'matter counter alarm', unarmed: 'interlock refuses' }, says: { residue: 'Let go of the purge with matter left in the room.', unarmed: 'Armed an interlock on amber: it did not take.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Floor props', prop: null }, { name: 'Purge panel', prop: 'console' }, { name: 'Interlock panel', prop: 'console' }]), r = m.rnd;
    m.props = ri(r, 3, 5); m.cleared = 0; m.matter = 1; m.armed = 0; m.ph = rf(r, 0, 1.2); m.lastArm = -9; const per = m.calm ? 1.6 : 1.2, green = (t = m.t) => ((t + m.ph) % per) < per * (m.calm ? 0.6 : 0.5);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.press) { m.cleared++; if (m.cleared >= m.props) m.finish(0); } s.prog = m.cleared / m.props; }
      else if (i === 1) { if (inp.hold) { m.matter = Math.max(0, m.matter - dt * 0.4 / (0.5 + m.matter)); if (m.matter <= 0) m.finish(1); } else { m.matter = Math.min(1, m.matter + dt * 0.15); }
        if (rel && m.matter > 0 && m.state === 'play') { m.fault('residue'); } s.prog = s.done ? 1 : 1 - m.matter; }
      else { if (inp.press) { if (!green(m.t - dt)) m.fault('unarmed'); else if (m.t - m.lastArm > 0.4) { m.armed++; m.lastArm = m.t; if (m.armed >= 3) m.finish(2); } } s.prog = m.armed / 3; }
    };
    m.hint = () => { const i = m.next; if (i === 0) return { at: 0, press: true }; if (i === 1) return { at: 1, hold: true }; return { at: i, press: green() && m.t - m.lastArm > 0.45 }; };
    m.bad = (f = 0) => m.next === 1 ? { at: 1, hold: f % 30 < 8 } : { at: m.next, press: f % 3 === 0 };
    m.view = () => ({ props: m.props, ph: +m.ph.toFixed(2) });
    m.panel = (i) => i === 0 ? { label: 'Props cleared', value: `${m.cleared} / ${m.props}`, bar: m.cleared / m.props } : i === 1 ? { label: 'Matter counter', value: `${Math.round(m.matter * 100)}`, bar: 1 - m.matter } : { label: green() ? 'Lamp GREEN' : 'Lamp AMBER', value: `${m.armed} / 3 armed`, bar: green() ? 1 : 0.1 };
    m.prompt = (i) => i === 0 ? 'Tap [E] to clear each prop' : i === 1 ? 'Hold [E] until the matter counter reads zero' : 'Tap [E] only while the lamp is green';
    return m;
  },
});
