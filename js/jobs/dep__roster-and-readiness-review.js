// Deputy security chief: roster and readiness review. The night watch grid has four posts; each officer shows hours of rest since their last
// shift. Anyone under the rest minimum is amber. Swap them out: press the post (1-4), then a reserve name (5-8). The reserve must be rested AND
// free: pulling someone already holding a day post leaves that post empty, and swapping in a tired reserve just moves the problem. File the
// handover (Enter) only when every night post is rested.
import { define, machine, DIG, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const NAMES = ['Okafor', 'Reyes', 'Tanaka', 'Hollis', 'Vance', "T'Mir", 'Brandt', 'Ishaan', 'Kowal', 'Mbeki', 'Sorel', 'Quill'];
export default define({
  job: { billet: 'dep', label: 'Roster and readiness review', type: 'loop' },
  title: 'Night watch rest-hour swap', dept: 'security', host: 'console', tool: 'Duty roster slate',
  how: 'Every night post must have an officer with at least 8 h rest. Press a post (1-4) then a free, rested reserve (5-8) to swap them; press Enter to file the handover.',
  keys: ['1-4 pick a night post', '5-8 swap in a reserve', 'Enter file handover'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'swap shifts', input: 'digits+enter', win: 'every night watch post held by an officer with enough rest, without stripping a day post, then the handover filed',
    fail: 'swapping in a tired reserve or one already on a day post, or filing with someone short on rest on the night watch',
    rule: 'Amber names on the night grid are under 8 h rest. Press their post number, then the number of a reserve who is rested and marked FREE. Enter files the note once the grid is clean.' },
  rush: 'Filed the roster as it stood and hoped the night watch kept their eyes open.',
  captions: { 'short rest': 'roster cell flashes', 'day gap': 'day post empties', 'tired on watch': 'handover bounced' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, MIN = 8, names = shuffle(r, NAMES);
    const k = ri(r, 1, 2), tired = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, k));
    m.night = [0, 1, 2, 3].map(i => ({ n: names[i], rest: tired.has(i) ? ri(r, 3, 7) : ri(r, 8, 14) }));
    const res = []; for (let j = 0; j < k; j++) res.push({ rest: ri(r, 9, 14), day: false });
    res.push({ rest: ri(r, 2, 6), day: false }); res.push({ rest: ri(r, 9, 14), day: true }); while (res.length < 4) res.push({ rest: ri(r, 3, 7), day: r() < 0.5 });
    m.res = shuffle(r, res).map((o, j) => ({ ...o, n: names[4 + j] }));
    m.sel = -1; m.rounds = k; m.round = 0;
    const bad = () => m.night.filter(o => o.rest < MIN).length;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (ENTER(code)) { if (down) { if (bad()) m.fault('tired on watch'); else m.win(); } return true; }
      const d = DIG(code); if (!d || d > 8) return false; if (!down) return true;
      if (d <= 4) { m.sel = d - 1; return true; }
      if (m.sel < 0) return true; const o = m.res[d - 5];
      if (o.day) { m.fault('day gap'); m.ev('undo', { who: o.n }); m.sel = -1; return true; }
      if (o.rest < MIN) { m.fault('short rest'); m.ev('undo', { who: o.n }); m.sel = -1; return true; }
      const was = m.night[m.sel]; m.night[m.sel] = { n: o.n, rest: o.rest }; m.res[d - 5] = { n: was.n, rest: was.rest, day: false, off: true };
      m.round = k - bad(); m.sel = -1; return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (!bad()) return [['Enter', true]];
      if (m.sel < 0 || m.night[m.sel].rest >= MIN) return [['Digit' + (m.night.findIndex(o => o.rest < MIN) + 1), true]];
      const j = m.res.findIndex(o => !o.day && !o.off && o.rest >= MIN); return [['Digit' + (j + 5), true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ night: m.night.map(o => o.n + o.rest), res: m.res.map(o => o.n + o.rest + (o.day ? 'D' : '')) });
    m.buttons = () => [1, 2, 3, 4, 5, 6, 7, 8].map(d => ['Digit' + d, String(d)]).concat([['Enter', 'File']]);
    m.draw = (c, W, H, P) => {
      txt(c, 'NIGHT WATCH', 14, 16, { size: 11, col: COL.gold }); txt(c, 'RESERVES', 210, 16, { size: 11, col: COL.peri });
      m.night.forEach((o, i) => { const y = 24 + i * 32, low = o.rest < MIN; box(c, 14, y, 180, 26, COL.panel, m.sel === i ? COL.gold : low ? COL.warn : 'rgba(255,255,255,.15)', 5);
        txt(c, `${i + 1}  ${o.n}`, 22, y + 17, { size: 12, col: low ? COL.warn : COL.ink }); txt(c, `${o.rest} h`, 186, y + 17, { size: 12, align: 'right', col: low ? COL.warn : COL.ink }); if (low) lamp(c, 150, y + 13, 7, P.bad, 'triangle'); });
      m.res.forEach((o, j) => { const y = 24 + j * 32; box(c, 210, y, 178, 26, COL.panel, 'rgba(255,255,255,.15)', 5);
        txt(c, `${j + 5}  ${o.n}`, 218, y + 17, { size: 12, col: o.rest < MIN ? COL.warn : COL.ink }); txt(c, o.day ? 'DAY POST' : o.off ? 'stood down' : 'FREE', 330, y + 17, { size: 10, align: 'right', col: o.day ? COL.warn : COL.dim }); txt(c, `${o.rest} h`, 380, y + 17, { size: 12, align: 'right' }); });
      txt(c, m.sel >= 0 ? `Post ${m.sel + 1} selected: pick a reserve (5-8)` : `Rest minimum ${MIN} h · ${bad()} short on the night watch`, 14, 162, { size: 11, col: COL.pale });
    };
    return m;
  },
});
