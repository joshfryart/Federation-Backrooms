// Lab technician, medical relief: deliver results to sickbay. You carry one results folder per patient, fanned in your hand. At each biobed the
// panel shows the bed card's patient ID and the folder you are facing: turn to the matching folder and hold E to hand it across. Keep holding,
// and keep still, while the doctor reads the key finding: moving pulls the page away and they lose their place. Let go only once the doctor
// acknowledges. Handing over another patient's folder, or letting go before the nod, are the faults.
import { define, machine, room, rf, ri, shuffle, clamp } from './kit.js';

const POS = [-0.3, 0, 0.3];
export default define({
  job: { billet: 'lab', label: 'Deliver results to sickbay', type: 'task:medical_relief' },
  title: 'Hand the folder, hold for the nod', dept: 'sciences', host: 'room', siteName: 'Biobed', verb: 'Deliver',
  how: 'At each biobed face the folder whose patient ID matches the bed card and hold E to hand it over. Keep holding and keep still until the doctor nods, then let go.',
  keys: ['look: choose the folder', 'E hold and stay still: doctor reads', 'let go after the nod'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'hand and hold', input: 'e-hold+look+turn', win: 'each patient\'s results folder handed to the doctor at the matching biobed and held steady until the doctor acknowledges the finding',
    fail: 'handing a folder to the wrong patient\'s bed, or letting go before the doctor has read and nodded',
    rule: 'Turn to the folder whose ID matches the bed card and hold E. Keep your view still while the doctor reads (the read bar only fills when still); release when the panel says ACKNOWLEDGED.' },
  rush: 'Left the folders in the sickbay in-tray and went back to the lab.',
  captions: { 'wrong patient': 'doctor frowns', 'left in tray': 'folder drops in the tray' },
  says: { 'wrong patient': 'That is not this patient\'s folder: check the bed card.', 'left in tray': 'You let go before the doctor read it. It went in the tray.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Biobed 1', prop: 'biobed' }, { name: 'Biobed 2', prop: 'biobed' }, { name: 'Biobed 3', prop: 'biobed' }]), r = m.rnd;
    const ids = []; while (ids.length < 3) { const id = `${ri(r, 1, 9)}${ri(r, 0, 9)}-${ri(r, 100, 999)}`; if (!ids.includes(id)) ids.push(id); }
    m.beds = ids.map(id => ({ id, need: rf(r, 1.0, 2.0) * (m.calm ? 0.8 : 1), read: 0, offer: 0, ack: false }));
    m.fan = shuffle(r, [0, 1, 2]).map(b => ({ bed: b, gone: false }));   // folder slot j -> bed index
    const under = (look) => POS.findIndex(p => Math.abs(p - look) < 0.12);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, b = m.beds[i], j = under(inp.look || 0); m.eye = j;
      if (inp.hold) {
        if (b.offer === 0 && (j < 0 || m.fan[j].gone)) return;
        if (b.offer === 0) b.slot = j; b.offer += dt;
        if (m.fan[b.slot].bed !== i) { if (b.offer > 0.6) { m.fault('wrong patient'); b.offer = -99; } return; }
        if ((inp.turn || 0) < 0.3) { b.read += dt; if (b.read >= b.need) b.ack = true; } else if (!b.ack) b.read = Math.max(0, b.read - dt * 2);
      }
      if (rel) {
        if (b.offer > 0 && m.fan[b.slot].bed === i) { if (b.ack) { m.fan[b.slot].gone = true; m.finish(i); return; } m.fault('left in tray'); }
        b.offer = 0; b.read = 0; b.ack = false;
      }
      s.prog = s.done ? 1 : clamp(b.read / b.need * 0.9, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const b = m.beds[i], j = m.fan.findIndex(f => f.bed === i); return { at: i, look: POS[j], turn: 0, hold: !b.ack }; };
    m.bad = (fr = 0) => { const i = m.next, j = m.fan.findIndex(f => f.bed !== i && !f.gone); return { at: i, look: POS[j < 0 ? 0 : j], turn: 0, hold: fr % 40 < 30 }; };
    m.view = () => ({ ids, fan: m.fan.map(f => f.bed) });
    m.panel = (i) => { const b = m.beds[i]; if (!b) return null; const j = i === m.next ? m.eye : -1, f = j >= 0 ? m.fan[j] : null; return { label: `Bed card ${b.id}`, value: b.ack ? 'ACKNOWLEDGED: let go' : b.offer > 0 ? 'doctor reading…' : f ? (f.gone ? 'empty' : `folder ${ids[f.bed]}`) : 'face a folder', bar: clamp(b.read / b.need) }; };
    m.prompt = (i) => { const b = m.beds[i]; if (!b) return ''; return b.ack ? 'Doctor acknowledged: let go of [E]' : b.offer > 0 ? 'Keep holding [E] and keep still while the doctor reads' : `Face folder ${b.id} and hold [E] to hand it over`; };
    return m;
  },
});
