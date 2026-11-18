// Second officer: clear priority transport and berths for patients. First berth the arriving casualties, most critical first: a critical
// casualty needs a free monitored berth, the rest any free berth (1-6). Then release the lift route from the transporter to sickbay one
// corridor at a time: hold Space for the release interlock to run, but only while that corridor's team lamp is clear. If a team walks in
// while you are releasing, it is a fault and you must let go.
import { define, machine, DIG, SPACE, ri, rf, shuffle, pick, txt, box, lamp, bar, COL } from './kit.js';

const CAS = ['Burns, deck 4', 'Crush injury', 'Smoke inhalation', 'Fractured arm', 'Plasma burn', 'Concussion', 'Lacerations'];
const SEG = ['Transporter room → lift 2', 'Lift 2 shaft', 'Deck 6 corridor', 'Sickbay approach'];

export default define({
  job: { billet: 'so', label: 'Clear priority transport and berths for patients', type: 'task:medical_relief' },
  title: 'Berth board and lift route release', dept: 'command', host: 'console', tool: 'Berth board and lift routes panel',
  how: 'Put each casualty in a free berth (critical ones in a monitored berth), then hold Space to release each route corridor only while its team lamp is clear.',
  keys: ['1 – 6 berth', 'hold Space release corridor'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'berth and release', input: 'digits+space-hold', win: 'every casualty berthed in a fitting free bed and the lift route released corridor by corridor while each stood empty',
    fail: 'sending a casualty to an occupied or unmonitored berth, or releasing a corridor while a team is still in it',
    rule: 'Digits put the listed casualty in a berth (critical → monitored ◆). Then hold Space on each corridor while its lamp reads CLEAR until the interlock bar fills.' },
  rush: 'Paged sickbay that everyone was coming and opened every lift door at once.',
  captions: { 'berth taken': 'board buzz', 'no monitor': 'monitor alarm', 'team in corridor': 'interlock klaxon' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, need = m.calm ? 0.6 : 0.75;
    m.beds = Array.from({ length: 6 }, (_, i) => ({ mon: i < 3, occ: false, who: null }));
    shuffle(r, [0, 1, 2]).slice(0, 1).forEach(i => { m.beds[i].occ = true; }); shuffle(r, [3, 4, 5]).slice(0, 1).forEach(i => { m.beds[i].occ = true; });
    m.beds = shuffle(r, m.beds);
    const names = shuffle(r, CAS); m.cas = [{ n: names[0], crit: true }, { n: names[1], crit: r() < 0.5 }, { n: names[2], crit: false }].sort((a, b) => b.crit - a.crit);
    m.segs = SEG.map(() => ({ P: rf(r, 2.6, 3.6) + (m.calm ? 0.6 : 0), occ: rf(r, 0.8, 1.4), off: rf(r, 0, 3), prog: 0, done: false }));
    m.ci = 0; m.si = 0; m.lock = false; m.rounds = 7; m.round = 0;
    const ph = (g) => (m.t + g.off) % g.P, busy = (g) => ph(g) < g.occ, clearLeft = (g) => g.P - ph(g);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (SPACE(code)) { m.held.S = down; if (!down) m.lock = false; return true; }
      if (!down || !d || d > 6) return false; if (m.ci >= m.cas.length) return true;
      const b = m.beds[d - 1], c = m.cas[m.ci]; if (b.occ) { m.fault('berth taken'); return true; } if (c.crit && !b.mon) { m.fault('no monitor'); return true; }
      b.occ = true; b.who = c.n; m.ci++; m.round++; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.ci < m.cas.length) return; const g = m.segs[m.si]; if (!g) return;
      if (m.held.S && !m.lock) { if (busy(g)) { m.fault('team in corridor'); m.lock = true; g.prog = 0; return; } g.prog += dt / need; if (g.prog >= 1) { g.done = true; m.si++; m.round++; m.lock = true; if (m.si >= m.segs.length) m.win(); } }
      else if (!m.held.S) g.prog = 0;
    };
    m.hint = () => {
      if (m.ci < m.cas.length) { const c = m.cas[m.ci], k = m.beds.findIndex(b => !b.occ && (!c.crit || b.mon)); return [['Digit' + (k + 1), true]]; }
      const g = m.segs[m.si]; if (!g) return []; if (m.lock) return [['Space', false]];
      const ok = !busy(g) && (m.held.S ? clearLeft(g) > (1 - g.prog) * need + 0.05 : clearLeft(g) > need + 0.15); return [['Space', ok]];
    };
    m.bad = () => { if (m.ci < m.cas.length) { const k = m.beds.findIndex(b => b.occ); return 'Digit' + (k + 1); } return ['Space', true]; };
    m.view = () => ({ beds: m.beds.map(b => [b.mon, b.occ]), cas: m.cas.map(c => c.n + (c.crit ? '!' : '')), segs: m.segs.map(g => +g.P.toFixed(2)) });
    m.buttons = () => m.ci < m.cas.length ? m.beds.map((b, i) => ['Digit' + (i + 1), `${i + 1}${b.mon ? '◆' : ''}`]) : [['Space', 'Release (hold)']];
    m.draw = (c, W, H, P) => {
      txt(c, 'BERTH BOARD', 10, 14, { size: 10, col: COL.gold });
      m.beds.forEach((b, i) => { const x = 8 + i * 64; box(c, x, 20, 60, 34, b.occ ? 'rgba(255,90,72,.15)' : 'rgba(79,208,106,.12)', b.occ ? P.bad : P.good, 6); txt(c, `${i + 1}${b.mon ? ' ◆mon' : ''}`, x + 6, 34, { size: 10 }); txt(c, b.occ ? (b.who ? b.who.split(',')[0].slice(0, 9) : 'OCCUPIED') : 'free', x + 6, 48, { size: 9, col: b.occ ? COL.warn : P.good }); });
      if (m.ci < m.cas.length) { const cs = m.cas[m.ci]; txt(c, `Next off the transport list: ${cs.n} — ${cs.crit ? 'CRITICAL (needs ◆)' : 'stable'}`, 10, 76, { size: 11, col: cs.crit ? COL.warn : COL.ink }); return; }
      txt(c, 'LIFT ROUTE', 10, 72, { size: 10, col: COL.gold });
      m.segs.forEach((g, i) => {
        const y = 80 + i * 21, b = busy(g), cur = i === m.si; box(c, 8, y, W - 16, 18, cur ? 'rgba(240,147,58,.18)' : 'rgba(255,255,255,.04)', cur ? COL.orange : null, 6);
        lamp(c, 20, y + 9, 6, g.done ? P.good : b ? P.bad : P.good, g.done ? 'diamond' : b ? 'square' : 'circle'); txt(c, SEG[i], 32, y + 13, { size: 10 });
        txt(c, g.done ? 'released' : b ? `TEAM IN · clear in ${(g.occ - ph(g)).toFixed(1)} s` : `clear · next team ${clearLeft(g).toFixed(1)} s`, 200, y + 13, { size: 9, col: b && !g.done ? COL.warn : COL.pale });
        if (cur) bar(c, 330, y + 4, 56, 10, g.prog, { col: COL.peri });
      });
    };
    return m;
  },
});
