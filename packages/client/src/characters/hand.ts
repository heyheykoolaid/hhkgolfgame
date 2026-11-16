// A hand modelled already wrapped around a golf grip. "Grip frame": the shaft runs along +Z (toward the clubhead)
// through the origin; the hand's body sits on the −X side of the shaft (palm facing +X, toward the shaft), the
// wrist toward +Y/−Z. Fingers wrap around the shaft, the thumb lies along it. The right hand is this mirrored in X.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const GRIP_R = 0.0115;

/** Tube along a polyline with per-point radius, rounded ends (parallel-transport frames). */
export function tube(path: THREE.Vector3[], radii: number[], seg = 10, capEnds = true) {
  const pos: number[] = [],
    idx: number[] = [],
    n = path.length;
  const T: THREE.Vector3[] = path.map((p, i) =>
    path[Math.min(n - 1, i + 1)]
      .clone()
      .sub(path[Math.max(0, i - 1)])
      .normalize(),
  );
  let N = new THREE.Vector3().crossVectors(T[0], Math.abs(T[0].y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).normalize();
  const Ns: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    if (i) {
      const q = new THREE.Quaternion().setFromUnitVectors(T[i - 1], T[i]);
      N = N.clone().applyQuaternion(q);
    }
    Ns.push(N.clone());
  }
  for (let i = 0; i < n; i++) {
    const B = new THREE.Vector3().crossVectors(T[i], Ns[i]);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2,
        p = path[i]
          .clone()
          .addScaledVector(Ns[i], Math.cos(a) * radii[i])
          .addScaledVector(B, Math.sin(a) * radii[i]);
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < seg; k++) {
      const a = i * row + k,
        b = a + row;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const parts = [g];
  if (capEnds)
    for (const i of [0, n - 1]) {
      const s = new THREE.SphereGeometry(radii[i], seg, 6);
      s.deleteAttribute('uv');
      s.deleteAttribute('normal');
      s.translate(path[i].x, path[i].y, path[i].z);
      parts.push(s);
    }
  return mergeGeometries(parts.map(p => (p.deleteAttribute('uv'), p.deleteAttribute('normal'), p)))!;
}

export interface GripHand {
  geo: THREE.BufferGeometry;
  wrist: THREE.Vector3;
}
/** Build the lead (left) hand in grip frame; pass mirror = true for the trail (right) hand. */
export function gripHand(mirror = false): GripHand {
  const r = GRIP_R,
    parts: THREE.BufferGeometry[] = [];
  // palm lies against the shaft at x = −r. Its long axis runs diagonally across the grip (dp), knuckles along kd.
  const dp = V(0, 0.6, -0.8),
    kd = V(0, 0.8, 0.6); // palm runs ~37° off the shaft so the forearm continues up the club
  const P = (d: number, w: number, x: number) =>
    V(-r + x, 0, 0)
      .addScaledVector(dp, d)
      .addScaledVector(kd, w);
  // palm: loft of rounded cross-sections from the knuckles (d = 0) to the wrist (d = 0.095)
  const rings = [
    { d: -0.004, w: 0.039, th: 0.011 },
    { d: 0.02, w: 0.043, th: 0.014 },
    { d: 0.055, w: 0.043, th: 0.016 },
    { d: 0.08, w: 0.036, th: 0.017 },
    { d: 0.098, w: 0.028, th: 0.016 },
  ];
  {
    const seg = 16,
      pos: number[] = [],
      idx: number[] = [];
    for (const rg of rings)
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2,
          c = Math.cos(a),
          s = Math.sin(a),
          e = 0.7,
          sx = Math.sign(c) * Math.abs(c) ** e,
          sz = Math.sign(s) * Math.abs(s) ** e;
        const p = P(rg.d, sz * rg.w, -rg.th - sx * rg.th);
        pos.push(p.x, p.y, p.z);
      }
    for (let j = 0; j < rings.length - 1; j++)
      for (let k = 0; k < seg; k++) {
        const a = j * (seg + 1) + k,
          b = a + seg + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    // close both ends with fans
    for (const j of [0, rings.length - 1]) {
      const c = P(rings[j].d, 0, -rings[j].th),
        ci = pos.length / 3;
      pos.push(c.x, c.y, c.z);
      for (let k = 0; k < seg; k++) {
        const a = j * (seg + 1) + k;
        idx.push(j ? ci : ci, j ? a : a + 1, j ? a + 1 : a);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    orientConvex(g);
    parts.push(g);
  }
  // thumb pad (thenar) on the index side
  {
    const s = new THREE.SphereGeometry(1, 12, 8);
    s.scale(0.014, 0.026, 0.018);
    s.rotateX(-0.93);
    const c = P(0.06, 0.027, -0.012);
    s.translate(c.x, c.y, c.z);
    parts.push(s);
  }
  // fingers: start at the knuckles, run round the shaft in the plane ⟂ to it. index (nearest the head) → pinky
  const R = r + 0.0085;
  const fingers = [
    { w: 0.03, L: 0.088, rad: 0.0088 },
    { w: 0.01, L: 0.094, rad: 0.0092 },
    { w: -0.01, L: 0.088, rad: 0.0088 },
    { w: -0.029, L: 0.07, rad: 0.0078 },
  ];
  for (const f of fingers) {
    const k = P(0, f.w, -0.008),
      z = k.z,
      y0 = THREE.MathUtils.clamp(k.y, -R * 0.9, R * 0.9),
      th0 = Math.atan2(y0, -Math.sqrt(R * R - y0 * y0));
    const path: THREE.Vector3[] = [k.clone().add(V(-0.004, 0.006, 0))],
      radii = [f.rad * 1.12];
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const l = (f.L * i) / steps,
        th = th0 + (l / R) * 0.98,
        rr = R + (i === 0 ? 0.002 : 0) - i * 0.0002;
      path.push(V(Math.cos(th) * rr, Math.sin(th) * rr, z + l * 0.06));
      radii.push(f.rad * (1 - (0.18 * i) / steps));
    }
    parts.push(tube(path, radii, 10));
    // knuckle bump on the back of the hand
    const kb = new THREE.SphereGeometry(f.rad * 1.05, 8, 6);
    const kp = P(-0.002, f.w, -0.02);
    kb.translate(kp.x, kp.y, kp.z);
    parts.push(kb);
  }
  // thumb: from the pad, along the top of the shaft toward the head
  {
    const base = P(0.05, 0.04, -0.016),
      mid = V(-0.012, 0.022, 0.03),
      tip = V(-0.004, 0.017, 0.058);
    parts.push(
      tube(
        [
          base,
          base
            .clone()
            .lerp(mid, 0.5)
            .add(V(-0.002, 0.004, 0)),
          mid,
          mid.clone().lerp(tip, 0.6),
          tip,
        ],
        [0.0125, 0.0115, 0.0105, 0.0098, 0.009],
        10,
      ),
    );
  }
  let geo = mergeGeometries(
    parts.map(p => {
      if (p.attributes.uv) p.deleteAttribute('uv');
      if (p.attributes.normal) p.deleteAttribute('normal');
      return p.index ? p : p;
    }),
  )!;
  geo = mergeVertices(geo, 1e-6);
  const wrist = P(0.1, 0, -0.016);
  if (mirror) {
    geo.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
    wrist.x *= -1;
    const ix = geo.index!.array as any;
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
  geo.computeVertexNormals();
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  return { geo, wrist };
}

/** Flip faces of a roughly convex mesh so they point away from its centre. */
function orientConvex(g: THREE.BufferGeometry) {
  const p = g.attributes.position,
    ix = g.index!.array as any,
    c = new THREE.Vector3(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    d = new THREE.Vector3(),
    n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) c.add(a.fromBufferAttribute(p as any, i));
  c.multiplyScalar(1 / p.count);
  let score = 0;
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(p as any, ix[i]);
    b.fromBufferAttribute(p as any, ix[i + 1]);
    d.fromBufferAttribute(p as any, ix[i + 2]);
    n.subVectors(b, a).cross(
      b
        .clone()
        .sub(a)
        .set(d.x - a.x, d.y - a.y, d.z - a.z),
    );
    score += Math.sign(
      n.dot(
        a
          .add(b)
          .add(d)
          .multiplyScalar(1 / 3)
          .sub(c),
      ),
    );
  }
  if (score < 0)
    for (let i = 0; i < ix.length; i += 3) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
}

/** A relaxed, open hand for walking and standing. Built hanging straight down from the wrist (origin): fingers −Y and
 *  gently curled toward the palm, palm facing the thigh (−s·X), thumb to the front (+Z). s = +1 left, −1 right. */
export function relaxedHand(s: number) {
  const parts: THREE.BufferGeometry[] = [];
  const palm = new THREE.SphereGeometry(1, 16, 12);
  palm.scale(0.0155, 0.05, 0.039);
  palm.translate(-s * 0.002, -0.05, 0.002);
  parts.push(palm);
  const F = [
    { z: 0.0285, by: -0.09, L: 0.07, r: 0.0088 },
    { z: 0.0095, by: -0.094, L: 0.078, r: 0.0092 },
    { z: -0.0095, by: -0.092, L: 0.072, r: 0.0088 },
    { z: -0.0275, by: -0.085, L: 0.057, r: 0.0078 },
  ];
  F.forEach((f, i) => {
    const path = [V(-s * 0.002, f.by + 0.012, f.z)],
      radii = [f.r * 1.08];
    let th = 0.12 + i * 0.05,
      p = path[0].clone();
    for (const [frac, bend] of [
      [0.16, 0],
      [0.42, 0.3],
      [0.3, 0.4],
      [0.24, 0.35],
    ] as [number, number][]) {
      th += bend;
      p = p.clone().add(V(-s * Math.sin(th) * f.L * frac, -Math.cos(th) * f.L * frac, 0));
      path.push(p);
      radii.push(f.r * (1 - 0.06 * path.length));
    }
    parts.push(tube(path, radii, 10));
  });
  parts.push(
    tube(
      [V(-s * 0.004, -0.028, 0.03), V(-s * 0.008, -0.055, 0.047), V(-s * 0.014, -0.082, 0.054), V(-s * 0.02, -0.104, 0.055)],
      [0.0125, 0.0115, 0.0102, 0.009],
      10,
    ),
  );
  let geo = mergeGeometries(
    parts.map(p => {
      if (p.attributes.uv) p.deleteAttribute('uv');
      if (p.attributes.normal) p.deleteAttribute('normal');
      return p;
    }),
  )!;
  geo = mergeVertices(geo, 1e-6);
  geo.computeVertexNormals();
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  return geo;
}
