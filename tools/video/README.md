# Shanty video: the whole crew of one ship sings

Owner request: *"Create a video using all the npcs of one ship singing a sea shanty. Cover the whole ship."*

Result: `docs/video/shanty.mp4` (+ poster `docs/video/shanty-poster.jpg`). The USF Québec (Cairn class, ship index 1,
run seed 1), all 91 crew, 9 decks, singing *What Shall We Do with the Drunken Sailor* (traditional, public domain) with
ship verses, while the camera rides the turbolift from the bridge down to engineering.

Nothing here is loaded by the game. `stage.js` is injected into the page by the renderer only, and drives the game through
`window.__game` on the test clock (`G.manual`), so normal play is unchanged.

## Files

| file | what |
|---|---|
| `song.mjs` | the arrangement: tempo (132 bpm), melody templates (D dorian), lyrics with syllable timing, chords, who sings each line. Writes `out/song.json`. |
| `choir.js` | the audio, rendered in the game page by the GAME's audio engine on an OfflineAudioContext: every crew member sings with their own voice through `sing()` in `js/speech.js` (the babble voice held on melody notes: their `js/voice.js` pitch register, formant, vibrato, breath, roughness, volume), the verse calls by each deck's senior officer, the deck on screen forward in the mix and the rest of the ship behind it in the choruses, low male voices on the chord roots; stomps (`thud`), claps (`noise`) and a squeezebox (`tone`) from `js/audio.js` `Sound.offline()` with the game's reverb bus. Writes `out/shanty.wav`. |
| `stage.js` | in-page stage: casting (everyone gets a deck + room), deck builds (`loadDeck`, then the deck's crew placed in their rooms), singing poses (beat-locked sway / nods / claps / mug raises / stomps through `js/movement.js` `toBones`, jaw from the sung syllable, eye contact), camera paths kept inside the room walls, LCARS overlays (title / end card, karaoke bar, deck N of M, turbolift counter, name cards, name tags), coverage per frame. |
| `shots.mjs` | the shot list, cut on bar lines: per deck lift arrival, the lead's call in close-up (verses), wide shots of the deck's busiest rooms, a named close-up, lift departure. |
| `render.mjs` | Playwright driver: `cast`, `stills`, `frames` (parallel workers, resumable), `mux` (ffmpeg H.264 + AAC, loudnorm, coverage report). |
| `probe.mjs` | exploration helper: ships, crew, rooms per deck, render timing. |

## Re-render

```sh
# the renderer serves the repo to the page itself (Playwright request interception); --server uses `python3 -m http.server 8123` instead
node tools/video/song.mjs                          # song.json + lyric sheet
node tools/video/render.mjs cast                   # out/cast.json (who is where, the verse leads)
node tools/video/render.mjs audio                  # out/shanty.wav (the game's audio engine, offline)
node tools/video/render.mjs stills 9 12 26         # a few frames to check (out/stills/)
node tools/video/render.mjs frames --workers 3     # out/frames/f00000.jpg ... (resumable: existing frames are skipped)
node tools/video/render.mjs mux --out docs/video/shanty.mp4   # + out/coverage.json
```

Options: `--ship 1 --seed 1` (which ship / run), `--fps 24`, `--w 1280 --h 720`, `--quality low|high`, `--from S --to S`
(a time range, e.g. the proof clip `--from 14.5 --to 29 --frames proof`), `--crf 20`.

Frames are indexed by time (`round(t * fps)`), every pose and camera position is a pure function of song time, and the
stateful bits (doors, lift doors) are replayed from the start of the shot when a frame is rendered out of order, so any
frame range can be (re)rendered on its own.

## Honest notes

* The singing is the game's procedural babble voice (no TTS engine here): vowels, vibrato and a hiss of consonants, so the
  words are not intelligible. The lyrics are shown as karaoke captions. ffmpeg only normalises loudness (loudnorm) and muxes.
* Game-side changes, all inert in normal play: `js/speech.js` gained `singPlan()` / `sing()` (only works with `?video=1`;
  the babble voice graph was factored into `voiceRig()` / `consonant()`, babble itself is unchanged) and `js/audio.js`
  gained `Sound.offline(ctx)` (the bus / reverb / noise setup moved into `_bus()`) and a `delay` argument on `thud()`.
* Placement: the watch on duty is at their duty stations (room drawn by the hours of their billet's day template in
  `comms.json`), most of the off-watch crew are in the rec spaces (mess, lounge, arboretum, gym, holodeck, atrium,
  quarters); a deck with fewer than 8 people gets off-watch visitors from the busiest deck. Medical stays in sickbay.
* Bodies are the game's own crew models and clips (`makeSurvivor` + `dressCrew`), posed by an additive layer; no IK, so
  claps are close, not exact.

## This render (ship 1, seed 1)

* `docs/video/shanty.mp4`: 146.4 s, 1280x720, 24 fps, H.264 (crf 25) + AAC 160k, 40.7 MB, -15.8 LUFS integrated.
* Coverage (`node tools/video/render.mjs mux` -> `out/coverage.json`): all 9 decks; 19 spaces of 16 room types (bridge,
  holodeck, computer core, sickbay, lounge, mess, atrium, lab, shuttle bay, brig, transporter x2, stores, armory, cargo x2,
  workshop, engineering x2) plus the turbolift on every deck; 83 of 91 crew on screen singing for at least half a second;
  all 8 departments. Not on screen: 8 people in rooms the shot list does not visit (gym, quarters, part of deck 3's
  holodeck, deck 7 cargo, deck 5 stores).
* Render time (4-core container, software GL): frames 102 min with 3 workers (~1.7 s per frame per worker),
  audio 3.5 min (11 offline segments), mux 1 min.
* Rough spots: the lift doors stop short of meeting; deck 9's call close-up is framed half on a louvred wall; the
  shot list spends 2 bars of every block in the lift; no IK, so claps and mug raises are close, not exact; in the
  big tall rooms (engineering) the crew read small.
