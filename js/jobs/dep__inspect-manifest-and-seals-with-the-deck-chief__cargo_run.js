// Deputy security chief, cargo run: inspect the manifest and crate seals with the deck chief. Each crate's seal bead sits somewhere along its
// face; the scanner's signal strength (panel) grows as your view points at it. Hold E with the scanner on the bead and keep it STILL until it
// reads the number: a match beeps, a mismatch is chalked for the chief. Swinging the scanner fast while it reads smears the number and the
// read is lost. When every crate is read, hold E on the manifest board to countersign.
import { define, machine, room, rf, shuffle, ri } from './kit.js';

export default define({
  job: { billet: 'dep', label: 'Inspect manifest and seals with the deck chief', type: 'task:cargo_run' },
  title: 'Crate seal-bead steady scan', dept: 'security', host: 'room', siteName: 'Crate', verb: 'Scan',
  how: 'At each crate turn your view until the signal strength peaks on the seal bead, then hold E and keep the view still while the scanner reads. Countersign the manifest at the end.',
  keys: ['look: find the seal bead', 'E hold, keep still: read it'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'steady scan', input: 'e-hold+look+turn', win: 'every crate seal bead located by signal and read with a still scanner, mismatches chalked, then the manifest countersigned',
    fail: 'sweeping the scanner fast while it is reading so the seal number smears',
    rule: 'The panel signal climbs as the view nears the bead; inside the peak, hold E and do not turn: the read bar fills in under a second. Turning fast while holding is a smeared read.' },
  rush: 'Counted the crates from the doorway and signed the chief\'s sheet.',
  captions: { smeared: 'scanner buzz', match: 'scanner beeps', mismatch: 'chalk scrape' },
  says: { smeared: 'You swept the scanner while it was reading — the number smeared. Hold it still on the bead.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crate stack A', prop: 'crate' }, { name: 'Crate stack B', prop: 'pallet_loaded' }, { name: 'Crate stack C', prop: 'crate' }, { name: 'Manifest board', prop: 'cargo_pad' }]), r = m.rnd;
    const tol = m.calm ? 0.11 : 0.08, still = m.calm ? 0.8 : 0.6, odd = new Set(shuffle(r, [0, 1, 2]).slice(0, ri(r, 0, 1)));
    m.crates = [0, 1, 2].map(i => ({ sx: (r() < 0.5 ? -1 : 1) * rf(r, 0.15, 0.42), num: ri(r, 1000, 9999), bad: odd.has(i), rd: 0, sm: 0 }));
    m.sign = 0; m.lk = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next;
      if (i === 3) { if (inp.hold) { m.sign += dt; if (m.sign >= 0.8) m.finish(3); } s.prog = m.sign / 0.8; return; }
      const c = m.crates[i], look = inp.look || 0, turn = inp.turn || 0; m.lk = look;
      if (inp.hold && turn > 1.4) { c.sm += dt; if (c.sm > 0.25) { m.fault('smeared'); c.sm = 0; c.rd = 0; } } else c.sm = 0;
      if (inp.hold && Math.abs(look - c.sx) < tol && turn < still) { c.rd += dt / 0.7; if (c.rd >= 1) { m.ev(c.bad ? 'mismatch' : 'match', { site: i }); m.finish(i); return; } }
      else if (!inp.hold) c.rd = Math.max(0, c.rd - dt);
      s.prog = 0.9 * c.rd;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 3) return { at: 3, hold: true }; const c = m.crates[i]; return { at: i, hold: true, look: c.sx, turn: 0.2 }; };
    m.bad = (f = 0) => { const i = m.next; return { at: i, hold: true, look: i >= 0 && i < 3 ? m.crates[i].sx : 0, turn: 2.4 }; };
    m.view = () => ({ c: m.crates.map(c => [+c.sx.toFixed(2), c.num, c.bad]) });
    m.panel = (i) => { if (i === 3) return { label: 'Manifest', value: 'countersign', bar: m.sign / 0.8 }; const c = m.crates[i]; if (!c) return null; const sig = Math.max(0, 1 - Math.abs(m.lk - c.sx) / 0.8);
      return { label: c.rd > 0 ? `Reading seal ${c.num}` : 'Seal signal', value: c.rd > 0 ? `${Math.round(c.rd * 100)} %` : (m.lk < c.sx ? 'stronger to the left' : 'stronger to the right'), bar: c.rd > 0 ? c.rd : sig, band: [1 - tol / 0.8, 1] }; };
    m.prompt = (i) => i === 3 ? 'Hold [E] to countersign the manifest' : 'Turn until the signal peaks on the seal bead, then hold [E] and keep still';
    return m;
  },
});
