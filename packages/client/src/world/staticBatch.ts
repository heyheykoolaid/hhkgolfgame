// Static batching. A scene built from hundreds of small separate meshes (benches, RV parts, table legs) costs one draw
// per mesh, and one more each for shadows. This watches a scene and, for every top-level object, folds the plain
// meshes that are standing still into one mesh per kind of material, with each mesh's colour written into its
// vertices. The originals stay in the scene, hidden, so everything else (raycasts, Build Mode, code that holds on to
// them) carries on as before.
//
// It heals itself: every original is re-checked a few at a time, and the moment one moves, hides, changes material or
// colour, or leaves the scene, its triangles are cut from the batch and the original shows again. It is folded back in
// once it has been still for a few seconds. So nothing has to be marked as static by hand, and getting it wrong costs
// a tenth of a second of the old picture at worst.
import * as THREE from 'three';

interface Rec {
  mesh: THREE.Mesh;
  root: THREE.Object3D;
  rel: Float32Array;
  state: string;
  own: boolean; // the mesh's own visible flag (while batched, the flag itself reads false)
  since: number; // when it was last seen to change
  /** Where its triangles sit in the batches (one entry per material it uses); empty when it is drawn as itself. */
  parts: { b: Batch; i0: number; i1: number }[];
  hooked: boolean;
}
interface Batch {
  mesh: THREE.Mesh;
  live: number;
}

const TEX = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'envMap', 'lightMap'] as const;
// finishes are grouped into a few steps (a 0.8 and a 0.9 roughness look the same from any distance that matters)
const ROUGH = (r: number) => (r < 0.3 ? Math.round(r * 10) / 10 : r < 0.6 ? 0.5 : r < 0.8 ? 0.7 : 0.9),
  METAL = (v: number) => Math.round(v * 4) / 4;
const PLAIN_HOOK = THREE.Material.prototype.onBeforeCompile;

/** Has a shader patch of its own (wind, city haze…). The cloud-shadow patch doesn't count: every material gets it,
 *  and a batch's material is given it again. */
function hooked(m: any) {
  if (m.onBeforeCompile === PLAIN_HOOK) return false;
  return !(m.userData?.cloudShade && !m.userData.wind && !m.userData.ownShader);
}
/** What kind of material this is, as far as drawing goes, colour aside; null if it can't be batched. */
function matKey(m: any): string | null {
  if (!m) return null;
  if (Array.isArray(m)) return m.length && m.every(x => matKey(x) !== null) ? 'multi' : null;
  if (!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshBasicMaterial || m.isMeshPhongMaterial) || m.isMeshPhysicalMaterial)
    return null;
  if (m.transparent || m.opacity < 1 || hooked(m) || m.userData?.noBatch || m.wireframe || m.clippingPlanes) return null;
  const k: (string | number)[] = [m.type];
  for (const t of TEX) k.push(m[t] ? m[t].uuid : '');
  k.push(
    ROUGH(m.roughness ?? 0),
    METAL(m.metalness ?? 0),
    m.emissive ? m.emissive.getHex() : 0,
    m.emissiveIntensity ?? 1,
    m.side,
    m.flatShading ? 1 : 0,
    m.alphaTest,
    m.depthWrite ? 1 : 0,
    m.depthTest ? 1 : 0,
    m.fog ? 1 : 0,
    m.toneMapped ? 1 : 0,
    m.polygonOffset ? 1 : 0,
    m.shininess ?? 0,
  );
  return k.join('/');
}
function meshOk(o: any): o is THREE.Mesh {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh || o.userData.noBatch || o.userData.isBatch) return false;
  if (o.children.length || o.customDepthMaterial || o.morphTargetInfluences?.length) return false;
  const g = o.geometry as THREE.BufferGeometry;
  if (!g?.attributes.position || g.attributes.position.count > 60000 || g.morphAttributes.position) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  if (Array.isArray(o.material) && !g.groups.length) return false;
  return matKey(o.material) !== null;
}

export function createStaticBatcher(scene: THREE.Scene, opts: { skip?: (root: THREE.Object3D) => boolean; onBatch?: (m: THREE.Mesh) => void } = {}) {
  const recs = new Map<THREE.Mesh, Rec>(),
    order: Rec[] = [],
    batches = new Set<Batch>(),
    inv = new Map<THREE.Object3D, THREE.Matrix4>(),
    _m = new THREE.Matrix4(),
    _v = new THREE.Vector3(),
    _n = new THREE.Matrix3(),
    _c = new THREE.Color();
  let clock = 0,
    scanT = 1.5,
    bakeT = 3,
    cursor = 0,
    on = true;

  const rootInv = (r: THREE.Object3D) => {
    let m = inv.get(r);
    if (!m) inv.set(r, (m = new THREE.Matrix4().copy(r.matrixWorld).invert()));
    return m;
  };
  /** Still part of its root, and nothing between it and the root is hidden or on a bone. */
  function standing(rec: Rec): boolean | null {
    let p = rec.mesh.parent;
    while (p && p !== rec.root) {
      if (!p.visible) return false;
      p = p.parent;
    }
    return p === rec.root && (rec.root === scene || rec.root.parent === scene) ? true : null;
  }
  function stateOf(mesh: THREE.Mesh) {
    const g = mesh.geometry;
    let ms = '';
    for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as any[])
      ms += `${m.uuid}:${m.version}:${m.color ? m.color.getHex() : 0}:${m.emissive ? m.emissive.getHex() : 0}:${m.emissiveIntensity ?? 1}:${m.opacity}:${m.transparent ? 1 : 0}:`;
    return `${ms}${g.uuid}:${(g.attributes.position as THREE.BufferAttribute).version}:${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}:${mesh.layers.mask}`;
  }
  function relOf(rec: Rec, out: Float32Array) {
    _m.multiplyMatrices(rootInv(rec.root), rec.mesh.matrixWorld);
    for (let i = 0; i < 16; i++) out[i] = _m.elements[i];
  }
  function hook(rec: Rec) {
    if (rec.hooked) return;
    rec.hooked = true;
    rec.own = rec.mesh.visible;
    Object.defineProperty(rec.mesh, 'visible', {
      get: () => rec.own && !rec.parts.length,
      set: (v: boolean) => void (rec.own = v),
      configurable: true,
    });
  }
  function unhook(rec: Rec) {
    if (!rec.hooked) return;
    rec.hooked = false;
    Object.defineProperty(rec.mesh, 'visible', { value: rec.own, writable: true, configurable: true, enumerable: true });
  }
  function unbake(rec: Rec) {
    for (const { b, i0, i1 } of rec.parts) {
      const idx = b.mesh.geometry.index!;
      (idx.array as Uint16Array | Uint32Array).fill(0, i0, i1);
      idx.needsUpdate = true;
      if (--b.live <= 0) {
        b.mesh.parent?.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        batches.delete(b);
      }
    }
    rec.parts = [];
  }
  function drop(rec: Rec) {
    unbake(rec);
    unhook(rec);
    recs.delete(rec.mesh);
  }

  function scan() {
    const add = (o: THREE.Mesh, root: THREE.Object3D) => {
      const rec: Rec = { mesh: o, root, rel: new Float32Array(16), state: '', own: true, since: clock, parts: [], hooked: false };
      recs.set(o, rec);
      order.push(rec);
    };
    for (const root of scene.children) {
      if (root.userData.isBatch || root.userData.noBatch || (root as any).isLight || (root as any).isCamera || opts.skip?.(root)) continue;
      if ((root as any).isMesh) {
        // a mesh sitting directly in the scene: batched with the other loose ones
        if (meshOk(root) && !recs.has(root)) add(root, scene);
        continue;
      }
      const walk = (o: THREE.Object3D) => {
        if ((o as any).isBone || o.userData.noBatch) return;
        if (o !== root && meshOk(o) && !recs.has(o)) add(o, root);
        for (const c of o.children) walk(c);
      };
      walk(root);
    }
  }

  const _rel = new Float32Array(16);
  function check(rec: Rec) {
    const st = standing(rec);
    if (st === null || !meshOk(rec.mesh)) {
      drop(rec);
      return false;
    }
    relOf(rec, _rel);
    let moved = false;
    for (let i = 0; i < 16; i++)
      if (Math.abs(_rel[i] - rec.rel[i]) > 1e-4) {
        moved = true;
        break;
      }
    const state = stateOf(rec.mesh) + (st && (rec.hooked ? rec.own : rec.mesh.visible) ? 'v' : 'h');
    if (moved || state !== rec.state) {
      rec.rel.set(_rel);
      rec.state = state;
      rec.since = clock;
      unbake(rec);
    }
    return true;
  }

  /** Fold one root's waiting meshes into new batches, one per kind of material. */
  function bake(root: THREE.Object3D, list: Rec[]) {
    interface Unit {
      r: Rec;
      mat: any;
      start: number;
      count: number;
    }
    const groups = new Map<string, Unit[]>();
    for (const r of list) {
      const m = r.mesh,
        g = m.geometry,
        all = g.index ? g.index.count : g.attributes.position.count,
        tail = `|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${m.frustumCulled ? 1 : 0}|${m.layers.mask}`,
        units: Unit[] = Array.isArray(m.material)
          ? g.groups.map(gr => ({ r, mat: (m.material as any[])[gr.materialIndex ?? 0], start: gr.start, count: Math.min(gr.count, all - gr.start) }))
          : [{ r, mat: m.material, start: 0, count: all }];
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const u of units) {
        if (!u.mat || u.count <= 0) continue;
        const k = matKey(u.mat) + tail;
        let a = groups.get(k);
        if (!a) groups.set(k, (a = []));
        a.push(u);
      }
      hook(r);
    }
    for (const group of groups.values()) {
      let nv = 0,
        ni = 0;
      for (const u of group) {
        nv += u.r.mesh.geometry.attributes.position.count;
        ni += u.count - (u.count % 3);
      }
      const first = group[0].r.mesh,
        src = group[0].mat,
        needUv = TEX.some(t => t !== 'envMap' && src[t]),
        pos = new Float32Array(nv * 3),
        nor = new Float32Array(nv * 3),
        col = new Float32Array(nv * 3),
        uv = needUv ? new Float32Array(nv * 2) : null,
        idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let v0 = 0,
        i0 = 0;
      const batch: Batch = { mesh: null as unknown as THREE.Mesh, live: group.length };
      for (const u of group) {
        const r = u.r,
          g = r.mesh.geometry,
          P = g.attributes.position,
          N = g.attributes.normal,
          U = g.attributes.uv,
          C = g.attributes.color,
          mat = u.mat,
          useC = !!(mat.vertexColors && C);
        _m.fromArray(r.rel);
        _n.getNormalMatrix(_m);
        const flip = _m.determinant() < 0;
        if (mat.color) _c.copy(mat.color);
        else _c.set(0xffffff);
        for (let i = 0; i < P.count; i++) {
          const o = (v0 + i) * 3;
          _v.fromBufferAttribute(P, i).applyMatrix4(_m);
          pos[o] = _v.x;
          pos[o + 1] = _v.y;
          pos[o + 2] = _v.z;
          _v.fromBufferAttribute(N, i).applyMatrix3(_n).normalize();
          nor[o] = _v.x;
          nor[o + 1] = _v.y;
          nor[o + 2] = _v.z;
          col[o] = _c.r * (useC ? C.getX(i) : 1);
          col[o + 1] = _c.g * (useC ? C.getY(i) : 1);
          col[o + 2] = _c.b * (useC ? C.getZ(i) : 1);
          if (uv && U) {
            uv[(v0 + i) * 2] = U.getX(i);
            uv[(v0 + i) * 2 + 1] = U.getY(i);
          }
        }
        const n = u.count - (u.count % 3);
        for (let i = 0; i < n; i += 3) {
          const s0 = u.start + i,
            a = g.index ? g.index.getX(s0) : s0,
            b = g.index ? g.index.getX(s0 + 1) : s0 + 1,
            c = g.index ? g.index.getX(s0 + 2) : s0 + 2;
          idx[i0 + i] = v0 + a;
          idx[i0 + i + 1] = v0 + (flip ? c : b);
          idx[i0 + i + 2] = v0 + (flip ? b : c);
        }
        r.parts.push({ b: batch, i0, i1: i0 + n });
        v0 += P.count;
        i0 += n;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const m = src.clone();
      delete m.userData.cloudShade;
      m.color?.set(0xffffff);
      m.vertexColors = true;
      const mesh = new THREE.Mesh(geo, m);
      mesh.name = 'batch';
      mesh.userData.isBatch = true;
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      mesh.renderOrder = first.renderOrder;
      mesh.frustumCulled = first.frustumCulled;
      mesh.layers.mask = first.layers.mask;
      mesh.raycast = () => {}; // the originals answer rays, as before
      batch.mesh = mesh;
      root.add(mesh);
      mesh.updateMatrixWorld(true);
      mesh.matrixAutoUpdate = false;
      batches.add(batch);
      opts.onBatch?.(mesh);
    }
  }

  function release() {
    for (const r of [...recs.values()]) drop(r);
    order.length = 0;
  }

  return {
    /** Once a frame, after the scene has been drawn at least once. */
    update(dt: number) {
      if (!on) return;
      clock += dt;
      inv.clear();
      if ((scanT -= dt) <= 0) {
        scanT = 1;
        scan();
      }
      // re-check a slice of the meshes each frame
      const n = Math.min(order.length, 220);
      for (let k = 0; k < n; k++) {
        if (cursor >= order.length) cursor = 0;
        const rec = order[cursor];
        if (check(rec)) cursor++;
        else {
          order[cursor] = order[order.length - 1];
          order.pop();
        }
      }
      // fold in one root's worth of settled meshes at a time, so no single frame does much
      if ((bakeT -= dt) <= 0) {
        bakeT = 0.2;
        const wait = new Map<THREE.Object3D, Rec[]>();
        for (const r of order) {
          if (r.parts.length || clock - r.since < 3 || !r.state.endsWith('v')) continue;
          let a = wait.get(r.root);
          if (!a) wait.set(r.root, (a = []));
          a.push(r);
        }
        let best: THREE.Object3D | null = null,
          bn = 3;
        for (const [root, a] of wait)
          if (a.length > bn) {
            bn = a.length;
            best = root;
          }
        if (best) bake(best, wait.get(best)!);
      }
    },
    /** Turn batching off (everything shows as its original self again) or back on. */
    setOn(v: boolean) {
      if (v === on) return;
      on = v;
      if (!v) release();
    },
    /** Debug: why a mesh isn't in a batch. */
    why(o: any): string {
      const r = recs.get(o);
      if (r) return r.parts.length ? 'baked' : !r.state.endsWith('v') ? 'hidden' : 'waiting';
      if (o.userData.isBatch) return 'batch';
      if (o.isSkinnedMesh) return 'skinned';
      if (o.isInstancedMesh) return 'instanced';
      if (o.children.length) return 'has children';
      const m = o.material;
      if (Array.isArray(m)) return matKey(m) ? 'multi: geometry' : 'multi: material';
      if (m.transparent || m.opacity < 1) return 'transparent';
      if (hooked(m)) return 'own shader';
      if (matKey(m) === null) return 'material type ' + m.type;
      for (let p = o.parent; p; p = p.parent) if (p.isBone) return 'on a bone';
      return meshOk(o) ? 'unseen' : 'geometry';
    },
    stats() {
      let baked = 0;
      for (const r of recs.values()) if (r.parts.length) baked++;
      return { watched: recs.size, baked, batches: batches.size };
    },
  };
}
