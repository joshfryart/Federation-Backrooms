// Chief science officer: deliver the survey summary in the readyroom. For each finding, copy its figure from the scan log into the form one
// digit at a time (digits); a wrong digit flashes red and is refused (a fault: a transposed figure). Then set the confidence dial (left /
// right, 1 to 5) no higher and no lower than the finding's verification allows: VERIFIED 4-5, PARTIAL 3, UNVERIFIED 1-2. Enter files the
// line. Filing an incomplete figure or a dishonest confidence is a fault. Three findings, then the summary goes to the XO.
import { define, machine, ARROW, ENTER, DIG, ri, pick, txt, box, COL } from './kit.js';

const RANGE = { VERIFIED: [4, 5], PARTIAL: [3, 3], UNVERIFIED: [1, 2] }, TGT = ['Rogue planetoid', 'Ion trail', 'Dust lane', 'Pulsar echo', 'Ice moonlet', 'Gas plume', 'Comet tail'];
export default define({
  job: { billet: 'cso', label: 'Deliver survey summary', type: 'task:survey' },
  title: 'Summary figures and honest confidence', dept: 'sciences', host: 'console', tool: 'Readyroom summary form',
  how: 'Type each finding\'s figure exactly as the scan log shows it, digit by digit. Set the confidence dial to match its verification (VERIFIED 4-5, PARTIAL 3, UNVERIFIED 1-2), then file the line with Enter.',
  keys: ['digits copy the figure', '◀ ▶ confidence dial', 'Enter file the line'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'copy and hedge', input: 'digits+arrows+enter', win: 'three findings filed with their log figures copied digit-exact and a confidence dial set inside what each verification status permits',
    fail: 'keying a wrong digit, filing a figure half copied, or overselling an unverified finding (or underselling a settled one)',
    rule: 'Copy the log figure one digit at a time: a wrong key is refused and counts. Dial: VERIFIED 4-5, PARTIAL 3, UNVERIFIED 1-2. Enter files the line.' },
  rush: 'Wrote the summary from memory and called everything confirmed.',
  captions: { transposed: 'red flash tick', 'field incomplete': 'form error tone', oversold: 'XO query ping', undersold: 'XO query ping' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = [...TGT];
    m.f = [0, 1, 2].map(() => ({ nm: names.splice(Math.floor(r() * names.length), 1)[0], scan: `S${ri(r, 100, 999)}`, fig: String(ri(r, 1000, 9999)), st: pick(r, Object.keys(RANGE)) }));
    if (m.f.every(x => x.st === 'VERIFIED')) m.f[ri(r, 0, 2)].st = 'UNVERIFIED';
    m.i = 0; m.typed = ''; m.conf = 3; m.flash = 0; m.dn = {}; m.bf = 0; m.rounds = 3; m.round = 1;
    const F = () => m.f[m.i];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code); if (!a && !d && code !== 'Digit0' && code !== 'Numpad0' && !ENTER(code)) return false;
      const e = down && !m.dn[code]; m.dn[code] = down; if (!e) return true; const x = F(), dv = code === 'Digit0' || code === 'Numpad0' ? 0 : d;
      if (a === 'L') m.conf = Math.max(1, m.conf - 1); else if (a === 'R') m.conf = Math.min(5, m.conf + 1);
      else if (ENTER(code)) { const [lo, hi] = RANGE[x.st]; if (m.typed.length < 4) m.fault('field incomplete'); else if (m.conf > hi) m.fault('oversold'); else if (m.conf < lo) m.fault('undersold');
        else { m.i++; m.round = Math.min(3, m.i + 1); m.typed = ''; m.conf = 3; if (m.i >= 3) m.win(); } }
      else if (!a && m.typed.length < 4) { if (String(dv) === x.fig[m.typed.length]) m.typed += dv; else { m.flash = 0.5; m.fault('transposed'); } }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); };
    const tap = (code) => [[code, !m.dn[code]]];
    m.hint = () => { const x = F(); if (!x) return []; if (m.typed.length < 4) return tap('Digit' + x.fig[m.typed.length]); const [lo, hi] = RANGE[x.st]; if (m.conf > hi) return tap('ArrowLeft'); if (m.conf < lo) return tap('ArrowRight'); return tap('Enter'); };
    m.bad = () => ['Enter', ++m.bf % 2 === 0];
    m.view = () => ({ f: m.f.map(x => [x.fig, x.st]) });
    m.buttons = () => [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => ['Digit' + n, String(n)]), ['ArrowLeft', '◀ conf'], ['ArrowRight', 'conf ▶'], ['Enter', 'File line']];
    m.draw = (c, W, H, P) => {
      const x = F(); if (!x) return; box(c, 10, 10, 160, 120, 'rgba(247,201,162,.07)', COL.pale, 4); txt(c, 'SCAN LOG', 16, 26, { size: 10, col: COL.dim });
      m.f.forEach((y, k) => { txt(c, `${y.scan} ${y.nm}`, 16, 46 + k * 28, { size: 10, col: k === m.i ? COL.gold : COL.dim }); txt(c, `${y.fig.slice(0, 2)}.${y.fig.slice(2)}  ${y.st}`, 16, 59 + k * 28, { size: 10, col: k === m.i ? COL.ink : COL.dim }); });
      box(c, 184, 10, 206, 120, 'rgba(255,255,255,.04)', COL.dim, 4); txt(c, `FORM · finding ${m.i + 1}/3 · ${x.nm}`, 190, 26, { size: 10, col: COL.dim });
      const shown = (m.typed + '____').slice(0, 4); box(c, 190, 36, 90, 26, m.flash > 0 ? 'rgba(255,90,60,.4)' : 'rgba(255,255,255,.06)', m.flash > 0 ? P.bad : null, 3);
      txt(c, `${shown.slice(0, 2)}.${shown.slice(2)}`, 200, 55, { size: 16, col: COL.ink, font: 'monospace' }); if (m.flash > 0) txt(c, '✕ wrong digit', 290, 54, { size: 10, col: P.bad });
      txt(c, 'CONFIDENCE', 190, 82, { size: 10, col: COL.dim }); for (let k = 1; k <= 5; k++) { box(c, 190 + (k - 1) * 34, 88, 30, 22, k <= m.conf ? 'rgba(244,194,91,.5)' : 'rgba(255,255,255,.06)', k === m.conf ? COL.gold : null, 3); txt(c, k, 205 + (k - 1) * 34, 104, { size: 11, align: 'center' }); }
      txt(c, 'VERIFIED 4-5 · PARTIAL 3 · UNVERIFIED 1-2', 10, 150, { size: 10, col: COL.dim });
    };
    return m;
  },
});
