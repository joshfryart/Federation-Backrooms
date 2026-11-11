# Starfarers: The Backdecks

A liminal-space horror roguelike built with three.js (a parody/homage — see [CREDITS.md](CREDITS.md)).
You are alone aboard an endless series of United Starfarers' Fleet vessels, hunted by something. Find the logic chips, power the tubelift, descend, pick a requisition, repeat. Permadeath.

## Threats
A **Gronk** (reptilian ambusher), a **Compliance Drone** (slow, relentless, adapts to your zapper), **Mr. Grinsworth** (a rogue hologram that only moves when you look away — and walks through walls), **Space-Madness Crewmen** (fast pack hunters), **Clingon Crawlers** (they wait on the ceiling), and **Slimeling** impostors posing as survivors. Each deck rolls a different mix.

## Play
Serve the folder statically (ES modules need http):

    python3 -m http.server 8000   # then open http://localhost:8000

No build step; three.js and its addons are vendored in `vendor/`. Models, textures and the HDRI are in `assets/`.

## Controls
WASD move · Shift sprint (loud) · C creep (quiet) · Mouse look · Click/Space fire zapper (stuns) · E interact / shake off a Clingon · F flashlight · M map

## Credits
Third-party CC0 characters, animation, props, textures and HDRI, with thanks: **MakeHuman**, **dramatis3d** (Tonio Loewald), **Quaternius**, **Poly Haven**, **ambientCG**. Full list and licenses in [CREDITS.md](CREDITS.md).

## Art review & tests
- `models.html` — model viewer (`?set=crew|enemies|misc|props`, `?clip=<name>`, drag to orbit).
- `node tools/test.mjs` — headless smoke test (needs Playwright + Chromium): checks the level generator and plays a bot run through every deck.
- `tools/build-*.mjs` — offline scripts that re-pack the upstream CC0 assets (not needed to run the game).
