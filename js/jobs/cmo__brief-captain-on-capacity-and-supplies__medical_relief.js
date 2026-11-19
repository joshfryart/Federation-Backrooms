// CMO: brief the captain on capacity and supplies (medical relief). From the slate work out two hard numbers and state them (digit, Enter):
// beds left (total minus occupied minus those held for surgery) and hours of oxygen (reserve divided by the current draw, rounded DOWN:
// never round capacity up). Then recommend the one request that eases the tightest limit (digit) and wait for the captain to say it
// aloud before noting the time (Space).
import { define, machine, DIG, ENTER, SPACE, ri, rf, txt, box, COL } from './kit.js';

const REQ = ['Transporter pod to the starbase', 'Oxygen resupply from cargo', 'Cargo nurse for the ward'];
export default define({
  job: { billet: 'cmo', label: 'Brief captain on capacity and supplies', type: 'task:medical_relief' },
  title: 'Bed and oxygen capacity sum', dept: 'medical', host: 'console', tool: 'Bed count slate and oxygen gauge',
  how: 'Key the beds left and the whole hours of oxygen (1 – 9, Enter each; round down), recommend one request (1 – 3), then wait for the captain\'s spoken confirmation and note it (Space).',
  keys: ['1 – 9 figure', 'Enter state it', '1 – 3 request', 'Space note confirmation'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'work the capacity', input: 'digits+enter+space', win: 'two capacity briefs with beds left and whole oxygen hours stated exactly, the request matched to the tightest limit and confirmed aloud',
    fail: 'rounding capacity up, a wrong subtraction, a request that eases the wrong limit, or noting the time before the captain confirms',
    rule: 'Beds left = total − occupied − held for surgery. Oxygen hours = reserve ÷ draw, rounded down. Three beds or fewer: ask for the transporter pod; else four oxygen hours or fewer: resupply; else the nurse. Space after the captain speaks.' },
  rush: 'Told the captain there was plenty of room and oxygen and went back to sickbay.',
  captions: { 'rounded up': 'captain: are you sure?', 'wrong figure': 'captain: are you sure?', 'wrong request': 'captain frowns', 'unconfirmed': 'captain has not answered' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const mk = () => { const tot = ri(r, 12, 18), held = ri(r, 1, 3), left = ri(r, 1, 9), occ = tot - held - left, draw = rf(r, 1.5, 4.5), hrs = ri(r, 1, 9), frac = rf(r, 0.35, 0.85), res = Math.round((hrs + frac) * draw * 10) / 10;
      const req = left <= 3 ? 0 : hrs <= 4 ? 1 : 2; return { tot, held, occ, left, draw: +draw.toFixed(2), res, hrs: Math.floor(res / +draw.toFixed(2)), req, ph: 0, val: 0, wait: rf(r, 0.8, 1.5) }; };
    m.br = [mk(), mk()]; m.br.forEach(b => { b.req = b.left <= 3 ? 0 : b.hrs <= 4 ? 1 : 2; });   // recomputed from the displayed (rounded) draw
    m.k = 0; m.rounds = 2; m.round = 0; m.flash = '';
    const B = () => m.br[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (!d && !ENTER(code) && !SPACE(code)) return false; if (!down) return true; const b = B();
      if (b.ph <= 1) { if (d) { b.val = d; return true; } if (!ENTER(code) || !b.val) return true; const want = b.ph === 0 ? b.left : b.hrs;
        if (b.val !== want) { m.fault(b.val > want ? 'rounded up' : 'wrong figure'); m.flash = b.val > want ? 'that figure is higher than you have' : 'check the sum'; b.val = 0; return true; }
        b.ph++; b.val = 0; m.flash = ''; return true; }
      if (b.ph === 2) { if (!(d >= 1 && d <= 3)) return true; if (d - 1 !== b.req) { m.fault('wrong request'); m.flash = 'that does not ease the tightest limit'; return true; } b.ph = 3; b.t = 0; m.flash = 'waiting for the captain…'; return true; }
      if (!SPACE(code)) return true; if (b.t < b.wait) { m.fault('unconfirmed'); m.flash = 'the captain has not confirmed yet'; return true; }
      m.round++; m.flash = 'confirmation logged'; if (++m.k >= 2) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const b = B(); if (b && b.ph === 3) { b.t += dt; if (b.t >= b.wait && m.flash.startsWith('waiting')) m.flash = 'Captain: "Make it so."'; } };
    m.hint = () => { const b = B(); if (!b) return []; if (b.ph <= 1) { const want = b.ph === 0 ? b.left : b.hrs; return b.val === want ? [['Enter', true]] : [['Digit' + want, true]]; }
      if (b.ph === 2) return [['Digit' + (b.req + 1), true]]; return b.t >= b.wait + 0.1 ? [['Space', true]] : []; };
    m.bad = () => { const b = B(); return b.ph === 0 ? (b.val === b.left + 1 || b.left === 9 ? 'Enter' : 'Digit' + Math.min(9, b.left + 1)) : 'Space'; };
    m.view = () => ({ b: m.br.map(b => [b.tot, b.occ, b.held, b.res, b.draw]) });
    m.buttons = () => [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ['Digit' + n, String(n)]), ['Enter', 'State'], ['Space', 'Note time']];
    m.draw = (c, W, H, P) => {
      const b = B() || m.br[1]; box(c, 10, 10, 190, 120, COL.panel, COL.peri); txt(c, `Brief ${Math.min(m.k + 1, 2)} / 2 · slate`, 18, 26, { size: 11, col: COL.dim });
      [`beds total ${b.tot}`, `occupied ${b.occ}`, `held for surgery ${b.held}`, `O₂ reserve ${b.res} kL`, `O₂ draw ${b.draw} kL/h`].forEach((s, j) => txt(c, s, 18, 46 + j * 17, { size: 12 }));
      const lab = ['Beds left?', 'Oxygen hours (round down)?', 'Request: 1 pod · 2 O₂ resupply · 3 nurse', 'Captain confirms…'][b.ph];
      txt(c, lab, 212, 30, { size: 11, col: COL.gold }); if (b.ph <= 1) { box(c, 212, 40, 60, 34, COL.panel, COL.gold); txt(c, b.val || '_', 242, 64, { size: 20, align: 'center' }); }
      if (b.ph >= 2) REQ.forEach((s, j) => txt(c, `${j + 1} ${s}`, 212, 52 + j * 16, { size: 10, col: b.ph === 3 && j === b.req ? P.good : COL.ink }));
      txt(c, m.flash, 390, 150, { size: 11, align: 'right', col: COL.warn });
    };
    return m;
  },
});
