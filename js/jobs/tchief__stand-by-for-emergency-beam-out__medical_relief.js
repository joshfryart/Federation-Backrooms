// Transporter chief: stand by for emergency beam-out. Long quiet stretches at the console with the emergency lock button under its cover and
// routine chatter on the comm. Only a real EMERGENCY call from the bridge starts the drill: flip the cover up, confirm the called target
// (1-3), press energize, all before the standby timer runs out, then close the cover again. Opening the cover on chatter, or leaving it up,
// is a fault; so is a late beam-out.
import { define, machine, ARROW, DIG, SPACE, ri, rf, pick, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const TGT = ['Survey team, ridge camp', 'Shuttle Kestrel crew', 'Relief station medics', 'Mining post evacuees', 'Probe recovery party'];
const CHAT = ['Bridge: comm check, all stations.', 'Bridge: helm reports orbit stable.', 'Sickbay: beds 3 and 4 ready.', 'Bridge: next report in ten minutes.', 'Ops: pattern buffer at standby.'];
export default define({
  job: { billet: 'tchief', label: 'Stand by for emergency beam-out', type: 'task:medical_relief' },
  title: 'Cover-guarded emergency energize', dept: 'operations', host: 'console', tool: 'Emergency lock button under its cover',
  how: 'Keep the cover down through the chatter. On an EMERGENCY call: Up flips the cover, 1-3 confirms the called target, Space energizes, all before the timer runs out. Then Down closes the cover.',
  keys: ['↑ flip cover up', '1-3 confirm target', 'Space energize', '↓ close cover'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'flip and energize', input: 'arrows+digits+space', win: 'every emergency call answered inside the standby timer with the cover flipped, the called target confirmed and energize pressed, and the cover shut through the quiet',
    fail: 'lifting the cover on routine chatter or leaving it up, confirming the wrong target, or letting the standby timer run out',
    rule: 'Ignore routine comm lines. When EMERGENCY shows: Up, the digit of the named target, Space, before the timer bar empties. Close the cover with Down afterwards; it may not stay up while standing by.' },
  rush: 'Sat with the cover propped open and a finger on the button.',
  captions: { 'cover opened': 'cover clack', 'cover left open': 'standby warning chirp', 'wrong target': 'target reject tone', interlock: 'interlock buzz', late: 'emergency klaxon' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, win = m.calm ? 4.5 : 3.0, leave = m.calm ? 2.2 : 1.5;
    m.tg = shuffle(r, TGT).slice(0, 3); m.calls = []; let t = rf(r, 3, 6);
    for (let k = 0; k < 3; k++) { m.calls.push({ at: +t.toFixed(2), tgt: ri(r, 1, 3), done: false }); t += rf(r, 5, 7.5); }
    m.chat = []; for (let k = 0; k < 6; k++) m.chat.push({ at: +rf(r, 0.5, t).toFixed(2), s: pick(r, CHAT) }); m.chat.sort((a, b) => a.at - b.at);
    m.cover = false; m.pick = 0; m.openT = 0; m.rounds = 3; m.round = 0;
    const C = () => m.calls.find(c => !c.done && m.t >= c.at) || null;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (!a && !d && !SPACE(code)) return false; if (!down) return true; const c = C();
      if (a === 'U' && !m.cover) { m.cover = true; m.openT = 0; if (!c) m.fault('cover opened'); }
      else if (a === 'D') { m.cover = false; m.pick = 0; }
      else if (d && d <= 3) { if (!c || !m.cover) m.fault('interlock'); else if (d !== c.tgt) m.fault('wrong target'); else m.pick = d; }
      else if (SPACE(code)) { if (!c || !m.cover || !m.pick) m.fault('interlock'); else { c.done = true; m.pick = 0; m.round++; m.ev('beam', { tgt: c.tgt }); } }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const c = C();
      if (c && m.t - c.at > win) { m.fault('late'); c.done = true; m.round++; }
      if (m.cover && !c) { m.openT += dt; if (m.openT > leave) { m.fault('cover left open'); m.openT = 0; } } else m.openT = 0;
      if (m.calls.every(x => x.done) && !m.cover && m.state === 'play') m.win();
    };
    m.hint = () => { const c = C(); if (!c) return m.cover ? [['ArrowDown', true]] : []; if (!m.cover) return [['ArrowUp', true]]; if (!m.pick) return [['Digit' + c.tgt, true]]; return [['Space', true]]; };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ tg: m.tg, calls: m.calls.map(c => [c.at, c.tgt]) });
    m.buttons = () => [['ArrowUp', 'Cover up'], ['ArrowDown', 'Cover down'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Space', 'Energize']];
    m.draw = (c, W, H, P) => {
      const call = C(), heard = m.chat.filter(x => x.at <= m.t).slice(-2);
      txt(c, 'COMM', 14, 16, { size: 10, col: COL.dim });
      heard.forEach((x, j) => txt(c, x.s, 14, 32 + j * 15, { size: 11, col: COL.dim }));
      if (call) { box(c, 10, 62, W - 20, 26, 'rgba(255,90,60,.2)', COL.warn, 6); txt(c, `EMERGENCY: beam out target ${call.tgt}, ${m.tg[call.tgt - 1]}`, 18, 80, { size: 12, col: COL.warn }); bar(c, 14, 92, W - 28, 6, 1 - (m.t - call.at) / win, { col: P.bad }); }
      else { lamp(c, 22, 76, 7, P.good, 'circle'); txt(c, 'STANDBY — emergency pattern loaded', 36, 80, { size: 11, col: COL.dim }); }
      m.tg.forEach((s, k) => txt(c, `${k + 1} ${s}`, 14 + k * 128, 116, { size: 9, col: m.pick === k + 1 ? P.good : COL.ink }));
      box(c, 14, 128, 120, 30, m.cover ? 'rgba(255,90,60,.25)' : 'rgba(255,255,255,.08)', m.cover ? COL.warn : COL.dim, 6);
      txt(c, m.cover ? 'COVER UP' : 'cover down', 74, 148, { size: 12, align: 'center', col: m.cover ? COL.warn : COL.dim });
      txt(c, `calls answered ${m.calls.filter(x => x.done).length}/3`, W - 14, 148, { size: 11, align: 'right', col: COL.dim });
    };
    return m;
  },
});
