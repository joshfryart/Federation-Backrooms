// Botanist, cargo run: move quarantined seedlings to the arboretum. Tap E at the quarantine shelf to check the seal tag and lift the seed tray.
// From then on you are carrying a level tray of loose root plugs: any sharp turn of your view tilts it and a plug falls out (a fault). Walk
// and turn gently to each acclimation bay slot and set the plugs into their cells one at a time with taps of E, pausing between each so the
// plug can be pressed firm; a hurried second tap folds the last seedling's leaf under (a fault).
import { define, machine, room, ri } from './kit.js';

export default define({
  job: { billet: 'bot', label: 'Move quarantined seedlings to the arboretum', type: 'task:cargo_run' },
  title: 'Level-tray seedling carry', dept: 'sciences', host: 'room', siteName: 'Slot', verb: 'Plant',
  how: 'Tap E at the shelf to lift the tray, then keep every turn of your view gentle while carrying it. At each acclimation slot tap E once per plug, pausing between plugs.',
  keys: ['E tap: lift / set one plug', 'turn gently while carrying'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'carry level', input: 'e-tap+turn', win: 'the seed tray lifted, carried with only gentle turns, and every root plug set firm in its cell',
    fail: 'turning sharply while carrying so plugs tip out of the tray, or rushing plugs in with folded leaves',
    rule: 'After lifting, your view turn speed is the tray tilt: over the tilt line a plug falls. At a slot, tap E for each plug with a short pause between taps.' },
  rush: 'Carried the tray one-handed at a jog and pushed the plugs in by the fistful.',
  captions: { spilled: 'root plug patters on the deck', folded: 'leaf crumples' },
  says: { spilled: 'You turned too sharply with the tray: a plug fell out. Turn gently while carrying.', folded: 'Too quick: that leaf folded under the plug. Pause between plugs.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Quarantine shelf', prop: 'nutrient_tanks' }, { name: 'Acclimation slot A', prop: 'growbed' }, { name: 'Acclimation slot B', prop: 'plant' }]), r = m.rnd;
    const tilt = m.calm ? 2.4 : 1.8, gap = m.calm ? 0.3 : 0.4;
    m.need = [0, ri(r, 2, 4), ri(r, 2, 4)]; m.set = [0, 0, 0]; m.carry = false; m.last = -9; m.cool = 0; m.tilt = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; m.cool = Math.max(0, m.cool - dt); m.tilt = m.carry ? (inp.turn || 0) : 0;
      if (m.carry && m.tilt > tilt && !m.cool) { m.fault('spilled'); m.cool = 0.8; }
      const s = m.cur(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.press) { m.carry = true; m.ev('lift'); m.finish(0); } return; }
      if (inp.press) { if (m.t - m.last < gap) { m.fault('folded'); m.last = m.t; return; } m.last = m.t; m.set[i]++; if (m.set[i] >= m.need[i]) { m.finish(i); return; } }
      s.prog = m.set[i] / m.need[i];
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, press: true, turn: 0 };
      return { at: i, turn: tilt * 0.4, press: m.t - m.last > gap + 0.1 }; };
    m.bad = (f = 0) => ({ at: m.next, press: m.next === 0 || f % 20 === 0, turn: 5 });
    m.view = () => ({ need: m.need });
    m.panel = (i) => i === 0 ? { label: 'Seal tag', value: 'intact: lift', bar: 0 } : { label: m.tilt > tilt * 0.8 ? 'TRAY TILTING' : 'Tray level', value: `${m.set[i]}/${m.need[i]} plugs · tilt ${m.tilt.toFixed(1)}/${tilt}`, bar: m.set[i] / m.need[i] };
    m.prompt = (i) => i === 0 ? 'Tap [E] to check the seal tag and lift the seed tray' : 'Turn gently. Tap [E] to set one plug, pause, tap for the next';
    return m;
  },
});
