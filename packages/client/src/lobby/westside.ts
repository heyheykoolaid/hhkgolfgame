// The West Side: the first piece of the bigger town (lobby-design.md), through a gate in the town's west edge.
// One street with a row of buildings on its north side (the clubhouse, the Lucky Lie Lounge, Dealer Alley, the Grow
// Supply store), a water tower at the far end, a car park on the south side, and a delivery van doing its rounds.
// The buildings are built here in code, and so are the cars (world/cars.ts).
import { buildTrophy } from '../world/trophy';
import { buildShopRow } from './shops';
import { loadPiece, loadProps } from '../world/propPacks';
import { buildMachines, type VltSpot } from './vlt';
import * as THREE from 'three';
import { buildCar, CAR_PAINT, type CarKind } from '../world/cars';
import { M, box, cyl, textTex, photoM, tile, BOUND, WEST, WEST_OFF as WEST_AT, SHADY_OFF, BJ_AT, type Collider } from './world';
// (inside buildWestSide, WEST_OFF is whichever district is being built: the West Side, or Shady Lane for the four buildings moved there)
// (read through getters: this file and world.ts import each other, so world's values aren't there yet when this line runs)
const WEST_OFF: { readonly x: number; readonly y: number; readonly z?: number } = {
  get x() {
    return WEST_AT.x;
  },
  get y() {
    return WEST_AT.y;
  },
};

const ST = { z0: 10.5, z1: 17.5 }, // the street (it carries on from the town's south-west street)
  X0 = -44, // the gate: the town's west edge (-BOUND; written out because world.ts imports this file)
  XW = -116; // the turning circle at the far end
// Everything below is laid out in the district's own frame (as if it began at the town's edge, on the flat); the
// whole group is then moved west and lifted onto its rise (WEST_OFF). World positions go through these two.
const RAMP_X1 = -68, // where the street reaches the top (= WEST.x1; written out for the same reason as X0)
  OX = -24,
  OY = 2.6;
/** How high the ground is west of town: 0 at the town's edge, climbing the street to the district's level. */
export function westY(x: number, z: number) {
  void z;
  if (x <= RAMP_X1) return OY;
  const t = Math.max(0, Math.min(1, (X0 - x) / (X0 - RAMP_X1)));
  return OY * t * t * (3 - 2 * t); // eased at both ends, so the street meets the flat without a kink
}
/** What's underfoot in the West Side or on the street up to it ('' outside both). World coordinates. */
export function westSurface(wx: number, z: number): '' | 'asphalt' | 'paved' | 'grass' {
  if (wx > X0) return '';
  if (wx > RAMP_X1) {
    if (z > ST.z0 && z < ST.z1) return 'asphalt';
    return z > ST.z0 - 2.4 && z < ST.z1 + 2.4 ? 'paved' : '';
  }
  const x = wx - OX;
  if (x < -126 || z < -9 || z > 37) return '';
  if (z > ST.z0 && z < ST.z1) return 'asphalt';
  if (x > -68.5 && x < -52 && z > -6 && z <= ST.z0 - 2.4) return 'paved'; // inside the clubhouse (no grass indoors)
  if (z >= ST.z1 + 2.2 && z < 35 && x < -54 && x > -100) return 'asphalt'; // the car park
  if ((z > ST.z0 - 2.4 && z <= ST.z0) || (z >= ST.z1 && z < ST.z1 + 2.2)) return 'paved';
  return 'grass';
}

function flat(w: number, d: number, m: THREE.Material, x: number, z: number, y: number) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m);
  p.position.set(x, y, z);
  p.receiveShadow = true;
  return p;
}
function sign(lines: Parameters<typeof textTex>[0], w: number, h: number, bg: string, glow = 0, tw = 1024, th = 256) {
  const t = textTex(lines, tw, th, bg),
    m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  if (glow) {
    m.emissive = new THREE.Color('#ffffff');
    m.emissiveMap = t;
    m.emissiveIntensity = glow;
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** The rise itself: the street and sidewalks climbing from the town's edge, grass banks either side of them, and
 *  banks falling away all round the district so it reads as a low hill, not a slab. */
function buildRise(scene: THREE.Scene) {
  const G = new THREE.Group();
  G.name = 'westrise';
  const asphalt = photoM('asphalt', '#55524c'),
    pavers = photoM('pavers', '#b9ad98'),
    grass = new THREE.MeshStandardMaterial({ map: photoM('meadow', '#8a8a46').map, color: '#c9c98a', roughness: 1 });
  /** A strip of ground from a list of cross-sections: at each x, points (z, y) across it. uv in metres / size. */
  const strip = (xs: number[], cross: (x: number) => [number, number][], m: THREE.Material, size: number, lift = 0) => {
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [],
      n = cross(xs[0]).length;
    xs.forEach((x, i) => {
      cross(x).forEach(([z, y], k) => {
        pos.push(x, y + lift, z);
        uv.push(x / size, z / size);
        if (i < xs.length - 1 && k < n - 1) {
          const o = i * n + k;
          idx.push(o, o + 1, o + n, o + 1, o + n + 1, o + n);
        }
      });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m);
    (m as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    mesh.receiveShadow = true;
    G.add(mesh);
  };
  const xs: number[] = [];
  for (let x = X0; x >= RAMP_X1 - 0.01; x -= 1) xs.push(x);
  const h = (x: number) => westY(x, 0);
  strip(
    xs,
    x => [
      [ST.z0, h(x)],
      [ST.z1, h(x)],
    ],
    asphalt,
    1.7,
    0.035,
  );
  strip(
    xs,
    x => [
      [ST.z0 - 2.4, h(x)],
      [ST.z0, h(x)],
    ],
    pavers,
    2.4,
    0.06,
  );
  strip(
    xs,
    x => [
      [ST.z1, h(x)],
      [ST.z1 + 2.4, h(x)],
    ],
    pavers,
    2.4,
    0.06,
  );
  // The hill itself is one continuous grass surface: flat on top under the district, falling away over BANK metres
  // all round, and shaped to the street where it climbs (the paving above sits a few centimetres clear of it).
  const X_W = -126 + OX - 30, // (kept short of where the city's towers begin, 240 m out)
    Z_N = -9 - 24,
    Z_S = 37 + 26,
    BANK = 13,
    ease = (t: number) => {
      t = Math.max(0, Math.min(1, t));
      return t * t * (3 - 2 * t);
    },
    riseY = (x: number, z: number) => {
      const dx = Math.max(X_W - x, 0, x - RAMP_X1),
        dz = Math.max(Z_N - z, 0, z - Z_S),
        top = OY * ease(1 - Math.hypot(dx, dz) / BANK);
      let st = 0;
      if (x > RAMP_X1 && x < X0 + 1) {
        const hy = h(Math.min(x, X0)),
          off = Math.max(0, Math.abs(z - 14) - 5.9);
        st = hy * ease(1 - off / (3 + hy * 3.2));
      }
      return Math.max(top, st);
    },
    STEP = 2,
    gx0 = X_W - BANK - 2,
    gz0 = Z_N - BANK - 2,
    nx = Math.ceil((X0 + 2 - gx0) / STEP),
    nz = Math.ceil((Z_S + BANK + 2 - gz0) / STEP),
    pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  for (let k = 0; k <= nz; k++)
    for (let i = 0; i <= nx; i++) {
      const x = Math.min(gx0 + i * STEP, X0 + 0.5),
        z = gz0 + k * STEP;
      pos.push(x, riseY(x, z) - 0.03, z);
      uv.push(x / 9, z / 9);
      if (i < nx && k < nz) {
        const o = k * (nx + 1) + i;
        idx.push(o, o + nx + 1, o + 1, o + 1, o + nx + 1, o + nx + 2);
      }
    }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hg.setIndex(idx);
  hg.computeVertexNormals();
  const hill = new THREE.Mesh(hg, grass);
  hill.receiveShadow = true;
  G.add(hill);
  scene.add(G);
}
/** The rise as triangles for the cart's and the ragdoll's physics: the street's slope and the flat top. */
export function westRiseMesh() {
  const v: number[] = [],
    idx: number[] = [],
    quad = (a: number[], b: number[], c: number[], d: number[]) => {
      const o = v.length / 3;
      v.push(...a, ...b, ...c, ...d);
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    };
  for (let x = X0; x > RAMP_X1; x -= 1) quad([x, westY(x, 0), 6], [x, westY(x, 0), 22], [x - 1, westY(x - 1, 0), 6], [x - 1, westY(x - 1, 0), 22]);
  quad([RAMP_X1, OY, -40], [RAMP_X1, OY, 70], [-182, OY, -40], [-182, OY, 70]);
  return { verts: new Float32Array(v), indices: new Uint32Array(idx) };
}

export function buildWestSide(scene: THREE.Scene, colliders: Collider[]) {
  const GW = new THREE.Group();
  GW.name = 'westside';
  GW.position.set(WEST_OFF.x, WEST_OFF.y, 0);
  scene.add(GW);
  // Shady Lane's group: the same frame, moved north of the gate instead (world.ts SHADY_OFF)
  const GS = new THREE.Group();
  GS.name = 'shadylane';
  GS.position.set(SHADY_OFF.x, SHADY_OFF.y, SHADY_OFF.z);
  scene.add(GS);
  // what is being built goes into G and its walls are offset by `at` (the helpers below read both when called)
  let G = GW,
    at: { x: number; z?: number } = WEST_OFF;
  const col = (x0: number, x1: number, z0: number, z1: number, tag = 'shop') =>
    colliders.push({ x0: x0 + at.x, x1: x1 + at.x, z0: z0 + (at.z || 0), z1: z1 + (at.z || 0), tag });
  buildRise(scene);
  const white = M('#f1eee6', 0.8),
    dark = M('#2a2420', 0.8),
    wood = M('#8a6a45', 0.9),
    glass = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb45a', emissiveIntensity: 0.55, roughness: 0.4 }),
    asphalt = photoM('asphalt', '#55524c'),
    pavers = photoM('pavers', '#b9ad98');

  // ---------------- ground: the street, its sidewalks, the turning circle and the car park
  const L = X0 - XW;
  G.add(tile(flat(L, ST.z1 - ST.z0, asphalt, (X0 + XW) / 2, (ST.z0 + ST.z1) / 2, 0.035), 1.7));
  G.add(tile(flat(L, 2.2, pavers, (X0 + XW) / 2, ST.z0 - 1.1, 0.06), 2.4), tile(flat(L, 2.2, pavers, (X0 + XW) / 2, ST.z1 + 1.1, 0.06), 2.4));
  const circle = new THREE.Mesh(new THREE.CircleGeometry(8.5, 40).rotateX(-Math.PI / 2), asphalt);
  circle.position.set(XW, 0.034, 14);
  circle.receiveShadow = true;
  G.add(circle, cyl(2.6, 2.8, 0.35, 20, M('#6f8a4a', 0.95), XW, 0.17, 14));
  {
    const dashes: THREE.BufferGeometry[] = [];
    for (let x = X0 - 3; x > XW + 9; x -= 5) dashes.push(new THREE.PlaneGeometry(2.2, 0.16).rotateX(-Math.PI / 2).translate(x, 0.045, 14));
    const g = new THREE.BufferGeometry(),
      pos: number[] = [];
    for (const d of dashes) pos.push(...(d.toNonIndexed().attributes.position.array as Float32Array));
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    G.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#e9dfc6' })));
  }
  G.add(tile(flat(46, 15, asphalt, -77, 27.4, 0.03), 1.7));
  {
    const lines: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = -98.6 + i * 3.6;
      for (const z of [22.3, 32.5]) {
        const p = new THREE.PlaneGeometry(0.12, 4.6)
          .rotateX(-Math.PI / 2)
          .translate(x, 0.04, z)
          .toNonIndexed();
        lines.push(...(p.attributes.position.array as Float32Array));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    G.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#e9dfc6' })));
  }

  // ---------------- a building: walls, a flat or pitched roof, a door and lit windows on the street side (+z)
  function building(o: {
    x0: number;
    x1: number;
    z0: number;
    h: number;
    wall: string;
    trim?: string;
    roof?: 'flat' | 'pitch';
    roofC?: string;
    doorX?: number;
    windows?: number[];
    winY?: number;
  }) {
    const z1 = ST.z0 - 2.4,
      w = o.x1 - o.x0,
      d = z1 - o.z0,
      cx = (o.x0 + o.x1) / 2,
      cz = (o.z0 + z1) / 2,
      wall = M(o.wall, 0.85),
      trim = M(o.trim || '#f1eee6', 0.8),
      b = new THREE.Group();
    b.add(box(w, o.h, d, wall, cx, o.h / 2, cz), box(w + 0.3, 0.25, d + 0.3, trim, cx, 0.12, cz));
    if (o.roof === 'pitch') {
      const g = new THREE.BufferGeometry(),
        hw = w / 2 + 0.4,
        hd = d / 2 + 0.5,
        rh = Math.min(2.2, d * 0.28);
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          // two slopes (ridge runs along x) and the two gable ends
          [
            -hw,
            0,
            hd,
            hw,
            0,
            hd,
            hw,
            rh,
            0,
            -hw,
            0,
            hd,
            hw,
            rh,
            0,
            -hw,
            rh,
            0,
            hw,
            0,
            -hd,
            -hw,
            0,
            -hd,
            -hw,
            rh,
            0,
            hw,
            0,
            -hd,
            -hw,
            rh,
            0,
            hw,
            rh,
            0,
            -hw,
            0,
            -hd,
            -hw,
            0,
            hd,
            -hw,
            rh,
            0,
            hw,
            0,
            hd,
            hw,
            0,
            -hd,
            hw,
            rh,
            0,
          ],
          3,
        ),
      );
      g.computeVertexNormals();
      const r = new THREE.Mesh(g, M(o.roofC || '#6a4a3a', 0.9));
      r.position.set(cx, o.h, cz);
      r.castShadow = true;
      b.add(r);
    } else
      b.add(box(w + 0.4, 0.3, d + 0.4, M(o.roofC || '#3a3632', 0.9), cx, o.h + 0.15, cz), box(w + 0.1, 0.5, 0.15, trim, cx, o.h + 0.5, z1 + 0.1));
    if (o.doorX !== undefined)
      b.add(
        box(1.25, 2.25, 0.1, dark, o.doorX, 1.12, z1 + 0.03),
        box(1.5, 0.12, 0.16, trim, o.doorX, 2.3, z1 + 0.05),
        box(0.08, 0.08, 0.1, M('#d8b24a', 0.4, 0.6), o.doorX + 0.42, 1.1, z1 + 0.1),
      );
    for (const wx of o.windows || [])
      b.add(box(1.7, 1.25, 0.08, glass, wx, o.winY ?? 1.75, z1 + 0.02), box(1.9, 0.1, 0.18, trim, wx, (o.winY ?? 1.75) - 0.7, z1 + 0.06));
    G.add(b);
    col(o.x0, o.x1, o.z0, z1);
    return { z1, cx };
  }

  // 1 · the clubhouse: white clapboard, a green pitched roof, a veranda on posts
  {
    const c = building({
      x0: -68,
      x1: -52,
      z0: -5,
      h: 4.2,
      wall: '#ece6d8',
      roof: 'pitch',
      roofC: '#3f6a52',
      doorX: -60,
      windows: [-65.5, -63, -57, -54.5],
    });
    G.add(box(16.6, 0.14, 2.4, M('#3f6a52', 0.9), -60, 3.05, c.z1 + 1.15));
    for (let x = -67.8; x <= -52; x += 3.95) G.add(box(0.16, 3, 0.16, white, x, 1.5, c.z1 + 2.2));
    const s = sign([{ t: 'GOLDEN HILLS CLUBHOUSE', s: 86, c: '#ffe9a8', b: true, y: 150 }], 9.5, 1.2, '#2b4a3a', 0, 1024, 128 * 2);
    s.position.set(-60, 3.75, c.z1 + 2.42);
    G.add(s, box(1.8, 0.45, 0.5, wood, -63.5, 0.3, c.z1 + 1.4), box(1.8, 0.45, 0.5, wood, -56.5, 0.3, c.z1 + 1.4));
  }
  // A strip of shopfronts behind the car park, and two apartment blocks beyond the district for depth
  // ("Buildings | PS1 Asset Pack", McPato, CC BY 4.0; see docs/credits.md). Shells for now: the shops to come move in.
  void loadProps('buildings', n =>
    n.includes('street')
      ? 'street'
      : n.includes('glasss')
        ? n.replace(/_glasss.*/, '_glass')
        : n.replace(/_(atlas|atals|concrete|grass|emit).*$/, ''),
  ).then(kit => {
    const streetZ = kit.at('street')?.z ?? 0;
    /** Stand a building with its street front facing north (-z) along the line z = front; returns its width. */
    const stand = (name: string, x0: number, front: number, extra: string[] = [], south = false) => {
      const o = kit.make(name),
        sz = kit.size(name),
        c = kit.at(name);
      if (!o || !sz || !c) return 0;
      const yaw = (streetZ > c.z ? Math.PI : 0) + (south ? Math.PI : 0); // the pack's shops face its street; turned round if they should face south
      o.position.set(x0 + sz.x / 2, 0, south ? front - sz.z / 2 : front + sz.z / 2);
      o.rotation.y = yaw;
      G.add(o);
      for (const e of extra) {
        const g = kit.make(e),
          ec = kit.at(e);
        if (!g || !ec) continue;
        const d = ec.sub(c).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        g.position.copy(o.position).add(d);
        g.rotation.y = yaw;
        g.castShadow = false;
        G.add(g);
      }
      return sz.x;
    };
    // nobody's shops fill the main street's north side where the lounge, Grow Supply and the pawn shop stood before
    // they moved to Shady Lane: three in a row east of the water tower, one west of it
    let x = -106.5;
    for (const [n, ex] of [
      ['polleria', []],
      ['restaurant', []],
      ['Pizzeria', []],
    ] as [string, string[]][])
      x += stand(n, x, ST.z0 - 2.4, ex, true) + 1.2;
    stand('farmacia', -127, ST.z0 - 2.4, ['farmacia_glass'], true);
    for (const [n, px, pz, yaw] of [
      ['Condo002', -142, 14, Math.PI / 2],
      ['Condo004', -136, -22, 0],
    ] as [string, number, number, number][]) {
      const o = kit.make(n);
      if (!o) continue;
      o.position.set(px, 0, pz);
      o.rotation.y = yaw;
      o.castShadow = false;
      G.add(o);
    }
  });
  G.add(tile(flat(71, 3.4, pavers, -96.5, 36.5, 0.05), 2)); // the walk along the shopfronts
  const shopRow = buildShopRow(G, 38.2, (a, b, c, d) => col(a, b, c, d)); // Threads, the barber, Ink Spot and the Pro Shop (lobby/shops.ts)
  let vltSpots: VltSpot[] = [];
  // ---------------- Shady Lane: the lounge, the alley, Grow Supply and the pawn shop stand north of the gate to the
  // course (world.ts SHADY_OFF). Everything between here and the water tower is built into that group.
  G = GS;
  at = SHADY_OFF;
  {
    const G = GS,
      WEST_OFF = SHADY_OFF;

    // ---- Shady Lane's own ground (in the buildings' frame): the lane and its pavements, the road up from the gate, the
    // road on to the course between the pawn shop and Grow Supply, and a street sign at the junction
    G.add(
      tile(flat(82, 7, asphalt, -103, 14, 0.035), 1.7),
      tile(flat(82, 2.4, pavers, -103, 9.3, 0.06), 2.4),
      tile(flat(82, 2.4, pavers, -103, 18.7, 0.06), 2.4),
      tile(flat(7, 20.5, asphalt, -110, 27.75, 0.034), 1.7), // up from the gate
      tile(flat(2.4, 18, pavers, -114.7, 28.9, 0.06), 2.4),
      tile(flat(2.4, 18, pavers, -105.3, 28.9, 0.06), 2.4),
      tile(flat(7, 40, asphalt, -110, -11.9, 0.034), 1.7), // on to the first tee
      tile(flat(2.4, 17, pavers, -114.7, -0.4, 0.06), 2.4),
      tile(flat(2.4, 17, pavers, -105.3, -0.4, 0.06), 2.4),
    );
    for (let x = -142; x < -64; x += 5) if (Math.abs(x + 110) > 5) G.add(box(2.2, 0.01, 0.16, white, x, 0.05, 14));
    for (let z = 19; z < 37; z += 5) G.add(box(0.16, 0.01, 2.2, white, -110, 0.05, z + 1));
    {
      const post = cyl(0.05, 0.05, 3.1, 8, M('#3a3835', 0.6, 0.5), -105.4, 1.55, 19.6),
        plate = sign([{ t: 'SHADY LANE', s: 120, c: '#f4f1ea', b: true, y: 150 }], 1.9, 0.42, '#1f5a3a', 0.25);
      plate.position.set(-105.4, 2.95, 19.6);
      const back = plate.clone();
      back.rotation.y = Math.PI;
      G.add(post, plate, back);
    }
    // 2 · the Lucky Lie Lounge: a brick shell, open to the street, and inside it the front two-thirds of a real bar room
    // ("Barranco Bar | PS1 Environment", McPato, CC BY 4.0; see docs/credits.md): the long counter and its back bar on the
    // east side, leather booths in alcoves down the west wall, parquet, beams and lamps. Blackjack is played in the open
    // front of the room; the machines stand along the back wall at the end of the aisle.
    {
      const z1 = ST.z0 - 2.4,
        x0 = -86,
        x1 = -73.78, // (the shell's east wall stands right behind the bar's own back wall: no dead space between them)
        z0 = z1 - 16,
        h = 4.6,
        brick = M('#5a3a30', 0.85),
        trim = M('#1d1d1f', 0.8),
        cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2,
        d = z1 - z0;
      G.add(
        box(x1 - x0, h, 0.3, brick, cx, h / 2, z0 + 0.15), // back wall
        box(0.3, h, d, brick, x0 + 0.15, h / 2, cz),
        box(0.3, h, d, brick, x1 - 0.15, h / 2, cz),
        box(x1 - x0 + 0.4, 0.3, d + 0.4, M('#2a2420', 0.9), cx, h + 0.15, cz), // roof
        box(x1 - x0, 1.1, 0.3, brick, cx, h - 0.55, z1 - 0.15), // the beam over the open front
        box(0.5, h, 0.5, trim, x0 + 3.6, h / 2, z1 - 0.25),
        box(0.5, h, 0.5, trim, x1 - 3.6, h / 2, z1 - 0.25),
        box(x1 - x0 - 0.6, 0.05, d - 0.3, M('#2b2420', 0.9), cx, 0.06, cz + 0.1), // the stone threshold (the parquet lies on it)
        box(x1 - x0 - 0.6, 0.04, 0.5, M('#b08a3e', 0.4, 0.6), cx, 0.09, z1 - 2.5), // a brass strip where the parquet begins
        box(x1 - x0 - 0.6, 0.12, 2.5, M('#1a1614', 0.9), cx, 4.15, z1 - 1.4), // the ceiling over the threshold
      );
      // the room: scene (x, z) stands at (x + BAR.x, z + BAR.z) here; it is cut off at the back and east walls
      const BAR = { x: -77.1, y: 0.1, z: z1 - 2.5 + 12 };
      void loadPiece('lounge').then(p => {
        if (!p) return;
        const o = p.make(),
          cut = [
            new THREE.Plane(new THREE.Vector3(0, 0, 1), -(z0 + 0.31 + (WEST_OFF.z || 0))),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1 - 0.31 + WEST_OFF.x),
          ];
        o.position.set(p.origin.x + BAR.x, p.origin.y + BAR.y, p.origin.z + BAR.z);
        o.traverse(c => {
          const mesh = c as THREE.Mesh,
            m = mesh.material as THREE.MeshStandardMaterial;
          if (!mesh.isMesh) return;
          mesh.castShadow = false;
          mesh.receiveShadow = true; // (the shell's roof keeps the evening sun off the room)
          m.clippingPlanes = cut;
          if (m.map && !m.emissiveMap) {
            // dim by itself: a faint glow so nothing goes black, bright only where the lamps' own glass is; the light in the
            // room comes from the lamps below
            m.emissiveMap = m.map;
            m.emissive = new THREE.Color('#ffffff');
            m.emissiveIntensity = /EMIT/i.test(m.name) ? 1.6 : 0.09;
            if (!/EMIT/i.test(m.name)) m.color.multiplyScalar(0.62);
          }
        });
        G.add(o);
      });
      // lamps over the table (they glow; one real light keeps the room readable under its roof)
      for (const dx of [-1.2, 0, 1.2]) {
        const shade = new THREE.Mesh(
            new THREE.ConeGeometry(0.34, 0.3, 12, 1, true),
            new THREE.MeshStandardMaterial({ color: '#2f5a4a', roughness: 0.6, side: THREE.DoubleSide }),
          ),
          bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 8, 6),
            new THREE.MeshStandardMaterial({ color: '#fff2c8', emissive: '#ffd27a', emissiveIntensity: 2 }),
          );
        shade.position.set(BJ_AT[0] + dx, 2.75, BJ_AT[1]);
        bulb.position.set(BJ_AT[0] + dx, 2.66, BJ_AT[1]);
        G.add(shade, bulb, box(0.02, h - 2.9, 0.02, trim, BJ_AT[0] + dx, (h + 2.9) / 2, BJ_AT[1]));
      }
      const lamp = new THREE.PointLight('#ffd9a0', 11, 8, 1.5);
      lamp.position.set(BJ_AT[0], 2.6, BJ_AT[1] + 0.3);
      G.add(lamp);
      // the bar's own lamps light the room: the copper pendants over the counter, the sconces over the booths
      // (scene x, height, scene z, strength, colour)
      for (const [bx, y, bz, k, c] of [
        [-0.6, 2.2, -18.6, 9, '#ffb869'],
        [-0.6, 2.2, -22.6, 9, '#ffb869'],
        [-7.0, 2.7, -15.3, 6, '#ff9d5c'],
        [-6.6, 2.7, -23.6, 6, '#ff9d5c'],
      ] as [number, number, number, number, string][]) {
        const l = new THREE.PointLight(c, k, 7.5, 1.5);
        l.position.set(bx + BAR.x, y + BAR.y, bz + BAR.z);
        G.add(l);
      }
      const s = sign(
        [
          { t: 'LUCKY LIE', s: 130, c: '#ff5a8a', b: true, y: 112 },
          { t: 'BLACKJACK  ·  SLOTS  ·  VIDEO POKER', s: 38, c: '#ffe9a8', y: 206 },
        ],
        8,
        2,
        '#141016',
        0.9,
      );
      s.position.set(cx, h + 1.35, z1 - 0.05);
      G.add(s, box(8.3, 2.3, 0.2, trim, cx, h + 1.35, z1 - 0.2));
      col(x0, x0 + 0.3, z0, z1);
      col(x1 - 0.3, x1, z0, z1);
      col(x0, x1, z0, z0 + 0.3);
      col(x0 + 3.35, x0 + 3.85, z1 - 0.5, z1, 'sign');
      col(x1 - 3.85, x1 - 3.35, z1 - 0.5, z1, 'sign');
      // the room's furniture, piece by piece (scene coordinates, moved by BAR), so you can walk right up to a booth
      const bcol = (bx0: number, bx1: number, bz0: number, bz1: number) =>
        col(bx0 + BAR.x, bx1 + BAR.x, Math.max(z0, bz0 + BAR.z), bz1 + BAR.z, 'bench');
      bcol(-1.05, 5.3, -27, -15.6); // the counter and everything behind it
      bcol(3, 5.3, -15.6, -12); // the wall at the bar's end
      bcol(1.4, 3, -14.4, -12.6); // crates
      for (const bz of [-12.8, -14.8, -15.8, -17.8, -21.8, -23.8, -24.8]) bcol(-7.8, -6.2, bz - 0.4, bz + 0.4); // benches
      for (const bz of [-13.8, -16.8, -22.8, -25.8]) bcol(-8, -6.05, bz - 0.45, bz + 0.45); // their tables
      for (const bz of [-12.3, -15.3, -18.3, -21.3, -24.3]) bcol(-8.3, -6, bz - 0.08, bz + 0.08); // the partitions between booths
      bcol(-8.3, -5.3, -21.3, -18.3); // the shrine in its alcove
      // pictures on the walls ("Paintings and Posters Collection", Melon Polygons, CC BY 4.0; see docs/credits.md).
      // The pack is one welded mesh: the loader cuts it into separate frames (Art00, Art01… biggest first).
      void loadProps('paintings', n => n, 'Art').then(kit => {
        const arts = kit.names
          .map(n => ({ n, s: kit.size(n)! }))
          .filter(a => Math.min(a.s.x, a.s.z) < 0.25 && a.s.y > 0.4 && Math.max(a.s.x, a.s.z) > 0.4 && Math.max(a.s.x, a.s.z) < 3);
        if (!arts.length) return;
        // [x, bottom y, z, the way it faces (yaw), widest it may be]
        const WALLS: [number, number, number, number, number][] = [
          [-80.6, 2.7, z0 + 0.33, 0, 1.9],
          [x1 - 0.33, 1.6, z1 - 1.2, -Math.PI / 2, 1.3],
          [x0 + 0.33, 2.3, z1 - 1.2, Math.PI / 2, 1.3],
        ];
        WALLS.forEach(([wx, wy, wz, face, maxW], i) => {
          const a = arts[(i * 5 + 2) % arts.length],
            thinX = a.s.x < a.s.z,
            w = thinX ? a.s.z : a.s.x,
            k = Math.min(maxW / w, 1.25 / a.s.y, 1),
            o = kit.make(a.n, k)!;
          o.position.set(wx, wy, wz);
          o.rotation.y = face - (thinX ? Math.PI / 2 : 0);
          o.castShadow = false;
          G.add(o);
        });
      });
      // slot machines and video poker along the back wall (lobby/vlt.ts)
      const xs = [-82.0, -81.05, -80.1, -79.15];
      const floor = new THREE.Group(); // (the machines and their stools stand on the parquet, not under it)
      floor.position.y = BAR.y - 0.02;
      G.add(floor);
      vltSpots = buildMachines(floor, xs, z0 + 0.72, { x: WEST_OFF.x, y: WEST_OFF.y + BAR.y - 0.02, z: WEST_OFF.z });
      for (const mx of xs) col(mx - 0.4, mx + 0.4, z0 + 0.3, z0 + 1.15, 'bench');
    }
    // 3 · the alley between the lounge and the store, where the Street Dealer does business (lobby/dealer.ts)
    {
      const z1 = ST.z0 - 2.4;
      G.add(tile(flat(4, 14, asphalt, -88, z1 - 7, 0.03), 1.7));
      // dressed from the PSX Industrial Pack (Tomitos, CC BY 4.0; see docs/credits.md): [prop, x, z, yaw, y, scale]
      const DRESS: [string, number, number, number, number?, number?][] = [
        ['Dumpster', -86.55, 1.5, Math.PI / 2],
        ['DumpsterLid1', -86.55, 1.0, Math.PI / 2, 1.1],
        ['DumpsterLid1', -86.55, 2.0, Math.PI / 2, 1.1],
        ['BarrelOil', -86.55, 3.5, 0.4],
        ['BarrelWater', -86.6, 4.3, 1.9],
        ['Jerrycan', -87.1, 3.95, 0.5],
        ['CrateWood2', -89.35, 3.3, 0.1],
        ['CrateWood', -89.4, 3.25, 0.5, 0.7],
        ['CrateWood', -89.45, 4.2, -0.2],
        ['Pallet', -89.3, 0.9, 0.08],
        ['Pallet', -89.28, 0.92, -0.1, 0.13],
        ['Pallet', -89.32, 0.88, 0.03, 0.26],
        ['TransformerBox', -89.72, -0.9, Math.PI / 2],
        ['Tires', -89.1, -2.7, 0.3],
        ['Tire', -88.2, -3.3, 1.1],
        ['PileTrash', -88.9, -4.9, 0.7],
        ['PileDebris', -87.0, -4.8, 2.2],
        ['TrashCan', -86.5, -0.3, 0],
        ['TrashCanLid', -86.5, -0.3, 0.6, 0.9, 0.7],
        ['TrashCan', -86.5, -1.05, 1.3],
        ['TrashCanTrash', -86.5, -1.05, 0, 0.84],
      ];
      void loadProps('industrial').then(kit => {
        for (const [n, x, z, yaw, y = 0, sc = 1] of DRESS) {
          const o = kit.make(n, sc);
          if (!o) continue;
          o.position.set(x, 0.03 + y, z);
          o.rotation.y = yaw;
          G.add(o);
        }
      });
      col(-90, -88.85, 2.7, 4.7, 'bench');
      col(-87.0, -86.1, 3.1, 4.75, 'bench');
      col(-90, -88.5, -3.4, -2.0, 'bench');
      col(-86.9, -86.1, -1.45, 0.05, 'bench');
      const tag = sign([{ t: 'NO DUMPING', s: 60, c: '#f1eee6', b: true, y: 100 }], 1.4, 0.6, '#8a2f28', 0, 256, 128);
      tag.rotation.y = Math.PI / 2;
      tag.position.set(-85.92, 2.1, 3);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 8),
        new THREE.MeshStandardMaterial({ color: '#fff2c8', emissive: '#ffd27a', emissiveIntensity: 1.6 }),
      );
      lamp.position.set(-86.1, 3.4, 6.2);
      G.add(tag, lamp, box(0.5, 0.06, 0.06, dark, -86.0, 3.5, 6.2));
      col(-87.05, -86.1, 0.45, 2.55, 'bench');
      col(-90.2, -85.8, -6.6, -6, 'fence');
      G.add(box(4.2, 2.2, 0.1, M('#6a655c', 0.8), -88, 1.1, -6.3)); // a chain-link back fence, near enough
    }
    // 4 · Grow Supply: a green shop with a striped awning and sacks out front. The one that's open.
    {
      const c = building({
        x0: -104,
        x1: -90,
        z0: -4,
        h: 3.8,
        wall: '#4f7a4a',
        roof: 'flat',
        roofC: '#2f4a2c',
        doorX: -97,
        windows: [-101.5, -92.5],
      });
      const s = sign(
        [
          { t: 'GROW SUPPLY', s: 130, c: '#ffe9a8', b: true, y: 118 },
          { t: 'papers · grinders · everything for the garden', s: 40, c: '#f1eee6', y: 210 },
        ],
        8.4,
        2.1,
        '#2f4a2c',
      );
      s.position.set(-97, 4.9, c.z1 + 0.1);
      G.add(s, box(0.14, 1.1, 0.14, dark, -100.8, 4.3, c.z1 + 0.05), box(0.14, 1.1, 0.14, dark, -93.2, 4.3, c.z1 + 0.05));
      for (let i = 0; i < 8; i++) {
        const a = box(14 / 8, 0.06, 1.6, i % 2 ? white : M('#4f7a4a', 0.8), -104 + (i + 0.5) * (14 / 8), 2.85, c.z1 + 0.75);
        a.rotation.x = 0.3;
        G.add(a);
      }
      for (const [x, z, r] of [
        [-94.6, 0.5, 0.2],
        [-94.1, 0.9, 1.1],
        [-99.6, 0.6, -0.4],
      ]) {
        const sack = box(0.8, 0.28, 0.5, M('#c9b98a', 0.95), x, 0.2, c.z1 + z);
        sack.rotation.y = r;
        G.add(sack);
      }
      G.add(cyl(0.28, 0.22, 0.5, 10, M('#b5651d', 0.9), -99, 0.25, c.z1 + 1.3), cyl(0.42, 0.3, 0.5, 8, M('#3f7a3a', 0.9), -99, 0.72, c.z1 + 1.3));
    }
    // 4b · Lucky Pawn: an open-fronted shop west of the water tower. A glass counter of watches and rings with the
    // pawnbroker behind it (lobby/attendants.ts), other people's trophies on a shelf, guitars, a television and stock
    // shelves round the walls. E at the counter sells your trophies (lobby.ts openPawn).
    {
      const x0 = -125.6,
        x1 = -116,
        z0 = -4,
        z1 = ST.z0 - 2.4,
        h = 4.2,
        cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2,
        d = z1 - z0,
        wall = M('#6d5a3c', 0.9),
        inner = M('#8a7a55', 0.9),
        trim = M('#1d1d1f', 0.8),
        wood = M('#5a3b22', 0.7),
        gold = new THREE.MeshStandardMaterial({ color: '#e2b23a', roughness: 0.3, metalness: 0.8, emissive: '#6a4a10', emissiveIntensity: 0.5 }),
        lit = (c: string, k = 1.4) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.5 });
      // a chequered lino floor
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const g2 = cv.getContext('2d')!;
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) {
          g2.fillStyle = (i + j) % 2 ? '#3a342c' : '#b9ad92';
          g2.fillRect(i * 32, j * 32, 32, 32);
        }
      const lino = new THREE.CanvasTexture(cv);
      lino.colorSpace = THREE.SRGBColorSpace;
      lino.wrapS = lino.wrapT = THREE.RepeatWrapping;
      lino.repeat.set((x1 - x0) / 2.4, d / 2.4);
      G.add(
        box(x1 - x0, h, 0.3, wall, cx, h / 2, z0 + 0.15),
        box(0.3, h, d, wall, x0 + 0.15, h / 2, cz),
        box(0.3, h, d, wall, x1 - 0.15, h / 2, cz),
        box(x1 - x0 - 0.6, h - 0.1, 0.04, inner, cx, h / 2, z0 + 0.32), // lighter paint inside
        box(0.04, h - 0.1, d - 0.4, inner, x0 + 0.32, h / 2, cz),
        box(0.04, h - 0.1, d - 0.4, inner, x1 - 0.32, h / 2, cz),
        box(x1 - x0 + 0.4, 0.3, d + 0.4, M('#2a2420', 0.9), cx, h + 0.15, cz), // roof
        box(x1 - x0 - 0.6, 0.06, d - 0.3, M('#e9e2cf', 0.9), cx, h - 0.03, cz), // ceiling
        box(x1 - x0, 0.9, 0.3, wall, cx, h - 0.45, z1 - 0.15), // the beam over the open front
        box(0.4, h, 0.4, trim, x0 + 0.2, h / 2, z1 - 0.2),
        box(0.4, h, 0.4, trim, x1 - 0.2, h / 2, z1 - 0.2),
        box(x1 - x0 - 0.6, 0.05, d - 0.3, new THREE.MeshStandardMaterial({ map: lino, roughness: 0.6 }), cx, 0.06, cz + 0.1),
      );
      // the counter: a timber base, a glass case of small gold things on top, a till at one end; a flap at the east end
      const kz = z0 + 3.1,
        k0 = x0 + 0.5,
        k1 = x1 - 1.7,
        km = (k0 + k1) / 2,
        glass = new THREE.MeshStandardMaterial({ color: '#cfe6ea', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.22 });
      G.add(
        box(k1 - k0, 0.9, 0.75, wood, km, 0.53, kz),
        box(k1 - k0 + 0.1, 0.05, 0.85, M('#2a1c12', 0.5), km, 1.0, kz),
        box(k1 - k0 - 0.2, 0.3, 0.6, glass, km, 1.18, kz),
        box(k1 - k0 - 0.2, 0.02, 0.6, M('#5a1f2a', 0.9), km, 1.04, kz), // velvet
        box(k1 - k0 - 0.1, 0.03, 0.7, M('#2a1c12', 0.5), km, 1.345, kz),
        box(0.45, 0.32, 0.4, M('#2c2a30', 0.5, 0.4), k1 - 0.5, 1.52, kz), // the till
        box(0.4, 0.12, 0.3, M('#3a3840', 0.5, 0.4), k1 - 0.5, 1.74, kz - 0.05),
        box(0.3, 0.1, 0.02, lit('#58e08a', 1.2), k1 - 0.5, 1.74, kz + 0.11),
      );
      for (let i = 0; i < 9; i++) {
        // watches, rings and chains under the glass
        const px = k0 + 0.5 + i * ((k1 - k0 - 1.6) / 8),
          o =
            i % 3 === 0
              ? cyl(0.06, 0.06, 0.02, 12, gold, px, 1.07, kz)
              : i % 3 === 1
                ? box(0.16, 0.03, 0.05, gold, px, 1.07, kz + 0.1)
                : cyl(0.035, 0.035, 0.05, 10, gold, px, 1.08, kz - 0.1);
        G.add(o);
      }
      // a plank shelf of other people's trophies on the back wall, under a strip light
      G.add(box(5.2, 0.06, 0.4, wood, cx - 0.6, 2.25, z0 + 0.55), box(5, 0.05, 0.1, lit('#fff2c8', 1.6), cx - 0.6, 3.75, z0 + 0.5));
      [7, 41, 1203, 88, 560].forEach((seed, i) => {
        const t = buildTrophy(seed, i % 2 ? 9 : 3);
        t.position.set(cx - 2.8 + i * 1.1, 2.28, z0 + 0.55);
        t.traverse(o => (o.castShadow = false));
        G.add(t);
      });
      // signs: neon on the back wall, the name over the front, three gold balls on a bracket
      const buy = sign(
        [
          { t: 'WE BUY TROPHIES', s: 96, c: '#ffe9a8', b: true, y: 108 },
          { t: 'CASH PAID  ·  NO QUESTIONS  ·  NO REFUNDS', s: 34, c: '#ff9a8a', y: 204 },
        ],
        4.6,
        1.15,
        '#141016',
        0.9,
      );
      buy.position.set(cx - 0.6, 3.1, z0 + 0.36);
      const name = sign(
        [
          { t: 'LUCKY PAWN', s: 130, c: '#ffd27a', b: true, y: 112 },
          { t: 'GOLD  ·  GUITARS  ·  TROPHIES', s: 40, c: '#f1e6d0', y: 206 },
        ],
        6.4,
        1.6,
        '#1a140e',
        0.9,
      );
      name.position.set(cx, h + 1.1, z1 - 0.05);
      G.add(buy, name, box(6.7, 1.9, 0.2, trim, cx, h + 1.1, z1 - 0.2));
      G.add(box(0.06, 0.06, 1.1, trim, x1 - 0.2, h - 0.2, z1 + 0.5), box(0.7, 0.04, 0.04, trim, x1 - 0.2, h - 0.5, z1 + 0.95));
      for (const [dx, dy] of [
        [-0.3, -0.75],
        [0, -0.95],
        [0.3, -0.75],
      ]) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), gold);
        ball.position.set(x1 - 0.2 + dx, h - 0.5 + dy, z1 + 0.95);
        G.add(ball, box(0.015, -dy - 0.15, 0.015, trim, x1 - 0.2 + dx, h - 0.5 + (dy + 0.15) / 2, z1 + 0.95));
      }
      const lamp = new THREE.PointLight('#ffe2b0', 14, 11, 1.5);
      lamp.position.set(cx, 3.2, cz);
      G.add(lamp);
      // stock from the packs (docs/credits.md): house pieces round the walls, stock shelves behind the counter
      const up = new THREE.Vector3(0, 1, 0),
        stock = (kit: Awaited<ReturnType<typeof loadProps>>, names: string[], x: number, z: number, yaw: number) => {
          const a0 = kit.at(names[0]);
          if (!a0) return;
          for (const n of names) {
            const o = kit.make(n),
              a = kit.at(n);
            if (!o || !a) continue;
            o.position.set(x, 0.09, z).add(a.sub(a0).applyAxisAngle(up, yaw));
            o.rotation.y = yaw;
            o.castShadow = false;
            G.add(o);
          }
        };
      void loadProps('home', n => n).then(kit => {
        stock(kit, ['Cube004_atlas_living_0'], x0 + 0.72, cz + 2.6, 0); // the television wall unit, west wall
        stock(kit, ['libr_atlas_living_0'], x0 + 0.72, cz - 0.1, 0);
        stock(kit, ['guitar_atlas_mueblesDormitorio1_0'], x1 - 0.6, cz + 0.4, Math.PI);
        stock(kit, ['guitar_atlas_mueblesDormitorio1_0'], x1 - 0.6, cz + 1.5, Math.PI);
        stock(kit, ['couch001_fabricsofa_0', 'couch001_atlas_living_0', 'couch001_wood3_0'], x1 - 0.95, cz + 3.4, 0);
        stock(kit, ['Circle004_atlas_living_0'], x1 - 0.7, cz + 4.8, 0);
        stock(kit, ['Cube009_atlas_living_0'], x0 + 0.7, cz + 4.9, 0);
      });
      void loadProps('shelves', n => n).then(kit => {
        for (const [n, sx] of [
          ['Object_8', x1 - 1.6],
          ['Object_14', x1 - 3.9],
        ] as [string, number][]) {
          const o = kit.make(n),
            sz = kit.size(n);
          if (!o || !sz) continue;
          o.rotation.y = sz.x < sz.z ? Math.PI / 2 : 0; // long side along the back wall
          o.position.set(sx, 0.09, z0 + 0.75);
          o.castShadow = false;
          G.add(o);
        }
      });
      col(x0, x0 + 0.3, z0, z1);
      col(x1 - 0.3, x1, z0, z1);
      col(x0, x1, z0, z0 + 0.3);
      col(k0, k1, kz - 0.45, kz + 0.45, 'bench');
      col(x0 + 0.3, x0 + 1.15, cz - 0.9, cz + 4.3, 'bench'); // the television and the bookcase
      col(x1 - 1.5, x1 - 0.3, cz + 2.8, cz + 4.0, 'bench'); // the armchair
    }
  }
  G = GW;
  at = WEST_OFF;
  col(-106.5, -71.5, -3, ST.z0 - 2.4); // the filler shops on the main street (built above, once their models arrive)
  col(-127, -116, -3, ST.z0 - 2.4);
  // 5 · the water tower: the landmark you steer by
  {
    const t = new THREE.Group(),
      steel = M('#8d9296', 0.5, 0.4);
    for (const [x, z] of [
      [-1.6, -1.6],
      [1.6, -1.6],
      [-1.6, 1.6],
      [1.6, 1.6],
    ])
      t.add(box(0.22, 11, 0.22, steel, x, 5.5, z));
    for (const y of [3.5, 7.5])
      t.add(
        box(3.4, 0.12, 0.12, steel, 0, y, -1.6),
        box(3.4, 0.12, 0.12, steel, 0, y, 1.6),
        box(0.12, 0.12, 3.4, steel, -1.6, y, 0),
        box(0.12, 0.12, 3.4, steel, 1.6, y, 0),
      );
    const tank = cyl(2.6, 2.6, 3.4, 20, M('#d8d2c4', 0.7), 0, 12.7, 0),
      cap = cyl(0.2, 2.8, 1.3, 20, M('#8a2f28', 0.8), 0, 15.05, 0),
      band = sign([{ t: 'GOLDEN HILLS', s: 110, c: '#8a2f28', b: true, y: 160 }], 4.6, 1.3, '#d8d2c4', 0, 512, 256);
    band.position.set(0, 12.8, 2.62);
    t.add(tank, cap, band);
    t.position.set(-112, 0, -1);
    G.add(t);
    col(-114, -110, -3, 1, 'sign');
  }
  // street lights and a bus stop bench
  for (let x = -50; x > -110; x -= 15) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#fff2c8', emissive: '#ffd27a', emissiveIntensity: 1.2 }),
    );
    lamp.position.set(x, 4.4, ST.z1 + 1.2);
    G.add(box(0.12, 4.4, 0.12, dark, x, 2.2, ST.z1 + 1.9), box(0.1, 0.1, 0.8, dark, x, 4.4, ST.z1 + 1.55), lamp);
  }

  // ---------------- cars: parked in the bays, and one van on its rounds
  const BAYS: [number, number, number, CarKind][] = [
    [-96.8, 22.3, 0, 'sedan'],
    [-89.6, 22.3, 0, 'wagon'],
    [-78.8, 22.3, Math.PI, 'pickup'],
    [-71.6, 22.3, 0, 'sedan'],
    [-60.8, 22.3, 0, 'wagon'],
    [-93.2, 32.5, Math.PI, 'van'],
    [-82.4, 32.5, 0, 'sedan'],
    [-64.4, 32.5, Math.PI, 'pickup'],
  ];
  const parked: THREE.Group[] = [];
  for (const [x, z] of BAYS) col(x - 0.95, x + 0.95, z - 2.1, z + 2.1, 'fence');
  BAYS.forEach(([x, z, r, kind], i) => {
    const c = buildCar(kind, CAR_PAINT[(i * 4 + 1) % CAR_PAINT.length]).root;
    c.position.set(x, 0.03, z);
    c.rotation.y = r;
    G.add(c);
    parked.push(c);
  });
  const vanCar = buildCar('van', '#d9d4c8'),
    van = vanCar.root,
    wheels = vanCar.wheels;
  van.userData.noBatch = true;
  G.add(van);
  // The code-built cars are stand-ins: once the vehicle pack is in ("54 Vehicle Pack", PorscheAaron, CC BY 4.0; see
  // docs/credits.md) each is swapped for a textured model. The pack is toy-sized with its nose along -x.
  void loadProps('vehicles', n => n).then(kit => {
    const swap = (root: THREE.Object3D, n: number, moving = false) => {
      const o = kit.make('Object_' + n, 25);
      if (!o) return;
      o.rotation.y = Math.PI / 2;
      if (moving) o.userData.noBatch = true;
      for (const ch of root.children) ch.visible = false;
      root.add(o);
    };
    [49, 25, 19, 36, 20, 21, 26, 2].forEach((n, i) => parked[i] && swap(parked[i], n));
    swap(van, 14, true);
  });

  // the van's round: east along one lane, a U-turn short of the gate, west along the other, a U-turn short of the
  // turning circle, and round again
  const LANE = 1.8,
    E0 = X0 - 9,
    W0 = XW + 13,
    seg = [E0 - W0, Math.PI * LANE],
    total = (seg[0] + seg[1]) * 2;
  function vanAt(s: number): [number, number, number] {
    s = ((s % total) + total) % total;
    if (s < seg[0]) return [W0 + s, 14 + LANE, Math.PI / 2]; // heading east (+x)
    s -= seg[0];
    if (s < seg[1]) {
      const a = s / LANE;
      return [E0 + Math.sin(a) * LANE, 14 + Math.cos(a) * LANE, Math.PI / 2 + a];
    }
    s -= seg[1];
    if (s < seg[0]) return [E0 - s, 14 - LANE, -Math.PI / 2]; // heading west
    const a = (s - seg[0]) / LANE;
    return [W0 - Math.sin(a) * LANE, 14 - Math.cos(a) * LANE, -Math.PI / 2 - a];
  }
  let vs = 20,
    vv = 0;
  return {
    /** Things to press E at. */
    spots: [
      { id: 'growshop', x: -97, z: ST.z0 - 1.4, r: 2.2, label: 'Grow Supply' },
      { id: 'club', x: -60, z: ST.z0 - 1.2, r: 2.4, label: 'Clubhouse · tee times and trophies' },
      { id: 'store:clothes', x: -110.9, z: 36.2, r: 2.6, label: 'Threads · clothing' },
      { id: 'store:barber', x: -100.2, z: 36.2, r: 2.2, label: 'The Clip Joint · barber' },
      { id: 'store:tattoo', x: -90.7, z: 36.2, r: 2.4, label: 'Ink Spot · tattoos' },
      { id: 'store:pro', x: -79.2, z: 36.2, r: 2.6, label: 'Pro Shop · ball trails' },
      { id: 'pawn', x: -120.8, z: 0.7, r: 2.1, label: 'Lucky Pawn · sell trophies' },
      { id: 'store:home', x: -67.3, z: 36.2, r: 2.6, label: 'Homestead · furniture for your lot' },
      { id: 'store:auto', x: -124, z: 36.2, r: 2.6, label: 'Wrench & Ride · cars' },
      ...vltSpots,
    ].map(sp => {
      const o = sp.id === 'growshop' || sp.id === 'pawn' || sp.id.startsWith('vlt:') ? SHADY_OFF : { x: WEST_OFF.x, z: 0 };
      return { ...sp, x: sp.x + o.x, z: sp.z + o.z };
    }) as { id: string; x: number; z: number; r: number; label: string; say?: string }[],
    /** Per frame. The van slows for anyone in its way (people: x, z). */
    update(dt: number, people: { x: number; z: number }[]) {
      const [x, z, yaw] = vanAt(vs),
        fx = Math.sin(yaw),
        fz = Math.cos(yaw);
      // someone within a few metres ahead: brake; otherwise amble along at about 20 km/h
      let want = 5.5;
      for (const p of people) {
        const dx = p.x - WEST_OFF.x - x,
          dz = p.z - z,
          ahead = dx * fx + dz * fz,
          side = Math.abs(dx * fz - dz * fx);
        if (ahead > -1 && ahead < 9 && side < 2) want = Math.min(want, Math.max(0, (ahead - 4) * 1.2));
      }
      vv += Math.max(-9 * dt, Math.min(2.5 * dt, want - vv));
      vs += vv * dt;
      shopRow.update(performance.now() / 1000);
      van.position.set(x, 0.03, z);
      van.rotation.y = yaw;
      for (const w of wheels) w.rotation.x += (vv * dt) / 0.32;
    },
    /** Where the van is, for bumping into (x, z, heading, speed). */
    van: () => ({ x: van.position.x + WEST_OFF.x, z: van.position.z, yaw: van.rotation.y, v: vv }),
  };
}
