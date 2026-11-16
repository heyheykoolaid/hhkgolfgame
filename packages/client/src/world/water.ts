// Water that looks like water: moving ripples that catch the sun, a surface that turns to sky at a glancing angle, a
// pale line of foam where it meets the bank, and (for fountains) falling droplets. All drawn in the shader from a few
// summed waves, so there is nothing to download; it shares the wind's clock, and ripples roughen in a gust.
import * as THREE from 'three';
import { WIND } from './wind';

const SKY = new THREE.Color('#d9c6a8'), // what a low golden-hour sky gives back
  HEAD_V = 'varying vec3 vWaterW; varying vec2 vWaterL;\n#ifdef WATER_DEPTH\nattribute float aDepth; varying float vWDepth;\n#endif',
  HEAD_F = `varying vec3 vWaterW; varying vec2 vWaterL;
#ifdef WATER_DEPTH
varying float vWDepth;
#endif
 uniform float uWT; uniform float uGust; uniform vec3 uWSky; uniform float uWRad; uniform float uWScale;
  vec3 waterWave(vec2 p, vec2 d, float k, float sp, float a) { float ph = dot(d, p) * k + uWT * sp; return vec3(a * k * d * cos(ph), a * sin(ph)); }`;

/**
 * @param color the water's own colour, seen looking straight down
 * @param radius the mesh's edge in its own units (a CircleGeometry's radius), for the foam line; 0 = no bank
 * @param depth the mesh has an `aDepth` attribute (metres of water under each vertex): the shoreline follows the ground
 * @param scale how big the ripples are: 1 for a pond, about 3 for a fountain basin (smaller, busier ripples)
 */
export function waterMaterial(color: string, radius = 1, scale = 1, opacity = 0.92, depth = false) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.09, metalness: 0.15, transparent: opacity < 1, opacity });
  m.userData.ownShader = true;
  if (depth) m.defines = { ...m.defines, WATER_DEPTH: '' }; // the mesh carries each vertex's water depth in `aDepth`
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, WIND, { uWSky: { value: SKY }, uWRad: { value: radius }, uWScale: { value: scale } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${HEAD_V}`)
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvWaterW = (modelMatrix * vec4(transformed, 1.0)).xyz; vWaterL = position.xz;\n#ifdef WATER_DEPTH\nvWDepth = aDepth;\n#endif',
      );
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${HEAD_F}`).replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
        {
          vec2 wp = vWaterW.xz * uWScale;
          wp += .7 * sin(wp.yx * .43 + uWT * .21); // bend the wave fronts so they never line up into stripes
          // fine ripples fade with distance (they'd only shimmer into bands out there)
          float near = clamp(1.15 - length(vViewPosition) / 55., .12, 1.);
          float chop = (.6 + .9 * uGust) * near;
          vec3 w = waterWave(wp, vec2(.86, .5), 1.7, 1.1, .030)
                 + waterWave(wp, vec2(-.35, .94), 2.9, 1.6, .018 * (.4 + .6 * near))
                 + waterWave(wp, vec2(.62, -.78), 5.3, 2.3, .010 * chop)
                 + waterWave(wp, vec2(-.93, -.36), 9.1, 3.1, .006 * chop)
                 + waterWave(wp, vec2(.17, .98), 15.7, 4.4, .0035 * chop);
          vec3 nW = normalize(vec3(-w.x, 1., -w.y));
          normal = normalize((viewMatrix * vec4(nW, 0.)).xyz);
          // glancing angles show the sky, straight down shows the water
          float fr = pow(1. - clamp(dot(normalize(vViewPosition), normal), 0., 1.), 3.);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .55, fr);
          totalEmissiveRadiance += uWSky * fr * .3;
          #ifdef WATER_DEPTH
          {
            // a real shoreline: foam where the water is a few centimetres deep, clear shallows, darker in the middle
            float d = vWDepth + w.z * .6;
            float foam = (1. - smoothstep(.02, .11, d)) * (.75 + .25 * sin(uWT * 1.7 + wp.x * 3.1 + wp.y * 2.3));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .62, smoothstep(.3, 1.6, d));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.93, .95, .92), clamp(foam, 0., 1.) * .75);
            diffuseColor.a *= mix(.55, 1., smoothstep(.0, .5, d));
          }
          #else
          if (uWRad > 0.) {
            // the bank: a wavering line of foam, and the shallows a little clearer
            float r = length(vWaterL) / uWRad;
            float foam = smoothstep(.955, .985, r + .012 * sin(atan(vWaterL.y, vWaterL.x) * 23. + uWT * 1.3) + w.z * .25);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.93, .95, .92), foam * .7);
            diffuseColor.a *= mix(1., .72, smoothstep(.8, .97, r) * (1. - foam));
          }
          #endif
        }`,
    );
  };
  m.customProgramCacheKey = () => (depth ? 'water-depth' : 'water');
  return m;
}

// ---------------------------------------------------------------- a fountain's falling water
const sprays: { pts: THREE.Points; seed: Float32Array; y0: number; y1: number; r0: number; r1: number }[] = [];
/**
 * Droplets spilling from a bowl's rim into the basin below, and a little jet from the top.
 * @param y0 rim height, y1 basin water height, r0 rim radius, r1 how far out they land
 */
export function fountainSpray(x: number, z: number, y0: number, y1: number, r0: number, r1: number, n = 260) {
  const pos = new Float32Array(n * 3),
    seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) seed.set([Math.random() * Math.PI * 2, Math.random(), 0.75 + Math.random() * 0.5], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const cx = c.getContext('2d')!,
    gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(235,245,250,.55)');
  gr.addColorStop(1, 'rgba(235,245,250,0)');
  cx.fillStyle = gr;
  cx.fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(
    g,
    new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(c),
      size: 0.11,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      color: '#f4f8f6',
      sizeAttenuation: true,
    }),
  );
  pts.position.set(x, 0, z);
  pts.frustumCulled = false;
  sprays.push({ pts, seed, y0, y1, r0, r1 });
  return pts;
}
/** Once a frame, wherever water is on screen. */
export function tickWater(clock: number) {
  for (const s of sprays) {
    if (!s.pts.parent) continue;
    const P = s.pts.geometry.attributes.position as THREE.BufferAttribute,
      n = P.count,
      fall = Math.sqrt((2 * (s.y0 - s.y1)) / 9.8);
    for (let i = 0; i < n; i++) {
      const a = s.seed[i * 3],
        ph = s.seed[i * 3 + 1],
        k = s.seed[i * 3 + 2];
      if (i < n * 0.2) {
        // the jet: up from the middle and back into the bowl
        const T = 0.75 * k,
          t = ((clock / T + ph) % 1) * T,
          v0 = 0.5 * 9.8 * T,
          rr = (t / T) * 0.42 * k;
        P.setXYZ(i, Math.cos(a) * rr, s.y0 + 0.05 + v0 * t - 4.9 * t * t, Math.sin(a) * rr);
      } else {
        // the spill: over the rim, out a little, down to the basin
        const T = fall * (0.9 + 0.2 * k),
          t = ((clock / T + ph) % 1) * T,
          rr = s.r0 + (s.r1 - s.r0) * (t / T) * k;
        P.setXYZ(i, Math.cos(a) * rr, Math.max(s.y1, s.y0 - 4.9 * t * t), Math.sin(a) * rr);
      }
    }
    P.needsUpdate = true;
  }
}
