// Comms officer: align the subspace transceiver. Put the trim wrench on each array trim screw and turn it one click at a time: face a little
// left of the screw and tap E to back it off, a little right and tap E to drive it in. The carrier needle follows each click slowly, so click,
// wait, read. Go too far past the peak and the link loses lock (the trim is reset). At the highest steady reading face the screw square and
// hold E to lock the margin; locking anywhere but the peak logs a weak link.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'comms', label: 'Align the subspace transceiver', type: 'loop' },
  title: 'Array trim click-to-peak', dept: 'operations', host: 'room', siteName: 'Trim', verb: 'Trim', item: 'hydrospanner',
  how: 'Tap E with the view a little left or right of a trim screw to turn it one click each way, wait for the lagging carrier needle, and hold E square-on at the peak to lock it.',
  keys: ['look left + E tap: back off', 'look right + E tap: drive in', 'E hold square-on: lock'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'click to peak', input: 'e-tap+e-hold+look', win: 'every array trim screw clicked onto the carrier peak and its margin locked there',
    fail: 'clicking far past the peak so the link drops lock, or locking the margin off the peak',
    rule: 'Aim left or right of the screw and tap E for one click that way; the carrier needle lags each click. When a click lowers it, come back one and hold E square-on to lock.' },
  rush: 'Cranked each trim screw until the lamp came on and called it aligned.',
  captions: { 'lost lock': 'carrier tone drops out', 'off peak': 'weak-link chirp', click: 'wrench click' },
  says: { 'lost lock': 'Too far past the peak — the link dropped lock and the trim is reset. Small clicks, and watch the needle.', 'off peak': 'Locked below the peak. Find the highest steady reading first.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Array trim 1', prop: 'relayrack' }, { name: 'Array trim 2', prop: 'servers' }, { name: 'Array trim 3', prop: 'commsstation' }]), r = m.rnd;
    const lose = m.calm ? 6 : 5, lockT = m.calm ? 0.8 : 1.0, tol = 0.03;
    m.trims = m.sites.map(() => { const p0 = (r() < 0.5 ? -1 : 1) * ri(r, 2, 4); return { p0, p: p0, w: rf(r, 4.5, 6), pk: rf(r, 0.7, 0.95), needle: 0, lock: 0, tau: rf(r, 0.3, 0.45) }; });
    const carrier = (k) => clamp(k.pk * (1 - (k.p / k.w) ** 2 * 0.9), 0.05, 1);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); const i = m.next, k = m.trims[i];
      if (k) k.needle += (carrier(k) - k.needle) * (1 - Math.exp(-dt / k.tau));
      if (!s) return; const lk = inp.look || 0;
      if (inp.press && Math.abs(lk) > 0.15) { k.p += lk > 0 ? -1 : 1; k.lock = 0; m.ev('click', { site: i, p: k.p });
        if (Math.abs(k.p) > lose) { m.fault('lost lock'); k.p = k.p0; k.needle = 0; } }
      if (inp.hold && Math.abs(lk) <= 0.15) { k.lock += dt; if (k.lock >= lockT) { if (k.p === 0) { m.finish(i); return; } m.fault('off peak'); k.lock = 0; k.p = k.p0; } } else if (!inp.hold) k.lock = 0;
      s.prog = clamp(k.needle * 0.8 + 0.2 * k.lock / lockT, 0, 0.95);
    };
    const settled = (k) => Math.abs(k.needle - carrier(k)) < tol;
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.trims[i]; if (k.p === 0) return settled(k) || k.lock > 0 ? { at: i, hold: true, look: 0 } : { at: i, look: 0 };
      const tap = f % 10 === 0; return { at: i, look: k.p < 0 ? -0.3 : 0.3, hold: tap, press: tap }; };
    m.bad = (f = 0) => ({ at: m.next, look: -0.3, hold: f % 4 === 0, press: f % 4 === 0 });
    m.view = () => ({ t: m.trims.map(k => [k.p0, +k.w.toFixed(2)]) });
    m.panel = (i) => { const k = m.trims[i]; return k ? { label: k.lock > 0 ? 'Locking' : 'Carrier', value: `${Math.round(k.needle * 100)} %${settled(k) ? ' · steady' : ' · moving'}`, bar: k.needle } : null; };
    m.prompt = (i) => { const k = m.trims[i]; return !k ? '' : k.lock > 0 ? 'Keep holding [E] square-on to lock the margin' : 'Look left or right of the screw and tap [E] to click it; hold [E] square-on at the peak'; };
    return m;
  },
});
