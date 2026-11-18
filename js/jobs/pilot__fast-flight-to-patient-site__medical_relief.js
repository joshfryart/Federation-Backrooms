// Pilot: fast flight to the patient site. The golden hour against the biobeds. Hold Space for full speed on the straights, but the turn zone
// before each waypoint must be flown at cruise: still holding speed when you enter it jolts the beds (a fault). At each waypoint, turn the way
// the route line bends (← / →). The medic comm light comes on whenever the ETA changes: tell them (Enter) before it times out. Arrive after the
// golden-hour mark and the run is lost.
import { define, machine, ri, rf, pick, txt, box, bar, lamp, COL, ARROW, SPACE, ENTER } from './kit.js';

export default define({
  job: { billet: 'pilot', label: 'Fast flight to patient site', type: 'task:medical_relief' },
  title: 'Golden-hour sprint, slow for the turns', dept: 'flight', host: 'console', tool: 'Route line and ETA counter',
  how: 'Hold Space for speed on each straight and let go before the shaded turn zone. At the waypoint press ← or → as the route bends. When the medic comm light shows, press Enter to pass the new ETA.',
  keys: ['Space hold: speed', '← → turn', 'Enter tell medics'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'sprint and ease', input: 'arrows+space-hold+enter',
    win: 'reaching the patient site before the golden-hour mark with no jolt in a turn zone and every ETA change passed to the medics',
    fail: 'carrying speed into a waypoint turn zone, turning the wrong way, leaving the medics without the new ETA, or arriving too late',
    rule: 'Hold Space on the straights, release it before each shaded turn zone, press the arrow the route bends at the waypoint, and press Enter whenever the medic light comes on.' },
  rush: 'Cut every corner at full speed; the medics held on to the beds.',
  captions: { jolt: 'beds rattle', 'wrong turn': 'route alarm', 'medics not told': 'medic: ETA?' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, ZONE = 0.8, FAST = 3, SLOW = 1, COMMW = m.calm ? 4 : 3;
    const n = ri(r, 4, 5); m.legs = Array.from({ length: n }, (_, k) => ({ len: +rf(r, 3, 4.2).toFixed(2), turn: k < n - 1 ? pick(r, ['L', 'R']) : null }));
    const best = m.legs.reduce((a, l) => a + (l.len - ZONE) / FAST + ZONE / SLOW, 0); m.gold = +(best * (m.calm ? 1.8 : 1.45) + 2).toFixed(1);
    m.comms = [rf(r, 1.5, 3), rf(r, 4.5, best)].map(v => +v.toFixed(2)); m.ci = 0; m.cOn = -1;
    m.leg = 0; m.p = 0; m.wait = false; m.jolted = false; m.flash = 0; m.msg = ''; m.round = 1; m.rounds = n;
    const L = () => m.legs[m.leg], inZone = () => m.p >= L().len - ZONE;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), s = SPACE(code), e = ENTER(code);
      if (s) { m.held.S = down; return true; } if (!a && !e) return false; if (!down) return true;
      if (e) { if (m.cOn >= 0) { m.cOn = -1; m.ev('eta told'); } return true; }
      if ((a === 'L' || a === 'R') && m.wait) { if (a !== L().turn) { m.fault('wrong turn'); m.flash = 0.7; m.msg = 'WRONG WAY'; return true; } m.wait = false; m.leg++; m.p = 0; m.jolted = false; m.round = m.leg + 1; }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt);
      if (m.t > m.gold) { m.fail('golden hour lost'); return; }
      if (m.ci < m.comms.length && m.t >= m.comms[m.ci]) { m.cOn = m.t; m.ci++; }
      if (m.cOn >= 0 && m.t - m.cOn > COMMW) { m.fault('medics not told'); m.cOn = -1; if (m.state !== 'play') return; }
      if (m.wait) return;
      if (inZone() && m.held.S && L().turn && !m.jolted) { m.jolted = true; m.fault('jolt'); m.flash = 0.7; m.msg = 'BEDS JOLTED'; if (m.state !== 'play') return; }
      m.p += (m.held.S && !(inZone() && L().turn) ? FAST : SLOW) * dt;
      if (m.p >= L().len) { m.p = L().len; if (!L().turn) { m.ev('arrived'); m.win(); } else m.wait = true; }
    };
    m.hint = () => { const out = []; if (m.cOn >= 0 && m.t - m.cOn > 0.3) out.push(['Enter', true], ['Enter', false]);
      if (m.wait) { const k = L().turn === 'L' ? 'ArrowLeft' : 'ArrowRight'; out.push(['Space', false], [k, true], [k, false]); }
      else out.push(['Space', !L().turn || m.p < L().len - ZONE - 0.25]); return out; };
    m.bad = () => 'Space';
    m.view = () => ({ legs: m.legs.map(l => [l.len, l.turn]), gold: m.gold });
    m.buttons = () => [['Space', 'Speed (hold)'], ['ArrowLeft', '◀ turn'], ['ArrowRight', 'turn ▶'], ['Enter', 'Tell medics']];
    m.draw = (c, W, H, P) => {
      const l = L(); txt(c, `LEG ${m.leg + 1} of ${m.legs.length}${l.turn ? ` · next turn ${l.turn === 'L' ? 'LEFT' : 'RIGHT'}` : ' · patient site'}`, 12, 18, { size: 11, col: COL.peri });
      const x0 = 12, w = 300, sc = w / l.len; box(c, x0, 34, w, 26, 'rgba(255,255,255,.05)', null, 4);
      if (l.turn) { c.fillStyle = 'rgba(255,179,71,.25)'; c.fillRect(x0 + (l.len - ZONE) * sc, 34, ZONE * sc, 26); c.strokeStyle = COL.warn; c.strokeRect(x0 + (l.len - ZONE) * sc, 34, ZONE * sc, 26); txt(c, 'TURN ZONE', x0 + (l.len - ZONE / 2) * sc, 72, { size: 9, col: COL.warn, align: 'center' }); }
      c.fillStyle = COL.gold; c.beginPath(); const px = x0 + m.p * sc; c.moveTo(px + 8, 47); c.lineTo(px - 6, 40); c.lineTo(px - 6, 54); c.closePath(); c.fill();
      txt(c, m.held.S && !(l.turn && inZone()) ? 'FULL SPEED' : 'cruise', 330, 52, { size: 11, col: COL.pale });
      txt(c, `Golden hour: ${Math.max(0, m.gold - m.t).toFixed(1)} s`, 12, 98, { size: 12 }); bar(c, 12, 104, 200, 8, 1 - m.t / m.gold, {});
      lamp(c, 300, 112, 12, m.cOn >= 0 ? P.good : '#2a2838', m.cOn >= 0 ? 'circle' : 'square'); txt(c, m.cOn >= 0 ? 'MEDIC: ETA?' : 'medic comm', 318, 116, { size: 10, col: m.cOn >= 0 ? COL.ink : COL.dim });
      if (m.wait) txt(c, `AT WAYPOINT: TURN ${l.turn === 'L' ? '◀' : '▶'}`, 12, 140, { size: 12, col: COL.gold });
      if (m.flash > 0) txt(c, m.msg, W - 12, H - 10, { size: 12, col: P.bad, align: 'right' });
    };
    return m;
  },
});
