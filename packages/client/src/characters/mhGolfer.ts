// The golfer's body, clothes, hair and face from MakeHuman (CC0), prebuilt by tools/mh/build.py onto the game's rig.
// Everything is neutral grey and tinted per outfit here, so the wardrobe keeps working. Loaded once at start-up;
// if it fails to load, golfer.ts falls back to the procedural body.
import * as THREE from 'three';
import { capCloth } from './textures';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TATTOOS, TAT_SPOTS, type Outfit } from './golfer';

interface PartMeta {
  count: number;
  pos: number[];
  uv?: number[];
  uvf?: number[];
  normal?: number[];
  skinIndex: number[];
  skinWeight: number[];
  index: number[];
  indexCapped?: number[];
}
interface Meta {
  bones: string[];
  parts: Record<string, PartMeta>;
  print: number[];
  printBack: number[];
  soleY: number;
  headCentre: number[];
  hide: Record<string, number[]>;
  tuck: Record<string, number[]>;
  tex: Record<string, string>;
  eyes: number[];
  ear: number[];
  bind: Record<string, number[]>;
}
export interface Clip {
  fps: number;
  n: number;
  bones: string[];
  q: number[][];
  hips: number[][];
  ev?: Record<string, number>;
  loop?: boolean;
}
let CLIPS: Record<string, Clip> = {};
export const mhClip = (k: string): Clip | undefined => CLIPS[k];
let BASE = '';
type Assets = { meta: Meta; bin: ArrayBuffer; tex: Record<string, THREE.Texture>; img: Record<string, HTMLImageElement | ImageBitmap> };
/** A: the body being built right now. A0: the default (male) body, which also owns the skeleton and the textures. */
let A: Assets | null = null,
  A0: Assets | null = null,
  cur = '';
// Other body types (female, muscular…) are the same garments refitted to another body on the same skeleton, each in its
// own file, fetched the first time a look asks for it. Until it arrives that golfer is built with the default body.
const BODIES_LOADED: Record<string, { meta: Meta; bin: ArrayBuffer }> = {},
  loading = new Set<string>();
function unpack(meta: any) {
  const raw = atob(meta.bin),
    u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  delete meta.bin;
  return u8.buffer;
}
/** Is this body type ready to wear? (the default always is) */
/** A body type's own joint positions (null for the default body, or one that hasn't loaded). */
export const mhBindFor = (b?: string): Record<string, number[]> | null =>
  b && BODIES_LOADED[b] ? ((BODIES_LOADED[b].meta as any).bind ?? null) : null;
export const bodyReady = (b?: string) => !b || b === 'male' || !!BODIES_LOADED[b];
/** Fetch a body type; fires a window 'ghbody' event when it's ready so golfers wearing it can be rebuilt. */
export function loadBody(b?: string): Promise<boolean> {
  if (!A0 || bodyReady(b) || !/^(female|muscle|fmuscle)$/.test(b!)) return Promise.resolve(bodyReady(b));
  if (loading.has(b!)) return Promise.resolve(false);
  loading.add(b!);
  return fetch(BASE + 'golfer_' + b + '.json')
    .then(r => {
      if (!r.ok) throw new Error('body ' + r.status);
      return r.json();
    })
    .then(meta => {
      BODIES_LOADED[b!] = { bin: unpack(meta), meta };
      dispatchEvent(new Event('ghbody'));
      return true;
    })
    .catch(e => {
      console.warn('body type not loaded', b, e);
      return false;
    });
}
function useBody(b?: string) {
  const set = b && BODIES_LOADED[b];
  cur = set ? b! : '';
  A = set ? { ...A0!, meta: set.meta, bin: set.bin } : A0;
  if (b && !set) void loadBody(b);
}

export const mhReady = () => !!A0;
/** MakeHuman's joints as the rig's bind pose (bone name → local position). */
/** Curl axis per finger bone (bind frame). */
export const mhCurl = (): Record<string, number[]> | null => (A0?.meta as any)?.curl ?? null;
export const mhBind = (): Record<string, number[]> | null => (A0?.meta as any)?.bind ?? null;

/** Fetch the prebuilt golfer (geometry + textures). Resolves false (and leaves the procedural golfer) on any failure. */
export async function loadGolferAssets(baseUrl: string, expectBones: string[]): Promise<boolean> {
  try {
    const meta = await fetch(baseUrl + 'golfer.json').then(r => {
      if (!r.ok) throw new Error('json ' + r.status);
      return r.json();
    });
    // geometry is base64 inside the json (the artifact host serves json but not .bin files)
    const raw = atob(meta.bin),
      u8 = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    const bin = u8.buffer;
    delete meta.bin;
    if (meta.bones.join() !== expectBones.join()) throw new Error('rig mismatch');
    const L = new THREE.TextureLoader(),
      names = [
        'skin.jpg',
        'stubble.png',
        'suit.jpg',
        'suit_n.jpg',
        'shoes.jpg',
        'hair.png',
        'hair_n.jpg',
        'brows.png',
        'lashes.png',
        'eyes.jpg',
        'tattoos.png',
      ];
    const loaded = await Promise.all(names.map(n => L.loadAsync(baseUrl + n)));
    const tex: Record<string, THREE.Texture> = {},
      img: Record<string, any> = {};
    names.forEach((n, i) => {
      const k = n.replace(/\.(jpg|png)$/, ''),
        t = loaded[i];
      t.colorSpace = /_n$|stubble/.test(k) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.anisotropy = 4;
      tex[k] = t;
      img[k] = t.image;
    });
    BASE = baseUrl;
    DEC.clear();
    A = A0 = { meta, bin, tex, img };
    try {
      CLIPS = await fetch(baseUrl + 'anims.json').then(r => (r.ok ? r.json() : {}));
    } catch {
      CLIPS = {};
    } // motion capture (optional)
    return true;
  } catch (e) {
    console.warn('MakeHuman golfer not loaded, using the procedural one:', e);
    A = A0 = null;
    return false;
  }
}

const memo = new Map<string, any>();
const once = <T>(k: string, f: () => T): T => {
  if (!memo.has(k)) memo.set(k, f());
  return memo.get(k);
};
function canvasOf(src: HTMLImageElement | ImageBitmap, w = 1024, h = 1024) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.drawImage(src as any, 0, 0, w, h);
  return { c, x };
}
function canvasTex(c: HTMLCanvasElement, from: THREE.Texture) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = from.flipY;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** skin map with optional stubble (neutral grey: the outfit's skin colour tints it) */
function skinMap(stubble: boolean) {
  return once('mhskin' + stubble, () => {
    if (!stubble) return A!.tex.skin;
    const { c, x } = canvasOf(A!.img.skin),
      m = canvasOf(A!.img.stubble),
      md = m.x.getImageData(0, 0, 1024, 1024).data;
    const id = x.getImageData(0, 0, 1024, 1024),
      d = id.data;
    let seed = 9;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1024 * 1024; i++) {
      const k = md[i * 4] / 255;
      if (k < 0.02) continue;
      const g = 0.55 + rnd() * 0.25,
        f = 1 - k * (0.32 + (rnd() > 0.55 ? 0.28 : 0)) * g; // fine dark speckle
      d[i * 4] *= f;
      d[i * 4 + 1] *= f;
      d[i * 4 + 2] *= f * 0.97;
    }
    x.putImageData(id, 0, 0);
    return canvasTex(c, A!.tex.skin);
  });
}
export interface Art {
  cv: HTMLCanvasElement;
  w: number;
  h: number;
  px: number; // art pixels per millimetre
}
/** Draw flat art (sized in millimetres, centred on x = 0 at height cy) onto a part's texture, triangle by triangle,
 *  so it follows the uv layout however it is stretched or curved. side: 1 = the front of the body, -1 = the back. */
function stampArt(
  x: CanvasRenderingContext2D,
  scale: number,
  d: Decoded,
  a: Art,
  cy: number,
  side: 1 | -1,
  zMin: number,
  alpha: number,
  fromSide = false, // look along x (an arm or a leg from its outer side) instead of along z
  u0 = 0, // where the art's centre sits across (metres: x from the front, z from the side)
) {
  const { pos, uv, index: idx } = d,
    PX = a.px;
  // art pixel for a body point: x across (mirrored on the back so it reads from behind), y down from the top
  const across = fromSide ? (i: number) => -side * (pos[i * 3 + 2] - u0) : (i: number) => side * (pos[i * 3] - u0),
    dc = fromSide ? 0 : 2;
  const px = (i: number) => [(across(i) * 1000 + a.w / 2) * PX, ((cy - pos[i * 3 + 1]) * 1000 + a.h / 2) * PX];
  const tx = (i: number) => [uv[i * 2] * 1024, (1 - uv[i * 2 + 1]) * 1024];
  x.globalAlpha = alpha;
  for (let t = 0; t < idx.length; t += 3) {
    const I = [idx[t], idx[t + 1], idx[t + 2]],
      zc = (pos[I[0] * 3 + dc] + pos[I[1] * 3 + dc] + pos[I[2] * 3 + dc]) / 3;
    if (zc * side < zMin) continue;
    const S = I.map(px);
    if (S.every(p => p[0] < -40 || p[0] > a.w * PX + 40 || p[1] < -40 || p[1] > a.h * PX + 40)) continue;
    const D = I.map(tx);
    // affine: art pixel → texture pixel
    const [s0, s1, s2] = S,
      [d0, d1, d2] = D,
      den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
    if (Math.abs(den) < 1e-6) continue;
    const ma = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / den,
      mc = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / den;
    const mb = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / den,
      md = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / den;
    const me = d0[0] - ma * s0[0] - mc * s0[1],
      mf = d0[1] - mb * s0[0] - md * s0[1];
    // clip to the triangle, grown by half a pixel so neighbouring triangles leave no hairline gaps
    const cxm = (d0[0] + d1[0] + d2[0]) / 3,
      cym = (d0[1] + d1[1] + d2[1]) / 3,
      g = (p: number[]) => {
        const dx = p[0] - cxm,
          dy = p[1] - cym,
          l = Math.hypot(dx, dy) || 1;
        return [p[0] + (dx / l) * 0.7, p[1] + (dy / l) * 0.7];
      };
    x.save();
    x.setTransform(scale, 0, 0, scale, 0, 0);
    x.beginPath();
    const [g0, g1, g2] = D.map(g);
    x.moveTo(g0[0], g0[1]);
    x.lineTo(g1[0], g1[1]);
    x.lineTo(g2[0], g2[1]);
    x.closePath();
    x.clip();
    x.setTransform(ma * scale, mb * scale, mc * scale, md * scale, me * scale, mf * scale);
    x.drawImage(a.cv, 0, 0);
    x.restore();
  }
  x.globalAlpha = 1;
}
/** A blank art canvas w × h millimetres with the origin at its centre. */
function art(w: number, h: number, colour: string, f: (g: CanvasRenderingContext2D) => void, PX = 4): Art {
  const cv = document.createElement('canvas');
  cv.width = w * PX;
  cv.height = h * PX;
  const g = cv.getContext('2d')!;
  g.scale(PX, PX);
  g.translate(w / 2, h / 2);
  g.fillStyle = g.strokeStyle = colour;
  g.textAlign = 'center';
  f(g);
  return { cv, w, h, px: PX };
}
/** tee: the shirt colour baked in, then the Golden Hills print on the chest and a big one on the back */
function teeMap(shirt: string, print: string) {
  return once('mhtee' + cur + shirt + print, () => {
    const { c, x } = canvasOf(A!.img.suit, 2048, 2048);
    x.scale(2, 2); // 2× so the print stays crisp
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = shirt;
    x.fillRect(0, 0, 1024, 1024);
    x.globalCompositeOperation = 'source-over';
    // The prints are drawn flat (in millimetres) and then mapped onto the tee triangle by triangle, so they follow
    // the cloth's uv layout exactly however it is stretched or curved.
    const front = art(170, 90, print, g => {
      g.beginPath();
      g.arc(0, -14, 13, Math.PI, 0);
      g.fill();
      g.font = '900 24px Impact, sans-serif';
      g.fillText('GOLDEN HILLS', 0, 14);
    });
    const back = art(220, 150, print, g => {
      g.beginPath();
      g.arc(0, -36, 30, Math.PI, 0);
      g.fill();
      g.font = '900 50px Impact, sans-serif';
      g.fillText('GOLDEN', 0, 16);
      g.font = '900 21px Impact, sans-serif';
      g.fillText('HILLS · EST 1962', 0, 42);
    });
    const d = dec('shirt');
    const stamp = (a: Art, cy: number, side: 1 | -1) => stampArt(x, 2, d, a, cy, side, 0.03, 0.93);
    stamp(front, 1.385, 1);
    stamp(back, 1.33, -1);
    return canvasTex(c, A!.tex.suit);
  });
}

interface Decoded {
  pos: Float32Array;
  uv: Float32Array;
  normal: Int8Array | null;
  si: Uint8Array;
  sw: Uint8Array;
  index: Uint16Array | Uint32Array;
  capped: Uint16Array | Uint32Array | null;
}
const DEC = new Map<string, Decoded>();
/** A part's arrays out of the packed file (positions and uvs are stored as 16-bit numbers). */
function dec(k: string): Decoded {
  const key = cur + ':' + k;
  let d = DEC.get(key);
  if (d) return d;
  const P = A!.meta.parts[k],
    b = A!.bin;
  const p16 = new Int16Array(b, P.pos[0], P.pos[1] / 2),
    pos = new Float32Array(p16.length);
  for (let i = 0; i < p16.length; i++) pos[i] = (p16[i] / 32767) * 2;
  let uv: Float32Array;
  if (P.uvf) uv = new Float32Array(b, P.uvf[0], P.uvf[1] / 4);
  else {
    const u16 = new Uint16Array(b, P.uv![0], P.uv![1] / 2);
    uv = new Float32Array(u16.length);
    for (let i = 0; i < u16.length; i++) uv[i] = u16[i] / 65535;
  }
  const ix = (r: number[]) => (P.count < 65536 ? new Uint16Array(b, r[0], r[1] / 2) : new Uint32Array(b, r[0], r[1] / 4));
  d = {
    pos,
    uv,
    normal: P.normal ? new Int8Array(b, P.normal[0], P.normal[1]) : null,
    si: new Uint8Array(b, P.skinIndex[0], P.skinIndex[1]),
    sw: new Uint8Array(b, P.skinWeight[0], P.skinWeight[1]),
    index: ix(P.index),
    capped: P.indexCapped ? ix(P.indexCapped) : null,
  };
  DEC.set(key, d);
  return d;
}
function geometry(k: string, capped = false) {
  const d = dec(k),
    g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(d.si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(d.sw, 4, true));
  g.setIndex(new THREE.BufferAttribute(capped && d.capped ? d.capped : d.index, 1));
  if (d.normal) g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3, true));
  else g.computeVertexNormals();
  return g;
}
/** The body with the skin under the worn garments left out (and the skin kept under cloth edges tucked in a little). */
function bodyGeometry(worn: string[]) {
  const d = dec('body'),
    M = A!.meta,
    g = new THREE.BufferGeometry(),
    nt = d.index.length / 3,
    hid = new Uint8Array(nt),
    tk = new Uint8Array(d.pos.length / 3);
  for (const k of worn) {
    const h = M.hide[k],
      t = M.tuck[k];
    if (h) for (const i of new Uint16Array(A!.bin, h[0], h[1] / 2)) hid[i] = 1;
    if (t) for (const i of new Uint16Array(A!.bin, t[0], t[1] / 2)) tk[i] = 1;
  }
  const pos = d.pos.slice(),
    n = d.normal!;
  for (let i = 0; i < tk.length; i++) if (tk[i]) for (let c = 0; c < 3; c++) pos[i * 3 + c] -= (n[i * 3 + c] / 127) * 0.006;
  let m = 0;
  for (let i = 0; i < nt; i++) if (!hid[i]) m++;
  const idx = new Uint16Array(m * 3);
  for (let i = 0, o = 0; i < nt; i++) if (!hid[i]) (idx.set(d.index.subarray(i * 3, i * 3 + 3), o), (o += 3));
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(d.si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(d.sw, 4, true));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
/** A wardrobe texture, fetched the first time something wears it (grey cloth: the material colour tints it). */
function lazy(name: string) {
  return once('lazy' + name, () => {
    const t = new THREE.TextureLoader().load(BASE + name);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Face paint: the skin colour baked in, then the design stamped on the front of the face. */
function paintedSkin(stubble: boolean, skin: string, paint: string, colour: string, o: Outfit) {
  const tats = TAT_SPOTS.map(k => o[k] || '').join(',');
  return once(`mhpaint${cur}${stubble}${skin}${paint}${colour}${tats}${o.tatInk}`, () => {
    const base = skinMap(stubble),
      { c, x } = canvasOf(base.image, 2048, 2048);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = skin;
    x.fillRect(0, 0, 2048, 2048);
    x.globalCompositeOperation = 'source-over';
    const E = A!.meta.eyes,
      ex = E[0] * 1000,
      y0 = -30; // the art is centred 30 mm below the eyes
    const a = art(190, 230, colour, g => {
      g.lineCap = 'round';
      const dot = (cx: number, cy: number, r: number) => {
        g.beginPath();
        g.arc(cx, cy, r, 0, 7);
        g.fill();
      };
      if (paint === 'eyeblack')
        for (const s of [-1, 1]) {
          g.beginPath();
          g.roundRect(s * ex - 14, y0 + 19, 28, 8, 3.5);
          g.fill();
        }
      else if (paint === 'stripes') {
        g.lineWidth = 5.5;
        for (const s of [-1, 1])
          for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.moveTo(s * (ex - 12), y0 + 26 + i * 11);
            g.lineTo(s * (ex + 26), y0 + 17 + i * 11);
            g.stroke();
          }
      } else if (paint === 'band') g.fillRect(-95, y0 - 17, 190, 33);
      else if (paint === 'star') {
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 6 : 14,
            t = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(ex + 8 + Math.cos(t) * r, y0 + 36 + Math.sin(t) * r);
        }
        g.fill();
      } else if (paint === 'whiskers') {
        g.beginPath();
        g.moveTo(-7, y0 + 33);
        g.lineTo(7, y0 + 33);
        g.lineTo(0, y0 + 42);
        g.fill();
        g.lineWidth = 2.2;
        for (const s of [-1, 1])
          for (let i = -1; i <= 1; i++) {
            g.beginPath();
            g.moveTo(s * 16, y0 + 50 + i * 3);
            g.lineTo(s * 52, y0 + 46 + i * 11);
            g.stroke();
          }
      } else if (paint === 'half') g.fillRect(0, -115, 95, 230);
      else if (paint === 'clown') {
        dot(0, y0 + 37, 10);
        g.globalAlpha = 0.75;
        for (const s of [-1, 1]) dot(s * (ex + 12), y0 + 48, 12);
        g.globalAlpha = 1;
        g.lineWidth = 3;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(s * ex, y0 - 24);
          g.lineTo(s * ex, y0 - 12);
          g.moveTo(s * ex, y0 + 12);
          g.lineTo(s * ex, y0 + 24);
          g.stroke();
        }
      }
    });
    if (paint) stampArt(x, 2, dec('body'), a, E[1] - 0.03, 1, E[2] - 0.075, 0.9);
    // tattoos: one design per spot, cut from the sheet; black designs take the ink colour
    const ink = o.tatInk || '#1c2430',
      B = A!.meta.bind,
      tat = (id: string | undefined, mm: number) => {
        const n = TATTOOS.findIndex(t => t.id === id);
        if (n < 0) return null;
        return art(mm, mm, ink, g => {
          g.drawImage(A!.img.tattoos as any, (n % 6) * 256, Math.floor(n / 6) * 256, 256, 256, -mm / 2, -mm / 2, mm, mm);
          if (!TATTOOS[n].colour) {
            g.globalCompositeOperation = 'source-in';
            g.fillRect(-mm / 2, -mm / 2, mm, mm);
          }
        });
      },
      body = dec('body'),
      put = (t: Art | null, cy: number, side: 1 | -1, min: number, fromSide = false, u0 = 0) =>
        t && stampArt(x, 2, body, t, cy, side, min, 0.86, fromSide, u0);
    put(tat(o.tatChest, 200), B.Spine2[1] + 0.04, 1, 0.03);
    put(tat(o.tatBack, 300), B.Spine2[1] - 0.02, -1, 0.03);
    const armY = (B.LeftArm[1] + B.LeftForeArm[1]) / 2 + 0.02,
      armX = (B.LeftArm[0] + B.LeftForeArm[0]) / 2,
      armZ = (B.LeftArm[2] + B.LeftForeArm[2]) / 2;
    put(tat(o.tatArmL, 85), armY, 1, armX - 0.012, true, armZ);
    put(tat(o.tatArmR, 85), armY, -1, armX - 0.012, true, armZ);
    put(tat(o.tatCalf, 88), (B.LeftLeg[1] + B.LeftFoot[1]) / 2 + 0.1, 1, (B.LeftLeg[0] + B.LeftFoot[0]) / 2 - 0.03, true, B.LeftLeg[2] - 0.012);
    return canvasTex(c, A!.tex.skin);
  });
}

// ---------------------------------------------------------------- accessories (small shapes, each fixed to one bone)
const V3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
function rigid(g: THREE.BufferGeometry, bone: string) {
  const bi = A!.meta.bones.indexOf(bone),
    n = g.attributes.position.count,
    si = new Uint8Array(n * 4),
    sw = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = bi;
    sw[i * 4] = 255;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
  return g;
}
/** A thin bar from a to b. */
function bar(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  const d = b.clone().sub(a),
    g = new THREE.BoxGeometry(t, t, d.length());
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
function glassesGeoms(style: string) {
  const E = A!.meta.eyes,
    ear = A!.meta.ear,
    [rx, ry, t] = style === 'shades' ? [0.027, 0.02, 0.16] : style === 'aviators' ? [0.027, 0.024, 0.06] : [0.021, 0.021, 0.08],
    z = E[2] + 0.013,
    y = E[1] - (style === 'aviators' ? 0.004 : 0.001),
    ex = Math.max(E[0], rx + 0.004);
  const frame: THREE.BufferGeometry[] = [],
    lens: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    frame.push(new THREE.TorusGeometry(1, t, 6, 28).scale(rx, ry, rx * 0.6).translate(s * ex, y, z));
    lens.push(new THREE.CircleGeometry(1, 24).scale(rx, ry, 1).translate(s * ex, y, z));
    const hinge = new THREE.Vector3(s * (ex + rx), y + 0.004, z);
    frame.push(bar(hinge, new THREE.Vector3(s * (ear[0] + 0.004), y + 0.002, ear[2] + 0.012), 0.003));
  }
  frame.push(bar(new THREE.Vector3(-(ex - rx), y + 0.005, z), new THREE.Vector3(ex - rx, y + 0.005, z), 0.003));
  return { frame: rigid(mergeGeometries(frame), 'Head'), lens: rigid(mergeGeometries(lens), 'Head') };
}
function blingGeoms(o: Outfit) {
  const B = A!.meta.bind,
    gold: THREE.BufferGeometry[] = [],
    dark: THREE.BufferGeometry[] = [];
  if (o.chain) {
    const n = V3(B.Neck);
    gold.push(rigid(new THREE.TorusGeometry(0.082, 0.0036, 6, 40).rotateX(Math.PI / 2 + 0.5).translate(0, n.y - 0.012, n.z + 0.026), 'Spine2'));
  }
  if (o.earring) {
    const e = A!.meta.ear;
    gold.push(rigid(new THREE.TorusGeometry(0.008, 0.0017, 6, 16).translate(e[0] - 0.002, e[1] - 0.024, e[2] + 0.004), 'Head'));
  }
  if (o.watch) {
    const f = V3(B.LeftForeArm),
      h = V3(B.LeftHand),
      ax = h.clone().sub(f).normalize(),
      p = f.clone().lerp(h, 0.9),
      out = new THREE.Vector3(1, 0, 0).addScaledVector(ax, -ax.x).normalize();
    const zq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax),
      yq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
    dark.push(rigid(new THREE.TorusGeometry(0.031, 0.0065, 6, 20).scale(1, 1, 1.6).applyQuaternion(zq).translate(p.x, p.y, p.z), 'LeftForeArm'));
    const c = p.clone().addScaledVector(out, 0.033);
    gold.push(rigid(new THREE.CylinderGeometry(0.017, 0.017, 0.009, 18).applyQuaternion(yq).translate(c.x, c.y, c.z), 'LeftForeArm'));
  }
  return { gold: gold.length ? mergeGeometries(gold) : null, dark: dark.length ? mergeGeometries(dark) : null };
}

const PANTS_PART: Record<string, string> = { jeans: 'pants', slacks: 'pants_slacks', shorts: 'pants_shorts', overalls: 'pants_overalls' };
const SHOE_PART: Record<string, string> = {
  sneakers: 'shoes',
  trainers: 'shoes_trainers',
  loafers: 'shoes_loafers',
  hikers: 'shoes_hikers',
  boots: 'shoes_boots',
  dress: 'shoes_dress',
};
/** Same shape as golfer.ts's buildBody(): one geometry + material per part. */
export function buildBodyMH(o: Outfit): { geoms: Record<string, THREE.BufferGeometry>; mats: Record<string, THREE.Material> } {
  useBody(o.body);
  const T = A!.tex,
    geoms: Record<string, THREE.BufferGeometry> = {},
    mats: Record<string, THREE.Material> = {};
  const style = o.capStyle || 'back',
    capped = style !== 'none';
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ metalness: 0, ...p });
  const P = A!.meta.parts,
    worn: string[] = [],
    wear = (key: string, part: string, mat: THREE.MeshStandardMaterialParameters) => {
      if (!P[part]) return;
      geoms[key] = geometry(part);
      mats[key] = std(mat);
      worn.push(part);
    },
    cloth = (part: string, color: string, rough = 0.92): THREE.MeshStandardMaterialParameters => ({
      map: lazy(A!.meta.tex[part]),
      color,
      roughness: rough,
    });
  // legs
  const pantsStyle = o.pantsStyle && PANTS_PART[o.pantsStyle] && P[PANTS_PART[o.pantsStyle]] ? o.pantsStyle : 'jeans',
    overalls = pantsStyle === 'overalls',
    pp = PANTS_PART[pantsStyle];
  if (pp === 'pants' || pp === 'pants_shorts') wear('pants', pp, { map: T.suit, normalMap: T.suit_n, color: o.pants, roughness: 0.95 });
  else wear('pants', pp, cloth(pp, o.pants, 0.95));
  // top half: overalls bring their own tee; a jacket brings what shows under it; otherwise the chosen top
  const fem = o.body === 'female' || o.body === 'fmuscle',
    top = fem && o.top === 'none' ? 'tee' : o.top || 'tee', // the female bodies always wear a top
    jacket = overalls ? 'none' : o.jacket || 'none',
    jc = o.jacketColor || '#3b4a2e';
  if (overalls) {
    if (top !== 'none') wear('shirt', 'top_overalls', cloth('top_overalls', o.shirt));
  } else if (jacket === 'padded' && P.jk_padded) {
    wear('jacket', 'jk_padded', cloth('jk_padded', jc, 0.85));
    wear('shirt', 'jk_padded_in', cloth('jk_padded_in', o.shirt));
  } else if (jacket === 'blazer' && P.jk_blazer) {
    wear('jacket', 'jk_blazer', cloth('jk_blazer', jc, 0.8));
    wear('shirt', 'jk_blazer_in', cloth('jk_blazer_in', o.shirt, 0.8));
    wear('tie', 'jk_blazer_tie', cloth('jk_blazer_tie', o.print || '#e9b23a', 0.6));
  } else if (top === 'long' && P.top_long) wear('shirt', 'top_long', cloth('top_long', o.shirt));
  else if (top === 'button' && P.top_button) wear('shirt', 'top_button', cloth('top_button', o.shirt, 0.85));
  else if (top !== 'none') wear('shirt', 'shirt', { map: teeMap(o.shirt, o.print || '#e9b23a'), normalMap: T.suit_n, roughness: 0.92 }); // single-sided: the tee has an inner lining layer just under its surface
  // feet
  const shoeStyle = o.shoeStyle || 'sneakers',
    sp = SHOE_PART[shoeStyle];
  if (shoeStyle === 'sneakers' || (shoeStyle !== 'bare' && !P[sp])) {
    // sneakers: the upper takes the shoe colour, the cupsole the sole colour (per-vertex)
    const g = geometry('shoes'),
      p = g.attributes.position,
      col = new Float32Array(p.count * 3),
      a = new THREE.Color(o.shoes),
      s = new THREE.Color(o.sole);
    for (let i = 0; i < p.count; i++) {
      const c = p.getY(i) < A!.meta.soleY ? s : a;
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geoms.shoe = g;
    mats.shoe = std({ map: T.shoes, vertexColors: true, roughness: 0.8 });
    worn.push('shoes');
  } else if (shoeStyle !== 'bare') wear('shoe', sp, cloth(sp, o.shoes, shoeStyle === 'dress' ? 0.35 : 0.7));
  if (shoeStyle !== 'bare') {
    const sk = 'sock' + (geoms.shoe && worn.includes('shoes') ? '' : sp.slice(5));
    if (P[sk]) {
      geoms.sock = geometry(sk);
      mats.sock = std({ map: sk === 'sock' ? T.shoes : lazy(A!.meta.tex[sk]), color: '#f4f1ea', roughness: 0.95 });
    }
  }
  // skin: whatever the clothes don't cover
  geoms.skin = bodyGeometry(worn);
  const paint = o.paint && o.paint !== 'none' ? o.paint : '';
  mats.skin =
    paint || TAT_SPOTS.some(k => o[k])
      ? std({ map: paintedSkin(o.stubble !== false, o.skin, paint, o.paintColor || '#1d1d1f', o), roughness: 0.58 })
      : std({ map: skinMap(o.stubble !== false), color: o.skin, roughness: 0.58 });
  // hair
  const hs = o.hairStyle || 'short',
    hp = hs === 'short' ? 'hair' : 'hair_' + hs;
  if (hs !== 'bald' && P[hp]) {
    geoms.hair = geometry(hp, capped);
    mats.hair = std({
      map: hp === 'hair' ? T.hair : lazy(A!.meta.tex[hp]),
      normalMap: hp === 'hair' ? T.hair_n : null,
      color: o.hair,
      roughness: 0.7,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    });
  }
  const brow = new THREE.Color(o.hair).multiplyScalar(0.75);
  geoms.brows = geometry('brows');
  mats.brows = std({ map: T.brows, color: brow, roughness: 0.8, alphaTest: 0.3, transparent: false });
  geoms.lashes = geometry('lashes');
  mats.lashes = std({ map: T.lashes, color: '#2a1d16', roughness: 0.8, alphaTest: 0.3, side: THREE.DoubleSide });
  geoms.eyes = geometry('eyes');
  mats.eyes = std({ map: T.eyes, roughness: 0.25 });
  if (style === 'fedora' && P.fedora) {
    geoms.cap = geometry('fedora');
    mats.cap = std({ map: lazy(A!.meta.tex.fedora), color: o.cap, roughness: 0.9, side: THREE.DoubleSide });
  } else if (capped) {
    const g = geometry(style === 'back' ? 'capBack' : 'cap'); // each fitted to the head: the skull isn't the same front and back
    const cc = capCloth(o.cap, 10);
    mats.cap = std({ map: cc.map, normalMap: cc.normalMap, roughness: 0.9, side: THREE.DoubleSide });
    geoms.cap = g;
  }
  if (o.glasses && o.glasses !== 'none') {
    const g = glassesGeoms(o.glasses),
      av = o.glasses === 'aviators';
    geoms.glasses = g.frame;
    mats.glasses = std({ color: av ? '#d8b24a' : '#141414', roughness: 0.35, metalness: av ? 0.4 : 0 });
    geoms.lenses = g.lens;
    mats.lenses =
      o.glasses === 'round'
        ? std({ color: '#cfe6ee', roughness: 0.1, transparent: true, opacity: 0.28 })
        : std({ color: av ? '#3d4a36' : '#0c0c0e', roughness: 0.12, metalness: av ? 0.5 : 0.2 });
  }
  const bl = blingGeoms(o);
  if (bl.gold) {
    geoms.bling = bl.gold;
    mats.bling = std({ color: '#e6bd45', roughness: 0.3, metalness: 0.35, emissive: '#3a2a08' });
  }
  if (bl.dark) {
    geoms.strap = bl.dark;
    mats.strap = std({ color: '#1a1a1c', roughness: 0.6 });
  }
  return { geoms, mats };
}
