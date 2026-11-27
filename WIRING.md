# WIRING (stream S2, environment materials)

No game hook outside the owned files is needed: everything is wired inside `js/world.js` / `js/assets.js`.

One harness suggestion for the owner of `tools/shot-gfx.mjs` (S0), so golden-shot comparisons survive changes that create objects:

- `tools/shot-gfx.mjs`, `gamePage()` evaluate (the line with `g.newRun()`, ~line 63): re-seed `Math.random` right before and right after `g.newRun()`, and in `__sg.findRoom` / the corridor / talk / blackout views around every `g.loadDeck(dn)` call (`__rs(); g.loadDeck(dn); __rs();`). Reason: every new three.js geometry / texture / material draws `Math.random` for its UUID, so any graphics change that adds or removes an object shifts the seeded stream and the compared views show different alerts, blackouts and crowd positions (S2 saw 57-95 % "differences" that were game state). With the re-seed, S2's after-vs-before was 0.04-2.1 % per view. The baseline must be re-shot with the same patched harness.
