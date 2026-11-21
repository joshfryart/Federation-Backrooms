// Security: count manifest against sealed lockers. Tap E once per item to count what is in the locker; the count runs on until the panel shows
// END. Then compare with the manifest: a full count is sealed by holding E while looking right at the seal unit; a short count is logged by
// holding E while looking left at the discrepancy slip. Sealing a short locker, or sealing before the END, signs off a missing item.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Count manifest against sealed lockers', type: 'task:cargo_run' },
  title: 'Count by hand, seal or slip', dept: 'security', host: 'room', siteName: 'Locker', verb: 'Count',
  how: 'Tap E once per item until the panel shows END. Then hold E looking right to seal a full count, or hold E looking left to log a short one.',
  keys: ['E tap: count an item', 'E hold, look right: seal', 'E hold, look left: discrepancy slip'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'count then rule', input: 'e-tap+e-hold+look',
    win: 'three lockers counted by hand to the end, full counts sealed at the seal unit and short counts logged on the discrepancy slip',
    fail: 'sealing a locker whose count is short, logging a discrepancy on a full count, or ruling before the count reached its end',
    rule: 'Tap E per item until END shows. Matches the manifest: hold E looking right to seal. Short: hold E looking left for the slip.' },
  rush: 'Eyeballed each locker, took the manifest figure and pressed seal.',
  captions: { 'short seal': 'seal with short count', 'false slip': 'discrepancy slip wasted', uncounted: 'locker ruled uncounted' },
  says: { 'short seal': 'The count was short. Log it on the slip, do not seal.', 'false slip': 'That count matched the manifest. Seal it.', uncounted: 'Finish counting to the END first.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Locker 1', prop: 'locker' }, { name: 'Locker 2', prop: 'locker' }, { name: 'Locker 3', prop: 'locker' }]), r = m.rnd; const sh = r() < 0.7 ? Math.floor(r() * 3) : -1;
    m.lk = m.sites.map((_, i) => { const n = ri(r, 3, 6); return { n, a: i === sh ? n - 1 : n, c: 0, end: false, h: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const k = m.lk[m.next]; const side = (inp.look || 0) > 0.25 ? 'L' : (inp.look || 0) < -0.25 ? 'R' : '';
      if (inp.press && !k.end) { if (k.c < k.a) k.c++; else k.end = true; }
      if (inp.hold && side && !inp.press) { k.h += dt; if (k.h >= 0.6) { k.h = 0; if (!k.end) m.fault('uncounted'); else if (side === 'R') { if (k.a === k.n) m.finish(m.next); else m.fault('short seal'); } else if (k.a < k.n) m.finish(m.next); else m.fault('false slip'); return; } } else if (!inp.hold) k.h = 0;
      s.prog = clamp(k.c / (k.a + 1)) * 0.9;
    };
    m.hint = (f = 0) => { const k = m.lk[m.next]; if (!k) return { at: -1 }; if (!k.end) return f % 2 ? { at: m.next, hold: false } : { at: m.next, hold: true, press: true }; return { at: m.next, hold: true, look: k.a === k.n ? -0.4 : 0.4 }; };
    m.bad = () => ({ at: m.next, hold: true, look: -0.4 });
    m.view = () => ({ lk: m.lk.map(k => [k.n, k.a]) });
    m.panel = (i) => { const k = m.lk[i]; if (!k) return null; return { label: `Manifest ${k.n}  counted ${k.c}${k.end ? '  END' : ''}`, value: k.end ? (k.a === k.n ? 'full' : 'SHORT') : 'counting', bar: clamp(k.c / k.n) }; };
    m.prompt = (i) => (m.lk[i] && m.lk[i].end ? 'Hold [E] looking right to seal, or left to log a short count' : 'Tap [E] once per item until END');
    return m;
  },
});
