// Second officer: run a damage-control drill. At the emergency locker check the extinguisher before taking it: look left at its gauge and tap
// E to read it (a low one is swapped for the spare with a second tap), look right at the safety pin and tap E to check it, then look straight
// ahead and tap E to pull the kit. Pulling it with either check undone resets the step. At the junction pressure door hold E and swing your
// view the way the drill card says to spin the seal wheel until the seal lamp goes green; spinning it the wrong way backs the seal off.
import { define, machine, room, pick, ri, clamp } from './kit.js';

const COMP = ['3-114 port junction', '4-120 aft crossway', '5-098 EPS trunk', '6-131 coolant gallery'];

export default define({
  job: { billet: 'so', label: 'Run a damage-control drill', type: 'task:shakedown' },
  title: 'Damage-control drill: kit and seal wheel', dept: 'command', host: 'room', item: 'extinguisher', siteName: 'Drill step', verb: 'Run',
  how: 'At the locker look at the extinguisher gauge and tap E, look at the pin and tap E, then look ahead and tap E to take the kit; at the door hold E and swing your view the card\'s way until the seal lamp is green.',
  keys: ['look + E tap: gauge / pin / take kit', 'E hold + swing: spin the seal wheel'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'check and spin', input: 'e-tap+look+e-hold+swing', win: 'extinguisher gauge and pin checked before the kit is pulled, and the seal wheel spun the card\'s way until the lamp is green',
    fail: 'pulling the kit with the pin check skipped, or spinning the seal wheel against the drill card so the seal backs off',
    rule: 'Locker: aim left at the gauge and tap, aim right at the pin and tap, aim ahead and tap to take it. Door: hold E and swing the view in the card\'s direction until SEALED.' },
  rush: 'Called the breach on the PA and logged the drill done from the console.',
  captions: { 'pin skipped': 'locker slams shut', 'backed off': 'seal hisses' },
  says: { 'pin skipped': 'You pulled the kit without checking the gauge and pin. Step reset: check both first.', 'backed off': 'Wrong way: the seal backs off. Read the card and spin the other way.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Emergency locker', prop: 'locker' }, { name: 'Junction pressure door', prop: 'airlock_doors' }]), r = m.rnd;
    m.card = { comp: pick(r, COMP), dir: r() < 0.5 ? 1 : -1, turns: ri(r, 2, 3) };
    m.ext = { low: r() < 0.45, gauge: 0, pin: false };
    m.wheel = 0; m.wrong = false;
    const zone = (look) => look > 0.2 ? 'gauge' : look < -0.2 ? 'pin' : Math.abs(look) < 0.1 ? 'take' : null;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) {
        if (!inp.press) return; const z = zone(inp.look || 0), e = m.ext;
        if (z === 'gauge') { if (e.gauge === 0) e.gauge = e.low ? 1 : 2; else if (e.gauge === 1) { e.low = false; e.gauge = 2; m.ev('spare'); } }
        else if (z === 'pin') e.pin = true;
        else if (z === 'take') { if (e.gauge === 2 && e.pin) { m.finish(0); return; } m.fault('pin skipped'); e.gauge = 0; e.pin = false; }
        s.prog = ((e.gauge === 2) + e.pin) / 3; return;
      }
      const sw = inp.swing || 0;
      if (inp.hold && Math.abs(sw) > 0.25) {
        if (Math.sign(sw) === m.card.dir) { m.wrong = false; m.wheel = clamp(m.wheel + Math.abs(sw) * 0.45 / m.card.turns * dt); if (m.wheel >= 1) { m.finish(1); return; } }
        else if (!m.wrong) { m.wrong = true; m.fault('backed off'); m.wheel = Math.max(0, m.wheel - 0.3); }
      } else if (!inp.hold) m.wrong = false;
      s.prog = m.wheel * 0.95;
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 };
      if (i === 0) { const e = m.ext, look = e.gauge !== 2 ? 0.35 : !e.pin ? -0.35 : 0; return { at: 0, look, press: f % 2 === 0 }; }
      return { at: 1, hold: true, swing: 1.3 * m.card.dir };
    };
    m.bad = (f = 0) => m.next === 0 ? { at: 0, look: 0, press: f % 2 === 0 } : { at: 1, hold: f % 10 < 6, swing: -1.3 * m.card.dir };
    m.view = () => ({ card: m.card, low: m.ext.low });
    m.panel = (i) => {
      if (i === 0) { const e = m.ext; return { label: `Drill card: breach ${m.card.comp}`, value: `gauge ${e.gauge === 0 ? '?' : e.gauge === 1 ? 'LOW: tap to swap for spare' : 'green ✓'} · pin ${e.pin ? 'in ✓' : '?'}`, bar: ((e.gauge === 2) + e.pin) / 2 }; }
      return { label: `Seal wheel: spin ${m.card.dir > 0 ? 'anticlockwise (swing left)' : 'clockwise (swing right)'}`, value: m.wheel >= 1 ? 'SEALED' : `${Math.round(m.wheel * 100)} %`, bar: m.wheel };
    };
    m.prompt = (i) => i === 0 ? 'Look left at the gauge, right at the pin and tap [E] on each; then look ahead and tap [E] to take the kit' : `Hold [E] and swing your view ${m.card.dir > 0 ? 'left' : 'right'} to spin the seal wheel`;
    return m;
  },
});
