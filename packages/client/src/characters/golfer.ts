// Procedural PS3-era golfer: one Mixamo-named skeleton, skinned smooth-shaded body + streetwear, painted face,
// curled grip hands, skate shoes, and a club. The swing is driven by the meter: s = 0 address → 1 top → 2 impact
// → 3 finish. Arms and legs are solved with two-bone IK so hands stay on the grip and feet stay planted.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { knit, twill, skin, face, solid, capCloth, hair as hairTex, type ClothSet } from './textures';
import { gripHand, relaxedHand } from './hand';
import { MeshoptSimplifier } from 'meshoptimizer';
import { lodCount } from '../ui/perf';
import { mhReady, buildBodyMH, loadGolferAssets, loadBody, mhBindFor, mhBind, mhCurl, mhClip, type Clip } from './mhGolfer';
const _ax = new THREE.Vector3(),
  _ad = new THREE.Vector3(),
  _q1 = new THREE.Quaternion(),
  _qa = new THREE.Quaternion(),
  _qb = new THREE.Quaternion(),
  _qc = new THREE.Quaternion(),
  _qd = new THREE.Quaternion();

// ---------------------------------------------------------------- skeleton (bind pose, metres, faces +Z, left = +X)
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ARM_TILT = 0.21; // A-pose: arms hang ~12° out from the body
const armDir = (s: number) => V(s * Math.sin(ARM_TILT), -Math.cos(ARM_TILT), 0);
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
const BIND: [string, string | null, THREE.Vector3][] = (() => {
  const b: [string, string | null, THREE.Vector3][] = [
    ['Hips', null, V(0, 0.98, 0)],
    ['Spine', 'Hips', V(0, 1.07, 0)],
    ['Spine1', 'Spine', V(0, 1.19, 0)],
    ['Spine2', 'Spine1', V(0, 1.31, 0)],
    ['Neck', 'Spine2', V(0, 1.5, -0.01)],
    ['Head', 'Neck', V(0, 1.6, 0)],
  ];
  for (const [s, n] of [
    [1, 'Left'],
    [-1, 'Right'],
  ] as [number, string][]) {
    const arm = V(0.174 * s, 1.408, -0.02),
      fore = arm.clone().addScaledVector(armDir(s), 0.3),
      hand = fore.clone().addScaledVector(armDir(s), 0.268);
    b.push(
      [n + 'Shoulder', 'Spine2', V(0.035 * s, 1.44, -0.01)],
      [n + 'Arm', n + 'Shoulder', arm],
      [n + 'ForeArm', n + 'Arm', fore],
      [n + 'Hand', n + 'ForeArm', hand],
    );
    b.push(
      [n + 'UpLeg', 'Hips', V(0.095 * s, 0.92, 0)],
      [n + 'Leg', n + 'UpLeg', V(0.105 * s, 0.5, 0.005)],
      [n + 'Foot', n + 'Leg', V(0.11 * s, 0.085, -0.02)],
      [n + 'ToeBase', n + 'Foot', V(0.11 * s, 0.02, 0.12)],
    );
  }
  // finger bones (MakeHuman's hands): thumb, index, middle, ring, pinky × 3 segments. Placeholder positions here;
  // the MakeHuman bind replaces them (the procedural body doesn't weight them)
  for (const [s, n] of [
    [1, 'Left'],
    [-1, 'Right'],
  ] as [number, string][]) {
    const h = b.find(x => x[0] === n + 'Hand')![2];
    FINGERS.forEach((f, fi) => {
      for (let j = 1; j <= 3; j++)
        b.push([
          `${n}Hand${f}${j}`,
          j === 1 ? n + 'Hand' : `${n}Hand${f}${j - 1}`,
          h
            .clone()
            .addScaledVector(armDir(s), 0.03 + j * 0.03)
            .add(V(0, 0, 0.02 - fi * 0.01)),
        ]);
    });
  }
  return b;
})();
const HTOP = 1.778; // top of the head (crown) in bind pose
const BI: Record<string, number> = {};
BIND.forEach(([n], i) => (BI[n] = i));
// Each body type has its own joint positions. The poses below read them through BPOS, which answers for whichever
// golfer is being built or posed right now (CUR is set on entry to the constructor, update, poseClip and bindPos).
let CUR: Record<string, THREE.Vector3> | null = null;
const BPOS = (n: string) => CUR?.[n] ?? BIND[BI[n]][2];

// hand bone ↔ grip frame: R maps grip-frame vectors into the hand bone's (bind) frame; wrist = bone origin in grip frame
const _hb: Record<number, { q: THREE.Quaternion; wrist: THREE.Vector3; geo: THREE.BufferGeometry }> = {};
function handBind(s: number) {
  if (_hb[s]) return _hb[s];
  const { geo, wrist } = gripHand(s < 0);
  const A = V(0, -0.6, 0.8),
    gn = V(s, 0, 0),
    ad = armDir(s),
    nin = V(-s * Math.cos(ARM_TILT), -Math.sin(ARM_TILT), 0);
  const Mg = new THREE.Matrix4().makeBasis(A, gn, new THREE.Vector3().crossVectors(A, gn)),
    Mb = new THREE.Matrix4().makeBasis(ad, nin, new THREE.Vector3().crossVectors(ad, nin));
  const q = new THREE.Quaternion().setFromRotationMatrix(Mb.multiply(Mg.transpose()));
  return (_hb[s] = { q, wrist, geo });
}

// ---------------------------------------------------------------- geometry helpers
type W = [number, number][]; // [boneIndex, weight]
interface Part {
  g: THREE.BufferGeometry;
  w: (p: THREE.Vector3, i: number) => W;
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Ring {
  t: number;
  rx: number;
  rz: number;
  ox?: number;
  oz?: number;
  p?: number;
}
/** Loft rings along an axis (start + dir·t). side/fwd span the ring. Stores `t` per vertex for skin weights. */
function loft(
  start: THREE.Vector3,
  dir: THREE.Vector3,
  side: THREE.Vector3,
  fwd: THREE.Vector3,
  rings: Ring[],
  seg = 24,
  caps: [boolean, boolean] = [false, false],
) {
  const pos: number[] = [],
    uv: number[] = [],
    tt: number[] = [],
    idx: number[] = [],
    T = rings[rings.length - 1].t - rings[0].t;
  const P = new THREE.Vector3();
  rings.forEach(r => {
    const e = 2 / (r.p || 2);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2,
        c = Math.cos(a),
        s = Math.sin(a);
      const sx = Math.sign(c) * Math.pow(Math.abs(c), e),
        sz = Math.sign(s) * Math.pow(Math.abs(s), e);
      P.copy(start)
        .addScaledVector(dir, r.t)
        .addScaledVector(side, (r.ox || 0) + r.rx * sx)
        .addScaledVector(fwd, (r.oz || 0) + r.rz * sz);
      pos.push(P.x, P.y, P.z);
      uv.push(i / seg, 1 - (r.t - rings[0].t) / T);
      tt.push(r.t);
    }
  });
  const row = seg + 1;
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * row + i,
        b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const capFaces: [number, number][] = []; // [first index into idx, expected sign along dir]
  for (const [k, on] of caps.entries())
    if (on) {
      capFaces.push([idx.length, k === 0 ? -1 : 1]);
      const j = k === 0 ? 0 : rings.length - 1,
        r = rings[j],
        c = start
          .clone()
          .addScaledVector(dir, r.t)
          .addScaledVector(side, r.ox || 0)
          .addScaledVector(fwd, r.oz || 0),
        ci = pos.length / 3;
      pos.push(c.x, c.y, c.z);
      uv.push(0.5, k ? 0 : 1);
      tt.push(r.t);
      for (let i = 0; i < seg; i++) {
        const a = j * row + i;
        if (k === 0) idx.push(ci, a + 1, a);
        else idx.push(ci, a, a + 1);
      }
      capFaces[capFaces.length - 1].push(idx.length as any);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('axisT', new THREE.Float32BufferAttribute(tt, 1));
  const sideEnd = capFaces.length ? capFaces[0][0] : idx.length;
  g.setIndex(idx.slice(0, sideEnd));
  fixWinding(g, start, dir);
  const all = Array.from(g.index!.array as any) as number[];
  for (const cf of capFaces as any[]) {
    // orient each cap to face out of the ends
    const [s0, sign, s1] = cf,
      A = new THREE.Vector3(),
      B = new THREE.Vector3(),
      C = new THREE.Vector3();
    A.fromArray(pos, idx[s0] * 3);
    B.fromArray(pos, idx[s0 + 1] * 3);
    C.fromArray(pos, idx[s0 + 2] * 3);
    const flip = B.sub(A).cross(C.sub(A)).dot(dir) * sign < 0;
    for (let f = s0; f < s1; f += 3) all.push(idx[f], flip ? idx[f + 2] : idx[f + 1], flip ? idx[f + 1] : idx[f + 2]);
  }
  g.setIndex(all);
  g.computeVertexNormals();
  return g;
}
/** Make sure faces point away from the loft axis. */
function fixWinding(g: THREE.BufferGeometry, start: THREE.Vector3, dir: THREE.Vector3) {
  const p = g.attributes.position,
    ix = g.index!,
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    n = new THREE.Vector3(),
    m = new THREE.Vector3();
  let score = 0;
  for (let f = 0; f < Math.min(ix.count, 600); f += 3) {
    a.fromBufferAttribute(p, ix.getX(f));
    b.fromBufferAttribute(p, ix.getX(f + 1));
    c.fromBufferAttribute(p, ix.getX(f + 2));
    n.subVectors(b, a).cross(m.subVectors(c, a));
    const ctr = a
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3);
    const ax = start.clone().addScaledVector(dir, ctr.clone().sub(start).dot(dir));
    score += Math.sign(n.dot(ctr.sub(ax)));
  }
  if (score < 0) {
    const arr = ix.array as any;
    for (let f = 0; f < arr.length; f += 3) {
      const t = arr[f + 1];
      arr[f + 1] = arr[f + 2];
      arr[f + 2] = t;
    }
  }
}
/** Weights along a chain of bones split at joint distances (smooth blend across each joint). */
function chainW(bones: string[], joints: number[], blend: number) {
  return (g: THREE.BufferGeometry) =>
    (_p: THREE.Vector3, i: number): W => {
      const t = g.attributes.axisT.getX(i);
      for (let j = 0; j < joints.length; j++) {
        const tj = joints[j];
        if (Math.abs(t - tj) < blend) {
          const f = sstep(tj - blend, tj + blend, t);
          return [
            [BI[bones[j]], 1 - f],
            [BI[bones[j + 1]], f],
          ];
        }
        if (t < tj) return [[BI[bones[j]], 1]];
      }
      return [[BI[bones[bones.length - 1]], 1]];
    };
}
const rigid = (bone: string) => (): W => [[BI[bone], 1]];
function place(g: THREE.BufferGeometry, pos: THREE.Vector3, rot?: THREE.Euler, scale?: THREE.Vector3) {
  const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot || new THREE.Euler()), scale || V(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}
function finalize(parts: Part[]) {
  const geos = parts.map(({ g, w }) => {
    const ng = g.index ? g : g;
    const n = ng.attributes.position.count,
      si = new Uint16Array(n * 4),
      sw = new Float32Array(n * 4),
      p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(ng.attributes.position as any, i);
      const ws = w(p, i);
      ws.forEach(([b, v], k) => {
        si[i * 4 + k] = b;
        sw[i * 4 + k] = v;
      });
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', ng.attributes.position);
    out.setAttribute('normal', ng.attributes.normal);
    out.setAttribute('uv', ng.attributes.uv || new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    out.setIndex(ng.index ? Array.from(ng.index.array as any) : [...Array(n).keys()]);
    return out;
  });
  return mergeGeometries(geos, false)!;
}

// ---------------------------------------------------------------- the look
export interface Outfit {
  skin: string;
  shirt: string;
  pants: string;
  shoes: string;
  sole: string;
  cap: string;
  hair: string;
  print?: string;
  seed?: number;
  capStyle?: 'back' | 'front' | 'none' | 'fedora';
  stubble?: boolean;
  ball?: string;
  // the wardrobe (MakeHuman golfer only; all optional so older saved looks still load)
  top?: TopStyle;
  jacket?: JacketStyle;
  jacketColor?: string;
  pantsStyle?: PantsStyle;
  shoeStyle?: ShoeStyle;
  hairStyle?: HairStyle;
  paint?: PaintStyle;
  paintColor?: string;
  glasses?: GlassesStyle;
  chain?: boolean;
  watch?: boolean;
  earring?: boolean;
  body?: BodyType;
  tatChest?: string;
  tatBack?: string;
  tatArmL?: string;
  tatArmR?: string;
  tatCalf?: string;
  tatInk?: string;
  /** the putter skin (Mom's Attic rewards, PUTTERS); none = the plain blade */
  putter?: string;
}
/** Putter skins: unlocked by finding Mom's lost things (lobby/attic.ts). */
export const PUTTERS = ['hockey', 'broom', 'wrench', 'flamingo'] as const;
/** Tattoo designs, in the order they sit on public/golfer/tattoos.png (6 across). colour = keeps its own colours. */
export const TATTOOS: { id: string; name: string; colour?: boolean }[] = [
  { id: 'dragon', name: 'Dragon' },
  { id: 'lion', name: 'Tribal lion' },
  { id: 'bull', name: 'Bull' },
  { id: 'wings', name: 'Wings' },
  { id: 'heart', name: 'Heart' },
  { id: 'star', name: 'Star' },
  { id: 'wolf', name: 'Wolf' },
  { id: 'butterfly', name: 'Butterfly' },
  { id: 'serpent', name: 'Serpent' },
  { id: 'lionface', name: 'Lion' },
  { id: 'dolphin', name: 'Dolphin' },
  { id: 'rose', name: 'Rose', colour: true },
  { id: 'sun', name: 'Sun' },
  { id: 'skull', name: 'Skull & roses', colour: true },
  { id: 'skullrose', name: 'Skull wreath' },
  { id: 'sugar', name: 'Sugar skull', colour: true },
  { id: 'anchor', name: 'Anchor' },
  { id: 'swallow', name: 'Swallow' },
];
export const TAT_SPOTS = ['tatChest', 'tatBack', 'tatArmL', 'tatArmR', 'tatCalf'] as const;
export const BODIES = ['male', 'female', 'muscle', 'fmuscle'] as const;
export type BodyType = (typeof BODIES)[number];
export const TOPS = ['tee', 'long', 'button', 'none'] as const;
export const JACKETS = ['none', 'padded', 'blazer'] as const;
export const PANTS = ['jeans', 'slacks', 'shorts', 'overalls'] as const;
export const SHOES = ['sneakers', 'trainers', 'loafers', 'hikers', 'boots', 'dress', 'bare'] as const;
export const HAIRS = ['short', 'short1', 'short3', 'short4', 'afro', 'bob', 'bob2', 'braid', 'long', 'pony', 'bald'] as const;
export const PAINTS = ['none', 'eyeblack', 'stripes', 'band', 'star', 'whiskers', 'half', 'clown'] as const;
export const GLASSES = ['none', 'shades', 'aviators', 'round'] as const;
export type TopStyle = (typeof TOPS)[number];
export type JacketStyle = (typeof JACKETS)[number];
export type PantsStyle = (typeof PANTS)[number];
export type ShoeStyle = (typeof SHOES)[number];
export type HairStyle = (typeof HAIRS)[number];
export type PaintStyle = (typeof PAINTS)[number];
export type GlassesStyle = (typeof GLASSES)[number];
// Textures are generated on the CPU (and the normal maps per pixel), so identical ones are shared between golfers.
const TEX = new Map<string, any>();
const memo = <T>(key: string, fn: () => T): T => {
  if (!TEX.has(key)) TEX.set(key, fn());
  return TEX.get(key);
};
export const DEFAULT_OUTFIT: Outfit = {
  skin: '#b9825b',
  shirt: '#2f3a44',
  pants: '#6b6447',
  shoes: '#30302e',
  sole: '#e8e2d4',
  cap: '#8a2f28',
  hair: '#2a1c12',
  print: '#e9b23a',
};

function buildBody(o: Outfit) {
  const sets = {
    skin: memo('skin' + o.skin, () => skin(o.skin, 3)),
    face: memo(`face${o.skin}${o.stubble !== false}`, () => face(o.skin, { stubble: o.stubble !== false, seed: 7 })),
    shirt: memo(`shirt${o.shirt}${o.print}`, () =>
      knit(o.shirt, 1, (x, w, h) => {
        // invented chest print: a sun-faded palm + "GH"
        x.save();
        x.translate(w * 1.5, h);
        x.scale(-1, -1);
        x.globalAlpha = 0.85;
        x.fillStyle = o.print || '#e9b23a';
        x.font = '900 46px Impact, sans-serif';
        x.textAlign = 'center';
        x.fillText('GOLDEN', w * 0.75, h * 0.42);
        x.font = '900 28px Impact, sans-serif';
        x.fillText('HILLS · EST 1962', w * 0.75, h * 0.48);
        x.beginPath();
        x.arc(w * 0.75, h * 0.33, 34, Math.PI, 0);
        x.fill();
        x.globalAlpha = 0.35;
        x.fillStyle = '#fff';
        for (let i = 0; i < 400; i++) x.fillRect(w * 0.62 + Math.random() * w * 0.26, h * 0.26 + Math.random() * h * 0.24, 2, 2);
        x.restore();
      }),
    ),
    pants: memo('pants' + o.pants, () => twill(o.pants, 3)),
    shoe: memo('shoe' + o.shoes, () => solid(o.shoes, 0.85, 4, 0.5)),
    sole: memo('sole' + o.sole, () => solid(o.sole, 0.9, 5, 0.3)),
    cap: memo('capc' + o.cap, () => capCloth(o.cap, 10)),
    hair: memo('hair' + o.hair, () => hairTex(o.hair)),
  };
  (sets as any).gripHands = sets.skin;
  (sets as any).openHands = sets.skin; // two hand meshes on the skin material; the rig shows one at a time
  const P: Record<string, Part[]> = { skin: [], face: [], shirt: [], pants: [], shoe: [], sole: [], cap: [], hair: [], gripHands: [], openHands: [] };
  const X = V(1, 0, 0),
    Y = V(0, 1, 0),
    Z = V(0, 0, 1);

  // --- torso (tee) from hem up to the collar; boxy superellipse, chest forward
  const tee = loft(
    V(0, 0.86, 0),
    Y,
    X,
    Z,
    [
      { t: 0, rx: 0.169, rz: 0.126, oz: 0.004, p: 2.25 },
      { t: 0.06, rx: 0.166, rz: 0.123, oz: 0.004, p: 2.25 },
      { t: 0.18, rx: 0.157, rz: 0.115, oz: 0.007, p: 2.3 },
      { t: 0.3, rx: 0.162, rz: 0.12, oz: 0.013, p: 2.3 },
      { t: 0.4, rx: 0.17, rz: 0.127, oz: 0.02, p: 2.25 },
      { t: 0.48, rx: 0.178, rz: 0.123, oz: 0.015, p: 2.25 },
      { t: 0.535, rx: 0.19, rz: 0.113, oz: 0.006, p: 2.2 },
      { t: 0.575, rx: 0.178, rz: 0.099, oz: 0.0, p: 2.1 },
      { t: 0.61, rx: 0.12, rz: 0.084, oz: -0.003, p: 2.1 },
      { t: 0.635, rx: 0.068, rz: 0.06, oz: 0.0 },
    ],
    28,
  );
  {
    const base = chainW(['Hips', 'Spine', 'Spine1', 'Spine2'], [0.16, 0.3, 0.44], 0.05)(tee);
    // the shoulder corners of the tee ride on the collar bones, so the torso follows the arm joint when the shoulders roll
    P.shirt.push({
      g: tee,
      w: (p, i) => {
        const f = sstep(0.07, 0.15, Math.abs(p.x)) * sstep(1.33, 1.4, p.y) * 0.75;
        if (f <= 0) return base(p, i);
        return [...base(p, i).map(([b, v]) => [b, v * (1 - f)] as [number, number]), [BI[(p.x > 0 ? 'Left' : 'Right') + 'Shoulder'], f]];
      },
    });
  }
  // collar rib
  const collar = new THREE.TorusGeometry(0.066, 0.009, 8, 24).rotateX(Math.PI / 2);
  place(collar, V(0, 1.492, 0.0), new THREE.Euler(-0.18, 0, 0), V(1, 1, 0.92));
  P.shirt.push({
    g: collar,
    w: (): W => [
      [BI.Spine2, 0.6],
      [BI.Neck, 0.4],
    ],
  });

  // --- pelvis (pants seat) with a closed crotch, belt-line under the tee
  const seat = loft(
    V(0, 0.79, 0),
    Y,
    X,
    Z,
    [
      { t: 0, rx: 0.06, rz: 0.06, oz: 0.0 },
      { t: 0.03, rx: 0.12, rz: 0.08, oz: 0.0, p: 2 },
      { t: 0.07, rx: 0.148, rz: 0.102, oz: -0.004, p: 2 },
      { t: 0.11, rx: 0.152, rz: 0.106, oz: -0.006, p: 2.1 },
      { t: 0.15, rx: 0.142, rz: 0.098, oz: -0.002, p: 2.2 },
      { t: 0.17, rx: 0.13, rz: 0.09, oz: 0.0, p: 2.2 },
    ],
    28,
    [true, false],
  );
  P.pants.push({
    g: seat,
    w: (p: THREE.Vector3): W => {
      const s = p.x > 0 ? 'LeftUpLeg' : 'RightUpLeg',
        f = (1 - sstep(0.82, 0.95, p.y)) * sstep(0.01, 0.07, Math.abs(p.x)) * 0.9;
      return [
        [BI.Hips, 1 - f],
        [BI[s], f],
      ];
    },
  });

  for (const [s, n] of [
    [1, 'Left'],
    [-1, 'Right'],
  ] as [number, string][]) {
    // --- baggy cargo leg: hip → knee → ankle, centre following the bone line
    const hip = BPOS(n + 'UpLeg'),
      knee = BPOS(n + 'Leg'),
      ank = BPOS(n + 'Foot');
    const top = V(hip.x, 0.92, hip.z),
      dir = ank.clone().sub(top).normalize(),
      L1 = top.distanceTo(knee),
      L2 = L1 + knee.distanceTo(ank);
    const leg = loft(
      top,
      dir,
      X,
      Z,
      [
        { t: 0, rx: 0.058, rz: 0.074 },
        { t: 0.05, rx: 0.074, rz: 0.086, oz: 0.002 },
        { t: 0.1, rx: 0.086, rz: 0.094, oz: 0.004 },
        { t: 0.25, rx: 0.081, rz: 0.087, oz: 0.006 },
        { t: L1 - 0.06, rx: 0.07, rz: 0.074, oz: 0.008 },
        { t: L1, rx: 0.068, rz: 0.072, oz: 0.011 },
        { t: L1 + 0.1, rx: 0.066, rz: 0.07, oz: 0.003 },
        { t: L1 + 0.26, rx: 0.063, rz: 0.066 },
        { t: L2 - 0.05, rx: 0.065, rz: 0.069, oz: -0.003 },
        { t: L2 + 0.02, rx: 0.069, rz: 0.074, oz: -0.005 },
      ],
      22,
    );
    const legW = chainW([n + 'UpLeg', n + 'Leg'], [L1], 0.06)(leg);
    P.pants.push({
      g: leg,
      w: (p, i) => {
        const t = leg.attributes.axisT.getX(i);
        if (t < 0.1) {
          const f = sstep(0.0, 0.1, t);
          return [
            [BI.Hips, 1 - f],
            [BI[n + 'UpLeg'], f],
          ];
        }
        return legW(p, i);
      },
    });
    // cargo pocket on the outer thigh + flap
    const pk = new THREE.BoxGeometry(0.008, 0.14, 0.11, 1, 2, 2);
    place(pk, V(hip.x + s * 0.082, 0.68, 0.01), new THREE.Euler(0, 0, -s * 0.03));
    const flap = new THREE.BoxGeometry(0.011, 0.026, 0.114);
    place(flap, V(hip.x + s * 0.0845, 0.752, 0.01), new THREE.Euler(0, 0, -s * 0.03));
    void pk;
    P.pants.push({ g: flap, w: rigid(n + 'UpLeg') }); // just the pocket flap: a box pocket stood off the leg like a plate
    // bunched cuff over the shoe
    const cuff = new THREE.TorusGeometry(0.068, 0.012, 8, 20).rotateX(Math.PI / 2);
    place(cuff, V(ank.x, 0.1, ank.z - 0.002));
    P.pants.push({ g: cuff, w: rigid(n + 'Leg') });

    // --- arm: skin tube shoulder → wrist; tee sleeve over the top
    const arm = BPOS(n + 'Arm'),
      ad = armDir(s),
      side = V(Math.cos(ARM_TILT) * s, Math.sin(ARM_TILT) * s, 0),
      L3 = 0.3,
      L4 = 0.568;
    const skinArm = loft(
      arm.clone().addScaledVector(ad, -0.03),
      ad,
      side,
      Z,
      [
        { t: 0.13, rx: 0.05, rz: 0.054 },
        { t: 0.2, rx: 0.048, rz: 0.051 },
        { t: L3 - 0.02, rx: 0.041, rz: 0.042 },
        { t: L3 + 0.03, rx: 0.04, rz: 0.041 },
        { t: L3 + 0.1, rx: 0.044, rz: 0.04 },
        { t: L3 + 0.17, rx: 0.039, rz: 0.034 },
        { t: L4 - 0.02, rx: 0.029, rz: 0.023 },
        { t: L4 + 0.03, rx: 0.028, rz: 0.021 },
      ],
      18,
    );
    const awf = chainW([n + 'Arm', n + 'ForeArm', n + 'Hand'], [L3 + 0.03, L4 + 0.01], 0.05)(skinArm);
    P.skin.push({ g: skinArm, w: awf });
    const sleeve = loft(
      arm.clone(),
      ad,
      side,
      Z,
      [
        { t: 0, rx: 0.042, rz: 0.044 },
        { t: 0.03, rx: 0.052, rz: 0.054 },
        { t: 0.06, rx: 0.058, rz: 0.06 },
        { t: 0.13, rx: 0.058, rz: 0.06 },
        { t: 0.19, rx: 0.057, rz: 0.059 },
        { t: 0.22, rx: 0.058, rz: 0.06 },
      ],
      22,
    );
    {
      const uv = sleeve.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.2);
    } // plain part of the tee texture (no print)
    // Sleeve and shoulder ball are rigid to the upper arm: a ball centred on the joint looks the same at any arm angle,
    // so nothing collapses or tears when the arm goes overhead; it simply overlaps the torso (same cloth).
    P.shirt.push({ g: sleeve, w: rigid(n + 'Arm') });
    const capG = new THREE.SphereGeometry(0.0575, 18, 14);
    capG.scale(0.93, 0.7, 1.0);
    capG.translate(arm.x - s * 0.011, arm.y - 0.002, arm.z); // round top of the sleeve, set into the torso's shoulder line   // just the rounded top of the sleeve
    {
      const uv = capG.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.2, uv.getY(i) * 0.2);
    }
    P.shirt.push({ g: capG, w: rigid(n + 'Arm') });

    // --- hand: modelled wrapped round a grip (see hand.ts), bound rigidly to the hand bone
    {
      const hb = handBind(s),
        geo = hb.geo.clone(),
        m = new THREE.Matrix4()
          .compose(BPOS(n + 'Hand'), hb.q, V(1, 1, 1))
          .multiply(new THREE.Matrix4().makeTranslation(-hb.wrist.x, -hb.wrist.y, -hb.wrist.z));
      geo.applyMatrix4(m);
      P.gripHands.push({ g: geo, w: rigid(n + 'Hand') });
      const open = relaxedHand(s);
      open.applyMatrix4(new THREE.Matrix4().makeRotationZ(s * ARM_TILT));
      open.translate(BPOS(n + 'Hand').x, BPOS(n + 'Hand').y, BPOS(n + 'Hand').z);
      P.openHands.push({ g: open, w: rigid(n + 'Hand') });
    }

    // --- skate shoe: one upper + one cupsole, lofted heel → toe, rigid to the foot
    const fx = BPOS(n + 'Foot').x;
    const upper = loft(
      V(fx, 0, -0.085),
      Z,
      X,
      Y,
      [
        { t: 0, rx: 0.02, rz: 0.03, oz: 0.07 },
        { t: 0.012, rx: 0.038, rz: 0.05, oz: 0.072 },
        { t: 0.05, rx: 0.045, rz: 0.058, oz: 0.074, p: 2.4 },
        { t: 0.1, rx: 0.047, rz: 0.052, oz: 0.072, p: 2.4 },
        { t: 0.16, rx: 0.049, rz: 0.04, oz: 0.062, p: 2.4 },
        { t: 0.21, rx: 0.047, rz: 0.03, oz: 0.052, p: 2.4 },
        { t: 0.25, rx: 0.04, rz: 0.024, oz: 0.046, p: 2.2 },
        { t: 0.272, rx: 0.026, rz: 0.018, oz: 0.042 },
        { t: 0.282, rx: 0.008, rz: 0.008, oz: 0.04 },
      ],
      22,
      [true, false],
    );
    const sole = loft(
      V(fx, 0, -0.092),
      Z,
      X,
      Y,
      [
        { t: 0, rx: 0.02, rz: 0.016, oz: 0.02 },
        { t: 0.012, rx: 0.045, rz: 0.019, oz: 0.02, p: 3 },
        { t: 0.1, rx: 0.05, rz: 0.019, oz: 0.02, p: 3 },
        { t: 0.2, rx: 0.053, rz: 0.019, oz: 0.02, p: 3 },
        { t: 0.262, rx: 0.044, rz: 0.019, oz: 0.021, p: 3 },
        { t: 0.284, rx: 0.026, rz: 0.017, oz: 0.023, p: 2.6 },
        { t: 0.293, rx: 0.008, rz: 0.01, oz: 0.024 },
      ],
      22,
      [true, false],
    );
    P.shoe.push({ g: upper, w: rigid(n + 'Foot') });
    P.sole.push({ g: sole, w: rigid(n + 'Foot') });
    // ears
    const ear = new THREE.SphereGeometry(1, 12, 10);
    ear.scale(0.009, 0.029, 0.018);
    place(ear, V(s * 0.077, HTOP - 0.142, -0.008), new THREE.Euler(0, s * 0.14, 0));
    P.skin.push({ g: ear, w: rigid('Head') });
  }

  // --- neck (short: the jaw sits just above the collar)
  const neck = loft(
    V(0, 1.42, -0.012),
    Y,
    X,
    Z,
    [
      { t: 0, rx: 0.07, rz: 0.066 },
      { t: 0.05, rx: 0.062, rz: 0.06, oz: 0.003 },
      { t: 0.11, rx: 0.057, rz: 0.058, oz: 0.008 },
      { t: 0.17, rx: 0.055, rz: 0.057, oz: 0.013 },
      { t: 0.25, rx: 0.05, rz: 0.052, oz: 0.018 },
    ],
    18,
  );
  P.skin.push({
    g: neck,
    w: (_p, i) => {
      const t = neck.attributes.axisT.getX(i),
        a = sstep(0.01, 0.06, t),
        b = sstep(0.09, 0.17, t);
      return [
        [BI.Spine2, 1 - a],
        [BI.Neck, a * (1 - b)],
        [BI.Head, a * b],
      ].filter(x => x[1] > 0) as W;
    },
  });

  // --- head: lofted crown → chin with real planes (flat face, brow, cheekbones, square jaw, chin)
  const HEAD_RINGS: Ring[] = [
    { t: 0, rx: 0.016, rz: 0.02, oz: -0.014, p: 2.4 },
    { t: 0.01, rx: 0.054, rz: 0.066, oz: -0.014, p: 2.5 },
    { t: 0.03, rx: 0.071, rz: 0.089, oz: -0.012, p: 2.7 },
    { t: 0.06, rx: 0.077, rz: 0.097, oz: -0.008, p: 2.9 },
    { t: 0.095, rx: 0.077, rz: 0.098, oz: -0.002, p: 3.0 },
    { t: 0.105, rx: 0.076, rz: 0.099, oz: 0.001, p: 3.0 },
    { t: 0.125, rx: 0.075, rz: 0.096, oz: 0.0, p: 3.1 },
    { t: 0.148, rx: 0.075, rz: 0.094, oz: 0.002, p: 3.2 },
    { t: 0.172, rx: 0.072, rz: 0.089, oz: 0.004, p: 3.3 },
    { t: 0.196, rx: 0.067, rz: 0.082, oz: 0.008, p: 3.4 },
    { t: 0.214, rx: 0.058, rz: 0.071, oz: 0.014, p: 3.1 },
    { t: 0.228, rx: 0.04, rz: 0.049, oz: 0.028, p: 2.6 },
    { t: 0.236, rx: 0.014, rz: 0.016, oz: 0.04, p: 2.2 },
  ];
  const head = loft(V(0, HTOP, 0.008), V(0, -1, 0), X, Z, HEAD_RINGS, 40, [true, true]);
  P.face.push({ g: head, w: rigid('Head') });
  // nose: bridge → tip → nostril wings (uv points at the warm nose area of the face map)
  const FZ = 0.008 + 0.1; // front of the face plane
  const nose = loft(
    V(0, HTOP - 0.112, FZ - 0.01),
    V(0, -1, 0.0),
    X,
    Z,
    [
      { t: 0, rx: 0.0055, rz: 0.004, oz: 0.003 },
      { t: 0.02, rx: 0.0065, rz: 0.007, oz: 0.008 },
      { t: 0.042, rx: 0.0095, rz: 0.011, oz: 0.014 },
      { t: 0.055, rx: 0.0135, rz: 0.011, oz: 0.012 },
      { t: 0.062, rx: 0.012, rz: 0.007, oz: 0.007 },
      { t: 0.066, rx: 0.004, rz: 0.004, oz: 0.004 },
    ],
    14,
    [true, true],
  );
  {
    const uv = nose.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.25, 0.36);
  }
  P.face.push({ g: nose, w: rigid('Head') });
  const capped = (o.capStyle || 'back') !== 'none';
  // hair: same crown shape a touch larger, kept above the hairline (visible under the cap at sides/back)
  // Built ring by ring from the crown down to a smooth hairline (low at the nape, over the ears, sideburns, higher on
  // the forehead), so the edge is a clean line instead of cut-off polygons. Under a cap only the part below the band is made.
  const hairG = (() => {
    const ringAt = (t: number) => {
      let k = 0;
      while (k < HEAD_RINGS.length - 2 && HEAD_RINGS[k + 1].t < t) k++;
      const a = HEAD_RINGS[k],
        b = HEAD_RINGS[k + 1],
        f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))),
        m = (x?: number, y?: number, d = 0) => (x ?? d) + ((y ?? d) - (x ?? d)) * f;
      return { rx: m(a.rx, b.rx), rz: m(a.rz, b.rz), oz: m(a.oz, b.oz), p: m(a.p, b.p, 2) };
    };
    const SEG = 44,
      NJ = 12,
      t0 = capped ? 0.085 : 0,
      pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [],
      sm = (x: number) => x * x * (3 - 2 * x);
    for (let jj = 0; jj <= NJ; jj++)
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2,
          c = Math.cos(a),
          s = Math.sin(a),
          f = s; // f: +1 forehead, 0 sides, −1 nape
        let lim = f < 0 ? 0.128 + (0.192 - 0.128) * sm(-f) : 0.128 + (0.06 - 0.128) * sm(f);
        lim += 0.034 * Math.exp(-(((f - 0.3) / 0.13) ** 2)); // sideburns
        lim = Math.max(lim, t0);
        const k = jj / NJ,
          t = t0 + (lim - t0) * k,
          r = ringAt(t),
          e = 2 / r.p,
          edge = k > 0.9 ? 1 - (k - 0.9) * 0.25 : 1;
        const vol = (1.05 + 0.03 * (1 - k)) * edge * (!capped && jj === 0 ? 0 : 1),
          lift = capped ? 0 : 0.012 * (1 - k) ** 2; // uncapped: crown row collapses to a pole (no hole)
        const pad = vol ? 0.003 : 0;
        pos.push(
          (r.rx * vol + pad) * Math.sign(c) * Math.abs(c) ** e,
          HTOP + 0.006 + lift - t,
          0.008 + r.oz + (r.rz * vol + pad) * Math.sign(s) * Math.abs(s) ** e,
        );
        uv.push((i / SEG) * 2, k * 1.5);
      }
    for (let jj = 0; jj < NJ; jj++)
      for (let i = 0; i < SEG; i++) {
        const a = jj * (SEG + 1) + i,
          b = a + SEG + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    hg.setIndex(idx);
    fixWinding(hg, V(0, HTOP, 0.008), V(0, -1, 0));
    hg.computeVertexNormals();
    return hg;
  })();
  P.hair.push({ g: hairG, w: rigid('Head') });
  // backwards cap: crown follows the skull, sits tilted back; brim sticks out at the back
  const style = o.capStyle || 'back';
  // backwards: brim at the back, tilted back; forwards: turned round, brim shading the eyes
  const capTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(style === 'front' ? 0.1 : -0.2, style === 'front' ? Math.PI : 0, 0, 'YXZ')),
    capPivot = V(0, HTOP - 0.1, 0.008);
  const crownG = loft(
    V(0, HTOP + 0.01, 0.008),
    V(0, -1, 0),
    X,
    Z,
    HEAD_RINGS.slice(0, 6).map(r => ({ ...r, rx: r.rx * 1.08 + 0.004, rz: r.rz * 1.07 + 0.004 })),
    36,
    [true, false],
  );
  const brim = new THREE.CylinderGeometry(0.16, 0.16, 0.007, 24, 1, false, Math.PI * 0.66, Math.PI * 0.68);
  brim.scale(0.6, 1, 0.95);
  brim.translate(0, HTOP - 0.088, 0.008);
  const button = new THREE.SphereGeometry(0.008, 8, 6);
  button.translate(0, HTOP + 0.012, -0.008);
  if (style !== 'none')
    for (const cg of [crownG, brim, button]) {
      cg.translate(-capPivot.x, -capPivot.y, -capPivot.z);
      cg.applyQuaternion(capTilt);
      cg.translate(capPivot.x, capPivot.y, capPivot.z);
      cg.computeVertexNormals();
      P.cap.push({ g: cg, w: rigid('Head') });
    }

  const mats: Record<string, THREE.Material> = {};
  const geoms: Record<string, THREE.BufferGeometry> = {};
  for (const k of Object.keys(P) as (keyof typeof P)[]) {
    if (!P[k].length) continue;
    const set: ClothSet = sets[k];
    geoms[k] = finalize(P[k]);
    mats[k] = new THREE.MeshStandardMaterial({
      map: set.map,
      normalMap: set.normalMap,
      roughness: set.roughness,
      metalness: 0,
      normalScale: new THREE.Vector2(0.8, 0.8),
      side: k === 'cap' || k === 'hair' ? THREE.DoubleSide : THREE.FrontSide,
    });
  }
  return { geoms, mats };
}

// ---------------------------------------------------------------- club
export type ClubKind = 'driver' | 'wood' | 'iron' | 'wedge' | 'putter';
/** A golf club (asset-audit.md: no usable CC0 club models, so these are built in code). Stepped steel shaft, tapered
 *  rubber grip, a ferrule and hosel, and a head per club: a pear-shaped wood with a bright face and sole plate, a
 *  cavity-back iron or wedge with grooves, or a blade putter with a plumber's neck and a sight line. */
function buildClub(kind: ClubKind, L: number, lie: number, skin = '') {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#c3c7cc', metalness: 0.5, roughness: 0.32 }); // no environment map to reflect, so keep it part-diffuse or it renders black
  const satin = new THREE.MeshStandardMaterial({ color: '#aeb3b9', metalness: 0.45, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: '#1d1d1d', roughness: 0.9 });
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  // shaft: three steps narrowing toward the head, then the black ferrule
  const steps = [0.0062, 0.0056, 0.005, 0.0044],
    sl = (L - 0.03) / 3;
  for (let i = 0; i < 3; i++) add(g, new THREE.CylinderGeometry(steps[i], steps[i + 1], sl, 8).translate(0, -sl / 2 - i * sl, 0), steel);
  add(g, new THREE.CylinderGeometry(0.0052, 0.0064, 0.03, 8).translate(0, -L + 0.015, 0), dark);
  // grip: tapered, with a butt cap and a pale ring where it ends
  add(g, new THREE.CylinderGeometry(0.0125, 0.0092, 0.265, 10).translate(0, 0.012 - 0.1325, 0), grip);
  add(g, new THREE.SphereGeometry(0.0125, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.012, 0), grip);
  add(g, new THREE.CylinderGeometry(0.0094, 0.0094, 0.006, 10).translate(0, -0.256, 0), satin);
  // head built with its sole level when the shaft is at the address lie angle; face → +X, toe → +Z
  const head = new THREE.Group();
  head.position.y = -L;
  head.rotation.x = Math.PI / 2 - lie;
  g.add(head); // tilt by the shaft's angle from vertical so the sole sits flat at address
  if (kind === 'driver' || kind === 'wood') {
    const s = kind === 'driver' ? 1 : 0.76;
    const crown = new THREE.MeshStandardMaterial({ color: kind === 'driver' ? '#2c3138' : '#4a3328', metalness: 0.2, roughness: 0.3 });
    // pear-shaped body: a squashed sphere with a flat face, a flatter sole and a tail that tapers away from the face
    const geo = new THREE.SphereGeometry(1, 22, 14),
      pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      if (y < 0) y *= 0.72; // flatter underneath
      const back = Math.max(0, -x);
      z *= 1 - back * 0.22; // narrower toward the back
      y *= 1 - back * 0.3; // and lower
      if (x > 0.62) x = 0.62 + (x - 0.62) * 0.12; // the flat face
      pos.setXYZ(i, x * 0.05 * s, y * 0.03 * s, z * 0.058 * s);
    }
    geo.computeVertexNormals();
    const hx = -0.03 * s,
      hy = 0.0216 * s,
      hz = 0.052 * s;
    add(head, geo, crown, hx, hy, hz);
    // bright face insert with score lines, the sole plate, a sight mark on the crown
    const face = add(head, new THREE.BoxGeometry(0.002, 0.03 * s, 0.07 * s), satin, hx + 0.0318 * s, hy - 0.002 * s, hz);
    for (let k = -2; k <= 2; k++) add(face, new THREE.BoxGeometry(0.0004, 0.0007, 0.05 * s), dark, 0.0011, k * 0.005 * s, 0);
    add(head, new THREE.CylinderGeometry(0.032 * s, 0.03 * s, 0.002, 14), satin, hx - 0.004 * s, 0.001, hz).scale.set(1.15, 1, 1.4);
    add(
      head,
      new THREE.BoxGeometry(0.008 * s, 0.0006, 0.002),
      new THREE.MeshBasicMaterial({ color: '#f2f2f2' }),
      hx + 0.016 * s,
      hy + 0.0292 * s,
      hz,
    );
    // hosel up into the shaft
    add(g, new THREE.CylinderGeometry(0.0062, 0.0078, 0.05 * s, 8).translate(0, -L + 0.022 * s, 0), crown);
  } else if (kind === 'putter' && skin) {
    // the Attic putters: the shaft and grip above stay; the head is the joke
    const M = (c: string, m = 0, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r });
    if (skin === 'hockey') {
      // a hockey stick's blade, taped
      const wood = M('#b07a45');
      add(head, new THREE.BoxGeometry(0.008, 0.03, 0.13), wood, 0, 0.015, 0.055).rotation.x = 0.08;
      add(head, new THREE.BoxGeometry(0.009, 0.026, 0.07), M('#1a1a1c', 0, 0.9), 0, 0.015, 0.07);
      add(g, new THREE.BoxGeometry(0.016, 0.3, 0.01).translate(0, -L + 0.15, 0), wood);
    } else if (skin === 'broom') {
      // a kitchen broom: a bound bundle of straw
      const straw = M('#d8b860', 0, 0.95);
      add(head, new THREE.BoxGeometry(0.03, 0.05, 0.14), straw, -0.004, 0.025, 0.05);
      add(head, new THREE.BoxGeometry(0.034, 0.008, 0.144), M('#c8452f'), -0.004, 0.046, 0.05);
      add(head, new THREE.BoxGeometry(0.034, 0.006, 0.144), M('#c8452f'), -0.004, 0.034, 0.05);
      add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.4, 8).translate(0, -L + 0.22, 0), M('#9a6a3a'));
    } else if (skin === 'wrench') {
      // a golden adjustable wrench, jaw down
      const gold = M('#e0b040', 0.9, 0.25);
      add(head, new THREE.BoxGeometry(0.018, 0.016, 0.11), gold, -0.004, 0.008, 0.05);
      const jaw = add(head, new THREE.TorusGeometry(0.022, 0.008, 8, 14, Math.PI * 1.3), gold, -0.004, 0.022, 0.1);
      jaw.rotation.y = Math.PI / 2;
      add(g, new THREE.BoxGeometry(0.014, 0.35, 0.006).translate(0, -L + 0.17, 0), gold);
    } else {
      // a pink lawn flamingo on the end, looking at the ball
      const pink = M('#ff6fae', 0.1, 0.4);
      add(head, new THREE.SphereGeometry(0.03, 12, 8).scale(1, 0.6, 1.6), pink, -0.006, 0.02, 0.05);
      const neck = add(head, new THREE.TorusGeometry(0.03, 0.006, 6, 10, Math.PI), pink, 0.004, 0.035, 0.09);
      neck.rotation.y = Math.PI / 2;
      add(head, new THREE.SphereGeometry(0.009, 8, 6), pink, 0.012, 0.038, 0.12);
      add(head, new THREE.ConeGeometry(0.004, 0.016, 6), M('#1a1a1c'), 0.02, 0.034, 0.12).rotation.z = -1.6;
      add(g, new THREE.CylinderGeometry(0.0046, 0.0046, 0.04, 8).translate(0, -L + 0.02, 0), pink);
    }
  } else if (kind === 'putter') {
    // blade: a low bar with heel and toe weights, a cavity, a white sight line, and an offset plumber's neck
    add(head, new THREE.BoxGeometry(0.02, 0.024, 0.11), satin, -0.004, 0.012, 0.05);
    add(head, new THREE.BoxGeometry(0.03, 0.012, 0.11), satin, -0.012, 0.006, 0.05);
    for (const z of [0.008, 0.092]) add(head, new THREE.BoxGeometry(0.028, 0.02, 0.022), steel, -0.012, 0.01, z);
    add(head, new THREE.BoxGeometry(0.014, 0.0006, 0.002), new THREE.MeshBasicMaterial({ color: '#f2f2f2' }), -0.006, 0.0244, 0.05);
    add(head, new THREE.BoxGeometry(0.0006, 0.018, 0.06), dark, 0.0061, 0.012, 0.05); // face insert
    add(g, new THREE.CylinderGeometry(0.0045, 0.0045, 0.04, 8).translate(0, -L + 0.02, 0), steel);
    add(head, new THREE.BoxGeometry(0.008, 0.008, 0.02), steel, 0, 0.024, 0.008);
  } else {
    // iron / wedge: a blade taller at the toe, leaning back by its loft, with a cavity back and grooves
    const wedge = kind === 'wedge',
      loft = wedge ? 0.9 : 0.45,
      Hh = wedge ? 0.05 : 0.046,
      len = wedge ? 0.08 : 0.076;
    const sh = new THREE.Shape(); // in the blade's own plane: u = heel → toe, v = sole → top line
    sh.moveTo(0.004, 0);
    sh.quadraticCurveTo(len * 0.5, -0.004, len - 0.006, 0.002);
    sh.quadraticCurveTo(len + 0.004, 0.012, len, Hh * 0.72);
    sh.quadraticCurveTo(len - 0.004, Hh + 0.002, len - 0.02, Hh);
    sh.lineTo(0.006, Hh * 0.55);
    sh.quadraticCurveTo(-0.002, Hh * 0.3, 0.004, 0);
    const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.007, bevelEnabled: true, bevelSize: 0.0012, bevelThickness: 0.0012, bevelSegments: 1 });
    blade.rotateY(-Math.PI / 2); // u → +Z (toe), thickness → −X (back)
    const lean = new THREE.Group();
    lean.position.set(0.004, 0.0015, 0.006);
    lean.rotation.z = loft; // top line back, face up toward the target
    head.add(lean);
    add(lean, blade, steel);
    // cavity back and a thicker sole
    add(lean, new THREE.BoxGeometry(0.002, Hh * 0.42, len * 0.62), dark, -0.0086, Hh * 0.46, len * 0.52);
    add(lean, new THREE.BoxGeometry(wedge ? 0.016 : 0.012, 0.01, len * 0.86), satin, -0.007, 0.005, len * 0.5);
    for (let k = 0; k < 5; k++) add(lean, new THREE.BoxGeometry(0.0004, 0.0006, len * 0.46), dark, 0.0013, 0.007 + k * 0.0045, len * 0.56); // grooves
    // hosel: from the heel up into the shaft
    add(g, new THREE.CylinderGeometry(0.0058, 0.0068, 0.055, 8).translate(0, -L + 0.026, 0), steel);
  }
  g.traverse(o => {
    (o as THREE.Mesh).castShadow = true;
  });
  return g;
}
const CLUB_SPEC: Record<ClubKind, { L: number; hy: number; plane: number; ball: number }> = {
  // shaft length from the top hand to the clubhead; plane = shaft angle from vertical at address
  // hy = hand height at address. The shaft angle ('plane') is solved from it so the sole rests exactly on the ground.
  driver: { L: 1.08, hy: 0.81, plane: Math.acos(0.81 / 1.08), ball: 0.025 },
  wood: { L: 1.0, hy: 0.79, plane: Math.acos(0.79 / 1.0), ball: 0.025 },
  iron: { L: 0.9, hy: 0.79, plane: Math.acos(0.79 / 0.9), ball: 0.03 },
  wedge: { L: 0.87, hy: 0.79, plane: Math.acos(0.79 / 0.87), ball: 0.03 },
  putter: { L: 0.9, hy: 0.84, plane: Math.acos(0.84 / 0.9), ball: 0.029 },
};

// ---------------------------------------------------------------- pose keys
// s: 0 address · 1 top · 2 impact · 3 finish.  a = hands angle round the swing circle, w = wrist hinge,
// ty = torso (shoulder) turn, hy = hip turn, sx = hip slide toward target, up = spine straightening.
const KEYS = {
  s: [0, 0.5, 1, 1.55, 2, 2.45, 3, 3.12],
  a: [0, 0, 0, 0, 0, 0, 0, 0],
  w: [0, 0, 0, 0, 0, 0, 0, 0],
  // big shoulder turn over a resisting lower body, hips lead the downswing and are well open at impact, chest to target in the finish
  // 3.12 is a slight over-rotation the follow-through swings into before settling back to the held finish (3)
  ty: [0, -0.65, -1.6, -0.75, 0.25, 1.2, 1.95, 2.06],
  hy: [0, -0.2, -0.55, -0.15, 0.65, 1.2, 1.6, 1.68],
  sx: [0, -0.015, -0.03, 0.03, 0.06, 0.085, 0.095, 0.1],
  up: [0, 0, 0.04, 0.02, 0, 0.22, 0.46, 0.49],
};
// hands (local, metres) and shaft direction u (grip → head) / face direction f, keyed through the swing
const HK = {
  s: [0, 0.5, 0.75, 1, 1.55, 2, 2.45, 2.75, 3, 3.12],
  H: [
    [0.04, 0.76, 0.33],
    [-0.3, 0.95, 0.28],
    [-0.33, 1.2, 0.18],
    [-0.24, 1.36, -0.04],
    [-0.2, 1.05, 0.27],
    [0.06, 0.74, 0.33],
    [0.46, 0.98, 0.2],
    [0.28, 1.32, -0.1],
    [-0.06, 1.45, -0.28],
    [-0.1, 1.42, -0.29],
  ],
  U: [
    null,
    [-1, 0.05, 0.05],
    [-0.35, 0.92, -0.15],
    [0.82, -0.14, -0.56],
    [-0.55, 0.75, -0.3],
    null,
    [1, 0.05, -0.1],
    [0.08, 0.88, -0.48],
    [-0.55, -0.55, -0.45],
    [-0.55, -0.62, -0.42],
  ],
  F: [
    [1, 0, 0],
    [0, 0.1, 1],
    [0.2, 0, 1],
    [0.15, 0.55, 0.8],
    [0.35, 0, 1],
    [1, 0, 0],
    [0, 0.2, -1],
    [-0.2, 0, -1],
    [0, 0.5, -1],
    [0, 0.5, -1],
  ],
} as { s: number[]; H: number[][]; U: (number[] | null)[]; F: number[][] };
const SPINE_AXIS = new THREE.Vector3(0, Math.cos(0.45), Math.sin(0.45)),
  SPINE_PIVOT = new THREE.Vector3(0, 1.0, -0.06);
const KEYS_TY_AT = HK.s.map(s => key(KEYS.ty, s));
const TRUNK = new Set(['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']);
/** swing phase s (0 address, 1 top, 2 impact, 3 finish) → time in a captured swing */
function clipTime(ev: Record<string, number>, s: number) {
  const T = [ev.address, ev.top, ev.impact, ev.finish],
    i = Math.max(0, Math.min(2, Math.floor(s))),
    f = Math.max(0, Math.min(1, s - i));
  return T[i] + (T[i + 1] - T[i]) * f;
}
/** how far the captured hips move between two times of a clip */
function clipDelta(c: Clip, t0: number, t1: number) {
  const at = (t: number) => {
    const x = Math.max(0, Math.min(c.n - 1.001, t * c.fps)),
      i = Math.floor(x),
      w = x - i,
      a = c.hips[i],
      b = c.hips[Math.min(c.n - 1, i + 1)];
    return [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * w);
  };
  const A = at(t0),
    B = at(t1);
  return [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
}
/** how far the captured hips have moved since address (metres, our rig's frame) */
function clipHipsDelta(c: Clip, t: number) {
  const fa = Math.min(c.n - 1, c.ev!.address * c.fps),
    f = Math.min(c.n - 1, t * c.fps),
    at = (x: number) => {
      const i = Math.floor(x),
        w = x - i,
        a = c.hips[i],
        b = c.hips[Math.min(c.n - 1, i + 1)];
      return [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * w);
    };
  const A = at(fa),
    B = at(f);
  return [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
}
function keyN(rows: number[][], s: number, S = HK.s) {
  if (s <= S[0]) return rows[0].slice();
  if (s >= S[S.length - 1]) return rows[rows.length - 1].slice();
  let i = 0;
  while (s > S[i + 1]) i++;
  const t = (s - S[i]) / (S[i + 1] - S[i]),
    p0 = rows[Math.max(0, i - 1)],
    p1 = rows[i],
    p2 = rows[i + 1],
    p3 = rows[Math.min(rows.length - 1, i + 2)],
    t2 = t * t,
    t3 = t2 * t;
  return p1.map(
    (_, k) =>
      0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
  );
}
function key(arr: number[], s: number) {
  const S = KEYS.s;
  if (s <= S[0]) return arr[0];
  if (s >= S[S.length - 1]) return arr[arr.length - 1];
  let i = 0;
  while (s > S[i + 1]) i++;
  const t = (s - S[i]) / (S[i + 1] - S[i]),
    p0 = arr[Math.max(0, i - 1)],
    p1 = arr[i],
    p2 = arr[i + 1],
    p3 = arr[Math.min(arr.length - 1, i + 2)];
  const t2 = t * t,
    t3 = t2 * t; // Catmull-Rom
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// ---------------------------------------------------------------- IK
const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _m = new THREE.Vector3(),
  _e = new THREE.Vector3();
function wpos(b: THREE.Object3D, out: THREE.Vector3) {
  return out.setFromMatrixPosition(b.matrixWorld);
}
/** Rotate `bone` (world) so the direction to `child` points along `to - bonePos`. */
function aim(bone: THREE.Bone, child: THREE.Object3D, to: THREE.Vector3) {
  bone.updateMatrixWorld(true);
  wpos(bone, _a);
  wpos(child, _b);
  const from = _b.sub(_a).normalize(),
    dir = _c.copy(to).sub(_a).normalize();
  _q.setFromUnitVectors(from, dir);
  bone.getWorldQuaternion(_q2);
  _q2.premultiply(_q);
  setWorldQuat(bone, _q2);
}
function setWorldQuat(bone: THREE.Object3D, wq: THREE.Quaternion) {
  const pq = new THREE.Quaternion();
  bone.parent!.getWorldQuaternion(pq);
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateMatrixWorld(true);
}
function twoBone(up: THREE.Bone, mid: THREE.Bone, end: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number) {
  up.updateMatrixWorld(true);
  const A = wpos(up, new THREE.Vector3()),
    d = target.clone().sub(A),
    dist = THREE.MathUtils.clamp(d.length(), 0.05, (l1 + l2) * 0.999);
  d.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1),
    sinA = Math.sqrt(1 - cosA * cosA);
  const pd = pole.clone().sub(A);
  pd.addScaledVector(d, -pd.dot(d));
  if (pd.lengthSq() < 1e-8) pd.set(0, 0, 1);
  pd.normalize();
  _m.copy(A)
    .addScaledVector(d, l1 * cosA)
    .addScaledVector(pd, l1 * sinA);
  _e.copy(A).addScaledVector(d, dist);
  const midT = _m.clone(),
    endT = _e.clone();
  aim(up, mid, midT);
  aim(mid, end, endT);
}

// ---------------------------------------------------------------- the rig
const sm01 = (x: number) => x * x * (3 - 2 * x);
/** Length of one step at a given speed (m): shared by the gait above and whoever advances the walk phase. */
export function stepLength(sp: number) {
  return sp <= 1.6 ? 0.72 : sp <= 3.4 ? 0.72 + ((sp - 1.6) / 1.8) * 0.43 : 1.15 + ((sp - 3.4) / 2.6) * 0.65;
}
const _lodV = new THREE.Vector3();
export type GestureKind = 'wave' | 'point' | 'thumb';
/** Where the right hand goes (golfer's own space: −x is their right, +z ahead), which way the elbow points, how the
 *  hand turns, and which fingers stay straight (the rest make a fist when `fist`, else hang loose). */
export const GESTURES: Record<GestureKind, { hand: number[]; pole: number[]; rot: number[]; open: string[]; fist: boolean }> = {
  wave: { hand: [-0.44, 1.76, 0.14], pole: [-0.95, 1.0, 0.0], rot: [0, 0, 0], open: ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'], fist: false },
  point: { hand: [-0.2, 1.4, 0.9], pole: [-0.7, 0.9, 0.1], rot: [0, 0, 0], open: ['Index'], fist: true },
  thumb: { hand: [-0.24, 1.34, 0.4], pole: [-0.8, 0.8, 0.0], rot: [0, 0, -1.3], open: ['Thumb'], fist: true },
};
const REST_CURL: Record<string, number[]> = { Index: [0.2, 0.3, 0.18], Middle: [0.3, 0.42, 0.24], Ring: [0.4, 0.5, 0.28], Pinky: [0.5, 0.56, 0.3] };
// ---------------------------------------------------------------- level of detail
// Far golfers are drawn with fewer triangles: the same vertices, skin weights and textures, with a shorter list of
// triangles made by meshoptimizer's simplifier (so nothing new is stored or downloaded). Level 0 is full detail,
// level 1 (past LOD_NEAR metres) is about a third of the triangles with the tiny parts hidden, level 2 (past LOD_FAR)
// also stops casting a shadow. A golfer picks its level from how far the camera drawing it is.
const LOD_NEAR = 15,
  LOD_FAR = 42,
  LOD_KEEP = 0.34,
  LOD_TINY = /^(brows|lashes|eyes|sock|glasses|lenses|bling|strap|tie)$/;
const lowIndexCache = new WeakMap<object, THREE.BufferAttribute>();
function lowGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.index;
  if (!idx || idx.count < 900 || !MeshoptSimplifier.supported) return g;
  let low = lowIndexCache.get(idx.array);
  if (!low) {
    const pos = g.attributes.position,
      src = idx.array instanceof Uint32Array ? idx.array : new Uint32Array(idx.array),
      target = Math.max(300, Math.floor((idx.count * LOD_KEEP) / 3) * 3);
    const [out] = MeshoptSimplifier.simplify(src, pos.array as Float32Array, 3, target, 0.03);
    low = new THREE.BufferAttribute(pos.count < 65536 ? new Uint16Array(out) : out, 1);
    lowIndexCache.set(idx.array, low);
  }
  const lg = new THREE.BufferGeometry();
  for (const k of Object.keys(g.attributes)) lg.setAttribute(k, g.attributes[k]);
  lg.setIndex(low);
  return lg;
}
export interface SwingInput {
  mode: 'idle' | 'swing' | 'putt' | 'walk' | 'sit' | 'stand' | 'skate';
  ik?: { hands?: [THREE.Vector3, THREE.Vector3]; feet?: [THREE.Vector3, THREE.Vector3] };
  air?: number;
  speed?: number;
  phase?: number;
  turn?: number;
  showClub?: boolean;
  s: number;
  s2?: number;
  blend?: number;
  club: ClubKind;
  time: number;
  power?: number;
}
export class Golfer {
  readonly root = new THREE.Group();
  readonly bones: THREE.Bone[] = [];
  private by: Record<string, THREE.Bone> = {};
  private clubs: Partial<Record<ClubKind, THREE.Group>> = {};
  private meshes: Record<string, THREE.SkinnedMesh> = {};
  private clubKind: ClubKind = 'iron';
  private len: Record<string, number> = {};
  /** where the ball sits relative to the golfer's feet (local, facing +Z, target +X) for the current club */
  ballLocal = V(0, 0, 0.62);
  reachErr = [0, 0];
  /** live-tunable rig constants (exposed for the dev preview) */
  tune = {
    thumbA: -0.5,
    thumbAR: -0.8,
    thumbC: 0.9,
    thumbCR: 0.6,
    rollL: 0.95,
    rollR: -0.95,
    gripTilt: -0.8,
    curlX: 0.014,
    curlY: -0.075,
    poleL: V(0.45, -0.3, -0.25),
    poleR: V(-0.35, -0.6, -0.1),
  };

  /** This golfer's own joint positions when its body type isn't the default one. */
  private bind: Record<string, THREE.Vector3> | null = null;
  /** this golfer's putter skin ('' = the plain blade) */
  putterSkin = '';
  constructor(outfit: Outfit = DEFAULT_OUTFIT) {
    this.putterSkin = outfit.putter || '';
    const own = mhBindFor(outfit.body);
    if (own) {
      this.bind = {};
      for (const k in own) this.bind[k] = new THREE.Vector3(own[k][0], own[k][1], own[k][2]);
    }
    CUR = this.bind;
    for (const [name, parent, p] of BIND) {
      const b = new THREE.Bone();
      b.name = name;
      const pp = parent ? BPOS(parent) : V(0, 0, 0);
      b.position.copy(BPOS(name)).sub(pp);
      void p;
      (parent ? this.by[parent] : null)?.add(b);
      this.by[name] = b;
      this.bones.push(b);
    }
    this.root.add(this.by.Hips);
    this.root.updateMatrixWorld(true); // bind inverses need world matrices
    const skel = new THREE.Skeleton(this.bones);
    const { geoms, mats } = Golfer.bodyFor(outfit);
    for (const k of Object.keys(geoms)) {
      const m = new THREE.SkinnedMesh(geoms[k], mats[k]);
      m.name = 'golfer_' + k;
      this.meshes[k] = m;
      m.castShadow = m.receiveShadow = true;
      if (/^(brows|lashes|eyes|sock|glasses|lenses|bling|strap|tie)$/.test(k)) m.castShadow = false; // too small to matter in a shadow
      m.frustumCulled = false;
      m.bind(skel, new THREE.Matrix4());
      this.root.add(m);
    }
    // level of detail: whichever mesh is drawn first tells us how far the camera is (not the shadow pass: its camera isn't a perspective one)
    const first = this.meshes[Object.keys(geoms).find(k => !LOD_TINY.test(k)) || ''];
    if (first)
      first.onBeforeRender = (_r, _s, cam) => {
        if (!(cam as THREE.PerspectiveCamera).isPerspectiveCamera) return;
        const d = cam.position.distanceTo(this.root.getWorldPosition(_lodV)),
          L = this.lod,
          want = d > LOD_FAR + (L === 2 ? -4 : 0) ? 2 : d > LOD_NEAR + (L >= 1 ? -2 : 0) ? 1 : 0; // a little slack so it doesn't flicker at the boundary
        lodCount[want]++;
        if (want !== L) this.setLod(want);
      };
    for (const s of ['Left', 'Right']) {
      this.len[s + 'Arm'] = BPOS(s + 'Arm').distanceTo(BPOS(s + 'ForeArm'));
      this.len[s + 'Fore'] = BPOS(s + 'ForeArm').distanceTo(BPOS(s + 'Hand'));
      this.len[s + 'Up'] = BPOS(s + 'UpLeg').distanceTo(BPOS(s + 'Leg'));
      this.len[s + 'Low'] = BPOS(s + 'Leg').distanceTo(BPOS(s + 'Foot'));
    }
    this.setClub('iron');
  }
  private lod = 0;
  private full: Record<string, THREE.BufferGeometry> = {};
  private low: Record<string, THREE.BufferGeometry> = {};
  /** 0 full detail · 1 light (about a third of the triangles, tiny parts hidden) · 2 far (light, and no shadow). */
  setLod(level: number) {
    this.lod = level;
    for (const k of Object.keys(this.meshes)) {
      const m = this.meshes[k];
      if (!(m as THREE.SkinnedMesh).isSkinnedMesh || k === 'gripHands' || k === 'openHands') continue;
      if (!this.full[k]) this.full[k] = m.geometry;
      if (level > 0 && !this.low[k]) this.low[k] = lowGeometry(this.full[k]);
      m.geometry = level > 0 ? this.low[k] : this.full[k];
      if (LOD_TINY.test(k)) m.visible = level === 0;
      else m.castShadow = level < 2;
    }
  }
  /** MakeHuman body (with its own hands and finger bones) when it's loaded, else the procedural one. */
  static bodyFor(o: Outfit) {
    const proc = buildBody(o);
    if (!mhReady()) return proc;
    const mh = buildBodyMH(o);
    for (const k in proc.geoms) proc.geoms[k].dispose();
    return mh;
  }
  /** Fetch the MakeHuman golfer (call once before creating golfers). Its skeleton becomes the rig's bind pose. */
  static async load(baseUrl: string) {
    const ok = await loadGolferAssets(
      baseUrl,
      BIND.map(b => b[0]),
    );
    if (ok)
      try {
        // the player's own body type, so their golfer is right from the first frame
        const mine = JSON.parse(localStorage.getItem('gh.look.v1') || '{}')?.body;
        if (mine) await loadBody(mine);
      } catch {}
    try {
      await MeshoptSimplifier.ready; // the simplifier that makes far golfers' lighter meshes
    } catch {}
    const bind = ok ? mhBind() : null;
    if (bind)
      for (const b of BIND) {
        const p = bind[b[0]];
        if (p) b[2].set(p[0], p[1], p[2]);
      }
    return ok;
  }
  /** Curl the fingers: 1 = wrapped round a grip, 0 = relaxed. Thumb tucks along the shaft. No-op without finger axes. */
  private fingers(grip: number) {
    const C = mhCurl();
    if (!C) return;
    for (const n of ['Left', 'Right'])
      for (const f of FINGERS)
        for (let j = 1; j <= 3; j++) {
          const b = this.by[`${n}Hand${f}${j}`],
            ax = C[`${n}Hand${f}${j}`];
          if (!b || !ax) continue;
          const g = f === 'Thumb' ? [0.9, 0.35, 0.25][j - 1] : [1.25, 1.45, 0.9][j - 1] * (f === 'Index' ? 0.92 : 1);
          // at rest a hand hangs half-closed, and more so toward the little finger (straight, even fingers look like a mannequin's)
          const r = f === 'Thumb' ? [0.16, 0.22, 0.16][j - 1] : REST_CURL[f][j - 1];
          b.quaternion.setFromAxisAngle(_ax.set(ax[0], ax[1], ax[2]), r + (g - r) * grip);
          if (f === 'Thumb' && j === 1) {
            // swing the thumb across the hand (about the hand's own axis) to lie along the shaft
            const s = n === 'Left' ? 1 : -1,
              ad = _ad.set(s * Math.sin(ARM_TILT), -Math.cos(ARM_TILT), 0);
            b.quaternion
              .setFromAxisAngle(ad, (s > 0 ? this.tune.thumbA : -this.tune.thumbAR) * grip)
              .multiply(_q1.setFromAxisAngle(_ax.set(ax[0], ax[1], ax[2]), 0.1 + ((s > 0 ? this.tune.thumbC : this.tune.thumbCR) - 0.1) * grip));
          }
        }
  }
  /** Sample a motion-capture clip at time t (seconds) into the bones (local rotations; hips moved relative to frame 0).
   *  only: limit to these bones. Returns false if the clip isn't loaded. */
  poseClip(name: string, t: number, only?: Set<string>, hipsW = 1) {
    CUR = this.bind;
    const c = mhClip(name);
    if (!c) return false;
    const f = Math.max(0, Math.min(c.n - 1.001, t * c.fps)),
      i = Math.floor(f),
      w = f - i,
      B = c.bones.length;
    const a = c.q[i],
      b = c.q[Math.min(c.n - 1, i + 1)];
    for (let k = 0; k < B; k++) {
      const bn = c.bones[k];
      if (only && !only.has(bn)) continue;
      const bone = this.by[bn];
      if (!bone) continue;
      _qa.set(a[k * 4], a[k * 4 + 1], a[k * 4 + 2], a[k * 4 + 3]);
      _qb.set(b[k * 4], b[k * 4 + 1], b[k * 4 + 2], b[k * 4 + 3]);
      bone.quaternion.copy(_qa).slerp(_qb, w);
    }
    if (hipsW > 0) {
      const h0 = c.hips[0],
        ha = c.hips[i],
        hb = c.hips[Math.min(c.n - 1, i + 1)];
      this.by.Hips.position.set(
        BPOS('Hips').x + (ha[0] + (hb[0] - ha[0]) * w - h0[0]) * hipsW,
        BPOS('Hips').y + (ha[1] + (hb[1] - ha[1]) * w - h0[1]),
        BPOS('Hips').z + (ha[2] + (hb[2] - ha[2]) * w - h0[2]) * hipsW,
      );
    }
    return true;
  }
  /** Raw clip playback (dev preview): whole body from the clip, feet put on the ground. */
  playRaw(name: string, t: number) {
    for (const b of this.bones) b.quaternion.identity();
    this.fingers(0);
    if (this.poseClip(name, t)) {
      this.root.updateMatrixWorld(true);
      this.plantFeet();
    }
  }
  /** Bone by Mixamo name (for the ragdoll). */
  bone(name: string) {
    return this.by[name];
  }
  /** Bind-pose position of a bone, in the golfer's local space. */
  static bindPos(name: string) {
    return BPOS(name).clone();
  }
  /** Limp: no club, relaxed open hands (ragdoll / getting up). */
  limp() {
    this.fingers(0);
    for (const k in this.clubs) this.clubs[k as ClubKind]!.visible = false;
    if (this.meshes.gripHands) this.meshes.gripHands.visible = false;
    if (this.meshes.openHands) this.meshes.openHands.visible = true;
  }
  /** Free the per-golfer geometry (textures are shared and kept). */
  dispose() {
    this.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.root.removeFromParent();
  }
  setClub(kind: ClubKind) {
    this.clubKind = kind;
    if (!this.clubs[kind]) {
      const sp = CLUB_SPEC[kind];
      const c = buildClub(kind, sp.L, Math.PI / 2 - sp.plane, kind === 'putter' ? this.putterSkin : '');
      c.visible = false;
      this.root.add(c);
      this.clubs[kind] = c;
    }
    for (const k in this.clubs) this.clubs[k as ClubKind]!.visible = k === kind;
  }
  private plane(kind: ClubKind) {
    const sp = CLUB_SPEC[kind],
      putt = kind === 'putter';
    // hands at address: just inside the lead thigh, under the shoulders
    const H0 = V(0.04, sp.hy, putt ? 0.28 : 0.31);
    const v = V(0, Math.cos(sp.plane), -Math.sin(sp.plane)); // up the shaft plane, toward the golfer
    const ball = H0.clone().addScaledVector(v, -sp.L);
    ball.y = 0.021;
    ball.x += sp.ball;
    // the ball sits just in front of the middle of the face (toward the target, out toward the toe), not at the hosel
    const wood = kind === 'driver' || kind === 'wood';
    ball.z += putt ? 0.045 : wood ? 0.05 : 0.035;
    void wood; // ball.x: sp.ball = just ahead of the face
    return { H0, v, ball, R: putt ? 0.35 : 0.6, L: sp.L };
  }
  /** One-shot motion clips (picking the ball out, a cheer, teeing up) played over whatever the body is doing. */
  private idleSeed = Math.random() * 20;
  private once: { q: string[]; t0: number; first: boolean } | null = null;
  playOnce(...names: string[]) {
    const q = names.filter(n => mhClip(n));
    this.once = q.length ? { q, t0: NaN, first: true } : null;
  }
  /** a one-shot clip is playing */
  busy() {
    return !!this.once;
  }
  /** seconds of one-shot clips still to play (for timing what comes after) */
  static clipLength(...names: string[]) {
    return names.reduce((t, n) => {
      const c = mhClip(n);
      return t + (c?.ev ? c.ev.to - c.ev.from : 0);
    }, 0);
  }
  /** Pose the whole body for this frame. */
  update(inp: SwingInput) {
    CUR = this.bind;
    // starting a swing cancels a one-shot clip
    if (this.once && (inp.mode === 'swing' || inp.mode === 'putt') && (inp.s ?? 0) > 0.03) this.once = null;
    this.updateBase(inp);
    if (!this.once) return;
    const o = this.once,
      c = mhClip(o.q[0]);
    if (!c?.ev) {
      this.once = null;
      return;
    }
    if (isNaN(o.t0)) o.t0 = inp.time;
    const el = inp.time - o.t0,
      dur = c.ev.to - c.ev.from;
    if (el >= dur) {
      o.q.shift();
      o.t0 = NaN;
      o.first = false;
      if (!o.q.length) this.once = null;
      return;
    }
    const fade = Math.min(1, o.first ? el / 0.3 : 1, o.q.length > 1 ? 1 : (dur - el) / 0.3); // fade in at the start of the queue, out at its end
    const hp = this.by.Hips.position.clone();
    this.poseClipBlend(o.q[0], c.ev.from + el, fade);
    // hips: the clip's own movement since its start, faded in
    const d = clipDelta(c, c.ev.from, c.ev.from + el);
    this.by.Hips.position.set(hp.x + d[0] * fade, hp.y + d[1] * fade, hp.z + d[2] * fade);
    for (const k in this.clubs) this.clubs[k as ClubKind]!.visible = false;
    this.fingers(0.15);
    this.root.updateMatrixWorld(true);
    this.plantFeet();
  }
  private poseClipBlend(name: string, t: number, w: number) {
    const c = mhClip(name)!,
      f = Math.max(0, Math.min(c.n - 1.001, t * c.fps)),
      i = Math.floor(f),
      x = f - i,
      a = c.q[i],
      b = c.q[Math.min(c.n - 1, i + 1)];
    for (let k = 0; k < c.bones.length; k++) {
      const bone = this.by[c.bones[k]];
      if (!bone) continue;
      _qa.set(a[k * 4], a[k * 4 + 1], a[k * 4 + 2], a[k * 4 + 3]);
      _qb.set(b[k * 4], b[k * 4 + 1], b[k * 4 + 2], b[k * 4 + 3]);
      bone.quaternion.slerp(_qc.copy(_qa).slerp(_qb, x), w);
    }
  }
  private updateBase(inp: SwingInput) {
    const by = this.by,
      putt = inp.club === 'putter',
      kind = inp.club;
    if (kind !== this.clubKind) this.setClub(kind);
    for (const b of this.bones) b.quaternion.identity();
    by.Hips.position.copy(BPOS('Hips'));
    const t = inp.time,
      breathe = Math.sin(t * 1.7) * 0.012;

    const gripping = inp.mode === 'swing' || inp.mode === 'putt'; // closed grip on the club, otherwise relaxed open hands
    this.fingers(gripping ? 1 : inp.mode === 'sit' || inp.mode === 'stand' ? 0.85 : inp.mode === 'skate' ? 0.3 : 0); // round the grip / the steering wheel / relaxed
    if (this.meshes.gripHands) this.meshes.gripHands.visible = gripping;
    if (this.meshes.openHands) this.meshes.openHands.visible = !gripping;
    const showClub = inp.showClub !== false && gripping;
    for (const k in this.clubs) this.clubs[k as ClubKind]!.visible = showClub && k === this.clubKind;
    if (inp.mode === 'walk') {
      this.walk(inp);
      return;
    }
    if (inp.mode === 'sit' || inp.mode === 'stand' || inp.mode === 'skate') {
      this.ride(inp);
      return;
    }
    if (inp.mode === 'idle') {
      by.Hips.position.y -= 0.01;
      by.Spine.rotation.set(0.03 + breathe, 0, 0);
      by.Spine2.rotation.set(-0.02 - breathe * 0.6, 0, 0);
      by.Head.rotation.set(0.05, Math.sin(t * 0.37) * 0.25, 0);
      for (const [s, n] of [
        [1, 'Left'],
        [-1, 'Right'],
      ] as [number, string][]) {
        by[n + 'Arm'].rotation.set(0.08, 0, -s * 0.06);
        by[n + 'ForeArm'].rotation.set(-0.25, 0, 0);
        by[n + 'Hand'].rotation.set(0, 0, s * 0.05);
        by[n + 'UpLeg'].rotation.set(0, 0, s * 0.03);
        by[n + 'Foot'].rotation.set(0, s * 0.15, 0);
      }
      // club rests against the right leg
      const c = this.clubs[this.clubKind]!;
      c.position.set(-0.24, 0.95, 0.1);
      c.rotation.set(0.15, 0, -0.12);
      this.plantFeet();
      return;
    }

    // Two poses can be cross-faded (s → s2 by blend): the transition at the top blends the end of the backswing into
    // the start of the downswing, so the hips start forward while the club is still finishing going back.
    const sA = inp.s,
      sB = putt ? inp.s : (inp.s2 ?? inp.s),
      bw = putt ? 0 : (inp.blend ?? 0),
      mix = (a: number, b: number) => a + (b - a) * bw;
    const s = mix(sA, sB),
      P = this.plane(kind);
    this.ballLocal.copy(P.ball);
    const kOf = (x: number) => ({ a: 0, w: 0, ty: key(KEYS.ty, x), hy: key(KEYS.hy, x), sx: key(KEYS.sx, x), up: key(KEYS.up, x) });
    const kA = kOf(sA),
      kB = kOf(sB);
    const k = putt
      ? { a: 0, w: 0, ty: 0, hy: 0, sx: 0, up: 0 }
      : { a: 0, w: 0, ty: mix(kA.ty, kB.ty), hy: mix(kA.hy, kB.hy), sx: mix(kA.sx, kB.sx), up: mix(kA.up, kB.up) };
    // motion capture: the meter phase s (0 address, 1 top, 2 impact, 3 finish) picks a moment of a real recorded
    // swing, whose trunk and head drive the body (below). The club path keeps its tuned turn (the arms' IK absorbs
    // the few degrees between the two), so contact with the ball is unchanged.
    const clip = mhClip(putt ? 'putt' : 'swing') as (Clip & { ty: number[]; hy: number[] }) | undefined;
    const tm = clip?.ev ? clipTime(clip.ev, Math.min(3, s)) : 0;
    if (putt) {
      // pendulum: back ∝ power, through ≈ same length
      const pw = Math.min(1, inp.power ?? 0.6),
        back = 0.15 + pw * 0.4,
        ph =
          s <= 1
            ? -back * Math.sin((Math.min(1, s) * Math.PI) / 2)
            : s <= 2
              ? -back * Math.cos(((s - 1) * Math.PI) / 2)
              : back * 1.1 * Math.sin((Math.min(1, s - 2) * Math.PI) / 2);
      k.a = s <= 2 ? (s <= 1 ? ph : ph * (1 - (s - 1)) + 0) : ph;
      k.ty = k.a * 0.55;
      k.hy = k.a * 0.08;
    }
    // --- hips & spine: athletic posture, turn and slide
    // squat into the ground in transition, then push up and post on the lead leg through impact
    const squat = putt ? 0 : 0.045 * sstep(1.0, 1.5, s) * (1 - sstep(1.7, 2.02, s)) - 0.018 * sstep(1.9, 2.1, s) * (1 - sstep(2.3, 2.7, s));
    const tilt = (putt ? 0.36 : 0.3) - k.up * 0.6,
      drop = putt ? 0.05 : 0.055 - k.up * 0.05 + squat;
    by.Hips.position.set(k.sx, BPOS('Hips').y - drop, -0.07 + k.up * 0.05);
    by.Hips.quaternion.setFromEuler(new THREE.Euler(tilt, k.hy, 0, 'YXZ'));
    const sy = (k.ty - k.hy) / 3,
      sp = (putt ? 0.2 : 0.14) - k.up * 0.2;
    const lat = (putt ? 0.05 : 0.15) * (1 - k.up * 2) + (putt ? 0 : 0.13 * sstep(1.5, 2, s) * (1 - sstep(2.1, 2.6, s))); // leans away from the target; more through impact, so the head stays behind the ball
    for (const n of ['Spine', 'Spine1', 'Spine2'])
      by[n].quaternion.setFromEuler(new THREE.Euler(sp / 3 + (n === 'Spine' ? breathe * 0.3 : 0), sy, lat / 3, 'XYZ'));
    // head stays on the ball until after impact, then turns to watch it fly
    // head: eyes on the ball until just after impact, then the head releases and turns to watch the shot.
    // Expressed as a world-ish yaw so it never over-rotates: relative = desired − shoulder turn.
    const follow = putt ? sstep(2.2, 2.9, s) * 0.4 : sstep(2.08, 2.75, s),
      desired = follow * (Math.PI / 2 - 0.1) - 0.1 * (1 - follow);
    const rel = THREE.MathUtils.clamp(desired - k.ty, -1.3, 1.3),
      pitch = (putt ? 0.32 : 0.22) * (1 - follow) + 0.02; // head stays roughly in line with the spine; the eyes do the looking
    by.Neck.quaternion.setFromEuler(new THREE.Euler(pitch * 0.35, rel * 0.45, follow * 0.1, 'XYZ'));
    by.Head.quaternion.setFromEuler(new THREE.Euler(pitch * 0.65 - follow * 0.12, rel * 0.55, follow * 0.18, 'XYZ'));
    if (clip?.ev) {
      // trunk, neck and head from the capture; the hips move by the capture's own shift since address
      const hx = by.Hips.position.x - k.sx,
        hz = by.Hips.position.z,
        hyy = by.Hips.position.y;
      this.poseClip(putt ? 'putt' : 'swing', tm, TRUNK, 0);
      const d = clipHipsDelta(clip, tm);
      by.Hips.position.set(hx + d[0], hyy + d[1], hz + d[2]);
    }
    this.root.updateMatrixWorld(true);

    // --- club along the swing circle
    const X = V(1, 0, 0),
      n = new THREE.Vector3().crossVectors(X, P.v).normalize();
    const a = k.a;
    let H: THREE.Vector3, u: THREE.Vector3, fUnturned: THREE.Vector3 | undefined;
    const addrU = P.v.clone().negate();
    if (putt) {
      H = P.H0.clone()
        .addScaledVector(X, Math.sin(a) * 0.5 * P.R * 1.2)
        .addScaledVector(P.v, (1 - Math.cos(a)) * 0.2);
      u = addrU.clone();
    } else {
      // keyed hand path, with the address/impact keys snapped to this club's real address position
      const rows = HK.H.map(r => r.slice());
      rows[0] = [P.H0.x, P.H0.y, P.H0.z];
      rows[5] = [P.H0.x + 0.04, P.H0.y - 0.01, P.H0.z];
      // Connected swing: every key is converted into the body's "unturned" frame (undo that key's shoulder turn
      // about the tilted spine), interpolated there, then turned back by the current shoulder turn. The arms and
      // club therefore ride on the torso rotation instead of flying along their own path.
      const ul = HK.U.map((r, i) => r || (i === 0 ? [addrU.x, addrU.y, addrU.z] : [addrU.x + 0.1, addrU.y, addrU.z]));
      const spin = (vec: THREE.Vector3, ang: number, point: boolean) => {
        const q = new THREE.Quaternion().setFromAxisAngle(SPINE_AXIS, ang);
        return point ? vec.sub(SPINE_PIVOT).applyQuaternion(q).add(SPINE_PIVOT) : vec.applyQuaternion(q);
      };
      const hU = rows.map((r, i) => spin(V(r[0], r[1], r[2]), -KEYS_TY_AT[i], true).toArray());
      const uU = (ul as number[][]).map((r, i) => spin(V(r[0], r[1], r[2]).normalize(), -KEYS_TY_AT[i], false).toArray());
      const fU = HK.F.map((r, i) => spin(V(r[0], r[1], r[2]).normalize(), -KEYS_TY_AT[i], false).toArray());
      const mixN = (rows: number[][]) => {
        const a = keyN(rows, sA);
        if (!bw) return a;
        const b = keyN(rows, sB);
        return a.map((v, i) => mix(v, b[i]));
      };
      const hv = mixN(hU),
        uv = mixN(uU),
        fv0 = mixN(fU);
      H = spin(V(hv[0], hv[1], hv[2]), k.ty, true);
      u = spin(V(uv[0], uv[1], uv[2]).normalize(), k.ty, false);
      fUnturned = spin(V(fv0[0], fv0[1], fv0[2]), k.ty, false);
    }
    const fr = putt ? V(1, 0, 0) : fUnturned!;
    void n;
    const f = fr.addScaledVector(u, -fr.dot(u)).normalize(); // club face direction (kept ⟂ shaft)
    const club = this.clubs[this.clubKind]!;
    const basis = new THREE.Matrix4().makeBasis(f, u.clone().negate(), new THREE.Vector3().crossVectors(f, u.clone().negate()));
    // hands: lead hand at the top of the grip, trail hand just below it. Grip frame: z = shaft toward the head,
    // x = −face (the hands sit either side of the shaft), y completes it. Bone = grip frame × bind correction.
    const xg = f.clone().negate(),
      zg = u.clone(),
      yg = new THREE.Vector3().crossVectors(zg, xg).normalize();
    xg.crossVectors(yg, zg).normalize();
    by.LeftShoulder.rotation.set(0, -0.28, -0.1);
    by.RightShoulder.rotation.set(0, 0.34, 0.22);
    this.root.updateMatrixWorld(true);
    const Gq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xg, yg, zg)),
      rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    // lead arm stays long (a wide, connected arc): keep the lead wrist ~straight-arm from the shoulder. Near address and
    // impact the club must stay on the ball, so there the body moves instead of the hands.
    if (!putt) {
      // after impact both arms reach out toward the target (full extension at P8), then fold into the finish
      const c = Math.max(0, 1 - s / 0.35, 1 - Math.abs(s - 2) / 0.25),
        invR = rootQ.clone().invert();
      const arms: [number, string, number, number][] = [
        [1, 'Left', 0.975 - 0.12 * sstep(2.6, 3, s), 1],
        [-1, 'Right', 0.97, sstep(2.05, 2.3, s) * (1 - sstep(2.6, 2.85, s))],
      ];
      for (let it = 0; it < 4; it++) {
        let moved = false;
        for (const [sd, nme, ext, wgt] of arms) {
          if (wgt <= 0.001) continue;
          const hb = handBind(sd),
            t = this.local(
              H.clone()
                .addScaledVector(u, sd > 0 ? 0.034 : 0.098)
                .add(hb.wrist.clone().applyQuaternion(Gq)),
            );
          const sh = wpos(by[nme + 'Arm'], new THREE.Vector3()),
            d = t.clone().sub(sh),
            err = d.length() - (this.len[nme + 'Arm'] + this.len[nme + 'Fore']) * ext;
          if (sd < 0 && err > 0) continue; // the trail arm only pulls the hands out, never in
          if (Math.abs(err) < 0.002) continue;
          const dl = d
            .normalize()
            .applyQuaternion(invR)
            .multiplyScalar(err * wgt);
          H.addScaledVector(dl, -(1 - c) * (sd > 0 ? 1 : 0.7));
          by.Hips.position.addScaledVector(dl, c * 0.8);
          this.root.updateMatrixWorld(true);
          moved = true;
        }
        if (!moved) break;
      }
    }
    club.position.copy(H);
    club.quaternion.setFromRotationMatrix(basis);
    // reach check: if a wrist target is beyond the arm, shift the hips toward it (knees absorb it below)
    const wristTarget = (sd: number) => {
      const hb = handBind(sd),
        gp = H.clone().addScaledVector(u, sd > 0 ? 0.034 : 0.098);
      return this.local(gp.add(hb.wrist.clone().applyQuaternion(Gq)));
    };
    for (let it = 0; it < 3; it++) {
      let worst = 0;
      const dir = new THREE.Vector3();
      for (const [sd, nme] of [
        [1, 'Left'],
        [-1, 'Right'],
      ] as [number, string][]) {
        const sh = wpos(by[nme + 'Arm'], new THREE.Vector3()),
          t = wristTarget(sd),
          d = t.clone().sub(sh),
          ex = d.length() - (this.len[nme + 'Arm'] + this.len[nme + 'Fore']) * 0.985;
        if (ex > worst) {
          worst = ex;
          dir.copy(d).normalize();
        }
      }
      if (worst <= 0.001) break;
      const local = dir.applyQuaternion(rootQ.clone().invert()).multiplyScalar(worst);
      by.Hips.position.add(local);
      this.root.updateMatrixWorld(true);
    }
    // --- legs: feet planted, knees flexed (IK), trail heel lifts in the finish
    const stance = putt ? 0.14 : kind === 'driver' ? 0.23 : 0.2;
    for (const [sd, n] of [
      [1, 'Left'],
      [-1, 'Right'],
    ] as [number, string][]) {
      const heel = sd < 0 && !putt ? sstep(2.1, 2.85, s) : 0; // trail heel up, foot pivots onto the toe, knee into the lead knee
      const target = this.local(V(sd * stance + (sd > 0 ? 0.03 : 0) + heel * 0.05, BPOS(n + 'Foot').y + heel * 0.1, -0.02 - heel * 0.06));
      const kick = sd < 0 && !putt ? sstep(1.3, 2.2, s) * 0.45 + sstep(2.2, 2.9, s) * 0.35 : 0,
        pole = this.local(V(sd * (stance + 0.25) - (sd < 0 ? heel * 0.4 : 0) + kick, 0.5, 0.9));
      twoBone(by[n + 'UpLeg'], by[n + 'Leg'], by[n + 'Foot'], target, pole, this.len[n + 'Up'], this.len[n + 'Low']);
      // foot flat (toe out a little), trail foot rolls onto the toe
      setWorldQuat(
        by[n + 'Foot'],
        this.root
          .getWorldQuaternion(new THREE.Quaternion())
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(heel * 1.15, sd * 0.25 + (sd < 0 ? heel * 0.9 : 0), 0, 'YXZ'))),
      );
      if (sd < 0) by[n + 'ToeBase'].rotation.x = -heel * 1.0;
    }

    for (const [sd, nme] of [
      [1, 'Left'],
      [-1, 'Right'],
    ] as [number, string][]) {
      const hb = handBind(sd),
        gp = H.clone().addScaledVector(u, sd > 0 ? 0.034 : 0.098);
      const Gh = Gq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), sd > 0 ? this.tune.rollL : this.tune.rollR));
      const boneQ = Gh.clone().multiply(hb.q.clone().invert());
      const wrist = gp.clone().add(hb.wrist.clone().applyQuaternion(Gh));
      // elbow hints live in the torso frame (they turn with the shoulders): lead elbow points down/out, trail elbow
      // folds down and tucks in on the downswing; through the finish both fold up by the head
      const elbowOut = (sd > 0 ? this.tune.poleL : this.tune.poleR).clone();
      if (!putt && s > 2.3) elbowOut.lerp(V(sd * 0.3, -0.5, 0.2), sstep(2.3, 2.8, s));
      if (!putt) elbowOut.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(SPINE_AXIS, k.ty * 0.85));
      const shoulder = wpos(by[nme + 'Arm'], new THREE.Vector3()),
        pole = shoulder.clone().add(this.dirW(elbowOut));
      const wT = this.local(wrist);
      twoBone(by[nme + 'Arm'], by[nme + 'ForeArm'], by[nme + 'Hand'], wT, pole, this.len[nme + 'Arm'], this.len[nme + 'Fore']);
      this.reachErr[sd > 0 ? 0 : 1] = wpos(by[nme + 'Hand'], new THREE.Vector3()).distanceTo(wT);
      setWorldQuat(by[nme + 'Hand'], rootQ.clone().multiply(boneQ));
    }
    this.root.updateMatrixWorld(true);
  }
  /**
   * Locomotion: a procedural walk → jog cycle. phase advances with distance (the caller integrates speed/stride),
   * speed blends idle → walk → jog amplitudes. turn leans the upper body into a turn.
   */
  /** The lips, in world space (for a joint). */
  mouth() {
    const h = this.by?.Head;
    if (!h) return this.local(V(0, 1.58, 0.1));
    this.root.updateMatrixWorld(true);
    return h.getWorldPosition(new THREE.Vector3()).add(this.dirW(V(-0.02, 0.0, 0.12)));
  }
  /**
   * After update(): a gesture with the right arm, blended in by k (0..1). t = seconds since it began.
   * wave: hand up by the head, rocking side to side, fingers open. point: arm out straight ahead, index finger out.
   * thumb: forearm up in front of the chest, a fist with the thumb up.
   */
  gesture(kind: GestureKind, k: number, t: number) {
    const by = this.by;
    if (!by?.RightHand || k <= 0.002) return;
    CUR = this.bind;
    this.root.updateMatrixWorld(true);
    const G = GESTURES[kind],
      rock = kind === 'wave' ? Math.sin(t * 8.5) : 0,
      tgt = this.local(V(G.hand[0] + 0.12 * rock, G.hand[1], G.hand[2])),
      h = by.RightHand.getWorldPosition(new THREE.Vector3()).lerp(tgt, Math.min(1, k));
    twoBone(by.RightArm, by.RightForeArm, by.RightHand, h, this.local(V(G.pole[0], G.pole[1], G.pole[2])), this.len.RightArm, this.len.RightFore);
    by.RightHand.rotation.set(G.rot[0] * k, G.rot[1] * k, (G.rot[2] + 0.25 * rock) * k - 0.06 * (1 - k));
    const C = mhCurl();
    if (C)
      for (const f of FINGERS)
        for (let j = 1; j <= 3; j++) {
          const b = by[`RightHand${f}${j}`],
            ax = C[`RightHand${f}${j}`];
          if (!b || !ax) continue;
          const rest = f === 'Thumb' ? [0.16, 0.22, 0.16][j - 1] : REST_CURL[f][j - 1],
            fist = f === 'Thumb' ? [0.9, 0.35, 0.25][j - 1] : [1.25, 1.45, 0.9][j - 1],
            want = G.open.includes(f) ? (f === 'Thumb' ? -0.25 : 0.03) : G.fist ? fist : rest * 0.3;
          b.quaternion.setFromAxisAngle(_ax.set(ax[0], ax[1], ax[2]), rest + (want - rest) * k);
        }
    this.root.updateMatrixWorld(true);
  }
  /** After update(): bring the right hand toward a world point by k (0..1): a puff, a pass. */
  reachRight(tgt: THREE.Vector3, k: number) {
    const by = this.by;
    if (!by?.RightHand || k <= 0.002) return;
    const h = by.RightHand.getWorldPosition(new THREE.Vector3()).lerp(tgt, Math.min(1, k));
    twoBone(by.RightArm, by.RightForeArm, by.RightHand, h, this.local(V(-0.75, 0.9, -0.2)), this.len.RightArm, this.len.RightFore);
    this.root.updateMatrixWorld(true);
  }
  /** Riding a vehicle. sit: driver's seat, hands on the wheel (steer −1..1 in inp.turn). stand: segway/jetpack stance. */
  private ride(inp: SwingInput) {
    const by = this.by,
      st = inp.turn ?? 0,
      t = inp.time,
      e = (n: string, x: number, y = 0, z = 0) => by[n].rotation.set(x, y, z);
    if (inp.mode === 'sit') {
      by.Hips.position.set(0, BPOS('Hips').y, -0.02);
      e('Hips', -0.12);
      e('Spine', 0.02);
      e('Spine1', 0.06);
      e('Spine2', 0.08 + st * 0.02, st * 0.08);
      e('Neck', 0.0);
      e('Head', 0.0 + Math.sin(t * 2.3) * 0.015, st * 0.25);
      for (const [s, n] of [
        [1, 'Left'],
        [-1, 'Right'],
      ] as [number, string][]) {
        e(n + 'UpLeg', -1.48, 0, s * 0.07);
        e(n + 'Leg', 1.32);
        e(n + 'Foot', 0.12);
        e(n + 'Arm', -0.95 + s * st * 0.22, 0, -s * 0.18);
        e(n + 'ForeArm', -0.75 - s * st * 0.1, 0, 0);
        e(n + 'Hand', 0.1, 0, s * 0.1);
      }
    } else if (inp.mode === 'skate') {
      // on a skateboard, side-on: the board runs along the golfer's own x axis (they face +z, ride toward +x).
      // inp.s = crouch (0 tall … 1 deep), inp.turn = lean into a carve (−1…1), inp.power = arms out (balance)
      const c = inp.s,
        lean = st * 0.22,
        bal = inp.power ?? 0.5;
      by.Hips.position.set(0, BPOS('Hips').y - 0.06 - c * 0.26, 0.02 + c * 0.05);
      e('Hips', 0.1 + c * 0.25, 0.25, lean);
      e('Spine', 0.12 + c * 0.25, -0.1);
      e('Spine1', 0.05);
      e('Spine2', 0.02, -0.15, -lean * 0.5);
      e('Neck', -0.1 - c * 0.2);
      e('Head', -0.05, 1.05 + Math.sin(t * 0.8) * 0.05, 0); // looking where they're going
      for (const [sg, n] of [
        [1, 'Left'],
        [-1, 'Right'],
      ] as [number, string][]) {
        e(n + 'UpLeg', -0.3 - c * 0.7, 0, sg * 0.25);
        e(n + 'Leg', 0.5 + c * 1.1);
        // arms out toward the nose and the tail, swaying for balance
        e(n + 'Arm', -0.25 + Math.sin(t * 1.7 + sg) * 0.08 * bal, sg * 0.35, -sg * (0.7 + bal * 0.45));
        e(n + 'ForeArm', -0.35 - c * 0.2, 0, sg * 0.15);
        e(n + 'Hand', 0, 0, sg * 0.15);
      }
    } else {
      by.Hips.position.set(0, BPOS('Hips').y - 0.03, 0);
      e('Spine', 0.05);
      e('Spine2', 0, st * 0.1);
      e('Head', 0.05, st * 0.2);
      for (const [s, n] of [
        [1, 'Left'],
        [-1, 'Right'],
      ] as [number, string][]) {
        e(n + 'UpLeg', -0.08, 0, s * 0.05);
        e(n + 'Leg', 0.16);
        e(n + 'Arm', -0.75, 0, -s * 0.12);
        e(n + 'ForeArm', -0.9);
      }
    }
    this.root.updateMatrixWorld(true);
    // reach the controls: hands to the grips, feet to the floor (world targets from the vehicle)
    const ik = inp.ik;
    if (ik?.feet)
      for (const [s, n] of [
        [1, 'Left'],
        [-1, 'Right'],
      ] as [number, string][]) {
        const f =
          ik.feet[0]
            .clone()
            .sub(this.local(V(s, 0, 0)))
            .lengthSq() <
          ik.feet[1]
            .clone()
            .sub(this.local(V(s, 0, 0)))
            .lengthSq()
            ? ik.feet[0]
            : ik.feet[1];
        twoBone(
          by[n + 'UpLeg'],
          by[n + 'Leg'],
          by[n + 'Foot'],
          f.clone().add(this.dirW(V(0, 0.07, 0))),
          this.local(V(s * 0.2, 1.4, 1.6)),
          this.len[n + 'Up'],
          this.len[n + 'Low'],
        );
        setWorldQuat(by[n + 'Foot'], this.root.getWorldQuaternion(new THREE.Quaternion()));
      }
    if (ik?.hands) {
      const lw = this.local(V(1, 1.3, 0)),
        [a, b] = ik.hands,
        left = a.distanceToSquared(lw) < b.distanceToSquared(lw) ? a : b,
        right = left === a ? b : a;
      for (const [s, n, tgt] of [
        [1, 'Left', left],
        [-1, 'Right', right],
      ] as [number, string, THREE.Vector3][])
        twoBone(by[n + 'Arm'], by[n + 'ForeArm'], by[n + 'Hand'], tgt, this.local(V(s * 0.75, 0.9, -0.2)), this.len[n + 'Arm'], this.len[n + 'Fore']);
    }
    this.root.updateMatrixWorld(true);
  }
  private walk(inp: SwingInput) {
    // Locomotion built from the ground up: each foot is planted on the ground for its stance phase and moves back
    // under the body at exactly the body's speed (so it cannot slide), rolls heel → flat → toe, then swings forward.
    // The legs are solved with IK to those foot targets; hips, spine and arms follow the same cycle.
    const by = this.by,
      sp = inp.speed || 0,
      t = inp.time,
      air = inp.air || 0,
      L = THREE.MathUtils.lerp,
      PI = Math.PI;
    const w = THREE.MathUtils.clamp(sp / 0.9, 0, 1),
      run = sstep(2.0, 3.2, sp),
      dash = sstep(4.2, 6, sp);
    const S = 2 * stepLength(sp),
      d = L(0.62, 0.36, run) - 0.05 * dash,
      dS = d * S; // stride, share of it on the ground
    const ph = inp.phase || 0,
      pL = (((ph / (2 * PI)) % 1) + 1) % 1,
      c = Math.cos(ph),
      breathe = Math.sin(t * 1.7) * 0.012 * (1 - w),
      // standing still: weight drifts from foot to foot, the shoulders settle against it, the arms hang and sway a
      // little, and now and then the head turns to look at something (each golfer on their own beat)
      still = 1 - w,
      is = this.idleSeed,
      shift = still * (Math.sin(t * 0.43 + is) + 0.4 * Math.sin(t * 0.17 + is * 2.3)) * 0.7,
      glance = still * Math.sin(t * 0.31 + is * 1.7) * sm01(Math.max(0, Math.min(1, Math.sin(t * 0.11 + is) * 2 - 0.6)));
    // pelvis: lowest at double support when walking, lowest mid-stance when running; shifts over the stance foot
    const bob = L(-0.02 * Math.cos(2 * ph), -(0.03 + 0.015 * dash) * Math.cos(2 * ph - 2 * PI * d), run);
    const yaw = -(0.07 + 0.05 * run) * w * c,
      lean = 0.03 * w + 0.06 * run + 0.1 * dash,
      turn = inp.turn || 0;
    by.Hips.position.set(
      L(0.02, 0.008, run) * w * Math.cos(ph - PI * d) + shift * 0.028,
      BPOS('Hips').y - Math.abs(shift) * 0.006 - L(0.008, L(0.06, 0.085 + 0.03 * dash, run), w) + w * bob,
      0,
    );
    by.Hips.quaternion.setFromEuler(new THREE.Euler(lean, yaw + shift * 0.03, 0.025 * w * Math.sin(ph) - turn * 0.1 - shift * 0.035, 'YXZ'));
    // the shoulders counter-rotate against the hips; the head stays facing forward
    by.Spine.rotation.set(0.02 + breathe, -yaw * 0.6 - shift * 0.02, turn * 0.06 + shift * 0.03);
    by.Spine1.rotation.set(0.01, -yaw * 0.6, 0);
    by.Spine2.rotation.set(-0.01 - breathe * 0.6, -yaw * 0.5, 0);
    by.Neck.rotation.set(-lean * 0.4, yaw * 0.35, 0);
    by.Head.rotation.set(0.03 - lean * 0.3 + glance * 0.04, yaw * 0.35 + still * Math.sin(t * 0.37 + is) * 0.1 + glance * 0.5, shift * 0.02);
    const A = (L(0.52, 0.42, run) + 0.12 * dash) * w,
      elbow = L(0.2, L(0.22, 1.5, run), w);
    for (const [sd, n] of [
      [1, 'Left'],
      [-1, 'Right'],
    ] as [number, string][]) {
      const cs = sd * c; // +1 when this side's foot is forward → this arm is back
      by[n + 'Arm'].rotation.set(
        0.04 + A * cs - 0.08 * w * (1 - run) + 0.22 * run * w + still * 0.03 * Math.sin(t * 0.8 + is + sd),
        0,
        -sd * (0.06 + 0.06 * run * w) + shift * 0.025,
      );
      by[n + 'ForeArm'].rotation.set(-elbow - 0.5 * w * (1 - run) * sm01(0.5 - 0.5 * Math.cos(ph + (sd > 0 ? 0 : Math.PI) - 0.5)), 0, 0); // the forearm swings through a beat after the upper arm
      by[n + 'Hand'].rotation.set(-0.1 * w, 0, sd * 0.06);
      by[n + 'Shoulder'].rotation.set(0, -sd * 0.06 * cs * w, -sd * (0.02 + breathe * 1.5));
    }
    this.root.updateMatrixWorld(true);
    // ---- feet
    const thMax = L(0.65, 0.95, run) * w,
      thS = L(-0.28, -0.05, run) * w,
      zf = L(0.5 * dS, 0.36 * dS + 0.11, run),
      lift = (L(0.045, 0.2, run) + 0.06 * dash) * w;
    const AH = 0.085,
      BALL = 0.11,
      HEEL = 0.065,
      sm = (x: number) => x * x * (3 - 2 * x);
    const stance = (u: number) => {
      // ankle height, ankle z and foot pitch while the foot is on the ground
      const zb = zf - u * dS; // the ball of the foot, fixed on the ground, as seen from the moving body
      if (u < 0.15) {
        const th = thS * (1 - u / 0.15),
          zh = zb - BALL - HEEL;
        return { y: AH * Math.cos(th) - HEEL * Math.sin(th), z: zh + AH * Math.sin(th) + HEEL * Math.cos(th), th };
      } // heel strike: pivot on the heel
      if (u > 0.55) {
        const th = thMax * sm((u - 0.55) / 0.45);
        return { y: AH * Math.cos(th) + BALL * Math.sin(th), z: zb + AH * Math.sin(th) - BALL * Math.cos(th), th };
      } // heel lifts: pivot on the ball
      return { y: AH, z: zb - BALL, th: 0 };
    };
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion()),
      off = stance(1),
      on = stance(0);
    for (const [sd, n] of [
      [1, 'Left'],
      [-1, 'Right'],
    ] as [number, string][]) {
      const p = sd > 0 ? pL : (pL + 0.5) % 1;
      let f: { y: number; z: number; th: number };
      if (p < d) f = stance(p / d);
      else {
        const k = (p - d) / (1 - d),
          e = k * k * k * (k * (k * 6 - 15) + 10);
        f = {
          z: L(off.z, on.z, e),
          y: L(off.y, on.y, e) + lift * Math.sin(PI * k),
          th: L(off.th, on.th, sm(Math.min(1, k * 1.4))) + 0.5 * run * w * Math.sin(PI * k) * (1 - k),
        };
      }
      let x = sd * L(0.1, L(0.085, 0.05, run), w),
        y = f.y,
        z = f.z * w,
        th = f.th;
      if (air > 0) {
        y = L(y, sd > 0 ? 0.34 : 0.26, air);
        z = L(z, sd > 0 ? 0.2 : -0.22, air);
        th = L(th, 0.35, air);
      } // jump: tuck
      twoBone(
        by[n + 'UpLeg'],
        by[n + 'Leg'],
        by[n + 'Foot'],
        this.local(V(x, y, z)),
        this.local(V(x + sd * 0.03, 0.5, z + 1.2)),
        this.len[n + 'Up'],
        this.len[n + 'Low'],
      );
      setWorldQuat(by[n + 'Foot'], rootQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(th, sd * 0.1, 0, 'YXZ'))));
    }
    this.root.updateMatrixWorld(true);
    // motion capture: the recorded walk and run strides (blended by speed) replace the built pose once we're
    // properly moving; standing still and jumping stay procedural. The stride is played by cycle fraction, so it
    // stays in step with the feet the game moves.
    const mw = w * (1 - air) * sstep(0.35, 0.9, sp);
    if (mw > 0.01 && mhClip('walk') && mhClip('run')) {
      const hy = by.Hips.position.y,
        hx = by.Hips.position.x;
      this.loopPose('walk', 'run', pL, run, mw);
      // hips: keep the built height (it already suits our legs), add the capture's bob; then put the feet on the ground
      by.Hips.position.set(L(hx, this._lh[0], mw), hy + (this._lh[1] - w * bob) * mw, 0); // the capture's bob replaces the built one (not on top of it)
      if (turn) by.Hips.quaternion.multiply(_qa.setFromAxisAngle(_ad.set(0, 0, 1), -turn * 0.1 * mw));
      this.root.updateMatrixWorld(true);
      this.plantFeet(true);
      this.groundFeet();
    }
  }
  private _lh = [0, 0, 0];
  /** Blend two looping clips (a → b by k) at cycle fraction f, then blend that over the current pose by weight wt. */
  private loopPose(a: string, b: string, f: number, k: number, wt: number) {
    const A = mhClip(a)!,
      B = mhClip(b)!,
      samp = (c: Clip, k2: number, out: THREE.Quaternion, bi: number) => {
        const x = (((f % 1) + 1) % 1) * c.n,
          i = Math.floor(x) % c.n,
          j = (i + 1) % c.n,
          w = x - Math.floor(x),
          q0 = c.q[i],
          q1 = c.q[j];
        _qa.set(q0[k2 * 4], q0[k2 * 4 + 1], q0[k2 * 4 + 2], q0[k2 * 4 + 3]);
        _qb.set(q1[k2 * 4], q1[k2 * 4 + 1], q1[k2 * 4 + 2], q1[k2 * 4 + 3]);
        out.copy(_qa).slerp(_qb, w);
        void bi;
        return out;
      };
    // hips: a smooth (Catmull-Rom) curve through the stored frames: straight lines between them make the bounce's speed jump every frame
    const hipAt = (c: Clip) => {
      const x = (((f % 1) + 1) % 1) * c.n,
        i = Math.floor(x) % c.n,
        w = x - Math.floor(x),
        n = c.n,
        P = (k: number) => c.hips[(((i + k) % n) + n) % n];
      return [0, 1, 2].map(m => {
        const p0 = P(-1)[m],
          p1 = P(0)[m],
          p2 = P(1)[m],
          p3 = P(2)[m];
        return 0.5 * (2 * p1 + (-p0 + p2) * w + (2 * p0 - 5 * p1 + 4 * p2 - p3) * w * w + (-p0 + 3 * p1 - 3 * p2 + p3) * w * w * w);
      });
    };
    for (let bi = 0; bi < A.bones.length; bi++) {
      const bone = this.by[A.bones[bi]];
      if (!bone) continue;
      const kb = B.bones.indexOf(A.bones[bi]);
      samp(A, bi, _qc, bi);
      if (kb >= 0 && k > 0) _qc.slerp(samp(B, kb, _qd, kb), k);
      // arms half from the capture (its forearm twist doesn't match ours, so the swing reads as reaching); hands our own
      const nm = A.bones[bi],
        arm = /Shoulder|Arm/.test(nm) ? 0.5 : /Hand$/.test(nm) ? 0 : 1;
      bone.quaternion.slerp(_qc, wt * arm);
    }
    const ha = hipAt(A),
      hb = hipAt(B);
    this._lh = [ha[0] + (hb[0] - ha[0]) * k, ha[1] + (hb[1] - ha[1]) * k, 0];
  }
  /** Leg IK: any heel/toe below the ground is lifted by bending that knee; feet in the air are left alone. */
  private groundFeet() {
    const by = this.by,
      inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert(),
      v = new THREE.Vector3(),
      rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    for (const n of ['Left', 'Right']) {
      const heel = by[n + 'Foot'].localToWorld(v.set(0, -0.085, -0.065)).applyMatrix4(inv).y,
        toe = by[n + 'ToeBase'].localToWorld(v.set(0, -0.02, 0.065)).applyMatrix4(inv).y;
      const low = Math.min(heel, toe);
      if (low >= 0) continue;
      const fq = by[n + 'Foot'].getWorldQuaternion(new THREE.Quaternion());
      const ankle = wpos(by[n + 'Foot'], new THREE.Vector3()).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(rq), -low);
      const hip = wpos(by[n + 'UpLeg'], new THREE.Vector3()),
        pole = hip.clone().add(new THREE.Vector3(0, -0.5, 1).applyQuaternion(rq));
      twoBone(by[n + 'UpLeg'], by[n + 'Leg'], by[n + 'Foot'], ankle, pole, this.len[n + 'Up'], this.len[n + 'Low']);
      setWorldQuat(by[n + 'Foot'], fq); // keep the foot's pitch from the gait
    }
    this.root.updateMatrixWorld(true);
  }
  /** Raise/lower the hips so the lowest heel or toe touches the ground (no sinking into the floor, no floating). */
  noPlant = false; // dev: measure the raw pose
  /** soft (captured walk/run): follow the feet only slowly, so a run keeps its moment in the air and the body isn't
   *  yanked down every stride; a foot that dips into the ground is fixed by bending its knee (groundFeet) instead. */
  private plantFeet(soft = false) {
    const by = this.by;
    this.root.updateMatrixWorld(true);
    if (this.noPlant) return;
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert(),
      v = new THREE.Vector3();
    let low = Infinity;
    for (const n of ['Left', 'Right']) {
      const heel = by[n + 'Foot'].localToWorld(v.set(0, -0.085, -0.065)).applyMatrix4(inv).y;
      low = Math.min(low, heel);
      const toe = by[n + 'ToeBase'].localToWorld(v.set(0, -0.02, 0.065)).applyMatrix4(inv).y;
      low = Math.min(low, toe);
    }
    const now = performance.now() / 1000,
      dt = Math.min(0.1, Math.max(0, now - this.plantT));
    this.plantT = now;
    if (!isFinite(this.plantY) || (!soft && (Math.abs(low - this.plantY) > 0.12 || dt === 0.1))) this.plantY = low;
    else this.plantY += (low - this.plantY) * (1 - Math.exp(-dt * (soft ? 3 : low < this.plantY ? 22 : 10))); // rise quicker than sink
    by.Hips.position.y -= this.plantY;
    this.root.updateMatrixWorld(true);
  }
  private plantY = NaN;
  private plantT = 0;
  /** World position of the clubhead (t = 1) or a point along the shaft (t < 1). */
  clubPoint(t: number, out: THREE.Vector3) {
    const c = this.clubs[this.clubKind]!;
    c.updateMatrixWorld(true);
    return c.localToWorld(out.set(0, -CLUB_SPEC[this.clubKind].L * t, 0));
  }
  private local(p: THREE.Vector3) {
    return this.root.localToWorld(p.clone());
  }
  private dirW(d: THREE.Vector3) {
    return d.clone().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
  }
  static clubKindFor(c: { short: string; putter?: boolean }): ClubKind {
    return c.putter ? 'putter' : c.short === '1W' ? 'driver' : /^(PW|SW|LW)$/.test(c.short) ? 'wedge' : c.short.endsWith('W') ? 'wood' : 'iron';
  }
}
