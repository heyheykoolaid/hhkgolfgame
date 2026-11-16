// Wind you can see (world-feel.md): one gust value shared by everything that moves in the wind. The ambience
// (audio/ambience.ts) works out the gusts for sound and writes them here each frame, so what you hear is what moves.
// `windSway(material, kind)` patches a material's vertex shader; it chains with other patches (cloud shadows).
import * as THREE from 'three';

/** uWT: seconds, uGust: 0 (still) … 1 (a proper gust). Shared uniform objects: hand them to any shader. */
export const WIND = { uWT: { value: 0 }, uGust: { value: 0 } };

type Kind = 'palm' | 'frond' | 'leaves' | 'flag' | 'string';
const HEAD = 'uniform float uWT; uniform float uGust;';
// each body runs after <begin_vertex>; `transformed` is in the mesh's own space, wp is where the object stands
const BODY: Record<Kind, string> = {
  // the whole palm leans and rocks from the ground up (trunk, skirt and fronds share this so they stay joined)
  palm: `float h = transformed.y / 10.; float b = h * h * (.05 + .42 * uGust);
    transformed.x += b * (.6 + sin(uWT * 1.1 + wp.x * .31 + wp.z * .17)); transformed.z += b * .5 * sin(uWT * .83 + wp.z * .27);`,
  // …and the fronds also flutter at their tips
  frond: `float h = transformed.y / 10.; float b = h * h * (.05 + .42 * uGust);
    transformed.x += b * (.6 + sin(uWT * 1.1 + wp.x * .31 + wp.z * .17)); transformed.z += b * .5 * sin(uWT * .83 + wp.z * .27);
    float tip = clamp(length(transformed.xz) / 3., 0., 1.);
    transformed.y += tip * tip * (.03 + .16 * uGust) * sin(uWT * 3.1 + transformed.x * 2.3 + transformed.z * 1.7 + wp.x);`,
  // an oak's crown shivers: each clump on its own beat, more in a gust
  leaves: `float h = clamp((transformed.y - 1.5) / 4., 0., 1.); float a = h * (.012 + .09 * uGust);
    transformed.x += a * sin(uWT * 2.3 + transformed.y * 1.9 + transformed.z * 1.3 + wp.x);
    transformed.z += a * sin(uWT * 1.9 + transformed.x * 1.7 + wp.z);
    transformed.y += a * .5 * sin(uWT * 2.9 + transformed.x * 2.1 + transformed.z * 2.3);`,
  // a flag on a pole at its left edge: ripples run out along it, and it hangs limp when the air is still
  flag: `float u = uv.x; float amp = u * (.012 + .07 * uGust);
    transformed.z += amp * sin(position.x * 11. - uWT * (5. + 7. * uGust)) + u * u * .05 * sin(uWT * 1.3);
    transformed.y -= u * u * .16 * (1. - uGust);`,
  // string lights between two posts 3.8 m apart: the span swings, the posts don't
  string: `float k = sin(3.14159 * clamp((position.x + 1.9) / 3.8, 0., 1.));
    transformed.z += k * (.015 + .13 * uGust) * sin(uWT * 1.7 + wp.x * .9 + wp.z * .7); transformed.y += k * .03 * uGust * sin(uWT * 3.4 + wp.x);`,
};

export function windSway<T extends THREE.Material>(mat: T, kind: Kind): T {
  const m = mat as any,
    prev = m.onBeforeCompile?.bind(m),
    prevKey = m.customProgramCacheKey?.bind(m);
  m.userData.ownShader = true;
  m.onBeforeCompile = (sh: any, r: any) => {
    prev?.(sh, r);
    sh.uniforms.uWT = WIND.uWT;
    sh.uniforms.uGust = WIND.uGust;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${HEAD}`).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      { vec3 wp = modelMatrix[3].xyz;
      #ifdef USE_INSTANCING
        wp = (modelMatrix * instanceMatrix)[3].xyz;
      #endif
      ${BODY[kind]} }`,
    );
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|wind-' + kind;
  return mat;
}
