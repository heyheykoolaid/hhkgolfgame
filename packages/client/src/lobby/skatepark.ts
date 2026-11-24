// The skate spot: a concrete pad in the south meadow, inside the off-road trail's loop. Two quarter pipes face each
// other across it; between them a flat rail, a ledge with metal edges, a manual pad and a little kicker ramp. Its
// shapes are ground (skateY: walkers climb them, the board rides them, world.ts groundY adds them) and one physics
// mesh for cars; the rail and the ledge's edges are grind rails (vehicles/skateboard.ts).
// (world.ts imports this file: nothing at the top level may read a value from world.ts.)
import * as THREE from 'three';

export const PARK = { x: -50, z: 146, hx: 20, hz: 14 };
const PAD = 0.05,
  QP_R = 2.4, // quarter pipe radius
  QP_TOP = 2.0, // where the curve stops: then a flat deck
  QP_DECK = 1.6,
  QP_HW = 7; // half its width
/** The ledge, the manual pad and the kicker, in the park's own frame (x along the long side). */
const LEDGE = { x0: -7, x1: 7, z0: 5.6, z1: 6.4, h: 0.42 },
  PADBOX = { x0: -4, x1: 4, z0: -1, z1: 1.2, h: 0.2 },
  KICK = { x0: 8, x1: 12.6, hz: 1.2, h: 0.5, ramp: 1.6 }; // a fun box: a ramp up, a flat top, a ramp down
/** quarter pipe height at u metres in from where its curve begins */
const qp = (u: number) => {
  if (u <= 0) return 0;
  const uTop = Math.sqrt(QP_R * QP_R - (QP_R - QP_TOP) ** 2);
  if (u < uTop) return QP_R - Math.sqrt(QP_R * QP_R - u * u);
  if (u < uTop + QP_DECK) return QP_TOP;
  return -1; // behind the deck: off the back
};
const QP_LEN = Math.sqrt(QP_R * QP_R - (QP_R - QP_TOP) ** 2) + QP_DECK;
/** The ground's height from the park at (x, z): the pad and everything on it (0 off the pad). */
export function skateY(x: number, z: number) {
  const lx = x - PARK.x,
    lz = z - PARK.z;
  if (Math.abs(lx) > PARK.hx || Math.abs(lz) > PARK.hz) return 0;
  let h = PAD;
  // the quarter pipes, at each end, their curves rising toward the ends
  if (Math.abs(lz) < QP_HW) {
    const u = Math.abs(lx) - (PARK.hx - QP_LEN),
      q = qp(u);
    if (q > 0) h = PAD + q;
  }
  if (lx > LEDGE.x0 && lx < LEDGE.x1 && lz > LEDGE.z0 && lz < LEDGE.z1) h = PAD + LEDGE.h;
  if (lx > PADBOX.x0 && lx < PADBOX.x1 && lz > PADBOX.z0 && lz < PADBOX.z1) h = PAD + PADBOX.h;
  if (lx > KICK.x0 && lx < KICK.x1 && Math.abs(lz) < KICK.hz) h = PAD + KICK.h * Math.min(1, (lx - KICK.x0) / KICK.ramp, (KICK.x1 - lx) / KICK.ramp);
  return h;
}
const W = (lx: number, lz: number): [number, number] => [PARK.x + lx, PARK.z + lz];
/** What you can grind here: the flat rail, the ledge's two top edges, and the quarter pipes' copings. */
export const SKATE_RAILS = (() => {
  const r: { ax: number; az: number; bx: number; bz: number; h: number }[] = [],
    seg = (a: [number, number], b: [number, number], h: number) => r.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], h });
  seg(W(-9, -6), W(9, -6), PAD + 0.55); // the flat rail
  seg(W(LEDGE.x0, LEDGE.z0), W(LEDGE.x1, LEDGE.z0), PAD + LEDGE.h);
  seg(W(LEDGE.x0, LEDGE.z1), W(LEDGE.x1, LEDGE.z1), PAD + LEDGE.h);
  const cx = PARK.hx - QP_DECK;
  for (const s of [-1, 1]) seg(W(s * cx, -QP_HW), W(s * cx, QP_HW), PAD + QP_TOP); // copings
  return r;
})();
/** Is (x, z) on the park's pad (with a margin)? (for keeping trees off it) */
export const onPark = (x: number, z: number, m = 0) => Math.abs(x - PARK.x) < PARK.hx + m && Math.abs(z - PARK.z) < PARK.hz + m;

/** The park's ground as a triangle mesh, for car physics. */
export function skateParkMesh() {
  const step = 0.4,
    nx = Math.round((PARK.hx * 2) / step),
    nz = Math.round((PARK.hz * 2) / step),
    v: number[] = [],
    idx: number[] = [];
  for (let k = 0; k <= nz; k++)
    for (let i = 0; i <= nx; i++) {
      const x = PARK.x - PARK.hx + i * step,
        z = PARK.z - PARK.hz + k * step;
      v.push(x, skateY(x, z), z);
      if (i < nx && k < nz) {
        const o = k * (nx + 1) + i;
        idx.push(o, o + nx + 1, o + 1, o + 1, o + nx + 1, o + nx + 2);
      }
    }
  return { verts: new Float32Array(v), indices: new Uint32Array(idx) };
}

export function buildSkatePark(scene: THREE.Scene) {
  const G = new THREE.Group();
  G.name = 'skatepark';
  const conc = new THREE.MeshStandardMaterial({ color: '#b8b2a6', roughness: 0.85 }),
    ramp = new THREE.MeshStandardMaterial({ color: '#a8a8a3', roughness: 0.6, side: THREE.DoubleSide }),
    metal = new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 0.8, roughness: 0.3 }),
    paint = new THREE.MeshStandardMaterial({ color: '#c8452f', roughness: 0.6 });
  // the pad: the ground function sampled finely, so the quarter pipes' curves are smooth
  const m = skateParkMesh(),
    g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.verts, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  const pad = new THREE.Mesh(g, ramp);
  pad.receiveShadow = true;
  G.add(pad);
  // the quarter pipes' backs (a wall down from the deck) and sides
  for (const s of [-1, 1]) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.2, PAD + QP_TOP, QP_HW * 2), conc);
    back.position.set(PARK.x + s * (PARK.hx - 0.1), (PAD + QP_TOP) / 2, PARK.z);
    G.add(back);
    for (const sz of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(QP_LEN, PAD + QP_TOP, 0.2), conc);
      side.position.set(PARK.x + s * (PARK.hx - QP_LEN / 2), (PAD + QP_TOP) / 2, PARK.z + sz * (QP_HW + 0.1));
      G.add(side);
    }
  }
  // grind rails, drawn on their own lines: copings, the ledge's angle iron, the flat rail on posts
  for (const r of SKATE_RAILS) {
    const L = Math.hypot(r.bx - r.ax, r.bz - r.az),
      pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L, 8).rotateX(Math.PI / 2), metal);
    pipe.position.set((r.ax + r.bx) / 2, r.h + 0.01, (r.az + r.bz) / 2);
    pipe.rotation.y = Math.atan2(r.bx - r.ax, r.bz - r.az);
    G.add(pipe);
  }
  for (const lx of [-8, -3, 3, 8]) {
    const [x, z] = W(lx, -6),
      post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), metal);
    post.position.set(x, PAD + 0.275, z);
    G.add(post);
  }
  // the ledge and the manual pad (their tops are already in the pad mesh; these are their painted faces)
  for (const b of [LEDGE, PADBOX]) {
    const bx = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.h, b.z1 - b.z0), b === LEDGE ? paint : conc);
    const [x, z] = W((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    bx.position.set(x, PAD + b.h / 2 - 0.005, z);
    bx.castShadow = bx.receiveShadow = true;
    G.add(bx);
  }
  // a sign at the corner by the trail
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 160;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#1d1d1f';
  c.fillRect(0, 0, 512, 160);
  c.fillStyle = '#ffd24a';
  c.font = 'bold 66px "Barlow Condensed", Impact, sans-serif';
  c.textAlign = 'center';
  c.fillText('GOLDEN HILLS', 256, 72);
  c.fillStyle = '#f4f1ea';
  c.font = 'bold 48px "Barlow Condensed", Impact, sans-serif';
  c.fillText('SKATE SPOT  ·  K to ride', 256, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // (two faces back to back, so it reads the right way round from both sides)
  for (const ry of [0, Math.PI]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), new THREE.MeshStandardMaterial({ map: tex }));
    sign.position.set(PARK.x - 4, 2.4, PARK.z - PARK.hz - 1.2 + (ry ? -0.01 : 0.01));
    sign.rotation.y = ry;
    G.add(sign);
  }
  for (const dx of [-1.4, 1.4]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), metal);
    p.position.set(PARK.x - 4 + dx, 1.2, PARK.z - PARK.hz - 1.22);
    G.add(p);
  }
  scene.add(G);
}
