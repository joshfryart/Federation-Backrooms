// Transporter tech: pre-load the surveyor pads and the lock beacon. Each pad must lock to one named beacon. Dial the pad's channel; after a
// short lag the lock preview resolves and shows whose beacon it found. The beacon table lists every beacon's channel, but one channel is
// shared with a stray beacon: a shared channel resolves to the wrong person, so that beacon must go on its ALT channel. Confirm (Enter) only
// once the preview shows the right ID. Confirming an unresolved preview or the wrong beacon is a fault.
import { define, machine, ARROW, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Pre-load surveyor pads and lock beacon', type: 'task:survey' },
  title: 'Beacon channel lock preview', dept: 'operations', host: 'console', tool: 'Pad lock preview grid',
  how: 'Up/Down dials the selected pad channel; wait for the lock preview to resolve, then Enter if it shows that pad’s beacon ID. Shared channels resolve wrong: use the ALT.',
  keys: ['Up/Down dial channel', 'Left/Right pick pad', 'Enter confirm lock'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'resolve beacon', input: 'arrows+enter', win: 'four survey pads each confirmed only after the preview resolved to their own beacon ID',
    fail: 'confirming before the preview resolves, or on a shared channel that resolves to another person',
    rule: 'Dial a channel, wait about half a second for the preview, read the ID it found. A channel listed twice resolves to the stray: dial that beacon’s ALT channel instead, then press Enter.' },
  rush: 'Dropped the pads on their markers and trusted the default channels.',
  captions: { unresolved: 'preview still searching', 'crossed beacon': 'lock conflict tone', 'rig busy': 'click' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, LAG = m.calm ? 0.8 : 0.55;
    const ids = shuffle(r, ['B-12', 'B-17', 'B-21', 'B-27', 'B-31', 'B-38', 'B-44', 'B-52']).slice(0, 5), ch = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    m.beacons = ids.map((id, i) => ({ id, ch: ch[i], alt: null, stray: i === 4 }));
    const sh = ri(r, 0, 3); m.beacons[4].ch = m.beacons[sh].ch; m.beacons[sh].alt = ch[5];
    m.pads = ['Survey pad 1', 'Survey pad 2', 'Survey pad 3', 'Leader strap'].map((n, i) => ({ n, need: m.beacons[i].id, dial: ch[6 + (i % 3)], since: 9, ok: false }));
    m.sel = 0; m.rounds = 4; m.round = 0;
    const onCh = (c) => m.beacons.filter(b => b.ch === c || b.alt === c && b.alt != null && !m.beacons.some(x => x.ch === c));
    const resolve = (p) => { if (p.since < LAG) return null; const used = m.pads.find(q => q !== p && q.ok && q.dial === p.dial); if (used) return 'IN USE';
      const bs = onCh(p.dial); if (!bs.length) return 'NO BEACON'; return bs.length > 1 ? bs.find(b => b.stray).id : bs[0].id; };
    const target = (p) => { const b = m.beacons.find(x => x.id === p.need); return b.alt ?? b.ch; };
    m.key = (code, down = true) => {
      const a = ARROW(code), en = ENTER(code); if (!a && !en) return false; if (m.state !== 'play' || !down) return true; const p = m.pads[m.sel];
      if (a === 'L' || a === 'R') { m.sel = (m.sel + (a === 'R' ? 1 : 3)) % 4; return true; }
      if (a) { if (p.ok) return true; p.dial = ((p.dial - 1 + (a === 'U' ? 1 : 8)) % 9) + 1; p.since = 0; return true; }
      if (p.ok) return true; const got = resolve(p);
      if (got == null) { m.fault('unresolved'); return true; } if (got !== p.need) { m.fault('crossed beacon'); return true; }
      p.ok = true; m.round++; if (m.pads.every(q => q.ok)) { m.win(); return true; } m.sel = m.pads.findIndex(q => !q.ok); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const p of m.pads) p.since += dt; };
    m.hint = () => { const p = m.pads[m.sel]; if (p.ok) return [['ArrowRight', true]]; const t = target(p); if (p.dial !== t) return [[((t - p.dial + 9) % 9) <= 4 ? 'ArrowUp' : 'ArrowDown', true]]; return resolve(p) ? [['Enter', true]] : []; };
    m.bad = () => 'Enter';
    m.view = () => ({ b: m.beacons.map(b => [b.id, b.ch, b.alt]) });
    m.buttons = () => [['ArrowUp', 'Ch +'], ['ArrowDown', 'Ch −'], ['ArrowLeft', '◀ Pad'], ['ArrowRight', 'Pad ▶'], ['Enter', 'Confirm']];
    m.draw = (c, W, H, P) => {
      txt(c, 'BEACON TABLE', 16, 18, { size: 10, col: COL.dim });
      m.beacons.forEach((b, i) => { const dup = m.beacons.filter(x => x.ch === b.ch).length > 1; txt(c, `${b.id}  ch ${b.ch}${b.alt ? `  ALT ${b.alt}` : ''}${b.stray ? '  (stray)' : ''}`, 16, 34 + i * 15, { size: 10, col: dup ? COL.warn : COL.ink }); if (dup) txt(c, '⚠ shared', 150, 34 + i * 15, { size: 10, col: COL.warn }); });
      m.pads.forEach((p, i) => { const x = 208 + (i % 2) * 96, y = 12 + Math.floor(i / 2) * 76, sel = i === m.sel; box(c, x, y, 90, 70, p.ok ? 'rgba(79,208,106,.15)' : 'rgba(255,255,255,.05)', sel ? COL.peri : null, 6);
        txt(c, p.n, x + 6, y + 14, { size: 9, col: COL.dim }); txt(c, `needs ${p.need}`, x + 6, y + 28, { size: 10, col: COL.pale }); txt(c, `ch ${p.dial}`, x + 6, y + 46, { size: 13 });
        const g = p.ok ? p.need + ' ✓' : resolve(p) ?? 'searching…'; txt(c, g, x + 6, y + 63, { size: 10, col: p.ok ? P.good : g === p.need ? P.good : g === 'searching…' ? COL.dim : P.bad }); });
    };
    return m;
  },
});
