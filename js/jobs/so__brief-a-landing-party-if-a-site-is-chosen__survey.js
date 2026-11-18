// Second officer: brief a landing party. Call each member forward; they repeat their role and the recall time back to you. Compare with the
// site card: Enter accepts a correct read-back, Space corrects a wrong one (they repeat it again). Then they speak into their badge: if the
// badge light goes green, Enter clears them to the pad; if it stays dark, Space holds them back for a fresh badge and a retest. Accepting a
// wrong read-back or clearing a dead badge is a fault, and so is cutting a member off before they finish.
import { define, machine, SPACE, ENTER, shuffle, ri, pick, txt, box, lamp, COL } from './kit.js';

const TEAM = ['Lt Okonjo', 'Ens Vale', 'CPO Rask', 'Ens Moreau', 'Lt Tsai', 'Ens Quill'];
const ROLE = ['geology', 'security', 'medic', 'comms', 'sampling'];

export default define({
  job: { billet: 'so', label: 'Brief a landing party if a site is chosen', type: 'task:survey' },
  title: 'Landing party read-back', dept: 'command', host: 'console', tool: 'Site card, kit lists and comm badges',
  how: 'Each member repeats their role and recall time; accept it only if it matches the site card, then clear them only if their badge lights green when they speak.',
  keys: ['Enter accept / clear', 'Space correct / hold back'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'read-back check', input: 'space+enter', win: 'every landing party member repeats role and recall time correctly and beams with a live badge',
    fail: 'accepting a wrong recall time or role, clearing a member whose badge stays dark, or cutting a member off',
    rule: 'Wait for each reply. Read-back: Enter if role and time match the card, Space to correct. Badge test: Enter if the light turns green, Space to swap the badge.' },
  rush: 'Read the site card out once to the whole team and energised.',
  captions: { 'wrong accepted': 'pad chirp', 'needless correction': 'sigh', 'dead badge cleared': 'badge static', 'cut off': 'comm squelch', 'fit held back': 'pad chirp' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, talk = m.calm ? 1.1 : 0.8, team = shuffle(r, TEAM).slice(0, 3), roles = shuffle(r, ROLE);
    m.recall = `${ri(r, 13, 21)}${pick(r, ['00', '15', '30', '45'])}`; m.site = pick(r, ['north ridge cairn', 'dry riverbed fork', 'basalt shelf east']);
    const fib = (mem) => { const k = ri(r, 0, 1); return k ? { role: mem.role, time: String(+m.recall + pick(r, [100, -100, 200, -200])).padStart(4, '0') } : { role: pick(r, ROLE.filter(x => x !== mem.role)), time: m.recall }; };
    m.team = team.map((who, i) => ({ who, role: roles[i], wrongs: r() < 0.55 ? 1 : 0, dead: r() < 0.4, phase: 0, said: null, at: 0 }));
    if (!m.team.some(x => x.wrongs || x.dead)) m.team[ri(r, 0, 2)].dead = true;
    m.rounds = 3; m.round = 0;
    const T = () => m.team[m.round];
    const speak = (x) => { x.at = m.t + talk; x.said = x.wrongs > 0 ? fib(x) : { role: x.role, time: m.recall }; };
    speak(m.team[0]);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const sp = SPACE(code), en = ENTER(code); if (!sp && !en) return false; const x = T(); if (!x) return true;
      if (m.t < x.at) { m.fault('cut off'); x.at = m.t + talk; return true; }
      if (x.phase === 0) {
        const right = x.said.role === x.role && x.said.time === m.recall;
        if (en) { if (!right) { m.fault('wrong accepted'); return true; } x.phase = 1; x.at = m.t + talk; return true; }
        if (right) { m.fault('needless correction'); return true; } x.wrongs--; speak(x); return true;
      }
      if (en) { if (x.dead) { m.fault('dead badge cleared'); return true; } m.round++; m.ev('clear', { who: x.who }); if (m.round >= 3) m.win(); else speak(T()); return true; }
      if (!x.dead) { m.fault('fit held back'); return true; } x.dead = false; x.at = m.t + talk; return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const x = T(); if (!x || m.t < x.at + 0.05) return []; if (x.phase === 0) return [[x.said.role === x.role && x.said.time === m.recall ? 'Enter' : 'Space', true]]; return [[x.dead ? 'Space' : 'Enter', true]]; };
    m.bad = () => { const x = T(); return x ? 'Enter' : null; };
    m.view = () => ({ recall: m.recall, t: m.team.map(x => [x.who, x.role, x.wrongs, x.dead]) });
    m.buttons = () => [['Enter', 'Accept / clear'], ['Space', 'Correct / hold']];
    m.draw = (c, W, H, P) => {
      box(c, 8, 6, W - 16, 38, 'rgba(244,194,91,.12)', COL.gold, 8); txt(c, `SITE CARD · ${m.site} · recall ${m.recall}`, 16, 22, { size: 11, col: COL.gold });
      txt(c, 'Roles: ' + m.team.map(x => `${x.who.split(' ')[1]} ${x.role}`).join(' · '), 16, 37, { size: 10, col: COL.pale });
      const x = T(); if (!x) return; const busy = m.t < x.at;
      txt(c, `${x.who} (${m.round + 1}/3)`, 12, 66, { size: 12, col: COL.ink });
      if (x.phase === 0) txt(c, busy ? 'repeating it back…' : `"I'm ${x.said.role}; recall at ${x.said.time}."`, 12, 90, { size: 12, col: busy ? COL.dim : COL.ink });
      else { txt(c, busy ? 'speaking into the badge…' : 'Badge test:', 12, 90, { size: 12, col: COL.ink }); if (!busy) { lamp(c, 110, 86, 10, x.dead ? '#2a2748' : P.good, x.dead ? 'square' : 'circle'); txt(c, x.dead ? 'DARK' : 'LIVE', 128, 90, { size: 11, col: x.dead ? COL.warn : P.good }); } }
      txt(c, x.phase === 0 ? 'Enter accept · Space correct' : 'Enter clear to pad · Space hold back', 12, 150, { size: 10, col: COL.dim });
    };
    return m;
  },
});
