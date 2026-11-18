// Transporter chief: pattern buffer and biofilter check. Pull each biofilter cartridge and hold it up to the light: the mesh is five cells
// across, and the clogged ones show dark. Aim the brush at a dark cell (turn your view along the mesh) and tap E to brush it; each tap
// clears one layer of clog. Brushing a cell that already passes light tears the mesh. The cartridge reseats once light passes evenly.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const POS = [-0.4, -0.2, 0, 0.2, 0.4];
export default define({
  job: { billet: 'tchief', label: 'Pattern buffer and biofilter check', type: 'loop' },
  title: 'Biofilter mesh against the light', dept: 'operations', host: 'room', siteName: 'Cartridge', verb: 'Brush',
  how: 'Hold each biofilter cartridge to the light and look along the mesh. Aim at a dark cell and tap E to brush one layer off it; leave cells that already pass light alone.',
  keys: ['look along the mesh: aim', 'E tap: brush one layer'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'brush the mesh', input: 'e-tap+look', win: 'both biofilter cartridges letting light through every mesh cell evenly with no clean cell brushed',
    fail: 'brushing a mesh cell that already passes light so the fine mesh tears',
    rule: 'The panel shows the five mesh cells, dark ones with their clog depth. Look along the mesh to aim the brush at a cell; each E tap lifts one layer. Tapping a clear cell tears it.' },
  rush: 'Blew through the cartridge once and slotted it back.',
  captions: { torn: 'mesh rips' }, says: { torn: 'That cell already passed light: brushing it tore the mesh. Brush only the dark cells.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Biofilter cartridge A', prop: 'buffertank' }, { name: 'Biofilter cartridge B', prop: 'buffertank' }]), r = m.rnd, aim = m.calm ? 0.09 : 0.07;
    m.carts = m.sites.map(() => { const order = shuffle(r, [0, 1, 2, 3, 4]), n = ri(r, 2, 4), clog = [0, 0, 0, 0, 0]; order.slice(0, n).forEach(k => { clog[k] = ri(r, 1, 3); }); return { clog, aimed: -1 }; });
    const cellAt = (look) => { const k = POS.findIndex(p => Math.abs((look || 0) - p) < aim); return k; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, c = m.carts[i];
      c.aimed = cellAt(inp.look);
      if (inp.press && c.aimed >= 0) {
        if (c.clog[c.aimed] > 0) { c.clog[c.aimed]--; m.ev('brush', { cell: c.aimed }); }
        else m.fault('torn');
      }
      const left = c.clog.reduce((a, b) => a + b, 0); if (!left) { m.finish(i); return; }
      s.prog = clamp(1 - left / 9, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.carts[i], k = c.clog.findIndex(v => v > 0); return { at: i, look: POS[k], press: c.aimed === k && f % 5 === 0 }; };
    m.bad = (f = 0) => { const i = m.next, c = m.carts[i], k = c.clog.findIndex(v => v === 0); return { at: i, look: POS[k], press: f % 5 === 0 }; };
    m.view = () => ({ carts: m.carts.map(c => c.clog.slice()) });
    m.panel = (i) => {
      const c = m.carts[i]; if (!c) return null; const cells = c.clog.map((v, k) => (k === c.aimed ? '[' : ' ') + (v ? '▮'.repeat(v) : '·') + (k === c.aimed ? ']' : ' ')).join('');
      return { label: 'Mesh to the light (▮ = clog layer, · = clear)', value: cells, bar: clamp(1 - c.clog.reduce((a, b) => a + b, 0) / 9) };
    };
    m.prompt = (i) => { const c = m.carts[i]; if (!c) return ''; return c.aimed < 0 ? 'Look along the mesh to put the brush on a cell' : c.clog[c.aimed] ? 'Dark cell: tap [E] to brush a layer off' : 'This cell passes light: leave it, aim at a dark one'; };
    return m;
  },
});
