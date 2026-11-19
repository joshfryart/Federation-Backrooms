// Armory, survey mission: issue sidearms and trackers to the landing party. Call each name on the roster in turn. Turn the tracker's channel dial
// (hold ← or →) until the away-channel lamp stops flickering and burns steady (it flickers faster the closer you are), then hand the sidearm and
// tracker across (Space). The crew member signs the roster beside their name; only when the signature is complete do you call the next name
// (Enter). Handing over a tracker that is off channel, or calling the next name over an unsigned line, is a fault.
import { define, machine, ARROW, SPACE, ENTER, rf, shuffle, clamp, txt, box, lamp, COL } from './kit.js';

const NAMES = ['Lt Haraldsen', 'Ens. Quill', 'PO Matsuda', 'Ens. Varga', 'Lt Oyelaran', 'PO Brisk', 'Ens. Delacroix'];
export default define({
  job: { billet: 'armory', label: 'Issue sidearms and trackers to the landing party', type: 'task:survey' },
  title: 'Away-channel dial and roster sign', dept: 'security', host: 'console', tool: 'Roster screen and tracker dial',
  how: 'Hold ← or → to turn the tracker dial until the away-channel lamp burns steady, hand over the sidearm and tracker with Space, wait for the signature, then Enter to call the next name.',
  keys: ['hold ← → turn the dial', 'Space hand over', 'Enter next name'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'dial and hand', input: 'arrows-hold+space+enter', win: 'each landing-party member in roster order handed a sidearm and a tracker dialled to the away channel, signed for before the next name is called',
    fail: 'handing over a tracker whose lamp still flickers, or calling the next name before the signature is written',
    rule: 'Hold an arrow to turn the dial: the lamp flickers faster as you near the away channel and burns steady on it. Release, Space to hand over, then wait for the signature before Enter.' },
  rush: 'Handed out a sidearm and a tracker to each pair of hands at the door.',
  captions: { 'off channel': 'tracker static', unsigned: 'roster pen taps', skipped: 'someone asks: what about me?' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.04 : 0.025, spd = 0.35;
    m.crew = shuffle(r, NAMES).slice(0, 4).map(n => ({ n, ch: rf(r, 0.1, 0.9), d: 0, st: 'dial', sig: 0 }));
    m.crew.forEach(p => { p.d = clamp(p.ch + (r() < 0.5 ? -1 : 1) * rf(r, 0.3, 0.6), 0.02, 0.98); if (Math.abs(p.d - p.ch) < 0.25) p.d = p.ch > 0.5 ? 0.02 : 0.98; });
    m.i = 0; m.rounds = 4; m.round = 0;
    const P = () => m.crew[m.i];
    const steady = (p) => Math.abs(p.d - p.ch) < tol;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), p = P();
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (!down) return SPACE(code) || ENTER(code); if (!p) return false;
      if (SPACE(code)) { if (p.st !== 'dial') return true; if (!steady(p)) { m.fault('off channel'); return true; } p.st = 'sign'; m.held = {}; return true; }
      if (ENTER(code)) {
        if (p.st === 'dial') { m.fault('skipped'); return true; } if (p.sig < 1) { m.fault('unsigned'); return true; }
        m.i++; m.round++; if (m.i >= m.crew.length) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const p = P(); if (!p) return;
      if (p.st === 'dial') p.d = clamp(p.d + ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * spd * dt);
      else if (p.st === 'sign') { p.sig = clamp(p.sig + dt / 1.1); if (p.sig >= 1) p.st = 'signed'; }
    };
    m.hint = () => {
      const p = P(); if (!p) return [];
      if (p.st === 'dial') { const e = p.ch - p.d; if (Math.abs(e) < tol * 0.5) return [['ArrowRight', false], ['ArrowLeft', false], ['Space', true]]; return [[e > 0 ? 'ArrowRight' : 'ArrowLeft', true], [e > 0 ? 'ArrowLeft' : 'ArrowRight', false]]; }
      return p.st === 'signed' ? [['Enter', true]] : [];
    };
    m.bad = () => { const p = P(); return p && p.st === 'dial' ? 'Space' : 'Enter'; };
    m.view = () => ({ crew: m.crew.map(p => [p.n, +p.ch.toFixed(3)]) });
    m.buttons = () => [['ArrowLeft', '◀ dial'], ['ArrowRight', 'dial ▶'], ['Space', 'Hand over'], ['Enter', 'Next name']];
    m.draw = (c, W, H, Pal) => {
      txt(c, 'LANDING-PARTY ROSTER', 14, 18, { size: 10, col: COL.dim });
      m.crew.forEach((p, k) => {
        const y = 38 + k * 26, cur = k === m.i; if (cur) box(c, 8, y - 15, 170, 22, 'rgba(244,194,91,.16)', COL.gold, 4);
        txt(c, p.n, 14, y, { size: 12, col: cur ? COL.gold : COL.ink });
        if (p.sig > 0) { c.strokeStyle = COL.pale; c.lineWidth = 2; c.beginPath(); for (let x = 0; x <= p.sig * 50; x += 3) c.lineTo(120 + x, y - 4 + Math.sin(x * 0.7) * 4); c.stroke(); }
      });
      const p = P(); if (!p) return;
      const cx = 280, cy = 82; c.beginPath(); c.arc(cx, cy, 44, 0, 6.283); c.strokeStyle = COL.peri; c.lineWidth = 3; c.stroke();
      const ang = -2.4 + p.d * 4.8; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang) * 40, cy + Math.sin(ang) * 40); c.strokeStyle = COL.gold; c.stroke();
      const dist = Math.abs(p.d - p.ch), on = dist < tol, near = dist < 0.25, hz = on ? 0 : near ? 2 + (0.25 - dist) * 40 : 0, lit = on || (near && Math.sin(m.t * hz * 6.283) > 0);
      lamp(c, 360, 40, 11, lit ? Pal.good : '#2a2a2a', on ? 'circle' : 'triangle'); txt(c, on ? 'STEADY' : near ? 'flicker' : 'dark', 360, 66, { size: 10, align: 'center', col: COL.dim });
      txt(c, p.st === 'dial' ? 'dial to the away channel' : p.st === 'sign' ? 'signing…' : 'signed — Enter', 280, H - 12, { size: 11, align: 'center', col: COL.dim });
    };
    return m;
  },
});
