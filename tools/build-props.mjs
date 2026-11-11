// Offline: packs Poly Haven (CC0) 1k glTF props into small meshopt GLBs with 512px webp textures.
//   node tools/build-props.mjs <dir containing <name>/<name>_1k.gltf> assets/models
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [, , SRC, OUT] = process.argv;
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const PROPS = { old_military_crate: ['ph_crate', 0.5, 512], barrel_03: ['ph_barrel', 1, 512], potted_plant_01: ['ph_plant', 0.07, 512], utility_box_01: ['ph_utilbox', 1, 512], modern_arm_chair_01: ['ph_armchair', 0.6, 512] };
for (const [name, [out, ratio, size]] of Object.entries(PROPS)) {
  const doc = await io.read(`${SRC}/${name}/${name}_1k.gltf`);
  for (const tex of doc.getRoot().listTextures()) tex.setImage(await sharp(tex.getImage()).resize(size, size).webp({ quality: 80 }).toBuffer()).setMimeType('image/webp');
  doc.getRoot().getAsset().extras = { source: `Poly Haven "${name}" — CC0 — https://polyhaven.com/a/${name}` };
  await doc.transform(dedup(), weld(), ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 })] : []), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`${OUT}/${out}.glb`, doc); console.log(out);
}
