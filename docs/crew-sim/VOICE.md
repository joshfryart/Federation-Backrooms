# Crew voices and mannerism tags

Every crew member gets a **voice profile** and a set of **tags**, generated deterministically from the ship seed and
their roster entry (`makeComplement` in `js/crew.js`; generator in `js/voice.js`). The same tags are what the NPC sim
(`js/sim.js`, later) and bark selection read, so a tag has to *mean something in play*, not just flavour text.

## Inputs
- **Size**: `p.body` (`crew_m`, `crew_f`, `crew_f2`, `crew_heavy`) plus a per-person jitter. Bigger body → lower pitch,
  more chest resonance, slower; smaller → higher, quicker. `heavy` and `m` skew low, `f2` skews highest.
- **Job**: department and billet (command measured and projected; flight crisp; ops rapid and jargon-heavy;
  engineering gruff; security clipped; sciences precise and tangential; medical soft and warm; services chatty
  and informal).
- **Rank**: higher rank → slower, more deliberate, fewer filler words; lower rank → quicker, more deferential.
- **Persona**: each billet profile in `docs/crew-sim/<billet>.json` has 3 `personas` (traits + quirk). A person picks
  one by seed and inherits its `traits` as tags.
- **Seed jitter**: so two Helm Officers of the same build still differ.

## Voice profile (data)
```
voice: { pitch, rate, volume, formant, breath, rough, vibrato, accent, size, hash }
```
- `pitch` 0.5–1.8 (speech synthesis pitch; multiply with a per-voice base), `rate` 0.7–1.5, `volume` 0.5–1.
- `formant` 0.8–1.25 vocal-tract scale (body size), `breath` 0–1, `rough` 0–1 (gravel), `vibrato` 0–1.
- `accent`: a short label (`flat`, `lilt`, `clipped`, `drawl`, `sing-song`, `northern`, `maritime`, `prairie`, ...) used as
  a hint for voice selection and phrasing; it does not need to be a real dialect.
- `hash`: stable integer used to pick one of the OS speech voices deterministically.

## Tag syntax
Tags are `category:value` strings. A person has roughly 8–14 tags: always at least one `voice:`, `speech:`, `habit:`,
`combat:`, `workstation:`, `social:`, `stress:` and `lift:`. Values within a category may combine (up to 2).

### voice (how it sounds)
`pitch:low|mid|high`, `timbre:gravelly|breathy|nasal|resonant|bright|smoky|warm|thin|crisp`,
`pace:clipped|measured|rapid|drawling|halting`, `volume:soft|projected|booming|murmur`, `accent:<label>`

### speech (what they do with words)
`terse`, `verbose`, `formal`, `casual`, `jargon-heavy`, `plain-spoken`, `hedging`, `blunt`, `diplomatic`, `rambling`,
`precise`, `sarcastic`, `earnest`, `deadpan`, `cheerful`, `gallows-humor`, `ritual-courtesy` (sir/ma'am), `swears-mildly`,
`counts-aloud`, `narrates-actions`, `self-corrects`, `trails-off`, `stammers-under-stress`, `nervous-laugh`

### habit (mannerisms you can see or hear)
`hums`, `whistles`, `taps-console`, `fidgets`, `clears-throat`, `sighs`, `mutters`, `cracks-knuckles`, `rubs-neck`,
`adjusts-collar`, `parade-rest`, `leans-on-walls`, `paces`, `checks-badge`, `checks-time`, `drinks-from-flask`,
`chews-gum`, `doodles`, `talks-to-machines`, `pats-equipment`, `crosses-arms`, `stands-too-close`, `avoids-eye-contact`

### combat (reactions to danger / force)
`aggressive`, `cautious`, `protective`, `tactical`, `reckless`, `freezes`, `panics`, `flees-to-cover`,
`medic-first`, `defers-to-rank`, `takes-charge`, `negotiates`, `hides`, `improvises-weapon`, `calls-it-in`, `stoic`

### workstation (how they do the job)
`focused`, `distracted`, `meticulous`, `improviser`, `by-the-book`, `corner-cutter`, `perfectionist`, `multitasker`,
`chatty-at-work`, `silent-worker`, `proud-of-station`, `resents-station`, `tidy`, `cluttered`, `checks-twice`,
`overconfident`, `anxious-about-faults`, `mentors-juniors`

### social (relationships)
`gregarious`, `loner`, `gossip`, `mentor`, `rule-enforcer`, `joker`, `deferential`, `commanding`, `peacemaker`,
`rival-minded`, `confidant`, `flirty`, `gruff-heart-of-gold`, `homesick`, `cliquey`

### stress (what pressure does)
`calm`, `brittle`, `snappy`, `withdrawn`, `overworks`, `denial`, `comfort-eats`, `prays`, `black-humor`, `chatters`,
`goes-silent`, `short-tempered`

### lift (how they behave in a turbolift)
`says-deck-number`, `names-place`, `full-sentence`, `one-word`, `over-enunciates`, `mumbles`, `says-please`,
`says-thanks`, `small-talk`, `rides-in-silence`, `hums-in-lift`, `checks-reflection`, `stands-at-back`,
`holds-door`, `presses-twice`, `corrects-others`

## Rules that keep it varied
1. No two people on a ship share an identical (voice + tag set); regenerate on collision.
2. Tags must be *consistent* (no `pace:rapid` with `speech:halting`; no `volume:booming` with `volume:murmur`). The
   generator holds a conflict table.
3. Job shapes weights, not outcomes: a Chief Engineer is probably `timbre:gravelly` but 1 in 8 isn't.
4. Every tag has an **in-game hook** listed in `js/voice.js` `TAG_EFFECTS` (a speech-line modifier, an animation hint,
   a bark pool, or an NPC-behaviour weight). A tag with no hook is not allowed to ship.

## Lift speech
When anyone selects a destination in the turbolift they **say** it. The line is built from the destination
(deck number, zone label, a notable room) and shaped by their tags and voice, e.g.
`terse` + `one-word` → "Bridge." · `formal` + `full-sentence` → "Deck one, the bridge, please." ·
`casual` + `names-place` → "Uh, engineering." · `mumbles` → "…ngineering." · `says-please` adds "please".
Players speak with *their billet's own voice*. NPC riders announce their own destination when they board. A
subtitle line shows `Name: "line"` in the speaker's division colour.

## Output modes (player setting, default **Babble**)
1. **Speech synthesis**: the browser's `speechSynthesis`, picking an OS voice by `hash` and gender hint, with
   `pitch`/`rate`/`volume` from the profile. Quality varies by machine, so it must degrade gracefully.
2. **Babble**: a procedural WebAudio voice (formant syllables) driven by the same profile, so every machine hears
   the same distinct voices and the lift line is audible without any OS voices.
3. **Subtitles only.**
