// Quartermaster: load the sickbay cart. Items arrive one at a time: heavy bales go low (Down), light bundles middle (Right), sterile packs on
// top (Up). A torn or past-date pack goes in the reject bin (Left), never on the cart.
import { define, machine, ARROW, ri, pick, shuffle, txt, box, COL } from './kit.js';
const KIND = { bale: ['Linen bale 18 kg', 'ArrowDown', 'D'], bundle: ['Sheet bundle 3 kg', 'ArrowRight', 'R'], pack: ['Sterile dressing pack', 'ArrowUp', 'U'], torn: ['Dressing pack TORN SEAL', 'ArrowLeft', 'L'], old: ['Dressing pack PAST DATE', 'ArrowLeft', 'L'] };

export default define({
  job: { billet: 'qm', label: 'Draw medical supplies and bedding to sickbay', type: 'task:medical_relief' },
  title: 'Stack the sickbay cart by weight', dept: 'services', host: 'console', tool: 'Sickbay draw cart',
  how: 'Each item shows on the bench. Bale: Down (bottom). Light bundle: Right (middle). Sound sterile pack: Up (top). Torn or past-date pack: Left, into the reject bin.',
  keys: ['Down bottom tier', 'Right middle tier', 'Up top tier', 'Left reject'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'stack by weight', input: 'arrows', win: 'six items loaded: bales on the bottom, bundles in the middle, sound sterile packs on top and every damaged pack rejected',
    fail: 'crushing a sterile pack under a bale, burying a bale high, or loading a torn or past-date pack onto the cart',
    rule: 'Read the item line. Heavy bale: Down. Light bundle: Right. Sterile pack with a good seal and date: Up. Torn seal or past date: Left, the reject bin.' },
  rush: 'Piled everything on the cart as it came and checked the seals at the sickbay door.',
  captions: { crushed: 'pack crushed', 'bad pack': 'contamination flag', buried: 'bale lifted too high' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.items = shuffle(r, ['bale', 'bale', 'bundle', 'pack', pick(r, ['torn', 'old']), pick(r, ['pack', 'bundle', 'torn'])]); m.k = 0; m.round = 0; m.rounds = 6; m.stack = { D: 0, R: 0, U: 0, L: 0 };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); if (!a) return false; const it = m.items[m.k]; if (!it) return true; const [, , want] = KIND[it];
      if (a === want) { m.stack[a]++; m.k++; m.round = m.k; if (m.k >= 6) m.win(); }
      else if (it === 'torn' || it === 'old') m.fault('bad pack'); else if (it === 'pack') m.fault('crushed'); else if (it === 'bale') m.fault('buried'); else m.fault('crushed');
      return true;
    };
    m.hint = () => { const it = m.items[m.k]; return it ? [[KIND[it][1], true]] : []; };
    m.bad = () => { const it = m.items[m.k]; return it ? [it === 'bale' ? 'ArrowUp' : it === 'pack' ? 'ArrowDown' : 'ArrowRight', true] : null; };
    m.view = () => ({ items: m.items.slice() });
    m.buttons = () => [['ArrowUp', 'Top'], ['ArrowRight', 'Mid'], ['ArrowDown', 'Bottom'], ['ArrowLeft', 'Reject']];
    m.draw = (c, W, H, P) => {
      const it = m.items[Math.min(m.k, 5)]; txt(c, `item ${Math.min(m.k + 1, 6)} of 6`, 10, 18, { size: 12, col: COL.pale }); box(c, 10, 30, 200, 44, COL.panel, COL.gold); txt(c, KIND[it][0], 20, 58, { size: 13 });
      [['TOP  sterile', 'U'], ['MID  light', 'R'], ['LOW  heavy', 'D']].forEach(([l, k], i) => { box(c, 240, 24 + i * 38, 140, 32, 'rgba(255,255,255,.06)', COL.peri, 4); txt(c, `${l}  x${m.stack[k]}`, 250, 45 + i * 38, { size: 11 }); });
      txt(c, `reject bin x${m.stack.L}`, 10, 110, { size: 11, col: COL.warn }); txt(c, 'Up top · Right mid · Down low · Left reject', 10, 150, { size: 11, col: COL.dim });
    };
    return m;
  },
});
