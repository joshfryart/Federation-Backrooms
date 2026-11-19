// Chief science officer: brief sensor, carto and botany on the survey targets. The coverage grid arrives with the heads' own claims on it:
// some sectors are empty, some are claimed twice, some by the wrong team. Open a head's channel (1 sensors, 2 cartography, 3 botany), move to
// a sector (arrows) and drop that head's tag on it (Space): the tag replaces whatever claims were there. Each target's type says who covers
// it (stellar = sensors, charting = carto, biosign = botany). Send the grid (Enter) only with every sector covered by exactly its own team.
import { define, machine, ARROW, SPACE, ENTER, DIG, ri, rf, shuffle, txt, box, COL } from './kit.js';

const DEPT = ['', 'SENSORS', 'CARTO', 'BOTANY'], TYPE = ['', 'stellar', 'charting', 'biosign'], GW = 3, GH = 2;
export default define({
  job: { billet: 'cso', label: 'Brief sensor, carto and botany on survey targets', type: 'task:survey' },
  title: 'Survey coverage grid deconfliction', dept: 'sciences', host: 'console', tool: 'Survey coverage grid',
  how: 'Pick a head\'s channel (1-3), move to a sector and drop their tag (Space) so every target is covered by exactly the team its type calls for. Fix empty and double-claimed sectors, then send the grid (Enter).',
  keys: ['1 sensors · 2 carto · 3 botany', 'arrows move', 'Space drop tag', 'Enter send'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'deconflict cover', input: 'digits+arrows+space+enter', win: 'a survey grid sent where every sector carries exactly one claim and it belongs to the team its target type needs',
    fail: 'giving a sector to the wrong head, re-tagging a sector already settled, or sending the grid with a gap or a double claim',
    rule: 'Each sector lists its target type and the heads claiming it. Choose the right head (stellar 1, charting 2, biosign 3), go to the sector, Space to replace its claims. Enter once every sector shows one correct claim.' },
  rush: 'Read the target list out once on open channel and let the heads sort it out.',
  captions: { 'wrong team': 'comm static', 'already covered': 'double-booked tone', 'gap or overlap': 'bridge rejects the grid' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = GW * GH;
    const types = shuffle(r, [1, 2, 3, ri(r, 1, 3), ri(r, 1, 3), ri(r, 1, 3)]), state = shuffle(r, ['empty', 'double', 'wrong', 'ok', r() < 0.5 ? 'ok' : 'double', r() < 0.5 ? 'empty' : 'ok']);
    m.sec = types.map((t, i) => { const other = (t % 3) + 1, st = state[i]; return { t, brg: ri(r, 0, 35) * 10, pri: ri(r, 1, 3), range: +rf(r, 0.5, 9).toFixed(1), claims: st === 'empty' ? [] : st === 'double' ? [t, other] : st === 'wrong' ? [other] : [t] }; });
    m.sel = 0; m.c = 0; m.dn = {}; m.bf = 0;
    const good = (s) => s.claims.length === 1 && s.claims[0] === s.t;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code); if (!a && !d && !SPACE(code) && !ENTER(code)) return false;
      const e = down && !m.dn[code]; m.dn[code] = down; if (!e) return true;
      if (d >= 1 && d <= 3) m.sel = d;
      else if (a) { const x = m.c % GW, y = Math.floor(m.c / GW); m.c = a === 'L' ? y * GW + (x + GW - 1) % GW : a === 'R' ? y * GW + (x + 1) % GW : ((y + 1) % GH) * GW + x; }
      else if (SPACE(code) && m.sel) { const s = m.sec[m.c]; if (m.sel !== s.t) m.fault('wrong team'); else if (good(s)) m.fault('already covered'); else s.claims = [m.sel]; }
      else if (ENTER(code)) { if (m.sec.every(good)) m.win(); else m.fault('gap or overlap'); }
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    const tap = (code) => [[code, !m.dn[code]]];
    m.hint = () => {
      const k = m.sec.findIndex(s => !good(s)); if (k < 0) return tap('Enter'); const s = m.sec[k];
      if (m.sel !== s.t) return tap('Digit' + s.t); if (m.c !== k) { const x = m.c % GW, y = Math.floor(m.c / GW), kx = k % GW, ky = Math.floor(k / GW); return tap(ky !== y ? 'ArrowDown' : kx > x ? 'ArrowRight' : 'ArrowLeft'); }
      return tap('Space');
    };
    m.bad = () => ['Enter', ++m.bf % 2 === 0];
    m.view = () => ({ sec: m.sec.map(s => [s.t, s.claims.join('')]) });
    m.buttons = () => [['Digit1', '1 Sensors'], ['Digit2', '2 Carto'], ['Digit3', '3 Botany'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowDown', '▲▼'], ['Space', 'Drop tag'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      const cw = 88, ch = 60;
      m.sec.forEach((s, i) => { const x = 10 + (i % GW) * (cw + 4), y = 12 + Math.floor(i / GW) * (ch + 4), ok = good(s);
        box(c, x, y, cw, ch, ok ? 'rgba(79,208,106,.18)' : 'rgba(255,179,71,.12)', i === m.c ? COL.gold : null, 5);
        txt(c, `${TYPE[s.t]}  P${s.pri}`, x + 6, y + 15, { size: 10, col: COL.pale }); txt(c, `${s.brg}° · ${s.range} ly`, x + 6, y + 29, { size: 9, col: COL.dim });
        txt(c, s.claims.length ? s.claims.map(d => DEPT[d]).join(' + ') : '— none —', x + 6, y + 47, { size: 9, col: ok ? P.good : COL.warn }); txt(c, ok ? '✓' : s.claims.length > 1 ? '×2' : '!', x + cw - 8, y + 15, { size: 11, align: 'right', col: ok ? P.good : COL.warn }); });
      txt(c, 'CHANNEL', 290, 24, { size: 10, col: COL.dim }); [1, 2, 3].forEach(d => txt(c, `${d} ${DEPT[d]}`, 290, 40 + d * 15, { size: 11, col: m.sel === d ? COL.gold : COL.dim }));
      txt(c, 'stellar→1 charting→2 biosign→3', 10, 156, { size: 10, col: COL.dim }); txt(c, 'Enter: send grid', 290, 120, { size: 10, col: COL.dim });
    };
    return m;
  },
});
