// Social tracker (Systems Nominal): every run's crew gets its own social life — groups, friendships, couples, rivalries,
// mentors, gossip and favours — dealt from the seed but shaped by who works, eats, sleeps and plays near whom.
// Pure logic (no three.js, no DOM; node-testable). Design notes and tuning: docs/social.md. Tests: tools/test-social.mjs.
//   generateSocial(roster, { seed, plan, data, clock, ship }) -> SocialGraph     (call after clock.assign(roster))
//   graph.relation(a, b)   a's view of b: { type, attitude, strength 0..1, valence -1..1, since (days), reason, visible, shared }
//                          type says what b is TO a ('mentor' = b mentors a); attitude is one-way (a is 'wary' of / 'in-awe' of / 'owes-favour' to b)
//   graph.friendsOf(p)  groupsOf(p)  affinity(a, b)  seekTargets(p, ctx)  preferredCompany(p, activity)  describe(p)  talkLine(p, asker)
//   graph.meetingFor(p, shipHour)  isFree(p, shipHour)  anchorOf(p)  quartersOf(p)  companionOf(p)     (read by js/sim.js)
//   graph.trustBias(player, p)  (js/duty.js initial trust)    graph.onTrustEvent(a, b, delta) / tick(dt) / events()    toJSON() / SocialGraph.fromJSON(j)
//   graph.hooks  [{ kind, people, text, secret }]  story hooks dealt with the graph (triangle, crush, exes, feud, camps, lineage, passed-over, secret, ...)
//   graph.rumours(p, { n, asker })  what p would pass on    aboutYou(p, you)  p's line about their history with you    playerBrief(you)  who your character already knows
//   graph.storyOf(a, b)  one sentence explaining the tie
// People are roster ids (or person objects). Same seed + same roster + same plan = identical graph (clock.js hash, never Math.random).
import { hash, hash01, WATCHES, WATCH_START } from './clock.js';
import { SHIPS } from './ships.js';

// ============================================================== DATA TABLES (designer-tunable)
// --- who counts as what
export const BRIDGE = new Set(['co', 'xo', 'so', 'cfo', 'helm', 'nav', 'ops', 'comms']);               // the bridge circle
export const HEADS = new Set(['cfo', 'ops', 'ce', 'cos', 'cso', 'cmo', 'counsel', 'qm']);              // department heads the bridge deals with
export const ROUTE_BILLETS = new Set(['cargo', 'rep', 'ttech', 'deck']);                                 // cargo / stores / loader route crews
export const ROUTE_ROOMS = new Set(['cargo', 'stores', 'transporter', 'shuttlebay']);                    // rooms on their duty routes
export const OFFWORK_BILLETS = new Set(['cargo', 'rep', 'ttech', 'deck', 'cook']);                       // get 0-2 off-work friends outside the department
export const FIXER_BILLETS = new Set(['qm', 'cargo', 'rep', 'galley', 'holo', 'ttech', 'deck']);         // who can run the favour book
// --- baseline contact (affinity is summed, then clamped 0..1)
export const DEPT_SAME = { command: 0.30, flight: 0.34, operations: 0.28, engineering: 0.34, security: 0.44, sciences: 0.26, medical: 0.40, services: 0.30 };
export const DEPT_PAIR = {            // cross-department contact, key = the two ids sorted and joined with '|'
  'command|flight': 0.22, 'command|operations': 0.16, 'command|security': 0.12, 'command|medical': 0.10, 'command|sciences': 0.10, 'command|engineering': 0.10, 'command|services': 0.05,
  'flight|operations': 0.14, 'engineering|flight': 0.12, 'engineering|operations': 0.14, 'operations|services': 0.12, 'security|services': 0.07, 'medical|sciences': 0.14,
  'engineering|services': 0.08, 'sciences|services': 0.06, 'flight|services': 0.09, 'engineering|sciences': 0.07, 'operations|security': 0.07,
};
export const DEPT_PAIR_DEFAULT = 0.03;
export const INSULAR = { security: -0.04 };                     // added to cross-department pairs involving this department
export const DEPT_COHESION = { command: 0.6, flight: 0.6, operations: 0.5, engineering: 0.6, security: 0.75, sciences: 0.45, medical: 0.7, services: 0.55 };
export const DEPT_HANGOUT = {         // where a department cell gathers off duty: [room, spot, activity]
  engineering: ['lounge', 'bar', 'engineers_at_the_bar'], medical: ['mess', 'table', 'medical_debrief_over_tea'], security: ['gym', 'weightbench', 'security_workout'],
  flight: ['holodeck', 'console', 'flight_sim_ladder'], sciences: ['arboretum', 'tree', 'science_walk'], services: ['mess', 'table', 'services_long_table'], operations: ['lounge', 'sofa', 'ops_coffee'],
};
export const BILLET_PAIR = {          // specific billet pairs who work shoulder to shoulder (sorted key)
  'co|xo': 0.45, 'so|xo': 0.30, 'co|so': 0.20, 'co|yeoman': 0.30, 'helm|nav': 0.35, 'cfo|helm': 0.20, 'cfo|nav': 0.15, 'comms|ops': 0.25, 'helm|ops': 0.12, 'comms|nav': 0.10,
  'ace|ce': 0.30, 'ce|xo': 0.10, 'cos|dep': 0.25, 'cmo|counsel': 0.25, 'doc|nurse': 0.20, 'medtech|nurse': 0.20, 'cook|galley': 0.35, 'cargo|rep': 0.20, 'cargo|ttech': 0.20,
  'cargo|cook': 0.12, 'cargo|deck': 0.14, 'cargo|guard': 0.06, 'cook|rep': 0.14, 'cargo|qm': 0.12, 'tchief|ttech': 0.25, 'deck|pilot': 0.25, 'bot|cook': 0.12, 'bot|env': 0.10,
  'carto|sensor': 0.18, 'carto|nav': 0.20, 'dc|eps': 0.15, 'eps|reactor': 0.20, 'dc|env': 0.20, 'comms|comp': 0.15, 'holo|rep': 0.10, 'counsel|xo': 0.10, 'armory|sec': 0.15,
};
export const PROFILE_REL = {          // docs/crew-sim/<billet>.json `relationships[].kind` (compiled into comms.json as `rel`)
  friend: { bonus: 0.18, why: 'get on well' }, mess_partner: { bonus: 0.14, why: 'share a mess table' }, confidant: { bonus: 0.16, why: 'trade confidences' },
  mentor: { bonus: 0.12, why: 'learned the job at the same console' }, rival: { bonus: -0.05, why: 'never agree on how the job is done', friendWhy: 'argue about how the job is done and rather enjoy it' },
};
export const RANK_MIX = {
  crossTier: -0.10, crossTierSameDept: -0.03,   // officer (rank >= 1) with enlisted: officers' mess vs crew lounge
  sameTier: 0.04, officersMess: 0.06,           // both lieutenant j.g. or above eat in the same corner
  perStep: 0.025,                               // per rank step beyond 1
  chain: 0.12,                                  // direct report: daily contact
  bridge: 0.18, bridgeHead: 0.10,               // bridge circle; bridge officer with a department head
};
export const WATCH_MIX = { same: 0.20, other: -0.02 };
export const PROX = { dutyRoom: 0.07, dutyRoomCap: 0.21, offRoom: 0.04, offRoomCap: 0.16, homeDeck: 0.06, group: 0.08, groupCap: 0.2 };
export const CHEMISTRY = { jitter: 0.32, sparkRate: 0.025, spark: 0.35 };   // the seeded part: plain chemistry, plus rare unlikely friendships
export const EXTROVERSION = {
  'social:gregarious': 0.3, 'social:joker': 0.15, 'social:flirty': 0.15, 'social:gossip': 0.12, 'social:cliquey': 0.05, 'social:confidant': 0.05, 'social:mentor': 0.05, 'social:peacemaker': 0.05,
  'social:loner': -0.38, 'social:homesick': -0.08, 'speech:terse': -0.06, 'speech:rambling': 0.05, 'workstation:chatty-at-work': 0.08, 'workstation:silent-worker': -0.08,
  'lift:small-talk': 0.06, 'lift:rides-in-silence': -0.06, 'stress:withdrawn': -0.06, 'stress:chatters': 0.04,
};
export const TAG_PAIR = [             // [tag, tag, affinity] — either way round
  ['social:joker', 'social:joker', 0.08], ['social:gossip', 'social:gossip', 0.10], ['social:rule-enforcer', 'social:joker', -0.10], ['social:rival-minded', 'social:rival-minded', -0.06],
  ['social:cliquey', 'social:cliquey', 0.06], ['social:confidant', 'social:homesick', 0.10], ['social:mentor', 'social:deferential', 0.06], ['social:commanding', 'social:commanding', -0.05],
  ['social:flirty', 'social:flirty', 0.06], ['social:rule-enforcer', 'workstation:corner-cutter', -0.10], ['social:gruff-heart-of-gold', 'social:homesick', 0.06],
];
// --- off-duty activities that exist in this game's rooms; one or two groups each per run
export const ACTIVITIES = {
  rec_bar:         { phrase: 'the lounge bar', name: 'Rec bar regulars', kind: 'rec-regulars', room: 'lounge', spot: 'bar', dur: 1.5, size: [3, 7], ext: 0.6, dept: { engineering: 0.15, services: 0.1 }, tags: { 'social:gregarious': 0.35, 'social:joker': 0.25, 'social:gossip': 0.2 } },
  card_night:      { phrase: 'card night', name: 'Card night', room: 'lounge', spot: 'sofa', dur: 2, size: [3, 6], ext: 0.3, dept: { engineering: 0.1, security: 0.1, services: 0.12 }, tags: { 'social:joker': 0.2, 'social:rival-minded': 0.2, 'social:cliquey': 0.15 } },
  music_circle:    { phrase: 'the music circle', name: 'Music circle', room: 'lounge', spot: 'sofa', dur: 1.5, size: [2, 5], ext: 0.2, dept: { sciences: 0.12, medical: 0.12 }, tags: { 'habit:hums': 0.3, 'habit:whistles': 0.25 } },
  holo_league:     { phrase: 'the holo-sports league', name: 'Holo-sports league', room: 'holodeck', spot: 'holocube', dur: 1.5, size: [4, 8], ext: 0.4, dept: { flight: 0.2, security: 0.2 }, tags: { 'social:rival-minded': 0.3, 'combat:reckless': 0.15 } },
  holo_novel:      { phrase: 'the holo-novel club', name: 'Holo-novel club', room: 'holodeck', spot: 'pad', dur: 2, size: [3, 5], ext: 0.1, dept: { sciences: 0.2, medical: 0.15, operations: 0.1 }, tags: { 'speech:verbose': 0.2, 'social:homesick': 0.15 } },
  lifting:         { phrase: 'the weight room', name: 'Weight-room crowd', room: 'gym', spot: 'weightbench', dur: 1, size: [2, 5], ext: 0.2, dept: { security: 0.35, engineering: 0.1, flight: 0.1 }, tags: { 'social:rival-minded': 0.15 } },
  running:         { phrase: 'the treadmills', name: 'Treadmill club', room: 'gym', spot: 'treadmill', dur: 1, size: [2, 5], ext: 0.1, dept: { flight: 0.15, medical: 0.1, command: 0.1 }, tags: { 'workstation:by-the-book': 0.1 } },
  arboretum_walk:  { phrase: 'the arboretum walks', name: 'Arboretum walkers', room: 'arboretum', spot: 'tree', dur: 1, size: [2, 5], ext: 0, dept: { sciences: 0.3, medical: 0.2, command: 0.1 }, tags: { 'social:homesick': 0.3, 'social:confidant': 0.2 } },
  tinkerers:       { phrase: 'the workshop bench', name: 'Workshop tinkerers', room: 'workshop', spot: 'workbench', dur: 2, size: [2, 5], ext: 0, dept: { engineering: 0.45, operations: 0.2, flight: 0.1 }, tags: { 'workstation:improviser': 0.3, 'habit:talks-to-machines': 0.15 } },
  laundry_natter:  { phrase: 'laundry day', name: 'Laundry-day natter', ranks: [0, 2], room: 'laundry', spot: 'door', dur: 1, size: [2, 4], ext: 0.4, dept: { services: 0.2 }, tags: { 'social:gossip': 0.4 } },
  open_hour:       { phrase: "the counselor's open hour", name: "Counselor's open hour", kind: 'confidant-circle', host: 'counsel', room: 'arboretum', spot: 'tree', dur: 1, size: [3, 6], ext: -0.2, dept: { medical: 0.05 }, tags: { 'social:homesick': 0.5, 'stress:brittle': 0.3, 'stress:withdrawn': 0.3 } },
};
export const GROUP_PRIORITY = { couple: 9, clique: 8, 'confidant-circle': 7, hobby: 7, 'rec-regulars': 6, 'route-crew': 5, 'bridge-circle': 4, 'department-cell': 4, 'officers-table': 3, 'watch-mess': 3, 'mentor-pair': 2, faction: 1 };
export const MESS_TABLE = { size: [4, 8] };              // watch-mess tables for crewmen and ensigns
export const OFFICERS_TABLE = { minRank: 2, size: [3, 8] };
// --- relationship types. strong = counts toward the Dunbar-ish cap (positive strong ties only)
export const REL_TYPES = {
  spouse: { sym: true, strong: true, val: 0.9, pri: 10, label: 'partner' },
  romance: { sym: true, strong: true, val: 0.8, pri: 9, label: 'seeing each other' },
  feud: { sym: true, val: -0.8, pri: 8, label: 'feud' },
  mentor: { inverse: 'protege', strong: true, val: 0.6, pri: 7, label: 'mentor' },
  protege: { inverse: 'mentor', strong: true, val: 0.6, pri: 7, label: 'protégé' },
  'close-friend': { sym: true, strong: true, val: 0.8, pri: 6, label: 'close friend' },
  'old-shipmate': { sym: true, strong: true, val: 0.6, pri: 5.5, label: 'old shipmate' },
  friend: { sym: true, strong: true, val: 0.6, pri: 5, label: 'friend' },
  rival: { sym: true, val: -0.35, pri: 4, label: 'rival' },
  'gossip-link': { sym: true, val: 0.3, pri: 2, label: 'swaps gossip with' },
  colleague: { sym: true, val: 0.25, pri: 1.5, label: 'colleague' },
  acquaintance: { sym: true, val: 0.2, pri: 1, label: 'acquaintance' },
};
export const ATTITUDES = {            // one-way colouring on top of the base relation
  wary: { dv: -0.35, label: 'wary of' }, 'in-awe': { dv: 0.2, label: 'in awe of' }, 'sweet-on': { dv: 0.3, label: 'sweet on' }, resents: { dv: -0.4, label: 'resents' }, 'owes-favour': { dv: 0.05, inverse: 'is-owed', label: 'owes a favour to' }, 'is-owed': { dv: 0.05, inverse: 'owes-favour', label: 'is owed a favour by' },
};
export const LIMITS = {
  strongCap: 8, friendMin: 0.3, closeMin: 0.58, closeMinMedical: 0.48, crossRankMax: 3, crossRankChance: 0.85, offworkMax: 2,
  coupleRate: 0.065, rivalRate: 0.07, maxRivals: 2, mentorGap: 3, crushRate: 0.035, triangles: [0, 2], exes: [1, 2], passedOver: [2, 4], campSize: 5, newcomers: [1, 3], oldShipmates: [1, 3], debtors: [5, 9], beloved: [8, 14], distrust: [6, 10], cliquePer: 10,
};
const STRONG = new Set(Object.keys(REL_TYPES).filter(k => REL_TYPES[k].strong));
const BREAK_RE = /meal|coffee|break|tea|breakfast|wash/;
const NOT_FREE_RE = /sleep|handover|walk_to|pre_watch|pre_duty|prep_for|watch_brief|get_ready|wake/;
export const TRUST_ATT = { wary: -0.05, resents: -0.09, 'sweet-on': 0.06, 'in-awe': 0.04, 'owes-favour': 0.03 };   // trustBias: extra for a one-way attitude towards the player
// reason lines read after "we …" (talk menu: "Okafor? Good sort — we <reason>.")
const MEET_WHY = ['hit it off during a damage-control drill', 'were stuck in a tubelift together for an hour once', 'came aboard on the same transport', 'bonded over bad replicator coffee', 'grew up in the same province', 'sat together at the last promotion party', 'covered for each other once and never mentioned it', 'argue happily about the same awful holo-novel', 'shared a bunk room on their first posting', 'both play the same card game badly'];
const RIVAL_WHY = [   // [line, needs] — needs: 'peer' same department and within one rank step, 'gap' different rank, '' anyone
  ['both want the same promotion', 'peer'], ['keep score on every drill', ''], ['each think the other cuts corners', ''], ['competed for the same posting', 'peer'], ['have a write-up between us that neither will withdraw', 'gap'],
  ['disagree about whose fault the last inspection was', ''], ['have not agreed on a single procedure since the refit', 'peer'], ['both think the other got the easy watch', ''],
];
const FEUD_WHY = ['one blames the other for an accident on the last cruise', 'a reprimand that ended up on the wrong record', 'a bet that was never paid', 'something said at a wake that cannot be unsaid', 'a transfer request one of them quietly blocked', 'a commendation only one of them got for work they both did'];
const EX_WHY = ['split up last year; neither asked for a transfer', 'were together for two cruises and are civil about it now, mostly', 'called it off before the last refit and still share a mess table', 'ended it badly and have to stand the same briefings'];
const CRUSH_WHY = ['keeps finding reasons to pass their station', 'always has a spare seat at the mess table, just in case', 'learned their watch rota by heart', 'laughs a little too quickly at their jokes'];
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const SECRET_WHY = ['keep it quiet — different ranks', 'nobody is supposed to know', 'keep it off the duty roster'];

const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const r3 = (x) => Math.round(x * 1000) / 1000;
const key2 = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
const idOf = (x) => typeof x === 'number' ? x : x?.id;
export const freeBlock = (b) => !!b && b[0] >= 8 - 1e-6 && !NOT_FREE_RE.test(b[4]);
const localOf = (w, abs) => (((abs - WATCH_START[w]) % 24) + 24) % 24;
const blockAt = (day, w, abs) => { const h = localOf(w, abs); return day.find(x => h >= x[0] && h < x[1]) || day[day.length - 1] || null; };
const inWin = (h, m) => ((((h - m.from) % 24) + 24) % 24) < m.to - m.from;
export const hhmm = (h) => { h = ((h % 24) + 24) % 24; const H = Math.floor(h), M = Math.round((h - H) * 60); return `${String(H).padStart(2, '0')}${String(M % 60).padStart(2, '0')}`; };
const sinceText = (d) => d < 14 ? 'a few days' : d < 60 ? 'a few weeks' : d < 330 ? `${Math.round(d / 30)} months` : d < 560 ? 'about a year' : `${Math.max(2, Math.round(d / 365))} years`;

// ============================================================== generator
export function generateSocial(roster, { seed = 1, plan = null, data = null, clock = null, ship = null } = {}) {
  const P = roster.people, n = P.length, R = (...k) => hash01('social', seed, ...k), RI = (...k) => hash('social', seed, ...k);
  const H0 = hash('social-pairs', seed), FR = (salt, i, j = 0) => {   // fast seeded pair hash for the n² loops (same role as hash01)
    let h = Math.imul(H0 ^ salt, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca77) ^ Math.imul(j + 1, 0xc2b2ae3d);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296;
  };
  const hasRoom = (r) => !plan || !!plan[r]?.length, shipName = ship?.name || roster.ship?.name || 'ship';
  const I = P.map(p => {
    const tags = new Set(p.tags || []), w = clock?.watchOf ? clock.watchOf(p) : (p.watch || 'alpha'), day = data?.billets?.[p.billet]?.day || [];
    let ext = 0.5 + (R('ext', p.id) - 0.5) * 0.2; for (const t of tags) ext += EXTROVERSION[t] || 0;
    const duty = new Set(), off = new Set(), free = [];
    for (const b of day) { if (b[0] < 8) { if (!BREAK_RE.test(b[4])) duty.add(b[2]); } else if (freeBlock(b) && b[2] !== 'quarters' && b[2] !== 'washroom') off.add(b[2]); }
    for (let s = 0; s < 48; s++) free.push(freeBlock(blockAt(day, w, s / 2 + 0.25)) ? 1 : 0);
    return { p, id: p.id, tags, w, day, ext: clamp(ext, 0.05, 0.95), duty, off, free, officer: p.rank >= 1, bridge: BRIDGE.has(p.billet), head: HEADS.has(p.billet), loner: false, newcomer: false };
  });
  const has = (i, t) => I[i].tags.has(t);
  const qDeck = (qid) => plan?.quarters?.length ? plan.quarters[hash('quarters', seed, qid) % plan.quarters.length].deckNo : 1, home = P.map(p => qDeck(p.id));
  // loners and newcomers
  for (const x of I) x.loner = (has(x.id, 'social:loner') && R('loner', x.id) < 0.75) || (x.ext < 0.2 && R('loner2', x.id) < 0.5);
  if (!I.some(x => x.loner)) { const c = I.filter(x => !x.head && !BRIDGE.has(x.p.billet)).sort((a, b) => a.ext - b.ext || a.id - b.id)[0]; if (c) c.loner = true; }   // loners exist
  const nNew = LIMITS.newcomers[0] + RI('newc') % (LIMITS.newcomers[1] - LIMITS.newcomers[0] + 1);
  I.filter(x => !x.head && !BRIDGE.has(x.p.billet) && x.p.billet !== 'yeoman').sort((a, b) => R('newcomer', a.id) - R('newcomer', b.id)).slice(0, nNew).forEach(x => { x.newcomer = true; });
  for (const x of I) x.tenure = Math.round(x.newcomer ? 3 + R('ten', x.id) * 40 : 60 + R('ten', x.id) * 900 + x.p.rank * 150);
  // ---- pairwise affinity
  const hintCache = new Map(), hintOf = (a, b) => {
    const k = key2(a.p.billet, b.p.billet); if (hintCache.has(k)) return hintCache.get(k);
    let h = null; for (const [bl, kind] of data?.billets?.[a.p.billet]?.rel || []) if (bl === b.p.billet && PROFILE_REL[kind]) h = kind;
    if (!h) for (const [bl, kind] of data?.billets?.[b.p.billet]?.rel || []) if (bl === a.p.billet && PROFILE_REL[kind]) h = kind;
    hintCache.set(k, h); return h;
  };
  const overlap = (s, t) => { let c = 0; for (const r of s) if (t.has(r)) c++; return c; };
  const A = new Float32Array(n * n), aff = (a, b) => A[a * n + b];
  const bump = (a, b, v) => { A[a * n + b] = clamp(A[a * n + b] + v, 0, 1); A[b * n + a] = A[a * n + b]; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = I[i], b = I[j], pa = a.p, pb = b.p, sameW = a.w === b.w;
    let s = pa.dept === pb.dept ? (DEPT_SAME[pa.dept] ?? 0.3) : (DEPT_PAIR[key2(pa.dept, pb.dept)] ?? DEPT_PAIR_DEFAULT) + (INSULAR[pa.dept] || 0) + (INSULAR[pb.dept] || 0);
    s += BILLET_PAIR[key2(pa.billet, pb.billet)] || 0;
    const hint = hintOf(a, b); if (hint) s += PROFILE_REL[hint].bonus;
    if (a.bridge && b.bridge) s += RANK_MIX.bridge; else if ((a.bridge && b.head) || (b.bridge && a.head)) s += RANK_MIX.bridgeHead;
    s += sameW ? WATCH_MIX.same : WATCH_MIX.other;
    if (sameW) { s += Math.min(PROX.dutyRoomCap, PROX.dutyRoom * overlap(a.duty, b.duty)); s += Math.min(PROX.offRoomCap, PROX.offRoom * overlap(a.off, b.off)); }
    if (home[i] === home[j]) s += PROX.homeDeck;
    if (pa.reportsTo === j || pb.reportsTo === i) s += RANK_MIX.chain;
    if (a.officer !== b.officer) s += pa.dept === pb.dept ? RANK_MIX.crossTierSameDept : RANK_MIX.crossTier; else s += RANK_MIX.sameTier;
    if (pa.rank >= 2 && pb.rank >= 2) s += RANK_MIX.officersMess;
    s -= Math.max(0, Math.abs(pa.rank - pb.rank) - 1) * RANK_MIX.perStep;
    for (const [x, y, v] of TAG_PAIR) if ((a.tags.has(x) && b.tags.has(y)) || (a.tags.has(y) && b.tags.has(x))) s += v;
    s *= 0.75 + 0.25 * (a.ext + b.ext);
    s += (FR(1, i, j) - 0.5) * CHEMISTRY.jitter; if (FR(2, i, j) < CHEMISTRY.sparkRate) s += CHEMISTRY.spark;
    A[i * n + j] = A[j * n + i] = clamp(s, 0, 1);
  }

  // ---- groups
  const groups = [], gOf = P.map(() => []), gSet = new Map();   // per person: their groups; per group: member set
  const booked = P.map(() => new Uint8Array(48));   // half-hour slots already taken by a gathering: later groups meet around them, so one person's circles do not all fall in the same hour
  const meetWindow = (ids, dur, tag) => {
    const slots = Math.max(1, Math.round(dur * 2)); let best = null;
    for (let s0 = 0; s0 < 48; s0++) {
      let c = 0, clear = 0; for (const id of ids) { let ok = true, cl = true; for (let k = 0; k < slots; k++) { const q = (s0 + k) % 48; if (!I[id].free[q]) { ok = false; break; } if (booked[id][q]) cl = false; } if (ok) { c++; if (cl) clear++; } }
      const sc = clear + 0.3 * (c - clear) + R('meet', tag, s0) * 0.5; if (c >= 2 && (!best || sc > best.sc)) best = { sc, c, s0 };
    }
    if (!best) return null;
    const from = best.s0 / 2, wc = {}; for (const id of ids) if (I[id].free[best.s0]) wc[I[id].w] = (wc[I[id].w] || 0) + 1;
    const watch = WATCHES.reduce((a, w) => (wc[w] || 0) > (wc[a] || 0) ? w : a, WATCHES[0]);
    return { from, to: from + slots / 2, watch, local: [localOf(watch, from), localOf(watch, from) + slots / 2], count: best.c };
  };
  const addGroup = (kind, name, members, o = {}) => {
    members = [...new Set(members)].sort((a, b) => a - b); if (members.length < 2) return null;
    const g = { id: 'g' + groups.length, kind, name, members, leader: o.leader ?? members.slice().sort((a, b) => I[b].ext - I[a].ext || a - b)[0], room: o.room || null, spot: o.spot || null, activity: o.activity || kind.replace(/-/g, '_'), site: null, meet: null, cohesion: o.cohesion ?? 0.5 };
    if (g.room && hasRoom(g.room) && o.dur !== 0) g.meet = meetWindow(members, o.dur || 1, g.id);
    if (g.meet) { Object.assign(g.meet, { room: g.room, spot: g.spot, activity: g.activity }); const s0 = Math.round(g.meet.from * 2), k = Math.round((g.meet.to - g.meet.from) * 2); for (const m of members) for (let q = 0; q < k; q++) if (I[m].free[(s0 + q) % 48]) booked[m][(s0 + q) % 48]++; }
    groups.push(g); gSet.set(g, new Set(members)); for (const m of members) gOf[m].push(g); return g;
  };
  const byWatch = (f) => WATCHES.map(w => [w, I.filter(x => x.w === w && f(x)).map(x => x.id)]);
  // bridge circle: one ship-wide circle (they span the watches; their common free time is the officers' table)
  addGroup('bridge-circle', 'Bridge officers', I.filter(x => x.bridge).map(x => x.id), { room: 'mess', spot: 'table', activity: 'bridge_officers_mess', dur: 1, cohesion: 0.8 });
  // department cells, by watch
  for (const d of Object.keys(DEPT_SAME)) for (const [w, ids] of byWatch(x => x.p.dept === d)) {
    const h = DEPT_HANGOUT[d] && hasRoom(DEPT_HANGOUT[d][0]) ? DEPT_HANGOUT[d] : ['mess', 'table', 'department_meal'];
    addGroup('department-cell', `${d.charAt(0).toUpperCase() + d.slice(1)}, ${w} watch`, ids, { room: d === 'command' ? null : h[0], spot: h[1], activity: h[2], dur: 1, cohesion: DEPT_COHESION[d] });
  }
  // tables in the mess: officers' table per watch, crewmen/ensigns split into tables of 4-8 by affinity
  const tables = (ids, size, kind, label, cohesion) => {
    const left = ids.slice(); let k = 1;
    while (left.length >= 2) {
      const want = Math.min(left.length, size[0] + RI('tbl', label, k) % (size[1] - size[0] + 1)); left.sort((a, b) => I[b].ext - I[a].ext || a - b);
      const t = [left.shift()]; while (t.length < want && left.length) { left.sort((a, b) => t.reduce((s, m) => s + aff(m, b), 0) - t.reduce((s, m) => s + aff(m, a), 0) || a - b); t.push(left.shift()); }
      if (left.length === 1) t.push(left.shift());
      addGroup(kind, `${label}${k > 1 || left.length ? ' #' + k : ''}`, t, { room: 'mess', spot: 'table', activity: kind === 'officers-table' ? 'officers_table' : 'crew_mess_table', dur: 1, cohesion }); k++;
    }
  };
  for (const [w, ids] of byWatch(x => x.p.rank >= OFFICERS_TABLE.minRank)) tables(ids, OFFICERS_TABLE.size, 'officers-table', `Officers' table, ${w}`, 0.55);
  for (const [w, ids] of byWatch(x => x.p.rank < OFFICERS_TABLE.minRank)) tables(ids, MESS_TABLE.size, 'watch-mess', `Mess table, ${w}`, 0.4);
  // route crews: cargo / stores / loaders on a watch, plus anyone else whose duty walks the same rooms
  for (const [w, ids] of byWatch(x => ROUTE_BILLETS.has(x.p.billet))) {
    if (ids.length < 2) continue; const rooms = new Set(); for (const id of ids) for (const r of I[id].duty) if (ROUTE_ROOMS.has(r)) rooms.add(r);
    const extra = I.filter(x => x.w === w && !ROUTE_BILLETS.has(x.p.billet) && ['security', 'operations', 'flight', 'services'].includes(x.p.dept) && [...x.duty].some(r => rooms.has(r)) && R('route', x.id) < 0.5).map(x => x.id);
    const h = hasRoom('lounge') && R('rhang', w) < 0.5 ? ['lounge', 'bar'] : ['mess', 'table'];
    addGroup('route-crew', `${w.charAt(0).toUpperCase() + w.slice(1)} ${[...rooms].slice(0, 2).join('-') || 'cargo'} run`, ids.concat(extra), { room: h[0], spot: h[1], activity: 'end_of_shift_with_the_route_crew', dur: 1, cohesion: 0.6 });
  }
  // hobby groups
  const hobbyCount = new Array(n).fill(0);
  for (const [aid, act] of Object.entries(ACTIVITIES)) {
    if (!hasRoom(act.room)) continue; const host = act.host ? I.find(x => x.p.billet === act.host) : null; if (act.host && !host) continue;
    const reps = n > 80 && !act.host && R('rep2', aid) < 0.45 ? 2 : 1;
    for (let r = 0; r < reps; r++) {
      const w = host ? host.w : WATCHES[(RI('hw', aid) + r) % 3];
      const tagv = Object.entries(act.tags), score = I.map(x => x.ext * act.ext + (act.dept[x.p.dept] || 0) + tagv.reduce((s, [t, v]) => s + (x.tags.has(t) ? v : 0), 0) + R('hob', aid, r, x.id) * 0.5 - hobbyCount[x.id] * 0.25 - (x.loner ? 0.2 : 0) + (x.w === w) * 0.4);
      const pool = I.filter(x => hobbyCount[x.id] < 2 && (!act.ranks || (x.p.rank >= act.ranks[0] && x.p.rank <= act.ranks[1]))).sort((a, b) => score[b.id] - score[a.id] || a.id - b.id);
      const core = pool.filter(x => x.w === w).slice(0, 12).map(x => x.id); if (host && !core.includes(host.id)) core.unshift(host.id);
      const m = meetWindow(core, act.dur, aid + r); if (!m) continue;
      const slots = Math.round(act.dur * 2), s0 = Math.round(m.from * 2), okAt = (x) => { for (let k = 0; k < slots; k++) if (!x.free[(s0 + k) % 48]) return false; return true; };
      const size = act.size[0] + RI('hsize', aid, r) % (act.size[1] - act.size[0] + 1);
      const mem = pool.filter(okAt).slice(0, size).map(x => x.id); if (host && !mem.includes(host.id)) { mem.pop(); mem.unshift(host.id); }
      if (mem.length < 2) continue;
      for (const id of mem) hobbyCount[id]++;
      addGroup(act.kind || 'hobby', act.name + (reps > 1 ? ` (${w})` : ''), mem, { room: act.room, spot: act.spot, activity: aid, dur: act.dur, cohesion: 0.5 + 0.1 * (act.ext > 0.3), leader: host?.id });
    }
  }
  // sharing a group breeds familiarity
  const gb = new Float32Array(n * n);
  for (const g of groups) for (let i = 0; i < g.members.length; i++) for (let j = i + 1; j < g.members.length; j++) {
    const a = g.members[i], b = g.members[j], add = Math.min(PROX.group * g.cohesion, PROX.groupCap - gb[a * n + b]); if (add > 0) { gb[a * n + b] += add; bump(a, b, add); }
  }

  // ---- relationships
  const out = P.map(() => new Map()), cnt = new Array(n).fill(0), xc = new Array(n).fill(0), oc = new Array(n).fill(0), CAP = LIMITS.strongCap;   // strong ties; of them cross-rank, outside the department
  const get = (a, b) => out[a].get(b) || null;
  const pos = (r) => r && STRONG.has(r.type);
  const why = (a, b) => {
    const gs = gOf[a].filter(g => gSet.get(g).has(b)).sort((x, y) => (GROUP_PRIORITY[y.kind] || 0) - (GROUP_PRIORITY[x.kind] || 0));
    const g = gs[0], h = hintOf(I[a], I[b]);
    if (g && (g.kind === 'hobby' || g.kind === 'rec-regulars' || g.kind === 'confidant-circle')) return `are regulars at ${ACTIVITIES[g.activity]?.phrase || g.name.toLowerCase()}`;
    if (g && g.kind === 'route-crew') return `work the ${g.name.toLowerCase().replace(/^\w+ /, '')} together on ${I[a].w} watch`;
    if (h && R('hintwhy', a, b) < 0.6) return PROFILE_REL[h].friendWhy || PROFILE_REL[h].why;
    if (I[a].p.dept === I[b].p.dept && I[a].w === I[b].w) return I[a].p.dept === 'medical' ? 'confide in each other after hard shifts' : `stand the same ${I[a].p.dept} watch (${I[a].w})`;
    if (I[a].w === I[b].w && overlap(I[a].off, I[b].off) && R('offwhy', a, b) < 0.7) return `keep running into each other in the ${[...I[a].off].find(r => I[b].off.has(r))} after ${I[a].w} watch`;
    if (qDeck(a) === qDeck(b) && R('nbr', a, b) < 0.5) return `are neighbours on deck ${qDeck(a)}`;
    return MEET_WHY[RI('meet', a, b) % MEET_WHY.length];
  };
  const setRel = (a, b, type, o = {}) => {
    if (a === b) return false; const T = REL_TYPES[type], cur = get(a, b);
    if (cur && REL_TYPES[cur.type].pri >= T.pri) return false;
    if (T.strong && !pos(cur) && (cnt[a] >= CAP || cnt[b] >= CAP)) return false;
    const strength = r3(clamp(o.strength ?? (0.3 + 0.6 * aff(a, b)), 0.05, 1)), valence = r3(clamp(o.valence ?? (T.val + (R('val', a, b, type) - 0.5) * 0.15)));
    const since = o.since ?? Math.max(1, Math.round(Math.min(I[a].tenure, I[b].tenure) * (0.3 + 0.7 * R('since', a, b)))), reason = o.reason || why(a, b), visible = o.visible ?? true;
    const tally = (x, y, d) => { cnt[x] += d; if (crossRank(x, y)) xc[x] += d; if (P[x].dept !== P[y].dept) oc[x] += d; };
    const mk = (x, y, t) => { const old = out[x].get(y); if (pos(old)) tally(x, y, -1); out[x].set(y, { a: x, b: y, type: t, attitude: old?.attitude || null, strength, valence, since, reason, visible, shared: [] }); if (STRONG.has(t)) tally(x, y, 1); };
    mk(a, b, type); mk(b, a, T.inverse || type); return true;
  };
  const setAtt = (a, b, att, reason) => {
    if (a === b) return false; if (!get(a, b)) setRel(a, b, 'acquaintance', { strength: 0.25 });
    const r = get(a, b); if (!r || r.attitude) return false; r.attitude = att; r.valence = r3(clamp(r.valence + ATTITUDES[att].dv)); if (reason) r.areason = reason;
    const inv = ATTITUDES[att].inverse; if (inv) { const q = get(b, a); if (q && !q.attitude) { q.attitude = inv; q.valence = r3(clamp(q.valence + ATTITUDES[inv].dv)); } }
    return true;
  };
  const hooks = [], fam = (i) => P[i].family, hook = (kind, people, text, secret = false) => hooks.push({ kind, people, text, secret });   // story hooks the game can surface (graph.hooks)
  const chain = (a, b) => P[a].reportsTo === b || P[b].reportsTo === a;
  const above = (a, b) => { for (let x = P[a].reportsTo, k = 0; x != null && k < 8; x = P[x]?.reportsTo, k++) if (x === b) return true; return false; };   // b is somewhere up a's reporting line
  const inLine = (a, b) => above(a, b) || above(b, a);
  const crossRank = (a, b) => I[a].officer !== I[b].officer || Math.abs(P[a].rank - P[b].rank) >= 2;
  const crossCount = (a) => xc[a], outside = (a) => oc[a];
  const T = I.map(x => x.loner ? (R('lt', x.id) < 0.5 ? 0 : 1) : clamp(Math.round(1 + x.ext * 5 + (R('ft', x.id) - 0.5) * 1.5) - (x.newcomer ? 2 : 0), 1, 7));
  const allPairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) allPairs.push([aff(i, j), i, j]);
  allPairs.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);
  const nb = P.map(() => []); for (const [, i, j] of allPairs) { nb[i].push(j); nb[j].push(i); }   // everyone else, best affinity first
  const partner = new Array(n).fill(-1);
  // couples
  {
    const want = Math.max(1, Math.round(n * LIMITS.coupleRate + (R('ncouple') - 0.5) * 2)), cand = [];
    for (const [s, a, b] of allPairs) {
      if (I[a].loner || I[b].loner || inLine(a, b) || P[a].billet === 'co' || P[b].billet === 'co' || Math.abs(P[a].rank - P[b].rank) > 3) continue;
      const sc = s + (I[a].w === I[b].w ? 0.25 : 0) + 0.12 * (has(a, 'social:flirty') + has(b, 'social:flirty')) + (FR(3, a, b) - 0.5) * 0.5; if (sc > 0.45) cand.push([sc, a, b]);
    }
    cand.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);
    for (const [, a, b] of cand) {
      if (groups.filter(g => g.kind === 'couple').length >= want) break; if (partner[a] >= 0 || partner[b] >= 0) continue;
      const sameW = I[a].w === I[b].w, wed = sameW && R('wed', a, b) < 0.6, cross = I[a].officer !== I[b].officer || (P[a].dept === P[b].dept && Math.abs(P[a].rank - P[b].rank) >= 2);
      const visible = wed || (!cross && R('open', a, b) < 0.5);
      const ok = setRel(a, b, wed ? 'spouse' : 'romance', { strength: 0.85 + 0.15 * R('ls', a, b), visible, reason: wed ? `partners; share quarters${sameW ? ` and the ${I[a].w} watch` : ''}` : visible ? `seeing each other — ${why(a, b)}` : `seeing each other in secret (${SECRET_WHY[RI('sec', a, b) % SECRET_WHY.length]})`, since: wed ? Math.round(Math.max(I[a].tenure, I[b].tenure) + 200 + R('wy', a, b) * 2000) : undefined });
      if (!ok) continue; partner[a] = b; partner[b] = a;
      const room = ['lounge', 'arboretum', 'holodeck'].filter(hasRoom)[RI('date', a, b) % Math.max(1, ['lounge', 'arboretum', 'holodeck'].filter(hasRoom).length)];
      addGroup('couple', `${P[a].family} & ${P[b].family}`, [a, b], { room, spot: { lounge: 'sofa', arboretum: 'tree', holodeck: 'pad' }[room], activity: 'time_together', dur: 1.5, cohesion: 0.95 });
    }
  }
  // mentors (b mentors a: relation(a, b).type === 'mentor')
  const hasMentor = new Array(n).fill(false);
  for (const s of I) {
    const keen = has(s.id, 'social:mentor') || has(s.id, 'workstation:mentors-juniors'); if (s.p.rank < 2 && !(s.p.rank === 1 && keen)) continue; let k = has(s.id, 'social:mentor') || has(s.id, 'workstation:mentors-juniors') ? 1 + (R('mw2', s.id) < 0.3) : R('mw', s.id) < 0.2 ? 1 : 0;
    const cand = I.filter(x => x.p.dept === s.p.dept && x.p.rank < s.p.rank && s.p.rank - x.p.rank <= LIMITS.mentorGap && !hasMentor[x.id] && x.id !== partner[s.id])
      .map(x => [aff(s.id, x.id) + (x.w === s.w ? 0.15 : 0) + (P[x.id].reportsTo === s.id || P[P[x.id].reportsTo]?.reportsTo === s.id ? 0.2 : 0) + (hintOf(s, x) === 'mentor' ? 0.25 : 0) + R('mc', s.id, x.id) * 0.2, x.id]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    if (!k && cand[0] && hintOf(s, I[cand[0][1]]) === 'mentor' && R('mh', s.id) < 0.5) k = 1;
    for (const [, j] of cand) { if (k <= 0) break; if (setRel(j, s.id, 'mentor', { reason: P[j].reportsTo === s.id ? 'took them under their wing on joining the department' : 'teaches them the tricks of the trade', strength: 0.55 + 0.3 * R('ms', j) })) { hasMentor[j] = true; k--; } }
  }
  // friendships: strongest affinity first, within each person's appetite (T) and the caps
  const offOk = (a, b) => P[a].dept === P[b].dept || ((!OFFWORK_BILLETS.has(P[a].billet) || outside(a) < LIMITS.offworkMax) && (!OFFWORK_BILLETS.has(P[b].billet) || outside(b) < LIMITS.offworkMax));
  const crossOk = (a, b) => !crossRank(a, b) || (crossCount(a) < LIMITS.crossRankMax && crossCount(b) < LIMITS.crossRankMax);
  for (const pass of [0, 1]) for (const [s, a, b] of allPairs) {
    if (s < LIMITS.friendMin) break; if (get(a, b) || !crossOk(a, b) || !offOk(a, b)) continue;
    const ok = pass === 0 ? cnt[a] < T[a] && cnt[b] < T[b] : !I[a].loner && !I[b].loner && (cnt[a] < T[a] || cnt[b] < T[b]) && cnt[a] <= T[a] && cnt[b] <= T[b];
    if (ok) setRel(a, b, 'friend');
  }
  // the closest of them
  const close = new Array(n).fill(0);
  for (let a = 0; a < n; a++) {
    const best = [...out[a].values()].filter(r => r.type === 'friend').sort((x, y) => aff(a, y.b) - aff(a, x.b) || x.b - y.b)[0]; if (!best) continue;
    const min = P[a].dept === 'medical' && P[best.b].dept === 'medical' ? LIMITS.closeMinMedical : LIMITS.closeMin;
    if (aff(a, best.b) >= min && close[a] < 2 && close[best.b] < 2 && setRel(a, best.b, 'close-friend', { strength: 0.75 + 0.25 * R('cs', a, best.b), reason: best.reason })) { close[a]++; close[best.b]++; }
  }
  // each person keeps 1-3 cross-rank friends; cargo / stores / loader staff get 0-2 off-work friends outside their department
  for (let a = 0; a < n; a++) {
    if (I[a].loner || crossCount(a) || R('xr', a) > LIMITS.crossRankChance || cnt[a] >= CAP) continue;
    const c = nb[a].find(b => aff(a, b) >= 0.12 && crossRank(a, b) && !get(a, b) && !I[b].loner && cnt[b] < CAP && crossCount(b) < LIMITS.crossRankMax && offOk(a, b));
    if (c !== undefined) setRel(a, c, 'friend');
  }
  for (let a = 0; a < n; a++) {
    if (!OFFWORK_BILLETS.has(P[a].billet)) continue; const r = R('offt', a), want = I[a].loner ? 0 : r < 0.15 ? 0 : r < 0.65 ? 1 : 2;
    const cand = I.filter(x => x.p.dept !== P[a].dept && !get(a, x.id) && !x.loner && cnt[x.id] < CAP && x.id !== a)
      .map(x => [aff(a, x.id) + (x.w === I[a].w ? 0.2 : 0) + overlap(I[a].off, x.off) * 0.08, x.id]).sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    for (const [s, b] of cand) { if (outside(a) >= want || cnt[a] >= CAP) break; if (s >= 0.1 && (!OFFWORK_BILLETS.has(P[b].billet) || outside(b) < LIMITS.offworkMax)) setRel(a, b, 'friend', { reason: I[a].w === I[b].w && overlap(I[a].off, I[b].off) ? `meet in the ${[...I[a].off].find(x => I[b].off.has(x))} off watch` : why(a, b) }); }
  }
  // old shipmates: served together before this posting
  {
    const k = LIMITS.oldShipmates[0] + RI('old') % (LIMITS.oldShipmates[1] - LIMITS.oldShipmates[0] + 1), others = SHIPS.filter(s => s.name !== shipName);
    let made = 0; for (let t = 0; t < 400 && made < k; t++) { const a = RI('olda', t) % n, b = RI('oldb', t) % n; if (a === b || P[a].dept === P[b].dept || get(a, b) || I[a].tenure <= 300 || I[b].tenure <= 300) continue; const sh = others[RI('olds', a, b) % others.length]?.name || 'old Cartier';
      if (setRel(a, b, 'old-shipmate', { strength: 0.55 + 0.3 * R('os', a, b), since: Math.max(I[a].tenure, I[b].tenure) + Math.round(365 * (1 + R('oy', a, b) * 6)), reason: `served together aboard the ${sh} before either came to the ${shipName}` })) made++; }
  }
  // rivals and the odd feud
  const feuds = [];
  {
    const want = Math.max(1, Math.round(n * LIMITS.rivalRate)), rc = new Array(n).fill(0), cand = [];
    const rivalWhy = (a, b) => { const peer = P[a].dept === P[b].dept && Math.abs(P[a].rank - P[b].rank) <= 1, gap = P[a].rank !== P[b].rank, l = RIVAL_WHY.filter(([, need]) => !need || (need === 'peer' ? peer : gap)); return l[RI('rw', a, b) % l.length][0]; };
    for (const [, a, b] of allPairs) {
      if (pos(get(a, b)) || partner[a] === b) continue;
      const h = hintOf(I[a], I[b]), sc = (P[a].dept === P[b].dept ? 0.3 : 0) + (Math.abs(P[a].rank - P[b].rank) <= 1 ? 0.15 : 0) + (P[a].billet === P[b].billet ? 0.25 : 0) + 0.25 * (has(a, 'social:rival-minded') + has(b, 'social:rival-minded')) + (h === 'rival' ? 0.35 : 0) + (FR(4, a, b) - 0.5) * 0.4;
      if (sc > 0.45) cand.push([sc, a, b, h]);
    }
    cand.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]); const rivals = [];
    for (const [, a, b, h] of cand) { if (rivals.length >= want) break; if (rc[a] >= LIMITS.maxRivals || rc[b] >= LIMITS.maxRivals) continue;
      if (setRel(a, b, 'rival', { strength: 0.4 + 0.4 * R('rs', a, b), reason: h === 'rival' && R('rh', a, b) < 0.5 ? PROFILE_REL.rival.why : rivalWhy(a, b) })) { rc[a]++; rc[b]++; rivals.push([a, b]); } }
    const nf = R('nfeud') < 0.3 ? 2 : 1; rivals.sort((x, y) => R('feud', x[0], x[1]) - R('feud', y[0], y[1]));
    for (const [a, b] of rivals.slice(0, nf)) if (setRel(a, b, 'feud', { strength: 0.75 + 0.2 * R('fs', a, b), reason: FEUD_WHY[RI('fw', a, b) % FEUD_WHY.length] })) feuds.push([a, b]);
  }
  // ---- drama on top of the plain ties: exes, one-sided interest and triangles, passed-over promotions, camps around a feud, mentor lines
  {
    const pick = (lim, ...k) => lim[0] + RI(...k) % (lim[1] - lim[0] + 1), weak = (a, b) => { const r = get(a, b); return !r || (!pos(r) && REL_TYPES[r.type].val > 0 && !r.attitude); };
    // exes: were a couple, still aboard the same ship
    let made = 0; const nEx = pick(LIMITS.exes, 'nex'), isEx = new Array(n).fill(false);
    for (const [sc, a, b] of allPairs) {
      if (made >= nEx || sc < 0.3) break; if (FR(5, a, b) > 0.04 || isEx[a] || isEx[b] || I[a].loner || I[b].loner || I[a].newcomer || I[b].newcomer || inLine(a, b) || P[a].billet === 'co' || P[b].billet === 'co' || Math.abs(P[a].rank - P[b].rank) > 2 || partner[a] === b || !weak(a, b)) continue;
      const sour = R('exsour', a, b) < 0.5, reason = EX_WHY[sour ? (RI('exw', a, b) % 2 ? 3 : 0) : 1 + RI('exw', a, b) % 2], since = Math.round(Math.min(I[a].tenure, I[b].tenure) * (0.6 + 0.4 * R('exs', a, b)));
      if (!(sour ? setRel(a, b, 'rival', { strength: 0.5 + 0.3 * R('exr', a, b), valence: -0.3, reason, since }) : setRel(a, b, 'friend', { strength: 0.45, valence: 0.35, reason, since }))) continue;
      for (const [x, y] of [[a, b], [b, a]]) get(x, y).history = 'ex'; isEx[a] = isEx[b] = true; made++;
      hook('exes', [a, b], `${fam(a)} and ${fam(b)} ${reason}.${partner[a] >= 0 || partner[b] >= 0 ? ` ${fam(partner[a] >= 0 ? partner[a] : partner[b])} would rather the subject did not come up.` : ''}`);
    }
    // one-sided interest; a few of them aimed at somebody who is already spoken for
    const nCrush = Math.max(1, Math.round(n * LIMITS.crushRate)), nTri = Math.min(nCrush, pick(LIMITS.triangles, 'ntri') + (R('tri2') < 0.5 ? 1 : 0)), targeted = new Array(n).fill(false);
    const admirers = I.filter(x => !x.loner && partner[x.id] < 0 && x.p.billet !== 'co').sort((x, y) => R('crush', x.id) - 0.3 * x.tags.has('social:flirty') - (R('crush', y.id) - 0.3 * y.tags.has('social:flirty')) || x.id - y.id).slice(0, nCrush * 3);
    let crushes = 0, tris = 0;
    for (const x of admirers) {
      if (crushes >= nCrush) break; const a = x.id, wantTri = tris < nTri;
      const b = nb[a].find(b => aff(a, b) >= 0.25 && I[b].w === I[a].w && !targeted[b] && (partner[b] >= 0) === wantTri && P[b].billet !== 'co' && !inLine(a, b) && Math.abs(P[a].rank - P[b].rank) <= 2 && !isEx[b] && !get(a, b)?.attitude && (get(a, b)?.valence ?? 0) >= 0 && FR(6, a, b) < 0.5);
      if (b === undefined || !setAtt(a, b, 'sweet-on', CRUSH_WHY[RI('cw', a, b) % CRUSH_WHY.length])) continue;
      targeted[b] = true; crushes++; const c = partner[b];
      if (c < 0) { hook('crush', [a, b], `${fam(a)} is sweet on ${fam(b)} and thinks nobody can tell.`); continue; }
      tris++; const rel = get(b, c), seen = !pos(get(c, a)) && R('seen', a, c) < 0.7 && setAtt(c, a, 'wary', `has seen how ${fam(a)} looks at ${fam(b)}`);
      hook('triangle', [a, b, c], !rel.visible ? `${fam(a)} is sweet on ${fam(b)}, and has no idea ${fam(b)} is already spoken for.` : `${fam(a)} is sweet on ${fam(b)}. ${fam(b)} ${rel.type === 'spouse' ? 'shares quarters with' : 'is seeing'} ${fam(c)}, ${seen ? 'who has noticed' : 'who has not noticed yet'}.`);
    }
    // passed over: longer aboard, one stripe short
    const po = []; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (P[a].dept === P[b].dept && P[b].rank === P[a].rank + 1 && P[a].rank >= 1 && I[a].tenure > I[b].tenure && !I[a].newcomer && !pos(get(a, b)) && partner[a] !== b && !get(a, b)?.attitude) po.push([R('po', a, b), a, b]);
    po.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]); const nPo = pick(LIMITS.passedOver, 'npo'), poA = new Set(), poB = new Set(); made = 0;
    for (const [, a, b] of po) { if (made >= nPo) break; if (poA.has(a) || poB.has(b)) continue; if (!setAtt(a, b, 'resents', `was up for the stripe ${fam(b)} got`)) continue; poA.add(a); poB.add(b); made++; hook('passed-over', [a, b], `${fam(a)} was up for the stripe ${fam(b)} got, and has not forgotten.`); }
    // camps: the people around each side of a feud take that side
    for (const [a, b] of feuds) {
      const side = (x, y) => [...out[x].values()].filter(r => pos(r) && r.b !== y && !pos(get(r.b, y)) && !I[r.b].loner).sort((p, q) => q.strength - p.strength || p.b - q.b).slice(0, LIMITS.campSize - 1).map(r => r.b);
      const sa = side(a, b), sb = side(b, a).filter(m => !sa.includes(m)); if (!sa.length || !sb.length) continue;
      for (const [lead, foe, mem] of [[a, b, sa], [b, a, sb]]) {
        addGroup('faction', `${fam(lead)}'s side`, [lead, ...mem], { leader: lead, cohesion: 0.5, activity: 'taking_sides' });
        for (const m of mem) if (R('side', m, foe) < 0.6 && (get(m, foe)?.valence ?? 0) < 0.5) setAtt(m, foe, 'wary', `took ${fam(lead)}'s side against ${fam(foe)}`);
      }
      hook('camps', [a, b, ...sa, ...sb], `${fam(a)} and ${fam(b)} are not speaking, and ${P[a].dept === P[b].dept ? `half of ${P[a].dept}` : 'half the mess'} has picked a side.`);
    }
    for (const [a, b] of feuds) hook('feud', [a, b], `${fam(a)} and ${fam(b)} do not share a table. ${cap1(get(a, b).reason)}.`);
    // mentor lines: who taught whom, three deep
    made = 0; const tops = new Set(); for (let a = 0; a < n && made < 2; a++) { const m1 = [...out[a].values()].find(r => r.type === 'mentor'), m2 = m1 && [...out[m1.b].values()].find(r => r.type === 'mentor'); if (m2 && !tops.has(m1.b)) { tops.add(m1.b); made++; hook('lineage', [m2.b, m1.b, a], `${fam(m2.b)} trained ${fam(m1.b)}, and ${fam(m1.b)} is training ${fam(a)}. You can hear it in how all three call a fault.`); } }
  }
  // chain-of-command friction and hero worship
  for (let a = 0; a < n; a++) {
    const boss = P[a].reportsTo; if (boss != null && (has(boss, 'social:rule-enforcer') || has(boss, 'social:commanding')) && (has(a, 'social:joker') || has(a, 'workstation:corner-cutter') || has(a, 'social:rival-minded')) && R('wary', a) < 0.7) setAtt(a, boss, 'wary', 'a by-the-book boss who is always watching');
    if (P[a].rank === 0 && R('awe', a) < 0.15) { const hero = I.filter(x => x.id !== a && (x.p.billet === 'co' || (x.p.dept === P[a].dept && x.p.rank >= 3 && (x.tags.has('social:commanding') || x.tags.has('social:mentor'))))).sort((x, y) => R('hero', a, x.id) - R('hero', a, y.id))[0]; if (hero) setAtt(a, hero.id, 'in-awe', 'looks up to them'); }
  }
  // gossip hubs, the favour book, the one everyone likes, the one nobody trusts
  const gossips = I.filter(x => x.tags.has('social:gossip')).map(x => x.id);
  for (let i = 0; i < gossips.length; i++) for (let j = i + 1; j < gossips.length; j++) if (R('gl', gossips[i], gossips[j]) < 0.7) setRel(gossips[i], gossips[j], 'gossip-link', { strength: 0.35 + 0.3 * R('gs', gossips[i], gossips[j]), reason: 'swap every rumour on the ship' });
  for (const g of gossips) I.filter(x => x.p.dept !== P[g].dept && !get(g, x.id) && x.id !== g).sort((x, y) => aff(g, y.id) - aff(g, x.id) || x.id - y.id).slice(0, 3 + RI('gn', g) % 4).forEach(x => setRel(g, x.id, 'acquaintance', { strength: 0.25, reason: 'always has news for them' }));
  const pickTop = (list, score) => list.map(x => [score(x), x.id]).sort((a, b) => b[0] - a[0] || a[1] - b[1])[0]?.[1] ?? -1;
  const tsc = (x, tbl) => Object.entries(tbl).reduce((s, [t, v]) => s + (x.tags.has(t) ? v : 0), 0);
  const fixer = pickTop(I.filter(x => FIXER_BILLETS.has(x.p.billet)), x => tsc(x, { 'social:gossip': 0.3, 'social:joker': 0.2, 'social:cliquey': 0.2, 'workstation:corner-cutter': 0.3, 'workstation:improviser': 0.2, 'social:rule-enforcer': -0.5 }) + R('fix', x.id) * 0.4);
  if (fixer >= 0) {
    const k = LIMITS.debtors[0] + RI('debt') % (LIMITS.debtors[1] - LIMITS.debtors[0] + 1), debtors = I.filter(x => x.id !== fixer && x.id !== partner[fixer]).sort((x, y) => aff(fixer, y.id) + R('dbt', y.id) * 0.5 - aff(fixer, x.id) - R('dbt', x.id) * 0.5 || x.id - y.id).slice(0, k).map(x => x.id);
    for (const d of debtors) setAtt(d, fixer, 'owes-favour', 'got something off the books');
    addGroup('faction', `${P[fixer].family}'s favour book`, [fixer, ...debtors], { leader: fixer, cohesion: 0.3, activity: 'favour_trading' });
  }
  const beloved = pickTop(I.filter(x => x.id !== fixer), x => x.ext + tsc(x, { 'social:peacemaker': 0.3, 'social:joker': 0.2, 'social:confidant': 0.2, 'social:gruff-heart-of-gold': 0.2, 'social:rule-enforcer': -0.2, 'social:rival-minded': -0.2 }) + (['cook', 'galley'].includes(x.p.billet) ? 0.15 : 0) + R('bel', x.id) * 0.3);
  if (beloved >= 0) {
    const k = LIMITS.beloved[0] + RI('belk') % (LIMITS.beloved[1] - LIMITS.beloved[0] + 1);
    for (const r of out[beloved].values()) { r.valence = r3(clamp(r.valence + 0.1)); const q = get(r.b, beloved); if (q) q.valence = r3(clamp(q.valence + 0.1)); }
    I.filter(x => x.id !== beloved && !get(beloved, x.id)).sort((x, y) => R('belp', x.id) - R('belp', y.id)).slice(0, k).forEach(x => setRel(beloved, x.id, 'acquaintance', { strength: 0.3, valence: 0.5, reason: `everyone likes ${P[beloved].family}` }));
  }
  const distrusted = pickTop(I.filter(x => x.id !== beloved && x.id !== fixer && x.p.billet !== 'co'), x => tsc(x, { 'workstation:corner-cutter': 0.3, 'social:gossip': 0.2, 'social:rival-minded': 0.25, 'stress:snappy': 0.15, 'stress:short-tempered': 0.15, 'speech:sarcastic': 0.1 }) - x.ext * 0.1 + R('dis', x.id) * 0.4);
  if (distrusted >= 0) {
    const k = LIMITS.distrust[0] + RI('disk') % (LIMITS.distrust[1] - LIMITS.distrust[0] + 1);
    I.filter(x => x.id !== distrusted && partner[x.id] !== distrusted && !pos(get(x.id, distrusted))).sort((x, y) => R('disp', x.id) - R('disp', y.id)).slice(0, k).forEach(x => setAtt(x.id, distrusted, 'wary', `nobody quite trusts ${P[distrusted].family}`));
  }
  for (const g of groups) if (g.kind === 'couple') { const [a, b] = g.members, r = get(a, b); if (r && !r.visible) hook('secret', [a, b], `${fam(a)} and ${fam(b)} keep turning up in the ${g.room || 'mess'} at the same hour. Draw your own conclusions.`, true); }
  if (fixer >= 0) hook('favour', [fixer], `Need something that is not on the manifest? ${fam(fixer)} keeps a book. It will cost you a favour.`);
  if (beloved >= 0) hook('beloved', [beloved], `Nobody aboard has a bad word for ${fam(beloved)}.`);
  if (distrusted >= 0) hook('distrusted', [distrusted], `Count your tools after ${fam(distrusted)} has been by. That is all I will say.`);
  for (const x of I) if (x.newcomer) hook('newcomer', [x.id], `${fam(x.id)} came aboard ${sinceText(x.tenure)} ago and has not found a table yet.`);
  for (let a = 0; a < n; a++) for (const r of out[a].values()) if (r.type === 'old-shipmate' && a < r.b) hook('old-shipmates', [a, r.b], `${fam(a)} and ${fam(r.b)} ${r.reason}. Ask either of them about it and lose an hour.`);
  // weak ties: colleagues around the bridge, acquaintances by affinity
  const bridgeIds = I.filter(x => x.bridge).map(x => x.id), headIds = I.filter(x => x.head).map(x => x.id);
  for (const a of bridgeIds) { for (const b of bridgeIds) if (a < b) setRel(a, b, 'colleague', { strength: 0.35 + 0.3 * aff(a, b), reason: 'stand bridge watches together' }); for (const b of headIds) if (a !== b) setRel(a, b, 'colleague', { strength: 0.3 + 0.2 * aff(a, b), reason: 'department head at the bridge briefings' }); }
  for (let a = 0; a < n; a++) {
    const k = I[a].loner ? 1 : 2 + Math.round(I[a].ext * 4); let have = 0;
    for (const b of nb[a]) { const s = aff(a, b); if (have >= k || s < 0.2) break; if (get(a, b)) continue; if (setRel(a, b, 'acquaintance', { strength: 0.15 + 0.25 * s })) have++; }
  }
  // nobody is orphaned by accident: every non-loner ends with at least one strong positive tie
  for (let a = 0; a < n; a++) {
    if (I[a].loner || cnt[a] > 0) continue;
    const c = nb[a].find(b => cnt[b] < CAP && !I[b].loner && (!get(a, b) || REL_TYPES[get(a, b).type].val > 0) && get(a, b)?.attitude !== 'wary');
    if (c !== undefined) setRel(a, c, 'friend');
  }

  // ---- cliques: tight friendship knots (everyone strongly tied to everyone)
  {
    const inClique = new Array(n).fill(false), maxC = Math.ceil(n / LIMITS.cliquePer), offRoom = ['lounge', 'holodeck', 'gym', 'arboretum', 'workshop', 'mess'].filter(hasRoom);
    for (const x of I.slice().sort((a, b) => b.ext - a.ext || a.id - b.id)) {
      if (groups.filter(g => g.kind === 'clique').length >= maxC) break; if (inClique[x.id]) continue;
      const c = [x.id]; for (const r of [...out[x.id].values()].filter(r => pos(r) && !inClique[r.b]).sort((p, q) => q.strength - p.strength || p.b - q.b)) if (c.every(m => pos(get(m, r.b)))) c.push(r.b);
      if (c.length < 3) continue; for (const m of c) inClique[m] = true;
      const votes = {}; for (const m of c) for (const r of I[m].off) if (offRoom.includes(r)) votes[r] = (votes[r] || 0) + 1;
      const vs = (r) => votes[r] + R('croom', x.id, r) * 2.5, room = Object.keys(votes).sort((a, b) => vs(b) - vs(a) || (a < b ? -1 : 1))[0] || offRoom[0];
      addGroup('clique', R('cname', x.id) < 0.5 ? `${P[x.id].family}'s crowd` : `The ${room} crowd`, c, { leader: x.id, room, spot: { lounge: 'bar', holodeck: 'pad', gym: 'mat', arboretum: 'tree', workshop: 'workbench', mess: 'table' }[room], activity: 'hanging_out_with_friends', dur: 1.5, cohesion: 0.8 });
    }
  }
  for (let j = 0; j < n; j++) for (const r of out[j].values()) if (r.type === 'mentor' && r.b > -1 && !groups.some(g => g.kind === 'mentor-pair' && g.members.includes(j) && g.members.includes(r.b))) addGroup('mentor-pair', `${P[r.b].family} → ${P[j].family}`, [r.b, j], { leader: r.b, room: hasRoom('workshop') && P[j].dept === 'engineering' ? 'workshop' : 'mess', spot: P[j].dept === 'engineering' && hasRoom('workshop') ? 'workbench' : 'table', activity: 'mentoring_session', dur: 1, cohesion: 0.7 });
  const enforcers = I.filter(x => x.tags.has('social:rule-enforcer')).map(x => x.id); if (enforcers.length >= 3) addGroup('faction', 'The regulation crowd', enforcers, { cohesion: 0.35, activity: 'citing_regulations' });

  // ---- finish: shared activities, group cohesion and sites, quarters / anchors / companions, profiles
  for (const g of groups) {
    for (let i = 0; i < g.members.length; i++) for (let j = 0; j < g.members.length; j++) { if (i === j) continue; const r = get(g.members[i], g.members[j]); if (r && r.shared.length < 4 && !r.shared.includes(g.activity)) r.shared.push(g.activity); }
    let s = 0, c = 0; for (const a of g.members) for (const b of g.members) if (a < b) { const r = get(a, b); s += r ? Math.max(0, r.valence) * r.strength : 0; c++; }
    g.cohesion = r3(0.5 * g.cohesion + 0.5 * (c ? s / c : 0));
  }
  const quarters = P.map((p, i) => partner[i] >= 0 && get(i, partner[i])?.type === 'spouse' ? Math.min(i, partner[i]) : i);
  for (const g of groups) if (g.room && plan?.[g.room]?.length) {
    const home = qDeck(quarters[g.leader]); let best = null, bd = 1e9;
    for (const s of plan[g.room]) { const d = Math.abs(s.deckNo - home) + hash01('gsite', seed, g.id, s.deckNo, s.tx, s.ty) * 0.9; if (d < bd) { bd = d; best = s; } }
    g.site = best ? { deckNo: best.deckNo, tx: best.tx, ty: best.ty } : null; if (g.meet) g.meet.site = g.site;
  }
  const par = P.map((_, i) => i), find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  for (let a = 0; a < n; a++) for (const r of out[a].values()) if (pos(r) && I[a].w === I[r.b].w && !I[a].loner && !I[r.b].loner) { const x = find(a), y = find(r.b); if (x !== y) par[Math.max(x, y)] = Math.min(x, y); }
  const anchor = P.map((_, i) => find(i));
  const companion = P.map((_, a) => { const pr = partner[a] >= 0 && I[partner[a]].w === I[a].w ? partner[a] : -1; if (pr >= 0) return pr; const r = [...out[a].values()].filter(r => pos(r) && I[r.b].w === I[a].w).sort((p, q) => q.strength - p.strength || p.b - q.b)[0]; return r ? r.b : -1; });
  // who leads whom in free time: walk the companion chain (a mutual pair is led by the lower id), so friends converge instead of swapping places
  const lead = P.map((_, p) => { let x = p; const seen = new Set([p]); for (let k = 0; k < 4; k++) { const c = companion[x]; if (c < 0 || seen.has(c) || (companion[c] === x && c > x)) break; seen.add(c); x = c; } return x; });
  const profiles = I.map(x => {
    const a = x.id, mine = [...out[a].values()], inc = P.map((_, j) => get(j, a)).filter(Boolean), strong = mine.filter(pos).length;
    let rep = inc.length ? inc.reduce((s, r) => s + r.valence * r.strength, 0) / inc.reduce((s, r) => s + r.strength, 0) : 0;
    if (a === beloved) rep += 0.25; if (a === distrusted) rep -= 0.3;
    const seek = mine.filter(r => r.valence > 0 && r.type !== 'acquaintance' && r.type !== 'colleague').sort((p, q) => (q.b === partner[a]) - (p.b === partner[a]) || q.strength * q.valence - p.strength * p.valence || p.b - q.b).slice(0, 3).map(r => r.b);
    const avoid = mine.filter(r => r.valence < -0.15).sort((p, q) => p.valence - q.valence || p.b - q.b).map(r => r.b);
    return { id: a, watch: x.w, extroversion: r3(x.ext), loneliness: r3(clamp(0.25 + x.ext * 0.5 - strong * 0.1 + (x.tags.has('social:homesick') ? 0.2 : 0) + (x.newcomer ? 0.15 : 0) - (x.loner ? 0.15 : 0), 0, 1)), reputation: r3(clamp(rep)),
      loner: x.loner, newcomer: x.newcomer, gossip: x.tags.has('social:gossip'), fixer: a === fixer, beloved: a === beloved, distrusted: a === distrusted, tenure: x.tenure, strong, ties: mine.length, partner: partner[a], seek, avoid };
  });
  return new SocialGraph({
    version: 2, seed, ship: shipName, people: P.map(p => ({ id: p.id, short: p.short, family: p.family, title: p.title, billet: p.billet, dept: p.dept, rank: p.rank })),
    groups, out, profiles, anchor, companion, lead, quarters, free: I.map(x => x.free.join('')), aff: A, hooks,
  });
}

// ============================================================== the graph
export class SocialGraph {
  constructor(S) {
    Object.assign(this, S); this.hooks = this.hooks || []; this.n = this.people.length; this.t = 0; this.log = []; this.acc = new Map(); this._seen = 0;
    this._groupsOf = this.people.map(() => []); for (const g of this.groups) for (const m of g.members) this._groupsOf[m]?.push(g);
    for (const l of this._groupsOf) l.sort((a, b) => (GROUP_PRIORITY[b.kind] || 0) - (GROUP_PRIORITY[a.kind] || 0) || (a.id < b.id ? -1 : 1));
  }
  name(x) { return this.people[idOf(x)]?.short || '?'; }
  relation(a, b) { return this.out[idOf(a)]?.get(idOf(b)) || null; }
  ties(p) { return [...(this.out[idOf(p)]?.values() || [])]; }
  friendsOf(p) { return this.ties(p).filter(r => STRONG.has(r.type)).sort((x, y) => y.strength - x.strength || x.b - y.b).map(r => ({ id: r.b, type: r.type, strength: r.strength, valence: r.valence, visible: r.visible })); }
  groupsOf(p) { return this._groupsOf[idOf(p)] || []; }
  affinity(a, b) { const i = idOf(a), j = idOf(b); if (this.aff) return this.aff[i * this.n + j]; const r = this.relation(i, j); return r ? r3(Math.max(0, r.valence) * r.strength) : 0; }
  profile(p) { return this.profiles[idOf(p)]; }
  isFree(p, hour) { return this.free[idOf(p)]?.[Math.floor((((hour % 24) + 24) % 24) * 2) % 48] === '1'; }
  anchorOf(p) { return this.anchor[idOf(p)] ?? idOf(p); }
  quartersOf(p) { return this.quarters[idOf(p)] ?? idOf(p); }
  companionOf(p) { const c = this.companion[idOf(p)]; return c >= 0 ? c : null; }
  // the group gathering this person drops in on at this ship hour (only in their free time), or null
  // Several may overlap: the one with the most friends turning up wins; nobody goes to an empty gathering. With none of their own,
  // a person tags along to the gathering their free-time lead (leadOf) is at.
  meetingFor(p, hour, follow = true) {
    const id = idOf(p); if (!this.isFree(id, hour)) return null;
    let best = null, bs = -1;
    for (const g of this.groupsOf(id)) {
      if (!g.meet || !inWin(hour, g.meet) || !this._attends(g, id)) continue;
      let sc = (GROUP_PRIORITY[g.kind] || 0) * 0.05, others = 0;
      for (const m of g.members) if (m !== id && this.isFree(m, hour) && this._attends(g, m)) { others++; const r = this.relation(id, m); if (r && r.valence > 0) sc += r.strength * (STRONG.has(r.type) ? 1 : 0.3); }
      if (others && sc > bs) { bs = sc; best = g; }
    }
    if (best) return { group: best.id, kind: best.kind, room: best.meet.room, spot: best.meet.spot, activity: best.meet.activity, site: best.site };
    const L = this.leadOf(id); return follow && L !== id ? this.meetingFor(L, hour, false) : null;
  }
  _attends(g, id) { return g.members.length <= 2 || id === g.leader || hash01('attend', this.seed, g.id, id) < 0.6 + 0.4 * g.cohesion; }   // pairs and the host always turn up
  leadOf(p) { return this.lead?.[idOf(p)] ?? idOf(p); }
  // who p would walk over to: ctx = { present: [ids or people], activity }
  seekTargets(p, ctx = {}) {
    const id = idOf(p), pr = this.profiles[id], present = ctx.present ? new Set([...ctx.present].map(idOf)) : null;
    return this.ties(id).filter(r => r.valence > 0 && (!present || present.has(r.b))).map(r => ({ id: r.b, type: r.type, score: r3(r.strength * r.valence * (1 + (ctx.activity && r.shared.includes(ctx.activity) ? 0.3 : 0)) + (r.b === pr.partner ? 0.5 : 0)) }))
      .sort((x, y) => y.score - x.score || x.id - y.id);
  }
  preferredCompany(p, activity) {
    const id = idOf(p), set = new Map();
    for (const g of this.groupsOf(id)) if (g.activity === activity || g.kind === activity) for (const m of g.members) if (m !== id) set.set(m, Math.max(set.get(m) || 0, 0.3 + (this.relation(id, m)?.strength || 0)));
    for (const r of this.ties(id)) if (r.valence > 0 && r.shared.includes(activity)) set.set(r.b, Math.max(set.get(r.b) || 0, r.strength + 0.3));
    return [...set.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([m]) => m);
  }
  // js/duty.js: how warmly b starts out towards a (the player)
  trustBias(a, b) { const r = this.relation(idOf(b), idOf(a)); if (!r) return 0; return clamp(r.valence * (0.1 + 0.25 * r.strength) + (TRUST_ATT[r.attitude] || 0), -0.25, 0.25); }
  groupLabel(g) { return `${g.name}${g.room ? ` (${g.room}${g.meet ? `, ${hhmm(g.meet.from)}–${hhmm(g.meet.to)}` : ''})` : ''}`; }
  // human-readable lines for the debug page / UI
  describe(p) {
    const id = idOf(p), pr = this.profiles[id], nm = (x) => this.name(x), L = [], T = this.ties(id);
    const flags = ['loner', 'newcomer', 'gossip', 'fixer', 'beloved', 'distrusted'].filter(f => pr[f]);
    L.push(`${nm(id)} — ${pr.watch} watch · outgoing ${Math.round(pr.extroversion * 100)}% · lonely ${Math.round(pr.loneliness * 100)}% · reputation ${pr.reputation >= 0 ? '+' : ''}${pr.reputation.toFixed(2)}${flags.length ? ' · ' + flags.join(', ') : ''}`);
    const by = (types) => T.filter(r => types.includes(r.type)).sort((a, b) => b.strength - a.strength || a.b - b.b);
    for (const r of by(['spouse', 'romance'])) L.push(`${r.type === 'spouse' ? 'Partner' : 'Seeing'}: ${nm(r.b)} — ${r.reason}${r.visible ? '' : ' [secret]'}`);
    for (const r of by(['mentor'])) L.push(`Mentor: ${nm(r.b)} — ${r.reason}`);
    const pro = by(['protege']); if (pro.length) L.push(`Mentors: ${pro.map(r => nm(r.b)).join(', ')}`);
    const fr = by(['close-friend', 'friend', 'old-shipmate']); if (fr.length) L.push(`Friends: ${fr.map(r => `${nm(r.b)} (${r.type === 'friend' ? '' : REL_TYPES[r.type].label + '; '}${r.reason}, ${sinceText(r.since)})`).join('; ')}`);
    const gs = this.groupsOf(id).filter(g => !['department-cell', 'watch-mess', 'officers-table'].includes(g.kind)); if (gs.length) L.push(`Groups: ${gs.map(g => this.groupLabel(g)).join('; ')}`);
    for (const r of by(['feud', 'rival'])) L.push(`${r.type === 'feud' ? 'Feud' : 'Rival'}: ${nm(r.b)} — ${r.reason}`);
    const ex = T.filter(r => r.history === 'ex'); if (ex.length) L.push(`Used to be with: ${ex.map(r => nm(r.b)).join(', ')}`);
    for (const att of Object.keys(ATTITUDES)) { const l = T.filter(r => r.attitude === att); if (l.length) L.push(`${ATTITUDES[att].label[0].toUpperCase() + ATTITUDES[att].label.slice(1)}: ${l.map(r => nm(r.b) + (r.areason ? ` (${r.areason})` : '')).join(', ')}`); }
    if (pr.seek.length) L.push(`Seeks out: ${pr.seek.map(nm).join(', ')}`); if (pr.avoid.length) L.push(`Avoids: ${pr.avoid.map(nm).join(', ')}`);
    return L;
  }
  // one spoken answer to "who do you hang out with?" — secrets only for a partner or close friend
  talkLine(p, asker = null) {
    const id = idOf(p), you = asker == null ? -1 : idOf(asker), pr = this.profiles[id], T = this.ties(id), mine = this.relation(id, you), intimate = mine && ['close-friend', 'spouse', 'romance'].includes(mine.type);
    const fam = (x) => this.people[x].family, bits = [], h = (k) => hash('talk', this.seed, id, k);
    const love = T.find(r => (r.type === 'spouse' || r.type === 'romance') && r.b !== you);
    if (love && (love.visible || intimate)) bits.push(love.visible ? (love.type === 'spouse' ? `Mostly with ${fam(love.b)} — we share quarters.` : `${fam(love.b)} and I have been seeing each other.`) : `Between us? ${fam(love.b)} and I are together. Keep it quiet.`);
    const fr = T.filter(r => ['close-friend', 'friend', 'old-shipmate'].includes(r.type) && r.b !== you).sort((a, b) => b.strength - a.strength || a.b - b.b).slice(0, 2);
    if (fr.length) bits.push(fr.length === 2 ? `I ${['eat with', 'knock about with', 'spend my off hours with'][h(1) % 3]} ${fam(fr[0].b)} and ${fam(fr[1].b)}.` : `${fam(fr[0].b)}, mostly — we ${fr[0].reason}.`);
    const g = this.groupsOf(id).find(g => ['hobby', 'rec-regulars', 'clique', 'confidant-circle'].includes(g.kind) && g.meet);
    if (g) bits.push(`I never miss ${g.kind === 'clique' ? 'the crowd' : ACTIVITIES[g.activity]?.phrase || g.name.toLowerCase()} in the ${g.room} — ${hhmm(g.meet.from)} hours.`);
    if (pr.loner && bits.length < 2) bits.unshift('Honestly? I keep to myself.');
    const foe = T.find(r => r.type === 'feud'); if (foe && foe.b !== you && h(2) % 2) bits.push(`Just keep me away from ${fam(foe.b)}.`);
    if (!bits.length) bits.push(pr.newcomer ? "I'm still new aboard. Haven't really found my people yet." : 'Whoever is on my watch, I suppose.');
    const yours = mine ? (REL_TYPES[mine.type].strong && mine.valence > 0 && h(3) % 2 ? 'And you, obviously.' : this.aboutYou(id, you)) : null;   // their history with the asker closes the answer
    return yours ? bits.slice(0, 2).concat(yours).join(' ') : bits.slice(0, 3).join(' ');
  }
  // p's one line about their history with you (the player's dealt character), or null if there is none worth a line
  aboutYou(p, you) {
    const id = idOf(p), u = idOf(you), r = this.relation(id, u); if (!r || id === u) return null;
    const pick = (l) => l[hash('you', this.seed, id, u) % l.length];
    if (r.attitude === 'sweet-on') return pick(['Oh — nobody in particular. Why, who is asking?', 'Is that an invitation? No. Of course not. Forget I said it.']);
    if (r.attitude === 'resents') return pick(['You got the stripe. I got the extra watches. Let us leave it there.', 'You would know who I spend time with if you had come up the long way.']);
    if (r.type === 'feud') return pick(['You know exactly how things stand between us.', 'Not with you. We both know why.']);
    if (r.history === 'ex') return pick(['You of all people know the answer to that.', 'Not with you. Not any more. We agreed.']);
    if (r.type === 'rival') return `You and I ${r.reason}. That has not changed.`;
    if (r.attitude === 'wary') return pick(['I will be straight with you: I watch what I say around you.', 'No offence. I would rather keep this to duty matters.']);
    if (r.type === 'spouse') return pick(['You know where I will be after watch. Same as you.', 'You. You are asking me that across our own breakfast table.']);
    if (r.type === 'romance') return r.visible ? 'You, when the rota allows. It rarely does.' : 'Careful. Not here.';
    if (r.type === 'mentor') return pick(['You taught me half of what I know. I am still working on the other half.', 'You, when you have the patience for my questions.']);
    if (r.type === 'protege') return pick(['You are coming along. Do not let it go to your head.', 'You, most days. Somebody has to check your work.']);
    if (r.type === 'old-shipmate') return `We ${r.reason}. Long time now.`;
    if (r.type === 'close-friend') return pick(['You are asking me? You have heard every story I have.', `You. We ${r.reason} — you were there.`]);
    if (r.type === 'friend') return `You, for one — we ${r.reason}.`;
    if (r.attitude === 'owes-favour') return 'I still owe you one. I have not forgotten.';
    if (r.attitude === 'is-owed') return 'You still owe me one. I have not forgotten either.';
    if (r.attitude === 'in-awe') return pick(['I read your whole service record before I came aboard. Sorry. That sounded strange.', 'Honestly? I would follow you into a plasma fire.']);
    return null;
  }
  // one sentence that explains the tie between two people (debug page, logs, briefing)
  storyOf(a, b) {
    const i = idOf(a), j = idOf(b), r = this.relation(i, j); if (!r) return null; const f = (x) => this.people[x].family, L = REL_TYPES[r.type].label;
    const base = r.type === 'mentor' ? `${f(j)} mentors ${f(i)}: ${r.reason}` : r.type === 'protege' ? `${f(i)} mentors ${f(j)}: ${r.reason}` : r.type === 'spouse' || r.type === 'romance' ? `${f(i)} and ${f(j)}: ${r.reason}` : `${f(i)} and ${f(j)} (${L}) ${r.reason}`;
    const q = this.relation(j, i), one = (x, y, t) => t.attitude && !ATTITUDES[t.attitude].inverse ? ` ${f(x)} ${t.attitude === 'resents' ? 'resents' : 'is ' + ATTITUDES[t.attitude].label} ${f(y)}${t.areason ? ` (${t.areason})` : ''}.` : t.attitude === 'owes-favour' ? ` ${f(x)} owes ${f(y)} a favour.` : '';
    return `${base}, ${sinceText(r.since)} now.${r.history === 'ex' ? ' They used to be a couple.' : ''}${one(i, j, r)}${q ? one(j, i, q) : ''}`;
  }
  // what p would pass on if asked for the news: hooks about other people that p is placed to know (never about p or the asker;
  // secrets only from a gossip or someone close to those involved). Stable per seed and person.
  rumours(p, { n = 2, asker = null } = {}) {
    const id = idOf(p), you = asker == null ? -1 : idOf(asker), gossip = !!this.profiles[id]?.gossip;
    const near = (h) => h.people.slice(0, 3).some(x => this.relation(id, x)), close = (h) => h.people.slice(0, 3).some(x => { const r = this.relation(id, x); return r && STRONG.has(r.type) && r.valence > 0; });
    return this.hooks.map((h, i) => [h, i]).filter(([h]) => !h.people.includes(id) && !h.people.slice(0, 3).includes(you) && (h.secret ? gossip || close(h) : gossip || near(h)))
      .sort((x, y) => hash01('rumour', this.seed, id, x[1]) - hash01('rumour', this.seed, id, y[1]) || x[1] - y[1]).slice(0, n).map(([h]) => h);
  }
  // who the player's dealt character already knows: [{ kind, id, text }] for a briefing card / log, strongest first (kind: partner, friend,
  // mentor, protege, shipmate, ex, rival, feud, admirer, cool, debt)
  playerBrief(you, max = 7) {
    const u = idOf(you), f = (x) => this.people[x].short, L = [], add = (kind, id, text, w) => L.push({ kind, id, text, w });
    for (const r of this.ties(u)) {
      const q = this.relation(r.b, u), s = r.strength;
      if (r.type === 'spouse') add('partner', r.b, `${f(r.b)} is your partner. You share quarters.`, 3);
      else if (r.type === 'romance') add('partner', r.b, `You and ${f(r.b)} are seeing each other${r.visible ? '' : '. Nobody is supposed to know'}.`, 3);
      else if (r.type === 'feud') add('feud', r.b, `You and ${f(r.b)} are not on speaking terms: ${r.reason}.`, 2.5);
      else if (r.history === 'ex') add('ex', r.b, `You and ${f(r.b)} ${r.reason}.`, 2.4);
      else if (r.type === 'rival') add('rival', r.b, `You and ${f(r.b)} ${r.reason}.`, 2.2);
      else if (r.type === 'mentor') add('mentor', r.b, `${f(r.b)} taught you the job and still checks your work.`, 2);
      else if (r.type === 'protege') add('protege', r.b, `You are bringing ${f(r.b)} along.`, 1.6 + s * 0.2);
      else if (r.type === 'close-friend') add('friend', r.b, `${f(r.b)} is a close friend: you ${r.reason}.`, 1.9 + s * 0.2);
      else if (r.type === 'old-shipmate') add('shipmate', r.b, `You and ${f(r.b)} ${r.reason}.`, 1.7);
      else if (r.type === 'friend') add('friend', r.b, `${f(r.b)} is a friend: you ${r.reason}.`, 1 + s * 0.5);
      if (q?.attitude === 'sweet-on') add('admirer', r.b, `${f(r.b)} is sweet on you. You may not have noticed.`, 1.8);
      else if (q?.attitude === 'resents') add('cool', r.b, `${f(r.b)} ${q.areason ? q.areason.replace(/the stripe .* got$/, 'the stripe you got') : 'resents you'}.`, 2.1);
      else if (q?.attitude === 'wary' && q.type !== 'feud') add('cool', r.b, `${f(r.b)} is wary of you.`, 1.5);
      else if (q?.attitude === 'owes-favour') add('debt', r.b, `${f(r.b)} owes you a favour.`, 0.9);
      if (r.attitude === 'owes-favour') add('debt', r.b, `You owe ${f(r.b)} a favour.`, 1.2);
    }
    return L.sort((a, b) => b.w - a.w || a.id - b.id).slice(0, max).map(({ kind, id, text }) => ({ kind, id, text }));
  }
  // ---- slow dynamics over a run: witnessed events nudge opinions; enough of them make or break ties
  onTrustEvent(a, b, delta, why = 'what happened aboard', _spread = true) {
    a = idOf(a); b = idOf(b); if (a === b || a == null || b == null || !this.out[a] || !this.out[b] || !Number.isFinite(delta) || !delta) return;
    const k = a * this.n + b, acc = (this.acc.get(k) || 0) + delta; this.acc.set(k, acc);
    let r = this.relation(a, b);
    const both = (type, o) => { for (const [x, y] of [[a, b], [b, a]]) { const old = this.out[x].get(y); this.out[x].set(y, { a: x, b: y, type, attitude: old?.attitude || null, strength: r3(o.strength), valence: r3(o.valence), since: old?.since ?? 0, reason: o.reason, visible: true, shared: old?.shared || [] }); } };
    if (!r) { if (Math.abs(acc) >= 0.12) { both('acquaintance', { strength: 0.2, valence: Math.sign(acc) * 0.2, reason: `got to know each other this watch (${why})` }); this._ev('meet', a, b, why); } }
    else {
      r.valence = r3(clamp(r.valence + delta * 0.5)); r.strength = r3(clamp(r.strength + Math.abs(delta) * 0.3, 0, 1));
      const strongCount = (x) => this.ties(x).filter(q => STRONG.has(q.type)).length;
      if ((r.type === 'acquaintance' || r.type === 'colleague') && acc > 0.3 && r.valence > 0.45 && strongCount(a) < LIMITS.strongCap && strongCount(b) < LIMITS.strongCap) { both('friend', { strength: Math.max(0.5, r.strength), valence: r.valence, reason: `became friends this watch (${why})` }); this._ev('friend', a, b, why); }
      else if (STRONG.has(r.type) && r.valence < 0 && !r.attitude) { r.attitude = 'wary'; this._ev('fray', a, b, why); }
      else if (r.attitude === 'wary' && r.valence > 0.3) { r.attitude = null; this._ev('mend', a, b, why); }
    }
    if (_spread && delta < -0.1 && this.profiles[a]?.gossip) for (const q of this.ties(a).filter(q => q.type === 'gossip-link' || (STRONG.has(q.type) && q.valence > 0)).slice(0, 3)) this.onTrustEvent(q.b, b, delta * 0.3, `heard it from ${this.people[a].family}`, false);
  }
  _ev(type, a, b, why) { this.log.push({ t: r3(this.t), type, a, b, why, text: `${this.name(a)} & ${this.name(b)}: ${type === 'meet' ? 'got to know each other' : type === 'friend' ? 'became friends' : type === 'fray' ? 'falling out' : 'patched it up'} (${why})` }); if (this.log.length > 200) this.log.shift(); }
  tick(dt) { this.t += dt; if (Math.floor(this.t / 10) !== Math.floor((this.t - dt) / 10)) for (const [k, v] of this.acc) { const w = v * 0.97; if (Math.abs(w) < 0.01) this.acc.delete(k); else this.acc.set(k, w); } const fresh = this.log.slice(this._seen); this._seen = this.log.length; return fresh; }
  events() { return this.log.slice(); }
  stats() {
    const types = {}, kinds = {}; for (const l of this.out) for (const r of l.values()) { if (r.a < r.b || !REL_TYPES[r.type].sym) types[r.type] = (types[r.type] || 0) + 1; if (r.attitude) types[r.attitude] = (types[r.attitude] || 0) + 1; }
    for (const g of this.groups) kinds[g.kind] = (kinds[g.kind] || 0) + 1; const hooks = {}; for (const h of this.hooks) hooks[h.kind] = (hooks[h.kind] || 0) + 1;
    return { people: this.n, groups: this.groups.length, kinds, types, hooks, loners: this.profiles.filter(p => p.loner).length };
  }
  toJSON() {
    const rels = []; for (const l of this.out) for (const r of l.values()) rels.push([r.a, r.b, r.type, r.attitude, r.strength, r.valence, r.since, r.reason, r.visible ? 1 : 0, r.shared, r.areason || null, r.history || null]);
    return { version: this.version, seed: this.seed, ship: this.ship, people: this.people, groups: this.groups, rels, profiles: this.profiles, anchor: this.anchor, companion: this.companion, lead: this.lead, quarters: this.quarters, free: this.free, hooks: this.hooks };
  }
  static fromJSON(j) {
    const out = j.people.map(() => new Map());
    for (const [a, b, type, attitude, strength, valence, since, reason, visible, shared, areason, history] of j.rels) { const r = { a, b, type, attitude, strength, valence, since, reason, visible: !!visible, shared }; if (areason) r.areason = areason; if (history) r.history = history; out[a].set(b, r); }
    return new SocialGraph({ ...j, groups: JSON.parse(JSON.stringify(j.groups)), hooks: JSON.parse(JSON.stringify(j.hooks || [])), out, aff: null });
  }
}
