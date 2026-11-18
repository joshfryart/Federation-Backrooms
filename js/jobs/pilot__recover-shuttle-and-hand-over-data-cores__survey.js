// Pilot: recover the survey shuttle and hand over the data cores. Braking is in steps: each tap of Space fires one reverse-thrust pulse and
// knocks a fixed amount off the closing speed, so you meter pulses against the distance left and arrive on the marks inside the landing band:
// too fast is a hard landing, too many pulses and you stall short. The core bay was left open for the readout on the way home; shut it (Enter)
// before wheels-down or a core is lost. Then lift the cores out in the order on the science officer's receipt (digits = slot).
import { define, machine, ri, rf, shuffle, txt, box, bar, COL, DIG, SPACE, ENTER } from './kit.js';

export default define({
  job: { billet: 'pilot', label: 'Recover shuttle and hand over data cores', type: 'task:survey' },
  title: 'Pulse-braked recovery and core handover', dept: 'flight', host: 'console', tool: 'Approach board',
  how: 'Tap Space for one reverse-thrust pulse at a time and reach the landing marks inside the green speed band. Shut the core bay with Enter before you land. Then press each core\'s slot number in the receipt order.',
  keys: ['Space reverse pulse', 'Enter shut core bay', '1-4 hand over core'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'pulse-brake', input: 'space+enter+digits',
    win: 'shuttle set on the marks inside the landing speed band with the core bay shut, then every data core handed over in receipt order',
    fail: 'arriving too fast, stalling short with too many pulses, landing with the core bay open, or handing over the wrong core',
    rule: 'Each Space tap removes one step of closing speed. Meter pulses against the distance so you reach the marks inside the band, shut the bay with Enter first, then key the receipt order.' },
  rush: 'Dropped onto the pad hard and passed the cores out in a bundle.',
  captions: { 'hard landing': 'gear slams', 'stalled short': 'engines sputter', 'core lost': 'core clatters', 'wrong core': 'officer: not that one' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, STEP = m.calm ? 1.1 : 1.4, BAND = [1.4, m.calm ? 4 : 3.4];
    m.d0 = ri(r, 55, 70); m.v0 = +rf(r, 10, 13).toFixed(1); m.d = m.d0; m.v = m.v0; m.bay = false; m.phase = 'fly'; m.flash = 0;
    const n = ri(r, 3, 4); m.slots = shuffle(r, ['C-1', 'C-2', 'C-3', 'C-4'].slice(0, n)); m.receipt = shuffle(r, m.slots.slice()); m.got = 0;
    const around = (why) => { m.fault(why); m.d = 40; m.v = 9; m.flash = 0.8; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const s = SPACE(code), e = ENTER(code), n = DIG(code); if (!s && !e && !n) return false; if (!down) return true;
      if (m.phase === 'fly') { if (s) m.v = Math.max(0, m.v - STEP); if (e) m.bay = true; return true; }
      if (n && m.slots[n - 1]) { if (m.slots[n - 1] === m.receipt[m.got]) { m.got++; m.ev('core', { n }); if (m.got >= m.receipt.length) m.win(); } else if (!m.receipt.slice(0, m.got).includes(m.slots[n - 1])) { m.fault('wrong core'); m.flash = 0.6; } }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); if (m.phase !== 'fly') return;
      m.d -= m.v * dt;
      if (m.v < 0.3 && m.d > 0) around('stalled short');
      else if (m.d <= 0) { if (m.v > BAND[1]) around('hard landing'); else if (!m.bay) around('core lost'); else { m.phase = 'cores'; m.ev('wheels down', { v: +m.v.toFixed(2) }); } }
    };
    m.hint = () => {
      if (m.phase === 'fly') { if (!m.bay) return [['Enter', true], ['Enter', false]]; const want = (BAND[0] + BAND[1]) / 2 + m.d * 0.16;
        return m.v - STEP > want - 0.4 && m.v > want ? [['Space', true], ['Space', false]] : []; }
      const k = m.slots.indexOf(m.receipt[m.got]); return [['Digit' + (k + 1), true], ['Digit' + (k + 1), false]];
    };
    m.bad = () => 'Space';
    m.view = () => ({ d0: m.d0, v0: m.v0, slots: m.slots, receipt: m.receipt });
    m.buttons = () => [['Space', 'Pulse'], ['Enter', 'Shut bay'], ...m.slots.map((_, k) => ['Digit' + (k + 1), `Slot ${k + 1}`])];
    m.draw = (c, W, H, P) => {
      txt(c, m.phase === 'fly' ? 'APPROACH BOARD' : 'CORE HANDOVER', 12, 18, { size: 11, col: COL.peri });
      if (m.phase === 'fly') {
        txt(c, `Distance ${Math.max(0, m.d).toFixed(0)} m`, 12, 42, { size: 12 }); bar(c, 12, 50, 230, 10, 1 - Math.max(0, m.d) / 70, { mark: 1 });
        txt(c, `Closing ${m.v.toFixed(1)} m/s`, 12, 82, { size: 12 }); bar(c, 12, 90, 230, 10, m.v / 14, { band: [BAND[0] / 14, BAND[1] / 14] });
        txt(c, 'landing band (outlined)', 12, 116, { size: 9, col: COL.dim });
        box(c, 270, 34, 118, 52, 'rgba(255,255,255,.06)', m.bay ? P.good : P.bad, 6); txt(c, 'CORE BAY', 329, 54, { size: 11, col: COL.peri, align: 'center' });
        txt(c, m.bay ? 'SHUT ■' : 'OPEN ▲', 329, 74, { size: 13, col: m.bay ? P.good : P.bad, align: 'center' });
      } else {
        txt(c, 'Receipt: ' + m.receipt.map((x, k) => (k < m.got ? '✓' : '') + x).join('  '), 12, 42, { size: 12, col: COL.pale });
        m.slots.forEach((x, k) => { const done = m.receipt.slice(0, m.got).includes(x); box(c, 12 + k * 92, 60, 84, 50, done ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.08)', COL.dim, 6);
          txt(c, `${k + 1}`, 22 + k * 92, 78, { size: 11, col: COL.dim }); txt(c, done ? 'handed' : x, 54 + k * 92, 94, { size: 13, align: 'center', col: done ? COL.dim : COL.ink }); });
      }
      if (m.flash > 0) txt(c, 'GO AROUND / NOT THAT ONE', W - 12, H - 10, { size: 11, col: P.bad, align: 'right' });
    };
    return m;
  },
});
