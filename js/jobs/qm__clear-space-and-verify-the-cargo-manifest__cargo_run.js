// Quartermaster: clear the transporter zone and verify crates. Each crate's stencil is legible only while the view is aimed at it. Tap E to
// tick a crate that is on the manifest and clear of the path; hold E to flag one that is unlisted or sitting in the transporter path.
import { define, machine, room, ri, pick, shuffle } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Clear space and verify the cargo manifest', type: 'task:cargo_run' },
  title: 'Tick or flag the stencilled crate', dept: 'services', host: 'room', siteName: 'Crate', verb: 'Verify',
  how: 'Aim at each crate to read its stencil. Tap E to tick it if it is on the manifest and out of the path. Hold E to flag it if it is unlisted or in the transporter path.',
  keys: ['look: read stencil', 'E tap: tick', 'E hold: flag'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'tick or flag', input: 'e-tap+e-hold+look', win: 'four crates read by aiming at the stencil, listed clear ones ticked and unlisted or in-path ones flagged',
    fail: 'ticking an unlisted crate or one in the transporter path, or flagging a listed crate that is clear',
    rule: 'The stencil only reads while you aim at the crate. On the manifest and clear of the path: tap E. Not on the manifest, or marked IN PATH: hold E to flag it.' },
  rush: 'Ticked the whole zone off the manifest without reading a stencil.',
  captions: { 'bad tick': 'stray crate goes out', 'bad flag': 'listed crate held back' }, says: { 'bad tick': 'That crate was unlisted or in the transporter path.', 'bad flag': 'That crate was listed and clear. No flag needed.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [0, 1, 2, 3].map(i => ({ name: `Crate ${i + 1}`, prop: i % 2 ? 'locker' : 'shelving' }))), r = m.rnd;
    m.list = shuffle(r, ['C14', 'K22', 'M07', 'T31', 'R58', 'H40']).slice(0, 4); const kind = shuffle(r, ['ok', 'ok', pick(r, ['unlisted', 'path']), pick(r, ['ok', 'unlisted', 'path'])]);
    m.cr = kind.map((k, i) => ({ k, code: k === 'unlisted' ? 'Z' + ri(r, 10, 99) : m.list[i], off: pick(r, [-0.3, 0, 0.3]), h: 0, lock: false, aim: false }));
    m.li = -1; m.mani = () => m.list.join(' ');
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, c = m.cr[i];
      if (m.li !== i) { m.li = i; c.h = 0; c.lock = false; } c.aim = Math.abs((inp.look || 0) - c.off) < 0.15; const bad = c.k !== 'ok';
      if (inp.hold && !c.lock) { c.h += dt; if (c.h >= 0.7) { c.lock = true; if (bad) m.finish(i); else { m.fault('bad flag'); c.h = 0; } } }
      if (rel) { if (c.lock) c.lock = false; else if (c.h > 0.01 && c.h < 0.3) { if (bad) m.fault('bad tick'); else m.finish(i); } c.h = 0; }
      s.prog = s.done ? 1 : c.h;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cr[i]; return { at: i, look: c.off, hold: c.k === 'ok' ? f % 2 === 0 : true }; };
    m.bad = (f = 0) => { const i = m.next, c = m.cr[i]; return { at: i, look: c.off, hold: c.k === 'ok' ? f % 40 < 24 : f % 2 === 0 }; };
    m.view = () => ({ list: m.list, cr: m.cr.map(c => [c.k, c.code, c.off]) });
    m.panel = (i) => { const c = m.cr[i]; return c ? { label: c.k === 'path' ? 'IN TRANSPORTER PATH' : 'clear of path', value: c.aim ? 'stencil ' + c.code : 'stencil unreadable: aim at it', bar: c.h } : null; };
    m.prompt = () => 'Manifest: ' + m.mani() + '. Tap [E] tick, hold [E] flag';
    return m;
  },
});
