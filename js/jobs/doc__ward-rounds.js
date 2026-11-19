// Doctor: ward rounds. At each biobed scan the wristband (tap E) to bring up the chart, which always says the patient was stable and the patient
// always says they are fine. Then lift the blanket (hold E until it is fully back) to see the dressing: a wet, reddened edge is a change. Write
// the chart by aiming at the chart column and tapping E: aim left for STABLE, right for CHANGED. Charting before the dressing has been seen, or
// writing a wet dressing up as stable, is a fault; so is calling a clean dry dressing a change (the nurse redoes it for nothing).
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Ward rounds', type: 'loop' },
  title: 'Blanket lift and chart entry', dept: 'medical', host: 'room', siteName: 'Biobed', verb: 'Round',
  how: 'At each bed tap E to scan the wristband, hold E to lift the blanket right back and look at the dressing, then aim at the chart column (left STABLE, right CHANGED) and tap E to write it.',
  keys: ['E tap: scan / write', 'E hold: lift blanket', 'aim left stable / right changed'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'lift and chart', input: 'e-tap+e-hold+look', win: 'every patient wristband scanned, blanket lifted fully and dressing charted stable or changed to match what lay under it',
    fail: 'charting a bed before the blanket is fully back, or a wet reddened dressing written up as stable',
    rule: 'Tap E: wristband scan. Hold E: the blanket lifts; let go early and it falls back. Fully back, the panel shows the dressing. Aim left and tap for STABLE, right and tap for CHANGED.' },
  rush: 'Read the old chart, heard "I\'m fine" and wrote stable down the row.',
  captions: { 'charted unseen': 'chart buzzer', 'wet written stable': 'nurse sighs', 'false change': 'nurse tuts' },
  says: { 'charted unseen': 'You wrote the chart without lifting the blanket. Look at the dressing first.', 'wet written stable': 'That dressing is wet at the edge and red: it is not stable.', 'false change': 'That dressing is clean and dry. Nothing changed.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Biobed 1', prop: 'biobed' }, { name: 'Biobed 2', prop: 'biobed' }, { name: 'Biobed 3', prop: 'biobed' }]), r = m.rnd;
    const wet = new Set(shuffle(r, [0, 1, 2]).slice(0, 1 + Math.floor(r() * 2))), names = shuffle(r, ['Ens. Tavi', 'Lt. Okafor', 'Cmdr. Reyes', 'Ens. Liu', 'PO Brandt', 'Lt. Varga']);
    const aim = m.calm ? 0.2 : 0.25, rate = m.calm ? 1.0 : 0.85;
    m.beds = m.sites.map((_, i) => ({ who: names[i], wet: wet.has(i), red: wet.has(i) ? Math.round(rf(r, 8, 25)) : Math.round(rf(r, 0, 3)), phase: 'band', lift: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, b = m.beds[i], look = inp.look || 0;
      if (b.phase === 'band') { if (inp.press) { b.phase = 'lift'; m.ev('scan', { site: i }); } }
      else if (b.phase === 'lift' && !inp.press) { b.lift = inp.hold ? clamp(b.lift + rate * dt) : clamp(b.lift - 1.5 * dt); if (b.lift >= 1) { b.phase = 'chart'; m.ev('seen', { site: i }); } }
      if (inp.press && b.phase !== 'band' && Math.abs(look) >= aim) {
        if (b.phase !== 'chart') m.fault('charted unseen');
        else { const changed = look < 0; if (b.wet && !changed) m.fault('wet written stable'); else if (!b.wet && changed) m.fault('false change'); else { m.finish(i); return; } }
      }
      s.prog = s.done ? 1 : b.phase === 'band' ? 0 : b.phase === 'lift' ? 0.1 + 0.6 * b.lift : 0.8;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const b = m.beds[i];
      if (b.phase === 'band') return { at: i, press: true, hold: true, look: 0 };
      if (b.phase === 'lift') return { at: i, hold: true, look: 0 };
      const tap = f % 4 === 0; return { at: i, press: tap, hold: tap, look: b.wet ? -0.4 : 0.4 }; };
    m.bad = (f = 0) => { const tap = f % 4 === 0; return { at: m.next, press: tap, hold: tap, look: 0.4 }; };
    m.view = () => ({ beds: m.beds.map(b => [b.who, b.wet, b.red]) });
    m.panel = (i) => { const b = m.beds[i]; if (!b) return null;
      if (b.phase === 'band') return { label: 'Wristband', value: 'tap to scan', bar: 0 };
      if (b.phase === 'lift') return { label: `${b.who}: "I'm fine" · chart: stable`, value: `blanket ${Math.round(b.lift * 100)} %`, bar: b.lift, band: [0.98, 1] };
      return { label: `Dressing: ${b.wet ? 'WET edge, red ' + b.red + ' mm' : 'dry, clean edge'}`, value: '◀ STABLE · CHANGED ▶', bar: 1 }; };
    m.prompt = (i) => { const b = m.beds[i]; return !b ? '' : b.phase === 'band' ? 'Tap [E] to scan the wristband' : b.phase === 'lift' ? 'Hold [E] to lift the blanket all the way back' : 'Aim left and tap [E] for STABLE, right for CHANGED'; };
    return m;
  },
});
