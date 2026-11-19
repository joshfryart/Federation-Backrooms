// Counsellor: crew morale report to the captain. Observation cards come off the pocket pad one at a time. Strike out any name (Space swaps it
// for a role) and file the card on its shift pile (← alpha, ↑ beta, → gamma). When the pad is empty, read the summary to the captain: pick the
// shift with the most worrying cards with the arrows and press Enter. Filing a named card leaks a confidant; naming the wrong shift softens
// the real trend.
import { define, machine, ARROW, SPACE, ENTER, pick, shuffle, ri, txt, box, COL } from './kit.js';

const SH = ['alpha', 'beta', 'gamma'], DIR = { L: 0, U: 1, R: 2 };
const NAMES = ['Ens. Varga', 'Cmn. Liu', 'Lt. Achebe', 'PO Saint', 'Ens. Mori', 'Cmn. Dale', 'Lt. Grey'];
const DEPTS = ['engineering', 'ops', 'science', 'cargo', 'galley', 'security'];
const BAD = ['snapping at the watch officer', 'skipping meals', 'sleeping through alarms', 'asked about a transfer', 'tearful after the call home'];
const OK = ['joined the chess night', 'laughing at the mess', 'helping the new ensign', 'volunteered for the drill'];
export default define({
  job: { billet: 'counsel', label: 'Crew morale report to the captain', type: 'loop' },
  title: 'Anonymised morale summary', dept: 'medical', host: 'console', tool: 'Observation notes, bridge rail',
  how: 'Strike any name on a card with Space, then file it on its shift pile (← alpha, ↑ beta, → gamma). Then pick the shift that is fraying and press Enter to report.',
  keys: ['Space strike name', '← ↑ → file / pick shift', 'Enter report'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'redact and file', input: 'arrows+space+enter', win: 'every observation card anonymised and filed by shift, then the fraying shift named honestly to the captain',
    fail: 'filing a card that still names a person, misfiling a shift, or reporting a calmer shift than the real trend',
    rule: 'A card shows a name or role, a shift and an observation. Space turns a name into a role; an arrow files it on alpha, beta or gamma. At the end the arrows pick the shift with most ▼ cards and Enter reports.' },
  rush: 'Told the captain morale was "about the same" and left.',
  captions: { 'leaked name': 'captain frowns', misfiled: 'paper shuffle', 'softened trend': 'captain sighs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, worst = ri(r, 0, 2);
    const mk = (sh, bad) => { const named = r() < 0.55, dept = pick(r, DEPTS); return { sh, bad, named, name: pick(r, NAMES), role: `a ${pick(r, ['junior', 'senior'])} ${dept} hand`, obs: pick(r, bad ? BAD : OK), dept }; };
    const cards = []; for (let s = 0; s < 3; s++) { const nb = s === worst ? 2 : (r() < 0.5 ? 1 : 0); cards.push(mk(s, nb >= 1)); cards.push(mk(s, nb >= 2)); }
    if (!cards.some(c => c.named)) cards[ri(r, 0, 5)].named = true;
    m.cards = shuffle(r, cards); m.k = 0; m.piles = [[], [], []]; m.ph = 'file'; m.sel = 1; m.worst = worst; m.rounds = 6; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), c = m.cards[m.k];
      if (m.ph === 'file') {
        if (SPACE(code)) { if (c) c.named = false; return true; }
        if (a && a !== 'D') { const p = DIR[a]; if (c.named) { m.fault('leaked name'); c.named = false; return true; } if (p !== c.sh) { m.fault('misfiled'); return true; }
          m.piles[p].push(c); m.k++; m.round = m.k; if (m.k >= m.cards.length) m.ph = 'report'; return true; }
        return !!a || ENTER(code);
      }
      if (a && a !== 'D') { m.sel = DIR[a]; return true; }
      if (ENTER(code)) { if (m.sel !== m.worst) { m.fault('softened trend'); return true; } m.win(); return true; }
      return SPACE(code) || !!a;
    };
    m.tick = (dt) => { m.live(dt); };
    const KEY = ['ArrowLeft', 'ArrowUp', 'ArrowRight'];
    m.hint = () => { if (m.ph === 'file') { const c = m.cards[m.k]; return c ? [[c.named ? 'Space' : KEY[c.sh], true]] : []; } return [[m.sel === m.worst ? 'Enter' : KEY[m.worst], true]]; };
    m.bad = () => (m.ph === 'file' ? KEY[(m.cards[m.k].sh + 1) % 3] : m.sel === m.worst ? KEY[(m.worst + 1) % 3] : 'Enter');
    m.view = () => ({ cards: m.cards.map(c => [c.sh, c.bad, c.named, c.name, c.obs]), worst: m.worst });
    m.buttons = () => [['Space', 'Strike name'], ['ArrowLeft', '◀ alpha'], ['ArrowUp', '▲ beta'], ['ArrowRight', 'gamma ▶'], ['Enter', 'Report']];
    m.draw = (c, W, H, P) => {
      SH.forEach((s, i) => { const x = 14 + i * 128, n = m.piles[i].length, nb = m.piles[i].filter(q => q.bad).length, on = m.ph === 'report' && m.sel === i;
        box(c, x, 112, 118, 48, 'rgba(255,255,255,.05)', on ? COL.gold : COL.lav); txt(c, `${['◀', '▲', '▶'][i]} ${s}`, x + 8, 128, { size: 11, col: COL.gold });
        txt(c, `${n} cards  ▼ ${nb}`, x + 8, 148, { size: 11, col: nb >= 2 ? COL.warn : COL.pale }); });
      if (m.ph === 'report') { txt(c, 'Captain at the rail. Which shift is fraying?', 14, 30, { size: 13, col: COL.gold }); txt(c, '▼ = worrying card. Name the real trend, then Enter.', 14, 52, { size: 11, col: COL.dim }); return; }
      const q = m.cards[m.k]; if (!q) return; box(c, 14, 10, 372, 92, 'rgba(247,201,162,.08)', COL.pale);
      txt(c, `card ${m.k + 1} / ${m.cards.length}`, 376, 26, { size: 10, align: 'right', col: COL.dim });
      txt(c, q.named ? q.name : `[${q.role}]`, 26, 34, { size: 14, col: q.named ? COL.warn : COL.pale }); if (q.named) txt(c, 'NAMED — strike it', 26, 50, { size: 10, col: COL.warn });
      txt(c, `${SH[q.sh]} shift · ${q.dept}`, 26, 70, { size: 11, col: COL.dim }); txt(c, `${q.bad ? '▼' : '▲'} ${q.obs}`, 26, 92, { size: 12, col: q.bad ? COL.warn : P.good });
    };
    return m;
  },
});
