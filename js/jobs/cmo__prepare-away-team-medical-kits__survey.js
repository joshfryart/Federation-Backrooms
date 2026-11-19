// CMO: prepare away-team medical kits (survey). Items tipped onto the tray go into the kit in tiers: drugs into the lidded case at the
// bottom first, then dressings and tourniquets on the top tier over it. Every sterile pack shows its seal strip: a torn seal goes in the
// sealed bin (a fresh one comes from the cabinet). Close the lid (Enter) only with the tray empty.
import { define, machine, ARROW, DIG, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const DRUG = ['Tri-ox hypo', 'Inaprovaline', 'Kelotane case', 'Dexalin hypo', 'Hyronalin hypo'], DRESS = ['Tourniquet', 'Pressure bandage', 'Burn gauze', 'Dermal pad', 'Splint roll', 'Trauma dressing'];
export default define({
  job: { billet: 'cmo', label: 'Prepare away-team medical kits', type: 'task:survey' },
  title: 'Tiered trauma kit packing', dept: 'medical', host: 'console', tool: 'Kit tray and lidded case',
  how: 'Select a tray item (← →) and pack it: 1 drugs into the lidded case below, 2 dressings on the top tier once the case is full, 3 torn seals into the sealed bin; Enter closes the lid.',
  keys: ['← → select', '1 lower case', '2 top tier', '3 sealed bin', 'Enter close lid'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'pack in tiers', input: 'arrows+digits+enter', win: 'two trauma kits packed drugs-below dressings-above with every torn seal binned and the lid closed on an empty tray',
    fail: 'packing a broken seal, binning a sound pack, laying dressings before the drug case is full, or closing with items left',
    rule: 'Read each item\'s kind and seal strip. Torn: 3 to the bin. Drugs: 1 into the lower case. Dressings: 2 onto the top tier, only after every drug is in the case. Enter closes when the tray is empty.' },
  rush: 'Swept the tray into the case in one armful and snapped the lid.',
  captions: { 'broken seal packed': 'seal strip red', 'good pack binned': 'bin lid clanks', 'tier order': 'case lid will not seat', 'kit incomplete': 'tray not empty' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const mk = () => { const nd = ri(r, 2, 3), items = [...shuffle(r, DRUG).slice(0, nd).map(n => ({ n, drug: true })), ...shuffle(r, DRESS).slice(0, 6 - nd).map(n => ({ n, drug: false }))].map(x => ({ ...x, torn: false }));
      items[ri(r, 0, 5)].torn = true; if (r() < 0.4) items[ri(r, 0, 5)].torn = true; return { tray: shuffle(r, items), low: [], top: [] }; };
    m.kits = [mk(), mk()]; m.k = 0; m.sel = 0; m.rounds = 2; m.round = 0; m.flash = '';
    const K = () => m.kits[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (!(a === 'L' || a === 'R' || (d >= 1 && d <= 3) || ENTER(code))) return false; if (!down) return true; const k = K();
      if (a) { m.sel = Math.max(0, Math.min(k.tray.length - 1, m.sel + (a === 'R' ? 1 : -1))); return true; }
      if (d) { const it = k.tray[m.sel]; if (!it) return true;
        if (d === 3) { if (!it.torn) { m.fault('good pack binned'); m.flash = 'that seal was sound'; return true; } k.tray[m.sel] = { n: it.n, drug: it.drug, torn: false }; m.flash = 'binned; fresh pack from the cabinet'; return true; }
        if (it.torn) { m.fault('broken seal packed'); m.flash = 'torn seal: bin it'; return true; }
        if (d === 1 && !it.drug) { m.fault('tier order'); m.flash = 'dressings go on the top tier'; return true; }
        if (d === 2 && (it.drug || k.tray.some(x => x.drug))) { m.fault('tier order'); m.flash = it.drug ? 'drugs go in the lower case' : 'fill the drug case first'; return true; }
        (d === 1 ? k.low : k.top).push(it.n); k.tray.splice(m.sel, 1); m.sel = Math.min(m.sel, Math.max(0, k.tray.length - 1)); m.flash = ''; return true; }
      if (k.tray.length) { m.fault('kit incomplete'); m.flash = 'items still on the tray'; return true; }
      m.round++; m.flash = 'lid locked, colour code taped'; m.sel = 0; if (++m.k >= 2) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const k = K(); if (!k) return []; if (!k.tray.length) return [['Enter', true]];
      let j = k.tray.findIndex(x => x.torn); if (j < 0) j = k.tray.findIndex(x => x.drug); if (j < 0) j = 0;
      if (m.sel !== j) return [[j > m.sel ? 'ArrowRight' : 'ArrowLeft', true]]; const it = k.tray[j]; return [['Digit' + (it.torn ? 3 : it.drug ? 1 : 2), true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ k: m.kits.map(k => k.tray.map(x => x.n + (x.torn ? '!' : ''))) });
    m.buttons = () => [['ArrowLeft', '←'], ['ArrowRight', '→'], ['Digit1', '1 case'], ['Digit2', '2 top'], ['Digit3', '3 bin'], ['Enter', 'Close']];
    m.draw = (c, W, H, P) => {
      const k = K() || m.kits[1]; txt(c, `Kit ${Math.min(m.k + 1, 2)} / 2 · tray`, 10, 16, { size: 11, col: COL.dim });
      k.tray.forEach((it, j) => { const x = 10 + j * 64; box(c, x, 22, 58, 52, COL.panel, j === m.sel ? COL.gold : 'rgba(255,255,255,.18)');
        txt(c, it.drug ? 'DRUG' : 'DRESSING', x + 29, 34, { size: 8, align: 'center', col: it.drug ? COL.lav : COL.pale });
        const w = it.n.split(' '); txt(c, w[0], x + 29, 48, { size: 9, align: 'center' }); if (w[1]) txt(c, w[1], x + 29, 58, { size: 9, align: 'center' });
        txt(c, it.torn ? '✕ seal torn' : '✓ sealed', x + 29, 70, { size: 9, align: 'center', col: it.torn ? P.bad : P.good }); });
      box(c, 10, 86, 380, 30, COL.panel, COL.peri); txt(c, 'TOP TIER: ' + (k.top.join(', ') || '—'), 18, 105, { size: 10, col: COL.pale });
      box(c, 10, 120, 380, 30, COL.panel, COL.lav); txt(c, 'LIDDED DRUG CASE: ' + (k.low.join(', ') || '—'), 18, 139, { size: 10, col: COL.lav });
      txt(c, m.flash, 390, 164, { size: 11, align: 'right', col: COL.warn }); txt(c, `kits ${m.round} / 2`, 10, 164, { size: 11, col: COL.dim });
    };
    return m;
  },
});
