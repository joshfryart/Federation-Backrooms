// Armory: charge-rack round. Walk the three charger racks with the cell-gauge handset. Tap E to press the probe on a cell's contact plate and
// read the dial. A plate with a grey film reads low and jittery: wipe it first (swing the view back and forth with the cloth), then probe again.
// A clean reading over the amber line (80 %) gets a tap to tick it; under it, hold E to pull the cell and press a fresh one home until the
// charge lamp stops blinking amber and holds green. Ticking a weak or filmed reading, or swapping a cell you have not cleaned, is a fault.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'armory', label: 'Charge-rack round', type: 'loop' },
  title: 'Cell gauge and contact-film round', dept: 'security', host: 'room', siteName: 'Rack', verb: 'Gauge',
  how: 'Tap E to touch the gauge probe on each cell. Grey film reads false-low: swing the view back and forth to wipe it, then probe again. Over the amber line, tap to tick; under it, hold E until the fresh cell\'s lamp holds green.',
  keys: ['E tap: probe / tick', 'swing: wipe the plate', 'E hold: swap and seat'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'wipe and gauge', input: 'e-tap+e-hold+swing', win: 'every cell on three charger racks gauged through a clean contact, weak ones swapped and seated to a steady green lamp',
    fail: 'ticking a cell under the amber line or a reading taken through contact film, swapping a good cell, or letting go before the cradle seats',
    rule: 'Tap E to probe. FILM on the plate: swing the view to and fro until it is wiped, then tap again. Clean and over 80 %: tap to tick. Under 80 %: hold E until the lamp turns steady green.' },
  rush: 'Glanced at the charge lamps from the aisle and initialled the clipboard.',
  captions: { 'weak cell sent out': 'amber lamp blinks', 'read through film': 'gauge crackles', 'pulled a good cell': 'cradle latch clacks', 'not seated': 'charge lamp blinks amber' },
  says: { 'weak cell sent out': 'That cell is under the amber line; it would fail on an alert. Hold E to swap it.', 'read through film': 'That reading was taken through grey film. Wipe the plate (swing the view) and probe again.',
    'pulled a good cell': 'That cell was fine. Tick it with a tap; only swap what reads under 80 %.', 'not seated': 'Let go too soon: the lamp is still blinking amber. Hold until it holds green.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Left-hand rack', prop: 'chargerack' }, { name: 'Middle rack', prop: 'chargerack' }, { name: 'Right-hand rack', prop: 'chargerack' }]), r = m.rnd;
    const kinds = shuffle(r, ['weak', 'weak', 'film', 'film', 'filmweak', 'ok', 'ok', 'ok', 'ok']), seatT = m.calm ? 1.0 : 1.2;
    m.racks = [0, 1, 2].map(k => kinds.slice(k * 3, k * 3 + 3).map(kd => {
      const weak = kd === 'weak' || kd === 'filmweak', c = weak ? rf(r, 0.5, 0.74) : rf(r, 0.84, 0.99);
      return { c, film: kd.startsWith('film'), st: 'idle', wipe: 0, seat: 0, held: 0, shown: 0 };
    }));
    m.c = 0;
    const cell = () => m.racks[m.next]?.[m.c];
    const nextCell = () => { m.c++; if (m.c >= 3) { m.c = 0; m.finish(m.next); } };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const q = cell(); if (!q) return;
      const weak = q.c < 0.8;
      if (q.st === 'film' && Math.abs(inp.swing || 0) > 0.9) { q.wipe = clamp(q.wipe + Math.abs(inp.swing) * dt * 0.5); if (q.wipe >= 1) { q.film = false; q.st = 'idle'; m.ev('wiped'); } }
      if (inp.press) {
        q.held = 0;
        if (q.st === 'idle') { q.st = q.film ? 'film' : 'read'; q.shown = q.film ? q.c - rf(m.rnd, 0.18, 0.3) : q.c; m.ev('probe', { v: +q.shown.toFixed(2) }); }
        else if (q.st === 'film') m.fault('read through film');
        else if (q.st === 'read') { if (weak) m.fault('weak cell sent out'); else nextCell(); }
      } else if (inp.hold && q.st !== 'idle') {
        q.held += dt;
        if (q.st === 'film' && q.held > 0.4) { m.fault('pulled a good cell'); q.held = -9; }
        else if (q.st === 'read' && !weak && q.held > 0.4) { m.fault('pulled a good cell'); q.held = -9; }
        else if (q.st === 'read' && weak) { q.seat += dt / seatT; if (q.seat >= 1) { q.c = 1; m.ev('seated'); q.held = 0; nextCell(); } }
      }
      if (rel && q.st === 'read' && weak && q.seat > 0.1 && q.seat < 1) { m.fault('not seated'); q.seat = 0; }
      if (!inp.hold) q.held = 0;
      s.prog = s.done ? 1 : (m.c + (q.st === 'read' && weak ? q.seat * 0.9 : 0)) / 3;
    };
    m.hint = (f = 0) => {
      const q = cell(); if (!q) return { at: -1 }; const tap = f % 4 === 0;
      if (q.st === 'film') return { at: m.next, swing: f % 16 < 8 ? 1.8 : -1.8 };
      if (q.st === 'read' && q.c < 0.8) return { at: m.next, hold: true };
      return { at: m.next, press: tap, hold: tap };
    };
    m.bad = (f = 0) => { const tap = f % 4 === 0; return { at: m.next, press: tap, hold: tap }; };
    m.view = () => ({ racks: m.racks.map(rk => rk.map(q => [+q.c.toFixed(2), q.film])) });
    m.panel = (i) => {
      const q = i === m.next ? cell() : null; if (!q) return { label: 'Rack', value: 'ticked', bar: 1 };
      if (q.st === 'idle') return { label: `Cell ${m.c + 1} / 3`, value: 'probe it', bar: 0, band: [0.8, 1] };
      if (q.st === 'film') return { label: `Cell ${m.c + 1}: GREY FILM`, value: `${Math.round(q.shown * 100 + Math.sin(m.t * 40) * 6)} % ?`, bar: q.wipe, band: [0.8, 1] };
      if (q.c < 0.8) return { label: `Cell ${m.c + 1}: UNDER AMBER`, value: q.seat > 0 ? 'lamp blinking amber' : `${Math.round(q.c * 100)} %`, bar: q.seat || q.c, band: [0.8, 1] };
      return { label: `Cell ${m.c + 1}`, value: `${Math.round(q.c * 100)} % clean`, bar: q.c, band: [0.8, 1] };
    };
    m.prompt = (i) => {
      const q = i === m.next ? cell() : null; if (!q) return '';
      return q.st === 'idle' ? 'Tap [E] to press the gauge probe on the contact plate' : q.st === 'film' ? 'Grey film on the plate: swing the view back and forth to wipe it, then probe again'
        : q.c < 0.8 ? 'Under the amber line: hold [E] to swap the cell until the lamp holds green' : 'Over the amber line: tap [E] to tick it';
    };
    return m;
  },
});
