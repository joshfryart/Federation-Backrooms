// Cargo: re-secure loose pallets. A rocking pallet lifts one corner at the top of every rock. Tap E at the top, while the corner is up, to
// slide a wedge under the runner; a tap while the corner is down pinches the wedge and is a fault. Each good wedge shrinks the rock.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Re-secure loose pallets', type: 'task:quiet_watch' },
  title: 'Wedge on the rock', dept: 'services', host: 'room', siteName: 'Pallet', verb: 'Wedge',
  how: 'Watch the pallet rock on the gauge. Tap E when the corner is at the top of the rock to slide a wedge in. Three good wedges stop it moving.',
  keys: ['E tap: wedge, on the rock top'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'wedge the rock', input: 'e-tap+rhythm',
    win: 'three wedges seated at the top of the rock on every loose pallet until it stops moving',
    fail: 'tapping while the corner is down so the wedge pinches, over and over',
    rule: 'The rock gauge swings up and down. A wedge only goes in when the corner is up, near the top of the swing; tap E then. Tapping at any other point pinches the wedge. Three wedges settle a pallet.' },
  rush: 'Wedged the nearest pallet once and trusted the strap.',
  captions: { pinched: 'wedge pinches' },
  says: { pinched: 'Wrong moment: the corner was down and the wedge pinched.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pallet 1', prop: 'pallet_loaded' }, { name: 'Pallet 2', prop: 'crate' }]), r = m.rnd, win = m.calm ? 0.78 : 0.88;
    m.pal = m.sites.map(() => ({ w: rf(r, 2.6, 3.6), ph: rf(r, 0, 6), n: 0, cd: 0 }));
    const sn = (p) => Math.sin(m.t * p.w + p.ph);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, p = m.pal[i]; p.cd = Math.max(0, p.cd - dt);
      if (inp.press && p.cd === 0) { p.cd = 0.5; if (sn(p) >= win) { p.n++; if (p.n >= 3) m.finish(i); } else m.fault('pinched'); }
      s.prog = s.done ? 1 : p.n / 3 * 0.95;
    };
    m.hint = () => { const i = m.next; return i < 0 ? { at: -1 } : { at: i, press: sn(m.pal[i]) >= win + 0.05 }; };
    m.bad = () => { const i = m.next; return { at: i, press: sn(m.pal[i]) < -0.3 }; };
    m.view = () => ({ pal: m.pal.map(p => [+p.w.toFixed(2), +p.ph.toFixed(2)]) });
    m.panel = (i) => { const p = m.pal[i]; if (!p) return null; const v = sn(p); return { label: 'Rock', value: `${p.n}/3 wedges`, bar: clamp((v + 1) / 2, 0, 1), band: [(win + 1) / 2, 1] }; };
    m.prompt = () => 'Tap [E] when the corner is at the top of the rock';
    return m;
  },
});
