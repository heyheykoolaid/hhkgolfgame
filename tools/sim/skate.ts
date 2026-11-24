// Drive the skateboard's physics headless over the skate spot (run: npx tsx tools/sim/skate.ts)
import { Skateboard, type SkateInput, type SkateWorld } from '../../packages/client/src/vehicles/skateboard';
import { skateY, SKATE_RAILS, PARK } from '../../packages/client/src/lobby/skatepark';
const w: SkateWorld = { ground: skateY, blocked: () => false, rails: SKATE_RAILS };
const I = (o: Partial<SkateInput> = {}): SkateInput => ({ push: false, brake: false, steer: 0, crouch: false, manual: false, ...o });
function run(name: string, setup: (s: Skateboard) => void, script: (t: number) => Partial<SkateInput>, T: number) {
  const s = new Skateboard();
  s.mount(0, 0, 0, 0, w);
  setup(s);
  const ev: string[] = [];
  let maxY = 0,
    airF = 0,
    grindF = 0;
  for (let t = 0; t < T; t += 1 / 60) {
    for (const e of s.update(1 / 60, I(script(t)), w))
      ev.push(t.toFixed(2) + ':' + (e.kind === 'trick' ? e.name : e.kind === 'combo' ? `COMBO ${e.text} ${e.pts}` : e.kind));
    maxY = Math.max(maxY, s.y);
    if (s.air) airF++;
    if (process.env.DBG === name)
      console.log(t.toFixed(2), s.x.toFixed(2), s.y.toFixed(2), s.air, s.vert, s.spin.toFixed(2), s.flip.toFixed(2), s.v.toFixed(2), s.vy.toFixed(2));
    if (s.grind) grindF++;
  }
  console.log(
    name.padEnd(12),
    `maxY ${maxY.toFixed(2)} air ${(airF / 60).toFixed(2)}s grind ${(grindF / 60).toFixed(2)}s end x ${s.x.toFixed(1)} z ${s.z.toFixed(1)} v ${s.v.toFixed(1)} |`,
    ev.filter(e => !e.endsWith(':push')).join(', '),
  );
}
const E = PARK.x + 8; // heading east from here at the east quarter pipe
run(
  'quarterpipe',
  s => Object.assign(s, { x: E, z: PARK.z, yaw: Math.PI / 2, v: 9 }),
  () => ({}),
  4,
);
run(
  'qp slow',
  s => Object.assign(s, { x: E, z: PARK.z, yaw: Math.PI / 2, v: 5 }),
  () => ({}),
  4,
);
run(
  'qp 180',
  s => Object.assign(s, { x: E, z: PARK.z, yaw: Math.PI / 2, v: 9 }),
  t => ({ steer: t > 1.3 && t < 1.62 ? 1 : 0 }),
  4,
);
run(
  'kickflip',
  s => Object.assign(s, { x: PARK.x - 12, z: PARK.z + 3, yaw: Math.PI / 2, v: 6 }),
  t => ({ crouch: t < 0.4, push: t > 0.48 && t < 0.55 }),
  3,
);
run(
  'heel 360',
  s => Object.assign(s, { x: PARK.x - 12, z: PARK.z + 3, yaw: Math.PI / 2, v: 6 }),
  t => ({ crouch: t < 0.4, brake: t > 0.48 && t < 0.55, steer: t > 0.43 && t < 1.08 ? 1 : 0 }),
  3,
);
run(
  'dbl flip',
  s => Object.assign(s, { x: PARK.x - 12, z: PARK.z + 3, yaw: Math.PI / 2, v: 6 }),
  t => ({ crouch: t < 0.4, push: (t > 0.48 && t < 0.52) || (t > 0.75 && t < 0.8) }),
  3,
);
run(
  'late flip',
  s => Object.assign(s, { x: PARK.x - 12, z: PARK.z + 3, yaw: Math.PI / 2, v: 6 }),
  t => ({ crouch: t < 0.4, push: t > 1.05 && t < 1.1 }),
  3,
);
run(
  'grind rail',
  s => Object.assign(s, { x: PARK.x - 12, z: PARK.z - 6 + 0.25, yaw: Math.PI / 2, v: 6.5 }),
  t => ({ crouch: t < 0.4 }),
  4,
);
run(
  'grind ledge',
  s => Object.assign(s, { x: PARK.x - 10, z: PARK.z + 5.6 - 0.3, yaw: Math.PI / 2, v: 6 }),
  t => ({ crouch: t < 0.4 }),
  4,
);
run(
  'manual',
  s => Object.assign(s, { x: PARK.x - 12, z: PARK.z + 3, yaw: Math.PI / 2, v: 6 }),
  t => ({ manual: t < 1.5 }),
  3,
);
run(
  'funbox',
  s => Object.assign(s, { x: PARK.x + 4, z: PARK.z, yaw: Math.PI / 2, v: 7 }),
  () => ({}),
  2,
);
run(
  'funbox back',
  s => Object.assign(s, { x: PARK.x + 15, z: PARK.z, yaw: -Math.PI / 2, v: 7 }),
  () => ({}),
  2,
);
run(
  'push start',
  s => Object.assign(s, { x: PARK.x - 12, z: PARK.z + 3, yaw: Math.PI / 2, v: 0 }),
  () => ({ push: true }),
  3,
);
run(
  'ledge crash',
  s => Object.assign(s, { x: PARK.x, z: PARK.z + 3, yaw: 0, v: 8 }),
  () => ({}),
  2,
);
