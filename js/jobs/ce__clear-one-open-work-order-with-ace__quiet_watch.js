// Chief engineer: clear one open work order with ACE (quiet watch). Every step is "aim at the right thing and work it": hold E with your view
// on a target to work it. Take the relay whose code matches the order from the bin; back the panel screws out in the order on the sheet (each
// goes onto the tray, last one on top); pull and seat the relay; touch the red probe to + before the black to −; then refit the screws from
// the top of the tray, each into the hole it came from. A wrong part, a screw out of order, crossed probes or a cross-threaded screw is a fault.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const SPOT4 = [0.36, 0.12, -0.12, -0.36], SPOT3 = [0.3, 0, -0.3];
export default define({
  job: { billet: 'ce', label: 'Clear one open work order with ACE', type: 'task:quiet_watch' },
  title: 'Relay swap by the order sheet', dept: 'engineering', host: 'room', item: 'spanner', siteName: 'Step', verb: 'Work',
  how: 'Aim your view at the part the sheet names and hold E to work it: the relay with the order\'s code, the screws in the sheet\'s order, red probe on + then black on −, and each screw back into its own hole from the top of the tray.',
  keys: ['look: aim at the part', 'E hold: work it'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'aim and work', input: 'e-hold+look', win: 'the coded relay fetched, the panel opened in sheet order, the new relay continuity-tested with the probes the right way round, and every screw refitted to its own hole',
    fail: 'taking the wrong part code, backing out a screw out of order, touching the black probe first for a false pass, or driving a tray screw into the wrong hole',
    rule: 'Several targets sit side by side at each step; the one under your view is named on the panel next to the one the sheet wants. Hold E on the wanted one until it is done; working any other is a fault. The tray is last-out, first-in.' },
  rush: 'Swapped the relay, skipped the meter and signed the order.',
  captions: { 'wrong part': 'bin clatters', 'out of order': 'spanner slips', 'crossed probes': 'meter reads a false pass', 'cross-threaded': 'thread grinds' },
  says: { 'wrong part': 'Wrong code — check the relay code against the order.', 'out of order': 'Out of order — the sheet gives the screw sequence.', 'crossed probes': 'Black probe first gives a false pass. Red on + first.', 'cross-threaded': 'That screw came out of a different hole — the top of the tray goes back where it came from.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Parts bin', prop: 'shelving' }, { name: 'Access panel', prop: 'workbench' }, { name: 'Relay terminals', prop: 'relayrack' }, { name: 'Panel refit', prop: 'workbench' }]), r = m.rnd;
    const win = m.calm ? 0.16 : 0.12, work = m.calm ? 0.55 : 0.7, code = 'RL-' + ri(r, 100, 899);
    const codes = shuffle(r, [code, code.slice(0, 4) + ((+code[4] + 1) % 10) + code.slice(5), code.slice(0, 5) + ((+code[5] + 3) % 10) + code.slice(6)]);
    m.order = shuffle(r, [1, 2, 3, 4]); m.tray = []; m.k = 0; m.acc = 0; m.on = null;
    m.tgts = (i) => i === 0 ? codes.map((c, k) => ({ id: c, at: SPOT3[k] })) : i === 2 ? [{ id: '+', at: 0.3 }, { id: 'relay', at: 0 }, { id: '−', at: -0.3 }]
      : i === 1 ? (m.k < 4 ? [1, 2, 3, 4].map((h, k) => ({ id: 'screw ' + h, at: SPOT4[k] })) : [{ id: 'relay', at: 0 }]) : [1, 2, 3, 4].map((h, k) => ({ id: 'hole ' + h, at: SPOT4[k] }));
    m.want = (i) => i === 0 ? code : i === 1 ? (m.k < 4 ? 'screw ' + m.order[m.k] : 'relay') : i === 2 ? (m.k === 0 ? '+' : '−') : 'hole ' + m.tray[m.tray.length - 1];
    const FAULT = ['wrong part', 'out of order', 'crossed probes', 'cross-threaded'];
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const st = m.cur(inp); if (!st) return; const i = m.next, L = inp.look || 0;
      const t = m.tgts(i).find(x => Math.abs(x.at - L) <= win) || null; m.on = t ? t.id : null;
      if (!inp.hold || !t) { m.acc = 0; return; }
      m.acc += dt; if (m.acc < work) return; m.acc = 0;
      if (t.id !== m.want(i)) { m.fault(FAULT[i]); if (i === 2) m.k = 0; return; }
      if (i === 0) m.finish(i);
      else if (i === 1) { if (m.k < 4) { m.tray.push(m.order[m.k]); m.k++; } else { m.k = 0; m.finish(i); } }
      else if (i === 2) { if (m.k === 0) m.k = 1; else { m.k = 0; m.finish(i); } }
      else { m.tray.pop(); if (!m.tray.length) m.finish(i); }
      if (!st.done) st.prog = clamp(i === 1 ? m.k / 5 : i === 3 ? 1 - m.tray.length / 4 : i === 2 ? m.k / 2 : 0, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const w = m.want(i), t = m.tgts(i).find(x => x.id === w); return { at: i, hold: true, look: t.at }; };
    m.bad = () => ({ at: m.next, hold: true, look: m.tgts(m.next).find(x => x.id !== m.want(m.next)).at });
    m.view = () => ({ codes, order: m.order });
    m.panel = (i) => (i < 0 || i > 3) ? null : { label: `Sheet: ${m.want(i)}`, value: `under view: ${m.on || '—'}`, bar: m.acc / work };
    m.prompt = (i) => i === 0 ? `Aim at relay ${code} and hold [E] to take it` : i === 1 ? (m.k < 4 ? 'Hold [E] on the screw the sheet names next' : 'Hold [E] on the socket to pull the old relay and seat the new') : i === 2 ? (m.k === 0 ? 'Red probe first: hold [E] on the + terminal' : 'Now black: hold [E] on the − terminal') : i === 3 ? 'Top of the tray goes back into its own hole: aim and hold [E]' : '';
    return m;
  },
});
