// CMO: drug audit and requisition (quiet watch). Work along each shelf reading the expiry stamped on every vial: bag the ones past today's
// date in hazard tape (← → select, Space bag). Then key the reorder in boxes (digit): par level minus the in-date count left on the shelf,
// rounded UP to whole boxes. Enter files the line; expired stock left on the shelf or a wrong box count sends it back.
import { define, machine, ARROW, DIG, SPACE, ENTER, ri, pick, txt, box, COL } from './kit.js';

const LINES = ['Hyronalin hypos', 'Tri-ox ampoules', 'Kelotane cassettes', 'Dexalin hypos', 'Anetrizine ampoules', 'Corophizine hypos'];
export default define({
  job: { billet: 'cmo', label: 'Drug audit and requisition', type: 'task:quiet_watch' },
  title: 'Expiry pull and par reorder', dept: 'medical', host: 'console', tool: 'Drug cabinet and requisition slip',
  how: 'Select each vial (← →) and bag any past today\'s date (Space); then key the reorder in whole boxes (1 – 9) as par minus what is left, rounded up, and file it (Enter).',
  keys: ['← → select vial', 'Space bag expired', '1 – 9 boxes', 'Enter file line'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'pull and reorder', input: 'arrows+space+digits+enter', win: 'three shelves cleared of out-of-date vials and each reorder filed as whole boxes covering par minus in-date stock',
    fail: 'bagging an in-date vial, filing with expired stock still shelved, or ordering the wrong number of boxes',
    rule: 'Compare each vial\'s expiry with today; bag only the past ones. The reorder is par minus the in-date vials left, divided by the box size and rounded up. Digit sets boxes, Enter files.' },
  rush: 'Ordered a box of everything and left the old stock where it stood.',
  captions: { 'binned good stock': 'hazard bag rustles', 'expired left shelved': 'slip returned', 'wrong quantity': 'slip returned' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, today = ri(r, 180, 300);
    const names = []; while (names.length < 3) { const n = pick(r, LINES); if (!names.includes(n)) names.push(n); }
    m.lines = names.map(name => {
      const n = ri(r, 5, 8), vials = Array.from({ length: n }, () => ({ exp: r() < 0.3 ? today - ri(r, 2, 40) : today + ri(r, 1, 90), bagged: false }));
      if (!vials.some(v => v.exp < today)) vials[ri(r, 0, n - 1)].exp = today - ri(r, 1, 20);
      const boxSz = pick(r, [4, 5, 6, 10]), good = vials.filter(v => v.exp >= today).length, par = good + ri(r, 3, Math.min(8 * boxSz, 26));
      return { name, vials, boxSz, par, need: Math.ceil((par - good) / boxSz), order: 0, done: false };
    });
    m.today = today; m.k = 0; m.sel = 0; m.rounds = 3; m.round = 0; m.flash = '';
    const L = () => m.lines[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code), l = L();
      if (!(a === 'L' || a === 'R' || d || SPACE(code) || ENTER(code))) return false; if (!down) return true;
      if (a) { const left = l.vials.map((v, q) => q).filter(q => !l.vials[q].bagged); const p = left.indexOf(m.sel); m.sel = left[Math.max(0, Math.min(left.length - 1, (p < 0 ? 0 : p) + (a === 'R' ? 1 : -1)))]; return true; }
      if (SPACE(code)) { const v = l.vials[m.sel]; if (!v || v.bagged) return true; if (v.exp >= m.today) { m.fault('binned good stock'); m.flash = 'that vial was still in date'; } else m.flash = 'bagged for disposal'; v.bagged = true; m.sel = l.vials.findIndex(x => !x.bagged); return true; }
      if (d) { l.order = d; return true; }
      if (l.vials.some(v => !v.bagged && v.exp < m.today)) { m.fault('expired left shelved'); m.flash = 'expired stock is still on the shelf'; return true; }
      const good = l.vials.filter(v => !v.bagged).length, need = Math.ceil((l.par - good) / l.boxSz);
      if (l.order !== need) { m.fault('wrong quantity'); m.flash = `${l.order} boxes does not cover par`; return true; }
      l.done = true; m.round++; m.flash = 'line filed'; m.sel = 0; if (++m.k >= 3) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const l = L(); if (!l) return []; const ex = l.vials.findIndex(v => !v.bagged && v.exp < m.today);
      if (ex >= 0) { if (m.sel === ex) return [['Space', true]]; return [[ex > m.sel ? 'ArrowRight' : 'ArrowLeft', true]]; }
      const need = Math.ceil((l.par - l.vials.filter(v => !v.bagged).length) / l.boxSz); return l.order !== need ? [['Digit' + need, true]] : [['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ today: m.today, l: m.lines.map(l => [l.par, l.boxSz, l.vials.map(v => v.exp)]) });
    m.buttons = () => [['ArrowLeft', '←'], ['ArrowRight', '→'], ['Space', 'Bag'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ['Digit' + n, String(n)]), ['Enter', 'File']];
    m.draw = (c, W, H, P) => {
      const l = L() || m.lines[2]; txt(c, l.name, 12, 18, { size: 14, col: COL.gold }); txt(c, `today: day ${m.today}`, 388, 18, { size: 12, align: 'right', col: COL.pale });
      l.vials.forEach((v, q) => { const x = 12 + q * 47; if (v.bagged) { txt(c, '✕ bagged', x + 20, 58, { size: 9, align: 'center', col: COL.dim }); return; }
        box(c, x, 30, 40, 44, COL.panel, q === m.sel ? COL.gold : 'rgba(255,255,255,.18)'); txt(c, 'exp', x + 20, 46, { size: 9, align: 'center', col: COL.dim });
        txt(c, String(v.exp), x + 20, 64, { size: 13, align: 'center' }); if (q === m.sel) txt(c, '▲', x + 20, 86, { size: 11, align: 'center', col: COL.gold }); });
      const left = l.vials.filter(v => !v.bagged).length;
      txt(c, `par ${l.par} · on shelf ${left} · box of ${l.boxSz}`, 12, 112, { size: 13, col: COL.ink });
      box(c, 250, 96, 138, 28, COL.panel, COL.peri); txt(c, `order: ${l.order || '–'} box${l.order === 1 ? '' : 'es'}`, 319, 115, { size: 13, align: 'center', col: COL.lav });
      txt(c, `lines filed ${m.lines.filter(x => x.done).length} / 3`, 12, 150, { size: 11, col: COL.dim }); txt(c, m.flash, 388, 150, { size: 11, align: 'right', col: COL.warn });
    };
    return m;
  },
});
