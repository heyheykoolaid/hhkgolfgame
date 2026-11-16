// Sky (world-feel.md): Poly Haven's "Belfast Sunset" pure-sky photo (CC0, warmed to golden hour and baked to
// public/sky/belfast.jpg) on a dome that follows the camera, a drifting layer of soft clouds overhead lit gold from
// the low sun, and their shadows sliding across the ground. Clouds and shadows share one noise field, so a shadow is
// always under a cloud. Everything ticks itself from onBeforeRender: game modes don't need to call anything.
import * as THREE from 'three';

const BASE = (import.meta as any).env?.BASE_URL ?? './';
export const CLOUD_H = 240; // height of the cloud layer (m)
const WIND = new THREE.Vector2(6.5, 2.2); // m/s drift
const U = { uT: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uWind: { value: WIND.clone() } };
(window as any).__sky = U; // dev: inspect / speed up the clouds

// one 2D fbm used by both the clouds and their shadows
const NOISE = /* glsl */ `
float ch(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
float cfbm(vec2 p){ float v = 0., a = .5; mat2 r = mat2(.8, -.6, .6, .8); for (int i = 0; i < 5; i++){ v += a * cn(p); p = r * p * 2.03 + 11.7; a *= .5; } return v; }
/** cloud coverage 0–1 at a point on the cloud layer (world xz) */
float cloudCover(vec2 xz, float t, vec2 wind){ vec2 p = (xz - wind * t) / 620.; float n = cfbm(p) * .75 + cfbm(p * 2.7 + 5.3) * .25; return smoothstep(.53, .80, n); }
`;

/** The sky dome: the photo, rotated so its sun sits where the game's sun is, blended into the haze at the horizon. */
export function photoSky(R: number, sunDir: THREE.Vector3, haze: THREE.Color, fallback: THREE.Material) {
  const geo = new THREE.SphereGeometry(R, 32, 16),
    mesh = new THREE.Mesh(geo, fallback);
  // photo: equirect, elevation +90° (top) … −11.25° (bottom); its sun is at u = 0.6047
  const off = 0.6047 - Math.atan2(sunDir.x, sunDir.z) / (Math.PI * 2);
  new THREE.TextureLoader().load(BASE + 'sky/belfast.jpg', t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    mesh.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: t }, off: { value: off }, haze: { value: haze.clone() } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform sampler2D map; uniform float off; uniform vec3 haze; varying vec3 vD;
        void main(){ vec3 d = normalize(vD); float e = degrees(asin(clamp(d.y, -1., 1.)));
          float u = fract(atan(d.x, d.z) / 6.2831853 + off), v = clamp((e + 11.25) / 101.25, 0.002, 0.998);
          vec3 c = texture2D(map, vec2(u, v)).rgb;
          c = mix(c, haze, smoothstep(5., -2., e) * .55);   // melt into the dusty haze along the horizon
          gl_FragColor = vec4(c, 1.);
          #include <colorspace_fragment>
        }`,
    });
    (fallback as any).dispose?.();
  });
  return mesh;
}

/** Soft clouds drifting overhead: a big layer that follows the camera, lit gold from the low sun. */
export function cloudLayer(sunDir: THREE.Vector3) {
  U.uSun.value.copy(sunDir);
  const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uT; uniform vec3 uSun; uniform vec2 uWind; varying vec3 vW; ${NOISE}
      void main(){
        float c = cloudCover(vW.xz, uT, uWind); if (c < .01) discard;
        // self-shadowing: denser cloud toward the sun means a darker underside; edges facing the sun glow gold
        vec2 toSun = normalize(uSun.xz) * 70.;
        float occ = cloudCover(vW.xz + toSun, uT, uWind) * .6 + cloudCover(vW.xz + toSun * 2.2, uT, uWind) * .4;
        vec3 under = vec3(.80, .64, .60), lit = vec3(1.0, .86, .64), rim = vec3(1.0, .93, .78);
        vec3 col = mix(lit, under, clamp(occ * 1.15, 0., 1.));
        col = mix(col, rim, (1. - c) * (1. - occ) * .8);
        float dist = length(vW.xz - cameraPosition.xz);
        float a = c * .92 * smoothstep(2900., 900., dist);       // thin out toward the horizon so the photo shows there
        col = mix(col, vec3(.94, .79, .62), smoothstep(600., 2600., dist) * .6);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = CLOUD_H;
  m.frustumCulled = false;
  m.renderOrder = -1;
  let patchT = 0;
  m.onBeforeRender = (_r, scene, cam) => {
    U.uT.value = performance.now() / 1000;
    m.position.x = cam.position.x;
    m.position.z = cam.position.z;
    if (U.uT.value - patchT > 1.5) {
      patchT = U.uT.value;
      patchCloudShadows(scene);
    } // new meshes get shadows too
  };
  return m;
}

/** Cloud shadows: dim the direct sunlight where a cloud sits between the ground and the sun. */
const SHADE = 0.55; // how much a full cloud blocks the sun
export function patchCloudShadows(root: THREE.Object3D) {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as any[]) {
      if (!mat || mat.userData.cloudShade || !(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) continue;
      if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) mat.userData.ownShader = true; // wind, haze…: not for batching
      mat.userData.cloudShade = true;
      const prev = mat.onBeforeCompile?.bind(mat),
        prevKey = mat.customProgramCacheKey?.bind(mat);
      mat.onBeforeCompile = (sh: any, r: any) => {
        prev?.(sh, r);
        Object.assign(sh.uniforms, U);
        if (!sh.vertexShader.includes('vCloudW')) {
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vCloudW;')
            .replace(
              '#include <project_vertex>',
              '#include <project_vertex>\n{ vec4 cw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\ncw = instanceMatrix * cw;\n#endif\nvCloudW = (modelMatrix * cw).xyz; }',
            );
        }
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>\nvarying vec3 vCloudW; uniform float uT; uniform vec3 uSun; uniform vec2 uWind;\n${NOISE}`)
          .replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
            { vec2 at = vCloudW.xz + uSun.xz / max(uSun.y, .08) * (${CLOUD_H.toFixed(1)} - vCloudW.y);
              float cs = 1. - ${SHADE.toFixed(2)} * cloudCover(at, uT, uWind);
              reflectedLight.directDiffuse *= cs; reflectedLight.directSpecular *= cs; }`,
          );
      };
      mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|cloudshade';
      mat.needsUpdate = true;
    }
  });
}
