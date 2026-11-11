// Offline: converts ambientCG (CC0) 1K-JPG material sets into the compact webp sets in assets/textures/.
//   node tools/build-textures.mjs <dir with *_Color.jpg, *_NormalGL.jpg, *_Roughness.jpg> assets/textures
// Albedo is neutralised (grey, fixed mean) because the game tints surfaces per ship / per room.
import sharp from 'sharp';
const [, , SRC, OUT] = process.argv;
const SETS = { wall: ['MetalPlates008', 0.8, 1024], deck: ['DiamondPlate008C', 0.72, 1024], carpet: ['Carpet016', 0.8, 1024], tile: ['Tiles141', 0.82, 1024], ceil: ['OfficeCeiling006', 0.8, 512] };
for (const [name, [id, mean, size]] of Object.entries(SETS)) {
  const { data, info } = await sharp(`${SRC}/${id}_Color.jpg`).resize(size, size).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0; for (const v of data) sum += v; const k = mean * 255 / (sum / data.length);
  const out = Buffer.from(data.map(v => Math.min(255, v * k)));
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).webp({ quality: 80 }).toFile(`${OUT}/${name}_c.webp`);
  await sharp(`${SRC}/${id}_NormalGL.jpg`).resize(size, size).webp({ quality: 86 }).toFile(`${OUT}/${name}_n.webp`);
  await sharp(`${SRC}/${id}_Roughness.jpg`).resize(size / 2, size / 2).greyscale().webp({ quality: 75 }).toFile(`${OUT}/${name}_r.webp`);
  console.log(name, id);
}
