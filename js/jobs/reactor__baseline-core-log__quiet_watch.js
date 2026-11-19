// Reactor specialist: baseline core log. The last shift's log page opens on start-up entries that jump about. Find the first steady entry
// (it and the next agree within half a degree): that is the baseline. Below it, mark every entry that sits more than two degrees off the
// baseline as part of a run of two or more; a lone entry off on its own between steady ones is a one-off spike and is left unmarked.
// Sign the page (Enter). Two pages make the handover card.
import { define, machine, DIG, ENTER, ri, rf, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Baseline core log', type: 'task:quiet_watch' },
  title: 'Core log baseline and drift marking', dept: 'engineering', host: 'console', tool: 'Core log (shift page)',
  how: 'Find the first steady entry (it and the next within 0.5 degrees): that is baseline. Below it, toggle a mark (1-9) on every entry over 2 degrees off baseline that has an off neighbour; leave lone spikes. Enter signs the page.',
  keys: ['1-9 toggle a mark on that entry', 'Enter sign the page'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'baseline and mark', input: 'digits+enter', win: 'both log pages signed with exactly the sustained drift entries below the first steady baseline marked',
    fail: 'marking a one-off spike as drift, or signing a page with drift entries left unmarked',
    rule: 'Take the first entry that agrees with the next within half a degree as baseline. Below it, an entry over two degrees off counts only when an adjacent entry is also off; toggle those with their digit and press Enter.' },
  rush: 'Copied the last line of the log onto the handover card as the baseline.',
  captions: { 'spike marked': 'log flag buzz', 'drift missed': 'handover rejected tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const page = () => {
      const B = ri(r, 1950, 2050) + rf(r, 0, 0.9), w = r() < 0.5 ? 1 : 2, base = w, rows = [], type = [];
      for (let i = 0; i < 9; i++) type.push(i < w ? 'w' : 'n');
      for (let tries = 0; tries < 50; tries++) {
        const L = ri(r, 2, 3), lo = base + 2, s = ri(r, lo, 8), d = ri(r, lo, 9 - L);
        if ((s >= d - 1 && s <= d + L)) continue; for (let k = 0; k < L; k++) type[d + k] = 'd'; type[s] = 's'; break;
      }
      const sg = r() < 0.5 ? 1 : -1;
      for (let i = 0; i < 9; i++) rows.push(+(type[i] === 'w' ? B + (r() < 0.5 ? -1 : 1) * rf(r, 5, 12) : type[i] === 's' ? B + (r() < 0.5 ? -1 : 1) * rf(r, 3, 6) : type[i] === 'd' ? B + sg * rf(r, 2.6, 5) : B + rf(r, -0.2, 0.2)).toFixed(1));
      if (w === 2 && Math.abs(rows[0] - rows[1]) < 1) rows[1] = +(rows[1] + 4).toFixed(1);
      return { rows, type, base, B: rows[base], mark: new Set() };
    };
    m.pages = [page(), page()]; m.round = 1; m.rounds = 2;
    const pg = () => m.pages[m.round - 1];
    m.want = (p) => p.rows.map((v, i) => i > p.base && Math.abs(v - p.B) > 2 && ((i > p.base + 1 && Math.abs(p.rows[i - 1] - p.B) > 2) || (i < 8 && Math.abs(p.rows[i + 1] - p.B) > 2))).map((x, i) => x ? i : -1).filter(i => i >= 0);
    m.key = (code, down = true) => {
      const d = DIG(code), e = ENTER(code); if (m.state !== 'play' || (!d && !e)) return false; if (!down) return true; const p = pg();
      if (d) { const i = d - 1; if (p.mark.has(i)) p.mark.delete(i); else p.mark.add(i); return true; }
      const want = m.want(p), extra = [...p.mark].filter(i => !want.includes(i)), miss = want.filter(i => !p.mark.has(i));
      if (extra.length) { m.fault('spike marked'); return true; } if (miss.length) { m.fault('drift missed'); return true; }
      m.ev('signed', { page: m.round }); if (m.round >= 2) m.win(); else m.round++; return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const p = pg(), want = m.want(p); for (const i of want) if (!p.mark.has(i)) return [['Digit' + (i + 1), true]]; for (const i of p.mark) if (!want.includes(i)) return [['Digit' + (i + 1), true]]; return m.t > 0.4 * m.round ? [['Enter', true]] : []; };
    m.bad = () => { const p = pg(), s = p.type.indexOf('s'); return s >= 0 && !p.mark.has(s) && m.want(p).indexOf(s) < 0 ? 'Digit' + (s + 1) : 'Enter'; };
    m.view = () => ({ pages: m.pages.map(p => p.rows) });
    m.buttons = () => [...Array(9)].map((_, i) => ['Digit' + (i + 1), String(i + 1)]).concat([['Enter', 'Sign']]);
    m.draw = (c, W, H, P) => {
      const p = pg(); txt(c, `CORE LOG  page ${m.round} / 2`, 20, 16, { size: 11, col: COL.gold });
      p.rows.forEach((v, i) => { const y = 32 + i * 15, mk = p.mark.has(i);
        if (mk) box(c, 16, y - 11, 170, 14, 'rgba(255,179,71,.18)', COL.warn, 3);
        txt(c, `${i + 1}`, 22, y, { size: 11, col: COL.peri }); txt(c, `0${2 + Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`, 40, y, { size: 10, col: COL.dim, w: 400 });
        txt(c, `${v.toFixed(1)} °`, 90, y, { size: 11, col: COL.ink }); txt(c, mk ? '◆ DRIFT' : '', 140, y, { size: 9, col: COL.warn }); });
      txt(c, 'Baseline: first entry that agrees', 210, 40, { size: 11, col: COL.pale }); txt(c, 'with the next within 0.5 °.', 210, 55, { size: 11, col: COL.pale });
      txt(c, 'Mark entries > 2 ° off baseline', 210, 80, { size: 11, col: COL.ink }); txt(c, 'with an off neighbour.', 210, 95, { size: 11, col: COL.ink });
      txt(c, 'Lone spikes stay unmarked.', 210, 115, { size: 11, col: COL.dim }); txt(c, `marked ${p.mark.size}   Enter = sign`, 210, 145, { size: 12, col: COL.gold });
    };
    return m;
  },
});
