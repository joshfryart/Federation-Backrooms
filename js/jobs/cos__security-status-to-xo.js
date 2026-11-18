// Chief of security: security status to the XO. On the open comm, brief the three most urgent incidents, most urgent first (severity first,
// then the oldest stamp). The XO cuts in at random: stop talking (Space) and let them speak, then read back the deck number in their order
// (a digit). Talking over the XO, burying the urgent item or misreading the order are faults.
import { define, machine, SPACE, DIG, ri, rf, pick, shuffle, txt, box, bar, COL } from './kit.js';

const WHAT = ['Phaser discharge, deck', 'Unlogged transport to deck', 'Brig cell alarm, deck', 'Door forced on deck', 'Missing tricorder, deck', 'Crew scuffle, deck', 'Lapsed patrol, deck'];
const ORD = ['Seal deck', 'Double the watch on deck', 'Send a team to deck', 'Lock the armory on deck'];
export default define({
  job: { billet: 'cos', label: 'Security status to XO', type: 'loop' },
  title: 'Comm brief with read-back', dept: 'security', host: 'console', tool: 'Ready room desk comm',
  how: 'Brief the XO on the three most urgent incidents in order (press their numbers). When the XO cuts in, press Space to stop and listen, then key the deck number of the order to read it back.',
  keys: ['1-6 brief an item', 'Space stop and listen', '1-9 read back the deck'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'brief and yield', input: 'digits+space', win: 'the three most urgent incidents briefed in order of urgency, every XO interruption yielded and every order read back',
    fail: 'talking over the XO, briefing a lesser item before the urgent one, or reading back the wrong deck',
    rule: 'Urgency is severity (▲ count) first, then the oldest time stamp. Press an item number to brief it; if the XO cuts in, Space within a second, then type the deck number the XO ordered.' },
  rush: 'Sent the XO the whole incident list as a text and logged it as briefed.',
  captions: { 'talked over': 'XO: "Chief!"', buried: 'XO sighs', misheard: 'XO: "Negative."', 'dead air': 'comm hiss' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, YIELD = m.calm ? 1.4 : 1.0, SPEAK = 1.5;
    const ages = shuffle(r, Array.from({ length: 30 }, (_, k) => 4 + k * 3));
    m.items = shuffle(r, WHAT).slice(0, 6).map((w, i) => ({ w: `${w} ${ri(r, 2, 12)}`, sev: ri(r, 1, 3), age: ages[i], done: false }));
    const urg = (x) => x.sev * 1000 + x.age; m.order = m.items.map((x, i) => i).sort((a, b) => urg(m.items[b]) - urg(m.items[a])).slice(0, 3);
    m.cut = [r() < 0.5, true, r() < 0.5].map(c => (c ? rf(r, 0.3, 0.9) : -1));
    m.done = 0; m.rounds = 3; m.round = 0; m.talk = null; m.xo = null;   // talk: { i, p }, xo: { phase 'cut'|'order', t, deck, txt }
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (SPACE(code)) { if (m.xo && m.xo.phase === 'cut') { m.xo.phase = 'order'; m.xo.t = 0; } else m.fault('dead air'); return true; }
      if (!d) return false;
      if (m.xo && m.xo.phase === 'order') { if (d === m.xo.deck) { m.ev('readback'); m.xo = null; } else m.fault('misheard'); return true; }
      if (m.talk || m.xo || d > 6) return true; const it = m.items[d - 1]; if (it.done) return true;
      if (d - 1 !== m.order[m.done]) { m.fault('buried'); return true; }
      m.talk = { i: d - 1, p: 0, cut: m.cut[m.done] }; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return;
      if (m.xo) { m.xo.t += dt; if (m.xo.phase === 'cut' && m.xo.t > YIELD) { m.fault('talked over'); m.xo.phase = 'order'; m.xo.t = 0; } return; }
      if (m.talk) { const k = m.talk; k.p += dt;
        if (k.cut >= 0 && k.p >= k.cut) { k.cut = -1; const deck = ri(r, 1, 9); m.xo = { phase: 'cut', t: 0, deck, txt: `${pick(r, ORD)} ${deck}.` }; return; }
        if (k.p >= SPEAK) { m.items[k.i].done = true; m.talk = null; m.done++; m.round = m.done; if (m.done >= 3) m.win(); } } };
    m.hint = () => { if (m.xo) return m.xo.phase === 'cut' ? (m.xo.t > 0.2 ? [['Space', true]] : []) : [['Digit' + m.xo.deck, true]];
      return m.talk ? [] : [['Digit' + (m.order[m.done] + 1), true]]; };
    m.bad = () => { if (m.talk || m.xo) return null; const w = m.items.findIndex((x, i) => !x.done && i !== m.order[m.done]); return 'Digit' + (w + 1); };
    m.view = () => ({ items: m.items.map(x => [x.sev, x.age]), cut: m.cut.map(c => c > 0) });
    m.buttons = () => [['Space', 'Stop, listen'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ['Digit' + n, String(n)])];
    m.draw = (c, W, H, P) => {
      m.items.forEach((x, i) => { const y = 14 + i * 17; box(c, 14, y, 236, 15, x.done ? 'rgba(79,208,106,.15)' : m.talk?.i === i ? 'rgba(244,194,91,.2)' : COL.panel, null, 3);
        txt(c, `${i + 1}`, 20, y + 11, { size: 10, col: COL.gold }); txt(c, '▲'.repeat(x.sev), 32, y + 11, { size: 9, col: x.sev === 3 ? P.bad : COL.warn });
        txt(c, x.w, 62, y + 11, { size: 9, col: x.done ? COL.dim : COL.ink }); txt(c, `-${x.age}m`, 244, y + 11, { size: 9, align: 'right', col: COL.pale }); });
      txt(c, `briefed ${m.done} / 3`, 262, 24, { size: 11, col: COL.pale });
      if (m.talk) { txt(c, 'YOU: speaking…', 262, 50, { size: 11 }); bar(c, 262, 58, 120, 7, m.talk.p / SPEAK, { col: COL.peri }); }
      if (m.xo) { box(c, 258, 76, 132, 58, 'rgba(185,155,230,.18)', COL.lav, 6); txt(c, m.xo.phase === 'cut' ? 'XO: "Hold it, Chief—"' : 'XO:', 264, 92, { size: 10, col: COL.lav });
        if (m.xo.phase === 'cut') txt(c, 'Space: stop and listen', 264, 110, { size: 10, col: COL.warn });
        else { txt(c, `"${m.xo.txt}"`, 264, 110, { size: 9 }); txt(c, 'key the deck to read back', 264, 126, { size: 9, col: COL.warn }); } }
      txt(c, 'Most urgent first: most ▲, then oldest.', 14, 124 + 32, { size: 10, col: COL.dim });
    };
    return m;
  },
});
