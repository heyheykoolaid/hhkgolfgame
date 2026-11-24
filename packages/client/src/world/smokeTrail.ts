// The smoke tracer ball's cloud (a Pro Shop novelty ball): thick coloured puffs left along the ball's flight that
// swell, drift with the wind and fade over about twenty seconds. Everyone who sees the shot sees the cloud, since the
// ball kind travels with the shot. One pool of sprites shared by every shot.
import * as THREE from 'three';

export const SMOKE_COLOURS = ['#ff5fa2', '#3fd6c1', '#ffd24a', '#a77bff', '#ff8a3d'];
const LIFE = 22,
  MAX = 600;
let tex: THREE.Texture | null = null;
function puffTex() {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!,
    gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  tex = new THREE.CanvasTexture(c);
  return tex;
}
interface Puff {
  s: THREE.Sprite;
  age: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}
export function createSmokeTrail(scene: THREE.Scene) {
  const puffs: Puff[] = [],
    free: THREE.Sprite[] = [];
  function sprite(col: string) {
    const s = free.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(), transparent: true, depthWrite: false, fog: true }));
    (s.material as THREE.SpriteMaterial).color.set(col);
    s.visible = true;
    scene.add(s);
    return s;
  }
  return {
    /** leave a puff at p (called as the ball flies) */
    puff(p: THREE.Vector3, col: string) {
      if (puffs.length >= MAX) {
        const o = puffs.shift()!;
        scene.remove(o.s);
        free.push(o.s);
      }
      const s = sprite(col);
      s.position.copy(p);
      puffs.push({
        s,
        age: 0,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.15 + Math.random() * 0.2,
        vz: (Math.random() - 0.5) * 0.4,
        size: 0.6 + Math.random() * 0.4,
      });
    },
    update(dt: number, wind: { x: number; z: number }) {
      for (let i = puffs.length - 1; i >= 0; i--) {
        const o = puffs[i];
        o.age += dt;
        if (o.age > LIFE) {
          scene.remove(o.s);
          o.s.visible = false;
          free.push(o.s);
          puffs.splice(i, 1);
          continue;
        }
        const k = o.age / LIFE;
        o.s.position.x += (o.vx + wind.x * 0.12) * dt;
        o.s.position.y += o.vy * dt * (1 - k);
        o.s.position.z += (o.vz + wind.z * 0.12) * dt;
        o.s.scale.setScalar(o.size * (1 + Math.sqrt(o.age) * 1.3));
        (o.s.material as THREE.SpriteMaterial).opacity = Math.min(1, o.age * 4) * (1 - k) * 0.75;
      }
    },
    clear() {
      for (const o of puffs) {
        scene.remove(o.s);
        free.push(o.s);
      }
      puffs.length = 0;
    },
  };
}
