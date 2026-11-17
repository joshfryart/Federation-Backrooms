# STARSHIP LOST — Part One: "Til Death Do Us Part (Pending Inspection)"

**Runtime:** 7:45 · **Setting:** USF Saskatchewan (plough class) · **Format:** game-engine soap opera, synthesised voices

**The irony:** Commander Okafor, who has spent the whole series hunting the impostor aboard, scans everyone *except* the person she is about to marry. When the groom finally scans *her*, the impostor is the bride. The prisoner she locked in the brig as "the impostor" was the real Okafor all along. The Gorn had worked it out over the soup.

**Watch it:** serve the repo (`python3 -m http.server 8000`) and open `/soap.html`. It has the silly title screen, a chapter picker, a voice-speed slider and subtitles. Voices are the browser's speech synthesis, each slowed through the per-character rate below. With no system voices it falls back to robot blips on the same timing.

## Cast and voices
Every character is a game model. Voices use the game's synth mode (`js/speech.js`, `speechSynthesis`). **Multiply each voice's `rate` by about 0.85** for the slowed, melodramatic delivery; the table already has the slowdown baked in. Hold pauses of 0.5s or longer between lines.

| Character | Game model | Voice (pitch / rate) |
|---|---|---|
| SHIP'S COMPUTER (narrator) | no body: bridge viewscreen / title card | pitch 0.7, rate 0.80 |
| CAPT. TREMBLAY | crew_m, command gold, rank 6 | pitch 0.85, rate 0.85 |
| CDR. OKAFOR | crew_f, security red, rank 4 | pitch 1.05, rate 0.88 |
| OKAFOR (the other one) | crew_f, security red, bloody 0.3 / pale 0.2, brig jumpsuit | pitch 1.05, rate 0.95 (frantic, still slowed) |
| CHIEF MACLEOD | crew_heavy, engineering gold | pitch 0.65, rate 0.82, accent: maritime |
| THE DOCTOR (hologram) | crew_f2 with holoMaterial(0x6ad8ff), idle_talking | pitch 1.25, rate 0.85, formant 1.2 + vibrato |
| THE GORN (best man) | makeGorn() / enemies.MODELS.gronk | pitch 0.5, rate 0.55, rough 0.6 |
| AUDITOR DRONE (brig guard / wedding auditor) | suit model, tint 0x4e5a56, droneKit green lens, walk_formal | pitch 0.6, rate 0.7, flat monotone |
| TRIBBLE (ring bearer) | makeTribble() | babble chirp only |

## Production notes
- Timecodes assume the slowed rates above (~2.1 words/sec, Gorn ~1.2) plus about 0.7s between lines. They total about 7:42, so a few seconds of tail room; if the synth runs fast, add beats at the SFX moments.
- Clips named in italics are existing `human_anims` clips (`idle_talking`, `sitting_idle`, `walk_formal`, `shamble`, `hit_chest`, `punch_cross`). The hologram uses `holoMaterial(0x6ad8ff, 0.8)`, as in models.html.
- The impostor reveal can reuse `markImpostor()` on the second `crew_f` for a single shot of the glowing-eye tell.
- Part Two picks up on the third Okafor behind the Captain, and on the ring still inside the Gorn.

## Script
`[0:00]` *SFX / VISUAL:* TITLE CARD: STARSHIP LOST, over drifting Saskatchewan-class plough hull. Cheesy brass stab. *(~8s)*

`[0:08]` **SHIP'S COMPUTER:** Last time, on Starship Lost. Captain Tremblay discovered his evil twin was a hologram. Doctor Roy faked her own death with a very convincing mannequin. The Gorn ordered the soup. And Commander Okafor swore, before the entire crew, to find the impostor aboard... or die trying. Tonight... the wedding.  
*(Slow push-in on the ship. Organ sting on "wedding".)*  


### SCENE 1 — Ship-wide announcement. Drifting hull, then the corridors, crew looking up at the speakers.

`[0:33]` **SHIP'S COMPUTER:** Attention, all decks. Gossip update. Commander Okafor is marrying Chief MacLeod. Captain Tremblay has been seen crying in a turbolift. The Gorn has not eaten anyone yet. Please remain calm. The betting pool closes at nineteen hundred.  
*(Crew in corridors exchange knowing glances (idle_talking pairs).)*  


### SCENE 2 — Ready room. Flowers everywhere. A tribble sits on the desk, chirping.

`[0:52]` **CAPT. TREMBLAY:** Commander. Today you marry the man you love, aboard my ship, with my blessing.  
*(crew_m, idle_talking, hands clasped behind him)*  

`[0:59]` **CDR. OKAFOR:** Thank you, Captain. I have scanned every soul on this vessel. Twice. The Chief passed with flying colours. I have never been so certain of anything in my life.  
*(crew_f, idle, tricorder on belt)*  

`[1:13]` **CAPT. TREMBLAY:** Neither was I. Once. About her.  
*(Turns to camera. Tight close-up, violin.)*  

`[1:17]` **CDR. OKAFOR:** Sir?

`[1:18]` **CAPT. TREMBLAY:** The cake! I said... the cake looks... structurally sound.  
*(Tribble chirps twice.)*  

`[1:23]` *SFX / VISUAL:* Wipe to the corridor, deck three. Strings swell. *(~3s)*


### SCENE 3 — Corridor, deck three. The Gorn guards the chapel door.

`[1:26]` **CAPT. TREMBLAY:** Gorn. Six seasons we have served together. Tell me, as a friend. Can a man marry his heart to a woman who hunts impostors, when he himself has spent years pretending he is over her?  
*(Tremblay walks with the Gorn, walk_formal; Gorn in shamble.)*  

`[1:43]` **THE GORN:** Captain... I am a carnivore... I do not understand pretending... But I will eat... whoever you point at.  
*(Gorn turns head slowly. Roar-rumble under the line.)*  

`[1:59]` **CAPT. TREMBLAY:** That is... oddly comforting.

`[2:02]` *SFX / VISUAL:* Dissolve to the chapel. Wedding march, out of tune. *(~4s)*


### SCENE 4 — The mess hall, converted to a chapel. Crew in rows, sitting_idle. The Doctor presides.

`[2:06]` **THE DOCTOR:** Dearly beloved. I am a medical hologram. My program is certified for broken bones, burns, and mild regret. It is not certified for matrimony.  
*(crew_f2 hologram, idle_talking, flickers on "regret")*  

`[2:18]` **CHIEF MACLEOD:** Och, Doc. Just read the card.  
*(crew_heavy in dress uniform, shifting from foot to foot)*  

`[2:21]` **THE DOCTOR:** I was designed to heal, not to feel. And yet, when the Chief says "I do," I will experience a subroutine I can only describe as a core breach.  
*(To camera, soft blue flicker. Hold.)*  

`[2:36]` **AUDITOR DRONE:** I am attending in an official capacity. This union has been assessed at... one hundred percent... improbable.  
*(Auditor Drone in the back row, lens sweeping the pews.)*  

`[2:48]` **THE DOCTOR:** Ring bearer. Present the ring.

`[2:51]` *SFX / VISUAL:* The tribble chirps. Then chirps again. A sound like a bag of popcorn. FORTY tribbles pour down the aisle. Crew lift their feet. A counter on screen spins: 40, 400, 4,000. *(~8s)*

`[2:59]` **THE DOCTOR:** The ring bearer has multiplied. There are now forty. The ring is inside one of them.

`[3:07]` **THE GORN:** I will retrieve... the ring.  
*(Gorn lunges. Crunching. Crew scream, politely.)*  

`[3:12]` **THE DOCTOR:** That was the ring bearer.

`[3:15]` **THE GORN:** It was... delicious.

`[3:18]` *SFX / VISUAL:* Long beat. Crew stare. A single tribble chirp from inside the Gorn. *(~3s)*

`[3:21]` **CHIEF MACLEOD:** Right. So the ring is in the Gorn. Aye. We will wait.


### SCENE 5 — The brig. Three weeks ago. (Wavy dissolve, harp.)

`[3:28]` **OKAFOR:** Guard! I am Commander Okafor, head of Security! Release me at once!  
*(Real Okafor at the force-field, crew_f, bloody 0.3, gripping the bars.)*  

`[3:34]` **AUDITOR DRONE:** Negative. Commander Okafor has already ordered your arrest. She is extremely thorough. It is her most attractive quality.  
*(Auditor Drone in the corridor, walk_formal, green lens sweeping.)*  

`[3:47]` **OKAFOR:** That is me! I am the thorough one! I am so thorough!

`[3:52]` **AUDITOR DRONE:** Resistance... noted. Would you like some soup?

`[3:58]` **OKAFOR:** I hate soup!

`[4:00]` **AUDITOR DRONE:** The prisoner... hates soup. Logging suspicious behaviour.  
*(Lens flares. Harp sting. Dissolve back.)*  


### SCENE 6 — The vows. Close on the bride. Soft focus, strings.

`[4:05]` **CDR. OKAFOR:** Angus. For years I trusted no one. I scanned my friends. I scanned my enemies. I scanned a potted plant, and it came back suspicious. Then you came along, and you taught me that love needs no scan.  
*(crew_f, hand on chest)*  

`[4:23]` **CAPT. TREMBLAY:** Beautiful. It is just so beautiful.  
*(Weeping into a handkerchief, crew_m, hit_chest)*  

`[4:26]` **CDR. OKAFOR:** So today, before this crew, I declare the Anti-Impostor Task Force disbanded. There is no impostor aboard. There never was.  
*(Organ stab. Crew gasp.)*  

`[4:36]` *SFX / VISUAL:* Beat. Okafor smiles, tearful. The crew applauds. Wedding march resumes, then cuts out mid-note. *(~4s)*

`[4:40]` **CHIEF MACLEOD:** Aye, lass. Fleet custom says the bride scans the groom first. For trust.

`[4:47]` **CDR. OKAFOR:** Of course.  
*(She sweeps the tricorder over him. Soft chirp.)*  

`[4:49]` **CDR. OKAFOR:** Human. Scottish. Mostly. You see? Clean.

`[4:52]` **THE DOCTOR:** Do you, Angus MacLeod, take Commander Okafor, in sickness, in health, and in the event of tribbles?

`[5:01]` **CHIEF MACLEOD:** I do. And, aye... I will. But first, Fleet custom. The groom scans the bride.

`[5:09]` *SFX / VISUAL:* MacLeod takes the tricorder. Hands trembling. He raises it at his bride. The chirp climbs. It climbs. KLAXON. *(~5s)*

`[5:14]` **SHIP'S COMPUTER:** Warning. Impostor detected. Subject... Commander Okafor.  
*(Red wash over the whole chapel. Crew all stand.)*  

`[5:18]` **CDR. OKAFOR:** That is impossible. I am the one who caught the impostor! She is in the brig! She has been screaming for three weeks!  
*(crew_f, punch_cross posture, shaking)*  

`[5:29]` **CAPT. TREMBLAY:** I thought that was the plumbing.


### SCENE 7 — The doors slam open. Silhouette. Smoke from the corridor.

`[5:33]` **OKAFOR:** Do not marry her! I am the real Okafor! She arrested me for being her! Every day I told the guards, and every day they said, nice try, impostor!  
*(Second crew_f in brig jumpsuit, pale, dishevelled, shamble into a run.)*  

`[5:46]` **THE GORN:** I knew... The real one... hates soup... This one... asked for seconds.  
*(Slowest line of the episode. Hold on the Gorn.)*  

`[5:56]` **CAPT. TREMBLAY:** Which one of you... is my Commander?

`[6:00]` **CAPT. TREMBLAY:** For six seasons I have loved one of you. In secret. In the turbolift. I simply never knew which.  
*(Both Okafors recoil, together.)*  

`[6:10]` **CDR. OKAFOR:** Captain!

`[6:11]` **OKAFOR:** Captain!

`[6:12]` **CDR. OKAFOR:** Me!

`[6:14]` **OKAFOR:** No, me!  
*(Both draw phasers, aim at each other. Match cut, crash zoom.)*  

`[6:15]` **AUDITOR DRONE:** Auditing. Both Okafors are eighty-seven percent identical. Recommend... a coin toss.  
*(Drone steps forward, lens sweeping from face to face.)*  

`[6:23]` **THE DOCTOR:** I hold nine thousand medical certifications. I can say only that one of you has a better bedside manner.  
*(Both Okafors: "Hey!")*  

`[6:33]` **THE DOCTOR:** Does anyone object? ... That was rhetorical.  
*(Flickers out for a moment, then back.)*  


### SCENE 8 — The stand-off. Everyone frozen. MacLeod steps between the two phasers.

`[6:36]` **CHIEF MACLEOD:** Ladies. Ladies. Please. I can explain. Three weeks ago, in the Jefferies tube, I scanned you, lass. You came back odd. I told no one. I wanted... the wedding. Because love needs no scan.  
*(He lowers his tricorder. Soft violin. He holds the first Okafor's gaze.)*  

`[6:54]` **CDR. OKAFOR:** You KNEW?  
*(crew_f lowers her phaser an inch.)*  

`[6:56]` **CHIEF MACLEOD:** Aye. And I will tell you the rest. There were three of you.  
*(Hold his face. Tribble chirps. Violins.)*  

`[7:03]` *SFX / VISUAL:* Everyone freezes. A single tribble falls off the Gorn. Silence. Crew breath. Slow dolly onto Tremblay. *(~4s)*

`[7:07]` **SHIP'S COMPUTER:** Warning. Third Okafor detected. Location... directly behind the Captain.  
*(Cut to black. Sting.)*  

`[7:12]` **CAPT. TREMBLAY:** Please. Please let it be a hologram.  
*(Heard over black, a hair above a whisper.)*  

`[7:16]` *SFX / VISUAL:* Black. Title card: TO BE CONTINUED. Over it, a single tribble chirp. *(~6s)*

`[7:22]` *SFX / VISUAL:* Credits roll over slow-motion footage of the bouquet being tossed. A tribble catches it. Brass theme out. *(~12s)*

`[7:34]` **SHIP'S COMPUTER:** Next time, on Starship Lost. Three Okafors. One phaser. And a very full Gorn.  
*(Credits music.)*  


---
*TO BE CONTINUED...*
