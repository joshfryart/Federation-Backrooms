// Minified three.js for the pages:  node tools/build-three-min.mjs   (needs network for `npx esbuild`; run after updating vendor/three.*.js)
// vendor/three.core.js + vendor/three.module.js (the unminified r187 release files, kept for reading / debugging) ->
// vendor/three.core.min.js + vendor/three.module.min.js, which the import maps of index.html and the viewer pages point "three" at.
// esbuild --minify per file (no bundling, imports / exports and the @license header kept), --keep-names so class .name stays the same.
// 2.13 MB -> 0.79 MB raw, 419 KB -> 204 KB gzip.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const V = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor');
for (const n of ['core', 'module']) execFileSync('npx', ['--yes', 'esbuild@0.24.0', join(V, `three.${n}.js`), '--minify', '--keep-names', '--legal-comments=inline', '--target=es2020', '--log-level=warning', `--outfile=${join(V, `three.${n}.min.js`)}`], { stdio: 'inherit' });
const m = join(V, 'three.module.min.js'), src = readFileSync(m, 'utf8'), out = src.split('"./three.core.js"').join('"./three.core.min.js"');
if (out === src) throw new Error('three.module.min.js: no import of ./three.core.js to rewrite');
writeFileSync(m, out);
console.log('wrote vendor/three.core.min.js, vendor/three.module.min.js');
