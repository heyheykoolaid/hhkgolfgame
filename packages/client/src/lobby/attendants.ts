// The people in Fun Land's booth windows. They are scenery with a job: you press E at the window to start the event.
import * as THREE from 'three';
import { Golfer } from '../characters/golfer';
import { sanitizeLook } from '../avatar/outfit';
import { loadBody } from '../characters/mhGolfer';
import { groundY } from './world';

export function createAttendants(scene: THREE.Scene, list: { x: number; z: number; yaw: number; look: Record<string, unknown> }[]) {
  const npcs: { g: Golfer; yaw: number; x: number; z: number }[] = [];
  for (const a of list) {
    const look = sanitizeLook({ ball: 'white', ...a.look } as any),
      make = () => {
        const g = new Golfer(look);
        g.root.position.set(a.x, groundY(a.x, a.z) + 0.08, a.z);
        g.root.rotation.y = a.yaw;
        scene.add(g.root);
        npcs.push({ g, yaw: a.yaw, x: a.x, z: a.z });
      };
    // a body other than the default is fetched first, so the attendant appears in their own shape
    const body = (look as any).body;
    if (body && body !== 'male') loadBody(body).then(make, make);
    else make();
  }
  return {
    /** They stand at ease and turn a little toward a player who comes up to the window. */
    update(clock: number, px: number, pz: number) {
      for (const n of npcs) {
        const d = Math.hypot(px - n.x, pz - n.z);
        let want = n.yaw;
        if (d < 7) {
          const to = Math.atan2(px - n.x, pz - n.z);
          let dy = to - n.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          want = n.yaw + Math.max(-0.6, Math.min(0.6, dy));
        }
        let dr = want - n.g.root.rotation.y;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        n.g.root.rotation.y += dr * 0.08;
        n.g.update({ mode: 'walk', speed: 0, phase: 0, time: clock + n.x, s: 0, club: 'iron', showClub: false } as any);
      }
    },
  };
}
