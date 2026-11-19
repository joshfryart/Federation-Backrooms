// CMO: post-survey decontamination check (survey). At each returning suit hold E with the handheld scanner and work it over every zone,
// hands, face, suit seals and boot soles, aiming at each until it is covered; a zone that reads hot needs a longer pass. Let go with a zone
// unscanned and the pass is void. Then foam the bay floor (hold E until covered) and keep your hands off it until the dwell timer runs out.
import { define, machine, room, ri, rf } from './kit.js';

const ZONES = [['hands', 0.3], ['face', 0.1], ['suit seals', -0.1], ['boot soles', -0.3]];
export default define({
  job: { billet: 'cmo', label: 'Post-survey decontamination check', type: 'task:survey' },
  title: 'Suit zone scan and foam dwell', dept: 'medical', host: 'room', siteName: 'Decon station', verb: 'Decon',
  how: 'Hold E and aim the scanner at hands, face, seals and boots on each suit until every zone is covered without letting go; then hold E to foam the floor and leave it alone for the full dwell.',
  keys: ['Aim with the view', 'E hold: scan / spray'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'scan every zone', input: 'e-hold+look', win: 'each returning suit scanned over all four zones in one unbroken pass and the bay floor foamed for the full dwell time',
    fail: 'letting go with a zone unscanned, leaving patchy foam, or touching the floor before the dwell timer runs out',
    rule: 'Keep E down for the whole suit and visit every zone with your aim; a hot zone needs a longer pass. Then hold E to lay foam until covered, let go, and do not press E again until the dwell timer ends.' },
  rush: 'Waved the scanner at the team as they walked past and logged the bay clean.',
  captions: { 'gap in the scan': 'scanner resets', 'patchy foam': 'foam nozzle sputters', 'dwell cut short': 'dwell timer aborts' },
  says: { 'gap in the scan': 'You let go with a zone unscanned — the pass is void, start the suit again.', 'patchy foam': 'The floor is not fully covered yet.', 'dwell cut short': 'Hands off until the dwell timer runs out.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Returning suit 1', prop: 'suitrack' }, { name: 'Returning suit 2', prop: 'suitrack' }, { name: 'Decon bay floor', prop: 'steriliser' }]), r = m.rnd;
    const tol = m.calm ? 0.1 : 0.08, dwell0 = m.calm ? 0.45 : 0.55, dwellT = m.calm ? 3.0 : 3.5;
    m.suits = [0, 1].map(() => ({ hot: ri(r, 0, 3), cov: [0, 0, 0, 0], cpm: ZONES.map(() => ri(r, 20, 60)) }));
    m.suits.forEach(s => { s.cpm[s.hot] = ri(r, 180, 320); });
    m.foam = 0; m.dwell = 0; m.foamed = false; m.need = rf(r, 1.1, 1.5); m.zone = -1;
    const need = (s, z) => z === s.hot ? dwell0 * 2.5 : dwell0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i < 2) {
        const su = m.suits[i]; m.zone = ZONES.findIndex(([, b]) => Math.abs((inp.look || 0) - b) < tol);
        if (inp.hold && m.zone >= 0) su.cov[m.zone] = Math.min(need(su, m.zone), su.cov[m.zone] + dt);
        const done = su.cov.every((c, z) => c >= need(su, z));
        if (rel && !done && su.cov.some(c => c > 0)) { m.fault('gap in the scan'); su.cov = [0, 0, 0, 0]; }
        if (done && !inp.hold) { m.finish(i); return; }
        s.prog = su.cov.reduce((a, c, z) => a + c / need(su, z), 0) / 4 * 0.95; return;
      }
      if (!m.foamed) { if (inp.hold) m.foam += dt; else if (rel) { if (m.foam >= m.need) m.foamed = true; else { m.fault('patchy foam'); m.foam = 0; } } }
      else { if (inp.press) { m.fault('dwell cut short'); m.dwell = 0; } else m.dwell += dt; if (m.dwell >= dwellT) { m.finish(i); return; } }
      s.prog = m.foamed ? 0.5 + 0.5 * m.dwell / dwellT : 0.5 * Math.min(1, m.foam / m.need);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 };
      if (i < 2) { const su = m.suits[i], z = su.cov.findIndex((c, q) => c < need(su, q)); return z < 0 ? { at: i, hold: false } : { at: i, hold: true, look: ZONES[z][1] }; }
      return m.foamed ? { at: i } : { at: i, hold: m.foam < m.need + 0.1 }; };
    m.bad = (f = 0) => { const i = m.next; return i < 2 ? { at: i, hold: f % 40 < 25, look: 0.1 } : { at: i, hold: f % 20 < 5, press: f % 20 === 0 }; };
    m.view = () => ({ s: m.suits.map(s => s.cpm), n: +m.need.toFixed(2) });
    m.panel = (i) => {
      if (i < 2) { const su = m.suits[i]; if (!su) return null; const z = m.zone; const left = ZONES.filter((_, q) => su.cov[q] < need(su, q)).map(x => x[0]).join(', ');
        return { label: z >= 0 ? `Scanning ${ZONES[z][0]}: ${su.cpm[z]} cpm${su.cpm[z] > 100 ? ' HOT (over limit 100)' : ''}` : 'Aim at a zone', value: left ? `left: ${left}` : 'all zones covered: let go', bar: su.cov.reduce((a, c, q) => a + c / need(su, q), 0) / 4 }; }
      return m.foamed ? { label: 'Foam dwell', value: `${Math.max(0, dwellT - m.dwell).toFixed(1)} s left · hands off`, bar: m.dwell / dwellT } : { label: 'Decon foam', value: m.foam >= m.need ? 'covered: let go' : 'spraying…', bar: m.foam / m.need, band: [1, 1] };
    };
    m.prompt = (i) => i < 2 ? 'Hold [E] and aim the scanner at hands, face, seals and boots until every zone is covered' : m.foamed ? 'Leave the foam alone until the dwell timer runs out' : 'Hold [E] to foam the floor until covered, then let go';
    return m;
  },
});
