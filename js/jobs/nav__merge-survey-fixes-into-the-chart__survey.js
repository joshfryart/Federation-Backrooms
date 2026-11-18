// Navigator: merge survey fixes into the lab chart. At each chart sheet the fix log reads out one fix at a time with its leg. Aim the
// stylus at that leg's row (turn your view: rows run left to right, leg 1 to leg 4) and tap E to dot it. A fix the log marks as an overlap
// duplicate is not dotted: hold E on its row for a second to reconcile it against the first. Wrong row, a dotted duplicate or a
// reconciled good fix is a fault.
import { define, machine, room, ri, rf } from './kit.js';

const ROWS = [0.375, 0.125, -0.125, -0.375];
export default define({
  job: { billet: 'nav', label: 'Merge survey fixes into the chart', type: 'task:survey' },
  title: 'Stylus dotting and overlap reconcile', dept: 'flight', host: 'room', siteName: 'Chart sheet', verb: 'Merge',
  how: 'Aim the stylus at the fix\'s leg row by turning your view. Tap E to dot a fix; hold E for a second to reconcile a duplicate instead.',
  keys: ['look: aim at the leg row', 'E tap: dot the fix', 'E hold 1 s: reconcile a duplicate'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'dot and reconcile', input: 'e-tap+e-hold+look', win: 'every logged fix dotted on its own leg row and every overlap duplicate reconciled rather than dotted twice',
    fail: 'dotting a fix on the wrong leg, dotting a duplicate as a new point, or reconciling away a good fix',
    rule: 'The panel names the fix\'s leg and whether it is a duplicate. Turn until the stylus is over that leg row. A quick tap dots it; a duplicate needs E held about a second, then let go.' },
  rush: 'Copied the fix log onto the chart in one go without checking the legs or the overlaps.',
  captions: { 'wrong leg': 'stylus squeak', 'double dot': 'chart buzz', 'lost fix': 'eraser rub' },
  says: { 'wrong leg': 'That dot went on the wrong leg row. Aim at the row the log gives.', 'double dot': 'That fix was an overlap duplicate: hold E to reconcile it, do not dot it.', 'lost fix': 'You reconciled away a good fix. Only duplicates are held.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Chart sheet A', prop: 'labbench' }, { name: 'Chart sheet B', prop: 'console' }, { name: 'Chart sheet C', prop: 'desk' }]), r = m.rnd, tol = m.calm ? 0.12 : 0.1;
    m.sh = m.sites.map(() => { const fx = []; for (let k = 0; k < 3; k++) fx.push({ leg: ri(r, 1, 4), dup: k > 0 && r() < 0.4, time: `${ri(r, 10, 23)}:${String(ri(r, 0, 59)).padStart(2, '0')}` }); return { fx, k: 0 }; });
    m.hd = 0; m.aim = 0;
    const row = () => ROWS.reduce((b, y, i) => Math.abs(m.aim - y) < Math.abs(m.aim - ROWS[b]) ? i : b, 0) + 1;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { m.hd = 0; return; } const i = m.next, sh = m.sh[i], f = sh.fx[sh.k];
      m.aim = inp.look || 0;
      if (inp.hold) m.hd += dt;
      if (rel) {
        const held = m.hd; m.hd = 0; if (held > 0.35 && held < 0.8) return;
        const onRow = Math.abs(m.aim - ROWS[f.leg - 1]) <= tol, hold = held >= 0.8;
        if (!onRow) { m.fault('wrong leg'); return; }
        if (!hold && f.dup) { m.fault('double dot'); return; }
        if (hold && !f.dup) { m.fault('lost fix'); return; }
        m.ev(hold ? 'reconcile' : 'dot', { site: i, leg: f.leg }); sh.k++; if (sh.k >= sh.fx.length) { m.finish(i); return; }
      }
      s.prog = sh.k / sh.fx.length;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const sh = m.sh[i], f = sh.fx[sh.k]; return { at: i, look: ROWS[f.leg - 1], hold: f.dup ? m.hd < 0.9 : m.hd === 0 }; };
    m.bad = () => ({ at: m.next, look: 0, hold: m.hd === 0 });
    m.view = () => ({ sh: m.sh.map(s => s.fx.map(f => [f.leg, f.dup, f.time])) });
    m.panel = (i) => { const sh = m.sh[i]; const f = sh?.fx[sh.k]; if (!f) return null; return { label: `Fix ${f.time} → leg ${f.leg}${f.dup ? ' (DUPLICATE: hold)' : ''}`, value: `stylus over leg ${row()}`, bar: m.hd ? Math.min(1, m.hd / 1) : (sh.k / sh.fx.length), band: m.hd ? [0.8, 1] : undefined }; };
    m.prompt = (i) => { const sh = m.sh[i]; const f = sh?.fx[sh.k]; return !f ? '' : f.dup ? `Aim at leg ${f.leg}, hold [E] a second to reconcile the duplicate` : `Aim at leg ${f.leg} and tap [E] to dot the fix`; };
    return m;
  },
});
