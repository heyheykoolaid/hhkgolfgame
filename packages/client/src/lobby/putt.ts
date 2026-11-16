// Mini putt (Fun Land): nine holes on the kit's tiles, played with the course's own putting: W/S set the power, A/D aim,
// then two presses on the swing meter (one to start, one as the marker crosses the zone). It is your own golf ball at
// its real size, rolling as a physics ball on the tiles' real shapes (a Rapier triangle mesh), into a real-size cup.
// One player's own round; it isn't synced yet.
import * as THREE from 'three';
import { playSample } from '../audio/samples';
import { rapier, grp, type PhysWorld } from '../physics/ragdoll';
import { PUTT_HOLES, puttFloor } from './funland';
import { CUP_HOLE_R } from '../world/nature';
import { ballMaterial, DEFAULT_BALL } from '../avatar/balls';
import { wakeAudio, sfxOut } from '../audio/ctx';

const G_RELIEF = 0x0010, // the smoothed humps and hills: the ball rolls on them, the aim ray ignores them
  TILE = 2.4, // metres per course tile (PUTT.s in funland.ts)
  LANE_HW = 0.95, // half the felt's width
  G_PUTT = 0x0008, // the course and the ball only touch each other (carts and ragdolls pass through)
  BALL_R = 0.0214, // a real golf ball, as on the course
  FELT_Y = 0.152, // the felt's height on the tiles
  MAX_STROKES = 6,
  PAR = 2,
  DECEL = 0.68, // how hard the felt slows a rolling ball, m/s² (steady, like a real green)
  MAX_ROLL = 11.5, // metres a full-power putt runs on the flat (the longest hole is about 10 m of lane)
  SWEEP = 1.25, // seconds for the power bar to run from empty to full
  FT = 3.28084,
  PUTTER = { putter: true };

export interface PuttHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pw(): PhysWorld | null;
  /** the merged tile meshes, once the kit has loaded */
  course(): THREE.Mesh[] | null;
  /** the player's chosen ball skin */
  ballSkin(): string | undefined;
  P: { x: number; z: number; yaw: number; vx: number; vz: number; mode: string };
  toast(html: string, ms?: number): void;
}

export function createPutt(host: PuttHost) {
  const P = host.P;
  let built = false,
    body: import('@dimforge/rapier3d-compat').RigidBody | null = null;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), ballMaterial(DEFAULT_BALL));
  ball.castShadow = true;
  ball.visible = false;
  host.scene.add(ball);
  // the aim line: where the ball will go, bouncing off the boards (up to four bounces), as long as the putt will run
  const AIM_PTS = 6,
    AIM_SEG = 56,
    aimGeo = new THREE.BufferGeometry(),
    aimPts = new Float32Array(AIM_PTS * 3);
  aimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((AIM_SEG - 1) * 4 * 3), 3));
  {
    const ix: number[] = [];
    for (let i = 0; i < AIM_SEG - 1; i++) ix.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
    aimGeo.setIndex(ix);
  }
  const aimLine = new THREE.Mesh(
    aimGeo,
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }),
  );
  aimLine.renderOrder = 4;
  aimLine.frustumCulled = false;
  aimLine.visible = false;
  host.scene.add(aimLine);
  // Humps and hills. The kit's raised tiles meet the flat felt at a crease, which stops a real-size ball dead. So for
  // each raised tile the felt's height is sampled onto a fine grid, the creases are filled in with a smooth fillet, and
  // that grid becomes both what the ball rolls on and the felt you see (drawn just over the kit's).
  const RELIEF: { x: number; z: number; alongX: boolean; h: Float32Array }[] = [],
    NL = 48, // grid cells across the lane…
    NT = 60, // …and along it (4 cm each)
    DL = (LANE_HW * 2) / NL,
    DT = TILE / NT;
  /** Height of the felt at a point: the flat level, or the smoothed hump on a raised tile. */
  function feltH(x: number, z: number) {
    for (const c of RELIEF) {
      const dx = x - c.x,
        dz = z - c.z;
      if (Math.abs(dx) > TILE / 2 || Math.abs(dz) > TILE / 2) continue;
      const l = Math.min(NL - 1e-4, Math.max(0, ((c.alongX ? dz : dx) + LANE_HW) / DL)),
        t = Math.min(NT - 1e-4, Math.max(0, ((c.alongX ? dx : dz) + TILE / 2) / DT)),
        li = Math.floor(l),
        ti = Math.floor(t),
        fl = l - li,
        ft = t - ti,
        H = c.h,
        w = NL + 1;
      return (
        (H[ti * w + li] * (1 - fl) + H[ti * w + li + 1] * fl) * (1 - ft) + (H[(ti + 1) * w + li] * (1 - fl) + H[(ti + 1) * w + li + 1] * fl) * ft
      );
    }
    return FELT_Y;
  }
  function aimPath(x: number, z: number, yaw: number, len: number) {
    const R = rapier(),
      pw = host.pw(),
      a = { setXYZ: (i: number, px: number, py: number, pz: number) => aimPts.set([px, py, pz], i * 3) },
      y = FELT_Y + BALL_R;
    let dx = Math.sin(yaw),
      dz = Math.cos(yaw),
      n = 0;
    a.setXYZ(n++, x, y, z);
    while (n < AIM_PTS && len > 0.05 && R && pw) {
      const hit: any = pw.world.castRayAndGetNormal(
        new R.Ray({ x, y, z }, { x: dx, y: 0, z: dz }),
        len,
        true,
        undefined,
        grp(G_PUTT, G_PUTT),
        undefined,
        body || undefined,
      ); // not the ball itself
      const t = hit ? (hit.timeOfImpact ?? hit.toi) : len,
        run = Math.max(0, Math.min(len, t) - BALL_R);
      x += dx * run;
      z += dz * run;
      a.setXYZ(n++, x, y, z);
      if (!hit || t >= len || Math.abs(hit.normal.y) > 0.5) break; // nothing in the way, or a bump rather than a board
      const nx = hit.normal.x,
        nz = hit.normal.z,
        nl = Math.hypot(nx, nz) || 1,
        d = (dx * nx + dz * nz) / nl;
      dx -= (2 * d * nx) / nl;
      dz -= (2 * d * nz) / nl;
      len = (len - run) * 0.7; // a board takes some of the pace
    }
    for (let i = n; i < AIM_PTS; i++) a.setXYZ(i, x, y, z);
    // the path as a thin strip lying on the felt, cut into short pieces so it follows humps and hills
    const P = aimGeo.attributes.position as THREE.BufferAttribute,
      W = 0.014,
      legs: number[] = [];
    let total = 0;
    for (let i = 0; i < AIM_PTS - 1; i++) {
      const l = Math.hypot(aimPts[i * 3 + 3] - aimPts[i * 3], aimPts[i * 3 + 5] - aimPts[i * 3 + 2]);
      legs.push(l);
      total += l;
    }
    const at = (d: number) => {
      let i = 0;
      while (i < legs.length - 1 && d > legs[i]) d -= legs[i++];
      const k = legs[i] > 1e-6 ? Math.min(1, d / legs[i]) : 0,
        ax = aimPts[i * 3],
        az = aimPts[i * 3 + 2],
        bx = aimPts[i * 3 + 3],
        bz = aimPts[i * 3 + 5],
        l = legs[i] || 1;
      return [ax + (bx - ax) * k, az + (bz - az) * k, (-(bz - az) / l) * W, ((bx - ax) / l) * W];
    };
    for (let i = 0; i < AIM_SEG - 1; i++) {
      const [ax, az, ox, oz] = at((total * i) / (AIM_SEG - 1)),
        [bx, bz] = at((total * (i + 1)) / (AIM_SEG - 1)),
        ya = feltH(ax, az) + 0.012,
        yb = feltH(bx, bz) + 0.012;
      P.setXYZ(i * 4, ax + ox, ya, az + oz);
      P.setXYZ(i * 4 + 1, ax - ox, ya, az - oz);
      P.setXYZ(i * 4 + 2, bx + ox, yb, bz + oz);
      P.setXYZ(i * 4 + 3, bx - ox, yb, bz - oz);
    }
    P.needsUpdate = true;
  }
  // a real-size cup at the end of every hole: the dark mouth, a pale rim, and a thin pin with a small flag
  const cups = new THREE.Group();
  {
    const mouth = new THREE.MeshBasicMaterial({ color: '#15110c', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      rim = new THREE.MeshBasicMaterial({ color: '#e8e4d8', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      pinM = new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.5 }),
      flagM = new THREE.MeshStandardMaterial({ color: '#e2574c', side: THREE.DoubleSide, roughness: 0.8 });
    for (const h of PUTT_HOLES) {
      const g = new THREE.Group();
      g.position.set(h.cup[0], FELT_Y + 0.002, h.cup[1]);
      g.add(
        new THREE.Mesh(new THREE.CircleGeometry(CUP_HOLE_R, 28).rotateX(-Math.PI / 2), mouth),
        new THREE.Mesh(new THREE.RingGeometry(CUP_HOLE_R, CUP_HOLE_R + 0.006, 28).rotateX(-Math.PI / 2), rim),
      );
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.1, 8), pinM);
      pin.position.y = 0.55;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), flagM);
      flag.position.set(0.135, 1.0, 0);
      g.add(pin, flag);
      cups.add(g);
    }
  }
  host.scene.add(cups);
  const hud = document.createElement('div');
  hud.style.cssText =
    'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:12;display:none;padding:9px 18px;border-radius:14px;background:rgba(22,16,10,.84);border:1px solid rgba(255,232,190,.2);color:#f6ecd8;font:800 19px "Barlow Condensed",Inter,sans-serif;letter-spacing:.04em;text-align:center;pointer-events:none;min-width:250px';
  document.body.appendChild(hud);
  // the power bar: hold to fill, let go to putt (the way every mini putt game does it)
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:12;display:none;width:300px;height:26px;border-radius:13px;background:rgba(22,16,10,.84);border:2px solid rgba(255,232,190,.55);overflow:hidden;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.4)';
  bar.innerHTML =
    '<div style="position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#7ad06a,#ffd94a 55%,#ff7a3a 85%,#e2382c)"></div><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:800 14px \"Barlow Condensed\",Inter,sans-serif;letter-spacing:.05em;text-shadow:0 1px 2px #000"></div>';
  document.body.appendChild(bar);
  const barFill = bar.children[0] as HTMLElement,
    barText = bar.children[1] as HTMLElement;

  const S = {
    on: false,
    hole: 0,
    strokes: 0,
    card: [] as number[],
    phase: 'drop' as 'drop' | 'aim' | 'power' | 'roll' | 'sunk',
    yaw: 0,
    target: 0.35, // power preset, 0..1 of a full putt
    t: 0,
    still: 0,
    said: '',
    saidT: 0,
    last: new THREE.Vector3(),
    cam: new THREE.Vector3(),
    look: new THREE.Vector3(),
  };
  const held = new Set<string>();
  let swingS = 0,
    hitT = 9;
  const lastV = new THREE.Vector3();
  /** A short knock: the putter on the ball, the ball on a board, the ball rattling into the cup. */
  function knock(freq: number, vol: number, len = 0.07) {
    try {
      const c = wakeAudio();
      if (!c) return;
      const o = c.createOscillator(),
        g = c.createGain(),
        t = c.currentTime;
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + len);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + len);
      o.connect(g).connect(sfxOut(c));
      o.start(t);
      o.stop(t + len + 0.02);
    } catch {}
  }

  function build() {
    const R = rapier(),
      pw = host.pw(),
      meshes = host.course();
    if (!R || !pw || !meshes?.length) return false;
    if (!built) {
      // Every tile is its own closed box, so where two meet there are hidden side faces just under the felt. A small
      // ball trips on their top edges, so the collision mesh leaves out everything that lies at or below the felt and
      // doesn't face up (the tiles' skirts and undersides). What's left joins into one smooth floor, and
      // FIX_INTERNAL_EDGES then welds the seams between tiles.
      const keep: number[] = [],
        cells = PUTT_HOLES.flatMap(h => h.cells)
          .filter(c => /bump|hill/i.test(c.name))
          .map(c => ({ x: c.x, z: c.z, alongX: Math.abs(Math.sin(c.rot)) > 0.5, tris: [] as number[], mesh: null as THREE.Mesh | null, uvk: 1 }));
      for (const m of meshes) {
        const a = m.geometry.attributes.position.array as Float32Array,
          uv = m.geometry.attributes.uv?.array as Float32Array | undefined;
        for (let i = 0; i < a.length; i += 9) {
          // on a raised tile, the felt's own triangles (everything inside the lane that isn't a side board) are taken
          // out of the collision mesh and kept for sampling instead
          const cx = (a[i] + a[i + 3] + a[i + 6]) / 3,
            cz = (a[i + 2] + a[i + 5] + a[i + 8]) / 3,
            cell = cells.find(c => Math.abs(cx - c.x) < TILE / 2 && Math.abs(cz - c.z) < TILE / 2);
          if (cell) {
            // a side board faces across the lane; everything else inside the lane that rises above the flat is felt
            const ex = a[i + 3] - a[i],
              ey = a[i + 4] - a[i + 1],
              ez = a[i + 5] - a[i + 2],
              fx = a[i + 6] - a[i],
              fy = a[i + 7] - a[i + 1],
              fz = a[i + 8] - a[i + 2],
              nx = ey * fz - ez * fy,
              nz = ex * fy - ey * fx,
              nn = Math.hypot(nx, ez * fx - ex * fz, nz) || 1,
              across = Math.abs(cell.alongX ? nz : nx) / nn,
              lat = Math.abs(cell.alongX ? cz - cell.z : cx - cell.x);
            if (lat < LANE_HW - 0.02 && across < 0.7 && Math.max(a[i + 1], a[i + 4], a[i + 7]) > FELT_Y + 0.004) {
              for (let k = 0; k < 9; k++) cell.tris.push(a[i + k]);
              if (!cell.mesh && uv) {
                cell.mesh = m;
                const j = (i / 3) * 2,
                  dp = Math.hypot(a[i + 3] - a[i], a[i + 4] - a[i + 1], a[i + 5] - a[i + 2]),
                  du = Math.hypot(uv[j + 2] - uv[j], uv[j + 3] - uv[j + 1]);
                if (dp > 0.01 && du > 0) cell.uvk = du / dp;
              }
              continue;
            }
          }
          const top = Math.max(a[i + 1], a[i + 4], a[i + 7]),
            ux = a[i + 3] - a[i],
            uy = a[i + 4] - a[i + 1],
            uz = a[i + 5] - a[i + 2],
            vx = a[i + 6] - a[i],
            vy = a[i + 7] - a[i + 1],
            vz = a[i + 8] - a[i + 2],
            ny = uz * vx - ux * vz,
            nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1;
          const low = Math.min(a[i + 1], a[i + 4], a[i + 7]);
          if (top <= FELT_Y + 0.003 && ny / nl < 0.5) continue;
          if (top <= FELT_Y + 0.004 && low >= FELT_Y - 0.004) continue; // flat felt: the ball rolls on one true plane instead (below)
          for (let k = 0; k < 9; k++) keep.push(a[i + k]);
        }
      }
      for (const c of cells) {
        // sample the felt's height on the grid: the highest upward-facing triangle over each point
        const w = NL + 1,
          H = new Float32Array(w * (NT + 1)).fill(FELT_Y),
          T = c.tris;
        for (let i = 0; i < T.length; i += 9) {
          const ax = T[i],
            ay = T[i + 1],
            az = T[i + 2],
            bx = T[i + 3],
            by = T[i + 4],
            bz = T[i + 5],
            qx = T[i + 6],
            qy = T[i + 7],
            qz = T[i + 8],
            det = (bz - qz) * (ax - qx) + (qx - bx) * (az - qz);
          if (Math.abs(det) < 1e-9) continue; // a vertical face: nothing to stand on
          const loc = (x: number, z: number) => [(c.alongX ? z - c.z : x - c.x) + LANE_HW, (c.alongX ? x - c.x : z - c.z) + TILE / 2],
            A = loc(ax, az),
            B = loc(bx, bz),
            Q = loc(qx, qz),
            l0 = Math.max(0, Math.floor(Math.min(A[0], B[0], Q[0]) / DL)),
            l1 = Math.min(NL, Math.ceil(Math.max(A[0], B[0], Q[0]) / DL)),
            t0 = Math.max(0, Math.floor(Math.min(A[1], B[1], Q[1]) / DT)),
            t1 = Math.min(NT, Math.ceil(Math.max(A[1], B[1], Q[1]) / DT));
          for (let ti = t0; ti <= t1; ti++)
            for (let li = l0; li <= l1; li++) {
              const lx = li * DL - LANE_HW,
                tz = ti * DT - TILE / 2,
                x = c.x + (c.alongX ? tz : lx),
                z = c.z + (c.alongX ? lx : tz),
                u = ((bz - qz) * (x - qx) + (qx - bx) * (z - qz)) / det,
                v2 = ((qz - az) * (x - qx) + (ax - qx) * (z - qz)) / det,
                w2 = 1 - u - v2;
              if (u < -0.002 || v2 < -0.002 || w2 < -0.002) continue;
              const y = u * ay + v2 * by + w2 * qy;
              if (y > H[ti * w + li] && y < FELT_Y + 1) H[ti * w + li] = y;
            }
        }
        // fill the creases: each pass raises a point to the average of its neighbours where that is higher, so hollows
        // round off and nothing ever drops below the kit's own surface
        const B2 = new Float32Array(H.length);
        for (let pass = 0; pass < 7; pass++) {
          for (let ti = 0; ti <= NT; ti++)
            for (let li = 0; li <= NL; li++) {
              let sum = 0;
              for (let dt2 = -1; dt2 <= 1; dt2++)
                for (let dl = -1; dl <= 1; dl++) sum += H[Math.min(NT, Math.max(0, ti + dt2)) * w + Math.min(NL, Math.max(0, li + dl))];
              B2[ti * w + li] = Math.max(H[ti * w + li], sum / 9);
            }
          H.set(B2);
        }
        RELIEF.push({ x: c.x, z: c.z, alongX: c.alongX, h: H });
        const pos = new Float32Array(w * (NT + 1) * 3),
          uvs = new Float32Array(w * (NT + 1) * 2),
          idx = new Uint32Array(NL * NT * 6);
        for (let ti = 0; ti <= NT; ti++)
          for (let li = 0; li <= NL; li++) {
            const lx = li * DL - LANE_HW,
              tz = ti * DT - TILE / 2,
              k = ti * w + li,
              x = c.x + (c.alongX ? tz : lx),
              z = c.z + (c.alongX ? lx : tz);
            pos.set([x, H[k], z], k * 3);
            uvs.set([x * c.uvk, z * c.uvk], k * 2);
          }
        let n = 0;
        for (let ti = 0; ti < NT; ti++)
          for (let li = 0; li < NL; li++) {
            const a0 = ti * w + li,
              b0 = a0 + 1,
              c0 = a0 + w,
              d0 = c0 + 1;
            // wound so the faces point up whichever way the lane runs
            if (c.alongX) idx.set([a0, b0, c0, b0, d0, c0], n);
            else idx.set([a0, c0, b0, b0, c0, d0], n);
            n += 6;
          }
        pw.world.createCollider(
          R.ColliderDesc.trimesh(pos, idx, R.TriMeshFlags.FIX_INTERNAL_EDGES)
            .setCollisionGroups(grp(G_RELIEF, G_PUTT))
            .setFriction(0)
            .setRestitution(0)
            .setRestitutionCombineRule(R.CoefficientCombineRule.Min),
        );
        if (c.mesh) {
          // the same surface, drawn a hair above the kit's felt so the crease is gone to the eye as well
          const g = new THREE.BufferGeometry(),
            up = pos.slice();
          for (let k = 1; k < up.length; k += 3) up[k] += 0.004;
          g.setAttribute('position', new THREE.BufferAttribute(up, 3));
          g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
          g.setIndex(new THREE.BufferAttribute(idx, 1));
          g.computeVertexNormals();
          const felt = new THREE.Mesh(g, c.mesh.material);
          felt.receiveShadow = true;
          felt.name = 'puttRelief';
          host.scene.add(felt);
        }
      }
      const v = new Float32Array(keep),
        ix = new Uint32Array(keep.length / 3);
      for (let i = 0; i < ix.length; i++) ix[i] = i;
      // The flat felt is one big slab, so a real-size ball rolls true (on the tiles' own triangles it caught every
      // edge and hopped). Walls, bumps, hills and tunnels are still the tiles' real shapes.
      pw.world.createCollider(
        R.ColliderDesc.cuboid(40, 0.5, 40)
          .setTranslation(89, FELT_Y - 0.5, -32)
          .setCollisionGroups(grp(G_PUTT, G_PUTT))
          .setFriction(0.4)
          .setRestitution(0.1),
      );
      pw.world.createCollider(
        R.ColliderDesc.trimesh(v, ix, R.TriMeshFlags.FIX_INTERNAL_EDGES).setCollisionGroups(grp(G_PUTT, G_PUTT)).setFriction(0.4).setRestitution(0.6),
      );
      built = true;
    }
    if (!body) {
      // (the ball itself is frictionless: contact friction braked it four times too hard and can't be tuned like this can)
      // the felt's drag, applied every physics step: a steady slowing while the ball is on the ground, and the spin kept
      // matched to the roll so the floor's friction never fights it
      pw.pre.add(dt => {
        if (!S.on || !body || S.phase !== 'roll') return;
        const v = body.linvel(),
          p = body.translation(),
          sp = Math.hypot(v.x, v.z);
        const fh = feltH(p.x, p.z);
        if (p.y > fh + BALL_R + 0.02 || sp < 1e-4) return; // in the air (off a bump)
        const k = Math.max(0, sp - DECEL * dt) / sp;
        // on a slope the climb or drop slows with the roll (gravity does the rest: up costs pace, down gives it back)
        body.setLinvel({ x: v.x * k, y: fh > FELT_Y + 0.002 ? v.y * k : v.y, z: v.z * k }, true);
        body.setAngvel({ x: (v.z * k) / BALL_R, y: 0, z: (-v.x * k) / BALL_R }, true);
      });
      body = pw.world.createRigidBody(R.RigidBodyDesc.dynamic().setLinearDamping(0).setAngularDamping(0).setCcdEnabled(true).setCanSleep(false));
      pw.world.createCollider(
        R.ColliderDesc.ball(BALL_R)
          .setDensity(1100)
          .setFriction(0)
          .setFrictionCombineRule(R.CoefficientCombineRule.Min)
          .setRestitution(0.55)
          .setCollisionGroups(grp(G_PUTT, G_PUTT | G_RELIEF)),
        body,
      );
    }
    return true;
  }
  const H = () => PUTT_HOLES[S.hole];
  function teeUp() {
    const h = H(),
      a = h.cells[0],
      b = h.cells[1];
    S.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    S.strokes = 0;
    place(a.x, a.z);
  }
  let held0: { x: number; y: number; z: number } | null = null;
  function place(x: number, z: number) {
    body!.setTranslation({ x, y: feltH(x, z) + BALL_R + 0.05, z }, true);
    body!.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body!.setAngvel({ x: 0, y: 0, z: 0 }, true);
    S.phase = 'drop';
    S.t = 0;
    S.still = 0;
  }
  function start() {
    if (!build()) {
      host.toast('The course is still being set up. One moment…');
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
    ball.material = ballMaterial(host.ballSkin() || DEFAULT_BALL);
    S.on = true;
    S.hole = 0;
    S.card = [];
    P.mode = 'putt';
    P.vx = P.vz = 0;
    held.clear();
    ball.visible = true;
    hud.style.display = 'block';
    teeUp();
    S.cam.copy(host.camera.position);
    S.look.set(H().tee[0], 0.2, H().tee[1]);
    addEventListener('keydown', onDown, true);
    addEventListener('keyup', onUp, true);
    addEventListener('pointerdown', onClick, true);
    addEventListener('pointerup', onRelease, true);
    addEventListener('mousemove', onMove, true);
    addEventListener('contextmenu', noMenu, true);
  }
  function stop(say = '') {
    S.on = false;
    ball.visible = aimLine.visible = false;
    hud.style.display = 'none';
    bar.style.display = 'none';
    body?.setTranslation({ x: 0, y: -50, z: 0 }, false);
    body?.setLinvel({ x: 0, y: 0, z: 0 }, false);
    if (P.mode === 'putt') P.mode = 'walk';
    removeEventListener('keydown', onDown, true);
    removeEventListener('keyup', onUp, true);
    removeEventListener('pointerdown', onClick, true);
    removeEventListener('pointerup', onRelease, true);
    removeEventListener('mousemove', onMove, true);
    removeEventListener('contextmenu', noMenu, true);
    if (say) host.toast(say, 7000);
  }
  function holeDone(n: number) {
    S.card.push(n);
    if (S.hole < PUTT_HOLES.length - 1) {
      S.hole++;
      teeUp();
      return;
    }
    const total = S.card.reduce((a, b) => a + b, 0),
      par = PAR * PUTT_HOLES.length;
    let best = 0;
    try {
      best = +(localStorage.getItem('gh.puttBest') || 0) || 0;
      if (!best || total < best) localStorage.setItem('gh.puttBest', String(total));
    } catch {}
    const d = total - par;
    stop(
      `<b>Mini putt: ${total}</b> (${d === 0 ? 'level par' : d > 0 ? d + ' over' : -d + ' under'}) · ${S.card.join(' ')}${!best || total < best ? ' · <b>your best round</b>' : ` · best ${best}`}`,
    );
  }
  /** Hold to charge: the power bar runs up and back down until you let go. */
  function charge() {
    if (S.phase !== 'aim') return;
    S.phase = 'power';
    S.t = 0;
    S.target = 0.04;
  }
  /** Let go: the ball is struck exactly where you aimed, as hard as the bar said. */
  function release() {
    if (S.phase !== 'power') return;
    const yaw = S.yaw,
      v = Math.sqrt(2 * DECEL * MAX_ROLL * S.target),
      p = body!.translation();
    S.last.set(p.x, p.y, p.z);
    // struck along the felt: on a slope the putt starts up or down it instead of into it
    const sx = Math.sin(yaw),
      sz = Math.cos(yaw),
      rise = (feltH(p.x + sx * 0.04, p.z + sz * 0.04) - feltH(p.x - sx * 0.04, p.z - sz * 0.04)) / 0.08,
      vk = v / Math.hypot(1, rise);
    body!.setLinvel({ x: sx * vk, y: rise * vk, z: sz * vk }, true);
    body!.setAngvel({ x: (Math.cos(yaw) * v) / BALL_R, y: 0, z: (-Math.sin(yaw) * v) / BALL_R }, true);
    S.strokes++;
    S.phase = 'roll';
    S.still = 0;
    hitT = 0;
    knock(1500 + S.target * 500, 0.2 + S.target * 0.3, 0.045);
  }
  function onClick(e: PointerEvent) {
    if (!S.on || (e.target as HTMLElement)?.tagName !== 'CANVAS') return;
    e.stopImmediatePropagation();
    if (e.button === 0) charge();
  }
  function onRelease(e: PointerEvent) {
    if (S.on && e.button === 0) release();
  }
  /** Dragging with the right button turns the aim, like turning the camera. */
  function onMove(e: MouseEvent) {
    if (S.on && e.buttons & 2 && (S.phase === 'aim' || S.phase === 'power')) S.yaw -= e.movementX * 0.004;
  }
  const noMenu = (e: Event) => {
    if (S.on) e.preventDefault();
  };
  function onDown(e: KeyboardEvent) {
    if (!S.on) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.code === 'Escape') return stop('You left the mini putt course.');
    held.add(e.code);
    if (e.code === 'Space' && !e.repeat) charge();
    if (e.code === 'KeyR' && S.phase !== 'sunk' && S.phase !== 'power') {
      // stuck somewhere silly: back to the tee for a stroke
      S.strokes++;
      place(H().tee[0], H().tee[1]);
    }
  }
  function onUp(e: KeyboardEvent) {
    if (!S.on) return;
    e.stopImmediatePropagation();
    held.delete(e.code);
    if (e.code === 'Space') release();
  }
  (window as any).__putt = { S, ball, body: () => body, charge, release, relief: RELIEF, feltH };
  // friends on the course: their balls where they are, and a line each under the card
  const others: THREE.Mesh[] = [];
  let otherRows = '';
  return {
    /** What other players need to draw this player's round: hole, strokes, and where the ball is. */
    pres(): [number, number, number, number] | undefined {
      if (!S.on || !body) return undefined;
      const p = body.translation();
      return [S.hole, S.strokes, Math.round(p.x * 100), Math.round(p.z * 100)];
    },
    setOthers(list: { name: string; color: string; mp: [number, number, number, number] }[]) {
      list.forEach((o, i) => {
        let m = others[i];
        if (!m) {
          m = others[i] = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.4 }));
          m.castShadow = true;
          m.userData.noBatch = true;
          host.scene.add(m);
        }
        (m.material as THREE.MeshStandardMaterial).color.set(o.color);
        const x = o.mp[2] / 100,
          z = o.mp[3] / 100;
        m.position.set(x, feltH(x, z) + BALL_R, z);
        m.visible = true;
      });
      for (let i = list.length; i < others.length; i++) others[i].visible = false;
      otherRows = list
        .map(o => `${o.name.replace(/[<>&]/g, '')}: hole ${o.mp[0] + 1}, ${o.mp[1]} stroke${o.mp[1] === 1 ? '' : 's'}`)
        .join(' &nbsp;·&nbsp; ');
    },
    get active() {
      return S.on;
    },
    start,
    stop,
    /** Where the ball is (for the lobby's line-of-sight fade). */
    ballPos: () => ball.position,
    /** 0 at address, up to 1 as the putter is drawn back. */
    swing: () => swingS,
    /** Stand the golfer so the ball sits where the putter wants it (they face 90° right of the aim line). */
    stand(ballLocal: THREE.Vector3) {
      if (!S.on || !body || (S.phase === 'roll' && hitT > 1.2) || S.phase === 'sunk') return;
      const p = S.phase === 'roll' ? S.last : body.translation(),
        ry = S.yaw - Math.PI / 2,
        c = Math.cos(ry),
        sn = Math.sin(ry);
      P.x = p.x - (ballLocal.x * c + ballLocal.z * sn);
      P.z = p.z - (-ballLocal.x * sn + ballLocal.z * c);
      P.yaw = ry;
    },
    /** Per frame, after the lobby has placed its own camera (this takes the camera over while a round is on). */
    update(dt: number) {
      if (!S.on || !body) return;
      const p = body.translation(),
        lv = body.linvel(),
        sp = Math.hypot(lv.x, lv.y, lv.z),
        h = H();
      ball.position.set(p.x, p.y, p.z);
      const q = body.rotation();
      ball.quaternion.set(q.x, q.y, q.z, q.w);
      // a sharp change of direction while rolling is a board: knock
      if (S.phase === 'roll') {
        const jolt = Math.hypot(lv.x - lastV.x, lv.z - lastV.z);
        if (jolt > 0.7) knock(520, Math.min(0.4, jolt * 0.1), 0.05);
      }
      lastV.set(lv.x, lv.y, lv.z);
      // while you line up and swing, the ball stays exactly where it came to rest (on a slope too)
      if (S.phase === 'aim' || S.phase === 'power') {
        if (!held0) held0 = { x: p.x, y: p.y, z: p.z };
        body.setTranslation(held0, false);
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      } else held0 = null;
      S.t += dt;
      hitT += dt;
      S.saidT -= dt;
      if (S.phase === 'drop') {
        if (S.t > 0.4 && sp < 0.05) S.phase = 'aim';
      }
      if (S.phase === 'aim' || S.phase === 'power') {
        const turn = (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0) - (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0);
        S.yaw += turn * dt * (held.has('ShiftLeft') ? 0.12 : 0.5);
      }
      if (S.phase === 'power') {
        // the bar runs up to full and back down, again and again, until you let go
        const k = (S.t / SWEEP) % 2;
        S.target = Math.max(0.04, k < 1 ? k : 2 - k);
      } else if (S.phase === 'roll') {
        const dc = Math.hypot(p.x - h.cup[0], p.z - h.cup[1]);
        if (dc < CUP_HOLE_R && sp < 1.7) {
          S.phase = 'sunk';
          S.t = 0;
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          for (let i = 0; i < 4; i++) setTimeout(() => knock(620 - i * 70, 0.24 - i * 0.045, 0.08), i * 85);
          setTimeout(() => playSample('sunk', 0.5), 450);
        } else if (p.y < -1.5 || Math.hypot(p.x - h.tee[0], p.z - h.tee[1]) > 30 || (sp < 1 && !puttFloor(p.x, p.z))) {
          place(S.last.x, S.last.z); // off the course: back where it was hit from
        } else {
          S.still = sp < 0.09 ? S.still + dt : 0;
          if (S.still > 0.45) {
            if (S.strokes >= MAX_STROKES) holeDone(MAX_STROKES + 1);
            else S.phase = 'aim';
          }
        }
      } else if (S.phase === 'sunk') {
        // over the lip and down: the ball slides to the middle and drops out of sight
        const k = Math.min(1, S.t * 5);
        ball.position.set(p.x + (h.cup[0] - p.x) * k, p.y - Math.min(0.09, S.t * S.t * 2.2), p.z + (h.cup[1] - p.z) * k);
        if (S.t > 1.2) holeDone(S.strokes);
        if (!S.on) return;
      }
      const sx = Math.sin(S.yaw),
        sz = Math.cos(S.yaw);
      aimLine.visible = S.phase === 'aim' || S.phase === 'power';
      // lining up: a short guide; charging: as far as the putt will run
      if (aimLine.visible) aimPath(p.x, p.z, S.yaw, S.phase === 'power' ? Math.max(0.4, S.target * MAX_ROLL * 0.95) : 2.6);
      // camera: over the shoulder behind the ball, as when putting on the course; it trails the ball as it rolls
      const want = new THREE.Vector3(p.x - sx * 2.9 - sz * 0.55, FELT_Y + 1.55, p.z - sz * 2.9 + sx * 0.55),
        k = 1 - Math.exp(-dt * (S.phase === 'roll' ? 2 : 6));
      S.cam.lerp(want, k);
      S.look.lerp(new THREE.Vector3(p.x + sx * 1.6, FELT_Y, p.z + sz * 1.6), 1 - Math.exp(-dt * 8));
      host.camera.position.copy(S.cam);
      host.camera.lookAt(S.look);
      {
        const show = S.phase === 'aim' || S.phase === 'power',
          pc = S.phase === 'power' ? S.target : 0;
        bar.style.display = show ? 'block' : 'none';
        if (show) {
          barFill.style.width = (pc * 100).toFixed(1) + '%';
          barText.textContent = S.phase === 'power' ? `${Math.round(pc * MAX_ROLL * FT)} ft` : 'Hold Space, let go to putt';
        }
      }
      hud.innerHTML = `HOLE ${S.hole + 1} <span style="opacity:.6">of ${PUTT_HOLES.length}</span> &nbsp;·&nbsp; STROKE ${Math.min(S.strokes + (S.phase === 'aim' || S.phase === 'power' ? 1 : 0), MAX_STROKES)} &nbsp;·&nbsp; <span style="opacity:.6">PAR ${PAR}</span>${S.saidT > 0 ? `<div style="font-size:15px;color:#ffd27a;margin-top:2px">${S.said}</div>` : ''}`;
      if (otherRows) hud.innerHTML += `<div style="font:600 13px Inter,sans-serif;letter-spacing:0;opacity:.85;margin-top:3px">${otherRows}</div>`;
    },
  };
}
