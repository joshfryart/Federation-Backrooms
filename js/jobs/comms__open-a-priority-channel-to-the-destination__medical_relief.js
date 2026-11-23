// Comms officer, medical relief: open a priority channel to the destination. The frequency dial is heavy: holding ← or → spins it up and it
// coasts on after you let go. Bring it to rest on the destination's code from the list. Neighbouring channels light the carrier lamp too,
// but it flickers there. Hold steady on the destination until both handshake tones sound, then log the channel open (Space).
import { define, machine, ARROW, SPACE, rf, clamp, txt, box, bar, lamp, COL } from './kit.js';

const DEST = ['Starbase 12 Medical', 'Rigel relief camp', 'Hospital ship Solace', 'Colony Tarsus clinic'];

export default define({
  job: { billet: 'comms', label: 'Open a priority channel to the destination', type: 'task:medical_relief' },
  title: 'Heavy dial carrier handshake', dept: 'operations', host: 'console', tool: 'Frequency dial and carrier lock light',
  how: 'Spin the heavy frequency dial with ← and →, let it coast to rest on the destination code, wait on the steady lock for both handshake tones, then log the channel with Space.',
  keys: ['← → hold: spin the dial', 'Space log the channel open'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'dial to handshake', input: 'arrows-hold+space', win: 'the heavy dial coasted to rest on each destination code and logged only after both handshake tones',
    fail: 'logging on a flickering neighbour channel, or before the handshake has sounded both ways',
    rule: 'Holding an arrow speeds the dial up; it keeps coasting after release. Settle on the listed code; on a steady lamp count the two tones, then Space.' },
  rush: 'Logged the channel the moment the lock light first came on.',
  captions: { 'neighbour link': 'link flickers', 'no handshake': 'channel opens silent', tone: 'handshake tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, acc = 2.4, fr = 1.6, win = m.calm ? 0.1 : 0.07, hs = m.calm ? 1.2 : 1.5;
    const d0 = Math.floor(r() * DEST.length);
    m.goals = [0, 1].map(k => ({ n: DEST[(d0 + k) % DEST.length], f: +(rf(r, 300, 480)).toFixed(1) }));
    m.k = 0; m.f = m.goals[0].f + (r() < 0.5 ? -1 : 1) * rf(r, 1.6, 2.6); m.v = 0; m.steady = 0; m.rounds = 2; m.round = 0;
    const G = () => m.goals[Math.min(m.k, m.goals.length - 1)], err = () => G().f - m.f;
    const near = () => { const e = Math.abs(err()); return Math.abs(e - 0.4) < 0.08 ? 'flicker' : e < win && Math.abs(m.v) < 0.12 ? 'lock' : null; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (SPACE(code) && down) { const n = near(); if (n !== 'lock') { m.fault('neighbour link'); return true; } if (m.steady < hs) { m.fault('no handshake'); return true; }
        m.k++; m.round = m.k; m.steady = 0; if (m.k >= 2) { m.win(); return true; } m.f = G().f + (r() < 0.5 ? -1 : 1) * rf(r, 1.6, 2.6); m.v = 0; return true; }
      return a != null;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.v += ((m.held.R ? acc : 0) - (m.held.L ? acc : 0)) * dt; m.v *= Math.exp(-fr * dt); if (Math.abs(m.v) < 0.005) m.v = 0; m.f += m.v * dt;
      m.steady = near() === 'lock' ? m.steady + dt : 0;
    };
    m.hint = () => { if (near() === 'lock' && m.steady >= hs + 0.1) return [['Space', true], ['ArrowLeft', false], ['ArrowRight', false]];
      const vd = clamp(err() * 1.6, -1.6, 1.6); return [['ArrowRight', m.v < vd - 0.04], ['ArrowLeft', m.v > vd + 0.04]]; };
    m.bad = () => 'Space';
    m.view = () => ({ g: m.goals.map(g => [g.n, g.f]) });
    m.buttons = () => [['ArrowLeft', '◀ spin'], ['ArrowRight', 'spin ▶'], ['Space', 'Log open']];
    m.draw = (c, W, H, P) => {
      if (m.k >= 2) return; const g = G(), n = near(), on = n === 'lock' || (n === 'flicker' && Math.floor(m.t * 12) % 2 === 0);
      box(c, 8, 8, 170, 50, 'rgba(255,255,255,.05)', COL.peri, 6); txt(c, 'DESTINATION', 16, 24, { size: 9, col: COL.dim }); txt(c, g.n, 16, 38, { size: 11, col: COL.gold }); txt(c, `code ${g.f.toFixed(1)} MHz`, 16, 52, { size: 11, col: COL.pale });
      txt(c, `${m.f.toFixed(2)} MHz`, 200, 40, { size: 24, col: COL.ink }); txt(c, `dial speed ${m.v.toFixed(2)}`, 200, 58, { size: 10, col: COL.dim });
      c.strokeStyle = COL.dim; c.lineWidth = 1; for (let i = -6; i <= 6; i++) { const x = 200 + i * 15 + (m.f % 0.5) / 0.5 * -15; c.beginPath(); c.moveTo(x, 78); c.lineTo(x, i % 2 ? 86 : 92); c.stroke(); }
      c.fillStyle = COL.orange; c.fillRect(199, 72, 3, 26);
      lamp(c, 30, 100, 12, on ? (n === 'lock' ? P.good : COL.warn) : COL.dark, n === 'lock' ? 'circle' : 'triangle'); txt(c, n === 'lock' ? 'LOCK steady' : n === 'flicker' ? 'lock flickering' : 'no carrier', 50, 104, { size: 11, col: COL.pale });
      txt(c, 'handshake', 16, 132, { size: 9, col: COL.dim }); bar(c, 80, 124, 160, 10, m.steady / hs, { col: COL.peri });
      lamp(c, 260, 129, 6, m.steady >= hs / 2 ? P.good : COL.dark, 'diamond'); lamp(c, 278, 129, 6, m.steady >= hs ? P.good : COL.dark, 'diamond'); txt(c, 'tones', 292, 133, { size: 9, col: COL.dim });
    };
    return m;
  },
});
