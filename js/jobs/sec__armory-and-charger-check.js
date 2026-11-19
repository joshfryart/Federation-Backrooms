// Security: armory and charger check. Read the zapper rack and the charger rack slot by slot (the panel shows the slot under your aim: a
// zapper's serial and charge light, an empty hook, a charger's lamp). Nothing is ticked for you: keep the count in your head. Then sign the
// armory sheet: hold E and the sheet counter rolls up one number at a time; let go on your count. One line for zappers present, one for
// faults (zappers not full plus dark charger lamps). A wrong number on the sheet is a fault and that line is struck out to roll again.
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Armory and charger check', type: 'loop' },
  title: 'Rack count and sheet roll', dept: 'security', host: 'room', siteName: 'Station', verb: 'Count',
  how: 'Look slowly along each rack and count what the panel shows under your aim. At the sheet, hold E: the number rolls up; let go on your count.',
  keys: ['look along the rack: read each slot', 'E hold: roll the sheet number, let go on your count'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'count then dial', input: 'e-hold+look', win: 'every rack slot read and both sheet lines signed with the true zapper count and fault count from memory',
    fail: 'signing a sheet line with a number that does not match the racks, or rolling past the count',
    rule: 'Aim along a rack: the panel names the slot you are on. Remember the totals. At the sheet hold E while the number climbs and release on your total.' },
  rush: 'Wrote down yesterday\'s count and locked up.',
  captions: { miscount: 'sheet line struck through', unread: 'rack not read' },
  says: { miscount: 'That number does not match the racks. The line is struck through: roll it again.', unread: 'Read every slot on the rack before you move on.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Zapper rack', prop: 'weaponrack' }, { name: 'Charger rack', prop: 'chargerack' }, { name: 'Sheet: zappers present', prop: 'secdesk' }, { name: 'Sheet: faults', prop: 'secdesk' }]), r = m.rnd;
    const nz = ri(r, 6, 8), empty = new Set(shuffle(r, [...Array(nz).keys()]).slice(0, ri(r, 1, 2))), base = ri(r, 201, 260);
    const zap = [...Array(nz).keys()].map(k => empty.has(k) ? { txt: 'empty hook', bad: 0, here: 0 } : (r() < 0.25 ? { txt: `Z-${base + k} charge light HALF`, bad: 1, here: 1 } : { txt: `Z-${base + k} charge light FULL`, bad: 0, here: 1 }));
    const nc = ri(r, 4, 5), chg = [...Array(nc).keys()].map(k => (r() < 0.3 ? { txt: `Charger ${k + 1} lamp DARK`, bad: 1 } : { txt: `Charger ${k + 1} lamp GREEN`, bad: 0 }));
    if (!zap.some(z => z.bad) && !chg.some(c => c.bad)) chg[ri(r, 0, nc - 1)] = { txt: 'Charger lamp DARK', bad: 1 };
    const rk = (list) => ({ list, seen: list.map(() => false), pos: list.map((_, k) => 0.4 - (k + 0.5) * 0.8 / list.length) });
    m.racks = [rk(zap), rk(chg)]; m.need = [zap.filter(z => z.here).length, zap.filter(z => z.bad).length + chg.filter(c => c.bad).length];
    m.roll = 0; m.rt = 0; const per = m.calm ? 0.55 : 0.4, tol = (k) => 0.36 / m.racks[k].list.length; m.aim = -1;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i < 2) { const R = m.racks[i], l = inp.look || 0; m.aim = R.pos.findIndex(p => Math.abs(l - p) < tol(i)); if (m.aim >= 0) R.seen[m.aim] = true;
        const cov = R.seen.filter(Boolean).length / R.seen.length; s.prog = cov * 0.9; if (cov >= 1 && inp.hold) m.finish(i); return; }
      if (inp.hold) { m.rt += dt; m.roll = Math.floor(m.rt / per) % 13; }
      if (rel) { if (m.roll === m.need[i - 2]) { m.ev('signed', { n: m.roll }); m.finish(i); } else m.fault('miscount'); m.rt = 0; m.roll = 0; }
      s.prog = s.done ? 1 : clamp(m.roll / 12) * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 };
      if (i < 2) { const R = m.racks[i], k = R.seen.findIndex(x => !x); return k < 0 ? { at: i, look: 0, hold: true } : { at: i, look: R.pos[k] }; }
      return { at: i, hold: !(m.roll === m.need[i - 2] && m.rt > (m.roll + 0.5) * per) }; };
    m.bad = (f = 0) => { const i = m.next; return i < 2 ? m.hint() : { at: i, hold: f % 24 < 8 }; };
    m.view = () => ({ zap: zap.map(z => z.txt), chg: chg.map(c => c.txt) });
    m.panel = (i) => { if (i < 2) { const R = m.racks[i]; const it = m.aim >= 0 && m.next === i ? R.list[m.aim].txt : '— aim along the rack —'; return { label: it, value: `${R.seen.filter(Boolean).length} / ${R.list.length} slots read`, bar: R.seen.filter(Boolean).length / R.list.length }; }
      return { label: i === 2 ? 'Zappers present' : 'Faults (not full + dark lamps)', value: String(m.roll), bar: m.roll / 12 }; };
    m.prompt = (i) => i < 2 ? (m.racks[i].seen.every(Boolean) ? 'Rack read: hold [E] to move on' : 'Look slowly along the rack and count each slot') : `Hold [E] to roll the number, let go on your ${i === 2 ? 'zapper count' : 'fault count'}`;
    return m;
  },
});
