// The hobo: a scruffy old man with a shopping cart who turns up somewhere in town for a few minutes and then is gone.
// He's the only one who sells hobo seeds, which grow the rainbow strain (the start of the Bad Batch: a rainbow joint
// passed to a garden gnome). Where and when he turns up comes from the wall clock, so everyone online sees the same
// hobo in the same place at the same time; nothing is sent.
import * as THREE from 'three';
import { mulberry32 } from '@gh/shared';
import { Golfer } from '../characters/golfer';
import { sanitizeLook } from '../avatar/outfit';
import { SIDEWALKS } from './roads';
import { groundY } from './world';

/** Every 16 minutes he turns up once, for 6 minutes, somewhere along one of the town's pavements. */
export const HOBO_EVERY = 16 * 60e3,
  HOBO_STAYS = 6 * 60e3,
  HOBO_SEED_PRICE = 500;
/** The places he can turn up: the middle of a dozen of the town's pavements, spread through the list. */
const SPOTS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [],
    step = Math.max(1, Math.floor(SIDEWALKS.length / 12));
  for (let i = 0; i < SIDEWALKS.length && out.length < 12; i += step) {
    const [vert, c, a, b] = SIDEWALKS[i],
      m = (a + b) / 2;
    // facing across the pavement, toward the street's middle line (he leans on his cart at the kerb)
    out.push(vert ? [c, m, c > 0 ? -Math.PI / 2 : Math.PI / 2] : [m, c, c > 0 ? Math.PI : 0]);
  }
  return out;
})();
/** Where the hobo is right now, or null if he's gone. */
export function hoboNow(now = Date.now()) {
  const w = Math.floor(now / HOBO_EVERY),
    r = mulberry32((w * 2654435761) >>> 0),
    start = w * HOBO_EVERY + r() * (HOBO_EVERY - HOBO_STAYS),
    s = SPOTS[Math.floor(r() * SPOTS.length)];
  if (now < start || now > start + HOBO_STAYS) return null;
  return { x: s[0], z: s[1], yaw: s[2], until: start + HOBO_STAYS };
}

const LINES = ['I\u2019m down on my luck and these seeds are the last thing I own, wanna buy \u2019em?'];

/** A small wire shopping cart, full of junk. */
function cart() {
  const g = new THREE.Group(),
    wire = new THREE.MeshStandardMaterial({ color: '#a8acb0', metalness: 0.7, roughness: 0.4, wireframe: true }),
    frame = new THREE.MeshStandardMaterial({ color: '#8d9399', metalness: 0.7, roughness: 0.4 }),
    junk = ['#7a5c3a', '#3a5a7a', '#9a3a3a', '#d8c7a0', '#4a6a3a'];
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.85, 3, 3, 5), wire);
  basket.position.y = 0.75;
  g.add(basket);
  for (const [x, z] of [
    [-0.24, -0.38],
    [0.24, -0.38],
    [-0.24, 0.38],
    [0.24, 0.38],
  ]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 4), frame);
    leg.position.set(x, 0.3, z);
    g.add(leg);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#222' }),
    );
    wheel.position.set(x, 0.05, z);
    g.add(wheel);
  }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6).rotateZ(Math.PI / 2), frame);
  handle.position.set(0, 1.02, -0.5);
  g.add(handle);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.18 + (i % 3) * 0.05, 0.14, 0.2),
      new THREE.MeshStandardMaterial({ color: junk[i % junk.length], roughness: 0.9 }),
    );
    b.position.set(-0.12 + (i % 2) * 0.24, 0.9 + Math.floor(i / 2) * 0.08, -0.25 + (i % 3) * 0.25);
    b.rotation.y = i;
    g.add(b);
  }
  // a cardboard sign propped up on the front
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#c8ac7a';
  x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#222';
  x.font = 'bold 34px "Comic Sans MS", cursive, sans-serif';
  x.textAlign = 'center';
  x.fillText('SEEDS $500', 128, 54);
  x.font = 'bold 26px "Comic Sans MS", cursive, sans-serif';
  x.fillText('GOD BLESS', 128, 98);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 1 }));
  sign.position.set(0, 1.12, 0.44);
  sign.rotation.x = -0.25;
  g.add(sign);
  g.traverse(o => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export function createHobo(scene: THREE.Scene) {
  const look = sanitizeLook({
      ball: 'white',
      skin: '#b98a64',
      hair: '#8a8478',
      hairStyle: 'long',
      stubble: true,
      shirt: '#5a5040',
      top: 'long',
      jacket: 'padded',
      jacketColor: '#4a4a32',
      pants: '#3a3a40',
      pantsStyle: 'jeans',
      shoes: '#3a2a1a',
      shoeStyle: 'boots',
      capStyle: 'fedora',
      cap: '#3a3430',
    } as any),
    g = new Golfer(look),
    c = cart(),
    root = new THREE.Group();
  root.add(g.root, c);
  c.position.set(0.15, 0, 0.75);
  root.visible = false;
  scene.add(root);
  let said = 0;
  return {
    /** Where he is now (or null), placed and posed for this frame. */
    update(clock: number, px: number, pz: number) {
      const h = hoboNow();
      root.visible = !!h;
      if (!h) return null;
      root.position.set(h.x, groundY(h.x, h.z) + 0.08, h.z);
      // he turns toward you when you come close
      const d = Math.hypot(px - h.x, pz - h.z),
        to = Math.atan2(px - h.x, pz - h.z);
      let want = h.yaw;
      if (d < 6) want = to;
      let dr = want - root.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      root.rotation.y += dr * 0.06;
      g.update({ mode: 'walk', speed: 0, phase: 0, time: clock * 0.6, s: 0, club: 'iron', showClub: false } as any);
      return h;
    },
    /** Something for him to say: a different line each time you talk to him. */
    line() {
      return LINES[said++ % LINES.length];
    },
  };
}
