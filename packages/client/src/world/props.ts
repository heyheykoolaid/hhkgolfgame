// Detailed props (Poly Haven, CC0): loaded on demand from public/props/<id>.json (GLB stored base64, because the
// artifact host won't serve binary model files). Each model is fetched once and cloned for every placement.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let base = 'props/';
const cache = new Map<string, Promise<THREE.Object3D | null>>(),
  ready = new Map<string, THREE.Object3D>();
export function setPropsBase(url: string) {
  base = url.endsWith('/') ? url : url + '/';
}
export function loadProp(id: string): Promise<THREE.Object3D | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(base + id + '.json')
      .then(r => (r.ok ? r.json() : null))
      .then(async (j: any) => {
        if (!j?.glb) return null;
        const raw = atob(j.glb),
          u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const g = await new GLTFLoader().parseAsync(u8.buffer, '');
        g.scene.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.userData.shared = true;
            m.castShadow = true;
            m.receiveShadow = true;
            const mt = m.material as THREE.MeshStandardMaterial;
            if (mt?.map) mt.map.anisotropy = 4;
          }
        });
        ready.set(id, g.scene);
        return g.scene;
      })
      .catch(() => null);
    cache.set(id, p);
  }
  return p;
}
export const propReady = (id: string) => ready.get(id) || null;
/** A placeholder group that fills with the model as soon as it's loaded (instantly if it already is). */
export function propInstance(id: string, scale = 1): THREE.Group {
  const g = new THREE.Group(),
    fill = (src: THREE.Object3D | null) => {
      if (!src) return;
      const c = src.clone(true);
      c.scale.setScalar(scale);
      g.add(c);
    };
  const r = ready.get(id);
  if (r) fill(r);
  else loadProp(id).then(fill);
  return g;
}
