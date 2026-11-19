// Lab technician, shakedown: secure samples for hard maneuvers. Each padded holder's lid latch takes a few clicks to seat home, and you cannot
// see how many. Tap E for one click, then give the transit rack a shake (swing your view briskly back and forth): a holder that is not home
// rattles; one that is home sits solid. Click again only when it rattles. One click past home cracks the tube's holder and you start that one
// again. A holder that stays solid through a full shake is secured.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'lab', label: 'Secure samples for hard maneuvers', type: 'task:shakedown' },
  title: 'Click, shake, listen for the rattle', dept: 'sciences', host: 'room', siteName: 'Holder', verb: 'Secure',
  how: 'Tap E to click the holder latch one notch, then shake the rack (swing your view quickly back and forth). Rattles: one more click. Solid through a full shake: secured. Never click a solid holder.',
  keys: ['E tap: one latch click', 'swing back and forth: shake the rack'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'shake and snug', input: 'e-tap+swing', win: 'every sample holder clicked home one notch at a time and proven solid by a full rack shake, never clicked past home',
    fail: 'clicking a holder that already sits solid so the latch cracks the holder',
    rule: 'One tap is one latch click. Shake by swinging the view left-right fast: after a moment the panel reads RATTLE or SOLID. Rattle means click once more; keep shaking a solid one until the bar fills.' },
  rush: 'Snapped the lids shut hard and hoped none would rattle in the turn.',
  captions: { cracked: 'plastic cracks', rattle: 'holder rattles' },
  says: { cracked: 'One click too many: the holder cracked. Fresh holder, start again.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Rack slot A', prop: 'labbench' }, { name: 'Rack slot B', prop: 'labbench' }, { name: 'Rack slot C', prop: 'workbench' }, { name: 'Rack slot D', prop: 'labbench' }]), r = m.rnd;
    const readT = m.calm ? 0.25 : 0.35, proveT = 1.0;
    m.h = m.sites.map(() => ({ need: ri(r, 1, 4), n: 0, shake: 0, reading: null }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, h = m.h[i];
      if (inp.press) { if (h.reading === 'solid' || h.n >= h.need) { m.fault('cracked'); h.n = 0; } else h.n++; h.shake = 0; h.reading = null; }
      else if (Math.abs(inp.swing || 0) > 1.2) {
        h.shake += dt; if (h.shake >= readT && !h.reading) { h.reading = h.n >= h.need ? 'solid' : 'rattle'; if (h.reading === 'rattle') m.ev('rattle', { site: i }); }
        if (h.reading === 'solid' && h.shake >= readT + proveT) { m.finish(i); return; }
      } else h.shake = Math.max(0, h.shake - dt * 0.5);
      s.prog = s.done ? 1 : clamp(h.reading === 'solid' ? 0.5 + (h.shake - readT) / proveT * 0.45 : h.n / 5 * 0.4, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const h = m.h[i]; if (h.reading === 'rattle') return { at: i, press: f % 4 === 0, swing: 0 }; return { at: i, swing: f % 8 < 4 ? 1.8 : -1.8 }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 4 === 0, swing: 0 });
    m.view = () => ({ need: m.h.map(h => h.need) });
    m.panel = (i) => { const h = m.h[i]; if (!h) return null; return { label: h.reading === 'solid' ? 'SOLID: keep shaking' : h.reading === 'rattle' ? 'RATTLE: click once more' : 'Shake the rack', value: `${h.n} click${h.n === 1 ? '' : 's'}`, bar: h.reading === 'solid' ? clamp((h.shake - readT) / proveT) : clamp(h.shake / readT) }; };
    m.prompt = (i) => { const h = m.h[i]; if (!h) return ''; return h.reading === 'rattle' ? 'It rattles: tap [E] for one more latch click' : h.reading === 'solid' ? 'Solid: keep shaking the rack to prove it' : 'Tap [E] for a click, or swing your view back and forth to shake the rack'; };
    return m;
  },
});
