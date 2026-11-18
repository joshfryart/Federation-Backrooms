// Nurse: stage the trauma kit near the bridge-deck lift. Shoulder the kit at the dispenser (hold E), set it down square on the lift floor
// marking (hold E), then test the bag valve: squeeze it (tap E) on the metronome's beat, five in a row; an off-beat squeeze restarts the count.
// Last, hold E to snap the lid latch shut.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Stage trauma kit near bridge-deck lift', type: 'task:shakedown' },
  title: 'Trauma kit staging and bag test', dept: 'medical', host: 'room', siteName: 'Spot', verb: 'Stage',
  how: 'Shoulder the trauma kit at the dispenser (hold E), set it down on the lift marking (hold E), squeeze the bag valve on each metronome beat (tap E, five in a row), then hold E to latch the lid.',
  keys: ['E hold: lift / set down / latch', 'E tap on the beat: squeeze'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'beat squeeze', input: 'e-hold+e-tap+rhythm', win: 'the kit set down on the lift marking with five on-beat bag-valve squeezes and the lid latched',
    fail: 'squeezing the bag valve off the metronome beat',
    rule: 'Lifting, setting down and latching are steady E holds. The bag test is rhythm: the metronome ticks every second or so; tap E within the lit window of each tick, five in a row. A squeeze between ticks restarts the count.' },
  rush: 'Dropped the kit by the lift and assumed the bag valve worked.',
  captions: { 'off the beat': 'bag valve wheezes', beat: 'metronome tick' }, says: { 'off the beat': 'Off the beat — squeeze when the tick lights. Count starts again.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Trauma kit', prop: 'med_dispenser' }, { name: 'Lift floor marking', prop: 'cart' }]), r = m.rnd, win = m.calm ? 0.36 : 0.26;
    m.per = rf(r, 0.9, 1.3); m.off = rf(r, 0, 1); m.st = { lift: 0, set: 0, beats: 0, lastBeat: -1, latch: 0 };
    const phase = () => ((m.t / m.per + m.off) % 1), onBeat = () => Math.min(phase(), 1 - phase()) * m.per <= win / 2;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, S = m.st;
      if (i === 0) { S.lift = inp.hold ? S.lift + dt : 0; s.prog = clamp(S.lift / 0.8); if (S.lift >= 0.8) m.finish(0); return; }
      if (S.set < 0.6) { S.set = inp.hold ? S.set + dt : 0; s.prog = S.set / 0.6 * 0.3; return; }
      if (S.beats < 5) { if (inp.press) { if (onBeat()) { const b = Math.round(m.t / m.per + m.off); if (b !== S.lastBeat) { S.lastBeat = b; S.beats++; } } else { m.fault('off the beat'); S.beats = 0; } } s.prog = 0.3 + S.beats / 5 * 0.5; return; }
      S.latch = inp.hold ? S.latch + dt : 0; s.prog = 0.8 + S.latch / 0.5 * 0.2; if (S.latch >= 0.5) m.finish(1);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const S = m.st; if (i === 0 || S.set < 0.6) return { at: i, hold: true }; if (S.beats < 5) { const b = Math.round(m.t / m.per + m.off); return { at: i, press: onBeat() && Math.min(phase(), 1 - phase()) * m.per < win / 3 && b !== S.lastBeat }; } return { at: i, hold: true }; };
    m.bad = (f = 0) => { const i = m.next; if (i === 0 || m.st.set < 0.6) return { at: i, hold: true }; return { at: i, press: !onBeat() && f % 5 === 0 }; };
    m.view = () => ({ per: +m.per.toFixed(3), off: +m.off.toFixed(3) });
    m.panel = (i) => { const S = m.st; if (i === 0) return { label: 'Shoulder the kit', value: '', bar: S.lift / 0.8 }; if (S.set < 0.6) return { label: 'Set it down square', value: '', bar: S.set / 0.6 }; if (S.beats < 5) return { label: onBeat() ? 'TICK — squeeze' : 'Metronome', value: `${S.beats} / 5`, bar: phase(), band: [0, win / m.per / 2] }; return { label: 'Latch the lid', value: '', bar: S.latch / 0.5 }; };
    m.prompt = (i) => { const S = m.st; return i === 0 ? 'Hold [E] to shoulder the trauma kit' : S.set < 0.6 ? 'Hold [E] to set the kit down on the marking' : S.beats < 5 ? `Tap [E] on each tick to squeeze the bag valve · ${S.beats}/5` : 'Hold [E] to snap the lid latch shut'; };
    return m;
  },
});
