// Comms officer, survey: keep the science team's comm channel clear. A second voice bleeds into the science feed. Step through the nearby
// channels (↑ ↓) and compare each one's voice print with the bleed under the science trace; the one that matches is the leak. Patch that
// input to a SPARE slot (its digit) on the patch panel, never to a live crew slot, then speak a test line (Space) to prove the feed is clean.
import { define, machine, DIG, ARROW, SPACE, ri, rf, shuffle, txt, box, COL } from './kit.js';

const NEAR = ['Bridge aux', 'Shuttle ops', 'Eng. talkback', 'Cargo net', 'Sec. patrol', 'Med. pager'];
const LIVE = ['Helm loop', 'Eng. deck 2', 'Security', 'Transporter', 'Sickbay'];

export default define({
  job: { billet: 'comms', label: "Keep the science team's comm channel clear", type: 'task:survey' },
  title: 'Crosstalk voice-print patch', dept: 'operations', host: 'console', tool: 'Patch panel view and headset',
  how: 'Find the nearby channel whose voice print matches the bleed on the science feed, patch it to a spare slot (never a live one), then speak a test line.',
  keys: ['↑ ↓ channel', '1-5 patch to slot', 'Space test line'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'unpatch the bleed', input: 'arrows+digits+space', win: 'the leaking channel matched by voice print and moved to a spare slot, then a clean test line heard, three times',
    fail: 'patching the leak onto a live crew slot, moving a clean channel, or testing while the bleed is still there',
    rule: 'Compare each channel\'s print with the bleed print; on the match press the digit of a slot marked SPARE, then Space. A slot with a crew name is live.' },
  rush: 'Turned the science channel gain down until the bleed was hard to hear.',
  captions: { 'spread crosstalk': 'two voices on the bridge loop', 'cut clean line': 'channel goes dead', 'still bleeding': 'second voice murmurs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.chans = shuffle(r, NEAR).slice(0, 4).map(n => ({ n, print: Array.from({ length: 7 }, () => rf(r, 0.15, 1)) }));
    m.leaks = shuffle(r, [0, 1, 2, 3]).slice(0, 3);
    m.slots = shuffle(r, [...shuffle(r, LIVE).slice(0, 2), null, null, null, null]).slice(0, 5).map(x => ({ live: x, used: null }));
    if (m.slots.filter(s => !s.live).length < 3) m.slots[m.slots.findIndex(s => s.live)].live = null;
    m.sel = 0; m.k = 0; m.fixed = false; m.rounds = 3; m.round = 0; m.jit = ri(r, 0, 9); m.lis = 0; const hear = m.calm ? 0.8 : 0.7;
    const leak = () => m.leaks[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code);
      if (a === 'U' || a === 'D') { m.sel = (m.sel + (a === 'D' ? 1 : 3)) % 4; m.lis = m.t; return true; }
      if (d >= 1 && d <= 5) { if (m.fixed || m.t - m.lis < hear) return true; const s = m.slots[d - 1]; if (s.live || s.used != null) { m.fault('spread crosstalk'); return true; }
        if (m.sel !== leak()) { m.fault('cut clean line'); return true; } s.used = m.chans[m.sel].n; m.fixed = true; return true; }
      if (SPACE(code)) { if (!m.fixed) { m.fault('still bleeding'); return true; } m.k++; m.round = m.k; m.fixed = false; if (m.k >= 3) m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.fixed) return [['Space', true]]; if (m.sel !== leak()) return m.t - m.lis < hear ? [] : [['ArrowDown', true]]; if (m.t - m.lis < hear) return []; const j = m.slots.findIndex(s => !s.live && s.used == null); return [['Digit' + (j + 1), true]]; };
    m.bad = () => { const j = m.slots.findIndex(s => s.live || s.used != null); return j >= 0 && m.sel === leak() ? 'Digit' + (j + 1) : 'Space'; };
    m.view = () => ({ p: m.chans.map(c => c.print.map(v => +v.toFixed(2))), l: m.leaks, s: m.slots.map(s => s.live) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ...[1, 2, 3, 4, 5].map(k => ['Digit' + k, 'Slot ' + k]), ['Space', 'Test line']];
    const print = (c, x, y, p, sc, col) => p.forEach((v, i) => { c.fillStyle = col; c.fillRect(x + i * 12, y - v * sc, 8, v * sc); });
    m.draw = (c, W, H, P) => {
      txt(c, `SCIENCE FEED · round ${Math.min(m.k + 1, 3)} / 3`, 10, 16, { size: 10, col: COL.gold });
      if (m.k < 3) { if (!m.fixed) { print(c, 14, 60, m.chans[leak()].print, 30, 'rgba(255,179,71,.85)'); txt(c, 'bleed print', 14, 74, { size: 9, col: COL.warn }); } else txt(c, '✓ clean — Space: test line', 14, 50, { size: 11, col: P.good }); }
      m.chans.forEach((ch, i) => { const y = 92 + i * 18, s = i === m.sel; box(c, 8, y - 12, 100, 16, s ? 'rgba(240,147,58,.22)' : null, s ? COL.orange : null, 6); txt(c, ch.n, 14, y, { size: 10, col: s ? COL.ink : COL.dim }); });
      if (m.t - m.lis >= hear) print(c, 120, 160, m.chans[m.sel].print, 30, COL.peri); else txt(c, 'listening…', 120, 145, { size: 10, col: COL.dim }); txt(c, `print: ${m.chans[m.sel].n}`, 120, 120, { size: 9, col: COL.peri });
      m.slots.forEach((s, i) => { const y = 14 + i * 30; box(c, 250, y, 140, 24, 'rgba(255,255,255,.05)', s.live ? P.bad : COL.peri, 6);
        txt(c, `${i + 1}  ${s.live ? '■ LIVE ' + s.live : s.used ? '◆ ' + s.used + ' (muted)' : '○ SPARE'}`, 258, y + 16, { size: 10, col: s.live ? COL.warn : COL.ink }); });
    };
    return m;
  },
});
