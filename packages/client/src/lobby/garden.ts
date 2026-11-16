// Plants on RV lots (design/grow-mechanics.md). Plants sit in grow gear placed with Build Mode (catalog `slots`).
// The owner's client ticks its own plants once a second while they're in the game (lobby or golf course), and saves
// them with the lot (plots/{uid}.garden), so every visitor sees them grow.
// Care v2 (Schedule 1 style): water and fertilizer are physical. Grab the watering can at your spigot, walk up to a
// plant and hold E to pour; grab fertilizer from the bin and hold E to spread it. Sprinklers (Build Mode) water
// everything within 2.6 m by themselves. Visitors can water with a can: their pours travel in their presence (`gw`)
// and the owner's client applies them. Only the owner plants, fertilizes and harvests.
import * as THREE from 'three';
import {
  STRAINS,
  STRAIN,
  GEAR,
  QUALITY,
  STAGES,
  newPlant,
  tickPlant,
  pour,
  rootRot,
  fertilize,
  stageOf,
  progressOf,
  growTotal,
  qualityOf,
  yieldOf,
  SPRINKLER_R,
  type Plant,
  cleanGarden,
} from '@gh/shared';
import { defOf, type Placed } from './build';
import { SPIGOT, FERT_BIN, type Plot } from './world';
import { progress, addCash, addProduct, useFert, slotsUsed, INV_SLOTS } from '../avatar/progress';
import type { Golfer } from '../characters/golfer';

export type Garden = Record<string, Plant>;
export type Held = 'can' | 'fert' | null;
export interface HeldPres {
  h: 'can' | 'fert';
  p?: 1;
}
const PAD_Y = 0.06,
  CAN_CAP = 3,
  FERT_PRICE = 25,
  FERT_DOSES = 3,
  POUR_RATE = 0.5,
  SPREAD_RATE = 0.75,
  REACH = 1.25;
export const slotKey = (p: Placed, i: number) => `${p.k}@${p.x.toFixed(2)},${p.z.toFixed(2)}:${i}`;
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------------------------------------------------------------- textures -----------------------------------------
let leafTex: THREE.Texture | null = null;
function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 120);
  const leaflet = (ang: number, len: number) => {
    // a long serrated leaflet
    g.save();
    g.rotate(ang);
    g.beginPath();
    g.moveTo(0, 0);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10,
        w = Math.sin(Math.PI * t) * len * 0.14 * (1 - t * 0.35),
        y = -t * len;
      g.lineTo(w + (i % 2 ? 2 : 0), y);
    }
    for (let i = 10; i >= 0; i--) {
      const t = i / 10,
        w = Math.sin(Math.PI * t) * len * 0.14 * (1 - t * 0.35),
        y = -t * len;
      g.lineTo(-w - (i % 2 ? 2 : 0), y);
    }
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -len * 0.95);
    g.stroke();
    g.restore();
  };
  [
    [-1.25, 52],
    [-0.85, 76],
    [-0.42, 98],
    [0, 112],
    [0.42, 98],
    [0.85, 76],
    [1.25, 52],
  ].forEach(([a, l]) => leaflet(a, l));
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}
const iconCache = new Map<string, THREE.Texture>();
/** Little floating signs over a plant: thirsty (blue drop), dry and paused (red), wants fertilizer (brown). */
function iconTex(kind: 'thirsty' | 'dry' | 'fert') {
  let t = iconCache.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = kind === 'dry' ? '#d83a2a' : kind === 'fert' ? '#8a5a2a' : '#2f8fd8';
  g.strokeStyle = '#fff';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  if (kind === 'fert') {
    g.fillRect(22, 20, 20, 26);
    g.fillStyle = '#8a5a2a';
    g.fillRect(25, 26, 14, 4);
  } else {
    g.beginPath();
    g.moveTo(32, 13);
    g.bezierCurveTo(44, 30, 44, 34, 44, 38);
    g.arc(32, 38, 12, 0, Math.PI);
    g.bezierCurveTo(20, 34, 20, 30, 32, 13);
    g.fill();
    if (kind === 'dry') {
      g.fillStyle = '#d83a2a';
      g.fillRect(30, 26, 4, 10);
      g.fillRect(30, 40, 4, 4);
    }
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  iconCache.set(kind, t);
  return t;
}
let glint: THREE.Texture | null = null;
function glintTex() {
  if (glint) return glint;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,240,180,.6)');
  gr.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.fillRect(30, 4, 4, 56);
  g.fillRect(4, 30, 56, 4);
  glint = new THREE.CanvasTexture(c);
  return glint;
}

// ---------------------------------------------------------------- plant models ------------------------------------
const LEAF_GEO = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const BUD_GEO = new THREE.IcosahedronGeometry(1, 0);
const SOIL_GEO = new THREE.CircleGeometry(0.2, 18).rotateX(-Math.PI / 2);
const WET = new THREE.Color('#24170d'),
  DRY = new THREE.Color('#9c8462');
const droopOf = (p: Plant) => Math.max(0, Math.min(1, (0.3 - p.w) / 0.3));
/** A plant at its stage: stem, tiers of fan leaves (drooping when thirsty), buds while flowering, soil that dries out. */
function plantModel(p: Plant) {
  const s = STRAIN.get(p.s)!,
    st = stageOf(p),
    pr = progressOf(p),
    g = new THREE.Group(),
    droop = droopOf(p);
  const H = (st === 0 ? 0.08 + pr * 0.6 : Math.min(0.95, 0.18 + pr * 0.8)) * (1 - 0.15 * droop);
  const col = new THREE.Color(s.color);
  if (droop > 0) col.lerp(new THREE.Color('#a6a35a'), 0.5 * droop);
  if (st === 4) col.lerp(new THREE.Color('#b59a45'), 0.55);
  const leaf = new THREE.MeshStandardMaterial({ map: leafTexture(), color: col, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
  const soil = new THREE.Mesh(SOIL_GEO, new THREE.MeshStandardMaterial({ color: WET.clone().lerp(DRY, 1 - Math.min(1, p.w / 0.6)), roughness: 1 }));
  soil.position.y = 0.006;
  g.add(soil);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, H, 5), new THREE.MeshStandardMaterial({ color: '#5b7a2e', roughness: 0.8 }));
  stem.position.y = H / 2;
  g.add(stem);
  const tiers = Math.max(1, Math.round(1 + H * 7));
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers,
      y = H * (0.15 + 0.85 * t),
      size = (0.09 + 0.28 * (1 - t) * Math.min(1, H / 0.45)) * (st === 0 ? 0.7 : 1);
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(LEAF_GEO, leaf);
      m.scale.setScalar(size);
      m.position.y = y;
      m.rotation.set(-1.0 + t * 0.4 - droop * 0.75, i * 1.1 + k * (Math.PI / 2), 0, 'YXZ');
      m.castShadow = true;
      g.add(m);
    }
  }
  if (st >= 2) {
    // buds: more and bigger through flowering; frosty when ready
    const f = st >= 3 ? 1 : Math.min(1, (p.g / 60 - s.mins[0] - s.mins[1]) / s.mins[2]);
    const bud = new THREE.MeshStandardMaterial({
      color: st >= 3 ? (st === 4 ? '#b9a868' : '#d6e8b8') : '#9fc46a',
      roughness: 0.55,
      emissive: st === 3 ? '#2a3a12' : '#000000',
    });
    const hair = new THREE.MeshStandardMaterial({ color: '#d9822b', roughness: 0.7 });
    const n = Math.round(3 + f * 9);
    for (let i = 0; i < n; i++) {
      const t = i / n,
        y = H * (0.45 + 0.55 * t),
        a = i * 2.4,
        r = (1 - t) * 0.12,
        sz = (0.018 + f * 0.03) * (i === n - 1 ? 1.6 : 1);
      const b = new THREE.Mesh(BUD_GEO, bud);
      b.scale.set(sz, sz * 1.5, sz);
      b.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      g.add(b);
      if (f > 0.3) {
        const h = new THREE.Mesh(BUD_GEO, hair);
        h.scale.setScalar(sz * 0.35);
        h.position.set(b.position.x + sz * 0.6, y + sz * 0.6, b.position.z);
        g.add(h);
      }
    }
  }
  const icon = st >= 3 ? null : p.w <= 0 ? 'dry' : p.w < 0.25 ? 'thirsty' : st > 0 && p.n < 0.15 ? 'fert' : null;
  if (icon) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(icon), depthTest: false, transparent: true }));
    sp.scale.setScalar(0.16);
    sp.position.y = H + 0.25;
    sp.renderOrder = 5;
    sp.userData.bob = true;
    g.add(sp);
  }
  if (st === 3) {
    // ready: a soft pulsing glint so it reads from a distance
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glintTex(), color: '#fff3c0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    sp.scale.setScalar(0.35);
    sp.position.y = H + 0.08;
    sp.userData.glint = true;
    g.add(sp);
  }
  return g;
}
function disposeTree(o: THREE.Object3D) {
  o.traverse(c => {
    const m = c as THREE.Mesh;
    if (m.isMesh || (c as any).isSprite) {
      if (m.geometry && m.geometry !== LEAF_GEO && m.geometry !== BUD_GEO && m.geometry !== SOIL_GEO) m.geometry.dispose();
      (m.material as THREE.Material)?.dispose?.();
    }
  });
}

// ---------------------------------------------------------------- held items -------------------------------------
function canModel() {
  const g = new THREE.Group(),
    body = new THREE.MeshStandardMaterial({ color: '#4f8a4a', roughness: 0.45, metalness: 0.35 });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.22, 14), body);
  b.position.y = 0.11;
  g.add(b);
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.3, 8), body);
  sp.rotation.z = -1.0;
  sp.position.set(0.17, 0.16, 0);
  g.add(sp);
  const rose = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.018, 0.04, 10),
    new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.6, roughness: 0.3 }),
  );
  rose.rotation.z = -1.0;
  rose.position.set(0.3, 0.245, 0);
  g.add(rose);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 14, Math.PI), body);
  h.position.set(-0.02, 0.22, 0);
  g.add(h);
  g.userData.spout = new THREE.Vector3(0.32, 0.26, 0);
  return g;
}
function bagModel() {
  const g = new THREE.Group(),
    b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.1), new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 0.9 }));
  b.position.y = 0.14;
  g.add(b);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.07, 0.105), new THREE.MeshStandardMaterial({ color: '#3f6b2a', roughness: 0.8 }));
  band.position.y = 0.15;
  g.add(band);
  g.userData.spout = new THREE.Vector3(0.0, 0.3, 0.06);
  return g;
}

export interface GardenHost {
  scene: THREE.Scene;
  plots: Plot[];
  me(): string;
  myPlot(): Plot | null;
  layoutOf(uid: string | null): Placed[];
  gardenOf(uid: string): Garden | undefined;
  save(g: Garden): void;
  sendWater(owner: string, key: string, amt: number): void;
  nameOf(uid: string): string;
  toast(html: string, ms?: number): void;
  onClose(): void;
  sendPres(): void;
  myGolfer(): Golfer;
  myPos(): { x: number; z: number; yaw: number };
}
export interface PlanterRef {
  plot: Plot;
  item: Placed;
  owner: string;
  mine: boolean;
}
interface SlotRef {
  plot: Plot;
  item: Placed;
  i: number;
  key: string;
  owner: string;
  mine: boolean;
  plant: Plant;
  world: THREE.Vector3;
}

export function createGarden(host: GardenHost) {
  let mine: Garden = {},
    loaded = false,
    dirty = false,
    lastSave = 0,
    clock = 0,
    openRef: PlanterRef | null = null,
    panelKey = '';
  const views = new Map<string, { o: THREE.Object3D; k: string }>(),
    layers = new Map<number, THREE.Group>();
  const LS = 'gh.garden.v1';
  const myPlanters = () => (host.myPlot() ? host.layoutOf(host.me()).filter(p => !!GEAR[p.k]) : []);
  function load() {
    if (loaded) return;
    const fromDb = host.gardenOf(host.me());
    if (fromDb) {
      mine = cleanGarden(JSON.parse(JSON.stringify(fromDb)));
      loaded = true;
      return;
    }
    try {
      const s = localStorage.getItem(LS);
      if (s) mine = cleanGarden(JSON.parse(s));
    } catch {}
    loaded = !!host.myPlot();
  }
  function persist(force = false) {
    if (!dirty && !force) return;
    const now = performance.now();
    if (!force && now - lastSave < 8000) return;
    dirty = false;
    lastSave = now;
    try {
      localStorage.setItem(LS, JSON.stringify(mine));
    } catch {}
    host.save(JSON.parse(JSON.stringify(mine)));
  }
  const slotLocal = (it: Placed, i: number) => {
    const s = defOf(it)?.slots?.[i] || [0, 0.4, 0],
      c = Math.cos(it.r),
      sn = Math.sin(it.r);
    return new THREE.Vector3(it.x + s[0] * c + s[2] * sn, PAD_Y + s[1], it.z - s[0] * sn + s[2] * c);
  };
  // the owner's plants grow once a second while the game is open (no offline growth); sprinklers top them up
  setInterval(() => {
    load();
    if (!loaded) return;
    const lay = host.layoutOf(host.me()),
      keep = new Map<string, THREE.Vector3>();
    for (const p of lay) if (GEAR[p.k]) for (let i = 0; i < GEAR[p.k].slots; i++) keep.set(slotKey(p, i), slotLocal(p, i));
    const sprinklers = lay.filter(p => p.k === 'sprinkler');
    for (const k of Object.keys(mine))
      if (!keep.has(k)) {
        delete mine[k];
        dirty = true;
      } // its pot was removed
    for (const [k, pl] of Object.entries(mine)) {
      tickPlant(pl, 1);
      dirty = true;
      const at = keep.get(k)!;
      if (pl.w < 0.45 && sprinklers.some(s => Math.hypot(s.x - at.x, s.z - at.z) <= SPRINKLER_R)) {
        pl.w = 1;
        sprayUntil = clock + 3;
      }
    }
    persist();
  }, 1000);
  let sprayUntil = 0;

  const gardenFor = (uid: string) => (uid === host.me() ? (loaded ? mine : host.gardenOf(uid) || {}) : host.gardenOf(uid) || {});

  // ---------------------------------------------------------------- held items & pouring
  let held: Held = null,
    can = 0,
    pouring = false,
    target: SlotRef | null = null,
    spilled = 0,
    rotted = false,
    fullSaid = false,
    sendAcc = 0,
    sendT = 0;
  const heldMesh: Record<'can' | 'fert', THREE.Group> = { can: canModel(), fert: bagModel() };
  for (const m of Object.values(heldMesh)) {
    m.visible = false;
    host.scene.add(m);
  }
  const stream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.03, 1, 8, 1, true).translate(0, -0.5, 0),
    new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.55, depthWrite: false }),
  );
  stream.visible = false;
  host.scene.add(stream);
  const grains = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(60 * 3), 3)),
    new THREE.PointsMaterial({ color: '#5a3a1a', size: 0.035 }),
  );
  grains.visible = false;
  grains.frustumCulled = false;
  host.scene.add(grains);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.26, 32, 1, 0, Math.PI * 2),
    new THREE.MeshBasicMaterial({ color: '#c9a35a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  host.scene.add(ring);

  const worldOf = (pl: Plot, v: THREE.Vector3) => pl.group.localToWorld(v.clone());
  /** The plant you'd pour on: the nearest planted slot within reach (any lot for water, your own for fertilizer). */
  function pourTarget(x: number, z: number): SlotRef | null {
    if (!held) return null;
    let best: SlotRef | null = null,
      bd = REACH;
    for (const pl of host.plots) {
      if (!pl.owner || (held === 'fert' && pl.owner !== host.me())) continue;
      const g = gardenFor(pl.owner);
      for (const it of host.layoutOf(pl.owner)) {
        if (!GEAR[it.k]) continue;
        for (let i = 0; i < GEAR[it.k].slots; i++) {
          const key = slotKey(it, i),
            p = g[key];
          if (!p) continue;
          const w = worldOf(pl, slotLocal(it, i)),
            d = Math.hypot(w.x - x, w.z - z);
          if (d < bd) {
            bd = d;
            best = { plot: pl, item: it, i, key, owner: pl.owner, mine: pl.owner === host.me(), plant: p, world: w };
          }
        }
      }
    }
    return best;
  }
  const myLotSpot = (lx: number, lz: number) => {
    const pl = host.myPlot();
    return pl ? worldOf(pl, new THREE.Vector3(lx, 0, lz)) : null;
  };
  const doses = () => progress().fert;
  /** Spigot / fertilizer bin at your own lot, if you're standing by it. */
  function station(x: number, z: number): 'spigot' | 'bin' | null {
    const s = myLotSpot(SPIGOT[0], SPIGOT[1]),
      b = myLotSpot(FERT_BIN[0], FERT_BIN[1]);
    if (s && Math.hypot(s.x - x, s.z - z) < 1.1) return 'spigot';
    if (b && Math.hypot(b.x - x, b.z - z) < 1.1) return 'bin';
    return null;
  }
  function stationLabel(k: 'spigot' | 'bin') {
    if (k === 'spigot') return held === 'can' ? (can >= CAN_CAP - 0.01 ? 'The can is full' : 'Fill the watering can') : 'Take the watering can';
    return held === 'fert'
      ? `Fertilizer: ${doses()} dose${doses() === 1 ? '' : 's'} left`
      : doses()
        ? `Take out your fertilizer (${doses()} dose${doses() === 1 ? '' : 's'})`
        : 'No fertilizer: Grow Supply on the West Side sells it';
  }
  async function useStation(k: 'spigot' | 'bin') {
    if (k === 'spigot') {
      held = 'can';
      can = CAN_CAP;
      host.toast('💧 Watering can filled. Walk up to a plant and <b>hold E</b> to pour.', 2600);
    } else {
      if (!doses()) {
        host.toast("You're out of fertilizer. Grow Supply on the West Side sells it.", 2600);
        return;
      }
      held = 'fert';
      host.toast(`🧪 Fertilizer in hand: ${doses()} dose${doses() === 1 ? '' : 's'}. <b>Hold E</b> by a plant to spread it.`, 2600);
    }
    host.sendPres();
  }
  function putAway() {
    if (!held) return false;
    held = null;
    pourEnd();
    host.toast('Put it away.', 900);
    host.sendPres();
    return true;
  }
  function pourBegin(x: number, z: number) {
    target = pourTarget(x, z);
    if (!target) return false;
    if (held === 'can' && can <= 0.01) {
      host.toast("The can's empty. Refill it at your spigot.", 2000);
      return true;
    }
    if (held === 'fert' && doses() <= 0) {
      host.toast('Out of fertilizer. Grow Supply sells it.', 2000);
      return true;
    }
    pouring = true;
    spilled = 0;
    rotted = false;
    fullSaid = false;
    host.sendPres();
    return true;
  }
  function pourEnd() {
    if (!pouring) return;
    pouring = false;
    stream.visible = grains.visible = ring.visible = false;
    if (target && !target.mine && sendAcc > 0) {
      host.sendWater(target.owner, target.key, sendAcc);
      sendAcc = 0;
    }
    target = null;
    persist(true);
    host.sendPres();
  }
  function tickPour(dt: number) {
    if (!pouring || !target) return;
    const p = target.mine ? mine[target.key] : target.plant;
    if (!p) {
      pourEnd();
      return;
    }
    if (held === 'can') {
      if (can <= 0) {
        host.toast("The can's empty. Refill it at your spigot.", 2000);
        pourEnd();
        return;
      }
      const amt = Math.min(POUR_RATE * dt, can);
      can -= amt;
      if (target.mine) {
        const before = p.w;
        spilled += pour(p, amt);
        dirty = true;
        if (p.w >= 1 && before < 1 && !fullSaid) {
          fullSaid = true;
          host.toast('✓ Fully watered.', 1200);
        }
        if (spilled > 0.3 && !rotted) {
          rotted = true;
          rootRot(p);
          host.toast('Too much! The soil is puddling: overwatering causes root rot.', 2600);
        }
      } else {
        p.w = Math.min(1, p.w + amt);
        sendAcc += amt;
        sendT += dt;
        if (sendT > 0.5) {
          sendT = 0;
          host.sendWater(target.owner, target.key, sendAcc);
          sendAcc = 0;
        }
      }
    } else if (held === 'fert') {
      fertilize(p, SPREAD_RATE * dt);
      dirty = true;
      if (p.n >= 1) {
        useFert();
        host.toast(`✓ Fertilized. ${doses()} dose${doses() === 1 ? '' : 's'} left.`, 1500);
        if (doses() <= 0) held = null;
        pourEnd();
        return;
      }
    }
  }
  const _v = new THREE.Vector3(),
    _q = new THREE.Quaternion();
  /** Put a held item in a golfer's right hand (tilted while pouring). */
  function placeInHand(m: THREE.Object3D, g: Golfer, yaw: number, tilt: number) {
    const hand = (g as any).by?.RightHand as THREE.Bone | undefined;
    if (hand) hand.getWorldPosition(_v);
    else _v.copy(g.root.position).add(new THREE.Vector3(Math.sin(yaw + 1.2) * 0.3, 0.8, Math.cos(yaw + 1.2) * 0.3));
    m.position.copy(_v).add(new THREE.Vector3(0, -0.14, 0));
    m.rotation.set(0, yaw - Math.PI / 2, 0);
    m.rotateZ(-tilt);
  }
  // other players' cans and bags
  const remoteHeld = new Map<string, { m: THREE.Group; k: string }>();
  function remotes(list: { id: string; golfer: Golfer; yaw: number; hd?: HeldPres }[]) {
    const seen = new Set<string>();
    for (const r of list) {
      if (!r.hd || (r.hd.h !== 'can' && r.hd.h !== 'fert')) continue;
      seen.add(r.id);
      let e = remoteHeld.get(r.id);
      if (!e || e.k !== r.hd.h) {
        if (e) host.scene.remove(e.m);
        e = { m: r.hd.h === 'can' ? canModel() : bagModel(), k: r.hd.h };
        host.scene.add(e.m);
        remoteHeld.set(r.id, e);
      }
      placeInHand(e.m, r.golfer, r.yaw, r.hd.p ? 0.9 : 0);
    }
    for (const [id, e] of remoteHeld)
      if (!seen.has(id)) {
        host.scene.remove(e.m);
        remoteHeld.delete(id);
      }
  }

  /** Draw every lot's plants, and the held item / pouring effects. */
  function update(dt: number) {
    clock += dt;
    const seen = new Set<string>();
    for (const pl of host.plots) {
      if (!pl.owner) continue;
      let layer = layers.get(pl.lot);
      if (!layer) {
        layer = new THREE.Group();
        layer.name = 'gardenLayer'; // the lobby hides this when the lot is far away
        pl.group.add(layer);
        layers.set(pl.lot, layer);
      }
      const g = gardenFor(pl.owner);
      for (const it of host.layoutOf(pl.owner)) {
        if (it.k === 'sprinkler') continue;
        if (!GEAR[it.k]) continue;
        for (let i = 0; i < GEAR[it.k].slots; i++) {
          const key = slotKey(it, i),
            p = g[key];
          if (!p || !STRAIN.has(p.s)) continue;
          const id = pl.lot + '|' + key;
          seen.add(id);
          const k = `${p.s}|${stageOf(p)}|${Math.round(progressOf(p) * 12)}|${Math.round(droopOf(p) * 4)}|${Math.round(Math.min(1, p.w / 0.6) * 5)}|${p.w <= 0 ? 0 : p.w < 0.25 ? 1 : stageOf(p) > 0 && p.n < 0.15 ? 2 : 3}|${it.r}`;
          let v = views.get(id);
          if (!v || v.k !== k) {
            if (v) {
              v.o.parent?.remove(v.o);
              disposeTree(v.o);
            }
            const o = plantModel(p);
            o.position.copy(slotLocal(it, i));
            o.rotation.y = (p.id % 628) / 100;
            o.scale.setScalar(1.3);
            layer.add(o);
            v = { o, k };
            views.set(id, v);
          }
          v.o.traverse(c => {
            if (c.userData.glint) {
              const s = 0.28 + 0.1 * Math.sin(clock * 3 + p.id);
              c.scale.setScalar(s);
              ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.55 + 0.35 * Math.sin(clock * 3 + p.id);
            }
            if (c.userData.bob) {
              if (c.userData.y0 === undefined) c.userData.y0 = c.position.y;
              c.position.y = c.userData.y0 + Math.sin(clock * 3) * 0.03;
            }
          });
        }
      }
    }
    for (const [id, v] of views)
      if (!seen.has(id)) {
        v.o.parent?.remove(v.o);
        disposeTree(v.o);
        views.delete(id);
      }
    // sprinkler heads spin while they're watering
    if (clock < sprayUntil)
      host.myPlot()?.group.traverse(c => {
        if (c.userData.sprinklerHead) c.rotation.y += dt * 6;
      });
    // the held item in your hand, the water stream / fertilizer
    tickPour(dt);
    const g = host.myGolfer(),
      pos = host.myPos();
    for (const [k, m] of Object.entries(heldMesh) as ['can' | 'fert', THREE.Group][]) {
      m.visible = held === k && g.root.visible;
      if (m.visible) placeInHand(m, g, pos.yaw, pouring ? 0.9 : 0);
    }
    if (pouring && target && held) {
      const m = heldMesh[held],
        tip = m.localToWorld(m.userData.spout.clone()),
        soil = target.world.clone().setY(target.world.y + 0.05);
      if (held === 'can') {
        const len = Math.max(0.05, tip.distanceTo(soil));
        stream.visible = true;
        stream.position.copy(tip);
        stream.scale.set(1, len, 1);
        stream.quaternion.copy(_q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), soil.clone().sub(tip).normalize()));
        (stream.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.15 * Math.sin(clock * 30);
      } else {
        grains.visible = ring.visible = true;
        const a = grains.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < 60; i++) {
          const f = (clock * 2.5 + i / 60) % 1,
            r = 0.05 + (i % 7) * 0.025,
            an = i * 2.4 + clock;
          a.setXYZ(
            i,
            tip.x + (soil.x - tip.x) * f + Math.cos(an) * r * f,
            tip.y + (soil.y - tip.y) * f,
            tip.z + (soil.z - tip.z) * f + Math.sin(an) * r * f,
          );
        }
        a.needsUpdate = true;
        ring.position.copy(soil).setY(soil.y + 0.01);
        const prog = target.mine ? (mine[target.key]?.n ?? 0) : 0;
        ring.geometry.dispose();
        ring.geometry = new THREE.RingGeometry(0.2, 0.26, 32, 1, 0, Math.PI * 2 * Math.max(0.02, prog));
      }
    }
    if (openRef) renderPanel();
  }

  /** The grow gear within reach of a point (world), on any lot. */
  function nearest(x: number, z: number): PlanterRef | null {
    let best: PlanterRef | null = null,
      bd = 1.5;
    const v = new THREE.Vector3();
    for (const pl of host.plots) {
      if (!pl.owner) continue;
      for (const it of host.layoutOf(pl.owner)) {
        if (!GEAR[it.k]) continue;
        v.set(it.x, 0, it.z);
        pl.group.localToWorld(v);
        const def = defOf(it)!,
          d = Math.max(0, Math.hypot(v.x - x, v.z - z) - Math.max(def.w, def.d) / 2 + 0.3);
        if (d < bd) {
          bd = d;
          best = { plot: pl, item: it, owner: pl.owner, mine: pl.owner === host.me() };
        }
      }
    }
    return best;
  }
  const labelFor = (r: PlanterRef) => {
    const g = gardenFor(r.owner),
      n = GEAR[r.item.k].slots,
      plants = [...Array(n).keys()].map(i => g[slotKey(r.item, i)]).filter(Boolean) as Plant[];
    const ready = plants.filter(p => stageOf(p) >= 3).length,
      thirsty = plants.filter(p => p.w < 0.25).length;
    return r.mine
      ? ready
        ? `Harvest (${ready} ready)`
        : !plants.length
          ? `Plant something`
          : thirsty
            ? `Check your plants · ${thirsty} thirsty: get the can at your spigot`
            : `Check your plants`
      : thirsty
        ? `${host.nameOf(r.owner)}'s plants look thirsty`
        : `Look at ${host.nameOf(r.owner)}'s plants`;
  };
  /** What holding E would do right now (for the prompt), or null. */
  function pourLabel(x: number, z: number) {
    const t = pourTarget(x, z);
    if (!t) return null;
    const p = t.plant;
    if (held === 'can')
      return can <= 0.01
        ? 'The can is empty: refill at your spigot'
        : `Hold to water${t.mine ? '' : ` ${host.nameOf(t.owner)}'s plant`} · ${Math.round(p.w * 100)}% · can ${Math.round((can / CAN_CAP) * 100)}%`;
    return `Hold to fertilize · ${Math.round(p.n * 100)}% · ${doses()} dose${doses() === 1 ? '' : 's'} left`;
  }

  // ---- the planter panel: info + planting + harvest (care is physical now)
  const ui = document.createElement('div');
  ui.id = 'lgrow';
  ui.className = 'hidden';
  (document.getElementById('lobbyui') || document.body).appendChild(ui);
  function open(r: PlanterRef) {
    load();
    openRef = r;
    panelKey = '';
    ui.classList.remove('hidden');
    renderPanel();
  }
  function close() {
    openRef = null;
    ui.classList.add('hidden');
    host.onClose();
  }
  const bar = (v: number, cls: string) =>
    `<span class="gmeter ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span>`;
  const minsLeft = (p: Plant) => {
    const s = Math.max(0, growTotal(p) - p.g) / 60;
    return s < 1 ? '<1 min' : `~${Math.ceil(s)} min`;
  };
  function renderPanel() {
    const r = openRef!,
      g = gardenFor(r.owner),
      gear = GEAR[r.item.k],
      def = defOf(r.item)!,
      cash = progress().cash;
    const rows = [...Array(gear.slots).keys()]
      .map(i => {
        const key = slotKey(r.item, i),
          p = g[key];
        if (!p)
          return r.mine
            ? `<div class="grow-slot"><div class="gs-h"><b>Empty</b><span>Plant a seed:</span></div><div class="gs-btns">${STRAINS.map(s => `<button data-plant="${i}:${s.id}" ${cash >= s.seed ? '' : 'disabled'}>${esc(s.name)} <em>${money(s.seed)}</em></button>`).join('')}</div></div>`
            : `<div class="grow-slot"><div class="gs-h"><b>Empty</b></div></div>`;
        const s = STRAIN.get(p.s)!,
          st = stageOf(p),
          q = qualityOf(p, r.item.k);
        const hint =
          st >= 3
            ? st === 4
              ? 'Overripe: losing quality, harvest soon'
              : 'Ready to harvest!'
            : p.w <= 0
              ? 'Bone dry: growth paused. Water it!'
              : p.w < 0.25
                ? 'Thirsty: grab the watering can'
                : st > 0 && p.n < 0.15
                  ? 'Hungry: spread some fertilizer'
                  : st > 0 && p.n < 0.35
                    ? 'Could use fertilizer'
                    : 'Happy';
        const btns = st >= 3 && r.mine ? `<button class="primary" data-harvest="${i}">Harvest <kbd>E</kbd></button>` : '';
        return `<div class="grow-slot"><div class="gs-h"><b>${esc(s.name)}</b><span>${STAGES[st]}${st < 3 ? ' · ' + minsLeft(p) : ''}</span><span class="q q${q}">${st >= 3 ? '' : 'heading for '}${QUALITY[q]}</span></div>
        <div class="gs-bars"><label>Growth ${bar(progressOf(p), 'g')}</label><label>Water ${bar(p.w, p.w < 0.25 ? 'w low' : 'w')}</label>${st < 3 ? `<label>Fertilizer ${bar(p.n, p.n < 0.15 ? 'n low' : 'n')}</label>` : ''}</div>
        <div class="gs-foot"><span class="hint${hint === 'Happy' ? '' : ' warn'}">${hint}</span><div class="gs-btns">${btns}</div></div></div>`;
      })
      .join('');
    const h = `<div class="card"><button class="x" data-close>✕</button><h2>${esc(def.name)}</h2><div class="sub">${r.mine ? `Your lot · up to <b>${QUALITY[gear.ceil]}</b> quality in this gear · water with the can from your <b>spigot</b>, fertilizer from the <b>bin</b> beside it` : `${esc(host.nameOf(r.owner))}'s lot · bring a watering can to help out`}</div>${rows}
      <div class="gfoot">${r.mine ? `Cash ${money(cash)} · plants only grow while you're in the game` : ''}<span>Close <kbd>Esc</kbd></span></div></div>`;
    if (h === panelKey) return;
    panelKey = h;
    ui.innerHTML = h;
    ui.querySelector('[data-close]')?.addEventListener('click', close);
    ui.querySelectorAll<HTMLButtonElement>('[data-plant]').forEach(
      b =>
        (b.onclick = () => {
          const [i, sid] = b.dataset.plant!.split(':');
          plant(r, +i, sid);
        }),
    );
    ui.querySelectorAll<HTMLButtonElement>('[data-harvest]').forEach(b => (b.onclick = () => harvest(r, +b.dataset.harvest!)));
  }
  async function plant(r: PlanterRef, i: number, sid: string) {
    const s = STRAIN.get(sid)!,
      key = slotKey(r.item, i);
    if (!r.mine || mine[key]) return;
    if (!(await addCash(-s.seed))) {
      host.toast('Not enough cash for those seeds.');
      return;
    }
    mine[key] = newPlant(sid, Math.floor(Math.random() * 1e9));
    dirty = true;
    persist(true);
    host.toast(`Planted <b>${esc(s.name)}</b>. Keep it watered: the can is at your spigot.`, 2600);
  }
  async function harvest(r: PlanterRef, i: number) {
    const key = slotKey(r.item, i),
      p = mine[key];
    if (!r.mine || !p || stageOf(p) < 3) return;
    const q = qualityOf(p, r.item.k),
      n = yieldOf(p, r.item.k),
      s = STRAIN.get(p.s)!;
    if (!progress().product.some(x => x.s === p.s && x.q === q) && slotsUsed() >= INV_SLOTS) {
      host.toast('Your inventory is full (32 slots). Sell or roll something first.', 3000);
      return;
    }
    delete mine[key];
    dirty = true;
    persist(true);
    await addProduct(p.s, q, n);
    host.toast(`✂️ Harvested <b>${n} × ${esc(s.name)}</b> · <b>${QUALITY[q]}</b> quality. Sell it to the Street Dealer in the plaza.`, 4000);
  }
  /** A visitor's watering, seen in their presence. Applied once per message, only to our own plants. */
  const applied = new Set<string>();
  function visitorWater(from: string, gw: { o: string; k: string; at: number; amt?: number } | undefined) {
    if (!gw || gw.o !== host.me() || Math.abs(Date.now() - gw.at) > 120000) return;
    const id = from + gw.at;
    if (applied.has(id)) return;
    applied.add(id);
    load();
    const p = typeof gw.k === 'string' && Object.prototype.hasOwnProperty.call(mine, gw.k) ? mine[gw.k] : null;
    if (!p) return;
    pour(p, Math.max(0, Math.min(1, gw.amt ?? 1)));
    dirty = true;
    if (!applied.has(from + 'toast')) {
      applied.add(from + 'toast');
      host.toast(`💧 ${esc(host.nameOf(from))} is watering your plants.`, 2200);
      setTimeout(() => applied.delete(from + 'toast'), 30000);
    }
  }
  function key(e: KeyboardEvent) {
    if (e.code === 'Escape') return close();
    if (e.code === 'KeyE' && openRef?.mine) {
      const g = gardenFor(openRef.owner);
      for (let i = 0; i < GEAR[openRef.item.k].slots; i++) {
        const p = g[slotKey(openRef.item, i)];
        if (p && stageOf(p) >= 3) {
          harvest(openRef, i);
          return;
        }
      }
      close();
    }
  }
  /** Build Mode asks before moving or removing gear: plants in it would be lost. */
  const hasPlants = (it: Placed) => {
    load();
    if (!GEAR[it.k]) return false;
    for (let i = 0; i < GEAR[it.k].slots; i++) if (mine[slotKey(it, i)]) return true;
    return false;
  };
  const pres = (): HeldPres | undefined => (held ? { h: held, p: pouring ? 1 : undefined } : undefined);
  return {
    update,
    nearest,
    labelFor,
    open,
    close,
    key,
    visitorWater,
    hasPlants,
    isOpen: () => !!openRef,
    debug: () => {
      load();
      return mine;
    },
    held: () => held,
    station,
    stationLabel,
    useStation,
    putAway,
    pourTarget,
    pourLabel,
    pourBegin,
    pourEnd,
    isPouring: () => pouring,
    pres,
    remotes,
  };
}
