#!/bin/sh
# Rebuilds the standalone "Provincial Squadron Deck Plans" page (published as a claude.ai artifact) from the game's modules.
# Needs esbuild (npx esbuild). Output: tools/artifact/ship-deck-plans.html
set -e
cd "$(dirname "$0")/../.."
cat > /tmp/deckplans-entry.js <<JS
export { generate } from '$(pwd)/js/gen.js';
export { SHIPS, CLASSES, ZONES, zoneOf, deckOptions, shipDeckFor, drawSchematic } from '$(pwd)/js/ships.js';
export { ROOMS, RANKS } from '$(pwd)/js/data.js';
export { makeComplement, SYSTEMS, SYS, DEPARTMENTS, DEPT, DIVISION, HOST_LABEL, CASCADES, homeDeck } from '$(pwd)/js/crew.js';
JS
npx esbuild /tmp/deckplans-entry.js --bundle --format=iife --global-name=ShipLib --minify --outfile=/tmp/deckplans-lib.js
python3 -c "import sys; lib=open('/tmp/deckplans-lib.js').read().replace('</script>','<\\\\/script>'); t=open('tools/artifact/deck-plans.template.html').read(); open('tools/artifact/ship-deck-plans.html','w').write(t.replace('/*SHIPLIB*/', lib))"
echo wrote tools/artifact/ship-deck-plans.html
