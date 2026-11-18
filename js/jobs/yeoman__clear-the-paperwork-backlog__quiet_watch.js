// Yeoman: clear the paperwork backlog on a quiet watch. The backlog tray holds documents with due clocks running. Bring the most overdue one
// to the top, hold Space to actually read its first paragraph, then throw it: sign (→), file (↓) or send back (←). Throwing before you have
// read it is signing blind; an item whose clock runs out goes overdue.
import { define, machine, ARROW, SPACE, rf, shuffle, clamp, txt, box, bar, wrapText, COL } from './kit.js';

const DOCS = [['Leave request, Ens. Tamsin', 'sign', 'Approved by department head; awaits the captain\'s signature.'], ['Fuel requisition 44-B', 'return', 'Quantity field left blank; cannot be processed as written.'],
  ['Starbase bulletin 312', 'file', 'For information only. No action required by the captain.'], ['Commendation, Lt Ruiz', 'sign', 'Citation complete; requires the commanding officer\'s signature.'],
  ['Transfer form, Cpl Ngata', 'return', 'Second page unsigned by the releasing officer. Returned for completion.'], ['Deck 9 maintenance memo', 'file', 'Copy for the captain\'s records only; work already done.'],
  ['Shore leave roster', 'sign', 'Final version; needs the captain\'s signature before posting.'], ['Stores audit draft', 'return', 'Totals do not add up; the quartermaster must correct page two.'],
  ['Sector traffic notice', 'file', 'Notice to all ships for information; no reply required.']];
const BIN = { L: 'return', D: 'file', R: 'sign' }, KEY = { return: 'ArrowLeft', file: 'ArrowDown', sign: 'ArrowRight' };

export default define({
  job: { billet: 'yeoman', label: 'Clear the paperwork backlog', type: 'task:quiet_watch' },
  title: 'Backlog tray: read, then sign file or return', dept: 'command', host: 'console', tool: 'Backlog tray and captain\'s stamp',
  how: 'Bring the most overdue document to the top (↑), hold Space to read its first paragraph, then sign it (→), file it (↓) or send it back (←).',
  keys: ['↑ next document', 'Space hold: read', '→ sign  ↓ file  ← return'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'read then throw', input: 'arrows+space-hold', win: 'six documents each read through and thrown to sign file or return before their due clocks expire',
    fail: 'throwing a document before reading it, putting it in the wrong bin, or letting a due clock run out',
    rule: 'Hold Space on the top document until its paragraph is fully shown (letting go loses your place), then press → to sign, ↓ to file or ← to return; use ↑ to bring the reddest clock to the top first.' },
  rush: 'Stamped the whole pile without reading past the titles.',
  captions: { 'signed blind': 'stamp thuds', 'wrong pile': 'paper rustles', overdue: 'due-date chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 1.5 : 1, need = 0.9;
    const pick6 = shuffle(r, DOCS).slice(0, 6); let at = 0;
    m.docs = pick6.map(([title, verdict, para], i) => { if (i >= 3) at += rf(r, 1.2, 2.2) * k; return { title, verdict, para, at, due: at + rf(r, 7, 11) * k, read: 0, done: false }; });
    m.top = 0; m.cleared = 0; m.rounds = 6; m.round = 0;
    const tray = () => m.docs.filter(d => !d.done && m.t >= d.at), act = () => { const t = tray(); m.top = t.length ? m.top % t.length : 0; return t[m.top] || null; };
    const clear = (d) => { d.done = true; m.cleared++; m.round = m.cleared; m.top = 0; if (m.docs.every(x => x.done) && m.state === 'play') m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (SPACE(code)) { m.held.S = down; if (!down) { const d = act(); if (d && d.read < 1) d.read = 0; } return true; }
      if (!a) return false; if (!down) return true; const d = act(); if (!d) return true;
      if (a === 'U') { d.read = 0; m.top++; return true; }
      if (d.read < 1) { m.fault('signed blind'); return true; }
      if (BIN[a] !== d.verdict) m.fault('wrong pile'); clear(d); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const d = act(); if (d && m.held.S) d.read = clamp(d.read + dt / need);
      for (const x of tray()) if (m.t > x.due) { m.fault('overdue'); clear(x); }
    };
    m.hint = () => {
      const t = tray(), d = act(); if (!d) return m.held.S ? [['Space', false]] : [];
      const urgent = t.reduce((a, b) => (b.due < a.due ? b : a)); if (d !== urgent && d.read === 0) return [['ArrowUp', true]];
      if (d.read < 1) return [['Space', true]]; return [['Space', false], [KEY[d.verdict], true]];
    };
    m.bad = () => (act() ? 'ArrowRight' : null);
    m.view = () => ({ docs: m.docs.map(d => [d.title, +d.due.toFixed(1)]) });
    m.buttons = () => [['ArrowUp', 'Next ▲'], ['Space', 'Read (hold)'], ['ArrowLeft', '◀ Return'], ['ArrowDown', 'File ▼'], ['ArrowRight', 'Sign ▶']];
    m.draw = (c, W, H, P) => {
      const t = tray(), d = act(); txt(c, 'BACKLOG TRAY', 10, 16, { size: 10, col: COL.peri });
      t.forEach((x, i) => { const left = x.due - m.t, y = 24 + i * 22, on = x === d; box(c, 8, y, 150, 19, on ? 'rgba(244,194,91,.2)' : 'rgba(255,255,255,.05)', on ? COL.gold : null, 4);
        txt(c, x.title.slice(0, 18), 13, y + 13, { size: 9 }); txt(c, `${left < 3 ? '▲' : ''}${left.toFixed(0)}s`, 154, y + 13, { size: 9, align: 'right', col: left < 3 ? P.bad : COL.dim }); });
      if (!d) { txt(c, 'tray empty: next items arriving', 170, 60, { size: 11, col: COL.dim }); return; }
      box(c, 168, 10, 224, 116, 'rgba(255,255,255,.07)', COL.lav, 6); txt(c, d.title, 176, 28, { size: 12, col: COL.gold });
      const shown = d.para.slice(0, Math.floor(d.para.length * d.read)); let y = 48; for (const ln of wrapText(shown, 36)) { txt(c, ln, 176, y, { size: 10 }); y += 14; }
      txt(c, d.read >= 1 ? 'read: throw it' : m.held.S ? 'reading…' : 'hold Space to read', 176, 118, { size: 10, col: d.read >= 1 ? P.good : COL.dim }); bar(c, 168, 132, 224, 7, d.read, { col: COL.peri });
      txt(c, `cleared ${m.cleared} / 6`, 10, H - 10, { size: 11, col: COL.pale });
    };
    return m;
  },
});
