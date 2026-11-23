// CFO: review helm and nav status. Each line of the ops slate is an order (heading, bearing, trim, throttle, next waypoint) and the station
// reads its own figure back over the voice link. Wait for the read-back, then judge it against the order to half a unit: agree (Enter) or
// circle it and call the correction (Space), after which the station reads back again. A drift passed as agreed takes the ship off course.
import { define, machine, SPACE, ENTER, rf, ri, pick, shuffle, txt, box, lamp, COL } from './kit.js';

const LINES = [['Heading', 'helm', '°'], ['Bearing', 'nav', '°'], ['Trim', 'helm', '°'], ['Throttle', 'helm', '%'], ['Waypoint ETA', 'nav', 'min']];
export default define({
  job: { billet: 'cfo', label: 'Review helm and nav status', type: 'loop' },
  title: 'Helm and nav read-back tolerance', dept: 'flight', host: 'console', tool: 'Ops slate and voice link',
  how: 'Wait for each station to read back its figure, compare it with the order on the slate: Enter if it is within half a unit, Space to circle it and call the correction.',
  keys: ['Enter agrees', 'Space circles and corrects'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'read-back judge', input: 'space+enter', win: 'every ordered figure agreed only once the station read-back lies within half a unit of the slate',
    fail: 'agreeing a read-back that drifts more than half a unit, correcting one that was fine, or confirming before the station speaks',
    rule: 'The slate shows the order; the station answers after a moment. Off by more than 0.5: Space and wait for the corrected read-back. Within 0.5: Enter.' },
  rush: 'Glanced at the big numbers and pressed confirm.',
  captions: { 'drift passed': 'course warning chirp', 'false correction': 'helm grumbles', unconfirmed: 'voice link still open' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, wait = m.calm ? 0.6 : 0.8;
    const offs = shuffle(r, [rf(r, 0.6, 1.4), rf(r, 0.6, 1.2), rf(r, 0, 0.4), rf(r, 0, 0.45), rf(r, 0.55, 1.0)]);
    m.lines = LINES.map(([name, st, u], i) => { const order = name === 'Throttle' ? ri(r, 40, 90) : name === 'Waypoint ETA' ? ri(r, 12, 58) : +rf(r, 0, 359).toFixed(1); return { name, st, u, order, said: +(order + (r() < 0.5 ? -1 : 1) * offs[i]).toFixed(1), fixed: false }; });
    m.i = 0; m.wait = rf(r, 0.5, 1.0); m.rounds = 5; m.round = 1;
    const L = () => m.lines[Math.min(m.i, m.lines.length - 1)], bad = (l) => Math.abs(l.said - l.order) > 0.5 + 1e-9;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !(SPACE(code) || ENTER(code))) return false; const l = L();
      if (m.wait > 0) { m.fault('unconfirmed'); return true; }
      if (SPACE(code)) { if (!bad(l)) { m.fault('false correction'); return true; } l.said = l.order; l.fixed = true; m.wait = wait + rf(r, 0, 0.4); m.ev('correct', { line: m.i }); return true; }
      if (bad(l)) { m.fault('drift passed'); l.said = l.order; m.wait = wait; return true; }
      m.i++; m.round = Math.min(5, m.i + 1); if (m.i >= m.lines.length) m.win(); else m.wait = rf(r, 0.5, 1.0); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.wait > 0) m.wait -= dt; };
    m.hint = () => m.wait > 0 ? [] : [[bad(L()) ? 'Space' : 'Enter', true]];
    m.bad = () => m.wait > 0 ? null : 'Enter';
    m.view = () => ({ l: m.lines.map(l => [l.order, l.said]) });
    m.buttons = () => [['Enter', 'Agree'], ['Space', 'Circle + correct']];
    m.draw = (c, W, H, P) => {
      txt(c, 'ORDER', 150, 18, { size: 10, col: COL.dim }); txt(c, 'READ-BACK', 250, 18, { size: 10, col: COL.dim });
      m.lines.forEach((l, k) => {
        const y = 24 + k * 27, cur = k === m.i; box(c, 14, y, 372, 23, cur ? COL.panel : null, cur ? COL.gold : null, 5);
        txt(c, `${l.name} (${l.st})`, 22, y + 16, { size: 12, col: k < m.i ? COL.dim : COL.ink });
        txt(c, `${l.order}${l.u}`, 150, y + 16, { size: 13, col: COL.pale });
        const heard = k < m.i || (cur && m.wait <= 0); txt(c, heard ? `${l.said}${l.u}` : cur ? '…listening' : '', 250, y + 16, { size: 13, col: heard ? COL.ink : COL.dim });
        if (k < m.i) lamp(c, 360, y + 11, 8, P.good, 'circle'); else if (l.fixed) txt(c, 'circled', 330, y + 16, { size: 10, col: COL.warn });
      });
    };
    return m;
  },
});
