// Deputy security chief, medical relief: hold the quarantine door. Each visitor hands over a screening slip with the day it was issued; a
// screen is good for three days (today and the two before). An out-of-date slip is refused (3), however sympathetic the story. A visitor with
// a good slip must be masked (1) before you sign them in and open the door (2); someone who arrives masked can go straight in. The visitor
// queue does not wait forever.
import { define, machine, DIG, ri, shuffle, pick, txt, box, lamp, COL } from './kit.js';

const WHO = ['Crewman Abara', 'Ens. Liesl', 'Dr. Okonkwo (visiting)', 'PO Hargreave', 'Lt. Saavedra', 'Crewman Tull', 'Ens. Marchetti', 'Specialist Wen'];
const PLEA = ['"My brother is in bed 3."', '"I was screened, just not today."', '"Two minutes, I promise."', '"The CMO said it was fine."', '"I only need to drop off his padd."', ''];
export default define({
  job: { billet: 'dep', label: 'Control access to quarantine area', type: 'task:medical_relief' },
  title: 'Quarantine slip date and mask door', dept: 'security', host: 'console', tool: 'Quarantine door and sign-in log',
  how: 'Read the issue day on each screening slip: it is good for today and the two days before. Expired: refuse (3). Good: hand a mask (1) if they have none, then sign in and open (2).',
  keys: ['1 hand a mask', '2 sign in and open', '3 refuse entry'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'screen and mask', input: 'digits', win: 'six visitors handled at the ward door: stale slips refused, fresh slips masked before they are signed in',
    fail: 'opening the ward to an expired screen, sending someone in unmasked, or refusing a valid slip',
    rule: 'Slip day vs today: older than two days back is expired, press 3. Otherwise press 1 if no mask is shown, then 2 to sign them in. A visitor left waiting too long is a fault.' },
  rush: 'Took everyone\'s word that they had been screened recently.',
  captions: { 'expired entry': 'ward door hisses', unmasked: 'nurse calls out', 'refused screened': 'visitor protests', waiting: 'queue mutters' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, wait = m.calm ? 7 : 5;
    m.today = ri(r, 120, 330);
    const kinds = shuffle(r, ['ok', 'ok', 'okm', 'old', 'old', pick(r, ['ok', 'okm', 'old'])]);
    m.v = kinds.map((k, i) => ({ who: WHO[(i * 3 + ri(r, 0, 7)) % WHO.length], day: k === 'old' ? m.today - ri(r, 3, 6) : m.today - ri(r, 0, 2), mask: k === 'okm', ok: k !== 'old', plea: k === 'old' ? pick(r, PLEA) : '' }));
    m.i = 0; m.pt = 0; m.gap = 0.4; m.rounds = 6; m.round = 0;
    const next = () => { m.i++; m.round = m.i; m.pt = 0; m.gap = 0.4; if (m.i >= m.v.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (!d || d > 3) return false; if (!down || m.gap > 0) return true; const v = m.v[m.i];
      if (d === 1) { v.mask = true; return true; }
      if (d === 3) { if (v.ok) m.fault('refused screened'); else m.ev('refused', { i: m.i }); next(); return true; }
      if (!v.ok) m.fault('expired entry'); else if (!v.mask) m.fault('unmasked'); else m.ev('signed in', { i: m.i }); next(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.gap > 0) { m.gap -= dt; return; } m.pt += dt; if (m.pt > wait) { m.fault('waiting'); m.pt = 0; } };
    m.hint = () => { const v = m.v[m.i]; if (!v || m.gap > 0 || m.pt < 0.3) return []; return [[!v.ok ? 'Digit3' : !v.mask ? 'Digit1' : 'Digit2', true]]; };
    m.bad = () => (m.gap > 0 ? null : 'Digit2');
    m.view = () => ({ today: m.today, v: m.v.map(v => v.day + (v.mask ? 'M' : '')) });
    m.buttons = () => [['Digit1', '1 Mask'], ['Digit2', '2 Sign in'], ['Digit3', '3 Refuse']];
    m.draw = (c, W, H, P) => {
      txt(c, `TODAY  day ${m.today}`, 14, 20, { size: 12, col: COL.gold }); txt(c, `valid: day ${m.today - 2} to ${m.today}`, 14, 36, { size: 10, col: COL.dim });
      const v = m.v[m.i]; txt(c, `Visitor ${Math.min(m.i + 1, 6)} / 6`, 386, 20, { size: 11, align: 'right', col: COL.pale }); if (!v || m.gap > 0) return;
      box(c, 14, 48, 230, 84, COL.panel, COL.gold, 6); txt(c, v.who, 24, 70, { size: 13 });
      txt(c, 'Screening slip issued', 24, 94, { size: 10, col: COL.dim }); txt(c, `day ${v.day}`, 160, 94, { size: 14, col: COL.ink });
      if (v.plea) txt(c, v.plea, 24, 120, { size: 10, col: COL.lav });
      box(c, 262, 48, 124, 84, COL.panel, 'rgba(255,255,255,.15)', 6); lamp(c, 290, 90, 12, v.mask ? P.good : COL.warn, v.mask ? 'circle' : 'triangle');
      txt(c, v.mask ? 'MASKED' : 'NO MASK', 310, 94, { size: 11, col: v.mask ? P.good : COL.warn });
      c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(14, 142, 372, 6); c.fillStyle = COL.peri; c.fillRect(14, 142, 372 * Math.min(1, m.pt / wait), 6);
      txt(c, 'waiting', 14, 162, { size: 10, col: COL.dim });
    };
    return m;
  },
});
