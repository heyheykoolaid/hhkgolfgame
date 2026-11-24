// Dressing for the two stranger courses, kept out of course.ts: the Old Estate (locale 'haunt': dead trees, graves,
// a Gothic manor behind the green, gargoyles and gate piers, the moat and its drawbridge) and the Bad Batch (locale
// 'trip': bounce-pad mushrooms, warp pipes, giant flamingos drifting by, a sea of cloud). Skies for both. All built in
// code; what the ball can meet comes from the hole (pillars, moat, pads, pipes) and is drawn exactly where it plays.
import * as THREE from 'three';
import { COURSE, heightAt, classify, TREES, CENTER_PTS, FLOOR } from '@gh/shared';
import { waterMaterial } from './water';

let sd = 1;
const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
const stone = () => new THREE.MeshStandardMaterial({ color: '#5d5752', roughness: 0.95, flatShading: true });
const shade = (o: THREE.Object3D) => {
  o.traverse(m => ((m as THREE.Mesh).castShadow = (m as THREE.Mesh).receiveShadow = true));
  return o;
};

/** Things that move between frames (flamingos drifting, lanterns flickering); golfMode calls tickDecor each frame. */
const ticks: ((t: number) => void)[] = [];
export function tickDecor(t: number) {
  for (const f of ticks) f(t);
}
/** Forget the last hole's movers (its group is thrown away). */
export function resetDecor() {
  ticks.length = 0;
}

/** The direction down the hole near the green (unit x, z). */
function finalDir() {
  const n = CENTER_PTS.length,
    p = CENTER_PTS[Math.max(0, n - 12)],
    q = CENTER_PTS[n - 1],
    L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
  return { x: (q.x - p.x) / L, z: (q.z - p.z) / L };
}

// ---------------------------------------------------------------- skies
/** A dome painted from horizon to zenith, with a glow toward the sun. */
function dome(name: string, hor: string, mid: string, zen: string, glow: string, sunAz: number) {
  const R = 1480,
    g = new THREE.SphereGeometry(R, 32, 18),
    p = g.attributes.position,
    cols: number[] = [],
    H = new THREE.Color(hor),
    M = new THREE.Color(mid),
    Z = new THREE.Color(zen),
    G = new THREE.Color(glow),
    c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / R,
      w = Math.max(0, Math.cos(Math.atan2(p.getX(i), p.getZ(i)) - sunAz)) ** 4 * Math.max(0, 1 - Math.abs(y) * 3);
    c.copy(H)
      .lerp(M, Math.min(1, Math.max(0, y) * 3))
      .lerp(Z, Math.min(1, Math.max(0, y - 0.3) * 1.5))
      .lerp(G, w * 0.8);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.name = name;
  m.renderOrder = -10;
  return m;
}
export function hauntSky(sunAz: number) {
  const g = new THREE.Group();
  g.name = 'hauntSky';
  g.add(dome('hauntDome', '#c4502a', '#7a2a2a', '#2a1630', '#ffb050', sunAz));
  // a big low blood-orange sun
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(70, 40),
    new THREE.MeshBasicMaterial({ color: '#ff7a3a', fog: false, transparent: true, opacity: 0.95 }),
  );
  sun.position.set(Math.sin(sunAz) * 1350, 140, Math.cos(sunAz) * 1350);
  sun.lookAt(0, 0, 0);
  g.add(sun);
  return g;
}
export function tripSky(sunAz: number) {
  const g = new THREE.Group();
  g.name = 'tripSky';
  g.add(dome('tripDome', '#ff7ac8', '#a35cf0', '#2a1a6e', '#ffd36e', sunAz));
  // the striped vaporwave sun
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const x = cv.getContext('2d')!,
    gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#ffe66e');
  gr.addColorStop(1, '#ff4fa8');
  x.fillStyle = gr;
  x.beginPath();
  x.arc(128, 128, 126, 0, 7);
  x.fill();
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) x.fillRect(0, 150 + i * 15, 256, 3 + i * 1.4);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ map: tex, fog: false, transparent: true }));
  sun.position.set(Math.sin(sunAz) * 1350, 120, Math.cos(sunAz) * 1350);
  sun.lookAt(0, 120, 0);
  g.add(sun);
  // a sea of cloud far below the edges of the course
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd9ef', fog: false }));
  cl.position.y = -60;
  g.add(cl);
  return g;
}

// ---------------------------------------------------------------- the Old Estate
function deadTreeGeo(v: number) {
  sd = 900 + v * 77;
  const parts: THREE.BufferGeometry[] = [],
    trunk = new THREE.CylinderGeometry(0.14, 0.32, 5.5, 6).translate(0, 2.75, 0);
  parts.push(trunk);
  const limb = (x: number, y: number, z: number, len: number, a: number, tilt: number, r0: number) => {
    const c = new THREE.CylinderGeometry(r0 * 0.4, r0, len, 5).translate(0, len / 2, 0);
    c.rotateZ(tilt);
    c.rotateY(a);
    c.translate(x, y, z);
    parts.push(c);
    return [x + Math.sin(tilt) * -len * Math.cos(a), y + Math.cos(tilt) * len, z + Math.sin(tilt) * len * Math.sin(a)];
  };
  for (let k = 0; k < 5; k++) {
    const a = rnd() * 6.28,
      y = 2.6 + k * 0.6,
      tip = limb(0, y, 0, 1.6 + rnd() * 1.6, a, 0.6 + rnd() * 0.5, 0.12);
    if (rnd() < 0.7) limb(tip[0], tip[1], tip[2], 0.8 + rnd(), a + 0.8, 0.3 + rnd() * 0.6, 0.05);
  }
  // merge (each piece as plain triangles, so they can simply be laid end to end)
  const flat = parts.map(p => p.toNonIndexed()),
    n = flat.reduce((a, q) => a + q.attributes.position.count, 0),
    pos = new Float32Array(n * 3);
  let o = 0;
  for (const q of flat) {
    pos.set(q.attributes.position.array as Float32Array, o * 3);
    o += q.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function gargoyle(h: number, r: number) {
  const g = new THREE.Group(),
    m = stone();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(r * 1.7, h - 1.1, r * 1.7), m);
  plinth.position.y = (h - 1.1) / 2;
  g.add(plinth);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.18, r * 2), m);
  cap.position.y = h - 1.05;
  g.add(cap);
  // the creature: hunched body, head with horns, folded wings, claws over the edge
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6).scale(1, 1.1, 0.9), m);
  body.position.y = h - 0.55;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6).scale(1, 0.9, 1.2), m);
  head.position.set(0, h - 0.15, 0.3);
  g.add(head);
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 5), m);
    horn.position.set(sx * 0.12, h + 0.05, 0.25);
    horn.rotation.z = -sx * 0.4;
    g.add(horn);
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 3).scale(0.25, 1, 1), m);
    wing.position.set(sx * 0.38, h - 0.35, -0.2);
    wing.rotation.set(-0.5, 0, sx * 0.5);
    g.add(wing);
  }
  return shade(g);
}

function gatePier(h: number, r: number, side: number, faceA: number) {
  const g = new THREE.Group(),
    m = stone(),
    iron = new THREE.MeshStandardMaterial({ color: '#1c1a1a', roughness: 0.6, metalness: 0.7 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, h, r * 1.6), m);
  pier.position.y = h / 2;
  g.add(pier);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 8), m);
  ball.position.y = h + r * 0.4;
  g.add(ball);
  // a wrought-iron gate leaf swung open, outward (away from the fairway)
  const leaf = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.6 + Math.sin((i / 8) * Math.PI) * 0.6, 0.04), iron);
    bar.position.set(0.3 + i * 0.3, 1.4, 0);
    leaf.add(bar);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), iron);
    spike.position.set(0.3 + i * 0.3, 2.8 + Math.sin((i / 8) * Math.PI) * 0.3, 0);
    leaf.add(spike);
  }
  for (const y of [0.4, 2.3]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.05), iron);
    rail.position.set(1.5, y, 0);
    leaf.add(rail);
  }
  leaf.position.set(0, 0, 0);
  leaf.rotation.y = faceA + side * 0.35;
  g.add(leaf);
  return shade(g);
}

function manor() {
  const g = new THREE.Group(),
    m = new THREE.MeshStandardMaterial({ color: '#3a3438', roughness: 0.95, flatShading: true }),
    roof = new THREE.MeshStandardMaterial({ color: '#221e24', roughness: 0.9, flatShading: true }),
    lit = new THREE.MeshBasicMaterial({ color: '#ffb35a' }),
    dark = new THREE.MeshBasicMaterial({ color: '#141014' });
  const block = (w: number, h: number, d: number, x: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, h / 2, z);
    g.add(b);
    const r = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.6, 4).rotateY(Math.PI / 4).scale(w / Math.max(w, d), 1, d / Math.max(w, d)),
      roof,
    );
    r.position.set(x, h + h * 0.3, z);
    g.add(r);
    // two rows of tall windows on the front (+z), a few of them lit
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < Math.floor(w / 4); i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), rnd() < 0.3 ? lit : dark);
        win.position.set(x - w / 2 + 2 + i * 4, h * (0.3 + row * 0.38), z + d / 2 + 0.02);
        g.add(win);
      }
  };
  sd = 4242;
  block(36, 14, 14, 0, 0);
  block(12, 20, 12, -22, 2);
  block(12, 17, 12, 22, 2);
  for (const [x, z, h] of [
    [-30, 7, 30],
    [30, 7, 26],
    [9, -4, 24],
  ]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, h, 8), m);
    t.position.set(x, h / 2, z);
    g.add(t);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(3.8, 10, 8), roof);
    sp.position.set(x, h + 5, z);
    g.add(sp);
  }
  return g;
}

export function hauntDressing(scene: THREE.Object3D) {
  sd = (COURSE.seed || 3) * 13 + 1;
  // dead trees where the hole's trees stand (so the trunks you see are the trunks the ball meets)
  const geos = [0, 1, 2].map(deadTreeGeo),
    bark = new THREE.MeshStandardMaterial({ color: '#2e2622', roughness: 1, flatShading: true }),
    lists: (typeof TREES)[] = [[], [], []];
  TREES.forEach((t, i) => lists[i % 3].push(t));
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0);
  lists.forEach((L, v) => {
    if (!L.length) return;
    const im = new THREE.InstancedMesh(geos[v], bark, L.length);
    L.forEach((t, i) =>
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, t.y, t.z), q.setFromAxisAngle(up, t.id * 1.7), new THREE.Vector3(t.s, t.s, t.s))),
    );
    im.castShadow = true;
    scene.add(im);
  });
  // graves in the long grass
  const B = COURSE.bounds,
    slabs: THREE.Matrix4[] = [];
  for (let n = 0, tries = 0; n < 60 && tries < 3000; tries++) {
    const x = B.x0 + 30 + rnd() * (B.x1 - B.x0 - 60),
      z = B.z0 + 30 + rnd() * (B.z1 - B.z0 - 60),
      k = classify(x, z);
    if (k.s !== 'heavy' && k.s !== 'ob') continue;
    slabs.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, heightAt(x, z) + 0.45, z),
        q.setFromAxisAngle(up, rnd() * 0.6 - 0.3 + (rnd() < 0.5 ? 0 : Math.PI)),
        new THREE.Vector3(1, 0.8 + rnd() * 0.5, 1),
      ),
    );
    n++;
  }
  if (slabs.length) {
    const g = new THREE.BoxGeometry(0.7, 1, 0.18);
    g.translate(0, 0, 0);
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: '#7a7670', roughness: 0.95 }), slabs.length);
    slabs.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    scene.add(im);
  }
  // the gargoyles and the gate
  for (const p of COURSE.pillars || []) {
    const y = heightAt(p.x, p.z);
    if (p.kind === 'gate') {
      // which side of the fairway it's on: the gate leaf swings away from the centre line
      const c = CENTER_PTS.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a)),
        away = Math.atan2(p.x - c.x, p.z - c.z);
      const o = gatePier(p.h, p.r, 1, away - Math.PI / 2);
      o.position.set(p.x, y, p.z);
      scene.add(o);
    } else {
      const o = gargoyle(p.h, p.r);
      o.position.set(p.x, y, p.z);
      o.rotation.y = rnd() * 6.28;
      scene.add(o);
    }
  }
  // the moat's water, and the drawbridge across it
  const mo = COURSE.moat;
  if (mo) {
    const seg = 96,
      pos: number[] = [],
      dep: number[] = [],
      idx: number[] = [],
      half = Math.asin(Math.min(1, (mo.bw / 2 + 0.2) / ((mo.r0 + mo.r1) / 2)));
    for (let i = 0; i <= seg; i++) {
      const a = mo.ang + half + ((Math.PI * 2 - 2 * half) * i) / seg;
      for (const rr of [mo.r0 - 0.4, mo.r1 + 0.4]) {
        pos.push(Math.sin(a) * rr, 0, Math.cos(a) * rr);
        dep.push(Math.max(0.05, mo.level - heightAt(mo.x + Math.sin(a) * rr, mo.z + Math.cos(a) * rr)));
      }
      if (i < seg) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute(
      'aDepth',
      new THREE.Float32BufferAttribute(
        dep.map(d => Math.max(d, 0.6)),
        1,
      ),
    );
    wg.setIndex(idx);
    wg.computeVertexNormals();
    const water = new THREE.Mesh(wg, waterMaterial('#1f2a26', 0, 1, 0.92, true));
    water.position.set(mo.x, mo.level, mo.z);
    scene.add(water);
    // planks on the bridge, chains up to two little gate towers on the outer bank
    const wood = new THREE.MeshStandardMaterial({ color: '#5a3e28', roughness: 0.9 }),
      iron = new THREE.MeshStandardMaterial({ color: '#1c1a1a', roughness: 0.6, metalness: 0.7 }),
      ux = Math.sin(mo.ang),
      uz = Math.cos(mo.ang);
    for (let a = mo.r0 - 1.2; a <= mo.r1 + 1.2; a += 0.45) {
      const x = mo.x + ux * a,
        z = mo.z + uz * a,
        p = new THREE.Mesh(new THREE.BoxGeometry(mo.bw, 0.08, 0.4), wood);
      p.position.set(x, heightAt(x, z) + 0.05, z);
      p.rotation.y = mo.ang;
      p.receiveShadow = true;
      scene.add(p);
    }
    for (const side of [-1, 1]) {
      const ox = mo.x + ux * (mo.r1 + 1.6) + uz * side * (mo.bw / 2 + 0.6),
        oz = mo.z + uz * (mo.r1 + 1.6) - ux * side * (mo.bw / 2 + 0.6),
        y = heightAt(ox, oz),
        tower = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.2, 1.1), stone());
      tower.position.set(ox, y + 2.1, oz);
      tower.castShadow = true;
      scene.add(tower);
      const ix = mo.x + ux * (mo.r0 - 0.6) + uz * side * (mo.bw / 2),
        iz = mo.z + uz * (mo.r0 - 0.6) - ux * side * (mo.bw / 2),
        a = new THREE.Vector3(ox, y + 4, oz),
        b = new THREE.Vector3(ix, heightAt(ix, iz) + 0.2, iz),
        L = a.distanceTo(b),
        chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, L, 4), iron);
      chain.position.copy(a).add(b).multiplyScalar(0.5);
      chain.lookAt(b);
      chain.rotateX(Math.PI / 2);
      scene.add(chain);
    }
  }
  // the manor, behind the green, lit in a few windows
  const d = finalDir(),
    g = COURSE.green,
    mx = g.x + d.x * 120,
    mz = g.z + d.z * 120,
    h = manor();
  h.position.set(mx, Math.max(FLOOR, heightAt(mx, mz)) - 0.5, mz);
  h.rotation.y = Math.atan2(-d.x, -d.z);
  scene.add(h);
}

// ---------------------------------------------------------------- the Bad Batch
function mushroom(r: number) {
  const g = new THREE.Group(),
    cap = new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1),
      new THREE.MeshStandardMaterial({ color: '#e8344a', roughness: 0.5 }),
    );
  cap.position.y = 0.9;
  g.add(cap);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.35, r * 0.42, 0.95, 12),
    new THREE.MeshStandardMaterial({ color: '#f4ead6', roughness: 0.8 }),
  );
  stem.position.y = 0.47;
  g.add(stem);
  const dot = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
  for (let i = 0; i < 16; i++) {
    const a = rnd() * 6.28,
      e = 0.2 + rnd() * 1.1,
      s = new THREE.Mesh(new THREE.CircleGeometry(r * (0.1 + rnd() * 0.08), 10), dot);
    const px = Math.cos(a) * Math.sin(e) * r,
      pz = Math.sin(a) * Math.sin(e) * r,
      py = 0.9 + Math.cos(e) * r * 0.55;
    s.position.set(px * 1.01, py + 0.02, pz * 1.01);
    s.lookAt(px * 2, 0.9 + (py - 0.9) * 2, pz * 2);
    g.add(s);
  }
  return shade(g);
}
function pipe(mouthFacing: number) {
  const g = new THREE.Group(),
    m = new THREE.MeshStandardMaterial({ color: '#9a5a2e', roughness: 0.7, metalness: 0.5, side: THREE.DoubleSide }),
    body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4, 18, 1, true).rotateX(Math.PI / 2), m);
  body.position.set(0, 0.7, -1.6);
  g.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.18, 8, 24), m);
  rim.position.set(0, 0.7, 0.4);
  g.add(rim);
  const back = new THREE.Mesh(new THREE.CircleGeometry(1.48, 18), new THREE.MeshBasicMaterial({ color: '#120a18' }));
  back.position.set(0, 0.7, -0.4);
  g.add(back);
  g.rotation.y = mouthFacing;
  return shade(g);
}
function flamingo() {
  const g = new THREE.Group(),
    pink = new THREE.MeshStandardMaterial({ color: '#ff6fae', roughness: 0.4, metalness: 0.1 }),
    dark = new THREE.MeshStandardMaterial({ color: '#2a1a2a' });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 10).scale(1.4, 0.8, 0.8), pink);
  body.position.y = 6;
  g.add(body);
  const neck = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.22, 8, 16, Math.PI * 1.3), pink);
  neck.position.set(1.6, 7.2, 0);
  neck.rotation.z = -0.4;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), pink);
  head.position.set(2.6, 8.6, 0);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.8, 6), dark);
  beak.position.set(3.1, 8.3, 0);
  beak.rotation.z = -2;
  g.add(beak);
  for (const z of [-0.3, 0.3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 5), dark);
    leg.position.set(0, 2.5, z);
    g.add(leg);
  }
  return shade(g);
}
export function tripDressing(scene: THREE.Object3D) {
  sd = (COURSE.seed || 5) * 31 + 7;
  for (const p of COURSE.pads || []) {
    const o = mushroom(p.r);
    o.position.set(p.x, heightAt(p.x, p.z), p.z);
    scene.add(o);
  }
  for (const p of COURSE.pipes || []) {
    // the mouth faces the fairway; the far end comes up facing the pin
    const c = CENTER_PTS.reduce((a, b) => (Math.hypot(b.x - p.ax, b.z - p.az) < Math.hypot(a.x - p.ax, a.z - p.az) ? b : a)),
      a = pipe(Math.atan2(c.x - p.ax, c.z - p.az));
    a.position.set(p.ax, heightAt(p.ax, p.az) - 0.6, p.az);
    scene.add(a);
    const b = pipe(Math.atan2(COURSE.pin.x - p.bx, COURSE.pin.z - p.bz));
    b.position.set(p.bx, heightAt(p.bx, p.bz) - 0.6, p.bz);
    b.scale.setScalar(0.8);
    scene.add(b);
  }
  // giant flamingos drifting in the air round the hole, slowly turning and bobbing
  const B = COURSE.bounds;
  for (let i = 0; i < 9; i++) {
    const f = flamingo(),
      x = B.x0 + 20 + rnd() * (B.x1 - B.x0 - 40),
      z = B.z0 + 40 + rnd() * (B.z1 - B.z0 - 60),
      y = heightAt(x, z) + 10 + rnd() * 25,
      ph = rnd() * 6.28,
      s = 0.8 + rnd() * 1.2;
    f.scale.setScalar(s);
    scene.add(f);
    ticks.push(t => {
      f.position.set(x + Math.sin(t * 0.05 + ph) * 8, y + Math.sin(t * 0.4 + ph) * 1.5, z + Math.cos(t * 0.05 + ph) * 8);
      f.rotation.y = t * 0.05 + ph;
    });
  }
}
