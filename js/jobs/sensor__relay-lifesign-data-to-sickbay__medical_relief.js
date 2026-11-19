// Sensor officer: relay lifesign data to sickbay (medical relief). The cluster map shows each lifesign cluster's count. Send a cluster down the
// relay channel (its digit); a moment later the sickbay medical desk reads the figure back. If the read-back does not match your count (they
// heard 40 for 14, or 7 for 8), challenge it with Space while it is on the line and send the cluster again. Challenging a correct read-back
// wastes the channel; letting a wrong one stand means the wrong number of beds. After every cluster, the desk reads back the total too.
import { define, machine, DIG, SPACE, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const mishear = (r, n) => (n >= 13 && n <= 19 && r() < 0.6 ? (n - 10) * 10 : n + (r() < 0.5 ? -1 : 1) * ri(r, 1, 2));
export default define({
  job: { billet: 'sensor', label: 'Relay lifesign data to sickbay', type: 'task:medical_relief' },
  title: 'Sickbay read-back challenge', dept: 'sciences', host: 'console', tool: 'Relay channel to sickbay',
  how: 'Send each lifesign cluster to sickbay (its digit), then check the medical desk’s read-back against your figure: challenge a wrong one with Space and resend; let a right one stand.',
  keys: ['1-4 send a cluster', 'Space challenge the read-back'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'challenge read-back', input: 'digits+space', win: 'every cluster figure and the total relayed to sickbay with each misheard read-back challenged on the line and resent',
    fail: 'letting sickbay keep a misheard figure, or challenging a read-back that matched your count',
    rule: 'Send a cluster with its digit. While READ-BACK shows, compare it with your figure: different, press Space (it is resent); same, do nothing. The total is read back last.' },
  rush: 'Rattled off the counts and closed the channel before sickbay could read anything back.',
  captions: { 'misheard figure': 'sickbay preps the wrong beds', 'false correction': 'channel crosstalk' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, readT = m.calm ? 2.2 : 1.6, gap = 0.6, N = 4;
    m.cl = Array.from({ length: N }, (_, i) => ({ n: i + 1, c: ri(r, 3, 19), loc: `deck ${ri(r, 1, 9)} ${['fore', 'aft', 'port', 'stbd'][ri(r, 0, 3)]}`, ok: false, wrongs: 0 }));
    const bad = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2))); m.cl.forEach((k, i) => { k.wrongs = bad.has(i) ? 1 : 0; });
    m.total = m.cl.reduce((a, k) => a + k.c, 0); m.totWrong = r() < 0.5; m.rb = null; m.round = 0; m.rounds = N + 1;
    const start = (k) => { const wrong = k ? k.wrongs > 0 : m.totWrong, real = k ? k.c : m.total; m.rb = { k, real, said: wrong ? mishear(r, real) : real, age: -gap, ch: false }; if (m.rb.said === real) m.rb.said = real + 1; if (!wrong) m.rb.said = real; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (!(d >= 1 && d <= N) && !SPACE(code)) return false; if (!down) return true;
      if (SPACE(code)) { const b = m.rb; if (!b || b.age < 0 || b.ch) return true; b.ch = true;
        if (b.said === b.real) m.fault('false correction'); else { if (b.k) b.k.wrongs = 0; else m.totWrong = false; } m.rb = null; if (!b.k) start(null); return true; }
      if (m.rb) return true; const k = m.cl[d - 1]; if (!k.ok) start(k); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || !m.rb) return; const b = m.rb; b.age += dt; if (b.age < readT) return;
      if (b.said !== b.real) { m.fault('misheard figure'); if (b.k) b.k.wrongs = 0; else m.totWrong = false; m.rb = null; if (!b.k) start(null); return; }
      m.rb = null; if (b.k) { b.k.ok = true; m.round++; if (m.cl.every(k => k.ok)) start(null); } else { m.round = N + 1; m.win(); }
    };
    m.hint = () => { const b = m.rb; if (b) return b.age > 0.3 && b.said !== b.real && !b.ch ? [['Space', true]] : []; const k = m.cl.find(x => !x.ok); return k ? [['Digit' + k.n, true]] : []; };
    m.bad = () => (m.rb && m.rb.age > 0.2 ? 'Space' : m.rb ? null : 'Digit' + (m.cl.find(x => !x.ok)?.n || 1));
    m.view = () => ({ c: m.cl.map(k => [k.c, k.wrongs]) });
    m.buttons = () => [...m.cl.map(k => ['Digit' + k.n, 'Send ' + k.n]), ['Space', 'Challenge']];
    m.draw = (c, W, H, P) => {
      txt(c, 'CLUSTER MAP · your counts', 14, 18, { size: 11, col: COL.gold });
      m.cl.forEach((k, i) => { const y = 28 + i * 26, act = m.rb && m.rb.k === k; box(c, 14, y, 170, 22, 'rgba(255,255,255,.05)', act ? COL.gold : null, 4);
        txt(c, `${k.n}`, 22, y + 15, { size: 12, col: COL.pale }); txt(c, k.loc, 38, y + 15, { size: 10, col: COL.dim }); txt(c, String(k.c), 140, y + 16, { size: 14 });
        if (k.ok) lamp(c, 172, y + 11, 6, P.good, 'circle'); });
      txt(c, `TOTAL ${m.total}`, 14, 146, { size: 12, col: COL.pale });
      txt(c, 'SICKBAY READ-BACK', 210, 30, { size: 10, col: COL.dim }); box(c, 210, 38, 176, 78, COL.panel, COL.dim, 6);
      const b = m.rb; if (b && b.age >= 0) { txt(c, b.k ? `cluster ${b.k.n}:` : 'total:', 220, 62, { size: 11, col: COL.dim }); txt(c, `"${b.said}"`, 220, 96, { size: 26, col: COL.ink });
        c.fillStyle = COL.warn; c.fillRect(212, 110, 172 * Math.max(0, 1 - b.age / readT), 4); }
      else txt(c, b ? 'sickbay writing…' : 'send a cluster (digit)', 220, 80, { size: 11, col: COL.dim });
      txt(c, 'wrong figure → Space', 210, 138, { size: 10, col: COL.dim });
    };
    return m;
  },
});
