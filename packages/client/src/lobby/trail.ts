// The off-road trail: a dirt loop through the south meadow, out past the apartment blocks, with jumps, and a dirt
// track down to it from Fairway Loop. Drive any car (or the golf cart) through the start gate and the lap clock runs:
// six gates round the loop, in order, and back through the start. Your best lap is kept in this browser, and a ghost
// drives it beside you. The jumps are real ground: walkers climb them (world.ts groundY) and cars fly off them (a
// physics mesh, lobby.ts). Nothing here is sent to other players.
// (world.ts imports this file: nothing at the top level may read a value from world.ts.)
import * as THREE from 'three';

/** The loop's centre line (world x, z), driven in this order. */
const PTS: [number, number][] = [
  // (kept south of the apartment blocks, and inside 225 m of the plaza: the city's towers begin beyond that)
  [-6, 122],
  [60, 118],
  [115, 124],
  [150, 146],
  [138, 174],
  [95, 190],
  [50, 176],
  [10, 198],
  [-50, 196],
  [-105, 186],
  [-145, 162],
  [-158, 130],
  [-120, 118],
  [-60, 116],
];
export const TRAIL_W = 9;
/** The dirt track down from Fairway Loop to the start (x, z0 → z1), between the apartment blocks. */
export const SPUR = { x: -3, w: 6, z0: 44, z1: 122 };

// the centre line, sampled every metre along a smooth curve through the points
const SAMP: { x: number; z: number; tx: number; tz: number; s: number }[] = (() => {
  const curve = new THREE.CatmullRomCurve3(
      PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    ),
    L = curve.getLength(),
    n = Math.round(L),
    out: { x: number; z: number; tx: number; tz: number; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = curve.getPointAt(i / n),
      t = curve.getTangentAt(i / n);
    out.push({ x: p.x, z: p.z, tx: t.x, tz: t.z, s: i });
  }
  return out;
})();
export const TRAIL_LEN = SAMP.length;
/** Nearest point of the loop: how far off its centre line, and how far along it. */
export function trailAt(x: number, z: number) {
  let bd = 1e9,
    bi = 0;
  // coarse then fine
  for (let i = 0; i < SAMP.length; i += 6) {
    const d = (SAMP[i].x - x) ** 2 + (SAMP[i].z - z) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  for (let k = -6; k <= 6; k++) {
    const i = (bi + k + SAMP.length) % SAMP.length,
      d = (SAMP[i].x - x) ** 2 + (SAMP[i].z - z) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return { d: Math.sqrt(bd), s: bi };
}
const inBox = (x: number, z: number) => z > SPUR.z0 - 2 && z < 215 && x > -205 && x < 205;
/** On the dirt (the loop or the track down to it), with `margin` metres to spare. */
export function onTrail(x: number, z: number, margin = 0) {
  if (!inBox(x, z)) return false;
  if (Math.abs(x - SPUR.x) < SPUR.w / 2 + margin && z > SPUR.z0 && z < SPUR.z1) return true;
  if (z < 104 - margin) return false;
  return trailAt(x, z).d < TRAIL_W / 2 + margin;
}

/** The jumps: where along the loop (metres), and their shape: a kicker (up and off a lip) or a tabletop (up, a flat
 *  top, and down again). Heights in metres. */
const JUMPS: { s: number; kind: 'kick' | 'table'; h: number }[] = [
  { s: 0.07, kind: 'kick', h: 1.3 },
  { s: 0.24, kind: 'table', h: 1.1 },
  { s: 0.47, kind: 'kick', h: 1.6 },
  { s: 0.66, kind: 'table', h: 1.3 },
  { s: 0.84, kind: 'kick', h: 1.2 },
].map(j => ({ ...j, kind: j.kind as 'kick' | 'table', s: Math.round(j.s * TRAIL_LEN) }));
const JW = 6.5; // jump width
/** Height of the jump profile at u metres along it (0 at its foot). */
function profile(kind: 'kick' | 'table', h: number, u: number) {
  if (kind === 'kick') return u >= 0 && u <= 7 ? (h * u) / 7 : 0;
  if (u < 0 || u > 17) return 0;
  return u < 6 ? (h * u) / 6 : u < 11 ? h : (h * (17 - u)) / 6;
}
const JLEN = (kind: 'kick' | 'table') => (kind === 'kick' ? 7 : 17);
/** The ground's extra height from the jumps at (x, z) (0 off them). */
export function trailY(x: number, z: number) {
  if (z < 104 || !inBox(x, z)) return 0;
  for (const j of JUMPS) {
    const c = SAMP[j.s],
      dx = x - c.x,
      dz = z - c.z,
      u = dx * c.tx + dz * c.tz,
      v = dx * -c.tz + dz * c.tx;
    if (Math.abs(v) > JW / 2 || u < 0 || u > JLEN(j.kind)) continue;
    return profile(j.kind, j.h, u);
  }
  return 0;
}
/** The jumps as one triangle mesh, for car physics. */
export function trailJumpMesh() {
  const v: number[] = [],
    idx: number[] = [];
  for (const j of JUMPS) {
    const c = SAMP[j.s],
      L = JLEN(j.kind),
      steps = Math.round(L * 2),
      base = v.length / 3;
    for (let k = 0; k <= steps; k++) {
      const u = (k / steps) * L,
        y = profile(j.kind, j.h, Math.min(u, L - 0.001));
      for (const side of [-1, 1]) {
        const vv = (side * JW) / 2;
        v.push(c.x + c.tx * u - c.tz * vv, y, c.z + c.tz * u + c.tx * vv);
      }
      if (k < steps) {
        const o = base + k * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); // (wound to face up)
      }
    }
    // the kicker's lip: a wall straight down from its top edge
    if (j.kind === 'kick') {
      const o = base + steps * 2,
        lx = c.x + c.tx * L,
        lz = c.z + c.tz * L,
        b2 = v.length / 3;
      for (const side of [-1, 1]) v.push(lx - (c.tz * side * JW) / 2, 0, lz + (c.tx * side * JW) / 2);
      idx.push(o, o + 1, b2, o + 1, b2 + 1, b2);
    }
  }
  return { verts: new Float32Array(v), indices: new Uint32Array(idx) };
}

/** The six gates (metres along the loop): the first is the start and finish. */
export const GATES = [0, 1, 2, 3, 4, 5].map(i => Math.round((i / 6) * TRAIL_LEN + 4) % TRAIL_LEN);
export const gateAt = (i: number) => SAMP[GATES[i]];

/** Draw the trail: the dirt (loop and track), the jumps with timber edges, the gates and the sign at the top. */
export function buildTrail(scene: THREE.Scene, dirt: THREE.Material) {
  const G = new THREE.Group();
  G.name = 'trail';
  // the loop as a ribbon, with frayed edges (two strips: a full-colour middle and a darker, see-through edge)
  const ribbon = (half: number, y: number, mat: THREE.Material) => {
    const v: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    SAMP.forEach((p, i) => {
      for (const side of [-1, 1]) {
        v.push(p.x - p.tz * side * half, y, p.z + p.tx * side * half);
        uv.push((side + 1) * half * 0.15, i * 0.15);
      }
      const o = i * 2,
        q = ((i + 1) % SAMP.length) * 2;
      idx.push(o, o + 1, q, o + 1, q + 1, q); // (wound to face up)
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    return mesh;
  };
  G.add(ribbon(TRAIL_W / 2, 0.035, dirt));
  G.add(
    ribbon(
      TRAIL_W / 2 + 1.2,
      0.02,
      new THREE.MeshStandardMaterial({ color: '#7a6448', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }),
    ),
  );
  const spur = new THREE.Mesh(new THREE.PlaneGeometry(SPUR.w, SPUR.z1 - SPUR.z0).rotateX(-Math.PI / 2), dirt);
  spur.position.set(SPUR.x, 0.035, (SPUR.z0 + SPUR.z1) / 2);
  spur.receiveShadow = true;
  G.add(spur);
  // jumps: the same mesh the cars drive, with timber boards down each side
  const jm = trailJumpMesh(),
    jg = new THREE.BufferGeometry();
  jg.setAttribute('position', new THREE.BufferAttribute(jm.verts, 3));
  jg.setIndex(new THREE.BufferAttribute(jm.indices, 1));
  jg.computeVertexNormals();
  const jumps = new THREE.Mesh(jg, new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 1, side: THREE.DoubleSide }));
  jumps.castShadow = jumps.receiveShadow = true;
  G.add(jumps);
  const timber = new THREE.MeshStandardMaterial({ color: '#6a4a2e', roughness: 0.9 });
  for (const j of JUMPS) {
    const c = SAMP[j.s],
      L = JLEN(j.kind);
    for (const side of [-1, 1])
      for (let u = 0.5; u < L; u += 1) {
        const y = profile(j.kind, j.h, u),
          b = new THREE.Mesh(new THREE.BoxGeometry(0.12, Math.max(0.1, y), 1), timber);
        b.position.set(c.x + c.tx * u - (c.tz * side * (JW + 0.12)) / 2, Math.max(0.1, y) / 2, c.z + c.tz * u + (c.tx * side * (JW + 0.12)) / 2);
        b.rotation.y = Math.atan2(c.tx, c.tz);
        G.add(b);
      }
  }
  // gates: two posts and a banner across the trail; the start has a chequered one
  const post = new THREE.MeshStandardMaterial({ color: '#5a3e28', roughness: 0.9 }),
    flagTex = (() => {
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 32;
      const x = cv.getContext('2d')!;
      for (let i = 0; i < 32; i++)
        for (let k = 0; k < 4; k++) {
          x.fillStyle = (i + k) % 2 ? '#111' : '#f4f1ea';
          x.fillRect(i * 8, k * 8, 8, 8);
        }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
  GATES.forEach((gs, i) => {
    const c = SAMP[gs],
      half = TRAIL_W / 2 + 0.6;
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 4.4, 8), post);
      p.position.set(c.x - c.tz * side * half, 2.2, c.z + c.tx * side * half);
      p.castShadow = true;
      G.add(p);
    }
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2, i ? 0.5 : 0.9),
      i
        ? new THREE.MeshStandardMaterial({ color: ['#c8452f', '#e9b23a', '#2f7a4b', '#3f6fa8', '#7a5bd0', '#c8452f'][i], side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }),
    );
    banner.position.set(c.x, 4.0, c.z);
    banner.rotation.y = Math.atan2(-c.tz, c.tx) + Math.PI / 2;
    G.add(banner);
  });
  // a sign at the top of the dirt track, where it leaves Fairway Loop
  {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 160;
    const x = cv.getContext('2d')!;
    x.fillStyle = '#6a4a2e';
    x.fillRect(0, 0, 512, 160);
    x.strokeStyle = '#f1e6c8';
    x.lineWidth = 6;
    x.strokeRect(8, 8, 496, 144);
    x.fillStyle = '#f1e6c8';
    x.font = 'bold 64px "Barlow Condensed", Impact, sans-serif';
    x.textAlign = 'center';
    x.fillText('OFF-ROAD TRAIL', 256, 82);
    x.font = 'bold 36px "Barlow Condensed", Impact, sans-serif';
    x.fillText('jumps · lap times  ↓', 256, 130);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }));
    board.position.set(SPUR.x + SPUR.w / 2 + 1.6, 2.1, SPUR.z0 + 3);
    board.rotation.y = Math.PI; // (read from town, looking south)
    G.add(board);
    for (const dx of [-1.1, 1.1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6), post);
      p.position.set(SPUR.x + SPUR.w / 2 + 1.6 + dx, 1.25, SPUR.z0 + 3.02);
      G.add(p);
    }
  }
  scene.add(G);
  return G;
}

/** The lap clock: gates in order, then the start again. Driving only. */
export function createTrailTimer() {
  let next = 0,
    started = 0,
    best = 0,
    last = 0,
    msg = '',
    msgT = 0;
  const path: number[] = []; // this lap: x, z, yaw every 0.1 s
  let bestPath: number[] = [],
    recT = 0;
  try {
    best = +(localStorage.getItem('gh.trailBest') || 0) || 0;
    bestPath = JSON.parse(localStorage.getItem('gh.trailGhost') || '[]');
  } catch {}
  const near = (i: number, x: number, z: number) => {
    const g = gateAt(i);
    return Math.hypot(g.x - x, g.z - z) < TRAIL_W / 2 + 3;
  };
  return {
    /** call every frame while driving; returns what to show (or '' off the trail and not timing) */
    update(dt: number, now: number, x: number, z: number, yaw: number) {
      if (started) {
        recT += dt;
        if (recT >= 0.1) {
          recT = 0;
          path.push(+x.toFixed(1), +z.toFixed(1), +yaw.toFixed(2));
        }
      }
      if (near(next, x, z)) {
        if (next === 0) {
          if (started) {
            last = now - started;
            const isBest = !best || last < best;
            msg = isBest ? `LAP ${fmt(last)} · NEW BEST!` : `LAP ${fmt(last)} · best ${fmt(best)}`;
            msgT = 4;
            if (isBest) {
              best = last;
              bestPath = path.slice();
              try {
                localStorage.setItem('gh.trailBest', String(best));
                localStorage.setItem('gh.trailGhost', JSON.stringify(bestPath));
              } catch {}
            }
          }
          started = now;
          path.length = 0;
          recT = 0;
        }
        next = (next + 1) % GATES.length;
      }
      if ((msgT -= dt) > 0) return msg;
      if (!started) return onTrail(x, z, 6) ? 'OFF-ROAD TRAIL · drive through the chequered gate to start the clock' : '';
      if (!onTrail(x, z, 30) && now - started > 5) {
        started = 0; // wandered off: the lap is abandoned
        next = 0;
        return '';
      }
      return `LAP ${fmt(now - started)} · GATE ${next === 0 ? 'FINISH' : next + ' of ' + (GATES.length - 1)}${best ? ` · BEST ${fmt(best)}` : ''}`;
    },
    /** where the best lap's ghost is, t seconds into the current lap (null if no ghost or not timing) */
    ghost(now: number) {
      if (!started || bestPath.length < 6) return null;
      const f = (now - started) * 10,
        i = Math.floor(f),
        k = f - i;
      if ((i + 1) * 3 + 2 >= bestPath.length) return null;
      const a = i * 3,
        b = a + 3;
      return { x: bestPath[a] + (bestPath[b] - bestPath[a]) * k, z: bestPath[a + 1] + (bestPath[b + 1] - bestPath[a + 1]) * k, yaw: bestPath[a + 2] };
    },
    reset() {
      started = 0;
      next = 0;
    },
  };
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
