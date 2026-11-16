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
  /** Where it stood in the pack's own scene (the middle of its base), for props that belong together. */
  at(name: string): THREE.Vector3 | null;
}
const packs = new Map<string, Promise<PropPack>>();
/** clean: turns a mesh's name in the file into the prop's name (default: cut everything from "_M_" on). */
/** Cut a welded mesh into its separate props: triangles joined by shared corners, then pieces whose boxes touch
 *  (a frame and its picture) kept together. Returns one geometry per prop, biggest first. */
function splitLoose(g: THREE.BufferGeometry, gap = 0.02): THREE.BufferGeometry[] {
  const pos = g.attributes.position as THREE.BufferAttribute,
    idx = g.index ? Array.from(g.index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i),
    par = new Int32Array(pos.count).map((_, i) => i),
    find = (i: number): number => {
      while (par[i] !== i) i = par[i] = par[par[i]];
      return i;
    },
    join = (a: number, b: number) => {
      a = find(a);
      b = find(b);
      if (a !== b) par[a] = b;
    },
    weld = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`,
      w = weld.get(k);
    if (w === undefined) weld.set(k, i);
    else join(i, w);
  }
  for (let t = 0; t < idx.length; t += 3) {
    join(idx[t], idx[t + 1]);
    join(idx[t], idx[t + 2]);
  }
  // each piece's triangles and box
  const pieces = new Map<number, { tris: number[]; box: THREE.Box3 }>(),
    v = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(idx[t]);
    let pc = pieces.get(r);
    if (!pc) pieces.set(r, (pc = { tris: [], box: new THREE.Box3() }));
    pc.tris.push(t);
    for (let k = 0; k < 3; k++) pc.box.expandByPoint(v.fromBufferAttribute(pos, idx[t + k]));
  }
  // pieces whose boxes touch belong to one prop
  const list = [...pieces.values()],
    grp = list.map((_, i) => i),
    gf = (i: number): number => (grp[i] === i ? i : (grp[i] = gf(grp[i])));
  for (const p of list) p.box.expandByScalar(gap / 2);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (list[i].box.intersectsBox(list[j].box)) grp[gf(i)] = gf(j);
  const props = new Map<number, number[]>();
  list.forEach((p, i) => {
    const r = gf(i);
    props.set(r, [...(props.get(r) || []), ...p.tris]);
  });
  const out = [...props.values()].map(tris => {
    // a geometry of its own, holding only the corners this prop uses
    const map = new Map<number, number>(),
      order: number[] = [],
      index: number[] = [];
    for (const t of tris)
      for (let k = 0; k < 3; k++) {
        const o = idx[t + k];
        let n = map.get(o);
        if (n === undefined) {
          map.set(o, (n = order.length));
          order.push(o);
        }
        index.push(n);
      }
    const ng = new THREE.BufferGeometry();
    for (const [name, at] of Object.entries(g.attributes) as [string, THREE.BufferAttribute][]) {
      const arr = new (at.array.constructor as any)(order.length * at.itemSize);
      for (let n = 0; n < order.length; n++) for (let c = 0; c < at.itemSize; c++) arr[n * at.itemSize + c] = at.array[order[n] * at.itemSize + c];
      ng.setAttribute(name, new THREE.BufferAttribute(arr, at.itemSize, at.normalized));
    }
    ng.setIndex(index);
    ng.computeBoundingBox();
    return ng;
  });
  const vol = (x: THREE.BufferGeometry) => x.boundingBox!.getSize(v).lengthSq();
  return out.sort((a, b) => vol(b) - vol(a));
}
/** clean: turns a mesh's name in the file into the prop's name (default: cut everything from "_M_" on).
 *  split: the pack's props are welded into a few meshes; cut them apart and name them <split>00, 01… biggest first. */
export function loadProps(pack: string, clean: (n: string) => string = n => n.replace(/_M_.*$/, ''), split = ''): Promise<PropPack> {
  let p = packs.get(pack);
  if (!p) {
    p = fetch(new URL(`packs/${pack}.json`, document.baseURI).href)
      .then(r => r.json())
      .then(async (j: { glb: string }) => {
        const raw = atob(j.glb),
          u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const scene = (await new GLTFLoader().parseAsync(u8.buffer, '')).scene,
          parts = new Map<string, { g: THREE.BufferGeometry; m: THREE.Material | THREE.Material[]; size: THREE.Vector3; at: THREE.Vector3 }>();
        scene.updateMatrixWorld(true);
        scene.traverse(o => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const whole = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const sm = m as THREE.MeshStandardMaterial;
            sm.metalness = 0; // (packs often ship fully metallic, which renders black without an environment map)
            sm.roughness = Math.max(sm.roughness ?? 1, 0.8);
          }
          for (const g of split ? splitLoose(whole) : [whole]) {
            g.computeBoundingBox();
            const b = g.boundingBox!,
              size = b.getSize(new THREE.Vector3()),
              at = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
            g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
            g.computeBoundingBox();
            g.computeBoundingSphere();
            parts.set(split ? `${split}${String(parts.size).padStart(2, '0')}` : clean(mesh.name), { g, m: mesh.material, size, at });
          }
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
          at: (name: string) => parts.get(name)?.at.clone() || null,
        };
      })
      .catch(e => {
        console.warn('prop pack not loaded', pack, e);
        return { names: [], make: () => null, size: () => null, at: () => null };
      });
    packs.set(pack, p);
    ((window as any).__packs ??= {})[pack] = p;
  }
  return p;
}
