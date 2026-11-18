// Comms officer, medical relief: keep the sickbay link prioritised. At each sickbay jack read its lamp. A lead already on the PRIORITY bus
// just gets a quick tap of E to tick the card. A lead on ROUTINE must be moved: aim right at the routine bus, hold E to grip the lead, and
// turn your view left, gently, to the priority bus, letting go there to seat it. Turning fast yanks the lead out of the jack; gripping a lead
// that is already on priority unpatches it. Finish by ticking the priority card so the next officer does not undo it.
import { define, machine, room, rf, shuffle, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'comms', label: 'Keep the sickbay link prioritised', type: 'task:medical_relief' },
  title: 'Gentle lead drag to priority bus', dept: 'operations', host: 'room', siteName: 'Jack', verb: 'Move',
  how: 'Tap E on a lead already on priority; for a routine lead, hold E on the routine bus (right) and turn your view slowly left to the priority bus, then let go to seat it.',
  keys: ['E tap: tick a priority lead', 'E hold + slow turn left: move a routine lead'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'ease the lead', input: 'e-hold+e-tap+look+turn', win: 'every routine sickbay lead eased across to the priority bus without yanking it, priority leads left alone, and the card ticked',
    fail: 'turning so fast the lead yanks out, or gripping a lead that was already on priority',
    rule: 'Read the lamp. PRIORITY: quick tap only. ROUTINE: aim right, hold E, turn left slowly (the panel warns when too fast), release over the PRIORITY bus.' },
  rush: 'Jammed the sickbay lead across without checking the bus count.',
  captions: { yanked: 'lead pops out of the jack', unpatched: 'sickbay line drops to routine', 'loose lead': 'lead flops back', seated: 'jack clicks home' },
  says: { yanked: 'Too fast — the lead yanked out. Turn slowly while you carry it.', unpatched: 'That lead was already on priority — just tap to tick it.', 'loose lead': 'Let go short of the priority bus — the lead fell back.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Sickbay line A', prop: 'relayrack' }, { name: 'Sickbay line B', prop: 'servers' }, { name: 'Triage bay line', prop: 'relayrack' }, { name: 'Priority card', prop: 'commsstation' }]), r = m.rnd;
    const maxT = m.calm ? 1.5 : 1.2, pri = new Set(shuffle(r, [0, 1, 2]).slice(0, ri(r, 1, 2))), zone = [0.3, 0.5];
    m.leads = [0, 1, 2].map(i => ({ pri: pri.has(i), held: 0, grip: false, at: -0.35 + rf(r, -0.03, 0.03) })); m.lk = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, lk = inp.look || 0; m.lk = lk;
      if (i === 3) { if (rel) m.finish(3); return; }
      const d = m.leads[i];
      if (inp.hold) { d.held += dt;
        if (d.pri && d.held > 0.35) { m.fault('unpatched'); d.held = -99; }
        if (!d.pri && !d.grip && lk < -0.2) d.grip = true;
        if (d.grip) { if ((inp.turn || 0) > maxT) { m.fault('yanked'); d.grip = false; d.held = -99; } else s.prog = clamp((lk + 0.35) / 0.8 * 0.9); } }
      if (rel) { const h = d.held; d.held = 0;
        if (d.pri) { if (h >= 0 && h <= 0.35) m.finish(i); return; }
        if (d.grip) { d.grip = false; if (lk >= zone[0] && lk <= zone[1]) { m.ev('seated', { site: i }); m.finish(i); return; } m.fault('loose lead'); s.prog = 0; } }
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 3 || m.leads[i].pri) return { at: i, hold: f % 10 === 0, press: f % 10 === 0, look: 0 };
      const d = m.leads[i]; if (!d.grip) return { at: i, hold: true, press: true, look: d.at, turn: 0 };
      return m.lk >= 0.38 ? { at: i, hold: false, look: m.lk } : { at: i, hold: true, look: m.lk + 0.022, turn: 0.66 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 30 < 20, look: -0.35 + (f % 30) * 0.05, turn: 3 });
    m.view = () => ({ l: m.leads.map(d => [d.pri, +d.at.toFixed(2)]) });
    m.panel = (i) => { if (i === 3) return { label: 'Priority card', value: 'tap to tick', bar: 0 }; const d = m.leads[i]; if (!d) return null;
      return { label: d.pri ? 'Lamp: PRIORITY' : 'Lamp: ROUTINE', value: d.grip ? `carrying lead · ${m.lk >= zone[0] ? 'over PRIORITY bus' : 'keep turning slowly'}` : d.pri ? 'leave it: tap to tick' : 'grip it on the routine bus', bar: d.grip ? clamp((m.lk + 0.35) / 0.8) : 0, band: d.grip ? [(zone[0] + 0.35) / 0.8, 1] : undefined }; };
    m.prompt = (i) => i === 3 ? 'Tap [E] to tick the priority card' : m.leads[i]?.pri ? 'Already on priority — tap [E] to tick it' : 'Hold [E] on the routine bus and turn slowly left to the priority bus';
    return m;
  },
});
