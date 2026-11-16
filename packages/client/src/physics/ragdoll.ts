// Ragdolls: Rapier rigid bodies on the golfer's skeleton. Cosmetic and local — each client runs its own copy from the
// same trigger (an event + an impulse), so nothing heavy crosses the network.
//   animation → (start) → physics drives the bones → (settled) → blend through a crouch back into the animation.
import * as THREE from 'three';
import { Golfer } from '../characters/golfer';

type RAP = typeof import('@dimforge/rapier3d-compat');
let R: RAP | null = null,
  loading: Promise<RAP> | null = null;
/** Rapier is ~1.5 MB of wasm: load it in the background after the scene is up. */
export function loadPhysics() {
  return (loading ??= import('@dimforge/rapier3d-compat').then(async m => {
    const r: any = (m as any).default ?? m;
    await r.init();
    R = r;
    return r as RAP;
  }));
}
export const physicsReady = () => !!R;
/** The loaded Rapier module (null until loadPhysics() resolves). */
export const rapier = () => R;

export const G_STATIC = 0x0001,
  G_RAG = 0x0002,
  G_VEH = 0x0004,
  grp = (member: number, filter: number) => (member << 16) | filter;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** A physics scene: static props + any ragdolls currently flopping. */
export class PhysWorld {
  world: import('@dimforge/rapier3d-compat').World;
  private acc = 0;
  /** called before every fixed step (vehicle controllers) */
  pre = new Set<(dt: number) => void>();
  constructor() {
    this.world = new R!.World({ x: 0, y: -9.81, z: 0 });
    this.world.numSolverIterations = 8;
  } // extra iterations keep joint limits firm under the body's weight
  private fixed(d: import('@dimforge/rapier3d-compat').ColliderDesc) {
    return this.world.createCollider(
      d
        .setCollisionGroups(grp(G_STATIC, G_RAG | G_VEH))
        .setFriction(0.8)
        .setRestitution(0.05),
    );
  }
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw = 0) {
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw);
    return this.fixed(R!.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  }
  convex(points: Float32Array) {
    const d = R!.ColliderDesc.convexHull(points);
    return d ? this.fixed(d) : null;
  }
  cylinder(cx: number, cy: number, cz: number, halfH: number, r: number) {
    return this.fixed(R!.ColliderDesc.cylinder(halfH, r).setTranslation(cx, cy, cz));
  }
  /** Ground patch (a small trimesh sampled from a height function) around a point; returns it so it can be removed. */
  terrainPatch(height: (x: number, z: number) => number, cx: number, cz: number, half = 9, step = 0.6) {
    const n = Math.ceil((half * 2) / step) + 1,
      v = new Float32Array(n * n * 3),
      idx = new Uint32Array((n - 1) * (n - 1) * 6);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = cx - half + i * step,
          z = cz - half + j * step,
          k = (j * n + i) * 3;
        v[k] = x;
        v[k + 1] = height(x, z);
        v[k + 2] = z;
      }
    let t = 0;
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i,
          b = a + 1,
          c = a + n,
          d = c + 1;
        idx.set([a, c, b, b, c, d], t);
        t += 6;
      }
    return this.fixed(R!.ColliderDesc.trimesh(v, idx));
  }
  /** Whole-hole ground as one trimesh (vehicles drive on it). */
  terrain(height: (x: number, z: number) => number, x0: number, x1: number, z0: number, z1: number, step = 2) {
    const nx = Math.ceil((x1 - x0) / step) + 1,
      nz = Math.ceil((z1 - z0) / step) + 1,
      v = new Float32Array(nx * nz * 3),
      idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * step,
          z = z0 + j * step,
          k = (j * nx + i) * 3;
        v[k] = x;
        v[k + 1] = height(x, z);
        v[k + 2] = z;
      }
    let t = 0;
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i,
          b = a + 1,
          c = a + nx,
          d = c + 1;
        idx.set([a, c, b, b, c, d], t);
        t += 6;
      }
    return this.fixed(R!.ColliderDesc.trimesh(v, idx));
  }
  free() {
    try {
      this.world.free();
    } catch {}
  }
  remove(c: import('@dimforge/rapier3d-compat').Collider) {
    this.world.removeCollider(c, false);
  }
  /** Fixed 60 Hz steps (at most 4 per frame). */
  step(dt: number) {
    this.acc = Math.min(this.acc + dt, 4 / 60);
    while (this.acc >= 1 / 60) {
      for (const f of this.pre) f(1 / 60);
      this.world.step();
      this.acc -= 1 / 60;
    }
  }
}

// ---------------------------------------------------------------- the body plan
// 13 bodies on the bones that matter; every other bone keeps the local rotation it had when the ragdoll started.
// Joints sit at the child bone's origin. Bind pose has identity bone rotations (axes = world axes, facing +Z), so a
// joint's zero angle is the bind pose: knees straight, arms hanging, head level.
type Joint = 'root' | 'ball' | 'knee' | 'elbow' | 'ankle' | 'neck' | 'waist';
interface PartDef {
  bone: string;
  parent: string | null;
  joint: Joint;
  shape: 'box' | 'cap' | 'ball';
  to?: string;
  extra?: number;
  r: number;
  half?: [number, number, number];
  off?: [number, number, number];
  mass: number;
}
const PARTS: PartDef[] = [
  { bone: 'Hips', parent: null, joint: 'root', shape: 'box', r: 0, half: [0.15, 0.1, 0.1], off: [0, -0.01, 0], mass: 14 },
  { bone: 'Spine1', parent: 'Hips', joint: 'waist', shape: 'box', r: 0, half: [0.16, 0.18, 0.1], off: [0, 0.11, -0.005], mass: 22 },
  { bone: 'Head', parent: 'Spine1', joint: 'neck', shape: 'ball', r: 0.105, off: [0, 0.08, 0.012], mass: 5 },
];
for (const n of ['Left', 'Right'])
  PARTS.push(
    { bone: n + 'Arm', parent: 'Spine1', joint: 'ball', shape: 'cap', to: n + 'ForeArm', r: 0.05, mass: 2.4 },
    { bone: n + 'ForeArm', parent: n + 'Arm', joint: 'elbow', shape: 'cap', to: n + 'Hand', extra: 0.09, r: 0.045, mass: 1.8 },
    { bone: n + 'UpLeg', parent: 'Hips', joint: 'ball', shape: 'cap', to: n + 'Leg', r: 0.075, mass: 8 },
    { bone: n + 'Leg', parent: n + 'UpLeg', joint: 'knee', shape: 'cap', to: n + 'Foot', r: 0.058, mass: 4 },
    { bone: n + 'Foot', parent: n + 'Leg', joint: 'ankle', shape: 'box', r: 0, half: [0.045, 0.035, 0.1], off: [0, -0.04, 0.05], mass: 1.1 },
  );
// Muscles: force-based joint motors pulling toward the bind pose, [N·m/rad, N·m·s/rad] for a person standing up.
// A Flop scales them by `tone` (stiff "timber!" fall) and then relaxes to `rest` (out cold ≈ 0.1).
const STIFF: Record<Joint, [number, number]> = {
  root: [0, 0],
  waist: [600, 40],
  neck: [60, 4],
  ball: [25, 2],
  knee: [300, 20],
  elbow: [0, 1.5],
  ankle: [40, 3],
};
const stiff = (d: PartDef): [number, number] => (d.joint === 'ball' && d.bone.endsWith('UpLeg') ? [300, 20] : STIFF[d.joint]);
/** Hinge limits about the bone's X axis (bind frame): knee flexes +X (heel goes back), elbow −X (hand comes forward). */
/** Swing/twist ranges per axis [X, Y, Z] for the ball joints (bind frame: X lateral, Y up, Z forward; legs/arms hang down). */
const CONES: Record<string, [number, number][]> = {
  waist: [
    [-0.4, 0.9],
    [-0.6, 0.6],
    [-0.45, 0.45],
  ],
  neck: [
    [-0.6, 0.75],
    [-1.0, 1.0],
    [-0.5, 0.5],
  ],
  'Left:UpLeg': [
    [-2.0, 0.5],
    [-0.5, 0.5],
    [-0.3, 0.9],
  ],
  'Right:UpLeg': [
    [-2.0, 0.5],
    [-0.5, 0.5],
    [-0.9, 0.3],
  ],
  'Left:Arm': [
    [-2.6, 1.0],
    [-1.2, 1.2],
    [-0.6, 2.6],
  ],
  'Right:Arm': [
    [-2.6, 1.0],
    [-1.2, 1.2],
    [-2.6, 0.6],
  ],
};
const LIMITS: Partial<Record<Joint, [number, number]>> = { knee: [0, 2.4], elbow: [-2.5, 0], ankle: [-0.7, 0.55] };

// ---------------------------------------------------------------- crouch: the half-way pose when getting up
function crouch(g: Golfer) {
  const b = (n: string) => g.bone(n),
    e = (n: string, x: number, y = 0, z = 0) => b(n).quaternion.setFromEuler(new THREE.Euler(x, y, z));
  for (const x of g.bones) x.quaternion.identity();
  b('Hips').position.set(0, 0.5, -0.05);
  e('Spine', 0.35);
  e('Spine1', 0.2);
  e('Spine2', 0.1);
  e('Neck', -0.2);
  e('Head', -0.25);
  for (const [s, n] of [
    [1, 'Left'],
    [-1, 'Right'],
  ] as [number, string][]) {
    e(n + 'UpLeg', s > 0 ? -1.75 : -1.25, 0, s * 0.18);
    e(n + 'Leg', s > 0 ? 2.1 : 2.3);
    e(n + 'Foot', s > 0 ? -0.35 : -0.9);
    e(n + 'Arm', -0.75, 0, -s * 0.15);
    e(n + 'ForeArm', -0.9);
  }
}

const _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _v = new THREE.Vector3(),
  _m = new THREE.Matrix4();
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface FlopOpts {
  /** body velocity when it started (the character's own motion) */ vel?: THREE.Vector3;
  /** extra impulse (N·s) and which bone takes it */ impulse?: THREE.Vector3;
  at?: string;
  /** tumble (rad/s) */ spin?: THREE.Vector3;
  /** colliders made just for this ragdoll (removed when it ends) */ temp?: import('@dimforge/rapier3d-compat').Collider[];
  /** muscle tone multiplier at the start (a stiff "timber!" fall), relaxing to limp after toneT seconds */ tone?: number;
  toneT?: number;
  rest?: number;
  /** called when a body part hits the ground hard (0..1) */ onThud?: (v: number) => void;
}

/** One golfer's ragdoll, from the moment it goes limp until it is back on its feet. */
export class Flop {
  state: 'sim' | 'rise' | 'done' = 'sim';
  t = 0;
  private still = 0;
  private riseT = 0;
  private parts: { def: PartDef; bone: THREE.Bone; body: import('@dimforge/rapier3d-compat').RigidBody; vy: number }[] = [];
  private motors: { set: (m: number) => void }[] = [];
  private toned = false;
  private from: THREE.Quaternion[] = [];
  private fromHips = V();
  private animQ: THREE.Quaternion[] = [];
  private animHips = V();
  private crouchQ: THREE.Quaternion[] = [];
  private crouchHips = V();
  constructor(
    private pw: PhysWorld,
    readonly golfer: Golfer,
    private opts: FlopOpts = {},
  ) {
    const W = pw.world,
      root = golfer.root;
    golfer.limp();
    root.updateMatrixWorld(true);
    const byBone = new Map<string, import('@dimforge/rapier3d-compat').RigidBody>(),
      wq = new Map<string, THREE.Quaternion>(),
      wp = new Map<string, THREE.Vector3>();
    for (const d of PARTS) {
      const bn = golfer.bone(d.bone);
      wp.set(d.bone, bn.getWorldPosition(V()));
      wq.set(d.bone, bn.getWorldQuaternion(new THREE.Quaternion()));
    }
    const v0 = opts.vel ?? V(),
      spin = opts.spin ?? V(),
      DBG = (window as any).__ragDbg || {};
    for (const d of PARTS) {
      const p = wp.get(d.bone)!,
        q = wq.get(d.bone)!;
      const body = W.createRigidBody(
        R!.RigidBodyDesc.dynamic()
          .setTranslation(p.x, p.y, p.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setLinvel(v0.x, v0.y, v0.z)
          .setAngvel({ x: spin.x, y: spin.y, z: spin.z })
          .setLinearDamping(0.08)
          .setAngularDamping(d.joint === 'root' || d.joint === 'waist' ? 1.2 : 0.9)
          .setCcdEnabled(d.mass > 4),
      );
      let cd: import('@dimforge/rapier3d-compat').ColliderDesc;
      if (d.shape === 'box') cd = R!.ColliderDesc.cuboid(...d.half!).setTranslation(...d.off!);
      else if (d.shape === 'ball') cd = R!.ColliderDesc.ball(d.r).setTranslation(...d.off!);
      else {
        // capsule from this joint to the child (bind offset, in this bone's frame), plus `extra` (the hand)
        const dir = Golfer.bindPos(d.to!).sub(Golfer.bindPos(d.bone)),
          L = dir.length() + (d.extra ?? 0);
        dir.normalize();
        const c = dir.clone().multiplyScalar(L / 2),
          rq = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
        cd = R!.ColliderDesc.capsule(Math.max(0.01, L / 2 - d.r * 0.6), d.r)
          .setTranslation(c.x, c.y, c.z)
          .setRotation({ x: rq.x, y: rq.y, z: rq.z, w: rq.w });
      }
      W.createCollider(
        cd
          .setMass(d.mass)
          .setCollisionGroups(grp(G_RAG, G_STATIC | G_VEH))
          .setFriction(0.9)
          .setRestitution(0.08),
        body,
      );
      byBone.set(d.bone, body);
      if (d.parent && !DBG.noJoints) {
        const pb = byBone.get(d.parent)!,
          pp = wp.get(d.parent)!,
          pq = wq.get(d.parent)!;
        const a1 = p.clone().sub(pp).applyQuaternion(pq.clone().invert()),
          A1 = { x: a1.x, y: a1.y, z: a1.z },
          A2 = { x: 0, y: 0, z: 0 };
        const lim = DBG.noLimits ? null : LIMITS[d.joint];
        if (lim) {
          // hinge: free about X only (JointData's own limit fields are ignored by this Rapier build: set them on the joint)
          const j = W.createImpulseJoint(R!.JointData.revolute(A1, A2, { x: 1, y: 0, z: 0 }), pb, body, true) as any,
            raw = j.rawSet,
            h = j.handle,
            ax = R!.JointAxis.AngX;
          raw.jointSetLimits(h, ax, lim[0], lim[1]);
          const [k, c] = stiff(d),
            tgt = d.joint === 'knee' ? 0.15 : d.joint === 'elbow' ? -0.3 : 0;
          if (k || c) {
            raw.jointConfigureMotorModel(h, ax, R!.MotorModel.ForceBased);
            const set = (m: number) => raw.jointConfigureMotorPosition(h, ax, tgt, k * m, c * m);
            set(opts.tone ?? 0.1);
            this.motors.push({ set });
          }
        } else {
          // Rapier builds spherical joints as generic ones; the JS wrapper hides the per-axis API, so use the raw set.
          const j = W.createImpulseJoint(R!.JointData.spherical(A1, A2), pb, body, true) as any,
            raw = j.rawSet,
            h = j.handle;
          const [k, c] = stiff(d),
            cone = CONES[d.joint === 'ball' ? d.bone.replace(/^(Left|Right)/, m => m + ':') : d.joint];
          const AX = [R!.JointAxis.AngX, R!.JointAxis.AngY, R!.JointAxis.AngZ];
          AX.forEach((ax, n) => {
            if (cone && !DBG.noLimits) raw.jointSetLimits?.(h, ax, cone[n][0], cone[n][1]);
          });
          if ((k || c) && !DBG.noMotors) {
            AX.forEach(ax => raw.jointConfigureMotorModel(h, ax, R!.MotorModel.ForceBased));
            const set = (m: number) => AX.forEach(ax => raw.jointConfigureMotorPosition(h, ax, 0, k * m, c * m));
            set(opts.tone ?? 0.1);
            this.motors.push({ set });
          }
        }
      }
      this.parts.push({ def: d, bone: golfer.bone(d.bone), body, vy: v0.y });
    }
    if (opts.impulse && !DBG.noImpulse) {
      const b = byBone.get(opts.at ?? 'Spine1') ?? byBone.get('Spine1')!;
      const i = opts.impulse;
      b.applyImpulse({ x: i.x, y: i.y, z: i.z }, true);
    }
  }
  /** World position of the pelvis (camera target). */
  hips(out = V()) {
    return this.golfer.bone('Hips').getWorldPosition(out);
  }

  /** Physics → bones. Call after the world has stepped. Returns true once it has come to rest. */
  private drive(dt: number) {
    const root = this.golfer.root;
    let maxV = 0;
    if (!this.toned && this.t > (this.opts.toneT ?? 0)) {
      this.toned = true;
      for (const m of this.motors) m.set(this.opts.rest ?? 0.1);
    }
    for (const p of this.parts) {
      const t = p.body.translation(),
        r = p.body.rotation(),
        v = p.body.linvel(),
        sp = Math.hypot(v.x, v.y, v.z);
      if (p.def.mass > 3 && p.vy < -2.2 && v.y > p.vy + 2.0) this.opts.onThud?.(Math.min(1, -p.vy / 7)); // sudden stop on the way down
      p.vy = v.y;
      maxV = Math.max(maxV, sp);
      p.bone.parent!.updateWorldMatrix(true, false);
      p.bone.parent!.matrixWorld.decompose(_v, _q2, new THREE.Vector3());
      p.bone.quaternion.copy(_q2.invert().multiply(_q.set(r.x, r.y, r.z, r.w)));
      if (!p.def.parent) p.bone.position.copy(root.worldToLocal(_v.set(t.x, t.y, t.z)));
      p.bone.updateMatrixWorld(true);
    }
    this.still = maxV < 0.35 ? this.still + dt : 0;
    return this.t > 6 || (this.t > 1.7 && this.still > 0.6);
  }

  /** Where to stand up: under the pelvis, facing the way the head lies. */
  restSpot() {
    const h = this.hips(),
      head = this.golfer.bone('Head').getWorldPosition(V()),
      d = head.sub(h);
    return { x: h.x, z: h.z, yaw: Math.atan2(d.x, d.z) };
  }

  /**
   * Advance. `place(x, z, yaw)` moves the character root to where it got up (the caller owns position);
   * `animate()` poses the golfer as the game normally would (used while blending back). Returns false when finished.
   */
  update(dt: number, place: (x: number, z: number, yaw: number) => void, animate: () => void) {
    this.t += dt;
    if (this.state === 'sim') {
      if (!this.drive(dt)) return true;
      // capture the lying pose in world space, then re-express it under the root's new position
      const g = this.golfer,
        bones = g.bones,
        wq = bones.map(b => b.getWorldQuaternion(new THREE.Quaternion())),
        hipW = this.hips();
      for (const p of this.parts) this.pw.world.removeRigidBody(p.body);
      for (const c of this.opts.temp ?? []) this.pw.remove(c);
      const s = this.restSpot();
      place(s.x, s.z, s.yaw);
      g.root.updateMatrixWorld(true);
      const rootQ = g.root.getWorldQuaternion(new THREE.Quaternion());
      this.from = bones.map((b, i) => {
        const pq = b.parent === g.root ? rootQ : wq[bones.indexOf(b.parent as THREE.Bone)];
        return pq.clone().invert().multiply(wq[i]);
      });
      this.fromHips.copy(g.root.worldToLocal(hipW));
      crouch(g);
      this.crouchQ = bones.map(b => b.quaternion.clone());
      this.crouchHips.copy(g.bone('Hips').position);
      this.state = 'rise';
      this.riseT = 0;
    }
    if (this.state === 'rise') {
      this.riseT += dt;
      animate();
      const g = this.golfer,
        bones = g.bones,
        T1 = 0.55,
        T2 = 1.15;
      this.animQ = bones.map(b => b.quaternion.clone());
      this.animHips.copy(g.bone('Hips').position);
      const k = this.riseT < T1 ? easeInOut(this.riseT / T1) : easeInOut(Math.min(1, (this.riseT - T1) / (T2 - T1)));
      const [A, B, HA, HB] =
        this.riseT < T1 ? [this.from, this.crouchQ, this.fromHips, this.crouchHips] : [this.crouchQ, this.animQ, this.crouchHips, this.animHips];
      bones.forEach((b, i) => b.quaternion.copy(A[i]).slerp(B[i], k));
      g.bone('Hips').position.lerpVectors(HA, HB, k);
      g.root.updateMatrixWorld(true);
      if (this.riseT >= T2) {
        this.state = 'done';
        return false;
      }
      return true;
    }
    return false;
  }
  /** Drop it now (mode change, player left). */
  dispose() {
    if (this.state === 'sim') {
      for (const p of this.parts) this.pw.world.removeRigidBody(p.body);
      for (const c of this.opts.temp ?? []) this.pw.remove(c);
    }
    this.state = 'done';
  }
}
void _m;
