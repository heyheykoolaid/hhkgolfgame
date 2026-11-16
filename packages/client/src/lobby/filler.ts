// Nobody's buildings: shops and apartment blocks from the "Buildings | PS1 Asset Pack" (McPato, CC BY 4.0; see
// docs/credits.md) standing along roads the town doesn't otherwise use, so the place reads as part of a bigger one.
// Scenery only: they are outside where anyone can walk.
import * as THREE from 'three';
import { loadProps } from '../world/propPacks';

type Face = 'N' | 'S' | 'E' | 'W';
const YAW: Record<Face, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
/** [building, the middle of its street front (x, z), the way the front faces] */
const PLACES: [string, number, number, Face, string[]?][] = [
  // Shady Lane's south side, in the two blocks between the gate road and Fairway Loop's sides, facing the lane
  ['Plane017', -29.5, -62.5, 'N'],
  ['Plane014', -20.6, -62.5, 'N'],
  ['Pizzeria', -11.9, -62.5, 'N'],
  ['farmacia', 11.1, -62.5, 'N', ['farmacia_glass']],
  ['restaurant', 19.2, -62.5, 'N'],
  ['Plane014', 25.1, -62.5, 'N'],
  ['Plane019', 31.9, -62.5, 'N'],
  // and at each end of its north side, beside the pawn shop and the lounge
  ['burguer', -37.5, -74.4, 'S'],
  ['Plane019', -25, -74.4, 'S'],
  ['polleria', 43.4, -74.4, 'S'],
  // where the hills were, south of town: apartment blocks looking back at it
  ['Condo001', -24, 70, 'N'],
  ['Condo005', 22, 76, 'N'],
  ['Condo003', 62, 68, 'N'],
];
/** Each building's footprint in metres (width along its front, depth), as measured from the pack: known ahead of the
 *  models loading, so their walls are solid from the first frame. */
const SIZE: Record<string, [number, number]> = {
  burguer: [12, 19],
  Plane017: [10.8, 14.3],
  Pizzeria: [11.4, 11.3],
  restaurant: [6, 7.5],
  farmacia: [10.2, 10.1],
  Plane014: [5.8, 6.3],
  Plane019: [8.2, 8],
  polleria: [14, 17.2],
  Condo001: [16, 35.6],
  Condo005: [24, 35.6],
  Condo003: [16, 35.6],
};
/** The hedges behind Shady Lane's south side: [x0, x1] at z = -49.3. */
const HEDGES: [number, number][] = [
  [-36, -6.5],
  [6.5, 36],
];
/** What stops you: every building's footprint and the hedges, as [x0, z0, x1, z1]. */
export const FILLER_BOXES: [number, number, number, number][] = [
  ...PLACES.map(([name, fx, fz, face]): [number, number, number, number] => {
    const [w, d] = SIZE[name] ?? [8, 8];
    return face === 'N'
      ? [fx - w / 2, fz, fx + w / 2, fz + d]
      : face === 'S'
        ? [fx - w / 2, fz - d, fx + w / 2, fz]
        : face === 'E'
          ? [fx - d, fz - w / 2, fx, fz + w / 2]
          : [fx, fz - w / 2, fx + d, fz + w / 2];
  }),
  ...HEDGES.map(([x0, x1]): [number, number, number, number] => [x0, -49.95, x1, -48.65]),
];
export function buildFiller(scene: THREE.Scene) {
  const G = new THREE.Group();
  G.name = 'filler';
  scene.add(G);
  // a tall clipped hedge along the back of Shady Lane's south side, so the town looks at green and not at the shops' backs
  const hedge = new THREE.MeshStandardMaterial({ color: '#3f5e34', roughness: 0.95 });
  for (const [x0, x1] of HEDGES) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 4.6, 1.3), hedge);
    h.position.set((x0 + x1) / 2, 2.3, -49.3);
    h.castShadow = h.receiveShadow = true;
    G.add(h);
  }
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
