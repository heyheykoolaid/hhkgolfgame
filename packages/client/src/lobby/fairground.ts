// Fun Land's fairground, built in code (no downloaded models): a big wheel that turns, a carousel with galloping
// horses, a striped big top, and three game stalls, with bunting between them. The shapes are turned (lathe) and
// swept where a real one would be rounded, canvas is painted in stripes, and the lit parts glow in the evening light.
import * as THREE from 'three';
import { rustyRocket } from '../world/rocket';
import { M, box, cyl, textTex } from './world';

const V2 = (x: number, y: number) => new THREE.Vector2(x, y);
const CREAM = '#f3e9d2',
  RED = '#c8452f',
  TEAL = '#2f8a86',
  GOLD = '#e2b23a',
  NAVY = '#27405e';

/** Striped canvas: n pairs of stripes across u. */
function stripes(a: string, b: string, n: number, vertical = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  for (let i = 0; i < n * 2; i++) {
    x.fillStyle = i % 2 ? b : a;
    if (vertical) x.fillRect((i * 256) / (n * 2), 0, 256 / (n * 2) + 1, 256);
    else x.fillRect(0, (i * 256) / (n * 2), 256, 256 / (n * 2) + 1);
  }
  // a little weave and weathering so it isn't flat paint
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const canvasM = (a: string, b: string, n: number) =>
  new THREE.MeshStandardMaterial({ map: stripes(a, b, n), roughness: 0.85, side: THREE.DoubleSide });
const glow = (c: string, k = 1.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
function shadows<T extends THREE.Object3D>(o: T) {
  o.traverse(m => {
    if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
  });
  return o;
}
/** A straight tube from a to b. */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 6) {
  const d = b.clone().sub(a),
    o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
}
/** A scalloped valance: a ring of little half-round flaps hanging from radius r at height y. */
function valance(r: number, y: number, n: number, drop: number, m: THREE.Material) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      w = (Math.PI * 2 * r) / n,
      f = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 8, Math.PI, Math.PI).scale(1, drop / (w / 2), 1), m);
    f.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
    f.rotation.y = a;
    g.add(f);
  }
  return g;
}
/** Bunting: a sagging line of little flags from a to b. */
function bunting(a: THREE.Vector3, b: THREE.Vector3, sag = 0.7) {
  const g = new THREE.Group(),
    n = Math.max(6, Math.round(a.distanceTo(b) / 0.55)),
    cols = [RED, GOLD, TEAL, CREAM].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide })),
    pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#3a3026' })));
  const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2,
    tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.16, 0, 0), new THREE.Vector3(0.16, 0, 0), new THREE.Vector3(0, -0.36, 0)]);
  tri.computeVertexNormals();
  for (let i = 1; i < n; i++) {
    const f = new THREE.Mesh(tri, cols[i % cols.length]);
    f.position.copy(pts[i]);
    f.rotation.y = yaw;
    g.add(f);
  }
  return g;
}
function signBoard(text: string, w: number, h: number, bg: string, fg = CREAM) {
  const t = textTex([{ t: text, s: 120, c: fg, b: true, y: 150 }], 1024, 256, bg),
    m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.5, roughness: 0.7, side: THREE.DoubleSide }),
    );
  return m;
}
/** A row of lit bulbs along a list of points (one instanced mesh). */
function bulbs(pts: THREE.Vector3[], r = 0.07, color = '#ffe2a0') {
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 6, 5), glow(color, 2.2), pts.length),
    m4 = new THREE.Matrix4();
  pts.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  return im;
}

// ---------------------------------------------------------------- the big wheel
function bigWheel() {
  const root = new THREE.Group(),
    R = 11.5,
    HUB = 13.2,
    HALF = 1.15, // half the gap between the two rims
    steel = M('#e9e2d0', 0.55, 0.2),
    dark = M('#2c3440', 0.6, 0.3),
    wheel = new THREE.Group();
  wheel.position.y = HUB;
  // two rims, each a ring of straight tubes with a lighter inner ring, tied together with cross struts
  const N = 24,
    P = (i: number, r: number, x: number) => new THREE.Vector3(x, Math.cos((i / N) * Math.PI * 2) * r, Math.sin((i / N) * Math.PI * 2) * r);
  for (const sx of [-HALF, HALF]) {
    for (let i = 0; i < N; i++) {
      wheel.add(strut(P(i, R, sx), P(i + 1, R, sx), 0.11, steel));
      wheel.add(strut(P(i, R * 0.62, sx), P(i + 1, R * 0.62, sx), 0.06, steel));
      wheel.add(strut(new THREE.Vector3(sx * 0.6, 0, 0), P(i, R, sx), 0.05, steel)); // spoke
      if (i % 2 === 0) wheel.add(strut(P(i, R * 0.62, sx), P(i + 1, R, sx), 0.035, steel)); // lattice between the rings
    }
  }
  for (let i = 0; i < N; i++) wheel.add(strut(P(i, R, -HALF), P(i, R, HALF), 0.05, steel));
  wheel.add(cyl(0.55, 0.55, HALF * 2 + 0.5, 16, dark).rotateZ(Math.PI / 2), cyl(0.9, 0.9, 0.12, 20, M(GOLD, 0.4, 0.4)).rotateZ(Math.PI / 2));
  const hubCap = cyl(0.9, 0.9, 0.12, 20, M(GOLD, 0.4, 0.4));
  hubCap.rotation.z = Math.PI / 2;
  hubCap.position.x = HALF + 0.3;
  wheel.add(hubCap);
  // lights round both rims and along every other spoke
  const lp: THREE.Vector3[] = [];
  for (const sx of [-HALF - 0.12, HALF + 0.12]) {
    for (let i = 0; i < N * 3; i++) lp.push(P(i / 3, R, sx));
    for (let i = 0; i < N; i += 2) for (let k = 2; k < 9; k++) lp.push(P(i, (R * k) / 9, sx));
  }
  wheel.add(bulbs(lp));
  // twelve gondolas: each hangs from an axle between the rims and stays level as the wheel turns
  const gondolas: THREE.Group[] = [],
    paints = [RED, TEAL, GOLD, NAVY];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group(),
      paint = M(paints[i % 4], 0.5),
      a = (i / 12) * Math.PI * 2;
    g.position.set(0, Math.cos(a) * R, Math.sin(a) * R);
    // a round tub with a rolled lip, a centre post, a bench ring and a striped parasol
    const tub = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          V2(0, -1.75),
          V2(0.62, -1.75),
          V2(0.86, -1.6),
          V2(0.92, -1.05),
          V2(0.97, -1.0),
          V2(0.92, -0.95),
          V2(0.84, -1.0),
          V2(0.8, -1.55),
          V2(0, -1.6),
        ],
        14,
      ),
      paint,
    );
    g.add(tub, cyl(0.04, 0.04, 1.75, 6, steel, 0, -0.85, 0), cyl(0.5, 0.5, 0.06, 12, M('#5a3a26', 0.8), 0, -1.38, 0));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.42, 12, 1, true), canvasM(paints[i % 4], CREAM, 6));
    roof.position.y = -0.2;
    g.add(roof, strut(new THREE.Vector3(-HALF, 0, 0), new THREE.Vector3(HALF, 0, 0), 0.04, dark));
    for (const s of [-1, 1]) g.add(strut(new THREE.Vector3(s * 0.85, 0, 0), new THREE.Vector3(s * 0.85, -1.0, 0), 0.025, steel));
    wheel.add(g);
    gondolas.push(g);
  }
  root.add(wheel);
  // A-frame legs either side, braced, on concrete feet
  for (const sx of [-HALF - 0.75, HALF + 0.75]) {
    const top = new THREE.Vector3(sx * 0.82, HUB, 0);
    for (const sz of [-5.2, 5.2]) {
      const foot = new THREE.Vector3(sx * 1.35, 0.3, sz);
      root.add(strut(top, foot, 0.2, steel, 8), box(1.1, 0.5, 1.1, M('#b9b1a0', 0.9), foot.x, 0.25, foot.z));
      root.add(strut(top.clone().lerp(foot, 0.45), new THREE.Vector3(sx * 1.1, HUB * 0.55, 0).setZ(-sz * 0.02), 0.07, steel));
    }
    for (const k of [0.3, 0.55, 0.78]) {
      const a = top.clone().lerp(new THREE.Vector3(sx * 1.35, 0.3, -5.2), k),
        b = top.clone().lerp(new THREE.Vector3(sx * 1.35, 0.3, 5.2), k);
      root.add(strut(a, b, 0.07, steel));
    }
  }
  root.add(strut(new THREE.Vector3(-HALF - 0.9, HUB, 0), new THREE.Vector3(HALF + 0.9, HUB, 0), 0.3, dark, 10));
  // boarding deck with steps and a rail, a ticket booth, and the sign over the gate
  const wood = M('#8a5f38', 0.85),
    deck = box(4.4, 0.5, 7, wood, 0, 0.25, 0);
  root.add(deck, box(4.4, 0.25, 1, wood, 0, 0.12, 4), box(4.4, 0.25, 1, wood, 0, 0.12, -4));
  for (const sx of [-2.1, 2.1]) {
    for (let z = -3.4; z <= 3.4; z += 1.7) root.add(cyl(0.04, 0.04, 1.0, 6, steel, sx, 1.0, z));
    root.add(strut(new THREE.Vector3(sx, 1.5, -3.4), new THREE.Vector3(sx, 1.5, 3.4), 0.035, steel));
  }
  const booth = new THREE.Group();
  booth.add(
    box(1.6, 2.2, 1.6, M(CREAM, 0.8), 0, 1.1, 0),
    box(1.2, 0.8, 0.06, M('#1c2430', 0.3), 0, 1.5, 0.81),
    box(1.4, 0.08, 0.5, wood, 0, 1.05, 0.95),
  );
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.9, 4, 1), canvasM(RED, CREAM, 4));
  cap.position.y = 2.65;
  cap.rotation.y = Math.PI / 4;
  booth.add(cap);
  const tix = signBoard('TICKETS', 1.3, 0.34, RED);
  tix.position.set(0, 2.05, 0.82);
  booth.add(tix);
  booth.position.set(-4.2, 0, 5.6);
  root.add(booth);
  const sign = signBoard('THE GOLDEN WHEEL', 7.4, 1.5, NAVY, GOLD);
  sign.position.set(-HALF - 2.9, 4.3, 0);
  sign.rotation.y = -Math.PI / 2;
  root.add(sign);
  for (const sz of [-3.4, 3.4]) root.add(cyl(0.09, 0.09, 5.0, 8, dark, -HALF - 2.9, 2.5, sz));
  shadows(root);
  wheel.traverse(o => (o.userData.noBatch = true));
  return {
    root,
    update(t: number) {
      wheel.rotation.x = t * 0.11;
      for (const g of gondolas) g.rotation.x = -wheel.rotation.x + 0.05 * Math.sin(t * 0.9 + g.position.y);
    },
  };
}

// ---------------------------------------------------------------- the carousel
function horse(color: string) {
  const g = new THREE.Group(),
    coat = M(color, 0.45),
    dark = M('#2a2420', 0.6),
    trim = M(GOLD, 0.35, 0.5);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.52, 4, 10).rotateZ(Math.PI / 2), coat);
  body.scale.set(1, 1.05, 0.85);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.32, 3, 8), coat);
  neck.position.set(0.42, 0.26, 0);
  neck.rotation.z = -0.65;
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.2, 3, 8).rotateZ(Math.PI / 2), coat);
  head.position.set(0.62, 0.42, 0);
  head.rotation.z = -0.5;
  g.add(body, neck, head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 5), coat);
    ear.position.set(0.52, 0.55, s * 0.05);
    g.add(ear);
  }
  // mane and tail, a saddle on a blanket, and four legs caught mid-gallop
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.04), dark);
  mane.position.set(0.36, 0.34, 0);
  mane.rotation.z = -0.65;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 6), dark);
  tail.position.set(-0.52, -0.02, 0);
  tail.rotation.z = -2.5;
  const blanket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.215, 0.215, 0.36, 12, 1, true, -Math.PI / 2 - 1.1, 2.2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2),
    M(RED, 0.7),
  );
  blanket.scale.set(1, 1.05, 0.87);
  const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, 0.45, 0.8), M('#5a3a26', 0.6));
  saddle.position.set(-0.02, 0.2, 0);
  g.add(mane, tail, blanket, saddle);
  for (const [x, s, bend] of [
    [0.3, 1, 0.9],
    [0.3, -1, 0.3],
    [-0.3, 1, -0.5],
    [-0.3, -1, -1.0],
  ] as [number, number, number][]) {
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 3, 6), coat),
      lo = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.22, 3, 6), coat),
      hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 6), trim),
      leg = new THREE.Group(),
      knee = new THREE.Group();
    up.position.y = -0.14;
    knee.position.y = -0.28;
    lo.position.y = -0.14;
    hoof.position.y = -0.29;
    knee.add(lo, hoof);
    knee.rotation.z = bend > 0 ? -bend * 0.9 : -bend * 0.6;
    leg.add(up, knee);
    leg.position.set(x, -0.12, s * 0.11);
    leg.rotation.z = bend * 0.7;
    g.add(leg);
  }
  return g;
}
function carousel() {
  const root = new THREE.Group(),
    R = 5.2,
    spin = new THREE.Group(),
    wood = M('#8a5f38', 0.8),
    brass = M(GOLD, 0.3, 0.6);
  // the deck: a turned platform with a red skirt and a gold lip
  root.add(
    new THREE.Mesh(
      new THREE.LatheGeometry([V2(0, 0), V2(R + 0.35, 0), V2(R + 0.35, 0.16), V2(R + 0.2, 0.22), V2(R + 0.2, 0.3), V2(0, 0.3)], 40),
      M('#7a2a22', 0.7),
    ),
  );
  spin.add(new THREE.Mesh(new THREE.LatheGeometry([V2(0, 0.3), V2(R, 0.3), V2(R, 0.42), V2(R - 0.06, 0.46), V2(0, 0.46)], 40), wood));
  // the centre drum, panelled in cream and teal with mirrors and a gold cornice
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.25, 3.3, 12),
    new THREE.MeshStandardMaterial({ map: stripes(CREAM, TEAL, 6), roughness: 0.6 }),
  );
  drum.position.y = 2.1;
  spin.add(drum, new THREE.Mesh(new THREE.LatheGeometry([V2(1.25, 3.6), V2(1.5, 3.72), V2(1.5, 3.86), V2(1.3, 3.9)], 12), brass));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 12,
      mirror = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 1.3),
        new THREE.MeshStandardMaterial({ color: '#cfe6ee', roughness: 0.08, metalness: 0.9 }),
      );
    mirror.position.set(Math.sin(a) * 1.27, 2.2, Math.cos(a) * 1.27);
    mirror.rotation.y = a;
    spin.add(mirror);
  }
  // sixteen horses on brass poles, two rings, going up and down out of step
  const horses: { g: THREE.Group; ph: number }[] = [],
    coats = ['#f3ede0', '#3a2e2a', '#b5793e', '#d9d2c4', '#6a4a36', '#f3ede0', '#c9a36a', '#2c2c30'];
  for (let i = 0; i < 16; i++) {
    const ring = i % 2,
      r = ring ? R - 0.95 : R - 2.25,
      a = (i / 16) * Math.PI * 2,
      h = horse(coats[i % coats.length]),
      g = new THREE.Group();
    h.rotation.y = Math.PI; // nose along the direction of travel (the deck turns clockwise seen from above)
    g.add(h);
    g.position.set(Math.sin(a) * r, 1.45, Math.cos(a) * r);
    g.rotation.y = a;
    spin.add(g, cyl(0.03, 0.03, 3.45, 6, brass, Math.sin(a) * r, 2.15, Math.cos(a) * r));
    horses.push({ g, ph: i * 2.4 });
  }
  // the canopy: a striped tent top with a gold cornice, a scalloped valance, bulbs, and a flag
  const top = new THREE.Mesh(
    new THREE.LatheGeometry([V2(R + 0.5, 3.9), V2(R * 0.72, 4.6), V2(R * 0.4, 5.25), V2(0.5, 6.3), V2(0.12, 6.9), V2(0, 6.95)], 32),
    canvasM(RED, CREAM, 8),
  );
  const cornice = new THREE.Mesh(
    new THREE.LatheGeometry([V2(R + 0.42, 3.72), V2(R + 0.56, 3.78), V2(R + 0.56, 3.92), V2(R + 0.44, 3.96)], 40),
    brass,
  );
  spin.add(top, cornice, valance(R + 0.5, 3.74, 32, 0.42, new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.8, side: THREE.DoubleSide })));
  const lp: THREE.Vector3[] = [];
  for (let i = 0; i < 64; i++)
    lp.push(new THREE.Vector3(Math.sin((i / 64) * Math.PI * 2) * (R + 0.58), 3.86, Math.cos((i / 64) * Math.PI * 2) * (R + 0.58)));
  for (let i = 0; i < 12; i++)
    for (let k = 0; k < 7; k++)
      lp.push(new THREE.Vector3(Math.sin((i / 12) * Math.PI * 2) * 1.3, 0.7 + k * 0.45, Math.cos((i / 12) * Math.PI * 2) * 1.3));
  spin.add(bulbs(lp, 0.06));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), brass);
  ball.position.y = 7.05;
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.5),
    new THREE.MeshStandardMaterial({ color: RED, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  flag.position.set(0.45, 7.75, 0);
  spin.add(ball, cyl(0.025, 0.025, 1.1, 6, brass, 0, 7.55, 0), flag);
  root.add(spin);
  // a low fence round it with a gap for the queue
  const iron = M('#2c3440', 0.6, 0.3);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    if (i < 3) continue;
    root.add(cyl(0.03, 0.03, 0.95, 6, iron, Math.sin(a) * (R + 1.5), 0.48, Math.cos(a) * (R + 1.5)));
    root.add(
      strut(
        new THREE.Vector3(Math.sin(a) * (R + 1.5), 0.92, Math.cos(a) * (R + 1.5)),
        new THREE.Vector3(Math.sin(a + (Math.PI * 2) / 40) * (R + 1.5), 0.92, Math.cos(a + (Math.PI * 2) / 40) * (R + 1.5)),
        0.025,
        iron,
      ),
    );
  }
  shadows(root);
  spin.traverse(o => (o.userData.noBatch = true));
  return {
    root,
    update(t: number) {
      spin.rotation.y = -t * 0.32;
      for (const h of horses) h.g.position.y = 1.5 + 0.28 * Math.sin(t * 1.9 + h.ph);
    },
  };
}

// ---------------------------------------------------------------- the big top
function bigTop() {
  const root = new THREE.Group(),
    R = 7.5,
    canvas = canvasM(RED, CREAM, 12),
    wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 3.2, 36, 1, true, 0.22, Math.PI * 2 - 0.44), canvasM(CREAM, RED, 18));
  wall.position.y = 1.6;
  // the roof sags between the eave and the two king poles, like real canvas
  const roof = new THREE.Mesh(
    new THREE.LatheGeometry(
      [V2(R + 0.25, 3.15), V2(R * 0.8, 4.0), V2(R * 0.55, 5.1), V2(R * 0.3, 6.5), V2(0.5, 8.3), V2(0.15, 9.0), V2(0, 9.05)],
      36,
    ),
    canvas,
  );
  root.add(wall, roof, valance(R + 0.25, 3.18, 40, 0.5, new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.8, side: THREE.DoubleSide })));
  // the doorway: two flaps tied back, a striped porch and the sign
  const flapM = canvasM(CREAM, RED, 3);
  for (const s of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.1), flapM);
    flap.position.set(s * 1.75, 1.55, R - 0.2);
    flap.rotation.y = s * 0.75;
    root.add(flap);
  }
  const porch = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 2.4, 12, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2),
    canvasM(RED, CREAM, 5),
  );
  porch.scale.set(1, 0.42, 1);
  porch.position.set(0, 3.2, R + 1.0);
  const sign = signBoard('BIG TOP', 3.6, 0.9, NAVY, GOLD);
  sign.position.set(0, 4.5, R + 2.2);
  root.add(
    porch,
    sign,
    cyl(0.06, 0.06, 3.2, 6, M('#5a3a26', 0.8), -2.3, 1.6, R + 2.1),
    cyl(0.06, 0.06, 3.2, 6, M('#5a3a26', 0.8), 2.3, 1.6, R + 2.1),
  );
  // king pole and pennant, side poles, guy ropes and stakes
  const pole = M('#5a3a26', 0.8),
    rope = new THREE.LineBasicMaterial({ color: '#cbbf9f' });
  root.add(cyl(0.09, 0.09, 2.2, 8, pole, 0, 10.1, 0));
  const pennant = new THREE.Mesh(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(1.5, 0, 0)]),
    new THREE.MeshStandardMaterial({ color: GOLD, side: THREE.DoubleSide }),
  );
  pennant.geometry.computeVertexNormals();
  pennant.position.set(0.1, 10.8, 0);
  root.add(pennant);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16,
      p0 = new THREE.Vector3(Math.sin(a) * (R + 0.2), 3.15, Math.cos(a) * (R + 0.2)),
      p1 = new THREE.Vector3(Math.sin(a) * (R + 2.6), 0.05, Math.cos(a) * (R + 2.6));
    if (Math.abs(a - Math.PI * 2) < 0.5 || a < 0.5) continue; // (not across the doorway)
    root.add(
      new THREE.Line(new THREE.BufferGeometry().setFromPoints([p0, p1]), rope),
      cyl(0.04, 0.03, 0.4, 5, pole, p1.x, 0.2, p1.z),
      cyl(0.05, 0.05, 3.2, 6, pole, p0.x * 0.985, 1.6, p0.z * 0.985),
    );
  }
  const lp: THREE.Vector3[] = [];
  for (let i = 0; i < 60; i++)
    lp.push(new THREE.Vector3(Math.sin((i / 60) * Math.PI * 2) * (R + 0.3), 3.3, Math.cos((i / 60) * Math.PI * 2) * (R + 0.3)));
  root.add(bulbs(lp, 0.06));
  // dark inside, with a warm glow at the door
  const inside = new THREE.Mesh(new THREE.CircleGeometry(1.5, 12), new THREE.MeshBasicMaterial({ color: '#2a120c' }));
  inside.position.set(0, 1.5, R - 0.6);
  root.add(inside);
  return { root: shadows(root) };
}

// ---------------------------------------------------------------- game stalls
function stall(name: string, a: string, b: string, prize: (i: number) => THREE.Object3D) {
  const root = new THREE.Group(),
    wood = M('#8a5f38', 0.85),
    W = 4.2,
    D = 2.6;
  root.add(
    box(W, 1.0, 0.5, new THREE.MeshStandardMaterial({ map: stripes(a, CREAM, 7), roughness: 0.8 }), 0, 0.5, D / 2 - 0.25),
    box(W + 0.2, 0.08, 0.7, wood, 0, 1.04, D / 2 - 0.25),
  ); // counter
  root.add(box(W, 2.6, 0.1, M(b, 0.8), 0, 1.3, -D / 2), box(0.1, 2.6, D, M(b, 0.8), -W / 2, 1.3, 0), box(0.1, 2.6, D, M(b, 0.8), W / 2, 1.3, 0));
  for (const y of [1.25, 1.85]) root.add(box(W - 0.3, 0.05, 0.32, wood, 0, y, -D / 2 + 0.22));
  for (let i = 0; i < 12; i++) {
    const p = prize(i);
    p.position.set(-W / 2 + 0.45 + (i % 6) * ((W - 0.9) / 5), i < 6 ? 1.28 : 1.88, -D / 2 + 0.22);
    root.add(p);
  }
  // the awning: a pitched striped roof with a scalloped front edge, corner posts, a sign and a string of bulbs
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.7, D + 1.3), canvasM(a, CREAM, 7));
  roof.rotation.x = -Math.PI / 2 + 0.24;
  roof.position.set(0, 2.85, 0.2);
  root.add(roof);
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(
      new THREE.CircleGeometry((W + 0.7) / 18, 8, Math.PI, Math.PI),
      new THREE.MeshStandardMaterial({ color: i % 2 ? CREAM : a, side: THREE.DoubleSide, roughness: 0.8 }),
    );
    f.position.set(-(W + 0.7) / 2 + ((i + 0.5) * (W + 0.7)) / 9, 2.62, D / 2 + 0.83);
    root.add(f);
  }
  for (const sx of [-W / 2, W / 2]) root.add(cyl(0.05, 0.05, 2.7, 6, wood, sx, 1.35, D / 2 + 0.1));
  const s = signBoard(name, W - 0.2, 0.62, NAVY, GOLD);
  s.position.set(0, 3.45, D / 2 + 0.3);
  root.add(s, box(W, 0.74, 0.08, wood, 0, 3.45, D / 2 + 0.24));
  const lp: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) lp.push(new THREE.Vector3(-W / 2 + (i / 14) * W, 2.5 - Math.sin((i / 14) * Math.PI) * 0.12, D / 2 + 0.75));
  root.add(bulbs(lp, 0.05));
  return shadows(root);
}
const bear = (i: number) => {
  const g = new THREE.Group(),
    m = M([RED, TEAL, GOLD, '#b06a9a', '#6a8ac8', '#d9a06a'][i % 6], 0.9);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), m));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), m);
  head.position.y = 0.19;
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), m);
    ear.position.set(s * 0.08, 0.28, 0);
    g.add(ear);
  }
  g.position.y = 0.13;
  const w = new THREE.Group();
  w.add(g);
  return w;
};
const bottle = (i: number) => {
  const m = new THREE.Mesh(
    new THREE.LatheGeometry([V2(0, 0), V2(0.07, 0), V2(0.07, 0.2), V2(0.03, 0.3), V2(0.03, 0.4), V2(0, 0.4)], 8),
    M(['#f3ede0', '#7fb0c8', '#9ac87a'][i % 3], 0.3),
  );
  return m;
};
const balloon = (i: number) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8).scale(1, 1.2, 1), M([RED, GOLD, TEAL, '#b06a9a', '#6a8ac8'][i % 5], 0.25));
  m.position.y = 0.2;
  const w = new THREE.Group();
  w.add(m);
  return w;
};

// ---------------------------------------------------------------- putting it in the park
/** Where the Rusty Rocket stands (its door faces west). */
export const ROCKET: [number, number] = [118, 22];
export function buildFairground(G: THREE.Group, col: (x0: number, x1: number, z0: number, z1: number) => void) {
  const wheel = bigWheel();
  wheel.root.position.set(160, 0, 5); // east of the grandstands, facing town across the whole park
  G.add(wheel.root);
  for (const sz of [-5.2, 5.2]) col(157.6, 162.4, 5 + sz - 0.7, 5 + sz + 0.7);
  col(157.8, 162.2, 1.4, 8.6); // the boarding deck
  col(154.9, 156.7, 9.7, 11.5); // the ticket booth

  const merry = carousel();
  merry.root.position.set(89, 0, 1.5);
  G.add(merry.root);
  col(89 - 4.9, 89 + 4.9, 1.5 - 4.9, 1.5 + 4.9);

  const tent = bigTop();
  tent.root.position.set(114, 0, 4.5); // between the carousel and the grandstands
  tent.root.scale.setScalar(0.8);
  tent.root.rotation.y = -Math.PI / 2; // the doorway faces the park's plaza
  G.add(tent.root);
  col(114 - 5, 114 + 5, 4.5 - 5, 4.5 + 5);

  const STALLS: [string, string, string, (i: number) => THREE.Object3D, number, number, number][] = [
    ['RING TOSS', RED, '#3a5a6a', bottle, 84, -8.4, 0],
    ['WIN A BEAR', TEAL, '#6a3a4a', bear, 94, -8.4, 0],
    ['POP A BALLOON', GOLD, '#3a4a6a', balloon, 100.5, 10.2, Math.PI],
  ];
  for (const [name, a, b, prize, x, z, yaw] of STALLS) {
    const s = stall(name, a, b, prize);
    s.position.set(x, 0, z);
    s.rotation.y = yaw;
    G.add(s);
    const along = Math.abs(Math.sin(yaw)) > 0.5;
    col(x - (along ? 1.5 : 2.2), x + (along ? 1.5 : 2.2), z - (along ? 2.2 : 1.5), z + (along ? 2.2 : 1.5));
  }
  // bunting on posts round the carousel and along the walk to the wheel
  const post = M('#5a3a26', 0.8),
    POSTS: [number, number][] = [
      [78, -9.8],
      [100, -9.8],
      [80, 10.5],
      [104.5, 12],
      [125, 12],
      [150, 12],
    ];
  for (const [x, z] of POSTS) G.add(cyl(0.07, 0.07, 5.2, 6, post, x, 2.6, z));
  const B = (a: number, b: number) =>
    G.add(bunting(new THREE.Vector3(POSTS[a][0], 5.1, POSTS[a][1]), new THREE.Vector3(POSTS[b][0], 5.1, POSTS[b][1]), 0.9));
  B(0, 1);
  B(0, 2);
  B(2, 3);
  B(3, 4);
  B(4, 5);
  // the Rusty Rocket, behind the big top: climb in and it takes your group to the Moon course (lobby.ts 'rocket')
  const rocket = rustyRocket(false);
  rocket.position.set(ROCKET[0], 0, ROCKET[1]);
  rocket.rotation.y = -Math.PI / 2; // door and ladder face the park (west)
  G.add(rocket);
  const rs = signBoard('RUSTY ROCKET', 3.4, 0.85, NAVY, GOLD);
  rs.position.set(ROCKET[0] - 1.72, 5.6, ROCKET[1]);
  rs.rotation.y = -Math.PI / 2;
  G.add(rs);
  col(ROCKET[0] - 2.3, ROCKET[0] + 2.3, ROCKET[1] - 2.3, ROCKET[1] + 2.3);
  return {
    update(t: number) {
      wheel.update(t);
      merry.update(t);
    },
  };
}
