// Nurse: prep the radiation and sensor-exposure screening kit. Hold each dosimeter badge up to the test source (face it and hold E): a live badge
// ticks up four times, then let go. A dead badge never ticks: after a moment of holding it on the source, let go and replace it.
import { define, machine, room, ri, rf, clamp, shuffle } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Prep radiation and sensor-exposure screening kit', type: 'task:survey' },
  title: 'Dosimeter badge to source', dept: 'medical', host: 'room', siteName: 'Badge', verb: 'Test',
  how: 'Face the test source and hold E: a working badge ticks four times, then let go. A dead badge never ticks; let go after about 1.3 s and swap it.',
  keys: ['E hold: badge on source', 'aim at the source'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'badge to source', input: 'e-hold+look', win: 'four badges each held aimed at the test source until it ticks four times or shown dead and replaced',
    fail: 'letting go of a live badge before its fourth tick, or holding a dead badge on the source past its stall time',
    rule: 'Aim at the source (the panel says which way) and hold E. Ticks rise while aimed. No tick after 1.3 s means dead: release. Release only after four ticks otherwise.' },
  rush: 'Laid the badges on the tray without testing them against the source.',
  captions: { 'not read': 'dosimeter dud tone', stalled: 'source relay buzz' }, says: { 'not read': 'You let go before the badge finished: dead or not, it was never read.', stalled: 'That badge is dead. You held it on the source too long.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Badge A', prop: 'locker' }, { name: 'Badge B', prop: 'shelving' }, { name: 'Badge C', prop: 'locker' }, { name: 'Badge D', prop: 'console' }]), r = m.rnd, win = m.calm ? 0.25 : 0.17, gap = m.calm ? 0.35 : 0.25;
    const dead = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.bd = m.sites.map((_, i) => ({ src: rf(r, -0.35, 0.35), dead: dead.has(i), ticks: 0, aim: 0, c: 0, held: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const rel = m.released(inp), s = m.cur(inp); if (!s) return; const b = m.bd[m.next], aimed = Math.abs((inp.look || 0) - b.src) < win, i = m.next;
      if (inp.hold) { b.held += dt; if (aimed) { b.aim += dt; if (!b.dead) { b.c += dt; if (b.c >= gap && b.ticks < 4) { b.c = 0; b.ticks++; } } else if (b.aim > 2.2) { m.fault('stalled'); b.aim = 0; b.held = 0; } } }
      if (rel) { if ((b.dead && b.aim >= 1.3) || (!b.dead && b.ticks >= 4)) { m.finish(i); return; } if (b.held > 0.2) m.fault('not read'); b.ticks = 0; b.aim = 0; b.c = 0; b.held = 0; }
      s.prog = b.dead ? clamp(b.aim / 1.3) * 0.9 : b.ticks / 4 * 0.95;
    };
    m.hint = () => { const b = m.bd[m.next]; if (!b) return { at: -1 }; return { at: m.next, look: b.src, hold: b.dead ? b.aim < 1.35 : b.ticks < 4 }; };
    m.bad = () => ({ at: m.next, look: m.bd[m.next].src, hold: m.t % 1.2 < 0.5 });
    m.view = () => ({ bd: m.bd.map(b => [+b.src.toFixed(2), b.dead]) });
    m.panel = (i) => { const b = m.bd[i]; return b ? { label: b.dead && b.aim >= 1.3 ? 'NO READ' : 'Ticks', value: `${b.ticks}/4  source ${b.src < -0.05 ? 'right' : b.src > 0.05 ? 'left' : 'ahead'}`, bar: b.dead ? clamp(b.aim / 1.3) : b.ticks / 4 } : null; };
    m.prompt = (i) => { const b = m.bd[i]; return b && b.dead && b.aim >= 1.3 ? 'No reading: let go of [E] and replace the badge' : 'Aim at the source and hold [E] until the badge has ticked four times'; };
    return m;
  },
});
