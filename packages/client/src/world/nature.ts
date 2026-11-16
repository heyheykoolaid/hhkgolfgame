// Nature kit, all procedural (no image files): turf/sand/dirt detail textures + a terrain material that draws greens,
// fringes and bunkers per pixel (crisp round edges, lips, mowing patterns), and textured tree models — California
// live oaks and Mexican fan palms — instanced across the course.
import * as THREE from 'three';
import { COURSE, WATER_Y, TREES, classify, fairwayHW, heightAt } from '@gh/shared';
import { windSway } from './wind';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- canvas helpers
const BASE = (import.meta as any).env?.BASE_URL ?? './';
/** Swap a drawn texture for a CC0 photo from public/ground once it loads (asset-audit.md). If the photo fails, the
 *  drawn one stays. `normal` rebuilds a normal map from the photo's brightness. */
export function photoTex(t: THREE.Texture, name: string, normal?: [THREE.Texture, number]) {
  new THREE.ImageLoader().load(`${BASE}ground/${name}.jpg`, img => {
    t.dispose(); // the size may differ from the drawn canvas
    t.image = img;
    t.needsUpdate = true;
    if (normal) {
      const c = cv(img.width, img.height);
      c.getContext('2d')!.drawImage(img, 0, 0);
      normal[0].dispose();
      normal[0].image = normalFromHeight(c, normal[1]);
      normal[0].needsUpdate = true;
    }
  });
  return t;
}
/** A tiling photo texture from public/ground, for meshes that don't have a drawn fallback. */
export function groundPhoto(name: string, fallback: string) {
  const c = cv(4);
  const x = c.getContext('2d')!;
  x.fillStyle = fallback;
  x.fillRect(0, 0, 4, 4);
  return photoTex(tex(c, true), name);
}
function cv(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normalFromHeight(h: HTMLCanvasElement, strength = 2) {
  const w = h.width,
    H = h.height,
    src = h.getContext('2d')!.getImageData(0, 0, w, H).data;
  const out = cv(w, H),
    octx = out.getContext('2d')!,
    img = octx.createImageData(w, H),
    d = img.data;
  const at = (x: number, y: number) => src[(((y + H) % H) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength,
        dy = (at(x, y + 1) - at(x, y - 1)) * strength,
        l = Math.hypot(dx, dy, 1),
        i = (y * w + x) * 4;
      d[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  octx.putImageData(img, 0, 0);
  return out;
}
function tex(c: HTMLCanvasElement, srgb: boolean, rep = true) {
  const t = new THREE.CanvasTexture(c);
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
/** Draw with wrap-around so the texture tiles. */
function wrapDraw(W: number, x: number, y: number, f: (x: number, y: number) => void) {
  for (const ox of [-W, 0, W])
    for (const oy of [-W, 0, W]) {
      if (x + ox < -40 || x + ox > W + 40 || y + oy < -40 || y + oy > W + 40) continue;
      f(x + ox, y + oy);
    }
}

// ---------------------------------------------------------------- ground textures (lazily built once)
let GT: { grass: THREE.Texture; grassN: THREE.Texture; sand: THREE.Texture; dirt: THREE.Texture; noise: THREE.Texture } | null = null;
function groundTextures() {
  if (GT) return GT;
  const W = 512,
    r = rng(7);
  // grass: a grey "detail" map (multiplied onto the turf colour) — thousands of short blades, light tips, dark roots
  const g = cv(W),
    gx = g.getContext('2d')!;
  gx.fillStyle = '#7a7a7a';
  gx.fillRect(0, 0, W, W);
  for (let i = 0; i < 22000; i++) {
    const x = r() * W,
      y = r() * W,
      L = 3 + r() * 7,
      a = -Math.PI / 2 + (r() - 0.5) * 0.9,
      v = (70 + r() * 110) | 0;
    gx.strokeStyle = `rgba(${v},${v},${v},${0.35 + r() * 0.5})`;
    gx.lineWidth = 0.7 + r() * 1.1;
    wrapDraw(W, x, y, (px, py) => {
      gx.beginPath();
      gx.moveTo(px, py);
      gx.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
      gx.stroke();
    });
  }
  for (let i = 0; i < 260; i++) {
    const x = r() * W,
      y = r() * W,
      rr = 4 + r() * 16,
      v = r() < 0.5 ? 0 : 255;
    gx.fillStyle = `rgba(${v},${v},${v},.05)`;
    wrapDraw(W, x, y, (px, py) => {
      gx.beginPath();
      gx.arc(px, py, rr, 0, 7);
      gx.fill();
    });
  }
  // sand: warm grain, darker damp specks, faint rake lines
  const s = cv(W),
    sx = s.getContext('2d')!;
  sx.fillStyle = '#d9c497';
  sx.fillRect(0, 0, W, W);
  for (let i = 0; i < 60000; i++) {
    const v = r();
    sx.fillStyle = v < 0.45 ? 'rgba(160,138,96,.35)' : v < 0.9 ? 'rgba(240,226,190,.4)' : 'rgba(120,100,70,.5)';
    sx.fillRect(r() * W, r() * W, 1 + (r() < 0.2 ? 1 : 0), 1);
  }
  for (let y = 0; y < W; y += 9) {
    sx.strokeStyle = 'rgba(150,128,90,.12)';
    sx.lineWidth = 2;
    sx.beginPath();
    for (let x = 0; x <= W; x += 8) sx.lineTo(x, y + Math.sin(x * 0.0245 + y) * 2.5);
    sx.stroke();
  }
  // dirt (hardpan, cart path): packed tan earth, pebbles, hairline cracks
  const d = cv(W),
    dx = d.getContext('2d')!;
  dx.fillStyle = '#a88a62';
  dx.fillRect(0, 0, W, W);
  for (let i = 0; i < 400; i++) {
    const x = r() * W,
      y = r() * W,
      rr = 8 + r() * 30;
    dx.fillStyle = r() < 0.5 ? 'rgba(130,100,66,.16)' : 'rgba(196,170,128,.16)';
    wrapDraw(W, x, y, (px, py) => {
      dx.beginPath();
      dx.arc(px, py, rr, 0, 7);
      dx.fill();
    });
  }
  for (let i = 0; i < 1400; i++) {
    const x = r() * W,
      y = r() * W,
      rr = 0.6 + r() * 1.6,
      v = (130 + r() * 70) | 0;
    dx.fillStyle = `rgb(${v},${(v * 0.85) | 0},${(v * 0.65) | 0})`;
    dx.beginPath();
    dx.arc(x, y, rr, 0, 7);
    dx.fill();
  }
  dx.strokeStyle = 'rgba(80,60,40,.35)';
  dx.lineWidth = 0.8;
  for (let i = 0; i < 70; i++) {
    let x = r() * W,
      y = r() * W;
    dx.beginPath();
    dx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 30;
      y += (r() - 0.5) * 30;
      dx.lineTo(x, y);
    }
    dx.stroke();
  }
  // macro noise: big soft blotches (breaks up tiling, sun-bleached patches)
  const n = cv(256),
    nx = n.getContext('2d')!;
  nx.fillStyle = '#808080';
  nx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) {
    const x = r() * 256,
      y = r() * 256,
      rr = 6 + r() * 34,
      v = r() < 0.5 ? 0 : 255;
    const gr = nx.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, `rgba(${v},${v},${v},.12)`);
    gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    nx.fillStyle = gr;
    wrapDraw(256, x, y, (px, py) => {
      nx.save();
      nx.translate(px - x, py - y);
      nx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      nx.restore();
    });
  }
  GT = { grass: tex(g, false), grassN: tex(normalFromHeight(g, 2.2), false), sand: tex(s, true), dirt: tex(d, true), noise: tex(n, false) };
  photoTex(GT.sand, 'sand');
  photoTex(GT.dirt, 'dirt');
  return GT;
}

// ---------------------------------------------------------------- terrain material
const MAXB = 24;
/** Turf material for the hole mesh. The mesh supplies vertex colours (fairway/rough/etc.), a `dirt` weight and
 *  world-scaled uvs; greens, fringes, bunkers and their lips are drawn per pixel from the current hole's shapes. */
/** The hole cut in the green: the cup's real radius (the simulation's CUP_R) plus a hair, so the liner shows. */
export const CUP_HOLE_R = 0.056;
export function terrainMaterial() {
  const T = groundTextures();
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
    normalMap: T.grassN,
    normalScale: new THREE.Vector2(0.55, 0.55),
  });
  const b = COURSE.bunkers.slice(0, MAXB),
    g = COURSE.green,
    p = COURSE.pond;
  const U = {
    tGrass: { value: T.grass },
    tSand: { value: T.sand },
    tDirt: { value: T.dirt },
    tNoise: { value: T.noise },
    uBunk: { value: Array.from({ length: MAXB }, (_, i) => new THREE.Vector3(b[i]?.x ?? 1e5, b[i]?.z ?? 1e5, b[i]?.r ?? 0)) },
    uGreen: { value: new THREE.Vector4(g.x, g.z, g.rx, g.rz) },
    uGreenA: { value: g.ang || 0 },
    uPondA: { value: p?.ang || 0 },
    uPond: { value: new THREE.Vector4(p?.x ?? 1e5, p?.z ?? 1e5, p?.rx ?? 1, p?.rz ?? 1) },
    uWaterY: { value: WATER_Y },
    uCup: { value: new THREE.Vector3(COURSE.pin.x, COURSE.pin.z, CUP_HOLE_R) }, // the hole is really cut out of the green
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float dirt; varying float vDirt; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDirt = dirt; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D tGrass, tSand, tDirt, tNoise; uniform vec3 uBunk[${MAXB}]; uniform vec4 uGreen, uPond; uniform float uWaterY, uGreenA, uPondA; uniform vec3 uCup;
float ghGE = 9.0;
vec2 ghRot(vec2 d, float a) { float c = cos(a), s = sin(a); return vec2(d.x * c - d.y * s, d.x * s + d.y * c); }
varying float vDirt; varying vec3 vWP;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 w = vWP.xz;
  float cupD = length(w - uCup.xy); if (cupD < uCup.z) discard;
  float det = texture2D(tGrass, w * 0.42).r * 0.6 + texture2D(tGrass, w * 0.097 + 0.37).r * 0.4;   // two scales: no visible tiling
  float mac = texture2D(tNoise, w / 64.0).r, mac2 = texture2D(tNoise, w / 230.0 + 0.5).r;
  vec3 col = diffuseColor.rgb * (0.45 + det * 1.05) * (0.8 + mac * 0.4) * (0.9 + mac2 * 0.2);
  // dry, bleached patches in the rough come from the macro noise
  col = mix(col, col * vec3(1.18, 1.08, 0.82), smoothstep(0.56, 0.68, mac2) * 0.5);
  // dirt (cart path, hardpan)
  vec3 dirtC = (texture2D(tDirt, w * 0.22).rgb * 0.55 + texture2D(tDirt, mat2(0.8, -0.6, 0.6, 0.8) * w * 0.057 + 0.37).rgb * 0.45) * (0.9 + mac * 0.2);
  col = mix(col, dirtC, smoothstep(0.25, 0.75, vDirt));
  // fringe + green: per-pixel ellipse, fine double-cut pattern on the green
  vec2 gq = ghRot(w - uGreen.xy, uGreenA) / uGreen.zw; float ge = dot(gq, gq); ghGE = ge;
  float gW = 1.0 - smoothstep(0.975, 1.02, ge), fW = (1.0 - smoothstep(1.26, 1.32, ge)) - gW;
  vec3 fringeC = vec3(0.30, 0.40, 0.15) * (0.7 + det * 0.6);
  float cut = step(0.5, fract((w.x + w.y) * 0.18)) * 0.06 - step(0.5, fract((w.x - w.y) * 0.18)) * 0.04;
  vec3 greenC = vec3(0.36, 0.50, 0.19) * (0.86 + cut + texture2D(tGrass, w * 1.3).r * 0.22) * (0.95 + mac * 0.1);
  col = mix(col, fringeC, clamp(fW, 0.0, 1.0)); col = mix(col, greenC, gW);
  // bunkers: crisp sand with a darker grass lip and a shadowed inner edge
  float sW = 0.0, lip = 0.0, rim = 0.0;
  for (int i = 0; i < ${MAXB}; i++) { vec3 b = uBunk[i]; if (b.z <= 0.0) continue; float d = length(w - b.xy);
    sW = max(sW, 1.0 - smoothstep(b.z - 0.08, b.z + 0.06, d)); lip = max(lip, (1.0 - smoothstep(b.z, b.z + 0.9, d)) * step(b.z, d));
    rim = max(rim, smoothstep(b.z - 1.2, b.z, d) * step(d, b.z)); }
  vec3 sandC = (texture2D(tSand, w * 0.3).rgb * 0.55 + texture2D(tSand, mat2(0.8, -0.6, 0.6, 0.8) * w * 0.071 + 0.37).rgb * 0.45) * (0.93 + mac * 0.14) * (1.0 - rim * 0.28);
  col = mix(col * (1.0 - lip * 0.25), sandC, sW);
  // wet, darker banks right at the waterline
  vec2 pq = ghRot(w - uPond.xy, uPondA) / uPond.zw; float pd = dot(pq, pq);
  col *= 1.0 - (1.0 - smoothstep(1.0, 1.5, pd)) * 0.35;
  col *= 0.55 + 0.45 * smoothstep(uCup.z, uCup.z + 0.02, cupD);   // the worn, darker lip of the hole
  diffuseColor.rgb = col;
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, 1.0 - smoothstep(0.975, 1.02, ghGE));',
      );
  };
  m.customProgramCacheKey = () => 'gh-terrain-' + MAXB;
  return m;
}

// ---------------------------------------------------------------- foliage textures
let FT: Record<string, THREE.Texture> | null = null;
function foliageTextures() {
  if (FT) return FT;
  const r = rng(99),
    W = 256;
  // oak leaves: clusters of small dark-olive leaves, transparent gaps (outer shell) and a solid version (inner volume)
  const leaves = (solid: boolean) => {
    const c = cv(W),
      x = c.getContext('2d')!;
    if (solid) {
      x.fillStyle = '#5d6e36';
      x.fillRect(0, 0, W, W);
    }
    for (let i = 0; i < (solid ? 2600 : 1700); i++) {
      const px = r() * W,
        py = r() * W,
        a = r() * 6.28,
        l = 3 + r() * 4,
        h = 0.19 + r() * 0.09,
        s = 0.32 + r() * 0.18,
        li = 0.34 + r() * 0.24;
      x.fillStyle = `hsl(${(h * 360) | 0},${(s * 100) | 0}%,${(li * 100) | 0}%)`;
      wrapDraw(W, px, py, (qx, qy) => {
        x.save();
        x.translate(qx, qy);
        x.rotate(a);
        x.beginPath();
        x.ellipse(0, 0, l, l * 0.45, 0, 0, 7);
        x.fill();
        x.restore();
      });
    }
    return c;
  };
  // fan-palm frond: stiff leaflets fanning out from the petiole tip, slight yellowing at the ends
  const fr = cv(256, 256),
    fx = fr.getContext('2d')!;
  for (let i = 0; i < 46; i++) {
    const a = Math.PI * (0.06 + (0.88 * i) / 45) + (r() - 0.5) * 0.03,
      L = 150 + r() * 95 - Math.abs(i - 22) * 1.6,
      w0 = 4.5 + r() * 2;
    const gr = fx.createLinearGradient(128, 250, 128 + Math.cos(a) * L, 250 - Math.sin(a) * L);
    gr.addColorStop(0, '#6a8a38');
    gr.addColorStop(0.7, '#8ca24a');
    gr.addColorStop(1, '#c2b464');
    fx.fillStyle = gr;
    fx.save();
    fx.translate(128, 250);
    fx.rotate(-a);
    fx.beginPath();
    fx.moveTo(0, -w0 * 0.3);
    fx.lineTo(L * 0.9, -w0 * 0.5);
    fx.lineTo(L, 0);
    fx.lineTo(L * 0.9, w0 * 0.5);
    fx.lineTo(0, w0 * 0.3);
    fx.fill();
    fx.restore();
  }
  // dead-frond skirt: hanging brown thatch with a ragged hem
  const sk = cv(128, 256),
    kx = sk.getContext('2d')!;
  for (let i = 0; i < 260; i++) {
    const x0 = r() * 128,
      L = 120 + r() * 136,
      v = (90 + r() * 70) | 0;
    kx.strokeStyle = `rgb(${v},${(v * 0.78) | 0},${(v * 0.52) | 0})`;
    kx.lineWidth = 2 + r() * 3;
    kx.beginPath();
    kx.moveTo(x0, 0);
    kx.quadraticCurveTo(x0 + (r() - 0.5) * 12, L * 0.5, x0 + (r() - 0.5) * 18, L);
    kx.stroke();
  }
  // oak bark: dark grey-brown, deep vertical furrows
  const bk = cv(128, 256),
    bx = bk.getContext('2d')!;
  bx.fillStyle = '#4b3f33';
  bx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 160; i++) {
    const x0 = r() * 128,
      v = (40 + r() * 70) | 0;
    bx.strokeStyle = `rgba(${v},${(v * 0.9) | 0},${(v * 0.8) | 0},.8)`;
    bx.lineWidth = 1 + r() * 4;
    bx.beginPath();
    bx.moveTo(x0, 0);
    for (let y = 0; y <= 256; y += 16) bx.lineTo(x0 + Math.sin(y * 0.05 + i) * 3, y);
    bx.stroke();
  }
  // palm trunk: tight horizontal rings of old leaf bases, grey-tan
  const pt = cv(64, 256),
    px = pt.getContext('2d')!;
  px.fillStyle = '#7d6c58';
  px.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 5) {
    px.fillStyle = `rgba(${(50 + r() * 30) | 0},${(40 + r() * 20) | 0},30,.55)`;
    px.fillRect(0, y, 64, 1.6);
    px.fillStyle = 'rgba(190,170,140,.18)';
    px.fillRect(0, y + 2, 64, 1);
  }
  for (let i = 0; i < 400; i++) {
    px.fillStyle = `rgba(${r() < 0.5 ? 60 : 160},${r() < 0.5 ? 50 : 140},40,.15)`;
    px.fillRect(r() * 64, r() * 256, 2, 1);
  }
  FT = {
    leaves: tex(leaves(false), true),
    leavesSolid: tex(leaves(true), true),
    frond: tex(fr, true, false),
    skirt: tex(sk, true, false),
    bark: tex(bk, true),
    barkN: tex(normalFromHeight(bk, 3), false),
    palm: tex(pt, true),
    palmN: tex(normalFromHeight(pt, 2.5), false),
  };
  photoTex(FT.bark, 'bark', [FT.barkN, 3]);
  photoTex(FT.palm, 'palmbark', [FT.palmN, 2.5]);
  return FT;
}

// ---------------------------------------------------------------- tree geometry
function noise3(x: number, y: number, z: number) {
  return Math.sin(x * 1.7 + y * 2.3) * Math.cos(z * 1.9 - x * 0.7) + 0.5 * Math.sin(y * 3.1 + z * 2.7);
}
/** Lumpy foliage blob: icosphere, noise-displaced, normals bent toward the canopy centre for soft round shading. */
function blob(c: THREE.Vector3, rad: number, squash: number, canopyC: THREE.Vector3, seed: number, detail = 1) {
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  const g = mergeVertices(ico),
    p = g.attributes.position,
    v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.18 * noise3(v.x * 2 + seed, v.y * 2, v.z * 2 - seed);
    v.multiplyScalar(rad * k);
    v.y *= squash;
    v.add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
  const n = g.attributes.normal,
    uv = g.attributes.uv,
    col: number[] = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const s = v.clone().sub(canopyC).normalize(),
      bn = new THREE.Vector3().fromBufferAttribute(n, i).lerp(s, 0.65).normalize();
    n.setXYZ(i, bn.x, bn.y, bn.z);
    uv.setXY(i, (v.x + v.z) * 0.32, v.y * 0.32);
    const ao = THREE.MathUtils.clamp(0.6 + 0.5 * ((v.y - (canopyC.y - rad)) / (rad * 2.2)), 0.55, 1.05);
    col.push(ao, ao, ao); // darker underneath
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 7) {
  const L = a.distanceTo(b),
    g = new THREE.CylinderGeometry(r1, r0, L, seg, 3, true);
  g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * L * 0.5);
  return g;
}
function merge(gs: THREE.BufferGeometry[]) {
  const out = new THREE.BufferGeometry(),
    keys = ['position', 'normal', 'uv', 'color'].filter(k => gs.every(g => g.attributes[k]));
  const parts = gs.map(g => (g.index ? g.toNonIndexed() : g));
  for (const k of keys) {
    const size = parts[0].attributes[k].itemSize,
      arr: number[] = [];
    for (const g of parts) arr.push(...(g.attributes[k].array as Float32Array));
    out.setAttribute(k, new THREE.Float32BufferAttribute(arr, size));
  }
  return out;
}
interface TreeModel {
  parts: { geo: THREE.BufferGeometry; mat: THREE.Material; tint?: boolean }[];
}
let MODELS: { oaks: TreeModel[]; palms: TreeModel[]; pines: TreeModel[] } | null = null;
function models() {
  if (MODELS) return MODELS;
  const F = foliageTextures(),
    V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const bark = new THREE.MeshStandardMaterial({ map: F.bark, normalMap: F.barkN, roughness: 1 });
  const leafIn = new THREE.MeshStandardMaterial({ map: F.leavesSolid, vertexColors: true, roughness: 0.95 });
  const leafOut = new THREE.MeshStandardMaterial({ map: F.leaves, vertexColors: true, roughness: 0.9, alphaTest: 0.45, side: THREE.DoubleSide });
  const palmBark = new THREE.MeshStandardMaterial({ map: F.palm, normalMap: F.palmN, roughness: 1 });
  const frond = new THREE.MeshStandardMaterial({ map: F.frond, roughness: 0.85, alphaTest: 0.4, side: THREE.DoubleSide });
  const skirt = new THREE.MeshStandardMaterial({ map: F.skirt, roughness: 1, alphaTest: 0.35, side: THREE.DoubleSide });
  windSway(leafIn, 'leaves');
  windSway(leafOut, 'leaves');
  windSway(palmBark, 'palm');
  windSway(skirt, 'palm');
  windSway(frond, 'frond');
  // California live oak: short stout trunk forking into a few limbs, a wide low dome of leafy clumps (crown ≈ r 2.7, y 4.6)
  const oaks: TreeModel[] = [];
  for (let v = 0; v < 3; v++) {
    const r = rng(300 + v),
      cc = V(0, 4.6, 0),
      wood: THREE.BufferGeometry[] = [limb(V(0, -0.4, 0), V(0.15, 2.2, 0.05), 0.34, 0.24, 9)],
      inner: THREE.BufferGeometry[] = [],
      outer: THREE.BufferGeometry[] = [];
    const n = 6 + v;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + r() * 0.5,
        d = 1.2 + r() * 1.3,
        c = V(Math.cos(a) * d, 4.2 + r() * 1.2, Math.sin(a) * d),
        rad = 1.25 + r() * 0.7;
      wood.push(limb(V(0.15, 2.0, 0.05), V(c.x * 0.7, c.y - 0.9, c.z * 0.7), 0.17, 0.08));
      inner.push(blob(c, rad * 0.92, 0.72, cc, i + v * 10));
      outer.push(blob(c, rad * 1.08, 0.74, cc, i + v * 10 + 5));
    }
    inner.push(blob(V(0, 5.3, 0), 1.6, 0.7, cc, 77 + v));
    outer.push(blob(V(0, 5.35, 0), 1.75, 0.72, cc, 78 + v));
    oaks.push({
      parts: [
        { geo: merge(wood), mat: bark },
        { geo: merge(inner), mat: leafIn, tint: true },
        { geo: merge(outer), mat: leafOut, tint: true },
      ],
    });
  }
  // Mexican fan palm (Washingtonia): tall thin trunk with a gentle lean, a shaggy skirt of dead fronds, a crown of fans
  const palms: TreeModel[] = [];
  for (let v = 0; v < 2; v++) {
    const r = rng(500 + v),
      H = 10 + v * 1.6,
      lean = V(0.04 + r() * 0.05, 0, 0.02);
    const trunk: THREE.BufferGeometry[] = [],
      segs = 6;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs,
        t1 = (i + 1) / segs,
        a = V(lean.x * H * t0 * t0, H * t0 - 0.3, lean.z * H * t0 * t0),
        b = V(lean.x * H * t1 * t1, H * t1, lean.z * H * t1 * t1);
      trunk.push(limb(a, b, 0.27 - 0.07 * t0, 0.27 - 0.07 * t1, 9));
    }
    const top = V(lean.x * H, H, lean.z * H);
    // skirt: a ring of hanging cards below the crown
    const sk: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 6.28,
        q = new THREE.PlaneGeometry(0.75, 1.9);
      q.translate(0, -0.95, 0);
      q.rotateX(0.12);
      q.translate(0, 0, 0.22);
      q.rotateY(a);
      q.translate(top.x, top.y + 0.1, top.z);
      sk.push(q);
    }
    // fronds: fan blades on petioles, radiating and drooping (older, lower ones droop more)
    const fr: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 18; i++) {
      const a = i * 2.39996 + r() * 0.3,
        droop = -0.15 + (i % 3) * 0.32 + r() * 0.2,
        q = new THREE.PlaneGeometry(2.0, 2.0, 2, 2);
      {
        const p = q.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const x = p.getX(k),
            y = p.getY(k) + 1;
          p.setXYZ(k, x, y, -0.18 * x * x);
        }
      } // cupped fan
      q.rotateX(Math.PI / 2 - 0.25);
      q.translate(0, 0, 0.55);
      q.rotateX(droop);
      q.rotateY(a);
      q.translate(top.x, top.y + 0.2, top.z);
      fr.push(q);
    }
    palms.push({
      parts: [
        { geo: merge(trunk), mat: palmBark },
        { geo: merge(sk), mat: skirt },
        { geo: merge(fr), mat: frond, tint: true },
      ],
    });
  }
  // Mountain pine: a straight trunk and stacked skirts of dark needles, each tier a little ragged and drooping
  const pines: TreeModel[] = [],
    needles = new THREE.MeshStandardMaterial({ color: '#3d5c3a', roughness: 0.95, flatShading: true });
  windSway(needles, 'leaves');
  for (let v = 0; v < 3; v++) {
    const r = rng(700 + v),
      H = 9.5 + v * 2.2,
      tiers = 6 + v,
      cones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1),
        rad = (2.5 - 2.0 * t) * (0.9 + r() * 0.2),
        hh = (H * 0.78) / tiers + 1.3,
        g = new THREE.ConeGeometry(rad, hh, 9, 1),
        p = g.attributes.position;
      for (let k = 0; k < p.count; k++)
        if (p.getY(k) < 0) {
          // the skirt's rim: uneven, and hanging a little
          const j = 0.82 + r() * 0.36;
          p.setXYZ(k, p.getX(k) * j, p.getY(k) - r() * 0.35, p.getZ(k) * j);
        }
      g.rotateY(r() * 6.28);
      g.translate((r() - 0.5) * 0.15, H * 0.2 + t * H * 0.7 + hh / 2, (r() - 0.5) * 0.15);
      cones.push(g);
    }
    pines.push({
      parts: [
        { geo: limb(V(0, -0.4, 0), V(0.05, H * 0.92, 0.03), 0.3, 0.05, 8), mat: bark },
        { geo: merge(cones), mat: needles, tint: true },
      ],
    });
  }
  for (const m of [...oaks, ...palms, ...pines])
    for (const p of m.parts) {
      if (!p.geo.attributes.normal) p.geo.computeVertexNormals();
      p.geo.computeBoundingSphere();
    }
  MODELS = { oaks, palms, pines };
  return MODELS;
}

/** Instance the course trees (palm or oak by the tree's own random flags). Everything is added to `group`. */
export function buildTrees(
  group: THREE.Object3D,
  trees: { x: number; y: number; z: number; s: number; tint: number; id: number }[],
  kind: 'mixed' | 'pine' = 'mixed',
) {
  const M = models(),
    buckets = new Map<TreeModel, typeof trees>();
  trees.forEach((t, i) => {
    const m = kind === 'pine' ? M.pines[t.id % 3] : i % 3 === 0 ? M.palms[t.id % 2] : M.oaks[t.id % 3];
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m)!.push(t);
  });
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3(),
    p = new THREE.Vector3(),
    c = new THREE.Color(),
    up = new THREE.Vector3(0, 1, 0);
  for (const [model, list] of buckets) {
    const palm = M.palms.includes(model);
    for (const part of model.parts) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      im.castShadow = !(
        part.tint &&
        !palm &&
        (part.mat as any).alphaTest > 0
      ); /* the oaks' see-through outer leaves don't need their own shadow pass */
      im.receiveShadow = true;
      im.userData.shared = true;
      list.forEach((t, i) => {
        const k = palm ? 0.8 + t.s * 0.35 : t.s;
        q.setFromAxisAngle(up, t.tint * 37);
        im.setMatrixAt(i, m4.compose(p.set(t.x, t.y, t.z), q, s.set(k, k * (palm ? 1 : 0.95 + t.tint * 0.15), k)));
        if (part.tint)
          im.setColorAt(
            i,
            c
              .setHSL(0, 0, 1)
              .lerp(
                new THREE.Color(kind === 'pine' ? (t.tint < 0.5 ? '#c8e0c0' : '#e6e2b0') : t.tint < 0.5 ? '#e8f0c0' : '#f4dca0'),
                (t.tint % 0.5) * 0.9,
              ),
          );
      });
      group.add(im);
    }
  }
}

/** A single palm (lobby, dressing). Shares the instanced palms' geometry/materials. */
export function palmModel(h = 9) {
  const M = models(),
    m = M.palms[h > 10 ? 1 : 0],
    g = new THREE.Group(),
    k = h / (m === M.palms[0] ? 10 : 11.6);
  for (const part of m.parts) {
    const mesh = new THREE.Mesh(part.geo, part.mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.shared = true;
    g.add(mesh);
  }
  g.scale.setScalar(k);
  return g;
}

/** Boulder Peak's granite: boulders strewn through the rough and the out-of-bounds, clear of the fairway and green. */
export function buildBoulders(group: THREE.Object3D) {
  const r = rng((COURSE.seed || 7) * 31 + 5),
    B = COURSE.bounds,
    mat = new THREE.MeshStandardMaterial({ color: '#8f8a82', roughness: 0.95, flatShading: true }),
    shapes = [0, 1, 2].map(v => {
      const g = new THREE.IcosahedronGeometry(1, 1),
        p = g.attributes.position,
        rr = rng(900 + v),
        sq = 0.55 + rr() * 0.3;
      // every corner pushed in or out by its own amount, the same for the copies of a corner the faces share
      const seen = new Map<string, number>();
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        let k = seen.get(key);
        if (k === undefined) seen.set(key, (k = 0.72 + rr() * 0.5));
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * sq, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      return g;
    }),
    spots: { x: number; y: number; z: number; s: number; a: number }[][] = [[], [], []];
  for (let n = 0, tries = 0; n < 90 && tries < 4000; tries++) {
    const x = B.x0 + r() * (B.x1 - B.x0),
      z = B.z0 + r() * (B.z1 - B.z0),
      k = classify(x, z);
    if (k.s !== 'rough' && k.s !== 'heavy' && k.s !== 'ob') continue;
    if (k.s === 'rough' && k.d < fairwayHW(k.along) + 9) continue; // well off the short grass
    if (Math.hypot(x, z) < 22 || Math.hypot(x - COURSE.pin.x, z - COURSE.pin.z) < 26) continue;
    if (TREES.some(t => Math.hypot(t.x - x, t.z - z) < 3)) continue;
    const s = 0.5 + r() * r() * 2.6;
    spots[n % 3].push({ x, y: heightAt(x, z) - s * 0.22, z, s, a: r() * 6.28 });
    n++;
  }
  // the outcrops you can land on: each a huddle of flat slabs, so it reads as rock you'd rather not hit
  for (const k of COURSE.rocks || []) {
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + r(),
        dd = i ? k.r * (0.3 + r() * 0.45) : 0,
        x = k.x + Math.cos(a) * dd,
        z = k.z + Math.sin(a) * dd,
        s = k.r * (i ? 0.3 + r() * 0.25 : 0.55);
      spots[i % 3].push({ x, y: heightAt(x, z) - s * 0.42, z, s, a: r() * 6.28 });
    }
  }
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    c = new THREE.Color();
  spots.forEach((list, v) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(shapes[v], mat, list.length);
    im.castShadow = im.receiveShadow = true;
    list.forEach((b, i) => {
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(b.x, b.y, b.z), q.setFromAxisAngle(up, b.a), new THREE.Vector3(b.s, b.s * 0.85, b.s)));
      im.setColorAt(i, c.setHSL(0.08, 0.04, 0.78 + (b.a % 1) * 0.2));
    });
    group.add(im);
  });
}
