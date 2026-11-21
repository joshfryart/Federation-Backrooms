// Cargo: count and verify cargo against the manifest. Each stack has four tag slots across your view. Aim at a slot and tap E to scan it.
// A slot behind a pallet cannot be scanned (BLOCKED). Scan every open slot once, then hold E to walk round to the far side: it either
// reveals the hidden crate (a miscount) or confirms the shortage, and you file the stack.
import { define, machine, room, ri, clamp } from './kit.js';

const POS = [-0.42, -0.14, 0.14, 0.42];
export default define({
  job: { billet: 'cargo', label: 'Count and verify cargo against manifest', type: 'loop' },
  title: 'Scan the row, then walk round', dept: 'services', host: 'room', siteName: 'Stack', verb: 'Count',
  how: 'Aim at each tag slot and tap E to scan it once. A BLOCKED slot cannot be scanned. When every open slot is scanned, hold E to walk round the stack and file it.',
  keys: ['look: aim at a slot', 'E tap: scan', 'E hold: walk round and file'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'scan and circle', input: 'e-tap+e-hold+look',
    win: 'every open tag scanned once against the manifest and each stack walked round and filed',
    fail: 'rescanning a slot, scanning a blocked slot blind, or filing a stack before every open tag is scanned',
    rule: 'Look at a slot and tap E to scan it, once each. Slots behind a pallet read BLOCKED. After the open slots are scanned hold E for a second to walk round and file the stack.' },
  rush: 'Eyeballed the stacks and filed the manifest as read.',
  captions: { rescan: 'scanner double-beep', 'blind scan': 'scanner error', unscanned: 'filing rejected' },
  says: { rescan: 'That tag is already scanned.', 'blind scan': 'The tag is hidden behind a pallet: walk round instead.', unscanned: 'Scan every open tag before you file the stack.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Row 1 stack', prop: 'pallet_loaded' }, { name: 'Row 2 stack', prop: 'crate' }, { name: 'Row 3 stack', prop: 'shelving' }]), r = m.rnd;
    m.stk = m.sites.map(() => ({ blocked: r() < 0.65 ? ri(r, 0, 3) : -1, short: r() < 0.5, got: [0, 0, 0, 0], hold: 0 }));
    const zone = (look) => { let b = -1, d = 0.14; POS.forEach((p, k) => { if (Math.abs(look - p) < d) { d = Math.abs(look - p); b = k; } }); return b; };
    const open = (s) => s.got.filter((g, k) => k !== s.blocked && !g).length;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s0 = m.cur(inp), rel = m.released(inp); if (!s0) return; const i = m.next, s = m.stk[i], z = zone(inp.look || 0);
      if (inp.press && z >= 0) { if (z === s.blocked) m.fault('blind scan'); else if (s.got[z]) m.fault('rescan'); else s.got[z] = 1; }
      if (inp.hold) s.hold += dt; if (!inp.hold) s.hold = 0;
      if (s.hold > 1.0) { if (open(s)) { m.fault('unscanned'); s.hold = 0; } else m.finish(i); }
      s0.prog = s0.done ? 1 : clamp(s.got.filter(Boolean).length / 4 * 0.7 + s.hold * 0.3, 0, 0.95); void rel;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const s = m.stk[i], k = s.got.findIndex((g, j) => !g && j !== s.blocked); return k >= 0 ? { at: i, look: POS[k], press: f % 6 === 0 } : { at: i, look: 0, hold: true }; };
    m.bad = (f = 0) => { const i = m.next, s = m.stk[i]; return { at: i, look: POS[s.blocked >= 0 ? s.blocked : 0], press: f % 6 === 0 }; };
    m.view = () => ({ stk: m.stk.map(s => [s.blocked, s.short]) });
    m.panel = (i) => { const s = m.stk[i]; if (!s) return null; const n = s.got.filter(Boolean).length, tot = s.blocked >= 0 ? 3 : 4; return { label: s.blocked >= 0 ? 'Slot BLOCKED' : 'Slots', value: `${n}/${tot} scanned`, bar: n / tot }; };
    m.prompt = (i) => { const s = m.stk[i]; return !s ? '' : open(s) ? 'Aim at an open tag slot and tap [E] to scan it' : 'All open tags scanned: hold [E] to walk round and file'; };
    return m;
  },
});
