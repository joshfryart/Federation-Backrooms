// Holodeck tech: low-power program menu. Six programs each draw some power. Toggle programs on and off with their digit so the total draw stays
// under the allowance line, but offer at least four so the room is not boring. Hold a legal menu for a second and a half to lock it in.
import { define, machine, DIG, ri, shuffle, txt, bar, COL } from './kit.js';
const NAMES = ['Meadow', 'Beach', 'Library', 'Chess club', 'Jungle', 'Arena', 'Starfield', 'Café'];

export default define({
  job: { billet: 'holo', label: 'Limit sessions to low-power programs so sensors keep power', type: 'task:survey' },
  title: 'Menu under the power allowance', dept: 'services', host: 'console', tool: 'Program power menu',
  how: 'Press 1 to 6 to switch each program on or off. Keep the total draw under the allowance line but offer at least four programs, then hold it.',
  keys: ['1-6 toggle a program'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'fit the menu', input: 'digits', win: 'a menu of four or more programs held under the sensor power allowance for a second and a half',
    fail: 'leaving the total draw over the allowance so the sensors starve, three times',
    rule: 'Each program shows its draw. Toggle them so the sum stays at or under the allowance and at least four are on; over the line for a second starves the sensors.' },
  rush: 'Switched every program on and let the sensors fend for themselves.',
  captions: { starved: 'sensor power low alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, hold = 1.5; m.names = shuffle(r, NAMES).slice(0, 6); m.draw_ = m.names.map(() => ri(r, 1, 6)); m.on = m.names.map(() => false); m.ok = 0; m.over = 0; m.bi = 0;
    const order = m.draw_.map((d, i) => i).sort((a, b) => m.draw_[a] - m.draw_[b] || a - b); m.target = new Set(order.slice(0, 4)); m.allow = [...m.target].reduce((s, i) => s + m.draw_[i], 0) + ri(r, 0, 1);
    const total = () => m.on.reduce((s, o, i) => s + (o ? m.draw_[i] : 0), 0), count = () => m.on.filter(Boolean).length;
    m.key = (code, down = true) => { const d = DIG(code); if (m.state !== 'play' || !down || d < 1 || d > 6) return false; m.on[d - 1] = !m.on[d - 1]; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const t = total();
      if (t > m.allow) { m.over += dt; m.ok = 0; if (m.over > 1) { m.fault('starved'); m.on = m.on.map(() => false); m.over = 0; } } else { m.over = 0; if (count() >= 4) { m.ok += dt; if (m.ok >= hold) m.win(); } else m.ok = 0; }
    };
    m.hint = () => { const i = m.on.findIndex((o, k) => o !== m.target.has(k)); return i >= 0 ? [['Digit' + (i + 1), true]] : []; };
    m.bad = () => 'Digit' + ((m.bi++ % 6) + 1);
    m.view = () => ({ names: m.names, draw: m.draw_, allow: m.allow });
    m.buttons = () => [1, 2, 3, 4, 5, 6].map(i => ['Digit' + i, String(i)]);
    m.draw = (c, W, H, P) => { m.names.forEach((n, i) => { const y = 24 + i * 20; txt(c, `${i + 1} ${n}`, 16, y, { size: 12, col: m.on[i] ? P.good : COL.dim }); txt(c, `${m.draw_[i]} MW ${m.on[i] ? 'ON' : 'off'}`, 130, y, { size: 12 }); });
      txt(c, `draw ${total()} / allowance ${m.allow}`, 220, 40, { size: 13, col: total() > m.allow ? P.bad : COL.ink }); bar(c, 220, 50, 160, 12, total() / (m.allow + 6), { mark: m.allow / (m.allow + 6), col: total() > m.allow ? P.bad : COL.peri });
      txt(c, `${count()} on (need 4+)`, 220, 90, { size: 12, col: COL.pale }); };
    return m;
  },
});
