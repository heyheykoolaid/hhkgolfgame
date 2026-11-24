// Builds the Golden Hills Hole 1 scene from the shared course data, lit to the art target:
// low amber sun, long shadows, dusty warm haze, desaturated olive turf.
import * as THREE from 'three';
import { waterMaterial } from './water';
import { COURSE, heightAt, classify, fairwayHW, TREES, WATER_Y, CENTER_PTS, centerInfo, FLOOR } from '@gh/shared';
import { loadAsset } from '../assets';
import { terrainMaterial, buildTrees, buildBoulders } from './nature';
import { photoSky, cloudLayer } from './sky';
import { skyLife } from './skylife';
import { buildCity } from './city';
import { locale } from './locale';
import { buildMountains } from './mountains';
import { rustyRocket } from './rocket';
import { hauntSky, tripSky, hauntDressing, tripDressing, resetDecor } from './locales';

export const SKY_TOP = new THREE.Color('#d9925a'),
  HAZE = new THREE.Color('#f0c99a');

/** The sun: low in the west-north-west, 12° up (matches the sky photo's sunset; long golden-hour shadows). */
export const SUN_AZ = Math.atan2(-0.55, -0.79);
const SUN_DIR = (() => {
  const h = new THREE.Vector2(-0.55, -0.79).normalize(),
    e = THREE.MathUtils.degToRad(12);
  return new THREE.Vector3(h.x * Math.cos(e), Math.sin(e), h.y * Math.cos(e));
})();
export function buildLighting(scene: THREE.Scene) {
  scene.fog = new THREE.Fog(HAZE, 90, 520);
  scene.add(new THREE.HemisphereLight('#f6d3a4', '#4a3c26', 0.9));
  const sun = new THREE.DirectionalLight('#ffbf78', 4.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  // sky dome: gold at the horizon, warm peach above, slightly cooler at the zenith
  const R = 1500,
    g = new THREE.SphereGeometry(R, 32, 16),
    p = g.attributes.position,
    cols: number[] = [];
  const zen = new THREE.Color('#b9a48e');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / R;
    const c =
      y > 0
        ? HAZE.clone()
            .lerp(SKY_TOP, Math.min(1, y * 2.2))
            .lerp(zen, Math.max(0, y - 0.45) * 1.2)
        : HAZE.clone().lerp(new THREE.Color('#8a7656'), Math.min(1, -y * 4));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.dispose();
  const fallback = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = photoSky(R, SUN_DIR, HAZE, fallback);
  (sky.geometry as THREE.BufferGeometry).setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); // gradient until the photo loads
  sky.name = 'sky';
  const clouds = cloudLayer(SUN_DIR),
    life = skyLife(SUN_DIR, HAZE);
  clouds.name = 'clouds';
  life.name = 'skylife';
  scene.add(sky, clouds, life);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(40, 32),
    new THREE.MeshBasicMaterial({ color: '#fff2c8', fog: false, transparent: true, opacity: 0.9 }),
  );
  sunDisc.visible = false; // the photo has its own sun (the Moon's black sky needs this one)
  sunDisc.name = 'sunDisc';
  scene.add(sunDisc);
  return { sun, sky, sunDisc, SUN_DIR };
}

/** Boulder Peak: cooler alpine greens, grey gravel for the paths, pale granite sand. */
const TURF_PEAK: Record<string, string> = {
  tee: '#5f9f6c',
  fairway: '#579866',
  fringe: '#64a672',
  green: '#70b680',
  rough: '#3d6a52',
  heavy: '#2f5644',
  bunker: '#cfc8b8',
  path: '#9a9890',
  hardpan: '#8a8478',
  rock: '#8f8a82',
  water: '#3c5a5a',
  ob: '#35594a',
};
/** The Moon: grey regolith in every shade, a darker dust for the rough; the greens are landing pads (drawn per pixel). */
const TURF_MOON: Record<string, string> = {
  tee: '#a3a19c',
  fairway: '#9c9a95',
  fringe: '#8f8d88',
  green: '#8f8d88',
  rough: '#77756f',
  heavy: '#66645f',
  bunker: '#b8b2a6',
  path: '#8a857c',
  hardpan: '#85807a',
  rock: '#6e6c68',
  water: '#555',
  ob: '#6a6863',
};
/** The Old Estate: dark, overgrown, sodden lawns. */
const TURF_HAUNT: Record<string, string> = {
  tee: '#55623a',
  fairway: '#4f5f36',
  fringe: '#56663a',
  green: '#5a6b3c',
  rough: '#3c4528',
  heavy: '#323820',
  bunker: '#9c907a',
  path: '#6e6a62',
  hardpan: '#5e5446',
  water: '#22302a',
  ob: '#2e3320',
};
/** The Bad Batch: mint fairways (checkered, see buildTerrain), purple rough. */
const TURF_TRIP: Record<string, string> = {
  tee: '#6fe0a0',
  fairway: '#5fd38d',
  fringe: '#7ee6a6',
  green: '#7ee6a6',
  rough: '#9b62d6',
  heavy: '#7c45b8',
  bunker: '#ffd27a',
  path: '#ff9ad0',
  hardpan: '#ffb0d8',
  water: '#ff7ac8',
  ob: '#6e3aa8',
};
const turf = () =>
  locale.id === 'peak' ? TURF_PEAK : locale.id === 'moon' ? TURF_MOON : locale.id === 'haunt' ? TURF_HAUNT : locale.id === 'trip' ? TURF_TRIP : TURF;
const TURF: Record<string, string> = {
  tee: '#86a24c',
  fairway: '#7f9c47',
  fringe: '#8aa64e',
  green: '#93b257',
  rough: '#61793a',
  heavy: '#53682f',
  bunker: '#d6c196',
  path: '#b4a78f',
  hardpan: '#a1855f',
  water: '#4d5a3c',
  ob: '#5b6a34',
};
function hash(i: number, j: number) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Follow `center` with the sun's shadow box, snapped to whole shadow-map texels so shadows don't shimmer/crawl. */
const _q = new THREE.Quaternion(),
  _qi = new THREE.Quaternion(),
  _p = new THREE.Vector3(),
  _m = new THREE.Matrix4();
export function snapSun(sun: THREE.DirectionalLight, dir: THREE.Vector3, center: THREE.Vector3, dist = 150) {
  const cam = sun.shadow.camera as THREE.OrthographicCamera,
    texel = (cam.right - cam.left) / sun.shadow.mapSize.x;
  _m.lookAt(dir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
  _q.setFromRotationMatrix(_m);
  _qi.copy(_q).invert();
  _p.copy(center).applyQuaternion(_qi);
  _p.x = Math.round(_p.x / texel) * texel;
  _p.y = Math.round(_p.y / texel) * texel;
  _p.applyQuaternion(_q);
  sun.target.position.copy(_p);
  sun.position.copy(_p).addScaledVector(dir, dist);
  sun.target.updateMatrixWorld();
}
/** The current hole's ground (and pond), added to `scene` (a Group per hole, so it can be swapped). */
export function buildTerrain(scene: THREE.Object3D) {
  const B = COURSE.bounds,
    W = B.x1 - B.x0,
    L = B.z1 - B.z0,
    RES = 1.25;
  const nx = Math.round(W / RES) + 1,
    nz = Math.round(L / RES) + 1;
  const pos = new Float32Array(nx * nz * 3),
    col = new Float32Array(nx * nz * 3),
    uvs = new Float32Array(nx * nz * 2),
    dirt = new Float32Array(nx * nz),
    c = new THREE.Color(),
    TU = turf(),
    peakL = locale.id === 'peak',
    moonL = locale.id === 'moon',
    tripL = locale.id === 'trip';
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = B.x0 + (i * W) / (nx - 1),
        z = B.z0 + (j * L) / (nz - 1),
        o = (j * nx + i) * 3,
        k = classify(x, z);
      pos[o] = x;
      pos[o + 1] = heightAt(x, z);
      pos[o + 2] = z;
      // greens, fringes and bunkers are drawn per pixel by the material: give their vertices the surrounding grass colour
      const ks = k.s === 'green' || k.s === 'fringe' ? 'fringe' : k.s === 'bunker' ? 'rough' : k.s;
      uvs[(j * nx + i) * 2] = x * 0.35;
      uvs[(j * nx + i) * 2 + 1] = z * 0.35;
      dirt[j * nx + i] = k.s === 'path' || k.s === 'hardpan' ? 1 : 0;
      c.set(TU[ks] || TU.rough);
      if (k.s === 'fairway')
        c.multiplyScalar(tripL ? ((Math.floor(x / 6) + Math.floor(z / 6)) & 1 ? 1.22 : 0.78) : Math.floor(k.along / 9) & 1 ? 1.06 : 0.95);
      if (k.s === 'rough' && k.d < fairwayHW(k.along) + 1.8 && k.along > 40) c.lerp(new THREE.Color(TU.fairway), 0.4);
      const n = 1 + (hash(i, j) - 0.5) * 0.06;
      // dry, sun-bleached patches in the rough (the reference's patchy turf)
      if ((k.s === 'rough' || k.s === 'heavy' || k.s === 'ob') && hash(i >> 3, j >> 3) > 0.72)
        c.lerp(new THREE.Color(peakL ? '#5f8f70' : moonL ? '#8a8780' : tripL ? '#d07ae0' : '#9a8a55'), peakL ? 0.3 : moonL ? 0.35 : 0.45);
      col[o] = c.r * n;
      col[o + 1] = c.g * n;
      col[o + 2] = c.b * n;
    }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i,
        b = a + 1,
        cc = a + nx,
        d = cc + 1;
      idx[q++] = a;
      idx[q++] = cc;
      idx[q++] = b;
      idx[q++] = b;
      idx[q++] = cc;
      idx[q++] = d;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('dirt', new THREE.BufferAttribute(dirt, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, terrainMaterial());
  m.receiveShadow = true;
  scene.add(m);
  // endless ground just under the terrain's faded edge (per hole: hilly holes sit lower)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: moonL ? '#5c5a56' : tripL ? '#ffd9ef' : locale.id === 'haunt' ? '#2e3320' : '#6b6a3a' }));
  far.position.y = FLOOR - 0.05;
  scene.add(far);
  if (!COURSE.pond) return;
  // The pond: a sheet at water level that reaches exactly to the bank. From the middle, each of 96 spokes is walked
  // outward until the ground comes up through the water; the sheet's rim sits just past that point, so the water always
  // meets the terrain (the pond's nominal ellipse can be smaller or larger than the hollow the terrain really has).
  // Every vertex also carries how deep the water is under it: the shader draws foam and clear shallows from that.
  const pd = COURSE.pond,
    SPOKES = 96,
    RINGS = 22,
    reach = Math.max(pd.rx, pd.rz) * 2.4,
    wpos: number[] = [0, 0, 0],
    wdepth: number[] = [WATER_Y - heightAt(pd.x, pd.z)],
    widx: number[] = [];
  for (let a = 0; a < SPOKES; a++) {
    const ang = (a / SPOKES) * Math.PI * 2,
      dx = Math.cos(ang),
      dz = Math.sin(ang);
    let bank = reach;
    for (let r = 0.5; r < reach; r += 0.5)
      if (heightAt(pd.x + dx * r, pd.z + dz * r) > WATER_Y + 0.04) {
        bank = r;
        break;
      }
    bank += 0.9; // a little way under the bank, so no gap shows on a steep edge
    for (let k = 1; k <= RINGS; k++) {
      // rings bunch up toward the bank, where the wdepth changes fastest
      const r = bank * (1 - Math.pow(1 - k / RINGS, 1.6)),
        x = dx * r,
        z = dz * r;
      wpos.push(x, 0, z);
      wdepth.push(WATER_Y - heightAt(pd.x + x, pd.z + z));
    }
  }
  const at = (a: number, k: number) => 1 + (a % SPOKES) * RINGS + (k - 1);
  for (let a = 0; a < SPOKES; a++) {
    widx.push(0, at(a + 1, 1), at(a, 1));
    for (let k = 1; k < RINGS; k++) widx.push(at(a, k), at(a + 1, k), at(a, k + 1), at(a + 1, k), at(a + 1, k + 1), at(a, k + 1));
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wg.setAttribute('aDepth', new THREE.Float32BufferAttribute(wdepth, 1));
  wg.setIndex(widx);
  wg.computeVertexNormals();
  const water = new THREE.Mesh(wg, waterMaterial(locale.id === 'haunt' ? '#1f2a26' : tripL ? '#ff7ac8' : '#2a6f80', 0, 1, 0.9, true));
  water.position.set(pd.x, WATER_Y, pd.z);
  scene.add(water);
}

/** Vegetation: course trees become a mix of tall palms and scrubby oaks; instanced greybox until the kit lands. */
export function buildVegetation(scene: THREE.Object3D) {
  resetDecor();
  if (locale.id === 'haunt') {
    hauntDressing(scene);
    return;
  }
  if (locale.id === 'trip') {
    tripDressing(scene);
    return;
  }
  if (locale.id === 'moon') {
    buildBoulders(scene, 'moon');
    buildMoonBase(scene);
    return;
  }
  buildTrees(scene, TREES, locale.id === 'peak' ? 'pine' : 'mixed');
  if (locale.id === 'peak') buildBoulders(scene);
}
/** The horizon for the current locale: the city for Golden Hills, the mountain range for Boulder Peak. */
export function setBackdrop(scene: THREE.Object3D) {
  const city = scene.getObjectByName('city'),
    L = locale.id,
    peak = L === 'peak',
    moon = L === 'moon',
    haunt = L === 'haunt',
    trip = L === 'trip',
    /** the strange courses: no city, clouds, birds in the sky or clubhouse */
    odd = moon || haunt || trip;
  let mts = scene.getObjectByName('mountains');
  if (peak && !mts) scene.add((mts = buildMountains([20, 220], SUN_AZ)));
  if (city) city.visible = L === 'hills';
  if (mts) mts.visible = peak;
  // the light and the sky: Golden Hills is a low golden sun in haze; Boulder Peak is a clear, cool mountain afternoon;
  // the Moon is a black sky full of stars, the Earth hanging in it, and the same low golden sun
  const root = scene as THREE.Scene,
    hemi = root.children.find(o => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight | undefined,
    sun = root.children.find(o => (o as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight | undefined,
    sky = root.getObjectByName('sky');
  let dome = root.getObjectByName('peakSky'),
    space = root.getObjectByName('moonSky');
  if (peak && !dome) {
    const R = 1480,
      g = new THREE.SphereGeometry(R, 32, 18),
      p = g.attributes.position,
      cols: number[] = [],
      zen = new THREE.Color('#4f86c6'),
      mid = new THREE.Color('#9cc2e2'),
      hor = new THREE.Color('#e4ecf0'),
      warm = new THREE.Color('#ffe3b8'),
      c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / R,
        // a little warmth low in the west, where the sun is going down
        w = Math.max(0, Math.cos(Math.atan2(p.getX(i), p.getZ(i)) - SUN_AZ)) ** 3 * Math.max(0, 1 - Math.abs(y) * 4);
      c.copy(hor)
        .lerp(mid, Math.min(1, Math.max(0, y) * 3.2))
        .lerp(zen, Math.min(1, Math.max(0, y - 0.25) * 1.6))
        .lerp(warm, w * 0.7);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.name = 'peakSky';
    dome.renderOrder = -10;
    root.add(dome);
  }
  if (moon && !space) root.add((space = moonSky()));
  let hs = root.getObjectByName('hauntSky'),
    ts = root.getObjectByName('tripSky');
  if (haunt && !hs) root.add((hs = hauntSky(SUN_AZ)));
  if (trip && !ts) root.add((ts = tripSky(SUN_AZ)));
  if (hs) hs.visible = haunt;
  if (ts) ts.visible = trip;
  if (dome) dome.visible = peak;
  if (space) space.visible = moon;
  if (sky) sky.visible = L === 'hills';
  for (const n of ['clouds', 'skylife']) {
    const o = root.getObjectByName(n);
    if (o) o.visible = !odd;
  }
  const disc = root.getObjectByName('sunDisc');
  if (disc) {
    disc.visible = moon;
    disc.position.copy(SUN_DIR).multiplyScalar(1300);
    disc.lookAt(0, 0, 0);
  }
  const dress = root.getObjectByName('dressing');
  if (dress) dress.visible = !odd;
  // per course: [hemi sky, hemi ground, hemi strength, sun colour, sun strength, fog colour, fog near, fog far]
  const LOOK: Record<string, [string, string, number, string, number, string | THREE.Color, number, number]> = {
    hills: ['#f6d3a4', '#4a3c26', 0.9, '#ffbf78', 4.0, HAZE, 90, 520],
    peak: ['#dce8f4', '#56624e', 1.05, '#fff0d6', 3.5, '#cfd8de', 140, 760],
    moon: ['#8e96a8', '#3a3a3e', 0.75, '#ffd8a0', 4.4, '#2a2b30', 260, 1100],
    // the Old Estate's fog is thick: the flag is lost in it from about 140 m (the bird's-eye view finds it)
    haunt: ['#d08a6a', '#2a2018', 0.7, '#ff8a4a', 3.2, '#a04a32', 18, 160],
    trip: ['#ffc6ee', '#6a3aa0', 1.1, '#ffe0a0', 3.6, '#f3a6d8', 140, 620],
  };
  const lk = LOOK[L] || LOOK.hills;
  if (hemi) {
    hemi.color.set(lk[0]);
    hemi.groundColor.set(lk[1]);
    hemi.intensity = lk[2];
  }
  if (sun) {
    sun.color.set(lk[3]);
    sun.intensity = lk[4];
  }
  if (root.fog) {
    const f = root.fog as THREE.Fog;
    f.color.set(lk[5] as any);
    f.near = lk[6];
    f.far = lk[7];
  }
}

/** The Moon's sky: black, stars all over (fewer near the sun), and the Earth, lit from the sun's side so it shows as a
 *  fat crescent. Nothing here is in the fog. */
function moonSky() {
  const g = new THREE.Group(),
    R = 1400;
  g.name = 'moonSky';
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R + 80, 24, 12),
    new THREE.MeshBasicMaterial({ color: '#05060a', side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.renderOrder = -10;
  g.add(dome);
  let sd = 1234567;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647,
    pos: number[] = [],
    col: number[] = [],
    c = new THREE.Color(),
    sunH = new THREE.Vector3().copy(SUN_DIR);
  for (let n = 0; n < 2600; n++) {
    const u = r() * 2 - 1,
      a = r() * Math.PI * 2,
      s = Math.sqrt(1 - u * u),
      v = new THREE.Vector3(s * Math.cos(a), Math.abs(u) * 0.98 + 0.02, s * Math.sin(a));
    if (v.dot(sunH) > 0.93) continue; // the sun's glare washes them out
    pos.push(v.x * R, v.y * R, v.z * R);
    const b = 0.35 + r() ** 3 * 0.65;
    c.setHSL(r() < 0.2 ? 0.08 : 0.6, 0.25, b);
    col.push(c.r, c.g, c.b);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
  stars.renderOrder = -9;
  g.add(stars);
  // the Earth: a painted ball, high in the south-east (away from the low sun), lit by the sun
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#1f4f8f';
  x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 26; i++) {
    x.fillStyle = r() < 0.6 ? '#4f7a3a' : '#9a8350';
    x.beginPath();
    x.ellipse(r() * 256, 20 + r() * 88, 8 + r() * 26, 5 + r() * 14, r() * 3, 0, 7);
    x.fill();
  }
  x.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 40; i++) {
    x.beginPath();
    x.ellipse(r() * 256, r() * 128, 6 + r() * 30, 1.5 + r() * 4, r() * 0.6 - 0.3, 0, 7);
    x.fill();
  }
  x.fillStyle = '#f4f6f8';
  x.fillRect(0, 0, 256, 7);
  x.fillRect(0, 121, 256, 7);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 20), new THREE.MeshLambertMaterial({ map: tex, fog: false, emissive: '#0b1a33' }));
  const e = new THREE.Vector3(Math.sin(SUN_AZ + 2.3), 0.62, Math.cos(SUN_AZ + 2.3)).normalize();
  earth.position.copy(e).multiplyScalar(R * 0.82);
  earth.rotation.set(0.4, 1.1, 0.2);
  g.add(earth);
  // a soft blue glow round it
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(92, 32),
    new THREE.MeshBasicMaterial({ color: '#5f8fd8', transparent: true, opacity: 0.16, fog: false, depthWrite: false }),
  );
  halo.position.copy(earth.position).multiplyScalar(1.02);
  halo.lookAt(0, 0, 0);
  g.add(halo);
  return g;
}

/** What stands behind the Moon tee instead of the clubhouse and the car park: the Rusty Rocket that brought you (the
 *  Fun Land ride, scorched), two habitat domes, a radio mast and a flag. Built per hole: it sits on that hole's ground. */
function buildMoonBase(scene: THREE.Object3D) {
  const g = new THREE.Group(),
    white = new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.5, metalness: 0.1 }),
    steel = new THREE.MeshStandardMaterial({ color: '#8d9399', roughness: 0.4, metalness: 0.7 }),
    glass = new THREE.MeshStandardMaterial({ color: '#ffcf86', emissive: '#ffb050', emissiveIntensity: 0.8, roughness: 0.3 }),
    put = (o: THREE.Object3D, x: number, z: number, y = 0) => {
      o.position.set(x, heightAt(x, z) + y, z);
      o.traverse(m => ((m as THREE.Mesh).castShadow = (m as THREE.Mesh).receiveShadow = true));
      g.add(o);
      return o;
    };
  // the rocket that brought you, scorched from the trip
  const rk = rustyRocket(true);
  rk.rotation.set(0, 0.5, 0.04);
  put(rk, -16, -30);
  // two habitat domes, joined by a tube, with warm lit windows
  for (const [x, z, r] of [
    [14, -28, 5],
    [24, -34, 3.6],
  ]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), white);
    put(d, x, z, -0.2);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.5, 20, 1, true), steel);
    put(ring, x, z, 0.25);
    for (let k = 0; k < 4; k++) {
      const a = -Math.PI / 2 + (k - 1.5) * 0.45,
        w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), glass);
      w.position.set(x + Math.sin(a) * r * 0.93, heightAt(x, z) + r * 0.32, z + Math.cos(a) * r * 0.93);
      w.lookAt(x + Math.sin(a) * r * 3, heightAt(x, z) + r * 0.32, z + Math.cos(a) * r * 3);
      g.add(w);
    }
  }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 8, 10), white);
  tube.lookAt(new THREE.Vector3(10, 0, -6));
  tube.rotateX(Math.PI / 2);
  put(tube, 19, -31, 0.8);
  // radio mast with a dish
  const mast = new THREE.Group(),
    pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 9, 6), steel);
  pole.position.y = 4.5;
  mast.add(pole);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 8, 0, Math.PI * 2, 0, 0.9), white);
  dish.material = white.clone();
  (dish.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  dish.position.y = 9;
  dish.rotation.x = -2.2;
  mast.add(dish);
  put(mast, 30, -22);
  // the flag, stiff on its crossbar (no wind to fly it)
  const flag = new THREE.Group(),
    fp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), steel);
  fp.position.y = 1.6;
  flag.add(fp);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshStandardMaterial({ color: '#d8a23a', side: THREE.DoubleSide }));
  cloth.position.set(0.8, 2.7, 0);
  flag.add(cloth);
  put(flag, -7, -12);
  scene.add(g);
}

/** Set dressing behind the tee (same for every hole: the tee is always at the origin): clubhouse, parking lot with
 *  90s cars, power line along the road, a crate or two, the far ground plane and the horizon. */
export async function buildDressing(scene: THREE.Scene) {
  // (one group, so the Moon can hide it)
  const D = new THREE.Group();
  D.name = 'dressing';
  scene.add(D);
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(46, 22).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#6a655c' }));
  lot.position.set(-6, heightAt(-6, -34) + 0.03, -34);
  lot.receiveShadow = true;
  D.add(lot);
  const club = (await loadAsset('bld_clubhouse')).scene;
  club.position.set(14, heightAt(14, -26), -26);
  club.rotation.y = Math.PI;
  D.add(club);
  const cars = ['veh_sedan', 'veh_wagon', 'veh_sedan', 'veh_wagon', 'veh_sedan'];
  for (let i = 0; i < cars.length; i++) {
    const car = (await loadAsset(cars[i])).scene;
    car.position.set(-24 + i * 4.2, heightAt(-24 + i * 4.2, -40), -40);
    car.rotation.y = (Math.PI / 2) * (i % 2 ? 1 : -1) + Math.PI / 2;
    D.add(car);
  }
  const wires: THREE.Vector3[] = [];
  for (let x = -60; x <= 60; x += 20) {
    const pole = (await loadAsset('prop_power_pole')).scene;
    const y = heightAt(x, -48);
    pole.position.set(x, y, -48);
    D.add(pole);
    wires.push(new THREE.Vector3(x - 1, y + 8.45, -48), new THREE.Vector3(x + 1, y + 8.45, -48));
  }
  const wm = new THREE.LineBasicMaterial({ color: '#1e1a16' });
  for (let k = 0; k < 2; k++)
    for (let i = 0; i < wires.length / 2 - 1; i++) {
      const a = wires[i * 2 + k],
        b = wires[i * 2 + 2 + k],
        pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 12; s++) {
        const t = s / 12;
        pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -Math.sin(Math.PI * t) * 0.9, 0)));
      }
      D.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wm));
    }
  for (const [x, z] of [
    [4, -21],
    [5.2, -21.4],
  ]) {
    const cr = (await loadAsset('prop_crate')).scene;
    cr.position.set(x, heightAt(x, z), z);
    cr.rotation.y = x;
    D.add(cr);
  }
  /* the city skyline behind every course: art-deco towers toward the sunset, a ring of brick towers all round */
  buildCity(scene, { center: [20, 220], keepOut: 0, sunAz: SUN_AZ, rings: [470, 640], tall: 1.5 });
  setBackdrop(scene); // (this runs after the first hole has loaded: the city must not show behind Boulder Peak)
}
/** Chain-link fence along the right-hand OB line of the current hole. */
export function buildFence(scene: THREE.Object3D) {
  // chain-link fence down the right side (OB line) — instanced posts + a translucent mesh panel
  const posts: THREE.Vector3[] = [];
  for (const p of CENTER_PTS) {
    if (Math.round(p.along) % 6) continue;
    const i = CENTER_PTS.indexOf(p),
      q = CENTER_PTS[Math.min(i + 1, CENTER_PTS.length - 1)],
      r = CENTER_PTS[Math.max(i - 1, 0)];
    const dx = q.x - r.x,
      dz = q.z - r.z,
      L = Math.hypot(dx, dz) || 1;
    const x = p.x - (-dz / L) * COURSE.obDist * -1,
      z = p.z - (dx / L) * COURSE.obDist * -1;
    if (centerInfo(x, z).d > COURSE.obDist - 1) posts.push(new THREE.Vector3(x, heightAt(x, z), z));
  }
  const pm = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5).translate(0, 1.1, 0),
    new THREE.MeshStandardMaterial({ color: '#9a9a94', metalness: 0.6, roughness: 0.5 }),
    posts.length,
  );
  posts.forEach((v, i) => pm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(v.x, v.y, v.z)));
  scene.add(pm);
  const fenceTex = chainLinkTexture();
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i],
      b = posts[i + 1],
      L = a.distanceTo(b);
    if (L > 12) continue;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(L, 2.1),
      new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.6 }),
    );
    panel.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 1.05, (a.z + b.z) / 2);
    panel.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    scene.add(panel);
  }
}
function chainLinkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(190,190,182,1)';
  x.lineWidth = 2;
  for (let i = -64; i < 128; i += 12) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 64, 64);
    x.stroke();
    x.beginPath();
    x.moveTo(i + 64, 0);
    x.lineTo(i, 64);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 2);
  return t;
}
