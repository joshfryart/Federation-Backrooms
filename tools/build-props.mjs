// Offline: packs Poly Haven (CC0) 1k glTF props into small meshopt GLBs with 512px webp textures.
//   node tools/build-props.mjs <dir containing <name>/<name>_1k.gltf> assets/models [name ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, simplify, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [, , SRC, OUT, ...ONLY] = process.argv;   // optional trailing asset names: build only those
await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const PROPS = { old_military_crate: ['ph_crate', 0.5, 512], barrel_03: ['ph_barrel', 1, 512], potted_plant_01: ['ph_plant', 0.07, 512], utility_box_01: ['ph_utilbox', 1, 512], modern_arm_chair_01: ['ph_armchair', 0.6, 512],
  steel_frame_shelves_01: ['ph_shelves1', 0.5, 512], steel_frame_shelves_02: ['ph_shelves2', 0.5, 512], steel_frame_shelves_03: ['ph_cabinet', 0.5, 512], metal_tool_chest: ['ph_toolchest', 0.3, 512],
  korean_fire_extinguisher_01: ['ph_extinguisher', 0.2, 512], Barrel_02: ['ph_drum', 0.5, 512], metal_toolbox: ['ph_toolbox', 0.2, 512] };
for (const [name, [out, ratio, size, err = 0.01]] of Object.entries(PROPS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const doc = await io.read(`${SRC}/${name}/${name}_1k.gltf`);
  for (const tex of doc.getRoot().listTextures()) tex.setImage(await sharp(tex.getImage()).resize(size, size).webp({ quality: 80 }).toBuffer()).setMimeType('image/webp');
  doc.getRoot().getAsset().extras = { source: `Poly Haven "${name}" — CC0 — https://polyhaven.com/a/${name}` };
  await doc.transform(dedup(), weld(), ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: err })] : []), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`${OUT}/${out}.glb`, doc); console.log(out);
}
