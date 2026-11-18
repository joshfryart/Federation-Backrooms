// Ops: prioritise comms with the receiving station. Set the channel's priority flag (↑), then type the handoff coordinates into the channel's
// note field. The link keeps fading and dropping, and a drop wipes anything typed but not yet saved (Enter), so save in bursts between drops.
// With every coordinate saved, send the test line (Space) while the link is up and wait for the station's reply.
import { define, machine, DIG, ARROW, ENTER, SPACE, ri, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ops', label: 'Prioritise comms with the receiving station', type: 'task:medical_relief' },
  title: 'Save-between-drops channel note', dept: 'operations', host: 'console', tool: 'Comms console receiving channel',
  how: 'Set the priority flag (↑), type the handoff coordinates (digits) and save them (Enter) before each link drop wipes the unsaved part, then send the test line (Space) on an open link and wait for the reply.',
  keys: ['↑ priority flag', '1-9 type', 'Enter save note', 'Space send test line'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'save between drops', input: 'arrows+digits+enter+space', win: 'priority flag set, every handoff coordinate saved to the channel note through the drops, and a test line answered',
    fail: 'letting a drop wipe unsaved coordinates, or sending the test line into a drop, without priority or before the note is saved',
    rule: 'The signal bar fades for a moment before each drop. Whatever is typed but unsaved when it drops is lost. Save with Enter when the fade starts; send the test line only when the full note is saved and the link is up.' },
  rush: 'Sent the coordinates by voice and hoped the link held.',
  captions: { 'coordinates lost': 'link drop crackle', 'sent into drop': 'dead carrier hiss', 'not ready': 'console blip' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, fade = m.calm ? 1.0 : 0.7, down = 0.9;
    m.coords = Array.from({ length: 8 }, () => ri(r, 1, 9)); m.drops = []; let t = rf(r, 1.4, 2.0); while (t < 80) { m.drops.push(t); t += down + rf(r, 2.0, 3.0); }
    m.prio = false; m.saved = 0; m.buf = []; m.sent = -1; m.last = -9; m.msg = ''; m.reply = '';
    const st = () => { for (const d of m.drops) { if (m.t >= d - fade && m.t < d) return 'fade'; if (m.t >= d && m.t < d + down) return 'down'; } return 'up'; };
    m.wasDown = false;
    m.key = (code, dn = true) => {
      if (m.state !== 'play') return false; const d = DIG(code), a = ARROW(code); if (!dn) return !!d || a === 'U' || ENTER(code) || SPACE(code);
      if (a === 'U') { m.prio = true; m.last = m.t; return true; }
      if (d) { m.last = m.t; if (st() !== 'down' && m.saved + m.buf.length < 8) m.buf.push(d); return true; }
      if (ENTER(code)) { m.last = m.t; if (st() !== 'down' && m.buf.length) { m.saved += m.buf.length; m.buf = []; m.msg = `note saved (${m.saved}/8)`; } return true; }
      if (SPACE(code)) {
        m.last = m.t;
        if (!m.prio || m.saved < 8) { m.fault('not ready'); m.msg = !m.prio ? 'Channel still routine — set priority' : 'Save the full note before the test line'; }
        else if (st() === 'down') { m.fault('sent into drop'); m.msg = 'Link is down'; } else if (m.sent < 0) { m.sent = m.t; m.msg = 'Test line sent…'; }
        return true;
      }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const s = st();
      if (s === 'down' && !m.wasDown) { if (m.buf.length) { m.fault('coordinates lost'); m.msg = `Drop! ${m.buf.length} unsaved digits lost`; m.buf = []; } if (m.sent >= 0) { m.sent = -1; m.msg = 'Drop! test line lost — resend'; } }
      m.wasDown = s === 'down'; if (m.sent >= 0 && m.t - m.sent > 0.6) { m.reply = 'Receiving station: "Reading you five by five, coordinates logged."'; m.win(); }
    };
    m.hint = () => {
      if (m.t - m.last < 0.12) return []; const s = st(); if (!m.prio) return [['ArrowUp', true]];
      if (m.saved >= 8) return s === 'up' && m.sent < 0 ? [['Space', true]] : [];
      if (s === 'down') return []; if (s === 'fade' || m.saved + m.buf.length >= 8) return m.buf.length ? [['Enter', true]] : [];
      return [[`Digit${m.coords[m.saved + m.buf.length]}`, true]];
    };
    m.bad = () => (m.t - m.last < 0.2 ? null : `Digit${m.coords[0]}`);
    m.view = () => ({ coords: m.coords.join(''), drops: m.drops.slice(0, 5).map(x => +x.toFixed(2)) });
    m.buttons = () => [['ArrowUp', '↑ Priority'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => [`Digit${d}`, `${d}`]), ['Enter', 'Save'], ['Space', 'Test line']];
    m.draw = (c, W, H, P) => {
      const s = st(), sig = s === 'down' ? 0 : s === 'fade' ? 0.35 + 0.15 * Math.sin(m.t * 30) : 0.85;
      txt(c, `RECEIVING STATION · ${m.prio ? '▲ PRIORITY' : 'routine'}`, 14, 20, { size: 12, col: m.prio ? COL.gold : COL.dim });
      txt(c, 'SIGNAL', 14, 40, { size: 10, col: COL.dim }); bar(c, 64, 31, 200, 12, sig, { col: s === 'up' ? P.good : s === 'fade' ? COL.warn : P.bad }); txt(c, s === 'up' ? 'link up' : s === 'fade' ? 'FADING' : 'DROPPED', 274, 41, { size: 11, col: s === 'up' ? P.good : P.bad });
      txt(c, `Handoff coordinates on the card: ${m.coords.slice(0, 4).join('')} · ${m.coords.slice(4).join('')}`, 14, 66, { size: 12, col: COL.pale });
      box(c, 14, 76, 372, 30, 'rgba(255,255,255,.05)', COL.peri, 6); txt(c, 'NOTE', 22, 95, { size: 10, col: COL.dim });
      for (let i = 0; i < 8; i++) { const v = i < m.saved ? m.coords[i] : i < m.saved + m.buf.length ? m.buf[i - m.saved] : '_'; txt(c, v, 70 + i * 22 + (i >= 4 ? 10 : 0), 97, { size: 15, col: i < m.saved ? P.good : COL.warn }); }
      txt(c, `saved ${m.saved}/8 · unsaved ${m.buf.length}`, 280, 97, { size: 10, col: COL.dim });
      txt(c, m.reply || m.msg, 14, H - 12, { size: 11, col: COL.pale });
    };
    return m;
  },
});
