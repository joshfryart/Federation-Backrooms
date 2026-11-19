// Deputy security chief, quiet watch: armory audit against last night's door log. The rack shows which hooks are empty; the door log lists
// sign-outs and returns. Move to each empty hook and settle it: Space if the log has an open sign-out for that serial (it is out with someone),
// Enter to report it missing when the log shows no sign-out or a return that never reached the rack. Calling a missing weapon "signed out" is
// the clerical-error excuse the job warns about; reporting one that is properly signed out wastes the Chief's night.
import { define, machine, SPACE, ENTER, ARROW, ri, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'dep', label: 'Armory audit', type: 'task:quiet_watch' },
  title: 'Door-log sign-out reconcile', dept: 'security', host: 'console', tool: 'Armory door log and rack',
  how: 'Move to each empty hook. If the door log shows that serial signed OUT with no return, press Space (accounted). If there is no sign-out, or it was logged IN but is not on the rack, press Enter to report it missing.',
  keys: ['◀ ▶ move along the rack', 'Space accounted by sign-out', 'Enter report missing'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'reconcile sign-outs', input: 'arrows+enter+space', win: 'every empty hook settled against the door log: open sign-outs accounted, everything else reported missing',
    fail: 'explaining away a missing weapon as signed out, or reporting one the log shows is out with an officer',
    rule: 'Empty hooks show a serial; find it in the door log. OUT with no later IN: Space. No entry, or an IN that never came back to the rack: Enter. Full hooks need nothing.' },
  rush: 'Counted the gaps, assumed they were signed out and signed the audit.',
  captions: { 'explained away': 'audit stamped clean', 'false report': 'Chief sighs over comm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 7;
    const ser = shuffle(r, Array.from({ length: 30 }, (_, i) => 200 + i * 7)).slice(0, n), kind = ['PH-1', 'PH-2', 'RIFLE'];
    m.rack = ser.map((s, i) => ({ s: `${kind[i % 3]} #${s}`, empty: false, cls: null }));
    const order = shuffle(r, [...Array(n).keys()]), ne = ri(r, 3, 4), log = [];
    order.slice(0, ne).forEach((j, q) => { const h = m.rack[j]; h.empty = true; h.truth = q === 0 ? 'out' : q === 1 ? 'missing' : r() < 0.5 ? 'out' : 'missing';
      const t = ri(r, 1140, 1400); if (h.truth === 'out') log.push({ t, s: h.s, d: 'OUT' }); else if (r() < 0.5) { log.push({ t, s: h.s, d: 'OUT' }); log.push({ t: t + ri(r, 25, 180), s: h.s, d: 'IN' }); } });
    order.slice(ne, ne + 2).forEach(j => { const t = ri(r, 1140, 1400); log.push({ t, s: m.rack[j].s, d: 'OUT' }); log.push({ t: t + ri(r, 20, 150), s: m.rack[j].s, d: 'IN' }); });
    m.log = log.sort((a, b) => a.t - b.t).map(e => ({ ...e, hm: `${String(Math.floor(e.t / 60) % 24).padStart(2, '0')}:${String(e.t % 60).padStart(2, '0')}` }));
    m.cx = 0; m.rounds = ne; m.round = 0;
    const todo = () => m.rack.findIndex(h => h.empty && !h.cls);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { if (down) m.cx = Math.max(0, Math.min(n - 1, m.cx + (a === 'L' ? -1 : 1))); return true; }
      const sp = SPACE(code), en = ENTER(code); if (!sp && !en) return false; if (!down) return true;
      const h = m.rack[m.cx]; if (!h.empty || h.cls) return true;
      if (sp && h.truth === 'missing') { m.fault('explained away'); return true; }
      if (en && h.truth === 'out') { m.fault('false report'); return true; }
      h.cls = sp ? 'out' : 'missing'; m.round++; if (todo() < 0) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    const right = () => { const i = todo(); if (i < 0) return []; if (i !== m.cx) return [[i < m.cx ? 'ArrowLeft' : 'ArrowRight', true]]; return null; };
    m.hint = () => right() || [[m.rack[m.cx].truth === 'out' ? 'Space' : 'Enter', true]];
    m.bad = () => { const mv = right(); return mv ? (mv[0] || null) : (m.rack[m.cx].truth === 'out' ? 'Enter' : 'Space'); };
    m.view = () => ({ rack: m.rack.map(h => h.s + (h.empty ? h.truth : '')), log: m.log.length });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Signed out'], ['Enter', 'Missing']];
    m.draw = (c, W, H, P) => {
      txt(c, 'RACK', 14, 14, { size: 10, col: COL.gold });
      m.rack.forEach((h, i) => { const y = 20 + i * 20, cur = i === m.cx; box(c, 14, y, 176, 17, cur ? 'rgba(244,194,91,.18)' : COL.panel, cur ? COL.gold : null, 4);
        txt(c, h.s, 22, y + 13, { size: 11, col: h.empty ? COL.warn : COL.ink }); txt(c, !h.empty ? 'on hook' : h.cls ? (h.cls === 'out' ? 'SIGNED OUT' : 'MISSING') : 'EMPTY', 184, y + 13, { size: 10, align: 'right', col: h.cls ? (h.cls === 'out' ? P.good : P.bad) : h.empty ? COL.warn : COL.dim });
        if (h.empty && !h.cls) lamp(c, 132, y + 9, 5, COL.warn, 'triangle'); });
      txt(c, 'DOOR LOG', 206, 14, { size: 10, col: COL.peri });
      m.log.slice(0, 12).forEach((e, k) => txt(c, `${e.hm}  ${e.d.padEnd(3)}  ${e.s}`, 206, 27 + k * 11.3, { size: 10, font: 'monospace', col: e.d === 'OUT' ? COL.pale : COL.dim }));
      txt(c, `${m.rack.filter(h => h.empty && !h.cls).length} empty hooks to settle`, 14, 164, { size: 11, col: COL.pale });
    };
    return m;
  },
});
