// CMO: request transporter and cargo support (medical relief). Fill the support request from the staffing roster: pick exactly the number
// of transporter operators and cargo lifters the task line asks for (↑ ↓ move, Space pick), never anyone on rest or already on a ward. Then hold
// ← / → to dial the lift load up to the heaviest crate on the list (not under it, and no more than 20 kg over) and send to ops (Enter).
import { define, machine, ARROW, SPACE, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Achebe', 'Barrow', 'Chu', 'Delacroix', 'Ekwueme', 'Ferro', 'Gant', 'Haas', 'Ilyin', 'Jaxa', 'Kovac', 'Lund', 'Moro', 'Nyx'];
export default define({
  job: { billet: 'cmo', label: 'Request transporter and cargo support', type: 'task:medical_relief' },
  title: 'Roster pick and lift-load dial', dept: 'medical', host: 'console', tool: 'Staffing roster and support request',
  how: 'Pick the asked-for number of transporter and cargo crew from the roster, skipping anyone on rest (↑ ↓, Space), hold ← / → to dial the load to the heaviest crate, then send (Enter).',
  keys: ['↑ ↓ roster', 'Space pick / unpick', '← → hold dial load', 'Enter send'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'staff the request', input: 'arrows+arrows-hold+space+enter', win: 'two support requests sent with the exact transporter and cargo headcount from rested crew and the load dialled to the heaviest crate',
    fail: 'pulling a crewman who is on rest or busy on a ward, an underfilled or overfilled headcount, or a lift load dialled under the heaviest crate',
    rule: 'The task line says how many of each role. Pick only FREE crew of that role. Hold ← → to dial the lift load: at least the heaviest crate weight and within 20 kg of it. Enter sends.' },
  rush: 'Asked ops for "a few people" and went back to the ward.',
  captions: { 'pulled off-shift crew': 'ops: crewman on rest', 'wrong headcount': 'ops: request does not match the task', 'underweighted lift': 'ops: load under the manifest', 'overstated load': 'ops: load over the manifest' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 110 : 140, names = shuffle(r, NAMES);
    const mk = (o) => { const roster = Array.from({ length: 7 }, (_, j) => ({ n: names[(o + j) % names.length], role: j % 2 ? 'cargo' : 'transporter', st: 'FREE', pk: false }));
      shuffle(r, roster.map((_, j) => j)).slice(0, 2).forEach(j => { roster[j].st = 'ON REST'; }); if (r() < 0.6) { const j = ri(r, 0, 6); if (roster[j].st === 'FREE') roster[j].st = 'ON WARD'; }
      const free = (role) => roster.filter(x => x.role === role && x.st === 'FREE').length;
      const nt = Math.max(1, Math.min(free('transporter'), ri(r, 1, 2))), nc = Math.max(1, Math.min(free('cargo'), ri(r, 1, 3)));
      const crates = Array.from({ length: 4 }, () => ri(r, 8, 42) * 10); return { roster: shuffle(r, roster), nt, nc, crates, heavy: Math.max(...crates), load: pick(r, [0, 50, 100]), sent: false }; };
    m.req = [mk(0), mk(7)]; m.req.forEach(q => { const f = (role) => q.roster.filter(x => x.role === role && x.st === 'FREE').length; q.nt = Math.min(q.nt, f('transporter')); q.nc = Math.min(q.nc, f('cargo')); });
    m.k = 0; m.cur = 0; m.rounds = 2; m.round = 0; m.flash = '';
    const Q = () => m.req[m.k];
    const want = (q) => { let t = q.nt, c = q.nc; return q.roster.map(x => x.st === 'FREE' && (x.role === 'transporter' ? t-- > 0 : c-- > 0)); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!a && !SPACE(code) && !ENTER(code)) return false;
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; } if (!down) return true; const q = Q();
      if (a) { m.cur = Math.max(0, Math.min(6, m.cur + (a === 'D' ? 1 : -1))); return true; }
      if (SPACE(code)) { q.roster[m.cur].pk = !q.roster[m.cur].pk; return true; }
      const pk = q.roster.filter(x => x.pk);
      if (pk.some(x => x.st !== 'FREE')) { m.fault('pulled off-shift crew'); m.flash = 'someone picked is not free'; return true; }
      if (pk.filter(x => x.role === 'transporter').length !== q.nt || pk.filter(x => x.role === 'cargo').length !== q.nc) { m.fault('wrong headcount'); m.flash = 'headcount does not match the task line'; return true; }
      if (q.load < q.heavy) { m.fault('underweighted lift'); m.flash = 'load is under the heaviest crate'; return true; }
      if (q.load > q.heavy + 20) { m.fault('overstated load'); m.flash = 'load is far over the heaviest crate'; return true; }
      q.sent = true; m.round++; m.flash = `ops reply code ${ri(r, 100, 999)}-${String.fromCharCode(65 + ri(r, 0, 25))}`; m.cur = 0; m.held = {}; if (++m.k >= 2) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const q = Q(); if (!q) return; q.load = Math.max(0, Math.min(600, q.load + ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * rate * dt)); };
    m.hint = () => { const q = Q(); if (!q) return []; const w = want(q), j = q.roster.findIndex((x, i) => x.pk !== w[i]);
      if (j >= 0) return j === m.cur ? [['Space', true]] : [[j > m.cur ? 'ArrowDown' : 'ArrowUp', true]];
      if (q.load < q.heavy + 3) return [['ArrowRight', true]]; if (q.load > q.heavy + 17) return [['ArrowRight', false], ['ArrowLeft', true]];
      return [['ArrowRight', false], ['ArrowLeft', false], ['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ q: m.req.map(q => [q.nt, q.nc, q.crates, q.roster.map(x => x.st)]) });
    m.buttons = () => [['ArrowUp', '↑'], ['ArrowDown', '↓'], ['Space', 'Pick'], ['ArrowLeft', '◀ load'], ['ArrowRight', 'load ▶'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      const q = Q() || m.req[1]; txt(c, `Request ${Math.min(m.k + 1, 2)} / 2 · need ${q.nt} transporter, ${q.nc} cargo`, 10, 14, { size: 11, col: COL.gold });
      q.roster.forEach((x, j) => { const y = 20 + j * 19; box(c, 10, y, 220, 17, COL.panel, j === m.cur ? COL.gold : null, 3);
        txt(c, `${x.pk ? '☑' : '☐'} ${x.n}`, 16, y + 13, { size: 11, col: x.pk ? P.good : COL.ink }); txt(c, x.role, 120, y + 13, { size: 10, col: COL.dim }); txt(c, x.st, 224, y + 13, { size: 10, align: 'right', col: x.st === 'FREE' ? COL.ink : P.bad }); });
      txt(c, 'crates (kg): ' + q.crates.join(' · '), 240, 30, { size: 10, col: COL.pale });
      box(c, 240, 44, 148, 50, COL.panel, COL.peri); txt(c, 'LIFT LOAD', 314, 60, { size: 10, align: 'center', col: COL.dim }); txt(c, `${Math.round(q.load)} kg`, 314, 84, { size: 18, align: 'center' });
      txt(c, m.flash, 390, 160, { size: 11, align: 'right', col: COL.warn });
    };
    return m;
  },
});
