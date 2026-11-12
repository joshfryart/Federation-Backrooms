// Crew voices and mannerism tags (spec: docs/crew-sim/VOICE.md). Pure data + generators, no three.js, no DOM.
//   makeVoice(person, rnd, used) -> { voice, tags, persona }   deterministic per person; `used` (a Set of signatures) enforces "no two alike on a ship"
//   liftLine(person, dest)       -> the line a person says on picking a deck:  dest = { deckNo, zone, rooms: [labels] }
//   shapeLine / bark             -> the same tags colouring any other line (barks, small talk)
//   TAGS / CONFLICTS / TAG_EFFECTS -> taxonomy, conflict table and the in-game hook for every tag (a tag without a hook may not exist)
// Tags are `category:value` strings; the voice category nests one level (`voice:pitch:low`).

export const TAGS = {
  voice: {
    pitch: ['low', 'mid', 'high'],
    timbre: ['gravelly', 'breathy', 'nasal', 'resonant', 'bright', 'smoky', 'warm', 'thin', 'crisp'],
    pace: ['clipped', 'measured', 'rapid', 'drawling', 'halting'],
    volume: ['soft', 'projected', 'booming', 'murmur'],
    accent: ['flat', 'lilt', 'clipped', 'drawl', 'sing-song', 'northern', 'maritime', 'prairie'],
  },
  speech: ['terse', 'verbose', 'formal', 'casual', 'jargon-heavy', 'plain-spoken', 'hedging', 'blunt', 'diplomatic', 'rambling', 'precise', 'sarcastic', 'earnest', 'deadpan', 'cheerful', 'gallows-humor', 'ritual-courtesy', 'swears-mildly', 'counts-aloud', 'narrates-actions', 'self-corrects', 'trails-off', 'stammers-under-stress', 'nervous-laugh'],
  habit: ['hums', 'whistles', 'taps-console', 'fidgets', 'clears-throat', 'sighs', 'mutters', 'cracks-knuckles', 'rubs-neck', 'adjusts-collar', 'parade-rest', 'leans-on-walls', 'paces', 'checks-badge', 'checks-time', 'drinks-from-flask', 'chews-gum', 'doodles', 'talks-to-machines', 'pats-equipment', 'crosses-arms', 'stands-too-close', 'avoids-eye-contact'],
  combat: ['aggressive', 'cautious', 'protective', 'tactical', 'reckless', 'freezes', 'panics', 'flees-to-cover', 'medic-first', 'defers-to-rank', 'takes-charge', 'negotiates', 'hides', 'improvises-weapon', 'calls-it-in', 'stoic'],
  workstation: ['focused', 'distracted', 'meticulous', 'improviser', 'by-the-book', 'corner-cutter', 'perfectionist', 'multitasker', 'chatty-at-work', 'silent-worker', 'proud-of-station', 'resents-station', 'tidy', 'cluttered', 'checks-twice', 'overconfident', 'anxious-about-faults', 'mentors-juniors'],
  social: ['gregarious', 'loner', 'gossip', 'mentor', 'rule-enforcer', 'joker', 'deferential', 'commanding', 'peacemaker', 'rival-minded', 'confidant', 'flirty', 'gruff-heart-of-gold', 'homesick', 'cliquey'],
  stress: ['calm', 'brittle', 'snappy', 'withdrawn', 'overworks', 'denial', 'comfort-eats', 'prays', 'black-humor', 'chatters', 'goes-silent', 'short-tempered'],
  lift: ['says-deck-number', 'names-place', 'full-sentence', 'one-word', 'over-enunciates', 'mumbles', 'says-please', 'says-thanks', 'small-talk', 'rides-in-silence', 'hums-in-lift', 'checks-reflection', 'stands-at-back', 'holds-door', 'presses-twice', 'corrects-others'],
};
export const CATEGORIES = Object.keys(TAGS);                 // every person has at least one tag in each
export const TAG_COLORS = { voice: '#6ad8ff', speech: '#ffd166', habit: '#c79bff', combat: '#ff7a6a', workstation: '#8fe3a0', social: '#ff9ed2', stress: '#ffa14a', lift: '#9fb4ff' };
export const MIN_TAGS = 8, MAX_TAGS = 14, MAX_TIMBRE = 2;
const { voice: VT } = TAGS;
export const allTags = () => [...Object.entries(VT).flatMap(([g, vs]) => vs.map(v => `voice:${g}:${v}`)), ...CATEGORIES.slice(1).flatMap(c => TAGS[c].map(v => `${c}:${v}`))];
export const catOf = (tag) => tag.slice(0, tag.indexOf(':'));
export const groupOf = (tag) => { const p = tag.split(':'); return p[0] === 'voice' ? `voice:${p[1]}` : p[0]; };

// ---- conflicts: single-choice groups plus an explicit pair list ----
const EXCLUSIVE = ['voice:pitch', 'voice:pace', 'voice:volume', 'voice:accent'];
const PAIRS = [
  // voice
  ['voice:timbre:gravelly', 'voice:timbre:bright'], ['voice:timbre:gravelly', 'voice:timbre:thin'], ['voice:timbre:gravelly', 'voice:timbre:crisp'], ['voice:timbre:breathy', 'voice:timbre:resonant'], ['voice:timbre:breathy', 'voice:volume:booming'],
  ['voice:timbre:nasal', 'voice:timbre:resonant'], ['voice:timbre:bright', 'voice:timbre:smoky'], ['voice:timbre:warm', 'voice:timbre:thin'], ['voice:timbre:smoky', 'voice:timbre:crisp'], ['voice:pitch:low', 'voice:timbre:thin'], ['voice:pitch:low', 'voice:timbre:bright'], ['voice:pitch:high', 'voice:timbre:gravelly'], ['voice:pitch:high', 'voice:timbre:resonant'], ['voice:pitch:high', 'voice:timbre:smoky'],
  ['voice:pace:clipped', 'speech:rambling'], ['voice:pace:clipped', 'speech:verbose'], ['voice:pace:drawling', 'speech:terse'], ['voice:pace:rapid', 'speech:trails-off'], ['voice:pace:halting', 'speech:precise'], ['voice:pace:rapid', 'lift:over-enunciates'], ['voice:pace:halting', 'speech:jargon-heavy'],
  ['voice:volume:murmur', 'lift:over-enunciates'], ['voice:volume:booming', 'lift:mumbles'], ['voice:volume:booming', 'habit:avoids-eye-contact'], ['voice:volume:projected', 'lift:mumbles'], ['voice:volume:murmur', 'combat:takes-charge'], ['voice:volume:soft', 'combat:aggressive'],
  // speech
  ['speech:terse', 'speech:verbose'], ['speech:terse', 'speech:rambling'], ['speech:terse', 'speech:counts-aloud'], ['speech:formal', 'speech:casual'], ['speech:formal', 'speech:swears-mildly'], ['speech:jargon-heavy', 'speech:plain-spoken'], ['speech:hedging', 'speech:blunt'], ['speech:blunt', 'speech:diplomatic'], ['speech:hedging', 'speech:precise'],
  ['speech:earnest', 'speech:sarcastic'], ['speech:earnest', 'speech:deadpan'], ['speech:cheerful', 'speech:deadpan'], ['speech:cheerful', 'speech:gallows-humor'], ['speech:sarcastic', 'speech:diplomatic'], ['speech:self-corrects', 'speech:precise'], ['speech:formal', 'speech:nervous-laugh'], ['speech:terse', 'speech:narrates-actions'], ['speech:ritual-courtesy', 'speech:blunt'],
  // habit
  ['habit:parade-rest', 'habit:leans-on-walls'], ['habit:parade-rest', 'habit:paces'], ['habit:parade-rest', 'habit:fidgets'], ['habit:leans-on-walls', 'habit:paces'], ['habit:stands-too-close', 'habit:avoids-eye-contact'], ['habit:hums', 'habit:whistles'], ['habit:crosses-arms', 'habit:fidgets'], ['habit:mutters', 'habit:talks-to-machines'], ['habit:adjusts-collar', 'habit:chews-gum'],
  // combat
  ['combat:aggressive', 'combat:cautious'], ['combat:aggressive', 'combat:freezes'], ['combat:aggressive', 'combat:panics'], ['combat:aggressive', 'combat:flees-to-cover'], ['combat:aggressive', 'combat:hides'], ['combat:reckless', 'combat:cautious'], ['combat:reckless', 'combat:tactical'], ['combat:freezes', 'combat:takes-charge'],
  ['combat:panics', 'combat:stoic'], ['combat:panics', 'combat:takes-charge'], ['combat:panics', 'combat:tactical'], ['combat:hides', 'combat:protective'], ['combat:hides', 'combat:takes-charge'], ['combat:defers-to-rank', 'combat:takes-charge'], ['combat:flees-to-cover', 'combat:protective'], ['combat:freezes', 'combat:stoic'], ['combat:reckless', 'combat:defers-to-rank'],
  // workstation
  ['workstation:focused', 'workstation:distracted'], ['workstation:meticulous', 'workstation:corner-cutter'], ['workstation:by-the-book', 'workstation:improviser'], ['workstation:by-the-book', 'workstation:corner-cutter'], ['workstation:perfectionist', 'workstation:corner-cutter'], ['workstation:tidy', 'workstation:cluttered'],
  ['workstation:chatty-at-work', 'workstation:silent-worker'], ['workstation:proud-of-station', 'workstation:resents-station'], ['workstation:overconfident', 'workstation:anxious-about-faults'], ['workstation:checks-twice', 'workstation:corner-cutter'], ['workstation:silent-worker', 'workstation:mentors-juniors'], ['workstation:distracted', 'workstation:meticulous'], ['workstation:overconfident', 'workstation:checks-twice'],
  // social
  ['social:gregarious', 'social:loner'], ['social:loner', 'social:gossip'], ['social:loner', 'social:flirty'], ['social:loner', 'social:joker'], ['social:loner', 'social:cliquey'], ['social:deferential', 'social:commanding'], ['social:peacemaker', 'social:rival-minded'], ['social:confidant', 'social:gossip'], ['social:rule-enforcer', 'social:joker'], ['social:gruff-heart-of-gold', 'social:flirty'], ['social:deferential', 'social:rival-minded'],
  // stress
  ['stress:calm', 'stress:brittle'], ['stress:calm', 'stress:snappy'], ['stress:calm', 'stress:short-tempered'], ['stress:calm', 'stress:chatters'], ['stress:calm', 'stress:withdrawn'], ['stress:calm', 'stress:denial'], ['stress:calm', 'stress:goes-silent'], ['stress:withdrawn', 'stress:chatters'], ['stress:goes-silent', 'stress:chatters'], ['stress:goes-silent', 'stress:snappy'], ['stress:black-humor', 'stress:prays'], ['stress:prays', 'speech:gallows-humor'],
  // lift
  ['lift:one-word', 'lift:full-sentence'], ['lift:one-word', 'lift:small-talk'], ['lift:rides-in-silence', 'lift:small-talk'], ['lift:rides-in-silence', 'lift:hums-in-lift'], ['lift:rides-in-silence', 'lift:corrects-others'], ['lift:rides-in-silence', 'lift:says-thanks'], ['lift:mumbles', 'lift:over-enunciates'], ['lift:mumbles', 'lift:full-sentence'], ['lift:stands-at-back', 'lift:holds-door'], ['lift:one-word', 'lift:says-thanks'],
  ['speech:terse', 'lift:full-sentence'], ['speech:terse', 'lift:small-talk'], ['speech:verbose', 'lift:one-word'], ['speech:rambling', 'lift:one-word'], ['speech:formal', 'lift:mumbles'], ['social:loner', 'lift:small-talk'], ['social:loner', 'lift:holds-door'], ['workstation:silent-worker', 'lift:small-talk'], ['lift:hums-in-lift', 'stress:goes-silent'], ['habit:hums', 'lift:rides-in-silence'], ['habit:whistles', 'lift:rides-in-silence'],
  ['speech:blunt', 'lift:says-please'],
];
export const CONFLICTS = (() => {
  const m = {}, add = (a, b) => { (m[a] ||= new Set()).add(b); (m[b] ||= new Set()).add(a); };
  for (const [a, b] of PAIRS) add(a, b);
  const tags = allTags();
  for (const g of EXCLUSIVE) { const grp = tags.filter(t => groupOf(t) === g); for (const a of grp) for (const b of grp) if (a !== b) add(a, b); }
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v]]));
})();
export const conflicts = (a, b) => !!CONFLICTS[a]?.includes(b);
export function conflictsIn(tags) { const out = [], s = new Set(tags); for (const t of tags) for (const c of CONFLICTS[t] || []) if (s.has(c) && t < c) out.push([t, c]); if (new Set(tags).size !== tags.length) out.push(['duplicate', '']); const tim = tags.filter(t => t.startsWith('voice:timbre:')).length; if (tim > MAX_TIMBRE) out.push(['timbre', '>' + MAX_TIMBRE]); return out; }

// ---- hooks: what each tag does in play ----
// kind 'line'   : changes how a spoken line is built (shapeLine / liftLine) or how the voice delivers it (deliver: multipliers/additions on the voice profile)
// kind 'anim'   : a visible/audible mannerism (hint = animation or sound cue; see habitCue)
// kind 'bark'   : adds to the person's bark pool
// kind 'weight' : a number the NPC sim reads (sums in weightsOf)
const line = (o) => ({ kind: 'line', ...o }), anim = (hint, o = {}) => ({ kind: 'anim', hint, ...o }), bk = (pool, lines) => ({ kind: 'bark', pool, lines }), wt = (w) => ({ kind: 'weight', w });
const dv = (mul = {}, add = {}) => line({ deliver: { mul, add } });
export const TAG_EFFECTS = {
  'voice:pitch:low': dv({ pitch: 0.8 }), 'voice:pitch:mid': dv({ pitch: 1 }), 'voice:pitch:high': dv({ pitch: 1.2 }),
  'voice:timbre:gravelly': dv({ pitch: 0.95 }, { rough: 0.5 }), 'voice:timbre:breathy': dv({}, { breath: 0.5 }), 'voice:timbre:nasal': dv({ formant: 1.06 }, { rough: 0.05 }), 'voice:timbre:resonant': dv({ formant: 0.93, pitch: 0.95 }, { vibrato: 0.05 }),
  'voice:timbre:bright': dv({ formant: 1.05 }, { breath: -0.05 }), 'voice:timbre:smoky': dv({}, { rough: 0.3, breath: 0.15 }), 'voice:timbre:warm': dv({}, { vibrato: 0.25, rough: -0.05 }), 'voice:timbre:thin': dv({ formant: 1.08, volume: 0.92 }), 'voice:timbre:crisp': dv({ rate: 1.05 }, { breath: -0.08 }),
  'voice:pace:clipped': dv({ rate: 1.12 }), 'voice:pace:measured': dv({ rate: 0.95 }), 'voice:pace:rapid': dv({ rate: 1.3 }), 'voice:pace:drawling': dv({ rate: 0.82 }), 'voice:pace:halting': dv({ rate: 0.85 }, { rough: 0.05 }),
  'voice:volume:soft': dv({ volume: 0.65 }, { breath: 0.1 }), 'voice:volume:projected': dv({ volume: 1.12 }), 'voice:volume:booming': dv({ volume: 1.3, pitch: 0.97 }), 'voice:volume:murmur': dv({ volume: 0.5 }, { breath: 0.2 }),
  'voice:accent:flat': line({ accent: 'flat' }), 'voice:accent:lilt': line({ accent: 'lilt', deliver: { mul: {}, add: { vibrato: 0.1 } } }), 'voice:accent:clipped': line({ accent: 'clipped', deliver: { mul: { rate: 1.05 }, add: {} } }), 'voice:accent:drawl': line({ accent: 'drawl', deliver: { mul: { rate: 0.92 }, add: {} } }),
  'voice:accent:sing-song': line({ accent: 'sing-song', deliver: { mul: {}, add: { vibrato: 0.2 } } }), 'voice:accent:northern': line({ accent: 'northern', deliver: { mul: { pitch: 0.97 }, add: {} } }), 'voice:accent:maritime': line({ accent: 'maritime', deliver: { mul: { rate: 1.04 }, add: { vibrato: 0.08 } } }), 'voice:accent:prairie': line({ accent: 'prairie', deliver: { mul: { rate: 0.96 }, add: {} } }),
  // speech: pre/post decorate a line (one of each at most), fn rewrites it, end replaces the final punctuation
  'speech:terse': line({ fn: 'terse' }), 'speech:verbose': line({ post: [', if that is all right with everyone', ', whenever you are ready'] }), 'speech:formal': line({ fn: 'formal' }), 'speech:casual': line({ pre: ['Uh,', 'Yeah,', 'Okay,'] }),
  'speech:jargon-heavy': line({ pre: ['Copy,', 'Affirm,'] }), 'speech:plain-spoken': line({ fn: 'plain' }), 'speech:hedging': line({ pre: ['I think', 'Um, I think'], end: '?' }), 'speech:blunt': line({ fn: 'blunt' }), 'speech:diplomatic': line({ pre: ['If it is no trouble,', 'When convenient,'] }),
  'speech:rambling': line({ post: [', and, well, you know how it is', ', which reminds me, never mind'] }), 'speech:precise': line({ fn: 'precise' }), 'speech:sarcastic': line({ post: ['. Obviously', '. Riveting'] }), 'speech:earnest': line({ post: ['. Truly', '. I mean that'] }),
  'speech:deadpan': line({ end: '.' , flat: true }), 'speech:cheerful': line({ end: '!' }), 'speech:gallows-humor': line({ post: ['. If we make it', '. Assuming the deck holds'] }), 'speech:ritual-courtesy': line({ sir: true }), 'speech:swears-mildly': line({ post: [', damn it', ', for crying out loud'] }),
  'speech:counts-aloud': line({ fn: 'count' }), 'speech:narrates-actions': line({ pre: ['Heading for', 'Going to', 'Off to'], fn: 'narrate' }), 'speech:self-corrects': line({ fn: 'selfcorrect' }), 'speech:trails-off': line({ end: '…' }), 'speech:stammers-under-stress': line({ fn: 'stammer', stressOnly: true }), 'speech:nervous-laugh': line({ pre: ['Heh,', 'Ha, um,'] }),
  // habit
  'habit:hums': anim('hum', { sound: 'hum' }), 'habit:whistles': anim('whistle', { sound: 'whistle' }), 'habit:taps-console': anim('tap-console'), 'habit:fidgets': anim('fidget'), 'habit:clears-throat': anim('clear-throat', { sound: 'clear' }), 'habit:sighs': anim('sigh', { sound: 'sigh' }), 'habit:mutters': anim('mutter', { sound: 'mutter' }),
  'habit:cracks-knuckles': anim('crack-knuckles', { sound: 'crack' }), 'habit:rubs-neck': anim('rub-neck'), 'habit:adjusts-collar': anim('adjust-collar'), 'habit:parade-rest': anim('parade-rest'), 'habit:leans-on-walls': anim('lean-wall'), 'habit:paces': anim('pace'), 'habit:checks-badge': anim('check-badge'), 'habit:checks-time': anim('check-time'),
  'habit:drinks-from-flask': anim('flask'), 'habit:chews-gum': anim('chew', { sound: 'smack' }), 'habit:doodles': anim('doodle'), 'habit:talks-to-machines': anim('talk-to-machine', { sound: 'mutter' }), 'habit:pats-equipment': anim('pat-equipment'), 'habit:crosses-arms': anim('cross-arms'), 'habit:stands-too-close': anim('stand-close'), 'habit:avoids-eye-contact': anim('look-away'),
  // combat / workstation / social: weights the NPC sim sums (fight, flee, hide, help, command, obey, call = reaction to danger; speed, care, chat = work; sociable, rumour, mood = social)
  'combat:aggressive': wt({ fight: 0.8, flee: -0.5 }), 'combat:cautious': wt({ fight: -0.3, flee: 0.3, care: 0.2 }), 'combat:protective': wt({ help: 0.7, flee: -0.3 }), 'combat:tactical': wt({ fight: 0.3, command: 0.3, call: 0.3 }), 'combat:reckless': wt({ fight: 0.6, care: -0.4 }), 'combat:freezes': wt({ freeze: 0.8, fight: -0.5 }),
  'combat:panics': wt({ flee: 0.8, freeze: 0.3, call: 0.3 }), 'combat:flees-to-cover': wt({ flee: 0.6, hide: 0.3 }), 'combat:medic-first': wt({ help: 0.9, fight: -0.2 }), 'combat:defers-to-rank': wt({ obey: 0.8 }), 'combat:takes-charge': wt({ command: 0.9, obey: -0.4 }), 'combat:negotiates': wt({ talk: 0.8, fight: -0.3 }),
  'combat:hides': wt({ hide: 0.9, flee: 0.3 }), 'combat:improvises-weapon': wt({ fight: 0.4, improv: 0.7 }), 'combat:calls-it-in': wt({ call: 0.9 }), 'combat:stoic': wt({ freeze: -0.5, flee: -0.3, mood: 0.2 }),
  'workstation:focused': wt({ speed: 0.3, chat: -0.3 }), 'workstation:distracted': wt({ speed: -0.3, care: -0.2 }), 'workstation:meticulous': wt({ care: 0.5, speed: -0.2 }), 'workstation:improviser': wt({ improv: 0.7, care: -0.1 }), 'workstation:by-the-book': wt({ care: 0.3, obey: 0.3, improv: -0.5 }), 'workstation:corner-cutter': wt({ speed: 0.4, care: -0.5 }),
  'workstation:perfectionist': wt({ care: 0.7, speed: -0.4 }), 'workstation:multitasker': wt({ speed: 0.3, care: -0.1 }), 'workstation:chatty-at-work': wt({ chat: 0.8, speed: -0.1 }), 'workstation:silent-worker': wt({ chat: -0.8, speed: 0.1 }), 'workstation:proud-of-station': wt({ care: 0.3, mood: 0.2 }), 'workstation:resents-station': wt({ mood: -0.4, speed: -0.2 }),
  'workstation:tidy': wt({ care: 0.2, tidy: 0.8 }), 'workstation:cluttered': wt({ tidy: -0.8 }), 'workstation:checks-twice': wt({ care: 0.4, speed: -0.2 }), 'workstation:overconfident': wt({ care: -0.3, fight: 0.2 }), 'workstation:anxious-about-faults': wt({ call: 0.4, care: 0.3, mood: -0.2 }), 'workstation:mentors-juniors': wt({ help: 0.3, sociable: 0.2 }),
  'social:gregarious': wt({ sociable: 0.9, chat: 0.3 }), 'social:loner': wt({ sociable: -0.8 }), 'social:gossip': wt({ rumour: 0.9, sociable: 0.3 }), 'social:mentor': wt({ help: 0.4, sociable: 0.3 }), 'social:rule-enforcer': wt({ obey: 0.4, command: 0.2 }), 'social:joker': wt({ sociable: 0.5, mood: 0.3 }), 'social:deferential': wt({ obey: 0.6 }),
  'social:commanding': wt({ command: 0.6, obey: -0.3 }), 'social:peacemaker': wt({ talk: 0.5, fight: -0.3 }), 'social:rival-minded': wt({ fight: 0.2, speed: 0.2, mood: -0.1 }), 'social:confidant': wt({ sociable: 0.4, rumour: -0.5 }), 'social:flirty': wt({ sociable: 0.5, chat: 0.3 }), 'social:gruff-heart-of-gold': wt({ help: 0.5, mood: -0.1 }), 'social:homesick': wt({ mood: -0.5, sociable: -0.1 }), 'social:cliquey': wt({ sociable: 0.1, rumour: 0.3 }),
  // stress: change the barks said under pressure
  'stress:calm': bk('stressed', ['Steady. Steady.', 'Nobody panic. Report.']), 'stress:brittle': bk('stressed', ['I cannot — not now.', 'This is too much.']), 'stress:snappy': bk('stressed', ['What?!', 'Do you mind?']), 'stress:withdrawn': bk('stressed', ['…', 'Leave me to it.']), 'stress:overworks': bk('stressed', ['One more check. Just one more.', 'I will stay on it.']),
  'stress:denial': bk('stressed', ['It is fine. Everything is fine.', 'That is not happening.']), 'stress:comfort-eats': bk('hungry', ['Is there any cake left?', 'I need a snack. Right now.']), 'stress:prays': bk('stressed', ['Please hold together, please.', 'Oh, stars, keep us.']), 'stress:black-humor': bk('stressed', ['Well, this is fine.', 'Nothing a good funeral cannot fix.']),
  'stress:chatters': bk('stressed', ['Okay, okay, okay, what do we do, what is that, okay.', 'Talking helps. Does it help? It helps.']), 'stress:goes-silent': bk('stressed', ['…', '(says nothing)']), 'stress:short-tempered': bk('stressed', ['Not now.', 'Move.']),
  // lift: shape the line (liftLine), the ride (riderCue) and what the rider says or does
  'lift:says-deck-number': line({ lift: 'deck' }), 'lift:names-place': line({ lift: 'place' }), 'lift:full-sentence': line({ lift: 'sentence' }), 'lift:one-word': line({ lift: 'word' }), 'lift:over-enunciates': line({ lift: 'pauses', deliver: { mul: { rate: 0.85 }, add: {} } }), 'lift:mumbles': line({ lift: 'mumble', deliver: { mul: { volume: 0.78 }, add: { breath: 0.1 } } }),
  'lift:says-please': line({ lift: 'please' }), 'lift:says-thanks': line({ lift: 'thanks', leave: ['Thanks.', 'Cheers.'] }), 'lift:small-talk': bk('smalltalk', ['Long shift?', 'Quiet today, is it not?', 'They keep promising to fix the lift hum.', 'Did you try the galley this morning?']), 'lift:rides-in-silence': wt({ talk: -1 }), 'lift:hums-in-lift': anim('hum', { sound: 'hum', lift: true }),
  'lift:checks-reflection': anim('check-reflection', { lift: true }), 'lift:stands-at-back': anim('stand-back', { lift: true, spot: 'back' }), 'lift:holds-door': anim('hold-door', { lift: true, spot: 'door' }), 'lift:presses-twice': anim('press-twice', { lift: true, sound: 'click2' }), 'lift:corrects-others': bk('correct', ['Actually, the stairs are quicker for one deck.', 'It is the other button, you know.']),
};
const EFFECT_KINDS = new Set(['line', 'anim', 'bark', 'weight']);
export const hasEffect = (tag) => { const e = TAG_EFFECTS[tag]; return !!e && EFFECT_KINDS.has(e.kind) && (e.kind === 'weight' ? Object.values(e.w).every(Number.isFinite) && Object.keys(e.w).length > 0 : e.kind === 'bark' ? e.lines?.length > 0 : e.kind === 'anim' ? !!e.hint : Object.keys(e).length > 1); };

// ---- persona data (assets/data/personas.json, built by tools/build-voices.mjs) ----
let PERSONAS = null;
export const setPersonas = (p) => { PERSONAS = p; };
export const havePersonas = () => !!PERSONAS;
export async function loadPersonas(url = new URL('../assets/data/personas.json', import.meta.url)) {
  if (PERSONAS) return PERSONAS;
  try { const r = await fetch(url); if (r.ok) PERSONAS = await r.json(); } catch (e) { /* no personas: the generator falls back to department weights only */ }
  return PERSONAS;
}

// persona traits / quirk words -> candidate tags
const TRAIT_TAGS = {
  punctual: ['workstation:by-the-book', 'habit:checks-time'], formal: ['speech:formal', 'lift:full-sentence', 'speech:ritual-courtesy'], chatty: ['speech:casual', 'social:gregarious', 'workstation:chatty-at-work', 'lift:small-talk'], talkative: ['speech:rambling', 'social:gregarious', 'lift:small-talk'], social: ['social:gregarious', 'lift:small-talk'], sociable: ['social:gregarious', 'social:joker'],
  methodical: ['workstation:checks-twice', 'speech:precise', 'workstation:tidy'], meticulous: ['workstation:meticulous', 'workstation:checks-twice'], thorough: ['workstation:checks-twice', 'workstation:perfectionist'], exacting: ['workstation:perfectionist', 'speech:precise'], careful: ['combat:cautious', 'workstation:meticulous'], precise: ['speech:precise', 'workstation:meticulous'], diligent: ['workstation:focused'], efficient: ['speech:terse', 'workstation:focused'], tireless: ['stress:overworks'], 'over-committed': ['stress:overworks'], overworked: ['stress:overworks'],
  dry: ['speech:deadpan', 'lift:rides-in-silence'], 'dry-humoured': ['speech:deadpan', 'stress:black-humor'], 'dry humour': ['speech:deadpan', 'stress:black-humor'], wry: ['speech:sarcastic', 'stress:black-humor'], skeptical: ['speech:sarcastic'], sceptical: ['speech:sarcastic'],
  restless: ['habit:fidgets', 'habit:paces'], anxious: ['workstation:anxious-about-faults', 'stress:brittle', 'speech:hedging'], nervous: ['speech:nervous-laugh', 'stress:chatters', 'speech:stammers-under-stress'], jumpy: ['combat:flees-to-cover', 'stress:brittle'], worrier: ['workstation:anxious-about-faults', 'workstation:checks-twice', 'habit:checks-time'], wired: ['habit:fidgets', 'stress:chatters'], caffeinated: ['habit:fidgets', 'voice:pace:rapid'],
  tired: ['habit:sighs', 'stress:withdrawn'], insomniac: ['habit:sighs', 'stress:overworks'], 'sleeps badly': ['habit:sighs'], 'night owl': ['habit:sighs'], impatient: ['habit:taps-console', 'stress:short-tempered', 'speech:blunt'], restive: ['habit:paces'],
  curious: ['speech:rambling', 'habit:doodles'], observant: ['habit:avoids-eye-contact', 'workstation:focused'], quiet: ['social:loner', 'speech:terse', 'workstation:silent-worker', 'lift:rides-in-silence'], reserved: ['social:loner', 'lift:rides-in-silence', 'lift:stands-at-back'], introverted: ['social:loner', 'habit:avoids-eye-contact', 'lift:stands-at-back'],
  blunt: ['speech:blunt', 'speech:plain-spoken'], gruff: ['speech:blunt', 'social:gruff-heart-of-gold', 'speech:swears-mildly'], stubborn: ['speech:blunt', 'workstation:by-the-book'], cocky: ['workstation:overconfident', 'speech:casual', 'habit:taps-console'], confident: ['workstation:overconfident', 'combat:takes-charge'], reckless: ['combat:reckless'],
  warm: ['voice:timbre:warm', 'social:confidant', 'speech:earnest'], kind: ['speech:earnest', 'social:confidant', 'combat:protective'], gentle: ['voice:volume:soft', 'speech:diplomatic'], caring: ['combat:medic-first', 'social:confidant'], empathetic: ['social:confidant', 'combat:negotiates'], friendly: ['speech:cheerful', 'social:gregarious'], approachable: ['speech:casual', 'social:mentor'], generous: ['social:mentor', 'speech:earnest'], helpful: ['combat:protective', 'social:mentor'],
  calm: ['stress:calm', 'combat:stoic'], relaxed: ['speech:casual', 'stress:calm'], easygoing: ['speech:casual', 'speech:cheerful', 'social:peacemaker'], 'laid-back': ['speech:casual', 'voice:pace:drawling'], protective: ['combat:protective'], cautious: ['combat:cautious'], 'reliable in a crisis': ['stress:calm', 'combat:stoic'], 'reliable in crisis': ['stress:calm', 'combat:stoic'], experienced: ['social:mentor', 'stress:calm'], mentoring: ['social:mentor', 'workstation:mentors-juniors'],
  inventive: ['workstation:improviser', 'combat:improvises-weapon'], improviser: ['workstation:improviser', 'combat:improvises-weapon'], improvises: ['workstation:improviser'], creative: ['workstation:improviser', 'habit:doodles'], resourceful: ['workstation:improviser'], scruffy: ['workstation:cluttered'], tidy: ['workstation:tidy'], 'sanitation-fanatic': ['workstation:tidy', 'workstation:perfectionist'], 'protocol-first': ['workstation:by-the-book', 'social:rule-enforcer', 'speech:formal'],
  eager: ['speech:cheerful', 'social:deferential'], superstitious: ['stress:prays', 'habit:checks-badge'], storyteller: ['speech:rambling', 'speech:verbose'], informal: ['speech:casual'], 'easily distracted': ['workstation:distracted'], 'chatty about plants': ['speech:rambling', 'habit:talks-to-machines'], capable: ['workstation:focused'], skilled: ['workstation:focused'], intuitive: ['workstation:improviser'], visible: ['habit:stands-too-close'], early: ['workstation:by-the-book'], patient: ['stress:calm', 'speech:diplomatic'], competitive: ['social:rival-minded'], 'hands-on': ['habit:pats-equipment', 'workstation:improviser'],
};
const QUIRK_TAGS = [[/\bhum/i, 'habit:hums'], [/whistl/i, 'habit:whistles'], [/drum|tap(s|ping)?\b/i, 'habit:taps-console'], [/mutter|under (her|his|their) breath/i, 'habit:mutters'], [/\bsigh/i, 'habit:sighs'], [/talks? to|pats?\b|strok|names? (the|her|his)/i, 'habit:talks-to-machines'], [/doodl|sketch|draws?\b/i, 'habit:doodles'], [/\bgum\b|chew/i, 'habit:chews-gum'], [/flask/i, 'habit:drinks-from-flask'], [/fidget|click|twirl|spin/i, 'habit:fidgets'], [/clock|watch|time\b/i, 'habit:checks-time'], [/collar|cuff|uniform/i, 'habit:adjusts-collar'], [/badge|pin\b/i, 'habit:checks-badge'], [/knuckle/i, 'habit:cracks-knuckles'], [/neck|shoulder/i, 'habit:rubs-neck'], [/pace|pacing|wander/i, 'habit:paces'], [/clear(s)? (her|his|their) throat|cough/i, 'habit:clears-throat'], [/aloud|out loud|recit|read(s)? .* checklist/i, 'speech:counts-aloud'], [/narrat|commentary|running commentary/i, 'speech:narrates-actions'], [/re-?check|notebook|logs?\b/i, 'workstation:checks-twice'], [/pray|charm|lucky|ritual/i, 'stress:prays'], [/lean/i, 'habit:leans-on-walls'], [/arms/i, 'habit:crosses-arms'], [/joke|pun\b|laugh/i, 'social:joker'], [/gossip|rumou?r/i, 'social:gossip'], [/snack|biscuit|cake|tea\b|coffee/i, 'stress:comfort-eats']];

// ---- generation weights by department / billet (1 = neutral, bigger = likelier) ----
const W = (o) => o;
const DEPT_BIAS = {
  command: W({ pace: ['measured', 5, 'clipped', 1.5, 'drawling', 1], volume: ['projected', 4, 'soft', 1.2, 'booming', 1], timbre: ['resonant', 4, 'warm', 3, 'crisp', 2, 'smoky', 1.5], tags: ['speech:formal', 4, 'speech:diplomatic', 3, 'speech:precise', 2.5, 'speech:plain-spoken', 2, 'speech:ritual-courtesy', 2.5, 'speech:earnest', 2, 'habit:parade-rest', 3, 'habit:checks-time', 2, 'habit:adjusts-collar', 2.5, 'habit:clears-throat', 2, 'combat:takes-charge', 4, 'combat:tactical', 3, 'combat:stoic', 3, 'combat:calls-it-in', 2, 'workstation:by-the-book', 2, 'workstation:focused', 2, 'social:commanding', 4, 'social:mentor', 2, 'social:rule-enforcer', 1.5, 'stress:calm', 4, 'stress:overworks', 2, 'lift:full-sentence', 2.5, 'lift:says-please', 2, 'lift:says-deck-number', 2, 'lift:stands-at-back', 1.5] }),
  flight: W({ pace: ['clipped', 4, 'rapid', 3, 'measured', 1.5], volume: ['projected', 2, 'soft', 1], timbre: ['crisp', 4, 'bright', 3, 'warm', 1.5], tags: ['speech:terse', 3, 'speech:jargon-heavy', 3.5, 'speech:casual', 2.5, 'speech:cheerful', 2, 'speech:sarcastic', 2, 'speech:precise', 2, 'habit:taps-console', 4, 'habit:whistles', 2.5, 'habit:hums', 2, 'habit:cracks-knuckles', 2, 'combat:reckless', 1.5, 'combat:tactical', 2.5, 'combat:calls-it-in', 2.5, 'workstation:focused', 3, 'workstation:multitasker', 3, 'workstation:overconfident', 2, 'social:rival-minded', 2.5, 'social:joker', 2, 'stress:calm', 3, 'stress:black-humor', 2, 'lift:one-word', 2.5, 'lift:names-place', 2] }),
  operations: W({ pace: ['rapid', 4, 'clipped', 3, 'halting', 1.2], volume: ['soft', 2, 'projected', 2], timbre: ['crisp', 3, 'nasal', 2.5, 'bright', 2.5, 'thin', 2], tags: ['speech:jargon-heavy', 4, 'speech:precise', 3, 'speech:hedging', 2, 'speech:casual', 2, 'speech:rambling', 1.5, 'habit:taps-console', 3, 'habit:fidgets', 3, 'habit:talks-to-machines', 3, 'habit:checks-time', 2.5, 'workstation:multitasker', 3, 'workstation:meticulous', 2.5, 'workstation:checks-twice', 2.5, 'workstation:anxious-about-faults', 2, 'combat:calls-it-in', 3, 'combat:cautious', 2, 'social:gossip', 2, 'stress:chatters', 2, 'stress:overworks', 2.5, 'lift:names-place', 2] }),
  engineering: W({ pace: ['drawling', 2.5, 'clipped', 2, 'measured', 2, 'halting', 1.5], volume: ['booming', 3, 'projected', 3, 'murmur', 1], timbre: ['gravelly', 5, 'smoky', 3, 'nasal', 2, 'resonant', 2], tags: ['speech:blunt', 4, 'speech:plain-spoken', 3.5, 'speech:swears-mildly', 3.5, 'speech:jargon-heavy', 3, 'speech:gallows-humor', 3, 'speech:sarcastic', 2, 'speech:terse', 2, 'habit:pats-equipment', 4, 'habit:talks-to-machines', 4, 'habit:mutters', 3, 'habit:rubs-neck', 2.5, 'habit:cracks-knuckles', 2.5, 'habit:leans-on-walls', 2, 'combat:improvises-weapon', 3, 'combat:aggressive', 1.8, 'workstation:improviser', 4, 'workstation:corner-cutter', 2, 'workstation:cluttered', 2.5, 'workstation:proud-of-station', 3, 'social:gruff-heart-of-gold', 3, 'stress:snappy', 2.5, 'stress:short-tempered', 2.5, 'stress:black-humor', 2.5, 'lift:one-word', 2.5, 'lift:mumbles', 2, 'lift:rides-in-silence', 2] }),
  security: W({ pace: ['clipped', 5, 'measured', 2], volume: ['projected', 3, 'booming', 2, 'soft', 1], timbre: ['gravelly', 3, 'crisp', 3, 'resonant', 2, 'smoky', 2], tags: ['speech:terse', 5, 'speech:blunt', 3.5, 'speech:deadpan', 3.5, 'speech:formal', 2.5, 'speech:ritual-courtesy', 3, 'speech:plain-spoken', 2, 'habit:crosses-arms', 4, 'habit:parade-rest', 3.5, 'habit:leans-on-walls', 2.5, 'habit:checks-badge', 3, 'habit:stands-too-close', 1.8, 'combat:aggressive', 3, 'combat:protective', 4, 'combat:tactical', 3.5, 'combat:stoic', 3, 'combat:calls-it-in', 2.5, 'workstation:by-the-book', 3, 'workstation:focused', 2.5, 'social:rule-enforcer', 4, 'social:loner', 2, 'stress:calm', 3, 'stress:short-tempered', 2, 'lift:one-word', 4, 'lift:stands-at-back', 3, 'lift:rides-in-silence', 3, 'lift:holds-door', 1.5] }),
  sciences: W({ pace: ['rapid', 2.5, 'halting', 2.5, 'measured', 2, 'clipped', 1.5], volume: ['soft', 3, 'murmur', 1.5, 'projected', 1], timbre: ['thin', 2.5, 'bright', 2.5, 'nasal', 2.5, 'crisp', 2, 'warm', 1.5], tags: ['speech:precise', 4, 'speech:rambling', 3, 'speech:verbose', 3, 'speech:jargon-heavy', 3, 'speech:hedging', 3, 'speech:self-corrects', 3, 'speech:earnest', 2, 'speech:trails-off', 2.5, 'habit:doodles', 3.5, 'habit:fidgets', 3, 'habit:mutters', 3, 'habit:adjusts-collar', 2, 'habit:avoids-eye-contact', 2.5, 'combat:cautious', 3, 'combat:hides', 2, 'combat:freezes', 1.5, 'workstation:meticulous', 4, 'workstation:perfectionist', 3, 'workstation:distracted', 2.5, 'workstation:checks-twice', 3, 'social:loner', 2.5, 'social:mentor', 1.8, 'stress:withdrawn', 2.5, 'stress:denial', 2, 'lift:rides-in-silence', 3, 'lift:mumbles', 2.5, 'lift:over-enunciates', 2] }),
  medical: W({ pace: ['measured', 4, 'drawling', 1.5, 'halting', 1.2], volume: ['soft', 5, 'murmur', 2.5, 'projected', 1.5], timbre: ['warm', 5, 'breathy', 4, 'resonant', 2, 'bright', 1.5], tags: ['speech:earnest', 4, 'speech:diplomatic', 4, 'speech:cheerful', 2.5, 'speech:plain-spoken', 2, 'speech:formal', 1.8, 'habit:sighs', 3, 'habit:rubs-neck', 3, 'habit:checks-time', 2, 'habit:hums', 2.5, 'combat:medic-first', 5, 'combat:protective', 4, 'combat:negotiates', 2.5, 'combat:stoic', 2, 'workstation:meticulous', 3, 'workstation:tidy', 3, 'workstation:checks-twice', 3, 'workstation:mentors-juniors', 2.5, 'social:confidant', 4, 'social:mentor', 3, 'social:peacemaker', 3, 'stress:calm', 4, 'stress:comfort-eats', 2.5, 'stress:overworks', 3, 'lift:says-please', 3, 'lift:says-thanks', 3.5, 'lift:holds-door', 3, 'lift:small-talk', 2] }),
  services: W({ pace: ['drawling', 3, 'rapid', 3, 'measured', 1.5], volume: ['booming', 2, 'projected', 2, 'soft', 1.5], timbre: ['warm', 3, 'nasal', 2.5, 'bright', 2.5, 'smoky', 2, 'gravelly', 1.5], tags: ['speech:casual', 5, 'speech:cheerful', 3.5, 'speech:rambling', 3, 'speech:verbose', 2.5, 'speech:nervous-laugh', 2, 'speech:swears-mildly', 2, 'speech:narrates-actions', 2.5, 'habit:hums', 4, 'habit:whistles', 3.5, 'habit:chews-gum', 3, 'habit:leans-on-walls', 3, 'habit:drinks-from-flask', 1.8, 'habit:stands-too-close', 2, 'combat:flees-to-cover', 2.5, 'combat:hides', 2.5, 'combat:improvises-weapon', 2, 'combat:panics', 1.5, 'workstation:chatty-at-work', 4, 'workstation:cluttered', 2.5, 'workstation:proud-of-station', 2.5, 'social:gregarious', 4, 'social:gossip', 3.5, 'social:joker', 3, 'social:cliquey', 2, 'social:homesick', 2, 'stress:chatters', 3, 'stress:comfort-eats', 3.5, 'stress:black-humor', 2, 'lift:small-talk', 4, 'lift:names-place', 3, 'lift:hums-in-lift', 3] }),
};
// a few billets lean their own way on top of the department
const BILLET_BIAS = {
  co: ['voice:timbre:resonant', 3, 'voice:volume:projected', 2, 'combat:takes-charge', 2, 'lift:full-sentence', 2], xo: ['speech:formal', 2, 'social:rule-enforcer', 2.5, 'workstation:by-the-book', 2], yeoman: ['speech:ritual-courtesy', 3, 'social:deferential', 4, 'speech:formal', 2, 'habit:checks-time', 2],
  ce: ['voice:timbre:gravelly', 3, 'speech:swears-mildly', 2, 'habit:talks-to-machines', 2], cmo: ['voice:timbre:warm', 2, 'social:mentor', 2], counsel: ['voice:volume:soft', 3, 'social:confidant', 4, 'speech:diplomatic', 3], cook: ['speech:cheerful', 2, 'habit:hums', 2, 'social:gregarious', 2], galley: ['habit:hums', 2, 'speech:casual', 2],
  helm: ['voice:timbre:crisp', 2, 'habit:taps-console', 2], guard: ['lift:one-word', 2, 'habit:parade-rest', 2], sec: ['social:rule-enforcer', 2, 'speech:terse', 2], doc: ['speech:precise', 2, 'combat:medic-first', 2], nurse: ['voice:timbre:warm', 2, 'speech:cheerful', 1.5],
};
const BODY = { crew_m: { pitch: 0.86, formant: 0.96, rate: 1.0, pl: [3, 3, 0.7], rough: 0.08 }, crew_heavy: { pitch: 0.7, formant: 0.86, rate: 0.92, pl: [6, 3, 0.3], rough: 0.16 }, crew_f: { pitch: 1.28, formant: 1.1, rate: 1.04, pl: [0.5, 3, 3], rough: 0.04 }, crew_f2: { pitch: 1.45, formant: 1.16, rate: 1.1, pl: [0.2, 1.5, 5], rough: 0.02 } };   // pl = weights for pitch low/mid/high
const SIZE = { crew_m: 0.65, crew_heavy: 1, crew_f: 0.32, crew_f2: 0.1 };
export const ACCENT_W = { flat: 6, lilt: 1.5, clipped: 1.5, drawl: 1.5, 'sing-song': 1, northern: 2, maritime: 2, prairie: 2 };

function seeded(a) { a >>>= 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const wpick = (rnd, items) => { let t = 0; for (const [, w] of items) t += w; let r = rnd() * t; for (const [v, w] of items) { r -= w; if (r <= 0) return v; } return items[items.length - 1][0]; };
const pairsOf = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const tagSet = (p) => p._tagSet && p._tagSet.src === p.tags ? p._tagSet.set : (Object.defineProperty(p, '_tagSet', { value: { src: p.tags, set: new Set(p.tags || []) }, enumerable: false, configurable: true }), p._tagSet.set);

// ---- the generator ----
export function voiceSig(v, tags) { return [v.pitch, v.rate, v.volume, v.formant, v.breath, v.rough, v.vibrato].map(x => x.toFixed(2)).join(',') + ',' + v.accent + '|' + [...tags].sort().join(','); }
export function makeVoice(person, rnd, used = null) {
  rnd = rnd || seeded(strHash((person.family || '') + (person.given || '')) ^ ((person.id || 0) * 7919));
  for (let attempt = 0; attempt < 40; attempt++) { const r = gen(person, rnd); if (!used || !used.has(voiceSig(r.voice, r.tags))) { used?.add(voiceSig(r.voice, r.tags)); return r; } }
  const r = gen(person, rnd); r.voice.pitch = clamp(r.voice.pitch + (used?.size || 1) * 0.0013, 0.5, 1.8); r.voice.hash = (r.voice.hash + (used?.size || 1)) >>> 0; used?.add(voiceSig(r.voice, r.tags)); return r;   // last resort: nudge the pitch a hair
}
function gen(p, rnd) {
  const body = BODY[p.body] || BODY.crew_m, dept = DEPT_BIAS[p.dept] || DEPT_BIAS.services, rank = p.rank ?? 1, bb = pairsOf(BILLET_BIAS[p.billet] || []);
  const tags = [], has = (t) => tags.includes(t), ok = (t) => !has(t) && !(CONFLICTS[t] || []).some(c => has(c)) && (!t.startsWith('voice:timbre:') || tags.filter(x => x.startsWith('voice:timbre:')).length < MAX_TIMBRE);
  const add = (t) => { if (ok(t)) { tags.push(t); return true; } return false; };
  const bias = Object.fromEntries([...pairsOf(dept.tags), ...bb].map(([t, w]) => [t, w])), bw = (t) => (bias[t] || 1);
  // persona: one of the billet's three, by seed; its traits and quirk become tags
  const list = PERSONAS?.[p.billet], persona = list?.length ? list[Math.floor(rnd() * list.length)] : null;
  if (persona) {
    for (const tr of persona.traits) { const c = (TRAIT_TAGS[tr.toLowerCase()] || []).filter(ok); if (c.length) add(wpick(rnd, c.map(t => [t, bw(t)]))); }
    for (const [re, t] of QUIRK_TAGS) if (re.test(persona.quirk) && tags.length < 7) { if (add(t)) break; }
  }
  // voice: size drives pitch, job and rank drive pace and volume, jitter drives the rest
  const vcount = () => tags.filter(t => t.startsWith('voice:')).length;
  if (!tags.some(t => t.startsWith('voice:pitch:'))) add('voice:pitch:' + wpick(rnd, ['low', 'mid', 'high'].map((v, i) => [v, body.pl[i]])));
  if (!tags.some(t => t.startsWith('voice:timbre:'))) { const n = rnd() < 0.3 ? 2 : 1; for (let i = 0; i < n; i++) { const c = VT.timbre.filter(v => ok('voice:timbre:' + v)).map(v => [v, (pairsOf(dept.timbre).find(x => x[0] === v)?.[1] || 1) * (bias['voice:timbre:' + v] || 1)]); if (c.length) add('voice:timbre:' + wpick(rnd, c)); } }
  if (!tags.some(t => t.startsWith('voice:pace:')) && rnd() < 0.7) { const c = VT.pace.filter(v => ok('voice:pace:' + v)).map(v => [v, (pairsOf(dept.pace).find(x => x[0] === v)?.[1] || 0.6) * (rank >= 4 && (v === 'measured' || v === 'drawling') ? 1.8 : 1) * (rank <= 1 && (v === 'rapid' || v === 'clipped') ? 1.6 : 1) * (bias['voice:pace:' + v] || 1)]); if (c.length) add('voice:pace:' + wpick(rnd, c)); }
  if (!tags.some(t => t.startsWith('voice:volume:')) && rnd() < 0.6) { const c = VT.volume.filter(v => ok('voice:volume:' + v)).map(v => [v, (pairsOf(dept.volume).find(x => x[0] === v)?.[1] || 0.6) * (rank >= 5 && v === 'projected' ? 1.8 : 1) * (rank === 0 && (v === 'soft' || v === 'murmur') ? 1.5 : 1) * (bias['voice:volume:' + v] || 1)]); if (c.length) add('voice:volume:' + wpick(rnd, c)); }
  if (!tags.some(t => t.startsWith('voice:accent:')) && rnd() < 0.5) add('voice:accent:' + wpick(rnd, Object.entries(ACCENT_W)));
  // other categories: at least one each, then extras by weight
  const want = { speech: 2 + (rnd() < 0.4), habit: 1 + (rnd() < 0.5), combat: 1, workstation: 1 + (rnd() < 0.4), social: 1, stress: 1, lift: 1 + (rnd() < 0.55) + (rnd() < 0.2) };
  for (const cat of CATEGORIES.slice(1)) {
    let guard = 0; while (tags.filter(t => catOf(t) === cat).length < want[cat] && guard++ < 30) {
      const c = TAGS[cat].map(v => cat + ':' + v).filter(ok).map(t => [t, bw(t) * liftBias(t, tags, rank)]); if (!c.length) break; add(wpick(rnd, c));
    }
  }
  // trim to the cap, never dropping a category's last tag; persona tags (added first) survive longest
  const cnt = (cat) => tags.filter(t => catOf(t) === cat).length;
  while (tags.length > MAX_TAGS) { let i = tags.length - 1; while (i >= 0 && cnt(catOf(tags[i])) <= 1) i--; if (i < 0) break; tags.splice(i, 1); }
  for (let g = 0; tags.length < MIN_TAGS && g < 30; g++) { const cat = CATEGORIES[1 + Math.floor(rnd() * 7)]; const c = TAGS[cat].map(v => cat + ':' + v).filter(ok).map(t => [t, bw(t)]); if (c.length) add(wpick(rnd, c)); }
  // voice parameters = body base, then every voice tag's delivery, rank and jitter
  const v = { pitch: body.pitch, rate: body.rate, volume: 0.82, formant: body.formant, breath: 0.1, rough: body.rough, vibrato: 0.1, accent: 'flat', size: SIZE[p.body] ?? 0.5, hash: Math.floor(rnd() * 2147483647) };
  for (const t of tags) { const e = TAG_EFFECTS[t]; if (e?.accent) v.accent = e.accent; const d = e?.deliver; if (!d) continue; for (const k in d.mul) v[k] *= d.mul[k]; for (const k in d.add) v[k] += d.add[k]; }
  v.rate *= 1 - rank * 0.025 + (rnd() - 0.5) * 0.12; v.pitch *= 1 + (rnd() - 0.5) * 0.16; v.formant *= 1 + (rnd() - 0.5) * 0.06; v.volume *= 1 + (rnd() - 0.5) * 0.12; v.breath += rnd() * 0.08; v.rough += rnd() * 0.06; v.vibrato += rnd() * 0.1;
  v.pitch = clamp(v.pitch, 0.5, 1.8); v.rate = clamp(v.rate, 0.7, 1.5); v.volume = clamp(v.volume, 0.5, 1); v.formant = clamp(v.formant, 0.8, 1.25); v.breath = clamp(v.breath, 0, 1); v.rough = clamp(v.rough, 0, 1); v.vibrato = clamp(v.vibrato, 0, 1);
  for (const k of ['pitch', 'rate', 'volume', 'formant', 'breath', 'rough', 'vibrato']) v[k] = Math.round(v[k] * 1000) / 1000;
  return { voice: v, tags, persona: persona ? { id: persona.id, traits: persona.traits, quirk: persona.quirk } : null };
}
// lift tags follow the speech tags: terse people say one word, formal ones whole sentences
function liftBias(t, tags, rank) {
  if (!t.startsWith('lift:')) return 1; const s = (x) => tags.includes(x);
  if (t === 'lift:one-word') return s('speech:terse') ? 6 : s('speech:blunt') ? 2.5 : 1;
  if (t === 'lift:full-sentence') return s('speech:formal') || s('speech:verbose') || s('speech:diplomatic') ? 5 : 1;
  if (t === 'lift:names-place') return s('speech:casual') ? 3 : 1; if (t === 'lift:says-please') return s('speech:formal') || s('speech:diplomatic') || s('speech:ritual-courtesy') ? 3 : 1;
  if (t === 'lift:small-talk') return s('social:gregarious') || s('speech:rambling') ? 3 : 1; if (t === 'lift:rides-in-silence') return s('social:loner') || s('speech:terse') ? 3 : 1; if (t === 'lift:hums-in-lift') return s('habit:hums') ? 5 : 1;
  if (t === 'lift:mumbles') return s('voice:volume:murmur') || s('voice:volume:soft') ? 3 : 1; if (t === 'lift:over-enunciates') return s('speech:precise') || s('speech:formal') ? 3 : 1;
  return 1;
}
export const weightsOf = (p) => { const w = {}; for (const t of p.tags || []) { const e = TAG_EFFECTS[t]; if (e?.kind === 'weight') for (const k in e.w) w[k] = (w[k] || 0) + e.w[k]; } return w; };
export const habitCues = (p) => (p.tags || []).map(t => TAG_EFFECTS[t]).filter(e => e?.kind === 'anim');
export const tagGroups = (p) => { const g = {}; for (const t of p.tags || []) (g[catOf(t)] ||= []).push(t.slice(catOf(t).length + 1)); return g; };

// ---- lines ----
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
export const numWord = (n) => NUM[n] ?? String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ROOM_PREF = { engineering: ['engineering', 'cargo', 'stores'], medical: ['sickbay'], command: ['bridge', 'ready room'], flight: ['bridge', 'shuttlebay'], operations: ['transporter', 'datacore'], security: ['armory', 'brig'], sciences: ['lab', 'arboretum', 'datacore'], services: ['galley', 'lounge', 'gym', 'holodeck', 'stores'] };
export function pickPlace(p, dest) {
  const rooms = dest.rooms || [], pref = ROOM_PREF[p.dept] || [];
  const hit = rooms.find(r => pref.includes(r.toLowerCase())); return hit || rooms[0] || dest.zone || '';
}
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const stripEnd = (s) => s.replace(/[.!?…]+$/, '').trim();
const pickFrom = (rnd, a) => a[Math.floor(rnd() * a.length)];
// speech-tag colouring for any line; ctx: { rank (addressee's rank), stress, kind, rnd }
export function shapeLine(p, text, ctx = {}) {
  const T = tagSet(p), rnd = ctx.rnd || seeded((p.voice?.hash || 1) ^ strHash(text)); let s = stripEnd(text), end = '.', pre = null, post = null, sir = false;
  const act = TAGS.speech.map(v => 'speech:' + v).filter(t => T.has(t));
  for (const t of act) {
    const e = TAG_EFFECTS[t]; if (e.stressOnly && !ctx.stress) continue;
    if (e.pre && !pre && (ctx.kind === 'lift' || t !== 'speech:narrates-actions')) pre = pickFrom(rnd, e.pre); if (e.post && !post && !/[.!?]/.test(s) && rnd() < 0.7) post = pickFrom(rnd, e.post); if (e.end) end = e.end; if (e.sir) sir = true;
    if (e.fn === 'terse') s = s.replace(/,? please$/i, '').replace(/\bthe /gi, '').replace(/^(Uh|Um|Yeah|Okay),?\s*/i, '');
    else if (e.fn === 'formal') { if (ctx.kind === 'lift' && !/please/i.test(s)) s += ', please'; s = s.replace(/^(Uh|Um|Yeah|Okay),?\s*/i, ''); }
    else if (e.fn === 'plain') s = s.replace(/^(I think|Um, I think|If it is no trouble,|When convenient,)\s*/i, '');
    else if (e.fn === 'blunt') { s = s.replace(/,? please$/i, '').replace(/^(If it is no trouble,|When convenient,|I think)\s*/i, ''); post = null; }
    else if (e.fn === 'precise' && ctx.kind === 'lift' && ctx.zone && !new RegExp(ctx.zone, 'i').test(s)) s += `, ${ctx.zone.toLowerCase()} section`;
    else if (e.fn === 'count' && ctx.kind === 'lift' && ctx.n >= 1 && ctx.n <= 5) s = Array.from({ length: ctx.n }, (_, i) => cap(numWord(i + 1))).join(', ') + '. ' + cap(s);
    else if (e.fn === 'selfcorrect') { const dk = ctx.n && `deck ${numWord(ctx.n)}`; s = dk && s.includes(dk) ? s.replace(dk, `deck ${numWord(ctx.n === 1 ? 2 : ctx.n - 1)}— no, ${numWord(ctx.n)}`) : 'No, wait — ' + lc(s); }
    else if (e.fn === 'stammer') s = s.replace(/^(\w)(\w*)/, (m, a, b) => `${a}-${a}${b}`);
  }
  if (pre) s = pre + ' ' + lc(s);
  if (post) s += post;
  if (sir && ctx.rank !== undefined && ctx.rank > p.rank) s += (p.body === 'crew_f' || p.body === 'crew_f2') || p.id % 2 ? ", ma'am" : ', sir';
  return cap(s) + (/[.!?…]$/.test(s) ? '' : end);
}
// destination line for the turbolift. dest = { deckNo, zone, rooms: [labels] }
export function liftLine(p, dest, ctx = {}) {
  const T = tagSet(p), n = dest.deckNo, nw = numWord(n), place = pickPlace(p, dest), pl = lc(place), rnd = seeded((p.voice?.hash || 1) ^ Math.imul(n + 1, 2654435761));
  const deck = `deck ${nw}`, sayDeck = T.has('lift:says-deck-number'), sayPlace = T.has('lift:names-place') && place, formal = T.has('speech:formal') || T.has('speech:ritual-courtesy') || T.has('speech:diplomatic');
  let s;
  if (T.has('lift:one-word')) s = sayDeck && !sayPlace ? nw : (place || deck);
  else if (T.has('lift:full-sentence')) s = place ? `${deck}, the ${pl}` : deck;
  else if (sayDeck && sayPlace) s = `${deck}, ${pl}`;
  else if (sayPlace) s = pl;
  else if (sayDeck) s = deck;
  else s = T.has('speech:terse') && place ? pl : place ? `${deck}, ${pl}` : deck;
  if (T.has('lift:full-sentence') && (T.has('speech:verbose') || T.has('speech:rambling')) && place) s = `take me to ${deck}, the ${pl}`;
  if (T.has('lift:says-please') || (T.has('lift:full-sentence') && formal)) s += ', please';
  if (T.has('lift:over-enunciates')) s = s.split(/[\s,]+/).join(', ');
  s = shapeLine(p, s, { ...ctx, kind: 'lift', n, zone: dest.zone, rnd });
  return T.has('lift:mumbles') ? '…' + s.slice(1).replace(/^./, c => c.toLowerCase()) : s;   // swallow the first sound: "…ngineering."
}
// ---- barks ----
export const BARK_POOLS = {
  idle: ['Quiet shift.', 'Coffee is cold again.', 'Anyone seen my stylus?', 'Hum of the ship. Peaceful.'],
  working: ['One moment.', 'Rerouting the feed.', 'Log it, then fix it.', 'Almost there.'],
  greeting: ['Morning.', 'Hello.', 'How can I help?', 'Afternoon.'],
  tired: ['Is it end of shift yet?', 'I could sleep standing up.'], hungry: ['What is for supper?', 'The galley should be open.'], stressed: ['This is not good.', 'Hold on.'], alert: ['Alert status. Positions.', 'All hands, stand by.'],
  smalltalk: ['Long shift?', 'Quiet today.', 'Lift is slow today.'], correct: ['Actually, that is the long way.'],
};
export function bark(p, pool = 'idle', rnd = null) {
  rnd = rnd || seeded((p.voice?.hash || 1) ^ strHash(pool) ^ ((Date.now() / 1000) | 0));
  const own = (p.tags || []).map(t => TAG_EFFECTS[t]).filter(e => e?.kind === 'bark' && e.pool === pool).flatMap(e => e.lines);
  const base = pool === 'stressed' && own.length && rnd() < 0.8 ? pickFrom(rnd, own) : own.length && rnd() < 0.35 ? pickFrom(rnd, own) : pickFrom(rnd, BARK_POOLS[pool] || BARK_POOLS.idle);
  if (/^(…|\(says)/.test(base)) return base;
  return shapeLine(p, base, { stress: pool === 'stressed' || pool === 'alert', rnd, kind: 'bark' });
}
// the cue a person gives while riding (hum, whistle, sigh...) or null
export const habitCue = (p, rnd = Math.random) => { const c = habitCues(p).filter(e => e.sound); return c.length ? c[Math.floor(rnd() * c.length)] : null; };

// ---- UI ----
export function describeVoice(p) {
  const v = p.voice; if (!v) return 'no voice'; const hz = Math.round(120 * v.pitch);
  const reg = v.pitch < 0.8 ? 'bass' : v.pitch < 1.05 ? 'baritone' : v.pitch < 1.35 ? 'alto' : 'soprano', pace = v.rate < 0.9 ? 'slow' : v.rate > 1.15 ? 'fast' : 'even';
  const tex = [v.rough > 0.4 ? 'gravelly' : v.rough > 0.25 ? 'rough' : '', v.breath > 0.4 ? 'breathy' : '', v.vibrato > 0.35 ? 'warbling' : ''].filter(Boolean);
  const g = tagGroups(p), hl = [...(g.speech || []).slice(0, 2), ...(g.habit || []).slice(0, 1)];
  return `${cap(reg)} ~${hz} Hz, ${pace}${tex.length ? ', ' + tex.join(', ') : ''}, ${v.accent} accent${hl.length ? ' — ' + hl.join(', ') : ''}`;
}
