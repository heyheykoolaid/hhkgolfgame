// Procedural trophies. A tournament's cup (from @gh/shared cupFor) fully describes its trophy, so the same seed
// always builds the same trophy: on the winner's card, in the trophy case, and later as Build Mode furniture.
// Size: ~0.55 m (mini cup) to ~0.85 m (championship) tall, origin at the bottom centre, front facing +Z.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { cupFor, type Cup, type TourSize } from '@gh/shared';

const METAL: Record<Cup['metal'], string> = { gold: '#e2b23c', silver: '#d4d8de', bronze: '#b87a45', chrome: '#e8eef4', rose: '#e0a088' };
const BASE: Record<Cup['base'], { c: string; r: number; m: number }> = {
  wood: { c: '#5a3820', r: 0.55, m: 0 },
  marble: { c: '#ece7de', r: 0.3, m: 0 },
  stone: { c: '#8a8580', r: 0.8, m: 0 },
  onyx: { c: '#18181b', r: 0.2, m: 0 },
};

function plaqueTexture(title: string, sub: string, metal: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = metal;
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = 'rgba(0,0,0,.45)';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 492, 140);
  g.fillStyle = '#2a1e10';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let fs = 46;
  g.font = `bold ${fs}px Georgia, serif`;
  while (g.measureText(title).width > 470 && fs > 18) {
    fs -= 2;
    g.font = `bold ${fs}px Georgia, serif`;
  }
  g.fillText(title, 256, sub ? 64 : 80);
  if (sub) {
    g.font = 'italic 30px Georgia, serif';
    g.fillText(sub, 256, 116);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The mini putt trophy's seed: not a tournament's (their seeds stay far below it), so it always builds the one
 *  hand-made design below. */
export const MINIGOLF_SEED = 999999937;
/** The Fun Land mini putt trophy: always the same. A square of putting felt on a timber plinth, the windmill from hole
 *  9 in gold with its sails, a golf ball by the cup, and a plaque. About 0.5 m tall. */
function minigolfTrophy(sub: string) {
  const g = new THREE.Group(),
    gold = new THREE.MeshStandardMaterial({ color: '#e2b23c', metalness: 1, roughness: 0.24 }),
    wood = new THREE.MeshStandardMaterial({ color: '#5a3820', roughness: 0.55 }),
    felt = new THREE.MeshStandardMaterial({ color: '#2f8a4a', roughness: 0.9 }),
    red = new THREE.MeshStandardMaterial({ color: '#c8452f', roughness: 0.5 }),
    white = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.4 }),
    add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.castShadow = o.receiveShadow = true;
      g.add(o);
      return o;
    };
  add(new THREE.BoxGeometry(0.3, 0.1, 0.3), wood, 0, 0.05, 0);
  add(new THREE.BoxGeometry(0.31, 0.012, 0.31), red, 0, 0.094, 0);
  add(new THREE.BoxGeometry(0.26, 0.012, 0.26), felt, 0, 0.106, 0);
  const pm = new THREE.MeshStandardMaterial({
    map: plaqueTexture('Mini Putt Champion', sub || 'Fun Land · nine holes', '#e2b23c'),
    metalness: 0.6,
    roughness: 0.35,
  });
  add(new THREE.PlaneGeometry(0.24, 0.06), pm, 0, 0.05, 0.152);
  // the windmill: a tapering gold tower, a red cap, four sails on a hub
  add(new THREE.CylinderGeometry(0.038, 0.06, 0.2, 8), gold, -0.04, 0.212, -0.03);
  add(new THREE.ConeGeometry(0.05, 0.06, 8), red, -0.04, 0.342, -0.03);
  const hub = new THREE.Group();
  hub.position.set(-0.04, 0.29, 0.015);
  hub.rotation.z = 0.35;
  g.add(hub);
  for (let i = 0; i < 4; i++) {
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.12, 0.004), gold);
    sail.position.set(Math.sin((i * Math.PI) / 2) * 0.062, Math.cos((i * Math.PI) / 2) * 0.062, 0);
    sail.rotation.z = (-i * Math.PI) / 2;
    sail.castShadow = true;
    hub.add(sail);
  }
  add(new THREE.SphereGeometry(0.012, 8, 6), gold, -0.04, 0.29, 0.02);
  // the cup and flag, and a ball on the felt
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 14), new THREE.MeshStandardMaterial({ color: '#111' }), 0.08, 0.113, 0.06);
  add(new THREE.CylinderGeometry(0.002, 0.002, 0.16, 6), gold, 0.08, 0.19, 0.06);
  add(new THREE.PlaneGeometry(0.05, 0.03), red, 0.105, 0.255, 0.06).material = new THREE.MeshStandardMaterial({
    color: '#c8452f',
    side: THREE.DoubleSide,
  });
  add(new THREE.SphereGeometry(0.011, 12, 8), white, 0.04, 0.124, 0.08);
  g.userData = { cup: null, height: 0.38 };
  return g;
}

/** Build a trophy. title/sub go on the plaque (sub: e.g. the winner's name and score). */
export function buildTrophy(seed: number, n: TourSize, sub = ''): THREE.Group {
  if (seed === MINIGOLF_SEED) return minigolfTrophy(sub);
  const cup = cupFor(seed, n),
    g = new THREE.Group(),
    big = n === 9 ? 1 : 0.72;
  const metal = new THREE.MeshStandardMaterial({ color: METAL[cup.metal], metalness: 1, roughness: cup.metal === 'chrome' ? 0.12 : 0.26 });
  const bm = BASE[cup.base],
    baseMat = new THREE.MeshStandardMaterial({ color: bm.c, roughness: bm.r, metalness: bm.m });
  const accent = new THREE.MeshStandardMaterial({ color: cup.accent, roughness: 0.5 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // plinth: stacked tiers, widest at the bottom; a band of the cup's colour on the top tier, the plaque on the front
  let y = 0,
    w = 0.3 * big;
  for (let i = 0; i < cup.tiers; i++) {
    const h = (i === 0 ? 0.11 : 0.08) * big,
      ww = w * (1 - i * 0.18);
    add(new THREE.BoxGeometry(ww, h, ww), baseMat, 0, y + h / 2, 0);
    if (i === cup.tiers - 1) {
      add(new THREE.BoxGeometry(ww + 0.004, h * 0.18, ww + 0.004), accent, 0, y + h * 0.82, 0);
      const pw = ww * 0.78,
        ph = h * 0.5,
        pm = new THREE.MeshStandardMaterial({ map: plaqueTexture(cup.title, sub, METAL[cup.metal]), metalness: 0.6, roughness: 0.35 });
      add(new THREE.PlaneGeometry(pw, ph), pm, 0, y + h * 0.42, ww / 2 + 0.002);
    }
    y += h;
    if (i < cup.tiers - 1) w = ww;
  }
  const top = y,
    H = 0.55 * big; // height of the metalwork above the plinth
  // the metal part
  const lathe = (pts: [number, number][], mat = metal) =>
    add(
      new THREE.LatheGeometry(
        pts.map(([r, h]) => new THREE.Vector2(r * big, h * big)),
        40,
      ),
      mat,
      0,
      top,
      0,
    );
  switch (cup.topper) {
    case 'cup': {
      lathe([
        [0.075, 0],
        [0.075, 0.012],
        [0.03, 0.03],
        [0.018, 0.07],
        [0.016, 0.16],
        [0.03, 0.19],
        [0.022, 0.2],
        [0.06, 0.24],
        [0.1, 0.32],
        [0.118, 0.42],
        [0.122, 0.5],
        [0.112, 0.5],
        [0.108, 0.42],
        [0.09, 0.33],
        [0.05, 0.25],
        [0, 0.24],
      ]);
      if (cup.handles)
        for (const s of [-1, 1]) {
          const h = add(new THREE.TorusGeometry(0.06 * big, 0.009 * big, 8, 20, Math.PI * 1.1), metal, s * 0.112 * big, top + 0.38 * big, 0);
          h.rotation.z = s > 0 ? -Math.PI * 0.55 : Math.PI * 0.45;
        }
      break;
    }
    case 'ball': {
      lathe([
        [0.07, 0],
        [0.07, 0.012],
        [0.02, 0.03],
        [0.014, 0.2],
        [0.03, 0.26],
        [0.01, 0.3],
        [0, 0.3],
      ]);
      const ball = add(
        new THREE.IcosahedronGeometry(0.075 * big, 3),
        new THREE.MeshStandardMaterial({ color: '#f7f5ee', roughness: 0.35 }),
        0,
        top + 0.37 * big,
        0,
      );
      ball.add(new THREE.Mesh(new THREE.TorusGeometry(0.0755 * big, 0.006 * big, 6, 40), accent)); // a stripe in the cup's colour
      break;
    }
    case 'golfer': {
      // a little statuette at the finish of a swing
      lathe([
        [0.08, 0],
        [0.08, 0.04],
        [0.07, 0.05],
        [0, 0.05],
      ]);
      const fig = new THREE.Group();
      fig.position.set(0, top + 0.05 * big, 0);
      fig.scale.setScalar(big * 0.85);
      g.add(fig);
      const limb = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
        const d = b.clone().sub(a),
          m = new THREE.Mesh(new THREE.CapsuleGeometry(r, d.length(), 4, 10), metal);
        m.position.copy(a).addScaledVector(d, 0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        m.castShadow = true;
        fig.add(m);
      };
      const V = (x: number, y2: number, z: number) => new THREE.Vector3(x, y2, z);
      limb(V(-0.03, 0, 0.01), V(-0.02, 0.2, 0), 0.016);
      limb(V(0.035, 0, -0.03), V(0.02, 0.2, 0), 0.016); // legs (back foot up on its toe)
      limb(V(0, 0.22, 0), V(-0.01, 0.37, 0.01), 0.032); // torso, turned through
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), metal);
      head.position.set(-0.012, 0.42, 0.012);
      fig.add(head);
      limb(V(-0.03, 0.35, 0.02), V(-0.07, 0.43, -0.03), 0.012);
      limb(V(0.02, 0.35, 0), V(-0.06, 0.44, -0.02), 0.012); // arms up and round
      limb(V(-0.065, 0.44, -0.025), V(0.07, 0.5, -0.12), 0.005); // the club over the shoulder
      break;
    }
    case 'flag': {
      lathe(
        [
          [0.1, 0],
          [0.1, 0.02],
          [0.095, 0.03],
          [0, 0.03],
        ],
        new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 0.8 }),
      );
      add(new THREE.CylinderGeometry(0.005 * big, 0.005 * big, H), metal, 0.02 * big, top + H / 2, 0);
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.13, -0.04);
      s.lineTo(0, -0.085);
      const fl = add(new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false }), accent, 0.025 * big, top + H - 0.005, -0.002);
      fl.scale.setScalar(big);
      add(
        new THREE.SphereGeometry(0.022 * big, 16, 12),
        new THREE.MeshStandardMaterial({ color: '#f7f5ee', roughness: 0.35 }),
        -0.045 * big,
        top + 0.052 * big,
        0.03 * big,
      );
      add(new THREE.SphereGeometry(0.009 * big, 10, 8), metal, 0.02 * big, top + H + 0.006, 0);
      break;
    }
    case 'star': {
      lathe([
        [0.07, 0],
        [0.07, 0.012],
        [0.02, 0.03],
        [0.014, 0.24],
        [0.022, 0.26],
        [0, 0.26],
      ]);
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5,
          rr = i % 2 ? 0.045 : 0.11;
        const x = Math.cos(a) * rr,
          y2 = Math.sin(a) * rr;
        i ? s.lineTo(x, y2) : s.moveTo(x, y2);
      }
      const st = add(
        new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }),
        metal,
        0,
        top + 0.37 * big,
        -0.0125 * big,
      );
      st.scale.setScalar(big);
      break;
    }
    case 'club': {
      // two crossed irons and a ball
      lathe([
        [0.08, 0],
        [0.08, 0.04],
        [0.07, 0.05],
        [0, 0.05],
      ]);
      for (const s of [-1, 1]) {
        const c = new THREE.Group();
        c.position.set(0, top + 0.05 * big, 0);
        c.rotation.z = s * 0.38;
        c.scale.setScalar(big);
        g.add(c);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.46), metal);
        shaft.position.y = 0.25;
        c.add(shaft);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.007, 0.1), accent);
        grip.position.y = 0.45;
        c.add(grip);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.012), metal);
        head.position.set(-s * 0.025, 0.025, 0);
        c.add(head);
      }
      add(
        new THREE.IcosahedronGeometry(0.03 * big, 2),
        new THREE.MeshStandardMaterial({ color: '#f7f5ee', roughness: 0.35 }),
        0,
        top + 0.08 * big,
        0.03 * big,
      );
      break;
    }
  }
  g.userData = { cup, height: top + H };
  return g;
}

export function disposeTrophy(g: THREE.Object3D) {
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mt = m.material as THREE.MeshStandardMaterial;
    mt.map?.dispose();
    mt.dispose();
  });
}

// ---------------------------------------------------------------- a small turntable view (winner's card, trophy case)
let R: THREE.WebGLRenderer | null = null,
  envTex: THREE.Texture | null = null;
function renderer() {
  if (R) return R;
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(Math.min(2, devicePixelRatio));
  R.toneMapping = THREE.ACESFilmicToneMapping;
  R.outputColorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(R);
  envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  return R;
}
function stageFor(t: THREE.Group) {
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.add(new THREE.HemisphereLight('#ffe2b8', '#3a3024', 0.8));
  const sun = new THREE.DirectionalLight('#ffc98a', 2.2);
  sun.position.set(1.5, 2.5, 2);
  scene.add(sun);
  scene.add(t);
  const h = t.userData.height as number;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  cam.position.set(0, h * 0.62, h * 2.55);
  cam.lookAt(0, h * 0.48, 0);
  return { scene, cam };
}
/** A still picture of a trophy (for lists). */
export function trophyImage(seed: number, n: TourSize, sub = '', px = 256): string {
  const r = renderer();
  r.setSize(px, px, false);
  const t = buildTrophy(seed, n, sub);
  t.rotation.y = -0.45;
  const { scene, cam } = stageFor(t);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  disposeTrophy(t);
  return url;
}
/** A spinning trophy in a canvas element (call update each frame; dispose when done). */
export class TrophyView {
  private t: THREE.Group;
  private stage: { scene: THREE.Scene; cam: THREE.PerspectiveCamera };
  private ctx: CanvasRenderingContext2D;
  constructor(
    readonly canvas: HTMLCanvasElement,
    seed: number,
    n: TourSize,
    sub = '',
  ) {
    renderer();
    this.t = buildTrophy(seed, n, sub);
    this.stage = stageFor(this.t);
    this.ctx = canvas.getContext('2d')!;
  }
  update(time: number) {
    const r = renderer(),
      w = this.canvas.width,
      h = this.canvas.height;
    r.setSize(w, h, false);
    this.stage.cam.aspect = w / h;
    this.stage.cam.updateProjectionMatrix();
    this.t.rotation.y = Math.sin(time * 0.6) * 0.9;
    r.setClearColor(0x000000, 0);
    r.render(this.stage.scene, this.stage.cam);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(r.domElement, 0, 0);
  }
  dispose() {
    disposeTrophy(this.t);
  }
}

/** A still picture of any object, framed to fit (catalog thumbnails). */
export function objectImage(o: THREE.Object3D, px = 128): string {
  const r = renderer();
  r.setSize(px, px, false);
  const scene = new THREE.Scene();
  scene.environment = envTex;
  scene.add(new THREE.HemisphereLight('#ffe2b8', '#3a3024', 1.1));
  const sun = new THREE.DirectionalLight('#ffc98a', 2.4);
  sun.position.set(2, 3, 2.5);
  scene.add(sun);
  const holder = new THREE.Group();
  holder.add(o);
  holder.rotation.y = -0.6;
  scene.add(holder);
  holder.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(holder),
    c = b.getCenter(new THREE.Vector3()),
    s = b.getSize(new THREE.Vector3()),
    R = Math.max(s.x, s.y, s.z) * 0.62 + 0.05;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 200),
    dir = new THREE.Vector3(0, 0.55, 1).normalize();
  cam.position.copy(c).addScaledVector(dir, R / Math.sin(THREE.MathUtils.degToRad(15)));
  cam.lookAt(c);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  holder.remove(o);
  return url;
}
