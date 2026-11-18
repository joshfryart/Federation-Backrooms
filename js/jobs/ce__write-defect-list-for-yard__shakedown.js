// Chief engineer: write the defect list for the yard (shakedown). The yard form was copied up from the fault log in a hurry, and some tag
// numbers have two neighbouring digits transposed. Row by row, compare the form's tag with the log's digit by digit: put the caret between a
// swapped pair (Left / Right) and press Space to swap them back. Enter accepts the row's tag, then mark the disposition: 1 yard-fix for
// severity 3 or 4, 2 ship-fix for severity 1 or 2. A tag accepted with digits still swapped sends the yard to the wrong part.
import { define, machine, ARROW, SPACE, ENTER, DIG, ri, shuffle, txt, box, COL } from './kit.js';

const SYS = ['EPS conduit', 'Plasma injector', 'Gravity plate', 'Scrubber fan', 'Coolant pump', 'Deflector relay', 'Lift brake', 'Bus coupler', 'Field coil'];
const LOC = ['Deck 3 fwd', 'Engineering', 'Deck 7 aft', 'Cargo bay 2', 'Plant room', 'Deck 5 port'];
export default define({
  job: { billet: 'ce', label: 'Write defect list for yard', type: 'task:shakedown' },
  title: 'Yard form transposition check', dept: 'engineering', host: 'console', tool: 'Fault log and yard defect form',
  how: 'Compare each form tag with the fault log digit by digit. Move the caret with Left / Right and press Space to swap a transposed pair back, Enter to accept the tag, then 1 yard-fix (severity 3 – 4) or 2 ship-fix (severity 1 – 2).',
  keys: ['Left / Right caret', 'Space swap pair', 'Enter accept tag', '1 yard-fix · 2 ship-fix'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'unswap digits', input: 'arrows+space+enter+digits', win: 'every defect row carries the fault log\'s exact tag number and the right yard-fix or ship-fix disposition for its severity',
    fail: 'accepting a tag with two digits still transposed, or marking a severe fault ship-fix (or a minor one yard-fix)',
    rule: 'The caret sits between two digits of the form\'s tag; Space swaps that pair. Fix any pair that is the wrong way round against the log, Enter to accept, then press 1 or 2 by the severity rule shown.' },
  rush: 'Copied the fault log onto the form once and posted it to the yard unchecked.',
  captions: { misnumbered: 'yard query stamp', 'wrong disposition': 'form returned' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 4, sys = shuffle(r, SYS);
    const swapped = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 2, 3)));
    m.rows = Array.from({ length: N }, (_, k) => { let tag; do { tag = String(ri(r, 10000, 99999)); } while (/(.)\1/.test(tag));
      let form = tag; if (swapped.has(k)) { const p = ri(r, 0, 3); form = tag.slice(0, p) + tag[p + 1] + tag[p] + tag.slice(p + 2); }
      return { sys: sys[k], loc: LOC[ri(r, 0, LOC.length - 1)], sev: ri(r, 1, 4), tag, form, ok: false, disp: 0 }; });
    m.k = 0; m.caret = 0; m.rounds = N; m.round = 0;
    const R = () => m.rows[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const row = R(), a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { m.caret = Math.max(0, Math.min(3, m.caret + (a === 'R' ? 1 : -1))); return true; }
      if (SPACE(code)) { if (!row.ok) { const f = row.form, p = m.caret; row.form = f.slice(0, p) + f[p + 1] + f[p] + f.slice(p + 2); } return true; }
      if (ENTER(code)) { if (row.ok) return true; if (row.form !== row.tag) { m.fault('misnumbered'); return true; } row.ok = true; return true; }
      if (d === 1 || d === 2) { if (!row.ok) { m.fault('misnumbered'); return true; } if ((row.sev >= 3) !== (d === 1)) { m.fault('wrong disposition'); return true; }
        row.disp = d; m.k++; m.round = m.k; m.caret = 0; if (m.k >= N) m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const row = R(); if (!row) return [];
      if (row.form !== row.tag) { const p = [...row.form].findIndex((ch, i) => ch !== row.tag[i]); if (m.caret !== p) return [[m.caret < p ? 'ArrowRight' : 'ArrowLeft', true]]; return [['Space', true]]; }
      if (!row.ok) return [['Enter', true]]; return [[row.sev >= 3 ? 'Digit1' : 'Digit2', true]]; };
    m.bad = () => { const row = R(); return row.ok ? (row.sev >= 3 ? 'Digit2' : 'Digit1') : 'Enter'; };
    m.view = () => ({ rows: m.rows.map(x => [x.tag, x.form, x.sev]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Swap'], ['Enter', 'Accept tag'], ['Digit1', '1 Yard'], ['Digit2', '2 Ship']];
    m.draw = (c, W, H, P) => {
      txt(c, 'FAULT LOG', 14, 14, { size: 10, col: COL.peri }); txt(c, 'YARD FORM', 230, 14, { size: 10, col: COL.peri });
      m.rows.forEach((x, k) => { const y = 20 + k * 30, on = k === m.k; box(c, 10, y, W - 20, 26, on ? 'rgba(240,147,58,.14)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 6);
        txt(c, `${x.sys} · ${x.loc}`, 18, y + 11, { size: 9, col: COL.dim }); txt(c, `tag ${x.tag}  sev ${x.sev}`, 18, y + 22, { size: 11, font: 'monospace' });
        txt(c, x.form, 230, y + 19, { size: 14, font: 'monospace', col: x.ok ? P.good : COL.ink });
        if (on && !x.ok) { const cx = 230 + (m.caret + 1) * 8.4; c.fillStyle = COL.warn; c.fillRect(cx - 1, y + 4, 2, 18); }
        txt(c, x.disp ? (x.disp === 1 ? 'YARD' : 'SHIP') + ' ✓' : x.ok ? 'tag ✓' : '', W - 18, y + 19, { size: 10, align: 'right', col: P.good }); });
      txt(c, 'Severity 3–4: 1 yard-fix · severity 1–2: 2 ship-fix', 14, H - 10, { size: 10, col: COL.dim }); };
    return m;
  },
});
