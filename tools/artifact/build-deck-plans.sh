#!/bin/sh
# Rebuilds the standalone "Provincial Squadron Deck Plans" page (published as a claude.ai artifact) from the game's modules.
# Needs esbuild (npx esbuild). Output: tools/artifact/ship-deck-plans.html
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# relative imports from inside the repo: no absolute paths spliced into JS
cat > "$ROOT/tools/artifact/.entry.js" <<'JS'
export { generate } from '../../js/gen.js';
export { SHIPS, CLASSES, ZONES, zoneOf, deckOptions, shipDeckFor, drawSchematic } from '../../js/ships.js';
export { ROOMS, RANKS } from '../../js/data.js';
export { makeComplement, SYSTEMS, SYS, DEPARTMENTS, DEPT, DIVISION, HOST_LABEL, CASCADES, homeDeck, hardwareSites } from '../../js/crew.js';
JS
npx esbuild "$ROOT/tools/artifact/.entry.js" --bundle --format=iife --global-name=ShipLib --minify --outfile="$TMP/lib.js"
rm -f "$ROOT/tools/artifact/.entry.js"
python3 - "$TMP/lib.js" "$ROOT/tools/artifact/deck-plans.template.html" "$ROOT/tools/artifact/ship-deck-plans.html" <<'PY'
import sys
lib = open(sys.argv[1]).read().replace('</script>', '<\\/script>')
open(sys.argv[3], 'w').write(open(sys.argv[2]).read().replace('/*SHIPLIB*/', lib))
PY
echo "wrote tools/artifact/ship-deck-plans.html"
