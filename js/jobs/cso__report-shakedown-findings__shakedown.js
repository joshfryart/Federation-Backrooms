// Chief science officer: report the shakedown findings. Each fault line from the diagnostic log needs a severity and a repair estimate. Hold
// left / right to slide the severity marker along the scale into the zone the fault's effect calls for (the key is printed under the scale),
// and type the repair hours (digit): work hours plus the part's lead time from the parts list, with at most one hour of slack. Enter files the
// line. Filing with no severity, a severity below or above the effect, or an estimate the parts list cannot support is a fault.
import { define, machine, ARROW, ENTER, DIG, ri, pick, shuffle, txt, box, COL } from './kit.js';

const ZONES = ['COSMETIC', 'DEGRADED', 'MAJOR', 'MISSION-BLOCKING'];
const FX = [['scuffed housing, label faded', 0], ['readout flickers, data intact', 0], ['range down 20 %', 1], ['slow refresh on one channel', 1], ['running on backup only', 2], ['channel lost, others cover', 2], ['primary and backup both dead', 3], ['no forward scan at all', 3]];
const SYS = ['Forward array ch 2', 'Aft array ch 5', 'Lab scrubber', 'Hydro pump 1', 'Deep scan integrator', 'Cartography core'];
export default define({
  job: { billet: 'cso', label: 'Report shakedown findings', type: 'task:shakedown' },
  title: 'Severity slider and repair estimate', dept: 'sciences', host: 'console', tool: 'Shakedown findings form',
  how: 'For each fault, hold left / right to slide the severity marker into the zone its effect calls for, type the repair hours (work plus part lead time, up to one hour slack), then file it with Enter.',
  keys: ['◀ ▶ hold: severity marker', 'digit repair hours', 'Enter file the line'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'rate and estimate', input: 'arrows-hold+digits+enter', win: 'each shakedown fault filed with its severity slid into the zone its effect deserves and a repair estimate the parts list supports',
    fail: 'calling a mission-blocking fault cosmetic (or inflating a small one), filing with no severity, or estimating hours the parts lead time cannot meet',
    rule: 'Effect key: cosmetic look only, degraded works worse, major on backup or one channel lost, mission-blocking nothing left. Hours = work + lead time (+1 slack allowed). Enter files.' },
  rush: 'Filed every finding as minor with a one-hour fix.',
  captions: { 'no severity': 'form error tone', downgraded: 'XO query ping', inflated: 'XO query ping', 'bad estimate': 'parts desk buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, sp = m.calm ? 0.4 : 0.5, fx = shuffle(r, FX), sys = shuffle(r, SYS);
    m.f = [0, 1, 2].map(k => ({ sys: sys[k], fx: fx[k][0], z: fx[k][1], code: `E${ri(r, 1, 9)}`, work: ri(r, 1, 3), lead: pick(r, [0, 0, 2, 4]), part: pick(r, ['coupler', 'lens array', 'pump seal', 'isolinear chip', 'filter stack']) }));
    m.i = 0; m.mk = -0.08; m.est = 0; m.dn = {}; m.bf = 0; m.rounds = 3; m.round = 1;
    const F = () => m.f[m.i], zone = () => (m.mk < 0 ? -1 : Math.min(3, Math.floor(m.mk * 4)));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code); if (a === 'L' || a === 'R') { m.dn[a] = down; return true; } if (a) return true;
      if (!d && !ENTER(code)) return false; const e = down && !m.dn[code]; m.dn[code] = down; if (!e) return true; const x = F();
      if (d) m.est = d;
      else { const z = zone(), lo = x.work + x.lead;
        if (z < 0) m.fault('no severity'); else if (z < x.z) m.fault('downgraded'); else if (z > x.z) m.fault('inflated'); else if (m.est < lo || m.est > lo + 1) m.fault('bad estimate');
        else { m.i++; m.round = Math.min(3, m.i + 1); m.mk = -0.08; m.est = 0; m.dn = {}; if (m.i >= 3) m.win(); } }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const v = (m.dn.R ? 1 : 0) - (m.dn.L ? 1 : 0); if (v) m.mk = Math.max(0, Math.min(1, m.mk + v * sp * dt)); };
    m.hint = () => {
      const x = F(); if (!x) return []; const lo = x.work + x.lead; if (m.est !== lo) return [['Digit' + lo, !m.dn['Digit' + lo]]];
      const c = (x.z + 0.5) / 4, e = c - m.mk; if (m.mk < 0 || Math.abs(e) > 0.06) return [['ArrowRight', e > 0], ['ArrowLeft', e < 0]];
      return [['ArrowRight', false], ['ArrowLeft', false], ['Enter', !m.dn.Enter]];
    };
    m.bad = () => ['Enter', ++m.bf % 2 === 0];
    m.view = () => ({ f: m.f.map(x => [x.sys, x.z, x.work, x.lead]) });
    m.buttons = () => [['ArrowLeft', '◀ severity'], ['ArrowRight', 'severity ▶'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ['Digit' + n, n + ' h']), ['Enter', 'File line']];
    m.draw = (c, W, H, P) => {
      const x = F(); if (!x) return; txt(c, `FAULT ${m.i + 1}/3  ${x.sys} · ${x.code}`, 12, 20, { size: 11, col: COL.gold }); txt(c, `Effect: ${x.fx}`, 12, 38, { size: 12, col: COL.ink });
      txt(c, `Parts: ${x.part} ${x.lead ? `on order, ${x.lead} h lead` : 'in stock'} · work ${x.work} h`, 12, 56, { size: 10, col: COL.pale });
      const x0 = 12, w = 376; ZONES.forEach((z, k) => { box(c, x0 + k * w / 4, 66, w / 4 - 3, 26, `rgba(${[[125, 151, 232], [244, 194, 91], [240, 147, 58], [255, 90, 60]][k].join(',')},.22)`, zone() === k ? COL.ink : null, 3); txt(c, z, x0 + k * w / 4 + (w / 8), 83, { size: 9, align: 'center', col: COL.ink }); });
      if (m.mk >= 0) { c.fillStyle = '#fff'; c.fillRect(x0 + m.mk * w - 2, 62, 4, 34); } else txt(c, 'severity: unset', x0, 108, { size: 10, col: COL.warn });
      txt(c, 'cosmetic: looks only · degraded: works worse · major: backup / one channel lost · blocking: nothing left', 12, 124, { size: 8, col: COL.dim });
      txt(c, `repair estimate: ${m.est ? m.est + ' h' : '—'}`, 12, 148, { size: 12, col: m.est ? COL.ink : COL.dim }); txt(c, 'Enter: file line', 388, 148, { size: 10, align: 'right', col: COL.dim });
    };
    return m;
  },
});
