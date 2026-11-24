// Moon buggies: little open rovers that drive back and forth across a Moon hole. Where each one is comes from the
// shared buggyAt() on the wall clock, the same clock a shot's simulation uses, so a ball that hits one in the
// simulation hits it on screen too (to within the time a shot takes to reach other players).
import * as THREE from 'three';
import { COURSE, buggyAt, heightAt, normalAt } from '@gh/shared';

function buggyMesh(tint: string) {
  const g = new THREE.Group(),
    body = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6, metalness: 0.3, flatShading: true }),
    frame = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.4, metalness: 0.7 }),
    tyre = new THREE.MeshStandardMaterial({ color: '#2b2b2d', roughness: 0.9 }),
    gold = new THREE.MeshStandardMaterial({ color: '#d8a23a', roughness: 0.35, metalness: 0.8 }),
    white = new THREE.MeshStandardMaterial({ color: '#eceff1', roughness: 0.5 }),
    visor = new THREE.MeshStandardMaterial({ color: '#e0a24a', roughness: 0.15, metalness: 0.9 });
  // chassis: a flat deck with a gold-foil box at the back and a dish on a stalk
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 2.9), frame);
  deck.position.y = 0.7;
  g.add(deck);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.7), body);
  nose.position.set(0, 0.88, 1.15);
  g.add(nose);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.7), gold);
  box.position.set(0, 1.05, -1.1);
  g.add(box);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), frame);
  stalk.position.set(0.5, 1.6, -0.9);
  g.add(stalk);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 5, 0, Math.PI * 2, 0, 1), white);
  (dish.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  dish.position.set(0.5, 2.05, -0.9);
  dish.rotation.x = -1.9;
  g.add(dish);
  // fenders and four wire-mesh wheels
  const wheels: THREE.Mesh[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 12).rotateZ(Math.PI / 2), tyre);
      w.position.set(sx * 0.98, 0.42, sz * 1.05);
      g.add(w);
      wheels.push(w);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.95), body);
      f.position.set(sx * 0.98, 0.9, sz * 1.05);
      g.add(f);
    }
  // a driver in a white suit with a gold visor, sitting front left
  const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.45, 4, 8), white);
  suit.position.set(0.35, 1.25, 0.25);
  g.add(suit);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), white);
  helm.position.set(0.35, 1.78, 0.25);
  g.add(helm);
  const vis = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, -0.9, 1.8, 0.7, 1.2), visor);
  vis.position.set(0.35, 1.78, 0.29);
  g.add(vis);
  g.traverse(o => ((o as THREE.Mesh).castShadow = true));
  return { g, wheels };
}

export function buildBuggies(scene: THREE.Object3D) {
  const list = (COURSE.buggies || []).map((b, i) => {
    const m = buggyMesh(i % 2 ? '#d0d4d8' : '#c8582e');
    scene.add(m.g);
    return { b, ...m, roll: 0, dust: 0 };
  });
  const up = new THREE.Vector3(0, 1, 0),
    n = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    qy = new THREE.Quaternion();
  return {
    /** move every buggy to where it is now; the wheels turn with the distance covered */
    update(dt: number, nowS = Date.now() / 1000) {
      for (const k of list) {
        const p = buggyAt(k.b, nowS),
          y = heightAt(p.x, p.z);
        k.g.position.set(p.x, y, p.z);
        const [nx, ny, nz] = normalAt(p.x, p.z);
        n.set(nx, ny, nz);
        q.setFromUnitVectors(up, n);
        qy.setFromAxisAngle(up, p.yaw);
        k.g.quaternion.copy(q).multiply(qy);
        k.roll += (k.b.v * dt) / 0.42;
        for (const w of k.wheels) w.rotation.x = k.roll;
      }
    },
    count: list.length,
  };
}
