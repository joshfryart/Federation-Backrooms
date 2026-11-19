// Doctor: medicine and supply count. Each sterile pack comes off the locker shelf under the seal lamp, showing one face at a time. Turn it with
// Left / Right to look at all four faces: a pinhole or a dent in the seal shows on only one of them. Up lays the pack in the count tray (rows of
// five) for the shelf; Down drops it in the reject bin. A broken seal back on the shelf is the fault that matters; a pack shelved before every
// face was seen is a fault too. Space initials the stores sheet once every pack is through.
import { define, machine, ARROW, SPACE, ri, pick, shuffle, txt, box, lamp, COL } from './kit.js';

const FACES = ['front', 'right edge', 'back', 'left edge'];
export default define({
  job: { billet: 'doc', label: 'Medicine and supply count', type: 'loop' },
  title: 'Seal lamp turn and count tray', dept: 'medical', host: 'console', tool: 'Seal lamp and count tray',
  how: 'Turn each sterile pack under the lamp with Left/Right until all four faces are seen, then Up to the count tray or Down to the reject bin if the seal has a pinhole or dent. Space initials the sheet at the end.',
  keys: ['←/→ turn pack', '↑ count tray', '↓ reject bin', 'Space initial'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'turn and bin', input: 'arrows+space', win: 'every sterile pack turned through all four faces under the seal lamp, broken seals binned, the rest counted in rows of five and the sheet initialled',
    fail: 'shelving a pack with a pinhole or dented seal, or shelving one before all four faces were seen under the lamp',
    rule: 'Left/Right turns the pack one face; the face strip shows which you have seen. Only when all four are ticked: Up = count tray, Down = reject. A flaw shows on one face only.' },
  rush: 'Counted the packs by the box label and put them all back on the shelf.',
  captions: { 'broken shelved': 'pack clatters on the shelf', 'unchecked shelved': 'pack clatters on the shelf', 'sound binned': 'bin lid bangs', 'signed short': 'pen scratches' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = m.calm ? 6 : 7, nb = ri(r, 1, 2), bad = new Set(shuffle(r, [...Array(n).keys()]).slice(0, nb));
    const kind = pick(r, ['regenerator pack', 'burn dressing', 'hypo cassette', 'suture kit']);
    m.packs = [...Array(n).keys()].map(i => ({ lot: 'L' + ri(r, 1000, 9999), bad: bad.has(i), flaw: ri(r, 0, 3), what: pick(r, ['pinhole', 'dent', 'lifted seal edge']), face: 0, seen: [true, false, false, false] }));
    m.i = 0; m.tray = 0; m.bin = 0; m.rounds = n; m.round = 1; let want = 1;
    const cur = () => m.packs[m.i], allSeen = (p) => p.seen.every(Boolean);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), p = cur();
      if (SPACE(code)) { if (p) m.fault('signed short'); else m.win(); return true; }
      if (!a) return false; if (!p) return true;
      if (a === 'L' || a === 'R') { p.face = (p.face + (a === 'R' ? 1 : 3)) % 4; p.seen[p.face] = true; return true; }
      if (a === 'U') { if (p.bad) { m.fault('broken shelved'); if (m.state !== 'play') return true; } else if (!allSeen(p)) { m.fault('unchecked shelved'); return true; } else m.tray++; }
      else { if (!p.bad) { m.fault('sound binned'); return true; } m.bin++; }
      m.i++; m.round = Math.min(n, m.i + 1); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const p = cur(); if (!p) return [['Space', true]]; if (!allSeen(p)) return [['ArrowRight', want = !want]]; return p.bad ? [['ArrowDown', true]] : [['ArrowUp', true]]; };
    m.bad = () => cur() ? 'ArrowUp' : 'Space';
    m.view = () => ({ k: kind, p: m.packs.map(p => [p.bad, p.flaw]) });
    m.buttons = () => [['ArrowLeft', '◀ Turn'], ['ArrowRight', 'Turn ▶'], ['ArrowUp', '▲ Tray'], ['ArrowDown', '▼ Reject'], ['Space', 'Initial']];
    m.draw = (c, W, H, P) => {
      const p = cur(); txt(c, `${kind}s · pack ${Math.min(m.i + 1, n)}/${n}`, 16, 22, { size: 13, col: COL.gold });
      if (p) { const flawHere = p.bad && p.face === p.flaw; box(c, 30, 40, 130, 80, 'rgba(255,250,230,.14)', flawHere ? P.bad : COL.peri);
        txt(c, FACES[p.face], 95, 60, { size: 12, align: 'center', col: COL.dim }); txt(c, `lot ${p.lot}`, 95, 80, { size: 12, align: 'center' });
        if (flawHere) { lamp(c, 95, 102, 8, P.bad, 'triangle'); txt(c, p.what.toUpperCase(), 95, 136, { size: 11, align: 'center', col: P.bad }); } else txt(c, 'seal intact', 95, 106, { size: 11, align: 'center', col: COL.dim });
        FACES.forEach((f, k) => { box(c, 30 + k * 33, 142, 29, 14, p.seen[k] ? 'rgba(125,151,232,.5)' : 'rgba(255,255,255,.06)', k === p.face ? COL.ink : null, 3); if (p.seen[k]) txt(c, '✓', 40 + k * 33, 153, { size: 10 }); }); }
      else txt(c, 'All packs through. Space to initial the sheet.', 30, 80, { size: 12, col: COL.pale });
      txt(c, 'count tray', 200, 40, { size: 11, col: COL.dim });
      for (let k = 0; k < m.tray; k++) box(c, 200 + (k % 5) * 30, 48 + Math.floor(k / 5) * 24, 24, 18, COL.gold, null, 3);
      txt(c, `tray ${m.tray} · reject bin ${m.bin}`, 200, 130, { size: 12, col: COL.pale });
    };
    return m;
  },
});
