// Computer specialist: allocate core capacity to sensor data intake. Hold Right / Left to move the sensor intake share; every point it gains is
// taken from the other departments in proportion. The scan queue drains only while the share is above what the intake needs. Bring the queue
// down to clear without pushing any department under its floor, confirm with Enter, then leave it alone while the queue is re-read.
import { define, machine, ARROW, ENTER, ri, rf, clamp, txt, bar, COL } from './kit.js';

const DEPTS = ['Bridge', 'Sickbay', 'Engineering', 'Science'];
export default define({
  job: { billet: 'comp', label: 'Allocate core capacity to sensor data intake', type: 'task:survey' },
  title: 'Sensor intake share against floors', dept: 'operations', host: 'console', tool: 'Capacity allocation screen',
  how: 'Hold Right to raise the sensor intake share (Left lowers it) and watch the queue depth. Stop while every department is above its floor; when the queue reads clear press Enter, then hold steady for the re-read.',
  keys: ['Right / Left hold: move the share', 'Enter confirm the share'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'drain within floors', input: 'arrows-hold+enter', win: 'scan queue drained to clear and confirmed with every other department still above its floor through the re-read',
    fail: 'starving a department below its floor, confirming while the queue still backs up, or a share too low so the queue refills',
    rule: 'The queue falls only while the sensor share is above the intake need, faster the higher it is, but every point comes off the other departments. Find a share that drains it with all floors held, then Enter.' },
  rush: 'Gave the sensors everything and starved the sickbay and bridge floors.',
  captions: { starved: 'department floor alarm', 'still backing up': 'queue warning', refilled: 'scan backlog chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 4 : 6;
    m.need = ri(r, 32, 46); m.smax = m.need + ri(r, 10, 15); m.s = m.need - ri(r, 8, 14); m.q = ri(r, 40, 55);
    const w = DEPTS.map(() => rf(r, 0.6, 1.4)), tw = w.reduce((a, b) => a + b, 0); m.w = w.map(x => x / tw);
    const bind = ri(r, 0, 3); m.floor = m.w.map((x, i) => Math.round(x * (100 - m.smax) * (i === bind ? 1 : rf(r, 0.55, 0.85))));
    m.dir = null; m.conf = -1; m.starveT = 0;
    const share = (i) => (100 - m.s) * m.w[i], under = () => DEPTS.findIndex((_, i) => share(i) < m.floor[i]);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { if (m.conf >= 0) return true; if (down) m.dir = a; else if (m.dir === a) m.dir = null; return true; }
      if (!ENTER(code) || !down) return false; if (m.conf >= 0) return true;
      if (m.q > 3) { m.fault('still backing up'); return true; } if (under() >= 0) { m.fault('starved'); return true; }
      m.conf = 0; m.dir = null; m.ev('confirm', { share: +m.s.toFixed(1) }); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (m.dir) m.s = clamp(m.s + (m.dir === 'R' ? rate : -rate) * dt, 5, 90);
      m.q = Math.max(0, m.q + (m.need - m.s) * dt * 1.1);
      if (under() >= 0) { m.starveT += dt; if (m.starveT > 0.6) { m.fault('starved'); m.starveT = -0.6; } } else m.starveT = 0;
      if (m.conf >= 0) { m.conf += dt; if (m.q > 6) { m.fault('refilled'); m.conf = -1; } else if (m.conf >= 3) m.win(); }
    };
    m.hint = () => {
      if (m.conf >= 0) return []; const tgt = Math.min(m.smax - 3, m.need + 8);
      if (m.s < tgt - 0.4) return [['ArrowRight', true]]; if (m.dir) return [['Arrow' + (m.dir === 'R' ? 'Right' : 'Left'), false]];
      return m.q <= 2 ? [['Enter', true]] : [];
    };
    m.bad = () => ['ArrowRight', true];
    m.view = () => ({ n: m.need, x: m.smax, f: m.floor });
    m.buttons = () => [['ArrowLeft', '◀ less'], ['ArrowRight', 'more ▶'], ['Enter', 'Confirm']];
    m.draw = (c, W, H, P) => {
      txt(c, `SENSOR INTAKE ${m.s.toFixed(0)} %`, 14, 20, { size: 13, col: COL.gold }); bar(c, 14, 28, 220, 12, m.s / 100, { col: COL.gold });
      const tr = m.need - m.s; txt(c, `Queue depth ${m.q.toFixed(0)} ${m.q < 0.5 ? '● clear' : tr > 0 ? '▲ rising' : '▼ falling'}`, 14, 62, { size: 13, col: m.q < 0.5 ? P.good : tr > 0 ? P.bad : COL.ink });
      bar(c, 14, 70, 220, 10, Math.min(1, m.q / 60), { col: COL.peri });
      DEPTS.forEach((d, i) => {
        const y = 22 + i * 30, sh = share(i), low = sh < m.floor[i];
        txt(c, `${d} ${sh.toFixed(0)} % ${low ? '▼ UNDER' : ''}`, 252, y, { size: 11, col: low ? P.bad : COL.ink }); bar(c, 252, y + 5, 130, 8, sh / 40, { mark: m.floor[i] / 40, col: low ? P.bad : COL.lav });
      });
      txt(c, m.conf >= 0 ? `Re-reading queue… ${m.conf.toFixed(1)} / 3 s` : 'White tick = floor. Enter when the queue is clear.', 14, H - 10, { size: 11, col: m.conf >= 0 ? COL.peri : COL.dim });
    };
    return m;
  },
});
