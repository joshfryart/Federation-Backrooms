# Federation Backrooms

A liminal-space horror roguelike built with three.js. You are alone aboard an endless series of Starfleet vessels, hunted by a **Gorn**.
Find the isolinear chips, power the turbolift, descend, pick a requisition, repeat. Permadeath.

## Play
Serve the folder statically (ES modules need http):

    python3 -m http.server 8000   # then open http://localhost:8000

No build step; three.js is vendored in `vendor/`.

## Controls
WASD move · Shift sprint (loud) · C creep (quiet) · Mouse look · Click/Space fire phaser (stuns the Gorn) · E interact · F flashlight · M map
