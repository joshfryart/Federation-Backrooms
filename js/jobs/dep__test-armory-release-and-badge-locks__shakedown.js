// Deputy security chief, shakedown: test the armory badge locks and the emergency release. At each locker reader swipe two test badges in
// turn: your own (it must RELEASE) and an unauthorised one (it must REFUSE; a lock that opens for it is marked FAILED on the test sheet). A
// swipe is E held while you sweep the badge across the reader at reading speed: rip it past too fast and the reader misreads, which spoils
// the test. Let go of E between badges. Last, haul the emergency lever by hand with no badge at all.
import { define, machine, room, rf, shuffle, ri } from './kit.js';

export default define({
  job: { billet: 'dep', label: 'Test armory release and badge locks', type: 'task:shakedown' },
  title: 'Two-badge reader swipe test', dept: 'security', host: 'room', siteName: 'Reader', verb: 'Swipe',
  how: 'At each reader hold E and turn at a steady reading speed to swipe the badge across it; let go, then swipe the second badge the same way. Too fast is a misread. Finish by holding E on the emergency lever.',
  keys: ['E hold + steady turn: swipe the badge', 'let go between badges', 'E hold: emergency lever'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'swipe badges', input: 'e-hold+swing', win: 'each locker reader swiped with the authorised and the unauthorised test badge at reading speed, results logged, emergency lever pulled',
    fail: 'ripping a badge across the reader too fast so it misreads and the lock result cannot be trusted',
    rule: 'Hold E and turn left at a moderate speed: the read bar fills while the speed sits in the band; turn faster than the band and it misreads. Release, swipe the second badge, then hold E on the lever.' },
  rush: 'Tapped his own badge on each reader and called the locks tested.',
  captions: { misread: 'reader error buzz', released: 'lock clacks open', refused: 'reader denies', failed: 'lock opens on the wrong badge' },
  says: { misread: 'Too fast — the reader misread the badge. Sweep it across at a steady speed.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Rifle locker reader', prop: 'weaponrack' }, { name: 'Charge pack locker reader', prop: 'chargerack' }, { name: 'Sidearm locker reader', prop: 'weaponrack' }, { name: 'Emergency release lever', prop: 'issuecounter' }]), r = m.rnd;
    const lo = m.calm ? 0.5 : 0.7, hi = m.calm ? 2.6 : 2.1, bad = new Set(shuffle(r, [0, 1, 2]).slice(0, ri(r, 0, 1)));
    m.lk = [0, 1, 2].map(i => ({ opensWrong: bad.has(i), need: rf(r, 0.3, 0.45), b: 0, rd: 0, over: 0, wait: false, res: [] }));
    m.lever = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 3) { if (inp.hold) { m.lever += dt; if (m.lever >= 1.2) { m.ev('lever', {}); m.finish(3); } } else m.lever = Math.max(0, m.lever - dt); s.prog = m.lever / 1.2; return; }
      const k = m.lk[i], sw = inp.swing || 0;
      if (rel) { k.wait = false; k.rd = 0; k.over = 0; }
      if (inp.hold && !k.wait) {
        if (sw > hi) { k.over += dt; if (k.over > 0.1) { m.fault('misread'); k.rd = 0; k.over = 0; k.wait = true; } }
        else { k.over = 0; if (sw >= lo) { k.rd += dt; if (k.rd >= k.need) { const res = k.b === 0 ? 'released' : k.opensWrong ? 'failed' : 'refused'; k.res.push(res); m.ev(res, { site: i }); k.b++; k.wait = true; k.rd = 0; if (k.b >= 2) { m.finish(i); return; } } } }
      }
      s.prog = 0.45 * k.b + 0.4 * k.rd / k.need;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 3) return { at: 3, hold: true }; const k = m.lk[i]; return k.wait ? { at: i, hold: false } : { at: i, hold: true, swing: 1.3 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 10 < 7, swing: 3.2 });
    m.view = () => ({ lk: m.lk.map(k => [k.opensWrong, +k.need.toFixed(2)]) });
    m.panel = (i) => { if (i === 3) return { label: 'Emergency lever', value: 'haul by hand', bar: m.lever / 1.2 }; const k = m.lk[i]; if (!k) return null; return { label: `${k.b === 0 ? 'Your badge' : 'Unauthorised test badge'}${k.res.length ? ' · last: ' + k.res[k.res.length - 1].toUpperCase() : ''}`, value: k.wait ? 'let go of E' : `${Math.round(k.rd / k.need * 100)} % read`, bar: k.rd / k.need }; };
    m.prompt = (i) => { if (i === 3) return 'Hold [E] to haul the emergency release lever'; const k = m.lk[i]; return !k ? '' : k.wait ? 'Let go of [E] and take the next badge' : 'Hold [E] and turn steadily to swipe the badge across the reader'; };
    return m;
  },
});
