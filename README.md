# Starfarers: The Backdecks

A liminal-space horror roguelike built with three.js (a parody/homage — see [CREDITS.md](CREDITS.md)).
You are alone aboard the United Starfarers' Fleet provincial squadron — ten ships named for the Canadian provinces, in five hull classes (see `ships.html` for the schematics) — hunted by something. Find the logic chips, power the tubelift, descend, pick a requisition, repeat. Permadeath.

## Threats
A **Gronk** (reptilian ambusher), a **Compliance Drone** (slow, relentless, adapts to your zapper), **Mr. Grinsworth** (a rogue hologram that only moves when you look away — and walks through walls), **Space madness** (one crew member at a time loses it, lowest rank first; they hunt the other crew before you, and when you put one down, the next one turns), **Ceiling Crawlers** (they wait on the ceiling), and **Slimeling** impostors posing as survivors. Each deck rolls a different mix.

## Play
Serve the folder statically (ES modules need http):

    python3 -m http.server 8000   # then open http://localhost:8000

No build step; three.js and its addons are vendored in `vendor/`. Models, textures and the HDRI are in `assets/`.

## Controls
Tab ship status · hold E repair · WASD move · Shift sprint (loud) · Space jump / climb props / wall-jump · C creep, or slide while sprinting · Q or right click grapple line · Mouse look · Click fire zapper (stuns) · E interact / shake off a Ceiling Crawler · F flashlight · M map

Sprint and jump along a bulkhead to wall-run. Slide into man-sized hostiles to trip them. The grapple reels you to walls, ceilings and crate tops.

**Ship systems** — every run is one ship with a full named crew. Its departments' systems break down as you go (blackouts, failing life support, gravity, lurching decks, a blind scan-o-matic…). Faults show on the HUD and map; find the yellow maintenance junction or the department's hardware and hold E to fix it — loudly. Left broken, failures cascade (no coolant → reactor trouble → no air). Sometimes a crew member turns up to fix it — if you keep the madman off them. A pacing director decides when things go wrong and when you get a breather (F3 shows it).

**Jiffy tubes** — yellow-framed crawl ducts cut through the bulkheads. Walk in and you duck automatically. They are shortcuts with supplies inside; the Gronk and the Drone are too big to follow, the crazed crew are not. Longer tubes have a ladder shaft up to a second crawlway that comes out high in a wall (W climbs, S or C climbs down, Space lets go).

## Credits
Third-party CC0 characters, animation, props, textures and HDRI, with thanks: **MakeHuman**, **dramatis3d** (Tonio Loewald), **Quaternius**, **Poly Haven**, **ambientCG**. Full list and licenses in [CREDITS.md](CREDITS.md).

## Art review & tests
- `crew.html` — ship's company: chain of command, department loadouts, Break/Repair any system and see its effects.
- `ships.html` — fleet schematics (profile + deck plans for all ten ships).
- `models.html` — model viewer (`?set=crew|enemies|misc|props`, `?clip=<name>`, drag to orbit).
- `node tools/test.mjs` — headless smoke test (needs Playwright + Chromium): checks the level generator and plays a bot run through every deck.
- `tools/build-*.mjs` — offline scripts that re-pack the upstream CC0 assets (not needed to run the game).
