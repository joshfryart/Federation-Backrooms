// Transporter tech: coil wear check and swap. At each coil the micrometer settles on the wire diameter; the panel shows the settled reading
// next to the wear limit stamped on the coil ring. Readings cluster right at the limit, so read every digit. Turn your view to the keep rack
// (left) for a coil still above the limit or to the swap tray (right) for one at or under it, and tap E to put it there. Committing before
// the micrometer settles, or binning a coil on the wrong side, is a fault.
import { define, machine, room, rf, pick } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Coil wear check and swap', type: 'loop' },
  title: 'Coil micrometer keep-or-swap', dept: 'operations', host: 'room', item: 'tricorder_eng', siteName: 'Coil', verb: 'Gauge',
  how: 'Let the micrometer settle, compare the wire reading with the stamped limit, then look left to the keep rack or right to the swap tray and tap E.',
  keys: ['look left: keep rack', 'look right: swap tray', 'E tap: put the coil there'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'keep or swap', input: 'look+e-tap', win: 'every coil put on the keep rack or swap tray by its settled micrometer reading against the stamped limit',
    fail: 'keeping a coil at or under its wear limit, swapping a good one, or committing before the reading settles',
    rule: 'Wait for the reading to settle. Above the stamped limit: look left (keep) and tap E. At or below it: look right (swap) and tap E. The two often differ only in the last digit.' },
  rush: 'Eyeballed the coils, left them all in and called the pad good.',
  captions: { 'kept a worn coil': 'warning chirp', 'swapped a good coil': 'error buzz', unread: 'micrometer still ticking' },
  says: { 'kept a worn coil': 'That coil is at or under the stamped limit: it goes in the swap tray.', 'swapped a good coil': 'That one is still above the limit: keep it.', unread: 'The micrometer had not settled. Wait for the reading to steady.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Coil in the fixture', prop: 'workbench' }, { name: 'Pad two coil', prop: 'pad' }, { name: 'Pedestal coil', prop: 'beampedestal' }]), r = m.rnd;
    const settleT = m.calm ? 1.4 : 1.0, aim = 0.3;
    let worn = m.sites.map(() => r() < 0.5); if (worn.every(Boolean) || !worn.some(Boolean)) worn[Math.floor(r() * 3)] = !worn[0];
    m.coils = m.sites.map((_, i) => { const lim = pick(r, [1.82, 1.85, 1.88, 1.9, 1.94]), d = [1, 2, 3, 4][Math.floor(r() * 4)] * 0.01; return { lim, read: +(worn[i] ? lim - d + (r() < 0.3 ? d : 0) : lim + d).toFixed(2), settle: 0 }; });
    m.coils.forEach(c => { c.worn = c.read <= c.lim; });
    const side = (look) => look > aim ? 'keep' : look < -aim ? 'swap' : null;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, c = m.coils[i];
      c.settle += dt; s.prog = Math.min(0.5, c.settle / settleT * 0.5);
      if (!inp.press) return; const where = side(inp.look || 0); if (!where) return;
      if (c.settle < settleT) { m.fault('unread'); return; }
      if (where === 'keep' && c.worn) m.fault('kept a worn coil'); else if (where === 'swap' && !c.worn) m.fault('swapped a good coil');
      if (m.state === 'play') m.finish(i);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.coils[i], ok = c.settle >= settleT; return { at: i, look: c.worn ? -0.45 : 0.45, press: ok && f % 4 === 0 }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.coils[i]; return { at: i, look: c.worn ? 0.45 : -0.45, press: c.settle >= settleT && f % 4 === 0 }; };
    m.view = () => ({ coils: m.coils.map(c => [c.lim, c.read]) });
    m.panel = (i) => { const c = m.coils[i]; if (!c) return null; const ok = c.settle >= settleT, jit = ok ? 0 : Math.sin(c.settle * 40) * 0.03;
      return { label: `Wire ${ok ? c.read.toFixed(2) : (c.read + jit).toFixed(2)} mm · limit ${c.lim.toFixed(2)} mm`, value: ok ? 'settled' : 'settling…', bar: Math.min(1, c.settle / settleT) }; };
    m.prompt = (i) => { const c = m.coils[i]; return !c ? '' : c.settle < 1e-9 || c.settle < settleT ? 'Hold still while the micrometer settles on the wire' : 'Look left to the keep rack or right to the swap tray, then tap [E]'; };
    return m;
  },
});
