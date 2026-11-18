// Armory, quiet watch: full charger round. Each rack holds three cells side by side. Look along the rack to read each one, then top them up
// lowest first: aim at a cell and hold E to seat it on charge. The level climbs fast and then crawls; the green lamp comes on at 85 % but that
// is only trickle. Keep holding until the charge current falls under the full mark and the full tone sounds, then let go. Starting on a cell
// that is not the lowest left, or letting go while it is still drawing current, is a fault. The spare on the bench charger finishes the round.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const POS = [0.3, 0, -0.3], FULL = 0.04;
export default define({
  job: { billet: 'armory', label: 'Full charger round and top up all cells', type: 'task:quiet_watch' },
  title: 'Lowest-first top-up to the full tone', dept: 'security', host: 'room', siteName: 'Charger', verb: 'Top up',
  how: 'Look along the rack to read each cell, aim at the lowest and hold E to charge it. The green lamp at 85 % is only trickle: hold until the current drops under the FULL mark and the tone sounds, then let go and do the next lowest.',
  keys: ['look: pick a cell', 'E hold: charge', 'let go on the full tone'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'top up lowest-first', input: 'e-hold+look', win: 'every cell charged in rising order of its starting level and held on until the charge current falls to the full tone',
    fail: 'charging a cell before a lower one, or lifting a cell off while it is still on trickle charge',
    rule: 'Aim at a cell to read its level. Hold E on the lowest uncharged cell; keep holding past the green lamp until CURRENT drops under the FULL mark, then release and move on.' },
  rush: 'Pushed every cell back into its cradle and left the green lamps to do the rest.',
  captions: { 'out of order': 'rack buzzer', trickle: 'charger clicks off early', full: 'full tone' },
  says: { 'out of order': 'Not the lowest cell on this rack: read them all and top up the lowest first.', trickle: 'Still drawing current — that was trickle, not full. Hold until the full tone.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Charger rack A', prop: 'chargerack' }, { name: 'Charger rack B', prop: 'chargerack' }, { name: 'Bench charger spare', prop: 'workbench' }]), r = m.rnd;
    const k = m.calm ? 2.0 : 1.7, aimW = m.calm ? 0.14 : 0.12;
    m.racks = [0, 1, 2].map(i => (i < 2 ? shuffle(r, [rf(r, 0.25, 0.4), rf(r, 0.45, 0.6), rf(r, 0.65, 0.78)]) : [rf(r, 0.2, 0.5)]).map(v => ({ lv: v, start: v, full: false })));
    m.chg = -1; m.aim = -1;
    const cells = () => m.racks[m.next] || [], pos = (n) => n === 1 ? [0] : POS;
    const aimAt = (look) => { const p = pos(cells().length); let best = -1; p.forEach((x, j) => { if (Math.abs(look - x) < aimW) best = j; }); return best; };
    const lowest = () => { let b = -1; cells().forEach((c, j) => { if (!c.full && (b < 0 || c.start < cells()[b].start)) b = j; }); return b; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const cs = cells();
      m.aim = aimAt(inp.look || 0);
      if (inp.hold && m.chg < 0 && m.aim >= 0 && !cs[m.aim].full) { if (m.aim !== lowest()) { m.fault('out of order'); m.chg = -2; } else m.chg = m.aim; }
      if (m.chg >= 0) {
        const c = cs[m.chg];
        if (inp.hold) { c.lv += k * (1 - c.lv) * dt; if (1 - c.lv < FULL) { c.full = true; m.ev('full'); m.chg = -2; if (cs.every(x => x.full)) { m.chg = -1; m.finish(m.next); return; } } }
        if (rel && !c.full) { m.fault('trickle'); m.chg = -1; }
      }
      if (!inp.hold && m.chg === -2) m.chg = -1;
      s.prog = s.done ? 1 : cs.filter(x => x.full).length / cs.length * 0.9;
    };
    m.hint = () => {
      const i = m.next; if (i < 0) return { at: -1 }; const lo = lowest(), p = pos(cells().length);
      if (m.chg === -2) return { at: i, hold: false, look: p[lo] ?? 0 };
      return { at: i, hold: lo >= 0, look: p[lo] ?? 0 };
    };
    m.bad = (f = 0) => { const cs = cells(), p = pos(cs.length); let hi = 0; cs.forEach((c, j) => { if (c.start > cs[hi].start) hi = j; }); return { at: m.next, hold: f % 20 < 10, look: p[hi] }; };
    m.view = () => ({ racks: m.racks.map(rk => rk.map(c => +c.start.toFixed(2))) });
    m.panel = (i) => {
      const cs = m.racks[i]; if (!cs) return null; const j = m.chg >= 0 ? m.chg : m.aim, c = cs[j];
      if (!c) return { label: 'Aim at a cell', value: `${cs.filter(x => x.full).length} / ${cs.length} full`, bar: 0 };
      const cur = 1 - c.lv;
      return { label: `Cell ${j + 1}${c.full ? ' FULL' : c.lv >= 0.85 ? ' green lamp' : ''}`, value: `${Math.round(c.lv * 100)} % · current ${cur.toFixed(2)}`, bar: clamp(1 - cur / 0.8), band: [1 - FULL / 0.8, 1] };
    };
    m.prompt = (i) => { const c = m.racks[i]?.[m.chg]; return c && !c.full ? (c.lv >= 0.85 ? 'Green lamp is only trickle: keep holding [E] until the full tone' : 'Hold [E]: charging') : 'Look along the rack to read each cell; hold [E] on the lowest one'; };
    return m;
  },
});
