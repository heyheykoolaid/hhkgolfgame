// Pack Poly Haven glTF models (CC0) for the game: simplify heavy meshes, 512px JPEG textures, origin at the bottom
// centre, one GLB per model stored base64 in JSON (the artifact host won't serve .bin/.glb), plus a manifest with
// each model's footprint. Usage: node pack.mjs <srcDir> <outDir>
import fs from 'node:fs'; import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, center, getBounds, flatten, join } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [src, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const MAX_TRIS = 9000, manifest = {};
const tris = doc => doc.getRoot().listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
await MeshoptSimplifier.ready;
for (const id of fs.readdirSync(src).sort()) {
  const f = path.join(src, id, id + '_1k.gltf'); if (!fs.existsSync(f)) continue;
  const doc = await io.read(f), t0 = tris(doc);
  await doc.transform(dedup(), flatten(), weld({ tolerance: 0.0001 }));
  if (t0 > MAX_TRIS) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: MAX_TRIS / t0, error: 0.002 }));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [512, 512], quality: 82 }), center({ pivot: 'below' }), prune());
  const b = getBounds(doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0]);
  const glb = await io.writeBinary(doc), t1 = tris(doc);
  const w = +(b.max[0] - b.min[0]).toFixed(3), h = +(b.max[1] - b.min[1]).toFixed(3), d = +(b.max[2] - b.min[2]).toFixed(3);
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify({ id, w, d, h, glb: Buffer.from(glb).toString('base64') }));
  manifest[id] = { w, d, h, tris: Math.round(t1), kb: Math.round(glb.byteLength / 1024) };
  console.log(id.padEnd(28), `${Math.round(t0)} → ${Math.round(t1)} tris`, `${w}×${d}×${h} m`, `${Math.round(glb.byteLength / 1024)} KB`);
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
