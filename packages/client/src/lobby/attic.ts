// Mom's Attic: Mom sold your Pokémon cards, and while she was at it she lost a box of your old things around town. Twelve
// of them lie about, some in plain sight and some out at the edges of the map. Walk up and press E to pick one up; it
// goes in the display case in your RV (the collection menu). Every three you find unlocks a putter for the course.
// Each player finds their own (progress.attic); the things are drawn only for those who haven't found them yet.
import * as THREE from 'three';
import { groundY } from './world';

export interface AtticThing {
  id: string;
  name: string;
  /** what Mom's note says about it (the hint where to look, before you find it) */
  hint: string;
  x: number;
  z: number;
  look: 'card' | 'club' | 'gnome' | 'tape' | 'skates' | 'trophy' | 'yoyo' | 'diary' | 'walkman' | 'marbles' | 'locket' | 'bear';
}
export const ATTIC: AtticThing[] = [
  {
    id: 'holocard',
    name: 'Holographic dragon card',
    hint: 'Something shiny by the fountain. She swears she kept ONE card.',
    x: 4.4,
    z: 4.4,
    look: 'card',
  },
  {
    id: 'persimmon',
    name: "Grandpa's persimmon driver",
    hint: 'Leaning on the legs of the water tower, up the West Side.',
    x: -133.5,
    z: -4,
    look: 'club',
  },
  { id: 'figurine', name: 'Gnome figurine', hint: 'Under the big wheel at Fun Land, where the ticket booth is.', x: 163.8, z: 12.6, look: 'gnome' },
  { id: 'mixtape', name: 'Summer mixtape', hint: 'Out past the far groves, in the north-east meadow.', x: 140, z: -158, look: 'tape' },
  { id: 'skates', name: 'Roller skates', hint: 'By the Rusty Rocket. You always did want to go to space.', x: 112.6, z: 25.6, look: 'skates' },
  { id: 'littleleague', name: 'Little league trophy', hint: 'At the foot of the West Side hill, round the back.', x: -196, z: 54, look: 'trophy' },
  { id: 'yoyo', name: 'Glow-in-the-dark yo-yo', hint: 'Somewhere along Shady Lane, by the hedge at its east end.', x: 46, z: -73, look: 'yoyo' },
  { id: 'diary', name: 'Your diary (locked)', hint: 'Outside the gate of the Old Estate. Don’t ask.', x: -150, z: 10.2, look: 'diary' },
  { id: 'walkman', name: 'Walkman', hint: 'Inside the go-kart track, in the middle of the hairpins.', x: 128, z: -34, look: 'walkman' },
  { id: 'marbles', name: 'Bag of marbles', hint: 'Way out in the north-west meadow, beyond the trees.', x: -150, z: -150, look: 'marbles' },
  { id: 'locket', name: "Mom's locket (oops)", hint: 'East of Fun Land, out in the long grass. She lost hers too.', x: 186, z: 62, look: 'locket' },
  { id: 'teddy', name: 'Mr. Buttons the bear', hint: 'Under the driving range’s far boards, at Fun Land.', x: 72, z: 46, look: 'bear' },
];
/** Putter skins and how many of Mom's things unlock each. */
export const PUTTER_UNLOCK: { id: string; name: string; need: number }[] = [
  { id: 'hockey', name: 'Hockey stick', need: 3 },
  { id: 'broom', name: 'Kitchen broom', need: 6 },
  { id: 'wrench', name: 'Golden wrench', need: 9 },
  { id: 'flamingo', name: 'Lawn flamingo', need: 12 },
];

function model(look: AtticThing['look']) {
  const g = new THREE.Group(),
    M = (c: string, m = 0, r = 0.6, e?: string) =>
      new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, emissive: e || '#000', emissiveIntensity: e ? 0.6 : 0 }),
    add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      g.add(o);
      return o;
    };
  switch (look) {
    case 'card':
      add(new THREE.BoxGeometry(0.22, 0.31, 0.01), M('#8ad0ff', 0.6, 0.2, '#b070ff'));
      break;
    case 'club':
      add(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), M('#c3c7cc', 0.6, 0.3), 0, 0, 0);
      add(new THREE.SphereGeometry(0.07, 12, 8).scale(1, 0.7, 1.3), M('#7a4a2a', 0.1, 0.4), 0, -0.52, 0.03);
      break;
    case 'gnome':
      add(new THREE.ConeGeometry(0.08, 0.16, 10), M('#c8452f'), 0, 0.12, 0);
      add(new THREE.SphereGeometry(0.07, 10, 8), M('#f1c9a5'), 0, 0.02, 0);
      add(new THREE.ConeGeometry(0.07, 0.1, 10).rotateX(Math.PI), M('#f1eee6'), 0, -0.06, 0.03);
      break;
    case 'tape':
      add(new THREE.BoxGeometry(0.2, 0.12, 0.025), M('#2a2a30'));
      add(new THREE.BoxGeometry(0.16, 0.05, 0.027), M('#ffd24a', 0, 0.5, '#ff8a3a'), 0, 0.02, 0);
      break;
    case 'skates':
      for (const x of [-0.08, 0.08]) {
        add(new THREE.BoxGeometry(0.09, 0.16, 0.22), M('#f1eee6'), x, 0.06, 0);
        for (const z of [-0.08, 0.08])
          add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10).rotateZ(Math.PI / 2), M('#ff5a8a', 0, 0.5, '#ff5a8a'), x, -0.04, z);
      }
      break;
    case 'trophy':
      add(new THREE.CylinderGeometry(0.06, 0.08, 0.05, 10), M('#3a2a1a'), 0, -0.1, 0);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), M('#e0b040', 0.9, 0.25), 0, -0.02, 0);
      add(new THREE.SphereGeometry(0.05, 10, 8), M('#e0b040', 0.9, 0.25), 0, 0.08, 0);
      break;
    case 'yoyo':
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16).rotateX(Math.PI / 2), M('#7aff8a', 0, 0.4, '#5aff6a'));
      break;
    case 'diary':
      add(new THREE.BoxGeometry(0.18, 0.04, 0.24), M('#c86aa8'));
      add(new THREE.BoxGeometry(0.03, 0.05, 0.05), M('#e0b040', 0.9, 0.3), 0.09, 0, 0);
      break;
    case 'walkman':
      add(new THREE.BoxGeometry(0.13, 0.09, 0.035), M('#3a6ab0'));
      add(new THREE.TorusGeometry(0.09, 0.008, 6, 16, Math.PI), M('#2a2a2a'), 0, 0.1, 0);
      break;
    case 'marbles':
      add(new THREE.SphereGeometry(0.08, 10, 8).scale(1, 1.2, 1), M('#5a3a8a', 0, 0.9));
      for (let i = 0; i < 4; i++)
        add(new THREE.SphereGeometry(0.02, 8, 6), M(['#4fb0c6', '#ff5a5a', '#ffd24a', '#7aff8a'][i], 0.2, 0.1), -0.09 + i * 0.05, -0.06, 0.09);
      break;
    case 'locket':
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 16).rotateX(Math.PI / 2), M('#e0b040', 0.9, 0.25));
      add(new THREE.TorusGeometry(0.06, 0.004, 6, 20), M('#e0b040', 0.9, 0.25), 0, 0.09, 0);
      break;
    case 'bear':
      add(new THREE.SphereGeometry(0.1, 12, 10), M('#8a5a32', 0, 0.95));
      add(new THREE.SphereGeometry(0.07, 12, 10), M('#8a5a32', 0, 0.95), 0, 0.14, 0);
      for (const x of [-0.05, 0.05]) add(new THREE.SphereGeometry(0.025, 8, 6), M('#8a5a32', 0, 0.95), x, 0.2, 0);
      add(new THREE.SphereGeometry(0.012, 6, 4), M('#111'), 0, 0.14, 0.07);
      break;
  }
  g.traverse(o => ((o as THREE.Mesh).castShadow = true));
  return g;
}

/** The things still lying about (for one player): bob and turn slowly, with a soft glow under each so it can be spotted. */
export function createAttic(scene: THREE.Scene) {
  const items = ATTIC.map(a => {
    const o = new THREE.Group(),
      m = model(a.look),
      glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.35, depthWrite: false }),
      );
    o.add(m, glow);
    glow.position.y = 0.03;
    o.position.set(a.x, groundY(a.x, a.z), a.z);
    o.visible = false;
    scene.add(o);
    return { a, o, m };
  });
  return {
    /** Show what this player hasn't found yet. */
    sync(found: string[]) {
      for (const it of items) it.o.visible = !found.includes(it.a.id);
    },
    update(clock: number) {
      for (const it of items) {
        if (!it.o.visible) continue;
        it.o.position.y = groundY(it.a.x, it.a.z);
        it.m.position.y = 0.45 + Math.sin(clock * 2 + it.a.x) * 0.06;
        it.m.rotation.y = clock * 0.8;
      }
    },
    /** The thing within reach, if any. */
    near(x: number, z: number) {
      for (const it of items) if (it.o.visible && Math.hypot(x - it.a.x, z - it.a.z) < 1.6) return it.a;
      return null;
    },
    hide(id: string) {
      const it = items.find(i => i.a.id === id);
      if (it) it.o.visible = false;
    },
  };
}
