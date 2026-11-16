// Life at ground level (world-feel.md §3): small birds pecking on the ground that take off when someone runs or
// drives at them, and (in town) a stray cat that bolts for its next hiding place when you get close.
// Decoration only, not synced: each player has their own birds and cat. Built in code (asset-audit.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ambience } from '../audio/ambience';

/** Something that can startle wildlife: where it is and how fast it's going (m/s). */
export type Scarer = { x: number; z: number; spd: number };
export type CritterHost = {
  /** ground height at a point */
  ground(x: number, z: number): number;
  /** is this spot free to stand on (not inside a wall, water, a building)? */
  open(x: number, z: number): boolean;
  /** places birds like to land: [x, z, radius]. One is picked at random each time. */
  birdSpots: [number, number, number][];
  /** hiding places for the cat, visited in turn. Leave empty for no cat. */
  catSpots?: [number, number, number][]; // x, z, facing
};

const BIRDS = 7;
function birdGeo() {
  // body, head, beak, tail, and two wings whose vertices carry uv.x = 1 (the shader folds or flaps them)
  const tag = (g: THREE.BufferGeometry, wing: number, col: [number, number, number]) => {
    const n = g.attributes.position.count,
      uv = new Float32Array(n * 2),
      c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      uv[i * 2] = wing;
      c.set(col, i * 3);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const body = tag(new THREE.SphereGeometry(0.06, 8, 6).scale(0.8, 0.8, 1.35).translate(0, 0.075, 0), 0, [0.36, 0.27, 0.2]),
    head = tag(new THREE.SphereGeometry(0.036, 8, 6).translate(0, 0.125, 0.07), 0, [0.3, 0.22, 0.17]),
    beak = tag(new THREE.ConeGeometry(0.012, 0.035, 5).rotateX(Math.PI / 2).translate(0, 0.122, 0.115), 0, [0.85, 0.6, 0.2]),
    tail = tag(new THREE.BoxGeometry(0.035, 0.008, 0.09).rotateX(0.35).translate(0, 0.085, -0.11), 0, [0.22, 0.17, 0.14]);
  const wings: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BufferGeometry(),
      P = [0, 0.1, 0.05, 0, 0.1, -0.06, s * 0.17, 0.1, -0.02];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.3, 0.23, 0.17, 0.3, 0.23, 0.17, 0.2, 0.15, 0.12], 3));
    wings.push(g);
  }
  return mergeGeometries([body, head, beak, tail, ...wings], false);
}
function catModel() {
  const g = new THREE.Group(),
    fur = new THREE.MeshStandardMaterial({ color: '#c9752e', roughness: 0.9 }),
    dark = new THREE.MeshStandardMaterial({ color: '#8a4a1c', roughness: 0.9 }),
    pale = new THREE.MeshStandardMaterial({ color: '#f1e3cf', roughness: 0.9 }),
    eye = new THREE.MeshStandardMaterial({ color: '#b8e04a', emissive: '#6a8a1a', emissiveIntensity: 0.6, roughness: 0.3 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const body = add(new THREE.CapsuleGeometry(0.075, 0.22, 4, 8).rotateX(Math.PI / 2), fur, 0, 0.2, 0);
  for (const z of [-0.07, 0.02, 0.1]) add(new THREE.TorusGeometry(0.076, 0.008, 4, 12), dark, 0, 0.2, z); // tabby stripes
  add(new THREE.SphereGeometry(0.06, 8, 6).scale(0.8, 0.7, 0.5), pale, 0, 0.165, 0.13); // chest
  const head = new THREE.Group();
  head.position.set(0, 0.29, 0.2);
  g.add(head);
  add(new THREE.SphereGeometry(0.068, 10, 8).scale(1.08, 0.92, 0.95), fur, 0, 0, 0, head);
  add(new THREE.SphereGeometry(0.03, 8, 6).scale(1.2, 0.8, 0.8), pale, 0, -0.022, 0.055, head);
  add(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshStandardMaterial({ color: '#d98a8a' }), 0, -0.012, 0.078, head);
  for (const s of [-1, 1]) {
    const ear = add(new THREE.ConeGeometry(0.026, 0.05, 4), fur, s * 0.04, 0.066, -0.005, head);
    ear.rotation.z = -s * 0.25;
    add(new THREE.SphereGeometry(0.0125, 8, 6).scale(1, 1.15, 0.5), eye, s * 0.027, 0.012, 0.058, head);
    add(new THREE.SphereGeometry(0.005, 6, 4).scale(0.6, 1.5, 0.5), new THREE.MeshBasicMaterial({ color: '#111' }), s * 0.027, 0.012, 0.065, head);
  }
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-0.045, 0.1],
    [0.045, 0.1],
    [-0.045, -0.1],
    [0.045, -0.1],
  ]) {
    const l = add(new THREE.CylinderGeometry(0.02, 0.017, 0.16, 6).translate(0, -0.08, 0), fur, x, 0.16, z);
    add(new THREE.SphereGeometry(0.02, 6, 4).scale(1, 0.6, 1.3), pale, 0, -0.16, 0.008, l);
    legs.push(l);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.24, -0.17);
  g.add(tail);
  add(new THREE.CylinderGeometry(0.014, 0.02, 0.26, 6).translate(0, 0.13, 0), fur, 0, 0, 0, tail);
  add(new THREE.SphereGeometry(0.016, 6, 4), dark, 0, 0.26, 0, tail);
  return { g, body, head, legs, tail };
}

export function createCritters(scene: THREE.Scene, host: CritterHost) {
  // ---------------- birds on the ground
  const geo = birdGeo(),
    aFly = new Float32Array(BIRDS),
    aPh = new Float32Array(BIRDS);
  for (let i = 0; i < BIRDS; i++) aPh[i] = Math.random() * 6.28;
  geo.setAttribute('aFly', new THREE.InstancedBufferAttribute(aFly, 1));
  geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(aPh, 1));
  const uT = { value: 0 },
    mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uBT = uT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFly; attribute float aPh; uniform float uBT;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (uv.x > .5) {                                   // a wing tip: folded along the body on the ground, flapping in the air
          transformed.x *= mix(.22, 1., aFly); transformed.y += aFly * sin(uBT * 26. + aPh) * .1 - (1. - aFly) * .02; }`,
      );
  };
  const mesh = new THREE.InstancedMesh(geo, mat, BIRDS);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  type Bird = { x: number; y: number; z: number; yaw: number; hop: number; peck: number; fx: number; fz: number; t: number };
  const birds: Bird[] = [];
  let state: 'away' | 'ground' | 'flying' = 'away',
    wait = 4 + Math.random() * 6,
    flyT = 0;
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    v = new THREE.Vector3(),
    one = new THREE.Vector3(1, 1, 1);
  function land(cam: THREE.Vector3) {
    // a spot that's free, out of arm's reach and not right under the camera
    const picks = host.birdSpots.filter(s => Math.hypot(s[0] - cam.x, s[1] - cam.z) > 12);
    const s = (picks.length ? picks : host.birdSpots)[Math.floor(Math.random() * (picks.length || host.birdSpots.length))];
    if (!s) return;
    birds.length = 0;
    const n = 4 + Math.floor(Math.random() * (BIRDS - 3));
    for (let i = 0, tries = 0; i < n && tries < 60; tries++) {
      const a = Math.random() * 6.28,
        d = Math.sqrt(Math.random()) * s[2],
        x = s[0] + Math.sin(a) * d,
        z = s[1] + Math.cos(a) * d;
      if (!host.open(x, z)) continue;
      birds.push({ x, y: host.ground(x, z), z, yaw: Math.random() * 6.28, hop: Math.random() * 3, peck: Math.random() * 2, fx: 0, fz: 0, t: 0 });
      i++;
    }
    if (birds.length) state = 'ground';
  }

  // ---------------- the cat
  const spots = host.catSpots || [],
    cat = spots.length ? catModel() : null;
  const C = { i: 0, x: 0, z: 0, yaw: 0, run: false, phase: 0, meow: 20 + Math.random() * 40, calm: 0 };
  if (cat) {
    scene.add(cat.g);
    C.i = Math.floor(Math.random() * spots.length);
    [C.x, C.z, C.yaw] = spots[C.i];
  }

  function update(dt: number, cam: THREE.Camera, scarers: Scarer[]) {
    uT.value += dt;
    const cp = cam.position;
    // birds
    if (state === 'away') {
      if ((wait -= dt) <= 0) {
        land(cp);
        wait = 5;
      }
    } else if (state === 'ground') {
      let scared: Scarer | null = null;
      for (const s of scarers)
        for (const b of birds) {
          const d = Math.hypot(s.x - b.x, s.z - b.z);
          if (d < (s.spd > 4.5 ? 9 : s.spd > 1 ? 4.2 : 2.2)) scared = s;
        }
      if (scared) {
        state = 'flying';
        flyT = 0;
        // everyone leaves the same way: away from whatever came at them, with a little spread
        const cx = birds.reduce((a, b) => a + b.x, 0) / birds.length,
          cz = birds.reduce((a, b) => a + b.z, 0) / birds.length,
          away = Math.atan2(cx - scared.x, cz - scared.z);
        for (const b of birds) {
          const a = away + (Math.random() - 0.5) * 0.9,
            sp = 7 + Math.random() * 3;
          b.fx = Math.sin(a) * sp;
          b.fz = Math.cos(a) * sp;
          b.yaw = a;
          b.t = Math.random() * 0.25; // they don't all go at once
        }
        ambience.flutter(v.set(cx, 1, cz), cam, birds.length);
      } else
        for (const b of birds) {
          // hop a step now and then, peck in between
          if ((b.hop -= dt) < 0) {
            b.hop = 0.8 + Math.random() * 3;
            b.yaw += (Math.random() - 0.5) * 2;
            const nx = b.x + Math.sin(b.yaw) * 0.16,
              nz = b.z + Math.cos(b.yaw) * 0.16;
            if (host.open(nx, nz)) {
              b.x = nx;
              b.z = nz;
              b.y = host.ground(nx, nz);
              b.t = 0.18;
            }
          }
          b.t = Math.max(0, b.t - dt);
          b.peck = (b.peck + dt) % 2.6;
        }
    } else {
      flyT += dt;
      for (const b of birds) {
        if (flyT < b.t) continue;
        b.x += b.fx * dt;
        b.z += b.fz * dt;
        b.y += (3.2 + (flyT - b.t) * 0.6) * dt;
      }
      if (flyT > 7) {
        state = 'away';
        wait = 18 + Math.random() * 30;
        birds.length = 0;
      }
    }
    mesh.count = birds.length;
    birds.forEach((b, i) => {
      const flying = state === 'flying' && flyT >= b.t,
        peck = !flying && b.peck < 0.5 ? Math.sin((b.peck / 0.5) * Math.PI * 3) ** 2 * 0.9 : 0,
        hop = !flying && b.t > 0 ? Math.sin((b.t / 0.18) * Math.PI) * 0.04 : 0;
      aFly[i] = flying ? 1 : 0;
      e.set(flying ? -0.5 : peck, b.yaw, 0, 'YXZ');
      m4.compose(v.set(b.x, b.y + hop, b.z), q.setFromEuler(e), one);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    (geo.attributes.aFly as THREE.BufferAttribute).needsUpdate = true;

    // the cat
    if (!cat) return;
    const tgt = spots[C.i];
    if (!C.run) {
      C.calm += dt;
      let near = 99;
      for (const s of scarers) near = Math.min(near, Math.hypot(s.x - C.x, s.z - C.z) - (s.spd > 4.5 ? 3 : 0));
      if (near < 3.2 && C.calm > 1.5) {
        // bolt for the hiding place farthest from whoever came too close
        let best = C.i,
          bd = -1;
        spots.forEach((s, i) => {
          if (i === C.i) return;
          let d = 1e9;
          for (const sc of scarers) d = Math.min(d, Math.hypot(sc.x - s[0], sc.z - s[1]));
          d -= Math.hypot(s[0] - C.x, s[1] - C.z) * 0.35; // but not right across town if somewhere nearer will do
          if (d > bd) {
            bd = d;
            best = i;
          }
        });
        C.i = best;
        C.run = true;
        if (Math.random() < 0.5) ambience.meow(v.set(C.x, 0.3, C.z), cam, true);
      } else if ((C.meow -= dt) < 0) {
        C.meow = 50 + Math.random() * 90;
        if (Math.hypot(cp.x - C.x, cp.z - C.z) < 22) ambience.meow(v.set(C.x, 0.3, C.z), cam, false);
      }
    } else {
      const dx = tgt[0] - C.x,
        dz = tgt[1] - C.z,
        d = Math.hypot(dx, dz),
        step = 7.5 * dt;
      if (d <= step) {
        C.x = tgt[0];
        C.z = tgt[1];
        C.yaw = tgt[2];
        C.run = false;
        C.calm = 0;
      } else {
        C.x += (dx / d) * step;
        C.z += (dz / d) * step;
        C.yaw = Math.atan2(dx, dz);
        C.phase += dt * 22;
      }
    }
    const gy = host.ground(C.x, C.z),
      t = uT.value;
    cat.g.position.set(C.x, gy + (C.run ? Math.abs(Math.sin(C.phase)) * 0.05 : 0), C.z);
    cat.g.rotation.y = C.yaw;
    if (C.run) {
      // a bounding gallop: front and back pairs swing against each other, tail streaming
      cat.legs.forEach((l, i) => (l.rotation.x = Math.sin(C.phase + (i < 2 ? 0 : Math.PI)) * 0.9));
      cat.body.rotation.x = Math.sin(C.phase) * 0.08;
      cat.tail.rotation.x = -1.2;
      cat.head.rotation.set(0, 0, 0);
    } else {
      // sitting: haunches down, front legs straight, tail curling, head following the nearest person
      cat.legs.forEach((l, i) => (l.rotation.x = i < 2 ? 0 : 1.35));
      cat.body.rotation.x = -0.42;
      cat.tail.rotation.set(-1.9 + Math.sin(t * 0.9) * 0.12, 0, Math.sin(t * 1.3) * 0.5);
      let look = 0;
      const s0 = scarers[0];
      if (s0 && Math.hypot(s0.x - C.x, s0.z - C.z) < 14) {
        look = Math.atan2(s0.x - C.x, s0.z - C.z) - C.yaw;
        look = Math.max(-1.3, Math.min(1.3, Math.atan2(Math.sin(look), Math.cos(look))));
      }
      cat.head.rotation.y += (look - cat.head.rotation.y) * (1 - Math.exp(-dt * 4));
      cat.head.rotation.x = 0.1;
    }
  }
  // dev: one entry per scene (the town first, then the course)
  ((window as any).__critters ??= []).push({
    birds,
    C,
    land: () => ((state = 'away'), (wait = 0)),
    get state() {
      return state;
    },
  });
  return { update };
}
