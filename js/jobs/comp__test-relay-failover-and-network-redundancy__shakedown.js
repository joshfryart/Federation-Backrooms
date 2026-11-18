// Computer specialist: test relay failover and network redundancy. Holding Space keeps the primary relay offline. Wait for the traffic counter
// to finish shifting onto the backup route, then ping every route on the failover card in the card's order (1 bridge, 2 sickbay, 3 sensors).
// Only then let go of Space to bring the primary back and watch the traffic return. Do it for both primary relays.
import { define, machine, DIG, SPACE, ri, rf, shuffle, txt, box, bar, COL } from './kit.js';

const ROUTES = ['Bridge', 'Sickbay', 'Sensors'];
export default define({
  job: { billet: 'comp', label: 'Test relay failover and network redundancy', type: 'task:shakedown' },
  title: 'Held failover route ping', dept: 'operations', host: 'console', tool: 'Relay failover screen',
  how: 'Hold Space to take the primary relay offline. When the traffic has fully shifted to backup, ping the routes in the failover card order (1-3). Let go of Space only after the last reply, and not long after it.',
  keys: ['Space hold: primary offline', '1 bridge · 2 sickbay · 3 sensors ping'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'hold the failover', input: 'space-hold+digits', win: 'both primary relays held offline while every card route answered on backup, then restored with traffic returning',
    fail: 'pinging while traffic is still shifting, pinging off the card order, restoring before every route answered, or leaving the primary down too long',
    rule: 'Space held = primary offline. Ping only once the counter reads ON BACKUP, in card order, each after the previous reply. Release within three seconds of the last reply.' },
  rush: 'Failed over one relay, saw traffic move, and assumed the rest would work.',
  captions: { 'lost packets': 'packet loss blip', 'off the card': 'checklist slip', 'untested route': 'route untested warning', 'outage overrun': 'outage alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, shift = m.calm ? 1.3 : 1.0, over = m.calm ? 4 : 3;
    m.relays = [0, 1].map(() => ({ name: `Relay ${ri(r, 2, 9)}${String.fromCharCode(65 + ri(r, 0, 5))}`, card: shuffle(r, [0, 1, 2]), base: ri(r, 300, 900), shiftT: rf(r, shift, shift + 0.6) }));
    m.i = 0; m.down = false; m.ph = 'up'; m.pt = 0; m.done = 0; m.pend = null; m.ret = 0; m.rounds = 2; m.round = 0;
    const R = () => m.relays[m.i], reset = () => { m.ph = m.down ? 'shift' : 'up'; m.pt = 0; m.done = 0; m.pend = null; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) {
        if (down && !m.down) { m.down = true; if (m.ph === 'up') { m.ph = 'shift'; m.pt = 0; m.done = 0; } }
        else if (!down && m.down) {
          m.down = false; if (m.ph === 'shift' || m.ph === 'backup') { if (m.done < 3 || m.pend) m.fault('untested route'); m.ph = m.done >= 3 && !m.pend ? 'return' : 'up'; m.pt = 0; if (m.ph === 'up') reset(); }
        }
        return true;
      }
      if (!down) return false; const d = DIG(code); if (!d || d > 3) return false;
      if (m.ph === 'shift') { m.fault('lost packets'); return true; } if (m.ph !== 'backup' || m.pend) return true;
      if (d - 1 !== R().card[m.done]) { m.fault('off the card'); return true; }
      m.pend = { t: 0 }; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.pt += dt;
      if (m.ph === 'shift' && m.pt >= R().shiftT) { m.ph = 'backup'; m.pt = 0; }
      else if (m.ph === 'backup') {
        if (m.pend) { m.pend.t += dt; if (m.pend.t >= 0.4) { m.pend = null; m.done++; m.pt = 0; } }
        else if (m.done >= 3 && m.pt > over) { m.fault('outage overrun'); m.pt = 0; }
      } else if (m.ph === 'return' && m.pt >= 0.9) { m.round++; m.ev('restored'); if (m.i + 1 >= m.relays.length) m.win(); else { m.i++; m.ph = 'up'; m.done = 0; } }
    };
    m.hint = () => {
      if (m.ph === 'up') return [['Space', true]]; if (m.ph === 'return' || m.ph === 'shift' || m.pend) return [];
      return m.done >= 3 ? [['Space', false]] : [['Digit' + (R().card[m.done] + 1), true]];
    };
    m.bad = () => (!m.down ? ['Space', true] : 'Digit' + (R().card[Math.min(2, m.done)] + 1));
    m.view = () => ({ r: m.relays.map(x => [x.name, x.card.join('')]) });
    m.buttons = () => [['Space', 'Take offline (hold)'], ['Digit1', '1 Bridge'], ['Digit2', '2 Sickbay'], ['Digit3', '3 Sensors']];
    m.draw = (c, W, H, P) => {
      const x = R(), onB = m.ph === 'backup' ? 1 : m.ph === 'shift' ? Math.min(1, m.pt / x.shiftT) : m.ph === 'return' ? 1 - m.pt / 0.9 : 0;
      txt(c, `${m.i + 1}/2  Primary ${x.name}: ${m.down ? 'OFFLINE' : 'online'}`, 14, 18, { size: 13, col: m.down ? COL.warn : COL.gold });
      txt(c, `Traffic  primary ${Math.round(x.base * (1 - onB))}  ·  backup ${Math.round(x.base * onB)} pkt/s`, 14, 40, { size: 11 });
      bar(c, 14, 46, W - 28, 10, onB, { col: COL.peri });
      txt(c, m.ph === 'shift' ? 'shifting… wait' : m.ph === 'backup' ? '● ON BACKUP' : m.ph === 'return' ? 'traffic returning to primary…' : '', 14, 72, { size: 12, col: m.ph === 'backup' ? P.good : COL.dim });
      txt(c, 'FAILOVER CARD', 220, 72, { size: 10, col: COL.dim });
      x.card.forEach((k, j) => { const ok = j < m.done; box(c, 220, 80 + j * 22, 160, 19, 'rgba(255,255,255,.04)', j === m.done && m.ph === 'backup' ? COL.orange : null, 5); txt(c, `${j + 1}. ping ${k + 1} ${ROUTES[k]} ${ok ? '✓ replied' : m.pend && j === m.done ? '…' : ''}`, 228, 94 + j * 22, { size: 11, col: ok ? P.good : COL.ink }); });
      if (m.done >= 3 && m.ph === 'backup') { txt(c, 'All routes answered — restore the primary', 14, 100, { size: 11, col: COL.warn }); bar(c, 14, 108, 190, 8, m.pt / over, { col: P.bad }); }
    };
    return m;
  },
});
