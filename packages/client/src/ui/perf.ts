// A small on-screen readout for tuning performance: frames per second, the slowest recent frame, and how much was
// drawn in the last frame. F3 shows or hides it (remembered in this browser).
import type * as THREE from 'three';

const el = document.createElement('div');
el.style.cssText =
  'position:fixed;left:10px;bottom:10px;z-index:60;display:none;padding:6px 10px;border-radius:8px;background:rgba(10,8,6,.78);color:#d8f0c8;font:600 12px/1.35 ui-monospace,Menlo,Consolas,monospace;pointer-events:none;white-space:pre';
document.body.appendChild(el);
let on = false;
try {
  on = localStorage.getItem('gh.perf') === '1';
} catch {}
el.style.display = on ? 'block' : 'none';
addEventListener('keydown', e => {
  if (e.code !== 'F3') return;
  e.preventDefault();
  on = !on;
  el.style.display = on ? 'block' : 'none';
  try {
    localStorage.setItem('gh.perf', on ? '1' : '0');
  } catch {}
});
let last = 0,
  n = 0,
  acc = 0,
  worst = 0,
  calls = 0,
  tris = 0;
/** What the golfers' level of detail is doing: [full, light, far] counts, filled in by characters/golfer.ts. */
export const lodCount = [0, 0, 0];
/** Call once per frame, after rendering. */
export function perfFrame(now: number, renderer: THREE.WebGLRenderer) {
  const dt = last ? now - last : 16.7;
  last = now;
  if (!on) return;
  n++;
  acc += dt;
  worst = Math.max(worst, dt);
  calls = Math.max(calls, renderer.info.render.calls);
  tris = Math.max(tris, renderer.info.render.triangles);
  if (acc < 500) return;
  el.textContent =
    `${Math.round((n * 1000) / acc)} fps   slowest ${worst.toFixed(0)} ms\n` +
    `${calls} draws   ${(tris / 1000).toFixed(0)}k triangles\n` +
    `golfers: ${lodCount[0]} full · ${lodCount[1]} light · ${lodCount[2]} far   (F3 hides)`;
  n = acc = worst = calls = tris = 0;
}
/** Called at the start of each frame so the golfer counts are per frame. */
export function perfReset() {
  lodCount[0] = lodCount[1] = lodCount[2] = 0;
}
