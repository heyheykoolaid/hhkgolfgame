// Real grass: camera-facing billboard cards with a painted grass-clump texture, instanced in 16 m chunks around the camera (generated as you move, dropped behind you),
// with per-surface density/height/colour, a wind sway and a soft fade at the edge of the grass circle.
// Beyond the circle the textured turf takes over. Quality drops automatically on slow machines.
import * as THREE from 'three';
import { WIND } from './wind';

export type GrassKind = 'rough' | 'heavy' | 'fringe' | 'fairway' | 'tee' | null;
interface KindSpec {
  density: number;
  h: [number, number];
  cols: string[];
  spread: number;
}
const KINDS: Record<Exclude<GrassKind, null>, KindSpec> = {
  rough: { density: 6.5, h: [0.065, 0.13], cols: ['#7f8f40', '#8c984a', '#96984f', '#76843f'], spread: 0.24 },
  heavy: { density: 6.5, h: [0.14, 0.27], cols: ['#b8a860', '#a8984f', '#c4b46c', '#9a8a4a', '#a3a055'], spread: 0.27 },
  fringe: { density: 3.2, h: [0.028, 0.044], cols: ['#7c9a45', '#86a24c'], spread: 0.07 },
  fairway: { density: 1.6, h: [0.016, 0.026], cols: ['#7a9845', '#86a24c', '#738e40'], spread: 0.06 },
  tee: { density: 1.4, h: [0.016, 0.024], cols: ['#86a24c', '#7c9a45'], spread: 0.06 },
};
const CHUNK = 16,
  NP = 64; // NP: how many recent tread marks (short strokes) the grass remembers

/** Painted grass clump on a transparent canvas: a fan of tapered, curved blades, lighter at the tips.
 *  It's white/grey so each instance's colour tints it. */
function tuftTexture() {
  const W = 128,
    H = 128,
    c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let b = 0; b < 22; b++) {
    const bx = W * (0.3 + rnd() * 0.4),
      lean = (rnd() - 0.5) * W * 0.7,
      h = H * (0.45 + rnd() * 0.52),
      w = 2.2 + rnd() * 2.6;
    const tx = bx + lean,
      ty = H - h,
      mx = bx + lean * 0.25,
      my = H - h * 0.55;
    const l = 150 + rnd() * 105,
      gr = g.createLinearGradient(0, H, 0, ty);
    gr.addColorStop(0, `rgb(${l * 0.62},${l * 0.62},${l * 0.62})`);
    gr.addColorStop(1, `rgb(${l},${l},${l})`);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(bx - w, H);
    g.quadraticCurveTo(mx - w * 0.6, my, tx, ty);
    g.quadraticCurveTo(mx + w * 0.6, my, bx + w, H);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  return t;
}
/** One billboard card: a unit quad standing on its bottom edge; the vertex shader turns it to face the camera. */
function cardGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  return g;
}
function hash(i: number, j: number, k: number) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export interface GrassOpts {
  kind(x: number, z: number): GrassKind;
  height(x: number, z: number): number;
  radius?: number;
}
export class Grass {
  readonly group = new THREE.Group();
  private geo = cardGeometry();
  private mat: THREE.MeshStandardMaterial;
  // each mark is a stroke: [x0, z0, x1, z1] + [radius, time pressed, -, -]
  private presses = Array.from({ length: NP * 2 }, (_, i) => (i % 2 ? new THREE.Vector4(0.01, -99, 0, 0) : new THREE.Vector4(1e6, 1e6, 1e6, 1e6)));
  private pi = 0;
  private open = new Map<string, number>();
  private uni = {
    uTime: { value: 0 },
    uGust: WIND.uGust,
    uFade: { value: new THREE.Vector2(60, 76) },
    uCam: { value: new THREE.Vector3() },
    uPress: { value: Array.from({ length: NP * 2 }, () => new THREE.Vector4()) },
    uNP: { value: 0 },
  };
  private chunks = new Map<string, THREE.InstancedMesh | null>();
  private radius: number;
  quality = 1;
  private slow = 0;
  private fast = 0;
  constructor(private opts: GrassOpts) {
    this.radius = opts.radius ?? 72;
    this.uni.uFade.value.set(this.radius - 18, this.radius - 2);
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tuftTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.92 });
    this.mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.uni);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime; uniform float uGust; uniform vec2 uFade; uniform vec3 uCam; uniform vec4 uPress[' +
            NP * 2 +
            ']; uniform int uNP;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float d = distance(ip.xz, uCam.xz), fade = 1.0 - smoothstep(uFade.x, uFade.y, d);
          transformed.y *= fade; transformed.xz *= mix(0.4, 1.0, fade);
          // trodden down under wheels and feet, springing back over a few seconds
          float trod = 0.0;
          for (int i = 0; i < ${NP}; i++) {
            if (i >= uNP) break;
            vec4 sg = uPress[i * 2], pr = uPress[i * 2 + 1]; float age = uTime - pr.y;
            vec2 ab = sg.zw - sg.xy; float h = clamp(dot(ip.xz - sg.xy, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
            float k = (1.0 - smoothstep(pr.x * 0.45, pr.x, distance(ip.xz, sg.xy + ab * h))) * (1.0 - smoothstep(1.5, 7.0, age));
            trod = max(trod, k);
          }
          transformed.y *= 1.0 - 0.88 * trod; transformed.xz *= 1.0 + 0.35 * trod;
          float t = uv.y * uv.y, gust = sin(uTime * 0.7 + ip.x * 0.05) * 0.5 + 0.5;
          transformed.x += (sin(uTime * 1.9 + ip.x * 0.37 + ip.z * 0.21) * 0.08 + gust * 0.08) * t * (0.55 + 2.2 * uGust) + t * 0.22 * uGust;
          // billboard: turn the card about its vertical axis to face the camera
          vec2 dir = uCam.xz - ip.xz; dir = length(dir) > 1e-4 ? normalize(dir) : vec2(0.0, 1.0);
          vec2 right = vec2(dir.y, -dir.x);
          transformed.xz = right * transformed.x;
        }`,
        );
    };
    this.mat.customProgramCacheKey = () => 'gh-grass';
  }
  /** Tread the grass down at (x, z). Call every frame per wheel / foot with a stable id: a moving one lays a trail
   *  of strokes up to 2.5 m long; a still one just keeps its spot pressed. */
  press(id: string, x: number, z: number, r: number) {
    const t = this.uni.uTime.value,
      k = this.open.get(id);
    if (k !== undefined) {
      const sg = this.presses[k * 2],
        pr = this.presses[k * 2 + 1];
      if (pr.x === r && t - pr.y < 1 && Math.hypot(sg.x - x, sg.y - z) < 2.5) {
        if (Math.hypot(sg.z - x, sg.w - z) < 4) {
          sg.z = x;
          sg.w = z;
          pr.y = t;
          return;
        }
      } else if (pr.x === r && Math.hypot(sg.z - x, sg.w - z) < 0.6) {
        this.slot(id, sg.z, sg.w, x, z, r, t);
        return;
      }
    }
    this.slot(id, x, z, x, z, r, t);
  }
  private slot(id: string, x0: number, z0: number, x1: number, z1: number, r: number, t: number) {
    const k = this.pi;
    this.pi = (this.pi + 1) % NP;
    for (const [o, v] of this.open) if (v === k) this.open.delete(o);
    this.presses[k * 2].set(x0, z0, x1, z1);
    this.presses[k * 2 + 1].set(r, t, 0, 0);
    this.open.set(id, k);
  }
  /** Forget every chunk (new hole, quality change). */
  /** Tint every blade (the course's own colour of grass: white = as drawn). */
  setTint(hex: string) {
    this.mat.color.set(hex);
  }
  reset() {
    this.presses.forEach((p, i) => (i % 2 ? p.set(0.01, -99, 0, 0) : p.set(1e6, 1e6, 1e6, 1e6)));
    this.open.clear();
    for (const m of this.chunks.values())
      if (m) {
        this.group.remove(m);
        m.dispose();
      }
    this.chunks.clear();
  }
  private build(ci: number, cj: number) {
    const x0 = ci * CHUNK,
      z0 = cj * CHUNK,
      mats: THREE.Matrix4[] = [],
      cols: THREE.Color[] = [],
      m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3(),
      p = new THREE.Vector3();
    // sample on a jittered grid; each cell decides its own kind (keeps edges like bunker lips and fairway lines crisp)
    const step = 0.45 / Math.sqrt(this.quality);
    let n = 0;
    for (let gz = 0; gz < CHUNK; gz += step)
      for (let gx = 0; gx < CHUNK; gx += step) {
        n++;
        const r1 = hash(ci * 4096 + Math.round(gx / step), cj * 4096 + Math.round(gz / step), 1),
          r2 = hash(ci, cj, n),
          r3 = hash(n, ci, cj);
        const x = x0 + gx + (r1 - 0.5) * step,
          z = z0 + gz + (r2 - 0.5) * step,
          kind = this.opts.kind(x, z);
        if (!kind) continue;
        const K = KINDS[kind];
        if (r3 > K.density * step * step) continue;
        const h = K.h[0] + (K.h[1] - K.h[0]) * hash(n, cj, ci),
          w = K.spread * (1.5 + r1 * 0.9);
        q.identity();
        m.compose(p.set(x, this.opts.height(x, z) - 0.01, z), q, s.set(w, h, w));
        mats.push(m.clone());
        const c = new THREE.Color(K.cols[Math.floor(r3 * 997) % K.cols.length]);
        c.offsetHSL(0, 0, (r1 - 0.5) * 0.06);
        cols.push(c);
      }
    if (!mats.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, mats.length);
    mats.forEach((mm, i) => {
      im.setMatrixAt(i, mm);
      im.setColorAt(i, cols[i]);
    });
    im.receiveShadow = true;
    im.castShadow = false;
    im.frustumCulled = false; // instance bounds aren't the geometry's
    this.group.add(im);
    return im;
  }
  /** Call every frame with the camera (or player) position. Builds at most two chunks per frame. */
  update(dt: number, cam: THREE.Vector3) {
    this.uni.uTime.value += dt;
    this.uni.uCam.value.copy(cam);
    // hand the shader only marks that are still springing back and near enough to matter
    {
      const t = this.uni.uTime.value,
        out = this.uni.uPress.value;
      let n = 0;
      for (let k = 0; k < NP; k++) {
        const sg = this.presses[k * 2],
          pr = this.presses[k * 2 + 1];
        if (t - pr.y < 7 && Math.hypot(sg.x - cam.x, sg.y - cam.z) < this.radius + 5) {
          out[n * 2].copy(sg);
          out[n * 2 + 1].copy(pr);
          n++;
        }
      }
      this.uni.uNP.value = n;
    }
    // auto quality: sustained slow frames → thinner grass; it comes back if things are smooth
    if (/grassfull/.test(location.search)) {
      /* fixed quality for testing */
    } else if (dt > 0.034) {
      this.slow += dt;
      this.fast = 0;
    } else {
      this.fast += dt;
      this.slow = Math.max(0, this.slow - dt * 0.5);
    }
    if (this.slow > 3 && this.quality > 0.3) {
      this.quality = Math.max(0.3, this.quality * 0.6);
      this.slow = 0;
      this.reset();
    } else if (this.fast > 12 && this.quality < 1) {
      this.quality = Math.min(1, this.quality / 0.6);
      this.fast = 0;
      this.reset();
    }
    const R = this.radius,
      ci0 = Math.floor((cam.x - R) / CHUNK),
      ci1 = Math.floor((cam.x + R) / CHUNK),
      cj0 = Math.floor((cam.z - R) / CHUNK),
      cj1 = Math.floor((cam.z + R) / CHUNK);
    const want: [number, number, number][] = [];
    for (let j = cj0; j <= cj1; j++)
      for (let i = ci0; i <= ci1; i++) {
        const cx = (i + 0.5) * CHUNK,
          cz = (j + 0.5) * CHUNK,
          d = Math.hypot(cx - cam.x, cz - cam.z);
        if (d < R + CHUNK * 0.75 && !this.chunks.has(i + ',' + j)) want.push([i, j, d]);
      }
    want.sort((a, b) => a[2] - b[2]);
    for (const [i, j] of want.slice(0, 2)) this.chunks.set(i + ',' + j, this.build(i, j));
    for (const [k, m] of this.chunks) {
      const [i, j] = k.split(',').map(Number),
        d = Math.hypot((i + 0.5) * CHUNK - cam.x, (j + 0.5) * CHUNK - cam.z);
      if (d > R + CHUNK * 1.6) {
        if (m) {
          this.group.remove(m);
          m.dispose();
        }
        this.chunks.delete(k);
      }
    }
  }
}
