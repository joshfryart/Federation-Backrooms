// Damage control: fix defects found during shakedown. Work the defect list from the top. For each entry pick its replacement part from the
// stores shelf by number (sizes matter: two seals differ only in their bore), which fits it at the site. Then run the spec test (Space): a
// wrong part reads FAIL and has to be swapped. Only a fresh PASS lets the entry close (Enter). Closing without a passing test after the last
// fit is a fault and the entry goes back to the bottom of the list.
import { define, machine, DIG, ENTER, SPACE, ri, pick, shuffle, txt, box, COL } from './kit.js';

const DEFECTS = [['Coolant union weeping', 'Union seal', 'holds 40 psi'], ['Hatch dog will not seat', 'Dog spring', 'seats in 2 turns'], ['Duct cover rattles', 'Clip set', 'no rattle at 1 g'],
  ['Pump gland drips', 'Gland packing', 'dry for 30 s'], ['Panel hinge binds', 'Hinge pin', 'swings free'], ['Valve stem leaks', 'Stem O-ring', 'holds 60 psi']];
export default define({
  job: { billet: 'dc', label: 'Fix defects found during shakedown', type: 'task:shakedown' },
  title: 'Defect list fit-test-close', dept: 'engineering', host: 'console', tool: 'Defect list terminal',
  how: 'For the top defect press the shelf number of its exact part (check the size) to fit it, press Space to run the spec test, and only after a PASS press Enter to close it.',
  keys: ['1-6 fit a shelf part', 'Space spec test', 'Enter close the entry'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'retest before closing', input: 'digits+enter+space', win: 'four shakedown defects fitted with their exact part, spec-tested to a fresh PASS, then closed',
    fail: 'closing a defect without a passing retest after the last fit, so the entry is returned to the list',
    rule: 'Top entry only. A digit fits that shelf part (it takes a moment). Space runs the spec test on what is fitted: PASS only for the exact part and size. Enter closes the entry, and only after a PASS since the last fit.' },
  rush: 'Fitted the parts and closed the list without testing a thing.',
  captions: { 'closed untested': 'entry bounces back', pass: 'test chime', fail: 'test buzzer' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, picks = shuffle(r, DEFECTS).slice(0, 4), bores = [8, 12, 16, 20];
    m.list = picks.map(([d, part, spec]) => ({ d, part: `${part} ${pick(r, bores)} mm`, base: part, spec, site: `${['Deck', 'Frame', 'Junction'][ri(r, 0, 2)]} ${ri(r, 2, 19)}` }));
    const shelf = m.list.map(e => e.part); for (const e of m.list.slice(0, 2)) { let alt; do alt = `${e.base} ${pick(r, bores)} mm`; while (alt === e.part); shelf.push(alt); }
    m.shelf = shuffle(r, shelf); m.fit = null; m.test = null; m.busy = 0; m.doing = ''; m.closed = 0; m.round = 0; m.rounds = 4;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), e = m.list[0];
      if (!d && !SPACE(code) && !ENTER(code)) return false; if (m.busy > 0 || !e) return true;
      if (d) { if (d <= m.shelf.length) { m.fit = m.shelf[d - 1]; m.test = null; m.busy = 0.5; m.doing = 'fitting'; } return true; }
      if (SPACE(code)) { if (m.fit) { m.busy = 0.8; m.doing = 'testing'; } return true; }
      if (m.test !== 'PASS') { m.fault('closed untested'); m.list.push(m.list.shift()); m.fit = null; m.test = null; return true; }
      m.list.shift(); m.closed++; m.round = m.closed; m.fit = null; m.test = null; if (!m.list.length) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.busy > 0) { m.busy -= dt; if (m.busy <= 0 && m.doing === 'testing') { m.test = m.fit === m.list[0]?.part ? 'PASS' : 'FAIL'; m.ev(m.test === 'PASS' ? 'pass' : 'fail'); } if (m.busy <= 0) m.doing = ''; } };
    m.hint = () => { const e = m.list[0]; if (!e || m.busy > 0) return []; if (m.fit !== e.part) return [['Digit' + (m.shelf.indexOf(e.part) + 1), true]]; if (m.test !== 'PASS') return [['Space', true]]; return [['Enter', true]]; };
    m.bad = () => { const e = m.list[0]; if (!e || m.busy > 0) return null; return m.fit === e.part ? 'Enter' : 'Digit' + (m.shelf.indexOf(e.part) + 1); };
    m.view = () => ({ l: m.list.map(e => e.part), s: m.shelf });
    m.buttons = () => [...m.shelf.map((p, k) => ['Digit' + (k + 1), String(k + 1)]), ['Space', 'Spec test'], ['Enter', 'Close']];
    m.draw = (c, W, H, P) => {
      m.list.forEach((e, k) => txt(c, `${k === 0 ? '▶' : ' '} ${e.d} · ${e.site}`, 12, 16 + k * 14, { size: 11, col: k === 0 ? COL.gold : COL.dim }));
      const e = m.list[0]; if (e) { txt(c, `needs ${e.part} · spec: ${e.spec}`, 12, 80, { size: 11, col: COL.pale });
        txt(c, `fitted: ${m.fit || '—'}   ${m.doing ? m.doing + '…' : m.test ? 'test ' + m.test : m.fit ? 'not tested' : ''}`, 12, 96, { size: 11, col: m.test === 'PASS' ? P.good : m.test === 'FAIL' ? P.bad : COL.ink }); }
      m.shelf.forEach((p, k) => { const x = 12 + (k % 3) * 128, y = 108 + Math.floor(k / 3) * 28; box(c, x, y, 122, 24, COL.panel, m.fit === p ? COL.gold : COL.dim, 4); txt(c, `${k + 1} ${p}`, x + 6, y + 16, { size: 10 }); });
      txt(c, `closed ${m.closed}/4`, 330, 16, { size: 11, col: COL.pale });
    };
    return m;
  },
});
