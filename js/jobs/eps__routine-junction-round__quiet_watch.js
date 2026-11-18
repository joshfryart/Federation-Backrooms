// EPS tech: routine junction round (quiet watch). Hands-off round: lay the back of your hand on each breaker casing just long enough to feel
// whether it runs warm, once each, and log it. A breaker whose switch sits halfway must not be touched at all (a brush knocks it out), and
// touching a casing a second time nudges its switch. Aim at the breaker (view) and hold E for the contact.
import { define, machine, room, ri, shuffle } from './kit.js';

const POS = [0.35, 0, -0.35], NAME = ['left', 'middle', 'right'];
export default define({
  job: { billet: 'eps', label: 'Routine junction round', type: 'task:quiet_watch' },
  title: 'Back-of-hand casing round', dept: 'engineering', host: 'room', item: 'flashlight', siteName: 'Panel', verb: 'Feel',
  how: 'At each panel aim at a breaker and hold E to lay the back of your hand on its casing until you can tell its heat. Feel each casing once; never touch a switch sitting HALFWAY.',
  keys: ['view: aim at a breaker', 'E hold: hand on the casing'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'palm each casing', input: 'e-hold+look', win: 'every casing felt exactly once for heat and every halfway switch left untouched',
    fail: 'brushing a halfway switch so it drops out, or touching the same casing again so its switch nudges',
    rule: 'Each panel has three breakers left, middle and right. Aim at one and hold E for about half a second to feel it; the panel logs warm or normal. Skip any marked HALFWAY and do not go back to one already felt.' },
  rush: 'Ran a hand down the whole row at once and wrote "all normal".',
  captions: { 'knocked halfway': 'breaker clunks out', nudged: 'switch clicks' },
  says: { 'knocked halfway': 'That switch was sitting halfway: your hand knocked it out. Leave halfway switches alone and log them.', nudged: 'You already felt that one; touching it again nudged the switch.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Junction panel A', prop: 'relayrack' }, { name: 'Junction panel B', prop: 'servers' }, { name: 'Junction panel C', prop: 'fieldgen' }]), r = m.rnd;
    const tol = m.calm ? 0.15 : 0.11, feelT = 0.5, halfPanels = new Set(shuffle(r, [0, 1, 2]).slice(0, ri(r, 1, 2)));
    m.panels = m.sites.map((_, i) => { const half = halfPanels.has(i) ? ri(r, 0, 2) : -1; return { half, warm: [0, 1, 2].map(() => r() < 0.3), felt: [false, false, false], c: null }; });
    const aimed = (look) => POS.findIndex(p => Math.abs((look || 0) - p) < tol);
    const todo = (p) => [0, 1, 2].filter(b => b !== p.half && !p.felt[b]);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); let pre = m.prev; m.released(inp); if (!s) return; const i = m.next, p = m.panels[i]; if (m.ls !== i) { pre = false; m.ls = i; }
      if (!inp.hold) { p.c = null; return; }
      const b = aimed(inp.look);
      if (!pre && b >= 0) { if (b === p.half) { m.fault('knocked halfway'); return; } if (p.felt[b]) { m.fault('nudged'); return; } p.c = { b, t: 0 }; }
      if (p.c && b === p.c.b && !p.felt[b]) { p.c.t += dt; if (p.c.t >= feelT) { p.felt[b] = true; m.ev('felt', { site: i, b, warm: p.warm[b] }); if (!todo(p).length) { m.finish(i); return; } } }
      else if (p.c && b !== p.c.b) p.c = null;
      s.prog = (3 - todo(p).length - (p.half >= 0 ? 1 : 0)) / (p.half >= 0 ? 2 : 3) * 0.95;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.panels[i], t = todo(p)[0]; if (p.c && p.felt[p.c.b]) return { at: i, hold: false, look: POS[p.c.b] }; return { at: i, hold: t != null, look: POS[t ?? 1] }; };
    m.bad = (f = 0) => { const i = m.next, p = m.panels[i]; if (!p) return { at: -1 }; return { at: i, hold: f % 30 < 24, look: POS[p.half >= 0 ? p.half : 0] }; };
    m.view = () => ({ p: m.panels.map(p => [p.half, p.warm.map(Number).join('')]) });
    m.panel = (i) => { const p = m.panels[i]; if (!p) return null; const st = [0, 1, 2].map(b => `${NAME[b][0].toUpperCase()}:${b === p.half ? 'HALFWAY' : p.felt[b] ? (p.warm[b] ? 'WARM' : 'ok') : '?'}`).join(' ');
      return { label: st, value: p.c ? 'feeling…' : 'aim and hold', bar: p.c ? Math.min(1, p.c.t / feelT) : 0 }; };
    m.prompt = (i) => { const p = m.panels[i]; if (!p) return ''; const t = todo(p)[0]; return t == null ? '' : `Aim at the ${NAME[t]} breaker and hold [E] to feel its casing${p.half >= 0 ? `; leave the ${NAME[p.half]} one (HALFWAY) alone` : ''}`; };
    return m;
  },
});
