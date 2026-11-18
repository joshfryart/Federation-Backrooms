// XO: approve the cargo manifest and transfer schedule. Build the transfer order pallet by pallet: always the heaviest pallet still waiting,
// unless moving it now would push the trim readout out of its band, in which case the heaviest one that keeps the trim inside goes first.
// Scheduling a pallet that breaks the trim, or a lighter pallet while a heavier one would have fitted, is a fault.
import { define, machine, DIG, shuffle, ri, pick, txt, box, COL } from './kit.js';

const CODES = ['MED', 'H2O', 'FOD', 'PRT', 'GEN', 'BIO', 'TOL', 'CRY'];
export default define({
  job: { billet: 'xo', label: 'Approve cargo manifest and transfer schedule', type: 'task:cargo_run' },
  title: 'Heaviest-first trim schedule', dept: 'command', host: 'console', tool: 'Cargo console manifest and trim readout',
  how: 'Schedule pallets one at a time: the heaviest still waiting goes next, unless it would push trim out of the band, then the heaviest that keeps trim inside.',
  keys: ['1 – 6 schedule a pallet'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'sequence transfers', input: 'digits', win: 'every pallet put into the transfer order heaviest first with the trim readout inside its band after each move',
    fail: 'scheduling a pallet that tips the trim out of the band, or a lighter pallet while a heavier one still fitted',
    rule: 'Each pallet shows its mass and the trim shift it causes. Press its number to schedule it next: the heaviest that keeps trim inside the band after the shift.' },
  rush: 'Signed the manifest\'s mass line and let the loaders move pallets in whatever order they reached them.',
  captions: { 'trim out': 'trim alarm', 'heavy left late': 'loadmaster objects' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = 6;
    const greedy = (ps, t0) => { let t = t0; const left = ps.slice(); while (left.length) { const ok = left.filter(p => Math.abs(t + p.dt) <= band).sort((a, b) => b.mass - a.mass); if (!ok.length) return false; t += ok[0].dt; left.splice(left.indexOf(ok[0]), 1); } return true; };
    let ps, t0, tries = 0;
    do { const masses = shuffle(r, [4, 5, 6, 7, 8, 9, 10, 11, 12]).slice(0, 5), codes = shuffle(r, CODES);
      ps = masses.map((mass, i) => ({ code: `${codes[i]}-${ri(r, 10, 99)}`, mass, dt: (r() < 0.5 ? -1 : 1) * Math.round(mass * 0.8 * 10) / 10, at: 0 })); t0 = ri(r, -3, 3); tries++;
    } while ((!greedy(ps, t0) || !ps.some((p, i) => Math.abs(t0 + p.dt) > band)) && tries < 60);
    if (!greedy(ps, t0)) { t0 = 0; ps.forEach((p, i) => { p.dt = (i % 2 ? -1 : 1) * Math.min(5, Math.abs(p.dt)); }); }
    m.pal = ps; m.trim = t0; m.trim0 = t0; m.n = 0; m.rounds = 5; m.round = 0;
    const fits = (p) => Math.abs(m.trim + p.dt) <= band, want = () => m.pal.filter(p => !p.at && fits(p)).sort((a, b) => b.mass - a.mass)[0];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (!d || d > m.pal.length) return false; const p = m.pal[d - 1]; if (p.at) return true;
      if (!fits(p)) { m.fault('trim out'); return true; } if (p !== want()) { m.fault('heavy left late'); return true; }
      m.trim = Math.round((m.trim + p.dt) * 10) / 10; p.at = ++m.n; m.round++; if (m.n >= m.pal.length) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const p = want(); return p ? [['Digit' + (m.pal.indexOf(p) + 1), true]] : []; };
    m.bad = () => { const i = m.pal.findIndex(p => !p.at && p !== want()); return i < 0 ? null : 'Digit' + (i + 1); };
    m.view = () => ({ pal: m.pal.map(p => [p.code, p.mass, p.dt]), t0 });
    m.buttons = () => m.pal.map((p, i) => ['Digit' + (i + 1), String(i + 1)]);
    m.draw = (c, W, H, P) => {
      m.pal.forEach((p, i) => { const y = 8 + i * 20; box(c, 8, y, 220, 17, p.at ? 'rgba(79,208,106,.12)' : 'rgba(255,255,255,.05)', null, 6);
        txt(c, `${i + 1}  ${p.code}`, 14, y + 13, { size: 11, col: p.at ? COL.dim : COL.ink }); txt(c, `${p.mass} t`, 120, y + 13, { size: 11, col: COL.gold }); txt(c, `trim ${p.dt > 0 ? '+' : ''}${p.dt}`, 160, y + 13, { size: 10, col: COL.pale });
        if (p.at) txt(c, `#${p.at}`, 222, y + 13, { size: 10, col: P.good, align: 'right' }); });
      const X = 244, w = W - X - 12, cx = X + w / 2, sc = w / 2 / 12; txt(c, 'TRIM', X, 20, { size: 12, col: COL.gold });
      box(c, X, 34, w, 24, 'rgba(255,255,255,.06)', null, 4); c.fillStyle = 'rgba(79,208,106,.2)'; c.fillRect(cx - band * sc, 34, 2 * band * sc, 24); c.strokeStyle = P.good; c.lineWidth = 2; c.strokeRect(cx - band * sc, 34, 2 * band * sc, 24);
      c.fillStyle = '#fff'; c.fillRect(cx + Math.max(-12, Math.min(12, m.trim)) * sc - 2, 28, 4, 36); txt(c, `${m.trim > 0 ? '+' : ''}${m.trim.toFixed(1)}`, cx, 80, { size: 14, align: 'center' });
      txt(c, `band ±${band}`, cx, 96, { size: 10, col: COL.dim, align: 'center' }); txt(c, `${m.n}/${m.pal.length} scheduled`, cx, 120, { size: 11, col: COL.pale, align: 'center' });
      txt(c, 'heaviest first if it keeps trim in band', X, 150, { size: 9, col: COL.dim });
    };
    return m;
  },
});
