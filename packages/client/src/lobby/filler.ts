// Nobody's buildings: shops and apartment blocks from the "Buildings | PS1 Asset Pack" (McPato, CC BY 4.0; see
// docs/credits.md) standing along roads the town doesn't otherwise use, so the place reads as part of a bigger one.
// Scenery only: they are outside where anyone can walk.
import * as THREE from 'three';
import { loadProps } from '../world/propPacks';

type Face = 'N' | 'S' | 'E' | 'W';
const YAW: Record<Face, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
/** [building, the middle of its street front (x, z), the way the front faces] */
const PLACES: [string, number, number, Face, string[]?][] = [
  // Shady Lane's south side, either side of the road up from the gate, facing the lane
  ['burguer', -12, -62.5, 'N'],
  ['Plane017', -25, -62.5, 'N'],
  ['Pizzeria', 12, -62.5, 'N'],
  ['restaurant', 23, -62.5, 'N'],
  ['farmacia', 34, -62.5, 'N', ['farmacia_glass']],
  ['Plane014', 43.5, -62.5, 'N'],
  // and one at each end of its north side, beside the pawn shop and the lounge
  ['Plane019', -25, -74.4, 'S'],
  ['polleria', 43, -74.4, 'S'],
  // where the hills were, south of town: apartment blocks looking back at it
  ['Condo001', -24, 70, 'N'],
  ['Condo005', 22, 76, 'N'],
  ['Condo003', 62, 68, 'N'],
];
export function buildFiller(scene: THREE.Scene) {
  const G = new THREE.Group();
  G.name = 'filler';
  scene.add(G);
  void loadProps('buildings', n =>
    n.includes('street')
      ? 'street'
      : n.includes('glasss')
        ? n.replace(/_glasss.*/, '_glass')
        : n.replace(/_(atlas|atals|concrete|grass|emit).*$/, ''),
  ).then(kit => {
    const streetZ = kit.at('street')?.z ?? 0,
      up = new THREE.Vector3(0, 1, 0);
    for (const [name, fx, fz, face, extra = []] of PLACES) {
      const o = kit.make(name),
        sz = kit.size(name),
        c = kit.at(name);
      if (!o || !sz || !c) continue;
      const yaw = YAW[face] + (streetZ > c.z ? 0 : Math.PI), // the pack's shops face its street
        back = new THREE.Vector3(0, 0, -sz.z / 2).applyAxisAngle(up, YAW[face]); // from the front's middle to the building's
      o.position.set(fx + back.x, 0, fz + back.z);
      o.rotation.y = yaw;
      o.castShadow = false;
      G.add(o);
      for (const e of extra) {
        const g = kit.make(e),
          ec = kit.at(e);
        if (!g || !ec) continue;
        g.position.copy(o.position).add(ec.sub(c).applyAxisAngle(up, yaw));
        g.rotation.y = yaw;
        g.castShadow = false;
        G.add(g);
      }
    }
  });
}
