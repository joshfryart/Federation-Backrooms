// Comms officer, cargo run: hail the receiving station and confirm the schedule. You read the docking window from the schedule sheet; the
// station operator reads it back over a noisy line, one figure at a time. Figures lost in static (?) or read back wrong must be asked for
// again by their position (1-8). Only when every figure of the read-back matches the sheet do you write it into the schedule book (Enter).
import { define, machine, DIG, ENTER, ri, shuffle, pick, txt, box, COL } from './kit.js';

const OPS = ['Ops Chief Marren', 'Dockmaster Iyo', 'Lt. Saavik-Tor', 'Controller Brenn'];
const pad = (n) => String(n).padStart(2, '0');

export default define({
  job: { billet: 'comms', label: 'Hail the receiving station and confirm the schedule', type: 'task:cargo_run' },
  title: 'Docking window read-back repair', dept: 'operations', host: 'console', tool: 'Hail channel and schedule sheet',
  how: 'Compare the operator\'s read-back with the schedule sheet figure by figure, ask again (1-8) for any figure lost or wrong, and write it in the book (Enter) only when all eight match.',
  keys: ['1-8 ask for that figure again', 'Enter write in the book'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'ask again', input: 'digits+enter', win: 'both docking windows read back exactly figure for figure before they go in the schedule book',
    fail: 'writing a window that was never fully read back, or talking over a figure that was already right',
    rule: 'The read-back fills eight boxes under the sheet. Press the position digit of any box showing ? or a wrong figure; Enter only when all eight boxes match the sheet.' },
  rush: 'Took a "yes, roger" from the station and wrote the window down from the sheet.',
  captions: { 'vague yes': 'book entry crossed out', 'talked over': 'operator sighs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, step = m.calm ? 0.3 : 0.24, again = m.calm ? 0.6 : 0.5;
    const win = () => { const h = ri(r, 6, 20), mm = pick(r, [0, 15, 20, 30, 45, 50]), d = ri(r, 40, 130), e = h * 60 + mm + d; return `${pad(h)}${pad(mm)}${pad(Math.floor(e / 60) % 24)}${pad(e % 60)}`; };
    m.wins = [0, 1].map(() => { const s = win(), back = s.split(''), bad = shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7]).slice(0, ri(r, 1, 3));
      for (const b of bad) back[b] = r() < 0.5 ? '?' : String((+s[b] + ri(r, 1, 8)) % 10); return { s, back, bad }; });
    m.op = pick(r, OPS); m.k = 0; m.shown = 0; m.st = 0; m.req = -1; m.rt = 0; m.rounds = 2; m.round = 0;
    const W = () => m.wins[m.k], done = () => m.shown >= 8 && m.req < 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (ENTER(code)) { if (!done()) return true; const w = W(); if (w.back.join('') !== w.s) { m.fault('vague yes'); return true; }
        m.k++; m.round = m.k; m.shown = 0; m.st = 0; if (m.k >= 2) m.win(); return true; }
      if (d >= 1 && d <= 8) { if (!done()) return true; const w = W(); if (w.back[d - 1] === w.s[d - 1]) { m.fault('talked over'); return true; } m.req = d - 1; m.rt = 0; w.back[d - 1] = '·'; return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.k >= 2) return; const w = W();
      if (m.shown < 8) { m.st += dt; while (m.st >= step && m.shown < 8) { m.st -= step; m.shown++; } return; }
      if (m.req >= 0) { m.rt += dt; if (m.rt >= again) { w.back[m.req] = r() < 0.2 ? '?' : w.s[m.req]; m.req = -1; } }
    };
    m.hint = () => { if (!done()) return []; const w = W(); const j = w.back.findIndex((c, i) => c !== w.s[i]); return j < 0 ? [['Enter', true]] : [['Digit' + (j + 1), true]]; };
    m.bad = () => done() ? 'Enter' : null;
    m.view = () => ({ w: m.wins.map(w => [w.s, w.bad]) });
    m.buttons = () => [...[1, 2, 3, 4, 5, 6, 7, 8].map(k => ['Digit' + k, String(k)]), ['Enter', 'Write in book']];
    m.draw = (c, W2, H, P) => {
      if (m.k >= 2) return; const w = W(), s = w.s, fmt = (a) => `${a[0]}${a[1]}:${a[2]}${a[3]} – ${a[4]}${a[5]}:${a[6]}${a[7]}`;
      txt(c, `Window ${m.k + 1} / 2 · ${m.op}`, 10, 18, { size: 11, col: COL.gold });
      txt(c, 'SHEET', 10, 46, { size: 9, col: COL.dim }); txt(c, fmt(s) + ' ship time', 60, 46, { size: 14, col: COL.pale });
      txt(c, 'READ-BACK', 10, 84, { size: 9, col: COL.dim });
      for (let i = 0; i < 8; i++) { const x = 60 + i * 38 + (i >= 2 ? 6 : 0) + (i >= 4 ? 14 : 0) + (i >= 6 ? 6 : 0), ch = i < m.shown ? w.back[i] : ' ', ok = ch === s[i];
        box(c, x, 64, 30, 30, 'rgba(255,255,255,.05)', i < m.shown ? (ok ? P.good : ch === '·' ? COL.peri : P.bad) : null, 4);
        txt(c, ch, x + 15, 85, { size: 15, align: 'center', col: ok ? COL.ink : COL.warn }); txt(c, String(i + 1), x + 15, 108, { size: 9, align: 'center', col: COL.dim }); }
      txt(c, m.shown < 8 ? 'operator reading back…' : m.req >= 0 ? `repeating figure ${m.req + 1}…` : 'Press a position to ask again, or Enter to write it in the book', 10, 140, { size: 10, col: COL.pale });
    };
    return m;
  },
});
