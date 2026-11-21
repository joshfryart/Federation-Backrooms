// Galley: deliver night-shift plates to the bridge. Hold E to carry the covered tray along the aisle to each watch station. Between the two
// marked lines (the console zone) the tray must be kept steady: whipping the view round faster than a gentle turn there spills the plate
// and sends you back to the hatch. Let go at the station to set the plate down; let go early and it drops short.
import { define, machine, room, clamp } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Deliver night-shift plates to the bridge', type: 'task:quiet_watch' },
  title: 'Steady tray past the consoles', dept: 'services', host: 'room', siteName: 'Watch station', verb: 'Serve',
  how: 'Hold E to carry the tray toward the station. Keep your view still between the marked lines past the consoles. Let go of E at the station to put the plate down.',
  keys: ['E hold: carry the tray', 'keep the view steady past the line', 'let go at the station'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'carry steady', input: 'e-hold+turn', win: 'three covered plates carried past the console line without a spill and set down at their watch stations',
    fail: 'turning the view fast while the tray is between the console lines so the plate spills, or setting the tray down short of the station',
    rule: 'Hold E to advance the tray bar. Inside the marked console band keep your turning slow. Release at the end of the bar to set the plate down; earlier drops it.' },
  rush: 'Slid the plates across the console tops in a hurry.',
  captions: { spilled: 'plate rattles', 'dropped short': 'plate clatter' },
  says: { spilled: 'The plate spilled past the consoles. Go back and carry it steadily.', 'dropped short': 'You put the tray down short of the station.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Helm watch', prop: 'helm' }, { name: 'Ops watch', prop: 'opsstation' }, { name: 'Nav watch', prop: 'navstation' }]), r = m.rnd;
    const lim = m.calm ? 1.1 : 0.8, a = 0.3 + r() * 0.1, b = a + 0.3 + r() * 0.1; m.zone = [a, b]; m.walk = 0; m.cap = lim;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { m.walk = 0; return; } const i = m.next;
      if (inp.hold) { m.walk = clamp(m.walk + dt * (m.calm ? 0.4 : 0.5)); if (m.walk > a && m.walk < b && (inp.turn || 0) > lim) { m.fault('spilled'); m.walk = 0; } }
      if (rel && m.walk > 0) { if (m.walk >= 0.95) { m.walk = 0; m.finish(i); return; } m.fault('dropped short'); m.walk = 0; }
      s.prog = s.done ? 1 : m.walk * 0.9;
    };
    m.hint = () => { const i = m.next; return i < 0 ? { at: -1 } : { at: i, hold: m.walk < 0.97, turn: 0.1 }; };
    m.bad = () => ({ at: Math.max(0, m.next), hold: true, turn: 2 });
    m.view = () => ({ zone: m.zone.map(v => +v.toFixed(2)) });
    m.panel = (i) => (m.sites[i] ? { label: m.walk > a && m.walk < b ? 'CONSOLE ZONE: keep still' : 'Aisle', value: `${Math.round(m.walk * 100)} %`, bar: m.walk, band: m.zone } : null);
    m.prompt = (i) => 'Hold [E] to carry the tray; keep the view steady in the band; let go at the station';
    return m;
  },
});
