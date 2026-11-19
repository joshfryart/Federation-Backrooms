// Sensor officer: lifeform scanner spot check. Six deck tiles carry the crew roster's expected headcount. Sweep a deck (its digit) and the
// lifesign count climbs to its reading. A deck that reads short, over or blank is flagged, but a first sweep can glitch: sweep the flagged
// deck AGAIN. A gap that reads the same twice is real: call the bridge on it (Space). A count that comes back to the roster was a glitch and
// is cleared. Log the check (Enter) once every deck is swept and every confirmed gap is called. Calling a glitch, calling before the second
// sweep, or logging with a real gap uncalled are faults.
import { define, machine, DIG, SPACE, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'sensor', label: 'Lifeform scanner spot check', type: 'loop' },
  title: 'Deck headcount double sweep', dept: 'sciences', host: 'console', tool: 'Lifeform scanner',
  how: 'Sweep each deck (1-6) and compare its lifesign count with the roster. Re-sweep any mismatch: if it reads the same twice, call the bridge (Space); if it matches, it was a glitch. Log with Enter.',
  keys: ['1-6 sweep a deck', 'Space call the bridge', 'Enter log the check'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 're-sweep to confirm', input: 'digits+enter+space', win: 'all six decks swept against the roster, every mismatch swept a second time, and only gaps that read the same twice called to the bridge',
    fail: 'calling the bridge over a first-sweep glitch, calling before the confirming sweep, or logging the check with a real missing crew member uncalled',
    rule: 'Press a deck digit to sweep it. A count that differs from the roster flags the tile: sweep it again. Same wrong count twice: Space calls it in. Back to roster: cleared. Enter logs once all decks are settled.' },
  rush: 'Took the first sweep at face value and called every odd number up to the bridge.',
  captions: { 'called a glitch': 'bridge sighs', unconfirmed: 'bridge asks to confirm', 'gap ignored': 'missing crew alarm', unfinished: 'log rejects' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, sweepT = m.calm ? 0.9 : 0.7;
    const kinds = shuffle(r, ['real', 'glitch', r() < 0.5 ? 'real' : 'glitch', 'ok', 'ok', 'ok']);
    m.decks = kinds.map((k, i) => { const ros = ri(r, 6, 24), off = k === 'ok' ? 0 : r() < 0.3 && k === 'glitch' ? -ros : (r() < 0.7 ? -1 : 1) * ri(r, 1, 3);
      return { n: i + 1, kind: k, ros, first: ros + off, second: k === 'real' ? ros + off : ros, st: 'new', shown: 0, called: false, passes: 0 }; });
    m.cur = -1; m.sw = 0; m.round = 0; m.rounds = 6;
    const D = () => m.decks[m.cur];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (!down) return !!(d || SPACE(code) || ENTER(code));
      if (d >= 1 && d <= 6) { if (m.sw > 0) return true; const k = m.decks[d - 1]; if (k.st === 'new' || k.st === 'flag') { m.cur = d - 1; m.sw = sweepT; k.shown = 0; } return true; }
      if (m.sw > 0 && (SPACE(code) || ENTER(code))) return true;
      if (SPACE(code)) { const k = D(); if (!k) return true; if (k.st === 'gap' && !k.called) k.called = true; else if (k.st === 'flag') m.fault('unconfirmed'); else if (!k.called) m.fault('called a glitch'); return true; }
      if (ENTER(code)) { if (m.decks.some(k => k.st === 'gap' && !k.called)) m.fault('gap ignored'); else if (m.decks.some(k => k.st === 'new' || k.st === 'flag')) m.fault('unfinished'); else m.win(); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.sw <= 0) return; m.sw -= dt; const k = D(), val = k.passes ? k.second : k.first; k.shown = Math.round(val * Math.min(1, 1 - m.sw / sweepT));
      if (m.sw <= 0) { k.shown = val; k.passes++; if (k.passes === 1) k.st = val === k.ros ? 'ok' : 'flag'; else k.st = val === k.ros ? 'clear' : 'gap'; m.round = m.decks.filter(x => x.st !== 'new' && x.st !== 'flag').length; }
    };
    m.hint = () => {
      if (m.sw > 0) return []; const k = D(); if (k && k.st === 'gap' && !k.called) return [['Space', true]];
      const nx = m.decks.find(x => x.st === 'new' || x.st === 'flag'); return nx ? [['Digit' + nx.n, true]] : [['Enter', true]];
    };
    m.bad = () => { if (m.sw > 0) return null; const k = D(); if (k && k.st === 'flag') return 'Space'; const nx = m.decks.find(x => x.st === 'new'); return nx ? 'Digit' + nx.n : 'Enter'; };
    m.view = () => ({ d: m.decks.map(k => [k.ros, k.first, k.second]) });
    m.buttons = () => [...m.decks.map(k => ['Digit' + k.n, 'Deck ' + k.n]), ['Space', 'Call bridge'], ['Enter', 'Log']];
    m.draw = (c, W, H, P) => {
      txt(c, 'LIFESIGN SWEEP · deck count vs roster', 14, 18, { size: 11, col: COL.gold });
      m.decks.forEach((k, i) => { const x = 14 + (i % 3) * 126, y = 28 + Math.floor(i / 3) * 60, sel = i === m.cur;
        box(c, x, y, 118, 52, 'rgba(255,255,255,.05)', sel ? COL.gold : COL.dim, 5);
        txt(c, `DECK ${k.n}`, x + 8, y + 15, { size: 11, col: COL.pale }); txt(c, `roster ${k.ros}`, x + 8, y + 31, { size: 10, col: COL.dim });
        const v = k.st === 'new' && !(sel && m.sw > 0) ? '—' : (k.shown === 0 && k.st !== 'new' ? 'BLANK' : String(k.shown)); txt(c, v, x + 70, y + 31, { size: 15 });
        const tag = { new: '', ok: 'match', flag: 'RE-SWEEP', clear: 'glitch cleared', gap: k.called ? 'CALLED IN' : 'GAP — call' }[k.st];
        txt(c, tag, x + 8, y + 46, { size: 9, col: k.st === 'flag' || k.st === 'gap' ? COL.warn : COL.dim });
        if (k.st !== 'new') lamp(c, x + 106, y + 14, 6, k.st === 'ok' || k.st === 'clear' ? P.good : P.bad, k.st === 'ok' || k.st === 'clear' ? 'circle' : 'triangle'); });
      txt(c, m.sw > 0 ? 'sweeping…' : 'digit sweep · Space call · Enter log', 14, 160, { size: 10, col: COL.dim });
    };
    return m;
  },
});
