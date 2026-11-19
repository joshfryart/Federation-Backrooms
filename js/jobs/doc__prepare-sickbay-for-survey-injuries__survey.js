// Doctor: prepare sickbay for survey injuries. Each spare biobed is rolled out of the wall into the working row (hold E), plugged into the power
// bus (tap E) and left to boot. Its status lamp then reads READY or NO POWER: a loose plug has to be re-seated (hold E) and booted again. Only a
// READY bed gets its restraint strap buckled (tap E) and tug-tested (hold E): a strap that slips was not clicked and must be buckled again.
// Faults: tapping the plug while it boots (yanks it), or buckling a bed that has no power (it fails with the first casualty on it).
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Prepare sickbay for survey injuries', type: 'task:survey' },
  title: 'Biobed roll-out, power and strap', dept: 'medical', host: 'room', siteName: 'Spare biobed', verb: 'Ready',
  how: 'Hold E to roll the bed into the row, tap E to plug it in and wait for the lamp. NO POWER: hold E to re-seat the plug. READY: tap E to buckle the strap, then hold E to tug it; if it slips, buckle again.',
  keys: ['E hold: roll / re-seat / tug', 'E tap: plug / buckle'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'plug and tug', input: 'e-hold+e-tap', win: 'every spare biobed rolled into the row, booted to READY on the power bus and its restraint strap buckled and tug-tested holding',
    fail: 'yanking the plug while the bed boots, or buckling a bed whose lamp reads NO POWER',
    rule: 'A tap and a hold do different things. Roll and tug are holds; plug and buckle are taps. Wait out the boot. NO POWER means hold to re-seat; a strap that slips on the tug means tap to buckle again.' },
  rush: 'Pulled the beds out from the wall and threw a sheet over each.',
  captions: { 'yanked plug': 'plug pops out', 'dead bed': 'strap clicks on a dark bed' },
  says: { 'yanked plug': 'You knocked the plug while it booted. Hands off until the lamp settles.', 'dead bed': 'That bed has no power. Re-seat the plug (hold E) before you strap it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Spare biobed 1', prop: 'biobed' }, { name: 'Spare biobed 2', prop: 'biobed' }, { name: 'Spare biobed 3', prop: 'biobed' }]), r = m.rnd;
    const loose = ri(r, 0, 2), jam = ri(r, 0, 2), boot = m.calm ? 1.0 : 1.3, TAP = 0.3, HOLD = 0.5;
    m.beds = m.sites.map((_, i) => ({ pos: 0, rate: rf(r, 0.7, 1.0), loose: i === loose, jam: i === jam, phase: 'roll', bootT: 0, slip: false }));
    let down = 0, fired = false;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { down = 0; return; } const i = m.next, b = m.beds[i];
      if (inp.hold) down += dt; const tap = rel && down < TAP, held = inp.hold && down >= HOLD && !fired; if (held) fired = true; if (!inp.hold) { down = 0; fired = false; }
      if (b.phase === 'roll') { if (inp.hold) b.pos = clamp(b.pos + b.rate * dt); if (b.pos >= 1) { b.phase = 'plug'; fired = true; } }
      else if (b.phase === 'plug') { if (tap) { b.phase = 'boot'; b.bootT = 0; } }
      else if (b.phase === 'boot') { b.bootT += dt; if (tap) { m.fault('yanked plug'); b.bootT = 0; } else if (b.bootT >= boot) b.phase = b.loose ? 'dead' : 'ready'; }
      else if (b.phase === 'dead') { if (tap) m.fault('dead bed'); else if (held) { b.loose = false; b.phase = 'boot'; b.bootT = 0; } }
      else if (b.phase === 'ready') { if (tap) { b.phase = 'buckled'; b.slip = false; } }
      else if (b.phase === 'buckled' && held) { if (b.jam) { b.jam = false; b.slip = true; b.phase = 'ready'; m.ev('slip', { site: i }); } else { m.finish(i); return; } }
      s.prog = s.done ? 1 : { roll: 0.3 * b.pos, plug: 0.3, boot: 0.4, dead: 0.4, ready: 0.6, buckled: 0.8 }[b.phase];
    };
    const tapF = (f) => f % 8 < 2;
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.beds[i].phase;
      if (p === 'roll' || p === 'dead' || p === 'buckled') return { at: i, hold: true, press: false };
      if (p === 'boot') return { at: i, hold: false };
      return { at: i, hold: tapF(f), press: f % 8 === 0 }; };
    m.bad = (f = 0) => { const i = m.next, p = m.beds[i]?.phase; return p === 'roll' ? { at: i, hold: true } : { at: i, hold: tapF(f), press: f % 8 === 0 }; };
    m.view = () => ({ loose, jam, rates: m.beds.map(b => +b.rate.toFixed(2)) });
    m.panel = (i) => { const b = m.beds[i]; if (!b) return null;
      if (b.phase === 'roll') return { label: 'Rolling into the row', value: `${Math.round(b.pos * 100)} %`, bar: b.pos };
      if (b.phase === 'plug') return { label: 'Power bus', value: 'unplugged', bar: 0 };
      if (b.phase === 'boot') return { label: 'Status lamp: booting… hands off', value: '◌', bar: clamp(b.bootT / boot) };
      if (b.phase === 'dead') return { label: 'Status lamp: ▲ NO POWER', value: 're-seat plug', bar: 0 };
      return { label: `Status lamp: ● READY · strap ${b.phase === 'buckled' ? 'buckled' : b.slip ? 'SLIPPED' : 'open'}`, value: b.phase === 'buckled' ? 'tug test' : 'buckle', bar: b.phase === 'buckled' ? 0.8 : 0.6 }; };
    m.prompt = (i) => { const p = m.beds[i]?.phase; return ({ roll: 'Hold [E] to roll the bed out into the working row', plug: 'Tap [E] to plug into the power bus', boot: 'Wait for the status lamp to settle', dead: 'NO POWER: hold [E] to pull and re-seat the plug', ready: 'Tap [E] to buckle the restraint strap', buckled: 'Hold [E] to tug-test the strap' })[p] || ''; };
    return m;
  },
});
