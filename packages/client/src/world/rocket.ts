// The Rusty Rocket: the old carnival rocket ride behind the big top at Fun Land, and the same rocket standing behind
// the tee on the Moon, scorched from the trip. Code-built: a striped body, a cone nose with a lit porthole, three fins,
// landing legs and a boarding ladder. Its foot is at y = 0, about 2.2 m round; 13 m tall.
import * as THREE from 'three';

export function rustyRocket(scorched: boolean) {
  const rk = new THREE.Group(),
    rust = new THREE.MeshStandardMaterial({ color: scorched ? '#a44c2a' : '#c4602f', roughness: 0.8, metalness: 0.3, flatShading: true }),
    cream = new THREE.MeshStandardMaterial({ color: scorched ? '#d9cdb2' : '#efe4c8', roughness: 0.7, metalness: 0.2, flatShading: true }),
    steel = new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.4, metalness: 0.7 }),
    glass = new THREE.MeshStandardMaterial({ color: '#ffcf86', emissive: '#ffb050', emissiveIntensity: 0.8, roughness: 0.3 });
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.6, 16), i % 2 ? cream : rust);
    seg.position.y = 2.2 + i * 1.6;
    rk.add(seg);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.6, 16), rust);
  nose.position.y = 2.2 + 4 * 1.6 + 0.8 + 1.8;
  rk.add(nose);
  const port = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), glass);
  port.position.set(0, 7.6, 1.62);
  rk.add(port);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.7), new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.9 }));
  door.position.set(0, 3.4, 1.62);
  rk.add(door);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 3,
      fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 2.2), rust);
    fin.position.set(Math.sin(a) * 1.9, 2.4, Math.cos(a) * 1.9);
    fin.rotation.y = a;
    rk.add(fin);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6), steel);
    leg.position.set(Math.sin(a + 1) * 2.1, 0.9, Math.cos(a + 1) * 2.1);
    leg.rotation.set(Math.cos(a + 1) * 0.35, 0, -Math.sin(a + 1) * 0.35);
    rk.add(leg);
  }
  // a ladder up to the door, on the front (+z)
  for (const sx of [-0.4, 0.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.2, 0.07), steel);
    rail.position.set(sx, 1.4, 2.2);
    rail.rotation.x = -0.22;
    rk.add(rail);
  }
  for (let i = 0; i < 6; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), steel);
    rung.position.set(0, 0.2 + i * 0.5, 2.5 - i * 0.11);
    rk.add(rung);
  }
  if (scorched) {
    const soot = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.5, 0.9, 16), new THREE.MeshStandardMaterial({ color: '#2a221e', roughness: 1 }));
    soot.position.y = 1.4;
    rk.add(soot);
    const burn = new THREE.Mesh(
      new THREE.CircleGeometry(6, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#1e1b19', transparent: true, opacity: 0.55, depthWrite: false }),
    );
    burn.position.y = 0.05;
    rk.add(burn);
  }
  rk.traverse(o => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
  return rk;
}
