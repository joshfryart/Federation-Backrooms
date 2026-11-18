// Comms officer, quiet watch: open channels and test PA. Each channel on the list gets the test phrase spoken into the headset mic. Hold Space
// to speak; the phrase takes a couple of seconds. Your voice level wanders as you talk, so ride it with ↑ (louder) and ↓ (softer) to keep it in
// the clear band. Over the top clips; trailing off under the floor for half a second means the test passes on a dead mic. Either restarts.
import { define, machine, ARROW, SPACE, rf, clamp, txt, box, bar, lamp, COL } from './kit.js';

const CH = ['All decks', 'Engineering', 'Sickbay', 'Cargo bay', 'Science labs', 'Shuttlebay', 'Security'];
const PHRASES = ['This is a test of the ship\'s address system', 'Bridge to all decks, test, test, one two', 'Comms check on the quarter hour, please stand by'];

export default define({
  job: { billet: 'comms', label: 'Open channels and test PA', type: 'task:quiet_watch' },
  title: 'PA phrase spoken at clear level', dept: 'operations', host: 'console', tool: 'Comms console and headset mic',
  how: 'Hold Space to speak the test phrase on each channel and ride your voice level with ↑ and ↓ so it stays in the clear band until the phrase ends.',
  keys: ['Space hold: speak', '↑ hold: louder', '↓ hold: softer'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'speak at level', input: 'arrows-hold+space-hold', win: 'the test phrase spoken right through on each channel with the voice never clipping or fading out',
    fail: 'clipping the mic, or trailing off so quietly the test would pass on a dead mic',
    rule: 'Hold Space and the phrase scrolls word by word; the voice meter drifts on its own. Hold ↑ or ↓ to keep the needle between the floor and the clip line until the last word.' },
  rush: 'Watched the channel lights go green and skipped the phrase.',
  captions: { clipped: 'speaker crackles', 'too quiet': 'dead air hiss' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dur = m.calm ? 2.2 : 2.6, lo = 0.3, hi = m.calm ? 0.92 : 0.88;
    m.chans = CH.slice(0, 1).concat(CH.slice(1).sort(() => r() - 0.5).slice(0, 3)); m.phrase = PHRASES[Math.floor(r() * PHRASES.length)];
    m.drifts = Array.from({ length: 160 }, () => rf(r, -0.55, 0.55));
    m.i = 0; m.prog = 0; m.lvl = 0.5; m.quiet = 0; m.rounds = 4; m.round = 0;
    const restart = () => { m.prog = 0; m.lvl = rf(r, 0.42, 0.6); m.quiet = 0; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (SPACE(code)) { if (down && !m.held.S) restart(); m.held.S = down; return true; }
      if (a === 'U' || a === 'D') { m.held[a] = down; return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (!m.held.S) return;
      const d = m.drifts[Math.floor(m.t * 2) % m.drifts.length]; m.lvl = clamp(m.lvl + (d + (m.held.U ? 1.1 : 0) - (m.held.D ? 1.1 : 0)) * dt, 0, 1);
      if (m.lvl > hi) { m.fault('clipped'); restart(); return; }
      m.quiet = m.lvl < lo ? m.quiet + dt : 0; if (m.quiet > 0.5) { m.fault('too quiet'); restart(); return; }
      m.prog += dt / dur; if (m.prog >= 1) { m.i++; m.round = m.i; m.prog = 0; m.held.S = false; if (m.i >= m.chans.length) m.win(); }
    };
    m.hint = () => [['Space', true], ['ArrowUp', m.lvl < 0.52], ['ArrowDown', m.lvl > 0.66]];
    m.bad = () => m.held.S ? 'ArrowUp' : 'Space';
    m.view = () => ({ c: m.chans, p: m.phrase, d: m.drifts.slice(0, 8).map(x => +x.toFixed(2)) });
    m.buttons = () => [['Space', 'Speak (hold)'], ['ArrowUp', '▲ Louder'], ['ArrowDown', '▼ Softer']];
    m.draw = (c, W, H, P) => {
      m.chans.forEach((ch, i) => { const y = 10 + i * 26, cur = i === m.i; box(c, 6, y, 130, 22, cur ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.05)', cur ? COL.orange : null, 8);
        lamp(c, 20, y + 11, 6, i < m.i ? P.good : COL.dim, i < m.i ? 'circle' : 'square'); txt(c, ch, 32, y + 15, { size: 10, col: i < m.i ? P.good : COL.ink }); });
      const words = m.phrase.split(' '), n = Math.floor(m.prog * words.length + 0.001);
      txt(c, words.slice(0, n).join(' ') || (m.held.S ? '…' : 'hold Space to speak'), 150, 30, { size: 11, col: COL.pale });
      txt(c, words.slice(n).join(' '), 150, 46, { size: 10, col: COL.dim });
      bar(c, 150, 70, 240, 16, m.lvl, { band: [lo, hi], col: m.lvl > hi - 0.06 ? P.bad : m.lvl < lo + 0.04 ? COL.warn : COL.gold });
      txt(c, 'floor', 150 + lo * 240, 100, { size: 9, col: COL.dim, align: 'center' }); txt(c, 'clip', 150 + hi * 240, 100, { size: 9, col: P.bad, align: 'center' });
      bar(c, 150, 116, 240, 6, m.prog, { col: COL.peri }); txt(c, m.quiet > 0 ? 'fading — speak up!' : m.held.S ? 'on air' : 'mic closed', 150, 140, { size: 11, col: m.quiet > 0 ? COL.warn : COL.dim });
    };
    return m;
  },
});
