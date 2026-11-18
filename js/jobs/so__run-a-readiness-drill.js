// Second officer: run a readiness drill. Hold the PA key through the whole announcement (the stopwatch starts as you let go). Then at each
// station's locker hold E with the door open and look along the four kit slots, left to right, dwelling on each until it is ticked. An empty
// slot is not passed: keep your eye on it while the crew hand the missing item across. Closing a locker (letting go) with a slot unchecked or
// still empty passes a station that is not manned: a fault.
import { define, machine, room, shuffle, pick, clamp } from './kit.js';

const KIT = ['phaser', 'tricorder', 'medkit', 'helmet lamp', 'comm badge', 'rebreather', 'gloves', 'hand torch'];
const POS = [0.36, 0.12, -0.12, -0.36];

export default define({
  job: { billet: 'so', label: 'Run a readiness drill', type: 'loop' },
  title: 'Readiness drill locker check', dept: 'command', host: 'room', siteName: 'Station', verb: 'Check',
  how: 'Hold E on the PA key to announce the drill, then at each locker hold E and look across the four kit slots until every one is ticked; an empty slot must be refilled before you let go.',
  keys: ['E hold: announce / open locker', 'look left → right across the slots'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'slot check', input: 'e-hold+look', win: 'drill announced in full and every station locker closed only with all four kit slots seen and filled',
    fail: 'cutting the announcement short, or shutting a locker with a slot unchecked or empty',
    rule: 'Hold E and aim at each kit slot (left to right) until its tick appears; an EMPTY slot takes longer while the item is handed over. Let go only when all four are ticked.' },
  rush: 'Clicked the stopwatch when the crew looked ready and passed every locker from the doorway.',
  captions: { 'cut short': 'PA crackles off', 'passed short': 'locker slams' },
  says: { 'cut short': 'You let go of the PA key mid-sentence. Announce the whole drill, then let go.', 'passed short': 'You shut the locker with kit unchecked. Look over every slot first.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'PA key', prop: 'locker' }, { name: 'Alpha station locker', prop: 'weaponrack' }, { name: 'Bravo station locker', prop: 'suitrack' }, { name: 'Charlie station locker', prop: 'chargerack' }]), r = m.rnd;
    const tol = m.calm ? 0.12 : 0.09, see = 0.35, fill = 0.9;
    m.pa = 0; m.held = 0;
    m.lockers = [1, 2, 3].map(() => { const items = shuffle(r, KIT).slice(0, 4), miss = r() < 0.75 ? Math.floor(r() * 4) : -1; return items.map((n, k) => ({ n, empty: k === miss, dw: 0, ok: false })); });
    const aimed = (look) => POS.findIndex(p => Math.abs((look || 0) - p) < tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.hold) m.pa = clamp(m.pa + dt / 1.2); if (rel) { if (m.pa >= 1) { m.finish(0); return; } m.fault('cut short'); m.pa = 0; } s.prog = m.pa * 0.95; return; }
      const L = m.lockers[i - 1];
      if (inp.hold) { m.held += dt; const k = aimed(inp.look); if (k >= 0 && !L[k].ok) { L[k].dw += dt; if (L[k].dw >= (L[k].empty ? fill : see)) { L[k].ok = true; L[k].empty = false; m.ev('slot', { k }); } } if (L.every(x => x.ok)) { m.finish(i); m.held = 0; return; } }
      if (rel) { if (m.held > 0.15) m.fault('passed short'); m.held = 0; }
      s.prog = L.filter(x => x.ok).length / 4 * 0.95;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, hold: m.pa < 1 }; const k = m.lockers[i - 1].findIndex(x => !x.ok); return { at: i, hold: k >= 0, look: k >= 0 ? POS[k] : 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 24 < 12, look: 0.6 });
    m.view = () => ({ l: m.lockers.map(L => L.map(x => x.n + (x.empty ? '!' : ''))) });
    m.panel = (i) => {
      if (i === 0) return { label: 'Announcement', value: m.pa >= 1 ? 'done: let go' : `${Math.round(m.pa * 100)} %`, bar: m.pa };
      const L = m.lockers[i - 1]; if (!L) return null; const k = L.findIndex(x => !x.ok); if (k < 0) return { label: 'Locker', value: 'all kit present', bar: 1 };
      return { label: `Slot ${k + 1}: ${L[k].n}`, value: L.map((x, j) => x.ok ? '✓' : x.empty ? '∅' : '·').join(' ') + (L[k].empty ? '  EMPTY: keep looking while it is supplied' : ''), bar: L[k].dw / (L[k].empty ? fill : see) };
    };
    m.prompt = (i) => i === 0 ? 'Hold [E] on the PA key for the whole announcement, then let go to start the stopwatch' : 'Hold [E] and look across the kit slots from left to right until each is ticked';
    return m;
  },
});
