// Lab technician, quiet watch: restock reagents. Hold E to lift each bottle off the shelf. The liquid sloshes whenever the view moves and only
// settles while you hold perfectly still; until it settles the fill line cannot be read. Once it reads: at or over the level mark, let go to
// set it back. Under the mark, keep holding: the fresh bottle from the crate (batch date checked) is swapped in after a short hold. Letting go
// before the level reads, putting a low bottle back, or swapping out a full one are the faults.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'lab', label: 'Restock reagents', type: 'task:quiet_watch' },
  title: 'Still the bottle, read the line', dept: 'sciences', host: 'room', siteName: 'Bottle', verb: 'Check',
  how: 'Hold E to lift the bottle and keep your view still until the slosh settles and the fill line reads. Over the mark: let go. Under the mark: keep holding until the fresh bottle is swapped in.',
  keys: ['E hold: lift the bottle', 'keep the view still to read', 'let go if full / keep holding to swap'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'still and read', input: 'e-hold+turn', win: 'every reagent bottle held still until its fill line read, full ones set back and low ones swapped for fresh stock',
    fail: 'setting a bottle down before the slosh settles, returning a low bottle to the shelf, or swapping out a full one',
    rule: 'Lift with E held. Any view movement keeps the liquid sloshing; hold still and it settles and reads. Release on a full bottle; keep holding a low one about 1.5 s more to swap it.' },
  rush: 'Eyeballed the shelf from the doorway and ticked the sheet.',
  captions: { unread: 'bottle clinks down', 'ran low': 'shelf thud', wasted: 'bottle binned' },
  says: { unread: 'You set it down before the line settled.', 'ran low': 'That bottle was under the mark. Hold on to swap it.', wasted: 'That bottle was full: it went in the bin.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Buffer bottle', prop: 'shelving' }, { name: 'Stain bottle', prop: 'reachin_cooler' }, { name: 'Solvent bottle', prop: 'shelving' }, { name: 'Enzyme bottle', prop: 'drawers' }]), r = m.rnd;
    const swapT = m.calm ? 1.2 : 1.5, calmK = m.calm ? 1.4 : 1, nLow = ri(r, 1, 3);
    const lowSet = new Set(); while (lowSet.size < nLow) lowSet.add(ri(r, 0, 3));
    m.b = m.sites.map((_, i) => ({ mark: rf(r, 0.45, 0.6), low: lowSet.has(i), lvl: 0, slosh: 1, held: 0, readAt: 0 }));
    m.b.forEach(b => { b.lvl = b.low ? b.mark - rf(r, 0.12, 0.3) : b.mark + rf(r, 0.06, 0.3); });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, b = m.b[i];
      if (inp.hold) {
        const tr = inp.turn || 0; b.slosh = tr > 0.15 ? clamp(b.slosh + tr * dt * 2) : clamp(b.slosh - dt * 0.9 * calmK);
        b.held += dt; if (b.slosh < 0.1) { b.readAt += dt; if (b.low && b.readAt >= swapT) { m.ev('swap', { site: i }); m.finish(i); return; } if (!b.low && b.readAt >= swapT + 0.5) { m.fault('wasted'); b.readAt = 0; b.slosh = 1; } } else b.readAt = 0;
      }
      if (rel) {
        if (b.slosh >= 0.1) m.fault('unread'); else if (b.low) m.fault('ran low'); else { m.finish(i); return; }
        b.slosh = 1; b.readAt = 0; b.held = 0;
      }
      s.prog = s.done ? 1 : clamp((1 - b.slosh) * 0.6 + (b.low ? b.readAt / swapT * 0.3 : 0), 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const b = m.b[i]; return { at: i, hold: b.slosh >= 0.1 || b.low, turn: 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 30 < 20, turn: 1 });
    m.view = () => ({ b: m.b.map(b => [b.low, +b.lvl.toFixed(2)]) });
    m.panel = (i) => { const b = m.b[i]; if (!b) return null; const rd = b.slosh < 0.1; return { label: rd ? (b.lvl >= b.mark ? 'Fill OK: let go' : 'LOW: keep holding to swap') : 'Sloshing: hold still', value: rd ? `${Math.round(b.lvl * 100)} % (mark ${Math.round(b.mark * 100)})` : '— %', bar: rd ? b.lvl : 1 - b.slosh, band: rd ? [b.mark, 1] : undefined }; };
    m.prompt = (i) => { const b = m.b[i]; if (!b) return ''; return b.slosh >= 0.1 ? 'Hold [E] to lift the bottle; keep your view still until the line settles' : b.lvl >= b.mark ? 'Over the mark: let go of [E] to set it back' : 'Under the mark: keep holding [E] to swap in a fresh bottle'; };
    return m;
  },
});
