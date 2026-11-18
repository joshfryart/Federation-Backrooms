// Ops: check transporter and cargo handling are certified. For each handling rig run the test cycle (Space) with the test weight clamped
// on the pad and watch the load gauge; when the weight comes off, read the clamp's grip mark on it. A rig passes only if the gauge stayed
// under the limit AND the grip mark is a clean bite with no smear. Sign it (Enter) or fail it (Space). Deciding before the mark is read is a fault.
import { define, machine, SPACE, ENTER, ri, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ops', label: 'Check transporter and cargo handling are certified', type: 'task:cargo_run' },
  title: 'Handling rig grip-mark certificate', dept: 'operations', host: 'console', tool: 'Transporter bench and test weight',
  how: 'Press Space to run each rig\'s handling cycle, watch the load gauge, then read the grip mark left on the test weight. Sign (Enter) only if the gauge stayed under the limit and the mark shows no slip smear; otherwise fail it (Space).',
  keys: ['Space run cycle / fail rig', 'Enter sign rig'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'cycle then certify', input: 'space+enter', win: 'every handling rig cycled with the test weight and certified only when gauge and grip mark both hold',
    fail: 'signing a rig whose grip mark shows slip or whose gauge ran over, failing a sound rig, or deciding before the mark is read',
    rule: 'Space starts the cycle; the gauge runs for a moment, then the weight is lifted and the grip mark appears. A smear longer than 0 mm is slip. Enter signs a sound rig, Space fails a bad one.' },
  rush: 'Signed every rig off its load gauge and never looked at the weight.',
  captions: { 'slip certified': 'cargo chief frowns', 'sound rig failed': 'rig crew protests', 'mark unread': 'bench buzzer' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, cyc = m.calm ? 1.0 : 1.3, lift = m.calm ? 0.35 : 0.5, limit = ri(r, 40, 48) * 10;
    m.rigs = Array.from({ length: 4 }, (_, i) => { const kind = r() < 0.55 ? 'ok' : r() < 0.65 ? 'slip' : 'over'; return { name: `Rig ${String.fromCharCode(65 + i)}-${ri(r, 10, 99)}`, kind, peak: kind === 'over' ? limit + ri(r, 15, 45) : limit - ri(r, 20, 90), smear: kind === 'slip' ? +rf(r, 1.2, 3.5).toFixed(1) : 0 }; });
    if (!m.rigs.some(g => g.kind !== 'ok')) Object.assign(m.rigs[ri(r, 0, 3)], { kind: 'slip', smear: 2.1 });
    m.lim = limit; m.k = 0; m.ph = 'idle'; m.c = 0; m.last = -9; m.msg = ''; m.rounds = 4; m.round = 0;
    const G = () => m.rigs[m.k], next = () => { m.k++; m.round++; m.ph = 'idle'; m.c = 0; if (m.k >= m.rigs.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !(SPACE(code) || ENTER(code))) return false; if (!down) return true; m.last = m.t; const g = G();
      if (m.ph === 'idle' && SPACE(code)) { m.ph = 'run'; m.c = 0; return true; }
      if (m.ph !== 'mark') { m.fault('mark unread'); m.msg = 'Wait for the weight to come off and read its mark'; return true; }
      if (ENTER(code)) { if (g.kind !== 'ok') { m.fault('slip certified'); m.msg = `${g.name} does not hold — fail it`; } else { m.msg = `${g.name} signed`; next(); } }
      else { if (g.kind === 'ok') { m.fault('sound rig failed'); m.msg = `${g.name} held on both — sign it`; } else { m.msg = `${g.name} failed and tagged`; next(); } }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.ph === 'run' || m.ph === 'lift') { m.c += dt; if (m.ph === 'run' && m.c >= cyc) { m.ph = 'lift'; m.c = 0; } else if (m.ph === 'lift' && m.c >= lift) m.ph = 'mark'; } };
    m.hint = () => { if (m.t - m.last < 0.15) return []; const g = G(); if (!g) return []; if (m.ph === 'idle') return [['Space', true]]; if (m.ph !== 'mark') return []; return [[g.kind === 'ok' ? 'Enter' : 'Space', true]]; };
    m.bad = () => (m.t - m.last < 0.2 ? null : 'Enter');
    m.view = () => ({ lim: m.lim, rigs: m.rigs.map(g => [g.kind, g.peak, g.smear]) });
    m.buttons = () => [['Space', 'Run / Fail'], ['Enter', 'Sign']];
    m.draw = (c, W, H, P) => {
      const g = G(); if (!g) return; txt(c, `${g.name}  ·  rig ${m.k + 1} of 4`, 14, 22, { size: 13, col: COL.gold });
      const gv = m.ph === 'run' ? g.peak * Math.min(1, m.c / cyc * 1.2) * (1 + 0.03 * Math.sin(m.c * 20)) : m.ph === 'idle' ? 0 : g.peak;
      txt(c, 'LOAD GAUGE', 14, 46, { size: 10, col: COL.dim }); txt(c, `${Math.round(gv)} kg  (limit ${m.lim})`, W - 14, 46, { size: 12, align: 'right', col: gv > m.lim ? P.bad : COL.ink });
      bar(c, 14, 52, W - 28, 12, gv / (m.lim * 1.2), { mark: 1 / 1.2, col: gv > m.lim ? P.bad : COL.peri });
      box(c, 14, 76, 180, 60, 'rgba(255,255,255,.05)', COL.peri, 8); txt(c, 'GRIP MARK ON WEIGHT', 22, 92, { size: 10, col: COL.dim });
      if (m.ph === 'mark') { c.fillStyle = COL.pale; c.fillRect(40, 104, 14, 22); if (g.smear) { c.fillStyle = 'rgba(247,201,162,.45)'; c.fillRect(54, 108, g.smear * 18, 14); } txt(c, g.smear ? `smear ${g.smear} mm` : 'clean bite, 0 mm', 120, 120, { size: 11, align: 'center', col: g.smear ? P.bad : P.good }); }
      else txt(c, m.ph === 'idle' ? 'press Space to run the cycle' : m.ph === 'run' ? 'cycling…' : 'lifting the weight…', 22, 116, { size: 11, col: COL.warn });
      m.rigs.forEach((q, i) => txt(c, `${q.name} ${i < m.k ? '✓ done' : i === m.k ? '◀' : ''}`, 214, 92 + i * 14, { size: 10, col: i < m.k ? COL.dim : COL.ink }));
      txt(c, m.msg, 14, H - 10, { size: 11, col: COL.pale });
    };
    return m;
  },
});
