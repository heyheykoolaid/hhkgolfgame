// Prop packs: downloaded model collections (credits in docs/credits.md), packed by tools/props/pack.py into
// public/packs/<pack>.json. A pack is one .glb holding many separate props; this splits it into named pieces, each
// re-centred to stand on the ground at its own origin, so the game can place them like its own models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface PropPack {
  names: string[];
  /** A fresh copy of a prop (shared geometry and material), origin at the middle of its base. Null if there's no such prop. */
  make(name: string, scale?: number): THREE.Mesh | null;
  /** Its size in metres (x, y, z) at scale 1. */
  size(name: string): THREE.Vector3 | null;
}
const packs = new Map<string, Promise<PropPack>>();
/** clean: turns a mesh's name in the file into the prop's name (default: cut everything from "_M_" on). */
export function loadProps(pack: string, clean: (n: string) => string = n => n.replace(/_M_.*$/, '')): Promise<PropPack> {
  let p = packs.get(pack);
  if (!p) {
    p = fetch(new URL(`packs/${pack}.json`, document.baseURI).href)
      .then(r => r.json())
      .then(async (j: { glb: string }) => {
        const raw = atob(j.glb),
          u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const scene = (await new GLTFLoader().parseAsync(u8.buffer, '')).scene,
          parts = new Map<string, { g: THREE.BufferGeometry; m: THREE.Material | THREE.Material[]; size: THREE.Vector3 }>();
        scene.updateMatrixWorld(true);
        scene.traverse(o => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
          g.computeBoundingBox();
          const b = g.boundingBox!;
          g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
          g.computeBoundingBox();
          g.computeBoundingSphere();
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const sm = m as THREE.MeshStandardMaterial;
            sm.metalness = 0; // (packs often ship fully metallic, which renders black without an environment map)
            sm.roughness = Math.max(sm.roughness ?? 1, 0.8);
          }
          parts.set(clean(mesh.name), { g, m: mesh.material, size: b.getSize(new THREE.Vector3()) });
        });
        return {
          names: [...parts.keys()],
          make(name: string, scale = 1) {
            const x = parts.get(name);
            if (!x) return null;
            const o = new THREE.Mesh(x.g, x.m);
            o.scale.setScalar(scale);
            o.castShadow = o.receiveShadow = true;
            o.name = name;
            return o;
          },
          size: (name: string) => parts.get(name)?.size.clone() || null,
        };
      })
      .catch(e => {
        console.warn('prop pack not loaded', pack, e);
        return { names: [], make: () => null, size: () => null };
      });
    packs.set(pack, p);
  }
  return p;
}
