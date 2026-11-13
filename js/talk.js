// Conversation close-up (Systems Nominal): press E on a crew member -> phase 'talk'. Spec: docs/mockups/pacing-npc.md
// section 4, visual spec docs/mockups/conversation.html, notes docs/talk.md.
//
// The camera dollies to the speaker's face (Head bone tracked every frame, ~0.9 m, FOV 70 -> 38, 0.7 s in / 0.5 s out,
// face on the left third, eye contact). The WHOLE world is frozen (main.js frame() runs Talk.step instead of step():
// no sim / comms / duty / phases / repair / other NPCs / particles / doors, HUD hidden) — only the speaker lives: idle
// clip, blink, the talking gesture layer (js/movement.js Fidgeter, forced gestures per line mood), look-at-camera, jaw
// from the speech syllable plan (js/speech.js babblePlan). The UI is an icon intent wheel (js/wheel.js maths + SVG) with
// a Leave hub, a name plate (rank pips, department chip, mood, live portrait chip), a typed subtitle line and the
// relationship meter (Duty.trust). It is a ui-mode layer (js/ui-mode.js): entering releases pointer lock on purpose,
// Esc / E / the hub pop it, never the pause screen.
//
// Pure parts (no DOM, no three.js; node-tested in tools/test-talk.mjs): TALK constants, ease/damp, framing() camera maths,
// clearance candidates, the state machine (createTalkMachine), the pause rules (PAUSE / runsInTalk), jawAt(), moodOf(),
// relLabel(), buildIntents() (availability + lock reasons), lineFor() (what they say), effectFor() (trust deltas).
// The Talk class is the glue (DOM + camera rig + speaker driver); main.js gives it a ctx (see constructor).
import { SYSTEMS, SYS, DEPT, DIVISION, RANK_SHORT } from './crew.js';
import { Fidgeter } from './movement.js';
import { babblePlan, NEUTRAL_VOICE, getMode } from './speech.js';
import { newWheel, wheelSVG, moveTo, pickItem, digitPick, stepSel, R0, R1 } from './wheel.js';
import { deptCol } from './icons.js';
import { UIHUB } from './ui-mode.js';

// ------------------------------------------------------------------------------------------------ tuning
export const TALK = {
  dist: 0.9, minDist: 0.55,    // camera distance from the face centre (m); shrinks when a wall is in the way
  fov: 38, inT: 0.7, outT: 0.5, fastT: 0.3,   // long-lens close-up; transition times (fast = hurried exit)
  third: 1 / 3,                // face centre at this fraction of the screen width (left third: the UI lives on the right)
  faceUp: 0.085, faceFwd: 0.07, // Head bone origin -> face centre (m, world up / NPC forward)
  side: 0.1,                   // camera shifted to screen-right of the face line (a hint of three-quarter view)
  lowY: -0.085,                // look point below the face: eyes sit a little above the middle (the name plate is a lower third)
  follow: 12,                  // critically damped head follow (1/s): idle / gestures move the head a few cm
  breath: 0.004, breathHz: 1 / 1.5,   // +0.4% zoom "breathing"
  turnRate: 6,                 // NPC turns to face the camera (1/s, ~0.4 s)
  lookMax: 0.9, pitchMax: 0.4, // eye-contact clamps (H.lookYaw / lookPitch, rad)
  cps: 36,                     // subtitle typing speed
  replyDelay: 0.28,            // you pick -> they answer
  glance: [5, 9],              // thinking glance away every 5-9 s (0.8 s)
};

// ------------------------------------------------------------------------------------------------ maths (pure)
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };   // smoothstep
export const lerp = (a, b, k) => a + (b - a) * k;
/** critically damped approach factor for rate k over dt (frame-rate independent) */
export const damp = (k, dt) => 1 - Math.exp(-k * dt);
export const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** how far (m, at distance dist) the look point must sit to the right of the face so the face lands at `third` of the width */
export function faceOffset(dist, fovDeg, aspect, third = TALK.third) { return dist * Math.tan(fovDeg * Math.PI / 360) * aspect * (1 - 2 * third); }
/**
 * Close-up framing. face = face centre {x,y,z}; fwd = unit horizontal vector from the face towards the camera side
 * (the speaker faces us). Returns { pos, look, right }: camera position and look-at point (world). The camera sits `side`
 * to screen-right of the face line (a hint of three-quarter view) and yaws so the face lands `third` of the way across,
 * a little above the middle (lowY).
 */
export function framing(face, fwd, o = {}) {
  const dist = o.dist ?? TALK.dist, fov = o.fov ?? TALK.fov, aspect = o.aspect ?? 16 / 9, side = o.side ?? TALK.side;
  const n = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / n, fz = fwd.z / n, rx = fz, rz = -fx;   // screen-right of a camera looking along -fwd
  const alpha = Math.atan(faceOffset(1, fov, aspect, o.third ?? TALK.third)), phi = Math.atan2(side, dist), th = alpha - phi;   // face angle off-axis = alpha; the side shift already gives phi
  const ax = -fx * Math.cos(th) + rx * Math.sin(th), az = -fz * Math.cos(th) + rz * Math.sin(th);
  const pos = { x: face.x + fx * dist + rx * side, y: face.y + 0.01, z: face.z + fz * dist + rz * side };
  const look = { x: pos.x + ax * dist, y: face.y + 0.01 + (o.lowY ?? TALK.lowY), z: pos.z + az * dist };
  return { pos, look, right: { x: rx, y: 0, z: rz }, fwd: { x: fx, y: 0, z: fz } };
}
/** where a world point lands on screen for a camera at pos looking at look (x, y in 0..1 from the top-left); for tests */
export function project(p, pos, look, fovDeg, aspect) {
  let dx = look.x - pos.x, dy = look.y - pos.y, dz = look.z - pos.z; const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;   // forward
  let rx = -dz, rz = dx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;                                             // right (horizontal)
  const ux = -rz * dy, uy = rz * dx - rx * dz, uz = rx * dy;                                                                  // up = right x forward
  const vx = p.x - pos.x, vy = p.y - pos.y, vz = p.z - pos.z, f = vx * dx + vy * dy + vz * dz, t = Math.tan(fovDeg * Math.PI / 360);
  return { x: 0.5 + (vx * rx + vz * rz) / f / (t * aspect) / 2, y: 0.5 - (vx * ux + vy * uy + vz * uz) / f / t / 2, depth: f };
}
/** camera directions to try when a wall is in the way: straight, then +-20, +-35 degrees around the speaker */
export function clearanceCandidates(fwd) { return [0, 20, -20, 35, -35].map(d => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { deg: d, x: fwd.x * c + fwd.z * s, z: -fwd.x * s + fwd.z * c }; }); }
/** pick a candidate: hit(dir) -> free distance (m) or Infinity. First one with the full distance wins, else the roomiest (>= minDist) */
export function pickClearance(fwd, hit, dist = TALK.dist, minDist = TALK.minDist) {
  let best = null; for (const c of clearanceCandidates(fwd)) { const free = Math.min(dist, hit(c) - 0.1); if (free >= dist - 1e-6) return { ...c, dist }; if (!best || free > best.dist) best = { ...c, dist: free }; }
  return { ...best, dist: Math.max(minDist, best.dist) };
}

// ------------------------------------------------------------------------------------------------ state machine (pure)
// idle -> in (0.7 s) -> talk -> out (0.5 s, 0.3 s when hurried) -> idle.  k = camera / UI blend 0..1.  tick() -> 'entered' | 'done' | null
export function createTalkMachine(o = {}) {
  const inT = o.inT ?? TALK.inT, outT = o.outT ?? TALK.outT, fastT = o.fastT ?? TALK.fastT;
  return {
    state: 'idle', t: 0, k: 0, k0: 0, dur: inT, n: 0,
    get active() { return this.state !== 'idle'; },
    get inputOk() { return this.state === 'in' || this.state === 'talk'; },   // no choices during the way out
    begin() { if (this.state !== 'idle') return false; this.state = 'in'; this.t = 0; this.k = 0; this.dur = inT; this.n++; return true; },
    end(fast = false) { if (this.state === 'idle' || this.state === 'out') return false; this.k0 = this.k; this.state = 'out'; this.t = 0; this.dur = fast ? fastT : outT; return true; },
    abort() { this.state = 'idle'; this.t = 0; this.k = 0; },
    tick(dt) {
      if (this.state === 'idle') return null; this.t += dt;
      if (this.state === 'in') { this.k = ease(this.t / this.dur); if (this.t >= this.dur) { this.state = 'talk'; this.k = 1; return 'entered'; } }
      else if (this.state === 'talk') this.k = 1;
      else if (this.state === 'out') { this.k = this.k0 * (1 - ease(this.t / this.dur)); if (this.t >= this.dur) { this.state = 'idle'; this.k = 0; return 'done'; } }
      return null;
    },
  };
}

// ------------------------------------------------------------------------------------------------ pause rules (pure)
// What keeps running during phase 'talk'. Everything else is frozen: main.js frame() calls Talk.step INSTEAD of step().
export const PAUSE = {
  runs: ['speaker', 'camera', 'talk-ui', 'lamps', 'portraits'],
  frozen: ['sim', 'comms', 'clock', 'phases', 'duty', 'repair', 'haul', 'npcs', 'enemies', 'particles', 'doors', 'player', 'hazard', 'director', 'minimap', 'hud', 'time'],
};
export const runsInTalk = (sys) => PAUSE.runs.includes(sys);

// ------------------------------------------------------------------------------------------------ face (pure)
const VOW_OPEN = { a: 1, o: 0.85, e: 0.62, y: 0.45, i: 0.4, u: 0.5 };
/** jaw opening 0..1 at time t (s) of a babble syllable plan [{at, dur, vow, stress}] */
export function jawAt(syl, t) {
  if (!syl?.length || t < 0) return 0;
  for (const s of syl) { if (t < s.at) break; if (t < s.at + s.dur) { const u = (t - s.at) / s.dur; return Math.pow(Math.sin(Math.PI * u), 0.7) * (VOW_OPEN[s.vow] ?? 0.6) * (s.stress ? 1 : 0.78); } }
  return 0;
}
/** fallback talk-flap (no syllable plan, e.g. OS voices): noisy 6-9 Hz */
export const flapAt = (t) => clamp(0.5 * Math.sin(t * 17) + 0.35 * Math.sin(t * 9.3 + 1) + 0.2, 0, 1) * (0.55 + 0.45 * Math.sin(t * 3.1));
/** mood: warm / neutral / edge from trust, stress (0..1, ship alert) and being busy (repair) */
export function moodOf({ trust = 0.5, stress = 0, busy = false } = {}) { const s = trust - stress * 0.4 - (busy ? 0.08 : 0); return s > 0.62 ? 'warm' : s < 0.32 ? 'edge' : 'neutral'; }
export const MOOD_LABEL = { warm: 'warm', neutral: 'neutral', edge: 'on edge' };
export const MOOD_FACE = { warm: { Smile: 0.22 }, neutral: { Smile: 0.05 }, edge: { Frown: 0.22, LeftInnerBrowUp: 0.25, RightInnerBrowUp: 0.25 } };
export function relLabel(t) { return t > 0.8 ? 'trusted' : t > 0.55 ? 'warm' : t > 0.35 ? 'neutral' : t > 0.2 ? 'wary' : 'cold'; }

// ------------------------------------------------------------------------------------------------ intents (pure)
// c (plain data, built by Talk.ctxFor): { npc:{id,short,family,rank,dept,tags}, me:{rank,dept}, trust, isSub, sameDept, carry (name|null),
//   due:[{id,label}] (your loops you could hand off), hasDuty, faults:[{sys,name,status}], repair:{sys,name,pct,state}|null,
//   gossip:[{id,family,type,valence,reason}], social (bool) }
export const TRUST_HELP = 0.25, TRUST_GOSSIP = 0.3;
export const WHY = { notSub: 'They do not report to you', noItem: 'You are not carrying anything', noTrust: 'They do not trust you enough yet', noReason: 'They have no reason to help you', noDuty: 'You have no duty to hand off', noDue: 'Nothing due to delegate', notWorking: 'Not on site yet' };
const I = (id, icon, label, desc, o = {}) => ({ id, icon, label, desc, ...o });
/** the 8 wheel categories (sector 0 at the top, clockwise) with kids = second ring; off + why = locked with a reason */
export function buildIntents(c) {
  const helpWhy = !(c.sameDept || c.isSub) ? WHY.noReason : c.trust < TRUST_HELP ? WHY.noTrust : null;
  const faults = (c.faults || []).slice(0, 2);
  const duty = [I('duty.ask', 'duty', 'Your duty?', 'What are you on?', { def: !c.repair }), I('duty.status', 'ship', 'Ship status', 'How does it look from your department?')];
  if (c.repair) duty.unshift(I('duty.fixing', 'repair', 'The repair?', `What is wrong with the ${c.repair.name}?`, { def: true }));
  if (c.repair) duty.push(I('duty.assist', 'hand', 'Lend a hand', 'Hold the panel for them', { off: c.repair.state !== 'working', why: WHY.notWorking }), I('duty.take', 'tools', 'Take over', 'I will finish this repair myself'));
  const help = [I('help.duty', 'delegate', 'My duty', 'Ask them to cover your next duty', { def: true, off: !c.hasDuty, why: WHY.noDuty }), ...faults.map(f => I('help.fix.' + f.sys, 'repair', 'Fix ' + f.name, `${f.name} is ${f.status}`))];
  const order = [I('order.duty', 'order', 'Do your duty', 'Order them to their own duty', { def: true }), ...(c.due || []).slice(0, 3).map(l => I('order.deleg.' + l.id, 'delegate', l.label, 'Delegate this to them')), ...faults.map(f => I('order.fix.' + f.sys, 'repair', 'Fix ' + f.name, `Send them to the ${f.name}`))];
  if (!(c.due || []).length) order.push(I('order.deleg', 'delegate', 'Delegate', 'Hand a due duty over', { off: true, why: WHY.noDue }));
  const gossip = (c.gossip || []).slice(0, 3).map(g => I('social.gossip.' + g.id, 'ask', g.family, `Gossip about ${g.family}`, { off: c.trust < TRUST_GOSSIP, why: WHY.noTrust }));
  return [
    I('greet', 'greet', 'Greet', 'Say hello'),
    I('duty', 'duty', 'Duty', c.repair ? 'their repair · duty · status' : 'duty · ship status', { kids: duty }),
    I('mood', 'heart', 'How are you?', 'Ask how they are doing'),
    I('small', 'dots', 'Small talk', 'Chat for a moment'),
    I('help', 'help', 'Ask help', helpWhy || 'Ask a favour', { off: !!helpWhy, why: helpWhy, kids: help }),
    I('order', 'order', 'Order', c.isSub ? 'duty · delegate · repair' : WHY.notSub, { off: !c.isSub, why: WHY.notSub, kids: order }),
    I('give', 'give', 'Give item', c.carry ? `Hand over ${c.carry}` : WHY.noItem, { off: !c.carry, why: WHY.noItem }),
    I('social', 'heads', 'People', 'who they know · gossip', { off: !c.social, why: 'They keep to themselves', kids: [I('social.hangs', 'heads', 'Friends?', 'Who do you spend time with?', { def: true }), ...gossip] }),
  ];
}
/** flat list of every item (categories and kids) by id */
export function intentIndex(cats) { const m = new Map(); for (const c of cats) { m.set(c.id, c); for (const k of c.kids || []) m.set(k.id, { ...k, parent: c }); } return m; }
/** is this intent usable? null = yes, else the lock reason (a kid is locked when it or its category is) */
export function lockOf(cats, id) { const it = intentIndex(cats).get(id); if (!it) return 'unknown'; if (it.parent?.off) return it.parent.why || 'unavailable'; return it.off ? (it.why || 'unavailable') : null; }

// ------------------------------------------------------------------------------------------------ effects (pure): trust deltas per intent
// memo is per conversation: { once: Set, small: n }. Effects that Duty / Haul / Repair apply themselves (help, order, give) are 0 here.
export const EFFECT = { greet: 0.01, 'duty.ask': 0.01, 'duty.fixing': 0.01, mood: 0.02, small: 0.03, 'social.hangs': 0.02, gossip: 0.01, 'duty.take': 0.03 };
export function effectFor(id, memo) {
  memo.once = memo.once || new Set(); memo.small = memo.small || 0;
  if (id === 'small') { const d = EFFECT.small * Math.pow(0.5, memo.small); memo.small++; return Math.round(d * 1e4) / 1e4; }   // diminishing: x0.5 each repeat
  const key = id.startsWith('social.gossip.') ? id : id, base = id.startsWith('social.gossip.') ? EFFECT.gossip : EFFECT[id];
  if (!base || memo.once.has(key)) return 0; memo.once.add(key); return base;
}

// ------------------------------------------------------------------------------------------------ lines (pure): { text, gesture }
const pickR = (a, rnd) => a[Math.floor(rnd() * a.length) % a.length];
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
export const YOU = { greet: 'Hello.', 'duty.ask': 'What are you on right now?', 'duty.fixing': 'What is wrong with it?', 'duty.status': 'How does the ship look from where you sit?', 'duty.assist': 'Here, let me hold that.', 'duty.take': 'I will take it from here.', mood: 'How are you doing?', small: 'Quiet watch?', 'help.duty': 'Can you give me a hand with my duty?', 'help.fix': 'Could you look at a fault for me?', 'order.duty': 'I need you on your duty.', 'order.deleg': 'Take this one for me.', 'order.fix': 'Get that fault fixed.', give: 'Here — this is for you.', 'social.hangs': 'Who do you spend your time with?', 'social.gossip': 'Heard anything about…' };
export const youLine = (id, label = '') => id.startsWith('social.gossip.') ? `Heard anything about ${label}?` : YOU[id] || YOU[id.split('.').slice(0, 2).join('.')] || '…';
// small talk keyed by a tag the speaker has; first match wins (in tag order), else by mood
const SMALL_TAG = {
  'speech:black-humor': 'Nobody has been sucked into space yet. So, a good watch.', 'stress:black-humor': 'Nobody has been sucked into space yet. So, a good watch.',
  'speech:gallows-humor': 'If the hull goes, at least the paperwork goes with it.', 'speech:deadpan': 'The coffee is warm. That is the highlight.',
  'speech:cheerful': 'Did you see the nebula off the port side earlier? Gorgeous.', 'speech:sarcastic': 'Oh, thrilling. Another flawless shift on the finest ship in the fleet.',
  'speech:rambling': 'I was reorganising my locker, and you would not believe what was behind the boots. Long story.', 'speech:terse': 'Quiet. Good.',
  'speech:formal': 'Uneventful so far, which is exactly as it should be.', 'speech:casual': 'Pretty chill. Could use a nap, honestly.',
  'habit:hums': 'Sorry, was I humming again? Old song from home.', 'habit:whistles': 'Can not get this tune out of my head.', 'habit:drinks-from-flask': 'Just tea. Mostly tea.',
  'habit:chews-gum': 'Want some? Last pack from the starbase.', 'habit:talks-to-machines': 'This console has been very cooperative today. I told it so.',
  'social:homesick': 'Got a letter from home last week. Read it six times.', 'social:joker': 'Why did the ensign cross the corridor? Long story. Ask me later.',
  'social:gossip': 'Quiet? Ha. You have not heard what happened in the mess.', 'social:loner': 'Quiet is how I like it.',
  'stress:comfort-eats': 'Is it lunch yet? It feels like lunch.', 'stress:overworks': 'I have been on since before the watch started. Again.',
  'workstation:proud-of-station': 'Have you seen my station today? Spotless.', 'workstation:chatty-at-work': 'Always nice to have someone to talk to. The panels do not answer.',
  'workstation:anxious-about-faults': 'Quiet, yes. Too quiet, if you ask me.', 'lift:small-talk': 'They say the replicators on deck three make better soup. I have doubts.',
};
const SMALL_MOOD = { warm: ['Quiet enough. Nice to have company.', 'Not bad at all. The ship hums along.'], neutral: ['Quiet. Long, though.', 'So far. Ask me again in an hour.'], edge: ['Quiet? It never is for long.', 'If you say so.'] };
const MOOD_LINES = {
  warm: ['Good, actually. You pull your weight — that counts here.', 'Better for asking. Thanks.'],
  neutral: ['Fine, I suppose. Long watch.', 'Holding up. Ask me again later.'],
  edge: ['Tired. And I hear things about this watch.', 'Honestly? On edge.'],
};
const GOSSIP_TYPE = {
  'close-friend': (g) => `${g.family}? One of the best. We ${g.reason}.`, friend: (g) => `${g.family}? Good sort — we ${g.reason}.`, 'old-shipmate': (g) => `${g.family} and I go way back. We ${g.reason}.`,
  rival: (g) => `${g.family}. Don't get me started — ${g.reason}.`, feud: (g) => `Keep ${g.family} away from me. ${cap(g.reason)}.`,
  spouse: (g) => `${g.family}? We share quarters. Don't tell them I said they snore.`, romance: (g) => `${g.family}? Ask them about the arboretum. That is all I am saying.`,
  mentor: (g) => `${g.family} taught me half of what I know.`, protege: (g) => `${g.family} is coming along nicely. Sharp.`,
};
/** what the speaker says for an intent. c: line context (Talk.lineCtx) with bark, mood, sir, activity, room, loop, repair, board, shipBad, hangs, gossip, tags, alertSev */
export function lineFor(id, c, rnd = Math.random) {
  const sir = c.sir ? `, ${c.sir}` : '', mood = c.mood || 'neutral';
  if (id === 'open') return { text: mood === 'edge' ? `Yes${sir}?` : pickR(c.bark?.length ? [c.bark[0]] : [`${c.sir ? cap(c.sir) + '?' : 'Hm?'}`], rnd), gesture: 'nod' };
  if (id === 'greet') return { text: c.bark?.length ? pickR(c.bark, rnd) : mood === 'warm' ? `Good to see you${sir}.` : mood === 'edge' ? `${c.sir ? cap(c.sir) + '.' : 'Hello.'} What is it?` : `Hello${sir}. What can I do for you?`, gesture: mood === 'warm' ? 'small_smile' : 'nod' };
  if (id === 'duty.fixing' && c.repair) { const R = c.repair; return { text: R.state === 'working' ? `Patching the ${R.name} — about ${R.pct}% there.` : R.state === 'part' ? `The ${R.name}. I need a part before I can finish.` : `The ${R.name} is ${R.status || 'down'}. On my way to it.`, gesture: 'talk_emphasis' }; }
  if (id === 'duty.ask' || id === 'duty.fixing') {
    const act = cap((c.activity || 'my work').replace(/_/g, ' ')), loop = c.loop ? ` Mostly ${c.loop.toLowerCase()}, every so often.` : '';
    return { text: `${act}${c.room ? ` — ${c.room}` : ''}.${loop}`.slice(0, 160), gesture: 'talk_emphasis' };
  }
  if (id === 'duty.status') {
    const bad = (c.board || []).filter(s => s.status !== 'nominal'), dn = c.deptName || 'Our';
    if (!bad.length) return { text: `${dn} board is green.${c.shipBad ? ` Elsewhere ${c.shipBad} system${c.shipBad > 1 ? 's are' : ' is'} acting up.` : ' The ship is behaving.'}`, gesture: 'nod' };
    const list = bad.slice(0, 2).map(s => `${s.name} ${s.status}`).join(', '); return { text: `${list}. We are on it${sir}.`, gesture: mood === 'edge' ? 'frown' : 'head_tilt' };
  }
  if (id === 'mood') { const tail = (c.alertSev || 0) >= 2 ? ' With the alert on, nervous.' : ''; return { text: (pickR(MOOD_LINES[mood], rnd) + tail).trim(), gesture: mood === 'warm' ? 'small_smile' : mood === 'edge' ? (rnd() < 0.5 ? 'sigh' : 'frown') : 'head_tilt' }; }
  if (id === 'small') { const t = (c.tags || []).find(t => SMALL_TAG[t]); return { text: t && !(c.smallN > 0 && rnd() < 0.5) ? SMALL_TAG[t] : pickR(SMALL_MOOD[mood], rnd), gesture: mood === 'warm' ? 'small_smile' : 'head_tilt' }; }
  if (id === 'social.hangs') return { text: c.hangs || 'Whoever is on my watch, I suppose.', gesture: 'small_smile' };
  if (id.startsWith('social.gossip.')) { const g = c.gossip; if (!g || (c.trust ?? 0.5) < TRUST_GOSSIP + 0.1) return { text: 'I don\'t really know anything.', gesture: 'shrug' }; const f = GOSSIP_TYPE[g.type]; return { text: f ? f(g) : `${g.family}? Decent enough. We ${g.reason}.`, gesture: g.valence < 0 ? 'shake_head' : 'eyebrow_raise' }; }
  return { text: '…', gesture: 'head_tilt' };
}
/** reply line for an action result ({ ok, refused, why }) */
export function resultLine(kind, r, c, rnd = Math.random) {
  const sir = c.sir ? `, ${c.sir}` : '';
  if (r?.ok) return { text: pickR(kind === 'order' ? [`Understood${sir}. On it.`, `Right away${sir}.`] : kind === 'help' ? [`Sure, I can cover that.`, `I've got it. Go.`] : kind === 'fix' ? [`I'll get on the ${c.sysName || 'fault'}.`, `Heading there now.`] : kind === 'take' ? [`All yours${sir}. Panel is open.`] : kind === 'assist' ? ['Thanks — hold it steady.'] : ['Thanks.'], rnd), gesture: 'nod' };
  if (r?.refused) return { text: kind === 'order' ? `I've got my own work${sir}.` : kind === 'fix' ? `Not my system${sir}.` : `Sorry, I can't spare the time right now.`, gesture: kind === 'order' ? 'shake_head' : 'shrug' };
  return { text: r?.why ? `${String(r.why).replace(/^[^:]*: "?|"$/g, '')}` : 'I can\'t do that.', gesture: 'shrug' };
}

// ------------------------------------------------------------------------------------------------ the glue: DOM + camera rig + speaker
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const CSS = `
body.talking>:not(#view):not(#tk):not(.screen):not(#fade):not(#ui-resume):not(script):not(style){visibility:hidden!important}
#tk{position:fixed;inset:0;z-index:14;pointer-events:none;font-family:var(--f-d,"Avenir Next Condensed","Roboto Condensed","Arial Narrow",Arial,sans-serif);color:#e8eef6;--u:#a3231c;--line:rgba(150,180,210,.26);--pan:rgba(7,11,19,.62);--dim:#8fa0b6;display:none}
#tk.on{display:block}#tk .bar{position:absolute;left:0;right:0;height:7vh;background:#000;transition:transform .55s cubic-bezier(.2,.8,.2,1)}#tk .bt{top:0;transform:translateY(-100%)}#tk .bb{bottom:0;transform:translateY(100%)}
#tk.in .bt,#tk.in .bb{transform:none}
#tk .vig{position:absolute;inset:0;opacity:0;transition:opacity .6s;background:radial-gradient(ellipse at 32% 46%,transparent 30%,rgba(2,3,6,.5) 64%,rgba(2,3,6,.88) 100%)}#tk.in .vig{opacity:1}
#tk .fade{opacity:0;transition:opacity .35s .15s}#tk.in .fade{opacity:1}
#tk .plate{position:absolute;left:3vw;bottom:calc(7vh + 34px);background:var(--pan);border:1px solid var(--line);border-left:4px solid var(--u);padding:7px 12px 7px 10px;border-radius:6px;min-width:220px;max-width:40vw;display:flex;gap:10px;align-items:flex-start}
#tk .plate img{width:40px;height:40px;border-radius:4px;border:1px solid var(--line);background:#0d1522;flex:none}
#tk .plate h1{margin:0;font-size:21px;letter-spacing:.05em;text-transform:uppercase;font-weight:600;line-height:1.05}#tk .plate .sub{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-top:2px}
#tk .pips{display:flex;gap:5px;margin-top:5px;flex-wrap:wrap}#tk .pip{display:inline-flex;align-items:center;gap:5px;font:10px var(--f-m,ui-monospace,monospace);letter-spacing:.08em;background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:999px;padding:2px 8px}
#tk .pip i{width:8px;height:8px;border-radius:50%;background:var(--dc,#9db2c8);display:inline-block}#tk .rank{color:#e2b23a;letter-spacing:-1px;font-size:12px}#tk .rank .e{color:#4a5368}#tk .rank b{color:#e8eef6;letter-spacing:.06em;font-size:10px;font-weight:400;margin-left:4px}
#tk .mood{margin-top:5px;display:flex;align-items:center;gap:7px;font-size:11px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase}#tk .mood svg{width:20px;height:20px}#tk .mood b{color:#e8eef6;font-weight:600}
#tk .badge{position:absolute;right:3vw;top:calc(7vh + 10px);font:10px var(--f-m,monospace);letter-spacing:.14em;color:#58c9b9;border:1px solid #58c9b9;border-radius:3px;padding:3px 8px;background:rgba(88,201,185,.08)}#tk .badge i{display:inline-block;width:6px;height:6px;background:#58c9b9;border-radius:50%;margin-right:6px;animation:tkpl 1.6s infinite}@keyframes tkpl{50%{opacity:.25}}
#tk .right{position:absolute;right:3vw;top:calc(7vh + 34px);bottom:calc(7vh + 8px);width:min(42vw,520px);display:flex;flex-direction:column;justify-content:space-between;gap:6px}
#tk .subt{background:var(--pan);border:1px solid var(--line);border-radius:6px;padding:9px 14px;min-height:64px}#tk .subt .nm{font:10px var(--f-m,monospace);letter-spacing:.12em;text-transform:uppercase;color:var(--uc,#f2a03d)}#tk .subt .tx{font-size:clamp(14px,2.4vh,21px);line-height:1.28;margin-top:3px}
#tk .subt .cur{display:inline-block;width:7px;height:.9em;background:#f2a03d;margin-left:2px;vertical-align:-2px;animation:tkbl 1s steps(2) infinite}@keyframes tkbl{50%{opacity:0}}
#tk .you{font-size:13px;color:var(--dim);font-style:italic;min-height:18px;margin-top:4px}#tk .you.no{color:#ff5a4a;font-style:normal}
#tk .wbox{position:relative;flex:1 1 0;min-height:0;display:flex;align-items:center;justify-content:center;pointer-events:auto}#tk .wbox svg{height:100%;max-height:min(56vh,560px);width:auto;max-width:100%;overflow:visible}
#tk .wseg{fill:rgba(9,14,24,.82);stroke:rgba(150,180,210,.35);stroke-width:1;cursor:pointer}#tk .wseg.hov{fill:rgba(242,160,61,.92);stroke:#ffd9a0}#tk .wseg.off{fill:rgba(9,14,24,.5);stroke-dasharray:3 3;cursor:not-allowed}#tk .wseg.off.hov{fill:rgba(255,90,74,.25);stroke:#ff5a4a}
#tk .wkid{fill:rgba(12,20,34,.92);stroke:rgba(88,201,185,.55);stroke-width:1;cursor:pointer}#tk .wkid.hov{fill:rgba(88,201,185,.95);stroke:#fff}#tk .wkid.off{fill:rgba(9,14,24,.5);stroke-dasharray:3 3}
#tk .wic{fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}#tk .wnum{fill:#06090f}#tk .wnumt{fill:#ffd9a0;font:700 10px var(--f-m,monospace);text-anchor:middle;dominant-baseline:central;pointer-events:none}
#tk .wlab{fill:#cfe0f0;font:700 11px var(--f-d,Arial);letter-spacing:.06em;text-transform:uppercase;pointer-events:none}#tk .wlab.hov{fill:#08101a}#tk .wlab.kid.hov{fill:#fff}#tk .wlab.off{fill:#6b7b90}
#tk .whub{fill:rgba(5,8,14,.95);stroke:rgba(150,180,210,.4);cursor:pointer}#tk .whub:hover{stroke:#ff5a4a}#tk .wt1{fill:#ffd9a0;font:800 13px var(--f-d,Arial);letter-spacing:.14em;text-anchor:middle;text-transform:uppercase;pointer-events:none}#tk .wt2{fill:#9fb2c8;font:10px Arial,sans-serif;text-anchor:middle;pointer-events:none}#tk .wdz{fill:none;stroke:none}#tk .wpt{pointer-events:none}
#tk .rel{position:relative;background:var(--pan);border:1px solid var(--line);border-radius:6px;padding:8px 12px}#tk .rel .row{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}#tk .rel .row b{color:#e8eef6;font-family:var(--f-m,monospace);letter-spacing:.04em}
#tk .meter{position:relative;height:10px;margin:7px 0 3px;border-radius:5px;background:linear-gradient(90deg,#7a2a24 0 20%,#6a6350 20% 35%,#5d6470 35% 55%,#2c6a58 55% 80%,#3fa57a 80%)}#tk .meter .mask{position:absolute;top:0;bottom:0;right:0;background:rgba(5,7,12,.74);border-radius:0 5px 5px 0;transition:width .8s cubic-bezier(.2,.8,.2,1)}
#tk .meter .tick{position:absolute;top:-3px;bottom:-3px;width:2px;background:#fff;box-shadow:0 0 6px #fff;transition:left .8s cubic-bezier(.2,.8,.2,1)}#tk .meter .ghost{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--dim);opacity:.8}
#tk .lab{display:flex;justify-content:space-between;font:9px var(--f-m,monospace);color:var(--dim)}#tk .delta{position:absolute;right:12px;top:-20px;font:bold 15px var(--f-m,monospace);opacity:0;transition:all .9s}#tk .delta.go{opacity:1;transform:translateY(-12px)}
#tk .hint{position:absolute;left:3vw;bottom:calc(7vh + 8px);font:10px var(--f-m,monospace);color:var(--dim);letter-spacing:.1em;background:rgba(5,7,12,.7);padding:3px 10px;border:1px solid var(--line);border-radius:999px;white-space:nowrap}#tk kbd{background:rgba(255,255,255,.1);border:1px solid var(--line);border-radius:3px;padding:0 4px;color:#e8eef6}
@media (max-width:820px){#tk .right{width:94vw;top:auto;height:52vh}#tk .plate{transform:scale(.85);transform-origin:left top}#tk .hint{display:none}}`;
const MOOD_SVG = { warm: '<path d="M5 14 q6 6 12 0"/><circle cx="8" cy="8" r="1"/><circle cx="14" cy="8" r="1"/>', edge: '<path d="M6 16 q5 -4 10 0"/><circle cx="8" cy="8" r="1"/><circle cx="14" cy="8" r="1"/><path d="M5 5 l4 2 M17 5 l-4 2"/>', neutral: '<path d="M6 15 h10"/><circle cx="8" cy="8" r="1"/><circle cx="14" cy="8" r="1"/>' };
const WV = 440;   // talk wheel viewBox: tighter than the quick wheel's (labels of the second ring may overflow; the svg is overflow:visible)
const MOOD_COL = { warm: '#5fd38d', edge: '#ffb347', neutral: '#8fa0b6' };

// soft depth of field + vignette for the High quality composer: blur grows with the distance from the face on screen
const DOF_SHADER = {
  uniforms: { tDiffuse: { value: null }, center: { value: null }, aspect: { value: 1.6 }, radius: { value: 0.16 }, amount: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 center; uniform float aspect, radius, amount; varying vec2 vUv;
    const vec2 K[12] = vec2[12](vec2(-.326,-.406),vec2(-.840,-.074),vec2(-.696,.457),vec2(-.203,.621),vec2(.962,-.195),vec2(.473,-.480),vec2(.519,.767),vec2(.185,-.893),vec2(.507,.064),vec2(.896,.412),vec2(-.322,-.933),vec2(-.792,-.598));
    void main(){
      vec2 d = (vUv - center) * vec2(aspect, 1.0); float m = smoothstep(radius, radius * 2.6, length(d)) * amount;
      vec4 c = texture2D(tDiffuse, vUv); if (m < 0.01) { gl_FragColor = c; return; }
      vec4 acc = c; vec2 r = vec2(0.011 / aspect, 0.011) * m;
      for (int i = 0; i < 12; i++) acc += texture2D(tDiffuse, vUv + K[i] * r);
      gl_FragColor = vec4((acc / 13.0).rgb * (1.0 - 0.18 * m), c.a);
    }`,
};

export class Talk {
  /**
   * ctx: { G, P, THREE, camera, renderer, post, CFG, vmScene, world (getter), ents (getter), NOM(), speak(person, text) -> {dur, mode},
   *        commsData(), duties(), voiceBark(person, kind), canTalk() -> null | 'reason' }
   */
  constructor(ctx) {
    this.c = ctx; this.M = createTalkMachine(); this.e = null; this.tt = 0; this.memo = null; this.log = [];
    this.hidden = []; this.dof = null; this.light = null; this._v = null; this._q = null;
    if (typeof document !== 'undefined') this.mount();
  }
  get active() { return this.M.active; }
  get G() { return this.c.G; }

  // ---------------------------------------------------------------- DOM
  mount() {
    if (!document.getElementById('tk-css')) { const st = document.createElement('style'); st.id = 'tk-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = this.el = document.createElement('div'); el.id = 'tk'; el.className = 'ui-layer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Conversation');
    el.innerHTML = `<div class="vig"></div><div class="bar bt"></div><div class="bar bb"></div>
      <div class="badge fade"><i></i>WORLD PAUSED · <span class="clk"></span></div>
      <div class="plate fade"><img alt=""><div><h1></h1><div class="sub"></div><div class="pips"></div><div class="mood"></div></div></div>
      <div class="right fade"><div><div class="subt"><div class="nm"></div><div class="tx"></div></div><div class="you"></div></div>
        <div class="wbox"><svg viewBox="${-WV / 2} ${-WV / 2} ${WV} ${WV}"></svg></div>
        <div class="rel"><div class="row"><span>Relationship</span><b class="rtx"></b></div><div class="meter"><div class="mask"></div><div class="ghost"></div><div class="tick"></div></div><div class="lab"><span>COLD</span><span>WARY</span><span>NEUTRAL</span><span>WARM</span><span>TRUSTED</span></div><span class="delta"></span></div></div>
      <div class="hint fade"><kbd>1</kbd>–<kbd>8</kbd> or click · <kbd>E</kbd>/<kbd>Esc</kbd>/centre = leave</div>`;
    document.body.appendChild(el); const q = (s) => el.querySelector(s);
    this.dom = { plate: q('.plate'), img: q('.plate img'), h1: q('.plate h1'), sub: q('.plate .sub'), pips: q('.pips'), mood: q('.mood'), clk: q('.clk'), nm: q('.subt .nm'), tx: q('.subt .tx'), you: q('.you'), svg: q('.wbox svg'), rtx: q('.rtx'), mask: q('.meter .mask'), ghost: q('.meter .ghost'), tick: q('.meter .tick'), delta: q('.delta') };
    const svg = this.dom.svg;
    svg.addEventListener('mousemove', (ev) => { if (!this.W) return; const [x, y] = this.toView(ev.clientX, ev.clientY); if (moveTo(this.W, x, y)) this.renderWheel(); });
    svg.addEventListener('mouseleave', () => { if (!this.W || this.W.digit != null) return; this.W.sel = -1; this.W.sub = -1; this.renderWheel(); });
    svg.addEventListener('mousedown', (ev) => {
      ev.stopPropagation(); ev.preventDefault(); if (!this.W || !this.M.inputOk) return; const [x, y] = this.toView(ev.clientX, ev.clientY); const r = Math.hypot(x, y);
      if (r < R0 - 4) { this.end(); return; }   // the hub = Leave
      moveTo(this.W, x, y); const P = this.W.sectors[this.W.sel]; if (this.W.sel < 0) return;
      if (P?.kids?.length && this.W.sub < 0 && r <= R1 + 8 && !P.off) { this.renderWheel(); return; }   // a category with a second ring: open it
      this.pick(pickItem(this.W) || (P?.off ? P : this.W.sub >= 0 ? P.kids[this.W.sub] : null));
    });
    addEventListener('keydown', (ev) => this.keydown(ev), true);
  }
  toView(x, y) { const r = this.dom.svg.getBoundingClientRect(), sc = WV / (Math.min(r.width, r.height) || 1); return [(x - r.left - r.width / 2) * sc, (y - r.top - r.height / 2) * sc]; }
  renderWheel() { if (!this.dom || !this.W) return; const P = UIHUB.portraits; this.dom.svg.innerHTML = wheelSVG(this.W, { portrait: P ? (p) => P.get(p) : null }); }
  keydown(ev) {
    if (this.G.phase !== 'talk' || !this.M.active) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (ev.repeat) return;
    const code = ev.code, W = this.W;
    if (code === 'Escape') { const UI = UIHUB.ui; if (UI?.top()?.kind === 'talk') UI.escape(); else this.end(); return; }
    if (code === 'KeyE') { this.end(); return; }
    if (!this.M.inputOk || !W) return;
    const d = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (d) { const it = digitPick(W, +d[1]); if (!it && W.sectors[W.sel]?.off) { W.digit = null; this.renderWheel(); this.pick(W.sectors[W.sel]); return; } this.renderWheel(); if (it) this.pick(it === 'off' ? (W.sub >= 0 ? W.sectors[W.sel]?.kids?.[W.sub] : W.sectors[W.sel]) : it); return; }
    if (code === 'Backspace') { if (W.digit != null || W.sel >= 0) { W.digit = null; W.sel = -1; W.sub = -1; this.renderWheel(); } else this.end(); return; }
    if (code === 'ArrowRight' || code === 'ArrowDown') { stepSel(W, 1); this.renderWheel(); }
    else if (code === 'ArrowLeft' || code === 'ArrowUp') { stepSel(W, -1); this.renderWheel(); }
    else if (code === 'Enter' || code === 'Space') { const P = W.sectors[W.sel]; this.pick(pickItem(W) || P); }
  }

  // ---------------------------------------------------------------- context
  /** plain data for buildIntents / lineFor (no live objects leak into the pure layer) */
  ctxFor(e) {
    const G = this.G, D = G.duty, pr = e.person, me = G.player, S = G.shipState, R = G.repair, soc = G.social, trust = D ? D.trust(pr) : 0.5;
    const job = R?.jobOf?.(pr) || null, faults = S ? SYSTEMS.filter(s => S.status(s.id) !== 'nominal').map(s => ({ sys: s.id, name: s.name, status: S.status(s.id), dept: s.dept })) : [];
    let gossip = []; if (soc) { try { gossip = soc.ties(pr).filter(r => r.b !== me.id && r.visible !== false && ['close-friend', 'friend', 'old-shipmate', 'rival', 'feud', 'spouse', 'romance', 'mentor', 'protege'].includes(r.type)).sort((a, b) => Math.abs(b.valence) * b.strength - Math.abs(a.valence) * a.strength || a.b - b.b).slice(0, 3).map(r => ({ id: r.b, family: soc.people[r.b]?.family || '?', type: r.type, valence: r.valence, reason: r.reason || 'work together' })); } catch { gossip = []; } }
    const subs = D?.subs() || [];
    return {
      npc: { id: pr.id, short: pr.short, family: pr.family, rank: pr.rank, dept: pr.dept, tags: pr.tags || [] }, me: { rank: me?.rank ?? 0, dept: me?.dept }, trust,
      isSub: subs.includes(pr), sameDept: !!me && pr.dept === me.dept, carry: G.carry ? G.carry.name : null,
      due: D ? D.loops.filter(l => l.state === 'due').map(l => ({ id: l.id, label: l.label })) : [], hasDuty: !!D?.loops.some(l => l.state === 'due' || l.state === 'idle'),
      faults, repair: job ? { sys: job.sys, name: SYS[job.sys]?.name || job.sys, pct: Math.round((job.progress || 0) * 100), state: job.state, status: S?.status(job.sys) } : null, gossip, social: !!soc,
    };
  }
  lineCtx(extra = {}) {
    const G = this.G, e = this.e, pr = e.person, me = G.player, rank = (me?.rank ?? 0) - pr.rank, bk = this.c.commsData?.()?.billets?.[pr.billet]?.bark || {};
    const w = G.sim?.where?.(pr), duties = this.c.duties?.() || {}, S = G.shipState, cx = this.cx;
    const board = S ? SYSTEMS.filter(s => s.dept === pr.dept).map(s => ({ name: s.name, status: S.status(s.id) })) : [];
    return {
      sir: rank > 0 ? (me.rank >= 4 ? 'sir' : RANK_SHORT[me.rank]) : '', mood: this.mood, trust: cx.trust, tags: pr.tags || [],
      bark: ((rank > 0 ? bk.greetHi : rank < 0 ? bk.greetLo : bk.greet) || bk.greet || []).slice(0, 6), activity: e.repairing ? 'repairing' : w?.activity, room: w?.room,
      loop: duties.billets?.[pr.billet]?.loops?.[0]?.label, repair: cx.repair, board, deptName: DEPT[pr.dept]?.name, shipBad: S ? SYSTEMS.filter(s => S.status(s.id) !== 'nominal' && s.dept !== pr.dept).length : 0,
      alertSev: G.comms?.alerts?.top?.()?.def?.severity || 0, smallN: this.memo?.small || 0, ...extra,
    };
  }
  refresh() {
    if (!this.e) return; this.cx = this.ctxFor(this.e); const t = this.cx.trust, stress = clamp((this.G.comms?.alerts?.top?.()?.def?.severity ?? 0) / 4, 0, 1);
    this.mood = moodOf({ trust: t, stress, busy: !!this.cx.repair }); this.cats = buildIntents(this.cx);
    const W = this.W, sel = W?.sel ?? -1; this.W = newWheel(this.cats, { held: false, title: 'Leave', kind: 'talk' }); this.W.pinned = true; this.W.sel = sel;
    this.renderWheel(); this.renderPlate(); this.renderRel();
  }

  // ---------------------------------------------------------------- begin / end
  /** E on a crew member. true = handled (a conversation started, or a refusal was said); false = caller falls back to the list menu */
  begin(e) {
    const G = this.G, H = e?.mesh?.userData?.human;
    if (!this.c.NOM() || this.M.active || G.phase !== 'play' || !e?.person || e.fake || !H || !H.bones?.Head || e.turning !== undefined || e.cower || e.dead) return false;
    const why = this.c.canTalk?.(e); if (why) { G.say(why, 'warn'); return true; }
    try {
      const cam = this.c.camera; this._v = cam.position.clone(); this._q = cam.quaternion.clone();
      this.save = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, order: cam.rotation.order, phase: G.phase, yaw: this.c.P.yaw, pitch: this.c.P.pitch,
        rot: e.mesh.rotation.y, clip: H.current, standing: H.standing, look: [H.lookYaw, H.lookPitch], add: H.add, alert: G.comms?.alerts?.top?.()?.def?.severity || 0, shipPhase: G.phases?.phase, hp: G.hp };
      this.e = e; this.tt = 0; this.memo = { once: new Set(), small: 0 }; this.lines = []; this.pending = null; this.speech = null; this.typing = null; this.glanceT = TALK.glance[0] + Math.random() * 2; this.glance = 0;
      this.seated = /sit/.test(H.current || ''); this.restoreRot = undefined; this._occ = false;
      if (!this.seated && H.current !== 'idle') H.play('idle', { fade: 0.35 });
      e.fid = e.fid || new Fidgeter(e.person, G.runSeed || 1); e.talkHold = true;
      // which way the camera looks from: towards the player (they turn to face us); seated people keep facing their station, so stay within 55 deg of it
      const P = this.c.P, mp = e.mesh.position; let ax = P.x - mp.x, az = P.z - mp.z; const n = Math.hypot(ax, az) || 1; ax /= n; az /= n;
      this.yawT = Math.atan2(ax, az);
      if (this.seated) { const fy = e.mesh.rotation.y, dy = clamp(wrapAng(this.yawT - fy), -0.95, 0.95); this.yawT = fy + dy; ax = Math.sin(this.yawT); az = Math.cos(this.yawT); }
      this.fwd0 = { x: ax, z: az }; this.clear = null; this.face = null; this.camPos = null; this.camLook = null;
      G.phase = 'talk'; this.M.begin(); document.body?.classList.add('talking');
      UIHUB.ui?.open('talk', { close: () => this.end() });   // releases pointer lock on purpose: no pause screen, Esc pops this layer
      this.memo.trust0 = G.duty ? G.duty.trust(e.person) : 0.5;
      if (this.c.vmScene) { this.vmWas = this.c.vmScene.visible; this.c.vmScene.visible = false; }
      this.addLight(); this.setupDof();
      this.refresh(); this.showUI(true); this.dom && (this.dom.you.textContent = '', this.dom.tx.textContent = '', this.dom.nm.textContent = '');
      this.queue(lineFor('open', this.lineCtx()), 0.75, null);
      this.step(0, 0); return true;
    } catch (er) { console.warn('talk: begin failed, falling back to the list menu', er); this.abort(); return false; }
  }
  /** leave (Esc / E / hub / Leave). fast = hurried (alert, hazard): 0.3 s */
  end(fast = false) {
    if (!this.M.active || this.M.state === 'out') return false; this.M.end(fast); this.pending = null;
    UIHUB.ui?.closed('talk');   // re-requests pointer lock inside this key / click gesture; a refusal shows the "Click to resume" chip in play
    this.showUI(false); return true;
  }
  /** immediate restore (speaker removed, phase changed under us, begin failed) */
  abort() { if (this.e || this.M.active) this.finish(true); }
  finish(aborted = false) {
    const G = this.G, cam = this.c.camera, e = this.e, s = this.save;
    this.M.abort();
    if (s) { cam.position.copy(s.pos); cam.quaternion.copy(s.quat); cam.fov = s.fov; cam.updateProjectionMatrix(); cam.rotation.order = s.order || 'YXZ'; cam.updateMatrixWorld?.(); }
    if (e?.mesh && s) {
      const H = e.mesh.userData.human; e.talkHold = false;
      if (H) { H.add = null; H.face({ JawDrop: 0, Smile: 0, Frown: 0, LeftInnerBrowUp: 0, RightInnerBrowUp: 0, LeftUpperLidClosed: 0, RightUpperLidClosed: 0 }); if (s.clip && H.current !== s.clip) H.play(s.clip, { fade: 0.3 }); H.standing = s.standing; }
      if (!this.seated) e.mesh.rotation.y = this.restoreRot ?? s.rot;
    }
    for (const m of this.hidden) m.visible = true; this.hidden = [];
    if (this.c.vmScene && this.vmWas !== undefined) this.c.vmScene.visible = this.vmWas;
    if (this.light) { this.light.parent?.remove(this.light); this.light = null; }
    if (this.dof) this.dof.enabled = false;
    document.body?.classList.remove('talking'); this.showUI(false, true);
    if (UIHUB.ui?.has('talk')) UIHUB.ui.closed('talk');
    if (G.phase === 'talk') G.phase = 'play';
    this.e = null; this.save = null; this.speech = null; this.pending = null;
  }

  // ---------------------------------------------------------------- choices
  pick(it) {
    if (!it || !this.M.inputOk || !this.e) return false;
    const lock = lockOf(this.cats, it.id); const dom = this.dom;
    if (lock) { if (dom) { dom.you.textContent = lock; dom.you.className = 'you no'; } return false; }
    if (it.kids?.length && !it.def) { const k = it.kids.find(k => k.def && !k.off) || it.kids.find(k => !k.off); if (!k) return false; it = k; }
    return this.choose(it.id);
  }
  /** run an intent by id (tests and the wheel). Returns the reply { text, gesture } or false when locked */
  choose(id) {
    if (!this.e || !this.M.inputOk) return false; const lock = lockOf(this.cats, id); if (lock) { if (this.dom) { this.dom.you.textContent = lock; this.dom.you.className = 'you no'; } return false; }
    const G = this.G, D = G.duty, pr = this.e.person, it = intentIndex(this.cats).get(id), you = youLine(id, it?.label);
    if (this.dom) { this.dom.you.textContent = 'You: “' + you + '”'; this.dom.you.className = 'you'; }
    try { G.sayLog?.push({ t: G.time, msg: `You: ${you}`, cls: 'you' }); } catch { }
    const t0 = D ? D.trust(pr) : 0.5; let line = null, bump = 0; const lc = () => this.lineCtx(), rnd = Math.random;
    const [head, , arg] = id.split('.'); const sysOf = (s) => SYS[s]?.name || s;
    try {
      if (id === 'give') { line = this.give(); }
      else if (head === 'help') { if (id === 'help.duty') line = resultLine('help', D.askHelp(pr), lc()); else { const r = G.repair?.order(pr, arg) || { ok: false, why: 'Nothing to fix.' }; line = resultLine('fix', r, { ...lc(), sysName: sysOf(arg) }); } }
      else if (head === 'order') {
        if (id === 'order.duty') line = resultLine('order', D.order(pr, null), lc());
        else if (id.startsWith('order.deleg.')) line = resultLine('order', D.delegate(pr, id.slice('order.deleg.'.length)), lc());
        else if (id.startsWith('order.fix.')) { const r = G.repair?.order(pr, arg) || { ok: false, why: 'Nothing to fix.' }; line = resultLine('fix', r, { ...lc(), sysName: sysOf(arg) }); }
      }
      else if (id === 'duty.assist') { const ok = G.repair?.assist(this.cx.repair?.sys); line = resultLine('assist', { ok: !!ok, why: 'Not yet — I am not on the panel.' }, lc()); }
      else if (id === 'duty.take') { const j = G.repair?.jobs?.get(this.cx.repair?.sys); if (j) { try { G.repair.abort(j, 'the player took over'); } catch { } } line = resultLine('take', { ok: !!j, why: 'There is nothing to take over.' }, lc()); bump = j ? effectFor(id, this.memo) : 0; }
      else { const gid = id.startsWith('social.gossip.') ? +id.slice(14) : null; const extra = id === 'social.hangs' ? { hangs: G.social ? G.social.talkLine(pr, G.player) : null } : gid != null ? { gossip: this.cx.gossip.find(g => g.id === gid) } : {}; line = lineFor(id, this.lineCtx(extra), rnd); bump = effectFor(id, this.memo); }
    } catch (er) { console.warn('talk: intent failed', id, er); line = { text: 'Sorry — what was that?', gesture: 'head_tilt' }; }
    if (bump && D) D._bump(pr, bump);
    const t1 = D ? D.trust(pr) : 0.5; this.queue(line, TALK.replyDelay, t1 - t0); this.refresh(); this.log.push({ id, text: line?.text, d: t1 - t0 });
    return line;
  }
  give() {
    const G = this.G, e = this.e, D = G.duty, pr = e.person, cr = G.carry; if (!cr) return { text: 'Hm?', gesture: 'head_tilt' };
    const job = G.repair?.jobOf?.(pr); if (job?.state === 'part' && G.repair.deliverPart(job.sys)) { D?._bump(pr, 0.06); G.carry = null; return { text: 'That is the part I needed. Now we are in business.', gesture: 'small_smile' }; }
    let said = null; const say = (t) => { said = t; };
    const opts = G.haul?.talkOpts ? G.haul.talkOpts(e, say, D) : [];
    if (opts.length) { const o = opts.find(x => /^(Give|Offer)/.test(x.label)) || opts[0]; o.run(); }
    else { D?._bump(pr, 0.06); said = 'Oh — thanks. I was looking for that.'; G.carry = null; }
    return { text: said || 'Thanks.', gesture: 'small_smile' };
  }
  /** queue a reply line in talk time (works with stepped frames in tests) */
  queue(line, delay = 0, delta = null) { if (line) this.pending = { at: this.tt + delay, line, delta }; }
  sayNow(line, delta) {
    const G = this.G, pr = this.e.person, text = String(line.text || '…'); let r = null;
    try { r = this.c.speak ? this.c.speak(pr, text) : null; } catch { r = null; }
    const voice = pr.voice || NEUTRAL_VOICE, plan = babblePlan(text, voice), mode = r?.mode || getMode();
    this.speech = { t: -0.05, dur: r?.dur || plan.total, syl: mode === 'synth' ? null : plan.syl, text };
    this.typing = { text, n: 0 }; this.lines.push(text);
    if (this.dom) { this.dom.nm.textContent = `${pr.short} · ${pr.title || ''}`; this.dom.tx.innerHTML = '<span class="cur"></span>'; }
    try { G.say(`${pr.short}: ${text}`, 'npc'); } catch { }   // G.sayLog keeps every line (the toast itself is hidden while talking)
    if (line.gesture) this.e.fid?.force(line.gesture);
    this.nextBeat = 1.4 + Math.random() * 1.2;
    if (delta) this.flashDelta(delta);
  }

  // ---------------------------------------------------------------- per frame (phase 'talk'; the rest of the world is frozen)
  step(dt, t) {
    const e = this.e; if (!this.M.active || !e) return;
    if (this.watch()) return;
    this.tt += dt; const ev = this.M.tick(dt);
    if (this.pending && this.tt >= this.pending.at && this.M.state !== 'out') { const p = this.pending; this.pending = null; this.sayNow(p.line, p.delta); }
    this.speaker(dt); this.camera(dt); this.typeStep(dt);
    try { this.c.world?.update(dt, t); } catch { }   // lamps / screens keep their glow (visual only, no logic)
    if (ev === 'done') this.finish();
  }
  /** robustness: speaker gone / dead, phase changed under us, a red alert or hazard started -> end (hurried) or abort */
  watch() {
    const G = this.G, e = this.e;
    if (G.phase !== 'talk') { this.abort(); return true; }
    const ents = this.c.ents || []; if (!ents.includes(e) || !e.mesh?.parent || ['dead', 'corpse', 'crazed', 'evacuated'].includes(e.person?.status) || e.turning !== undefined) { this.abort(); return true; }
    if (this.M.state !== 'out') {
      const sev = G.comms?.alerts?.top?.()?.def?.severity || 0, ph = G.phases?.phase;
      if ((sev >= 3 && sev > this.save.alert) || (ph && this.save.shipPhase && ph !== this.save.shipPhase) || G.hp < this.save.hp) { this.sayNow({ text: 'I have to go!', gesture: 'nod' }); this.end(true); }
    }
    return false;
  }
  /** the speaker: idle loop, turn to camera, gesture layer, blink, jaw, mood face, eye contact */
  speaker(dt) {
    const e = this.e, H = e.mesh.userData.human, m = e.mesh, out = this.M.state === 'out'; e.t = (e.t || 0) + dt;
    if (!this.seated) { const want = out ? this.save.rot : this.yawT; m.rotation.y += wrapAng(want - m.rotation.y) * damp(TALK.turnRate, dt); if (out) this.restoreRot = m.rotation.y; }
    const sp = this.speech; let jaw = 0;
    if (sp) { sp.t += dt; jaw = sp.syl ? jawAt(sp.syl, sp.t) : sp.t < sp.dur ? flapAt(sp.t) : 0; if (sp.t > sp.dur + 0.3) this.speech = null; }
    const talking = !!this.speech && this.speech.t < this.speech.dur;
    if (!this.seated && H.has?.('idle_talking')) H.play(talking ? 'idle_talking' : 'idle', { fade: 0.45 });
    if (talking && (this.nextBeat -= dt) <= 0) { this.nextBeat = 1.4 + Math.random() * 1.2; if (!e.fid.cur) e.fid.force('talk_emphasis'); }
    const o = e.fid.update(dt, { state: 'talking', stress: clamp((this.save.alert || 0) / 4, 0, 1), playerNear: true });
    H.add = o.bones;
    const blink = ((this.tt * 0.37 + (m.id || 0) * 0.13) % 1) > 0.965 ? 1 : 0, f = { JawDrop: 0, Smile: 0, Frown: 0, LeftInnerBrowUp: 0, RightInnerBrowUp: 0, LeftUpperLidClosed: blink, RightUpperLidClosed: blink };
    Object.assign(f, MOOD_FACE[this.mood] || {}); for (const k in o.face) f[k] = Math.max(f[k] || 0, o.face[k]);
    f.JawDrop = Math.max(f.JawDrop || 0, jaw * 0.55); H.face(f);
    // eye contact: head turns to the camera (clamped), with a thinking glance away now and then
    const cam = this.c.camera, hp = this.headPos(); let yaw = 0, pitch = 0;
    if (hp && !out) { const dx = cam.position.x - hp.x, dz = cam.position.z - hp.z, dy = cam.position.y - hp.y; yaw = clamp(wrapAng(Math.atan2(dx, dz) - m.rotation.y), -TALK.lookMax, TALK.lookMax); pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -TALK.pitchMax, TALK.pitchMax); }
    if ((this.glanceT -= dt) <= 0) { this.glance = 0.8; this.glanceT = TALK.glance[0] + Math.random() * (TALK.glance[1] - TALK.glance[0]) * ((e.person.tags || []).includes('habit:avoids-eye-contact') ? 0.4 : 1); }
    if (this.glance > 0) { this.glance -= dt; if (!talking) yaw += 0.4; }
    const kk = damp(5, dt); H.lookYaw += (yaw - H.lookYaw) * kk; H.lookPitch += (pitch - H.lookPitch) * kk;
    H.update(dt);
  }
  headPos(out) { const H = this.e?.mesh?.userData?.human, b = H?.bones?.Head; if (!b) return null; const v = out || (this._hp || (this._hp = this.c.camera.position.clone())); this.e.mesh.updateMatrixWorld(true); b.getWorldPosition(v); return v; }
  /** face centre (world) from the Head bone: up and a little forward along the speaker's facing */
  faceCentre() { const hp = this.headPos(); if (!hp) return null; const m = this.e.mesh, s = (m.userData.human.height || 1.75) / 1.75; return { x: hp.x + Math.sin(m.rotation.y) * TALK.faceFwd * s, y: hp.y + TALK.faceUp * s, z: hp.z + Math.cos(m.rotation.y) * TALK.faceFwd * s }; }
  /** the rig: target framing (clearance picked once), damped head follow, blend from / to the saved first-person pose */
  camera(dt) {
    const cam = this.c.camera, s = this.save, k = this.M.k, fc = this.faceCentre(); if (!fc || !s) return;
    const aspect = cam.aspect || 16 / 9;
    if (!this.clear) {   // the spot in front of the face: raycast face -> camera; shrink / swing round if a wall is in the way
      const W = this.c.world, mesh = this.meshRay(fc); this.clear = pickClearance(this.fwd0, (c) => { const h = W?.raycast ? W.raycast(fc.x, fc.y, fc.z, c.x, 0, c.z, TALK.dist + 0.3) : null; return Math.min(h ? h.dist : Infinity, mesh(c)); });
    }
    const fr = framing(fc, this.clear, { dist: this.clear.dist, aspect });
    if (!this.camPos || dt === 0) { this.camPos = { ...fr.pos }; this.camLook = { ...fr.look }; }
    else { const a = damp(TALK.follow, dt); for (const ax of ['x', 'y', 'z']) { this.camPos[ax] += (fr.pos[ax] - this.camPos[ax]) * a; this.camLook[ax] += (fr.look[ax] - this.camLook[ax]) * a; } }
    // target orientation: put the camera at the target and look; then blend from the saved pose
    cam.position.set(this.camPos.x, this.camPos.y, this.camPos.z); cam.lookAt(this.camLook.x, this.camLook.y, this.camLook.z); const qT = this._q.copy(cam.quaternion);
    cam.position.copy(s.pos).lerp(this._v.set(this.camPos.x, this.camPos.y, this.camPos.z), k); cam.quaternion.slerpQuaternions(s.quat, qT, k);
    const breath = 1 + TALK.breath * Math.sin(this.tt * Math.PI * 2 * TALK.breathHz); cam.fov = lerp(s.fov, TALK.fov * breath, k); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    if (k >= 0.3 && !this._occ) this.occlude(fc, fr, aspect);
    if (this.light) { const f = this.clear, r = fr.right; this.light.position.set(fc.x + f.x * 0.75 - r.x * 0.45, fc.y + 0.32, fc.z + f.z * 0.75 - r.z * 0.45); this.light.intensity = (this.lightI || 1.2) * k; }
    if (this.dof) { const p = this._v.set(fc.x, fc.y, fc.z).project(cam); this.dof.uniforms.center.value.set((p.x + 1) / 2, (p.y + 1) / 2); this.dof.uniforms.aspect.value = aspect; this.dof.uniforms.amount.value = k; this.dof.enabled = k > 0.01 && this.c.CFG?.quality === 'high'; }
    const clk = this.G.comms?.clock?.format?.(); if (clk && this.dom) this.dom.clk.textContent = `SHIP TIME ${clk}`;
  }
  /** frozen bodies near the lens or in frame up to 3.5 m behind the speaker are hidden for the close-up (restored on exit); far ones stay as background */
  occlude(fc, fr, aspect) {
    this._occ = true; const fd = project(fc, fr.pos, fr.look, TALK.fov, aspect).depth;
    for (const o of this.c.ents || []) {
      if (o === this.e || !o.mesh?.visible) continue; const px = o.mesh.position.x, pz = o.mesh.position.z;
      const inView = [0.5, 1.0, 1.5].some(y => { const q = project({ x: px, y, z: pz }, fr.pos, fr.look, TALK.fov, aspect); return q.depth > -0.3 && q.depth < fd + 3.5 && q.x > -0.4 && q.x < 1.4 && q.y > -0.4 && q.y < 1.4; });
      if (inView || Math.hypot(px - fr.pos.x, pz - fr.pos.z) < 0.9) { o.mesh.visible = false; this.hidden.push(o.mesh); }
    }
  }
  /** three.js raycast against the static scene (consoles, screens, doors the tile grid does not know about): dir -> free distance */
  meshRay(fc) {
    const T = this.c.THREE, scene = this.c.scene; if (!T?.Raycaster || !scene) return () => Infinity;
    const skip = new Set((this.c.ents || []).map(o => o.mesh).filter(Boolean)); if (this.light) skip.add(this.light);
    const objs = scene.children.filter(o => o.visible && !skip.has(o) && !o.isLight && !o.isPoints && !o.isSprite && !o.isCamera);
    const rc = new T.Raycaster(); rc.far = TALK.dist + 0.3; rc.camera = this.c.camera; const org = new T.Vector3(fc.x, fc.y, fc.z), dir = new T.Vector3();
    return (c) => { try { dir.set(c.x, 0, c.z).normalize(); rc.set(org, dir); const h = rc.intersectObjects(objs, true).find(h => h.object.isMesh && !h.object.isSkinnedMesh && h.object.visible && !(h.object.material?.transparent && (h.object.material.opacity ?? 1) < 0.35)); return h ? h.distance : Infinity; } catch { return Infinity; } };
  }
  addLight() { const T = this.c.THREE; if (!T || !this.c.scene) return; this.light = new T.PointLight(0xffe6c8, 0, 2.6, 2); this.lightI = 0.45; this.c.scene.add(this.light); this._occ = false; }
  setupDof() {
    if (this.dof || this._dofLoading || !this.c.post?.composer || typeof document === 'undefined') { if (this.dof) this.dof.enabled = false; return; }
    this._dofLoading = true; const T = this.c.THREE;
    import('three/addons/postprocessing/ShaderPass.js').then(({ ShaderPass }) => {
      const sh = { ...DOF_SHADER, uniforms: { ...DOF_SHADER.uniforms, center: { value: new T.Vector2(0.33, 0.55) } } };
      const pass = new ShaderPass(sh); pass.enabled = false; const C = this.c.post.composer, i = C.passes.indexOf(this.c.post.final); C.insertPass(pass, i >= 0 ? i : C.passes.length - 1); this.dof = pass;
    }).catch((er) => console.warn('talk: no depth of field', er));
  }
  typeStep(dt) {
    const ty = this.typing; if (!ty || !this.dom) return; ty.n += dt * TALK.cps; const n = Math.min(ty.text.length, Math.floor(ty.n));
    if (n >= ty.text.length) { this.dom.tx.textContent = ty.text; this.typing = null; } else if (n !== ty.shown) { ty.shown = n; this.dom.tx.innerHTML = esc(ty.text.slice(0, n)) + '<span class="cur"></span>'; }
  }

  // ---------------------------------------------------------------- HUD pieces
  showUI(on, now = false) { if (!this.el) return; if (on) { this.el.classList.add('on'); void this.el.offsetWidth; this.el.classList.add('in'); } else { this.el.classList.remove('in'); clearTimeout(this._hideT); if (now) this.el.classList.remove('on'); else this._hideT = setTimeout(() => { if (!this.M.active || this.M.state === 'out') this.el.classList.remove('on'); }, 600); } }
  renderPlate() {
    const d = this.dom, e = this.e; if (!d || !e) return; const p = e.person, dep = DEPT[p.dept], div = dep ? DIVISION[dep.division] : null;
    this.el.style.setProperty('--u', div ? hex(div.color) : '#a3231c'); this.el.style.setProperty('--uc', deptCol(p)); this.el.style.setProperty('--dc', deptCol(p));
    d.h1.textContent = p.given && p.family ? `${p.given} ${p.family}` : p.short; d.sub.textContent = `${RANK_SHORT[p.rank] || ''} · ${p.title || ''}`;
    const r = Math.max(0, Math.min(6, p.rank | 0)), tags = (p.tags || []).filter(t => /^(social|workstation|stress):/.test(t)).slice(0, 2).map(t => t.split(':')[1].replace(/-/g, ' '));
    d.pips.innerHTML = `<span class="pip rank">${'●'.repeat(Math.min(6, r + 1))}<span class="e">${'○'.repeat(Math.max(0, 6 - r - 1))}</span><b>${esc(RANK_SHORT[r])}</b></span><span class="pip"><i></i>${esc((dep?.name || p.dept || '').toUpperCase())}</span>${tags.length ? `<span class="pip">${esc(tags.join(' · '))}</span>` : ''}`;
    d.mood.innerHTML = `<svg viewBox="0 0 22 22" fill="none" stroke="${MOOD_COL[this.mood]}" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="10"/>${MOOD_SVG[this.mood]}</svg><span>Mood: <b>${MOOD_LABEL[this.mood]}</b></span>`;
    const P = UIHUB.portraits; if (P) { const u = P.url(p); if (d.img.getAttribute('src') !== u) d.img.src = u; d.img.dataset.pid = P.key(p); } else d.img.style.display = 'none';
  }
  renderRel() {
    const d = this.dom; if (!d || !this.cx) return; const t = clamp(this.cx.trust, 0, 1), p = t * 100, g = clamp(this.memo?.trust0 ?? t, 0, 1) * 100;
    d.mask.style.width = (100 - p) + '%'; d.tick.style.left = `calc(${p}% - 1px)`; d.ghost.style.left = `calc(${g}% - 1px)`; d.rtx.textContent = `${Math.round(p)}% · ${relLabel(t)}`;
  }
  flashDelta(dv) { const el = this.dom?.delta; if (!el || !dv || Math.abs(dv) < 0.0005) return; const n = Math.round(dv * 100) || Math.sign(dv); el.textContent = (n > 0 ? '+' : '') + n; el.style.color = n > 0 ? '#5fd38d' : '#ff5a4a'; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
}
