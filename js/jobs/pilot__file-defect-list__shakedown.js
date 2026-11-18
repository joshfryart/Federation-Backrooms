// Pilot: file the defect list. Each note from the walk-throughs and the test flight becomes one form entry, and its severity is set by the
// card's rules, applied top-down: a crack, leak or failure on a flight-critical system (engine, life support, hull seal) GROUNDS the shuttle;
// any other defect on a critical system, or anything found in flight, is FLAGGED; the rest is MINOR. Defects found in flight must carry the
// recorder reference (Space). The form opens on MINOR, which is how a grounded fault ends up filed as minor.
import { define, machine, ri, pick, shuffle, txt, box, COL, ARROW, SPACE, ENTER } from './kit.js';

const CRIT = ['engine', 'life support', 'hull seal'], OTHER = ['nav sensor', 'hull lights', 'canopy wiper', 'cabin heater'];
const BADK = ['crack', 'leak', 'failure'], SOFTK = ['wear', 'noise', 'dim reading', 'slow response'], SEV = ['MINOR', 'FLAGGED', 'GROUNDED'];

export default define({
  job: { billet: 'pilot', label: 'File defect list', type: 'task:shakedown' },
  title: 'Severity by the card, top-down', dept: 'flight', host: 'console', tool: 'Defect form and severity card',
  how: 'For each note, pick the severity with ↑/↓ by the card\'s rules (top rule first), press Space to attach the recorder reference if it was found in flight, then Enter to file.',
  keys: ['↑ ↓ severity', 'Space attach recorder ref', 'Enter file'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'grade by card', input: 'arrows+space+enter',
    win: 'every defect note filed at the severity the card\'s top-down rules give, with recorder references on in-flight defects only',
    fail: 'filing a grounded fault as minor or any other wrong grade, or a flight defect without its recorder reference',
    rule: 'Apply the severity card from the top: critical system with crack, leak or failure is grounded; other critical or in-flight defects are flagged; else minor. Space adds the recorder ref, Enter files.' },
  rush: 'Filed every note as minor to clear the list.',
  captions: { 'grounded filed minor': 'supervisor alert', 'wrong severity': 'form error tone', 'ref missing': 'form error tone', 'stray ref': 'form error tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, ships = shuffle(r, ['Halley', 'Cochrane', 'Galileo', 'Drake']).slice(0, 2);
    const grade = (d) => CRIT.includes(d.sys) && BADK.includes(d.kind) ? 2 : CRIT.includes(d.sys) || d.flight ? 1 : 0;
    for (let tries = 0; tries < 40; tries++) {
      m.notes = Array.from({ length: ri(r, 4, 5) }, () => { const crit = r() < 0.55, d = { ship: pick(r, ships), sys: pick(r, crit ? CRIT : OTHER), kind: pick(r, r() < 0.5 ? BADK : SOFTK), flight: r() < 0.35 };
        if (d.flight) d.ref = `FR-${ri(r, 100, 999)}`; d.sev = grade(d); return d; });
      const g = m.notes.map(d => d.sev); if (g.includes(2) && g.includes(1) && g.includes(0)) break;
    }
    m.k = 0; m.sel = 0; m.ref = false; m.flash = 0; m.msg = ''; m.round = 1; m.rounds = m.notes.length;
    const bad = (why, msg) => { m.fault(why); m.flash = 0.8; m.msg = msg; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), s = SPACE(code), e = ENTER(code); if (a !== 'U' && a !== 'D' && !s && !e) return false; if (!down) return true;
      const d = m.notes[m.k];
      if (a === 'U') m.sel = Math.min(2, m.sel + 1); else if (a === 'D') m.sel = Math.max(0, m.sel - 1);
      else if (s) { if (!d.flight) bad('stray ref', 'NOT AN IN-FLIGHT DEFECT'); else m.ref = true; }
      else if (e) {
        if (d.flight && !m.ref) bad('ref missing', 'RECORDER REF MISSING');
        else if (m.sel !== d.sev) bad(d.sev === 2 && m.sel === 0 ? 'grounded filed minor' : 'wrong severity', 'SEVERITY DOES NOT MATCH CARD');
        else { m.ev('filed', { sev: SEV[d.sev] }); m.k++; m.sel = 0; m.ref = false; if (m.k >= m.notes.length) m.win(); else m.round = m.k + 1; }
      }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); };
    m.hint = () => { const d = m.notes[m.k]; if (!d) return []; const k = m.sel < d.sev ? 'ArrowUp' : m.sel > d.sev ? 'ArrowDown' : d.flight && !m.ref ? 'Space' : 'Enter'; return [[k, true], [k, false]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ notes: m.notes.map(d => [d.ship, d.sys, d.kind, d.flight]) });
    m.buttons = () => [['ArrowUp', '▲ severity'], ['ArrowDown', '▼ severity'], ['Space', 'Attach ref'], ['Enter', 'File']];
    m.draw = (c, W, H, P) => {
      const d = m.notes[m.k] || m.notes[m.notes.length - 1];
      txt(c, `DEFECT NOTE ${Math.min(m.k + 1, m.notes.length)} / ${m.notes.length}`, 12, 18, { size: 11, col: COL.peri });
      box(c, 12, 26, 228, 66, 'rgba(255,255,255,.06)', null, 6);
      txt(c, `Shuttle ${d.ship}`, 22, 44, { size: 12, col: COL.pale }); txt(c, `${d.sys}: ${d.kind}`, 22, 64, { size: 13 });
      txt(c, d.flight ? `found in flight · recorder ${d.ref}` : 'found on walk-through', 22, 84, { size: 10, col: COL.dim });
      SEV.forEach((s, k) => { const x = 12 + k * 78; box(c, x, 102, 72, 24, k === m.sel ? 'rgba(244,194,91,.3)' : 'rgba(255,255,255,.05)', k === m.sel ? COL.gold : null, 5); txt(c, s, x + 36, 119, { size: 10, align: 'center', col: k === m.sel ? COL.ink : COL.dim }); });
      txt(c, m.ref ? `ref ${d.ref} attached` : 'no ref', 12, 146, { size: 10, col: m.ref ? P.good : COL.dim });
      txt(c, 'CARD (top first)', 252, 34, { size: 10, col: COL.peri });
      ['1 Engine / life supp. / hull', '  seal + crack/leak/failure', '  → GROUNDED', '2 Other critical, or found', '  in flight → FLAGGED', '3 Else → MINOR'].forEach((l, k) => txt(c, l, 252, 50 + k * 13, { size: 9, col: COL.pale }));
      if (m.flash > 0) txt(c, m.msg, W - 12, H - 8, { size: 11, col: P.bad, align: 'right' });
    };
    return m;
  },
});
