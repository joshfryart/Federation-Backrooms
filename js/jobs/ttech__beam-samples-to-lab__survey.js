// Transporter tech: beam the survey samples to the lab. The rack holds five sample containers whose labels are made of the same few digits
// (S-108, S-180, S-018 ...). Set them on the outgoing pad in rising label number by pressing each one's rack slot, leave any container with a
// cracked lid on the rack, then energize (Space). Picking out of number order swaps a sample in the lab's study; a cracked lid on the pad
// contaminates the batch; energizing before every sealed sample is aboard sends a short batch.
import { define, machine, DIG, SPACE, shuffle, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Beam samples to lab', type: 'task:survey' },
  title: 'Sample label ordering on the pad', dept: 'operations', host: 'console', tool: 'Sample rack and outgoing pad',
  how: 'Press each rack slot (1-5) in rising label number to set its container on the pad, skip any cracked lid, then Space to energize.',
  keys: ['1-5 set that container on the pad', 'Space energize'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'load by label', input: 'digits+space', win: 'every sealed sample set on the pad in rising label number and the batch energized complete',
    fail: 'loading a sample out of label order, loading a cracked container, or energizing a short batch',
    rule: 'Labels share their digits, so read each one: press the slot holding the lowest remaining number, leave containers marked CRACKED where they are, and press Space when the last sealed one is on the pad.' },
  rush: 'Swept the whole rack onto the pad in one armful and hit energize.',
  captions: { 'out of order': 'error buzz', 'cracked lid': 'hiss', 'short batch': 'pad counter beeps short' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tick = m.calm ? 0.5 : 0.35;
    const dg = shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3), perms = shuffle(r, [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]).slice(0, 5);
    m.rack = perms.map(p => { const s = p.map(i => dg[i]).join(''); return { lab: 'S-' + s, num: +s, cracked: false, on: false }; });
    m.rack[ri(r, 0, 4)].cracked = true; if (r() < 0.3) m.rack[ri(r, 0, 4)].cracked = true;
    m.order = m.rack.filter(c => !c.cracked).sort((a, b) => a.num - b.num); m.got = 0; m.beam = -1; m.count = 0; m.rounds = m.order.length; m.round = 0;
    m.key = (code, down = true) => {
      const d = DIG(code), sp = SPACE(code); if (!(d >= 1 && d <= 5) && !sp) return false; if (m.state !== 'play' || !down || m.beam >= 0) return true;
      if (sp) { if (m.got < m.order.length) { m.fault('short batch'); return true; } m.beam = 0; return true; }
      const c = m.rack[d - 1]; if (c.on) return true;
      if (c.cracked) { m.fault('cracked lid'); return true; } if (c !== m.order[m.got]) { m.fault('out of order'); return true; }
      c.on = true; m.got++; m.round++; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.beam >= 0) { m.beam += dt; m.count = Math.min(m.order.length, Math.floor(m.beam / tick)); if (m.count >= m.order.length) m.win(); } };
    m.hint = () => { if (m.beam >= 0) return []; if (m.got >= m.order.length) return [['Space', true]]; return [['Digit' + (m.rack.indexOf(m.order[m.got]) + 1), true]]; };
    m.bad = () => { if (m.beam >= 0) return null; const wrong = m.rack.findIndex(c => !c.on && c !== m.order[m.got]); return wrong >= 0 ? 'Digit' + (wrong + 1) : 'Space'; };
    m.view = () => ({ rack: m.rack.map(c => [c.lab, c.cracked]) });
    m.buttons = () => [1, 2, 3, 4, 5].map(i => ['Digit' + i, String(i)]).concat([['Space', 'Energize']]);
    m.draw = (c, W, H, P) => {
      txt(c, 'SAMPLE RACK', 16, 18, { size: 10, col: COL.dim });
      m.rack.forEach((s, i) => { const x = 16 + i * 74, y = 26; box(c, x, y, 68, 54, s.on ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.08)', s.cracked ? P.bad : null, 6);
        txt(c, String(i + 1), x + 6, y + 14, { size: 10, col: COL.dim }); if (!s.on) { txt(c, s.lab, x + 34, y + 34, { size: 13, align: 'center' }); if (s.cracked) txt(c, '⚡ CRACKED', x + 34, y + 49, { size: 9, col: P.bad, align: 'center' }); } else txt(c, 'on pad', x + 34, y + 34, { size: 10, col: COL.dim, align: 'center' }); });
      txt(c, 'OUTGOING PAD', 16, 104, { size: 10, col: COL.dim }); txt(c, m.order.slice(0, m.got).map(s => s.lab).join('  ') || '—', 16, 122, { size: 12, col: COL.pale });
      txt(c, m.beam >= 0 ? `ENERGIZING · counter ${m.count} / ${m.order.length}` : `${m.got} / ${m.order.length} sealed samples aboard`, 16, 150, { size: 12, col: m.beam >= 0 ? P.good : COL.ink });
    };
    return m;
  },
});
