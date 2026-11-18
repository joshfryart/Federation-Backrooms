// Chief of security: arm the escort for the away team. A sidearm lifted from the rack starts its power bar climbing by itself. Tap E to issue it only
// once the bar is in the green band. Tap early and the away team beams down with a half-charged weapon. Each issue starts the next sidearm charging.
import { define, machine, room, ri } from './kit.js';

export default define({
  job: { billet: 'cos', label: 'Arm escort for away team', type: 'task:survey' },
  title: 'Sidearm charge band issue', dept: 'security', host: 'room', item: 'phaser_rifle', siteName: 'Rack', verb: 'Issue',
  how: 'At each rack, lift a sidearm: its power bar climbs by itself. Tap E to issue it once the bar is in the green band. Tapping before the band hands out a half-charged sidearm.',
  keys: ['E tap: issue a charged sidearm', 'wait for the green band'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'issue when charged', input: 'e-tap', win: 'every sidearm for the away team issued by a tap made inside the charged band',
    fail: 'tapping to issue before the bar reaches the band, so a half-charged sidearm goes to the away team',
    rule: 'The power bar climbs by itself once a sidearm is lifted. Tap E only when it is in the green band. Each tap issues one sidearm and the next one starts charging from empty.' },
  rush: 'Handed each person a sidearm from the top of the rack and signed the sheet.',
  captions: { 'half-charged': 'weapon whines low' }, says: { 'half-charged': 'That one is not charged. Wait for the green band.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Weapon rack', prop: 'weaponrack' }, { name: 'Issue locker', prop: 'locker' }]), r = m.rnd;
    const LO = 0.7, RATE = m.calm ? 0.26 : 0.3;
    m.racks = m.sites.map(() => ({ n: ri(r, 2, 3), issued: 0, v: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return;
      const i = m.next, rk = m.racks[i];
      rk.v = Math.min(1, rk.v + dt * RATE);
      if (inp.press) {
        if (rk.v >= LO) { rk.issued++; rk.v = 0; m.ev('issue', { site: i }); if (rk.issued >= rk.n) { m.finish(i); return; } }
        else m.fault('half-charged');
      }
      s.prog = rk.issued / rk.n * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const rk = m.racks[i]; return { at: i, press: rk.v >= LO }; };
    m.bad = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, press: true }; };
    m.tag = m.racks.map(() => Math.floor(r() * 100));
    m.view = () => ({ n: m.racks.map(rk => rk.n), tag: m.tag });
    m.panel = (i) => { const rk = m.racks[i]; return rk ? { label: 'Charge', value: `${rk.issued} / ${rk.n} issued`, bar: rk.v, band: [LO, 1] } : null; };
    m.prompt = (i) => (m.racks[i] ? 'Tap [E] once the bar is in the green band' : '');
    return m;
  },
});
