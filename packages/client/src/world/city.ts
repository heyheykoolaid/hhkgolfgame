// The city around Golden Hills (asset-audit.md): classic pre-war brick mid-rises with window grids, cornices, wooden
// water towers and fire escapes; brownstone rows; and a skyline of stepped art-deco towers. Think downtown LA's
// historic core or Manhattan, in golden-hour haze. Facades are real Poly Haven brick / stone photo textures (CC0,
// public/city/*.jpg); the windows are drawn by a few lines of shader on top (frames, stone lintels and sills,
// glass that catches the sky, some lit warm), so every building is just four quads. Everything sharing a material is
// merged into one mesh: a few draw calls for the whole city.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BASE = (import.meta as any).env?.BASE_URL ?? './';
interface Style {
  tex: string;
  tint: string;
  bay: number;
  floor: number;
  win: [number, number, number, number];
  stone: string;
  lit: number;
  tile: number;
}
/** win: window rectangle inside one bay × floor cell (x0, x1, y0, y1, as fractions). */
const STYLES: Record<string, Style> = {
  red: { tex: 'red_brick_03', tint: '#ffffff', bay: 2.5, floor: 3.3, win: [0.26, 0.74, 0.22, 0.78], stone: '#d9c9a6', lit: 0.12, tile: 1.6 },
  brown: { tex: 'brown_brick_02', tint: '#ffffff', bay: 2.2, floor: 3.4, win: [0.24, 0.76, 0.2, 0.8], stone: '#cbb38c', lit: 0.1, tile: 1.6 },
  tan: { tex: 'yellow_bricks', tint: '#f2e2c8', bay: 2.6, floor: 3.3, win: [0.25, 0.75, 0.24, 0.78], stone: '#efe2c6', lit: 0.12, tile: 1.6 },
  mill: { tex: 'factory_brick', tint: '#ffffff', bay: 3.4, floor: 4.0, win: [0.14, 0.86, 0.18, 0.82], stone: '#bfae90', lit: 0.08, tile: 1.8 },
  lime: { tex: 'sandstone_blocks_04', tint: '#f3e6cf', bay: 1.7, floor: 3.4, win: [0.3, 0.7, 0.12, 0.9], stone: '#f6ead2', lit: 0.16, tile: 2.4 },
  white: {
    tex: 'white_sandstone_bricks',
    tint: '#efe4d2',
    bay: 2.0,
    floor: 3.4,
    win: [0.28, 0.72, 0.16, 0.86],
    stone: '#f8efe0',
    lit: 0.14,
    tile: 2.0,
  },
};
const texCache = new Map<string, THREE.Texture>();
function brick(name: string, tile: number) {
  const key = name + tile;
  let t = texCache.get(key);
  if (t) return t;
  t = new THREE.TextureLoader().load(`${BASE}city/${name}.jpg`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.repeat.set(1 / tile, 1 / tile);
  texCache.set(key, t);
  return t;
}
/** A facade material: the brick photo, with windows drawn from the wall's metre-UVs. Long, soft haze for the skyline. */
function facadeMat(s: Style) {
  const m = new THREE.MeshStandardMaterial({ map: brick(s.tex, s.tile), color: s.tint, roughness: 0.92 });
  const stone = new THREE.Color(s.stone);
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSeed; varying float vSeed; varying vec2 vM;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvM = uv; vSeed = aSeed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vSeed; varying vec2 vM;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 cs = vec2(${s.bay.toFixed(2)}, ${s.floor.toFixed(2)}), cc = floor(vM / cs), ff = fract(vM / cs);
        bool shop = cc.y < 0.5;
        vec4 wr = shop ? vec4(.07, .93, .06, .82) : vec4(${s.win.map(v => v.toFixed(3)).join(', ')});
        float inW = step(wr.x, ff.x) * step(ff.x, wr.y) * step(wr.z, ff.y) * step(ff.y, wr.w);
        float core = step(wr.x + .05, ff.x) * step(ff.x, wr.y - .05) * step(wr.z + .045, ff.y) * step(ff.y, wr.w - .045);
        float mull = shop ? 0. : (1. - step(.035, abs(ff.y - (wr.z + wr.w) * .5 - .04)));   // the sash rail of a double-hung window
        float band = shop ? 0. : step(wr.x - .05, ff.x) * step(ff.x, wr.y + .05) * (step(wr.w, ff.y) * step(ff.y, wr.w + .075) + step(wr.z - .06, ff.y) * step(ff.y, wr.z));
        float rnd = fract(sin(dot(cc + vSeed * 13.17, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 glass = mix(vec3(.07, .08, .10), vec3(.46, .38, .32), smoothstep(.1, 1., ff.y)) * (shop ? .7 : 1.);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${stone.r.toFixed(3)}, ${stone.g.toFixed(3)}, ${stone.b.toFixed(3)}), band);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.12, .11, .10), inW * (1. - core));      // frames
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, core);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.14, .13, .12), core * mull);
        float cityLit = core * (1. - mull) * step(1. - ${s.lit.toFixed(2)}, rnd) * (shop ? .4 : 1.);
        float cityGlass = core;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .22, cityGlass);')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1., .66, .34) * .55 * cityLit;\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(.20, .16, .13) * (1. - cityGlass);   /* warm bounce: the shady side of a street is never black */',
      )
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
        float fogFactor = clamp((vFogDepth - 70.) / 760., 0., .82);   // long, soft haze: the skyline stays a silhouette, never vanishes
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
      #endif`,
      );
  };
  m.customProgramCacheKey = () => 'city-' + s.tex;
  return m;
}
const solid = (c: string, r = 0.85, met = 0) => {
  const m = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: met });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG\nfloat fogFactor = clamp((vFogDepth - 70.) / 760., 0., .82); gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);\n#endif`,
    );
  };
  m.customProgramCacheKey = () => 'city-solid';
  return m;
};

// ---------------------------------------------------------------- geometry batching --------------------------------
class Batch {
  geos = new Map<string, THREE.BufferGeometry[]>();
  add(key: string, g: THREE.BufferGeometry) {
    let a = this.geos.get(key);
    if (!a) this.geos.set(key, (a = []));
    a.push(g);
  }
}
const _m = new THREE.Matrix4();
function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rot: number) {
  _m.makeRotationY(rot).setPosition(x, y, z);
  return g.applyMatrix4(_m);
}
/** Four walls with UVs in metres (u along the wall, v up from the street), plus a per-building seed for the windows. */
function walls(w: number, d: number, h: number, y0: number, seed: number) {
  const parts: THREE.BufferGeometry[] = [];
  const wall = (len: number, ry: number, ox: number, oz: number) => {
    const p = new THREE.PlaneGeometry(len, h);
    const uv = p.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, y0 + uv.getY(i) * h);
    p.translate(0, h / 2, 0);
    p.rotateY(ry);
    p.translate(ox, 0, oz);
    parts.push(p);
  };
  wall(w, 0, 0, d / 2);
  wall(w, Math.PI, 0, -d / 2);
  wall(d, Math.PI / 2, w / 2, 0);
  wall(d, -Math.PI / 2, -w / 2, 0);
  const g = mergeGeometries(parts)!;
  g.translate(0, y0, 0);
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(seed), 1));
  return g;
}
const boxG = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cylG = (r0: number, r1: number, h: number, seg: number, x = 0, y = 0, z = 0) =>
  new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);

interface BOpts {
  cornice?: boolean;
  tank?: boolean;
  escape?: boolean;
  stoop?: boolean;
}
/** A brick mid-rise: walls, parapet, cornice, a tar roof; optional water tower, fire escape (on its +z face), stoop. */
function midrise(B: Batch, style: string, x: number, z: number, rot: number, w: number, d: number, floors: number, seed: number, o: BOpts) {
  const S = STYLES[style],
    h = floors * S.floor;
  B.add('f:' + style, place(walls(w, d, h + 0.9, 0, seed), x, 0, z, rot));
  B.add('roof', place(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, h + 0.15, 0), x, 0, z, rot));
  if (o.cornice) {
    B.add('stone:' + style, place(boxG(w + 0.7, 0.45, d + 0.7, 0, h + 0.55), x, 0, z, rot));
    B.add('stone:' + style, place(boxG(w + 0.3, 0.25, d + 0.3, 0, S.floor - 0.1), x, 0, z, rot));
  }
  if (o.tank) {
    // a wooden water tower on steel legs
    const tx = ((seed % 3) - 1) * w * 0.22,
      tz = (((seed >> 2) % 3) - 1) * d * 0.2,
      ty = h + 0.15;
    for (const [lx, lz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      B.add('steel', place(boxG(0.14, 2.6, 0.14, tx + lx * 1.1, ty, tz + lz * 1.1), x, 0, z, rot));
    B.add('wood', place(cylG(1.5, 1.6, 3.0, 12, tx, ty + 2.6, tz), x, 0, z, rot));
    B.add('tankroof', place(new THREE.ConeGeometry(1.7, 1.2, 12).translate(tx, ty + 6.2, tz), x, 0, z, rot));
  }
  if (o.escape && floors >= 4) {
    // zig-zag fire escape down the front, from the second floor up
    for (let f = 1; f < floors; f++) {
      const py = f * S.floor + 0.05;
      B.add('steel', place(boxG(3.2, 0.06, 1.0, 0, py, d / 2 + 0.5), x, 0, z, rot));
      B.add('steel', place(boxG(3.2, 0.9, 0.04, 0, py, d / 2 + 1.0), x, 0, z, rot));
      const st = boxG(0.5, 0.05, Math.hypot(2.4, S.floor), 0, 0, 0);
      st.rotateX(Math.atan2(S.floor, 2.4) * (f % 2 ? 1 : -1));
      st.rotateY(Math.PI / 2);
      st.translate(f % 2 ? 0.2 : -0.2, py - S.floor / 2, d / 2 + 0.6);
      B.add('steel', place(st, x, 0, z, rot));
    }
  }
  if (o.stoop) for (let i = 0; i < 6; i++) B.add('stone:' + style, place(boxG(1.8, 0.2, 0.32, 0, i * 0.2, d / 2 + 2.0 - i * 0.3), x, 0, z, rot));
}
/** An art-deco tower: stacked setbacks, a stepped crown and a spire. */
function decoTower(B: Batch, style: string, x: number, z: number, rot: number, w: number, h: number, seed: number) {
  const tiers: [number, number][] = [
    [1, 0.5],
    [0.78, 0.22],
    [0.58, 0.13],
    [0.42, 0.08],
    [0.26, 0.05],
  ];
  let y = 0;
  tiers.forEach(([s, f], i) => {
    const tw = w * s,
      th = h * f;
    B.add('f:' + style, place(walls(tw, tw * (0.85 + (seed % 3) * 0.05), th, y, seed + i), x, 0, z, rot));
    B.add('stone:' + style, place(boxG(tw + 0.6, 0.6, tw * 0.9 + 0.6, 0, y + th - 0.3), x, 0, z, rot));
    y += th;
  });
  B.add('spire', place(cylG(0.15, w * 0.06, h * 0.12, 6, 0, y, 0), x, 0, z, rot));
}
/** A plain far tower for the skyline ring. */
function farTower(B: Batch, style: string, x: number, z: number, rot: number, w: number, d: number, h: number, seed: number) {
  B.add('f:' + style, place(walls(w, d, h, 0, seed), x, 0, z, rot));
  B.add('roof', place(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, h, 0), x, 0, z, rot));
  if (seed % 2) B.add('stone:' + style, place(boxG(w * 0.6, h * 0.12, d * 0.6, 0, h), x, 0, z, rot));
}

function finish(B: Batch, root: THREE.Object3D) {
  const mats = new Map<string, THREE.Material>();
  const matFor = (k: string) => {
    let m = mats.get(k);
    if (m) return m;
    if (k.startsWith('f:')) m = facadeMat(STYLES[k.slice(2)]);
    else if (k.startsWith('stone:')) m = solid(STYLES[k.slice(6)].stone, 0.85);
    else
      m = solid(
        ({ roof: '#5f5751', steel: '#232323', wood: '#6e4c2e', tankroof: '#3e3128', spire: '#c9c2b2' } as Record<string, string>)[k] || '#888',
        k === 'steel' || k === 'spire' ? 0.5 : 0.9,
        k === 'spire' ? 0.6 : 0,
      );
    mats.set(k, m);
    return m;
  };
  for (const [k, gs] of B.geos) {
    const g = mergeGeometries(
      gs
        .map(x => (x.index ? x.toNonIndexed() : x))
        .map(x => {
          for (const a of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'aSeed'].includes(a)) x.deleteAttribute(a);
          return x;
        }),
    )!;
    const mesh = new THREE.Mesh(g, matFor(k));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    root.add(mesh);
  }
}

let rs = 1;
const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];

/**
 * The city around the town: blocks of brick mid-rises just outside the streets (shorter near, taller further out),
 * a brownstone row, and a downtown skyline of art-deco towers toward the sunset (backlit, golden), plus a ring of
 * far towers. `keepOut` is the half-size of the square the town needs clear.
 */
export function buildCity(
  scene: THREE.Object3D,
  o: { center: [number, number]; keepOut: number; sunAz: number; near?: boolean; rings: [number, number]; tall?: number },
) {
  rs = 12345;
  const T = o.tall ?? 1;
  const B = new Batch(),
    root = new THREE.Group();
  root.name = 'city';
  const [cx, cz] = o.center;
  const facing = (x: number, z: number) => {
    const a = Math.atan2(cx - x, cz - z);
    return Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  };
  if (o.near) {
    // city blocks right outside town: a 24 m grid, two or three buildings per block
    const K = o.keepOut,
      step = 24;
    for (let gx = -144; gx <= 144; gx += step)
      for (let gz = -144; gz <= 144; gz += step) {
        const ax = Math.abs(gx),
          az = Math.abs(gz);
        if (Math.max(ax, az) < K + 12) continue;
        const dist = Math.hypot(gx, gz),
          n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const w = 8 + rnd() * 9,
            d = 9 + rnd() * 8,
            x = cx + gx + (i - (n - 1) / 2) * (step / n) + (rnd() - 0.5) * 2,
            z = cz + gz + (rnd() - 0.5) * 4;
          const floors = Math.round(
            dist < 75 ? 3 + rnd() * 2.4 : dist < 110 ? 4 + rnd() * 3.5 : 6 + rnd() * 7,
          ); /* low near, so the skyline shows over the roofs */
          midrise(B, pick(['red', 'red', 'brown', 'tan', 'mill', 'white']), x, z, facing(x, z), w, d, floors, Math.floor(rnd() * 1e6), {
            cornice: rnd() < 0.8,
            tank: rnd() < 0.45,
            escape: dist < 95 && rnd() < 0.6,
          });
        }
      }
    // a brownstone row along the south side, stoops onto the street
    for (let i = 0; i < 9; i++) midrise(B, 'brown', cx - 40 + i * 7, cz + K + 14, Math.PI, 6.6, 12, 4, 500 + i, { cornice: true, stoop: true });
  }
  // downtown: art-deco towers toward the sunset, backlit
  for (let i = 0; i < 12; i++) {
    const a = o.sunAz + (rnd() - 0.5) * 0.9,
      r = o.rings[0] + rnd() * (o.rings[1] - o.rings[0]) * 0.7,
      x = cx + Math.sin(a) * r,
      z = cz + Math.cos(a) * r;
    decoTower(B, pick(['lime', 'white', 'tan']), x, z, rnd() * 0.3, (22 + rnd() * 16) * T, (90 + rnd() * 140) * T, Math.floor(rnd() * 1e6));
  }
  // and a ring of plainer towers all the way round
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rnd() * 0.08,
      r = o.rings[0] + rnd() * (o.rings[1] - o.rings[0]),
      x = cx + Math.sin(a) * r,
      z = cz + Math.cos(a) * r;
    farTower(
      B,
      pick(['red', 'tan', 'white', 'lime', 'brown']),
      x,
      z,
      facing(x, z),
      (18 + rnd() * 20) * T,
      (16 + rnd() * 18) * T,
      (30 + rnd() * 70) * T,
      Math.floor(rnd() * 1e6),
    );
  }
  finish(B, root);
  scene.add(root);
  return root;
}
