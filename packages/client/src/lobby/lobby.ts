// Lobby mode: walk your golfer around Golden Hills, see and chat with everyone here, claim a lot, change your look
// at the pro shop, and start a round (solo or as a group) from the tee-time board.
import * as THREE from 'three';
import {
  cleanGarden,
  useHole,
  codeSeed,
  holeCode,
  matchIdFor,
  randomHoleSeed,
  HOLE_LEN,
  COURSE,
  tournamentIdFor,
  randomTourSeed,
  cupFor,
  tournamentHoles,
  holeIdea,
  type TourSize,
} from '@gh/shared';
import { createTeeBoard } from './teeBoard';
import { createWardrobe } from './wardrobe';
import { createLobbyCart, cartYaw, cleanVeh } from './cart';
import { colorFor } from '../avatar/colors';
import { createBuild, renderLot, cleanLayout, lotGroup, STARTER, type Placed, thumb } from './build';
import {
  vehicleKind,
  cartModel,
  DRIVE_FX,
  CARS,
  CAR,
  CAR_PAINTS,
  CAR_RIMS,
  carModel,
  loadCarKit,
  type Vehicle,
  type VehState,
} from '../vehicles/vehicles';
import { Golfer, stepLength, type Outfit, type GestureKind } from '../characters/golfer';
import {
  buildLobby,
  SIDEWALKS,
  LOTS,
  setPlotOwner,
  toWorld,
  groundY,
  surfaceOf,
  HALF,
  BOUND,
  FUN,
  WEST,
  WEST_OFF,
  inWorld,
  type Plot,
  type Collider,
} from './world';
import { buildFunLand, funSurface } from './funland';
import { createPutt } from './putt';
import { ambience } from '../audio/ambience';
import { controls, type ControlRow } from '../ui/controls';
import { options, opts } from '../ui/options';
import { createCritters, type Scarer } from '../world/critters';
import { createStrollers } from './strollers';
import { BALLS, BALL, RARITY_COLOR, ballPreview, DEFAULT_BALL } from '../avatar/balls';
import { CAPSULE_COLORS } from './gachaMachine';
import { Grass } from '../world/grass';
import { loadProgress, progress, spin, onProgress } from '../avatar/progress';
import { createBlackjack, type BJPres } from './blackjack';
import { createGarden, type PlanterRef, type HeldPres } from './garden';
import { createDealer, DEALER_POS } from './dealer';
import { createAttendants } from './attendants';
import { createTownLife } from './townLife';
import { createStaticBatcher } from '../world/staticBatch';
import { type RadioSource } from '../audio/radio';
import { cartRadio } from '../audio/cartRadio';
import { createRange } from './range';
import { buildWestSide, westRiseMesh } from './westside';
import { buyItem, setPlaced, ownAtLeast, setTrail, setCar, paintCar, sellTrophy, isPlaced } from '../avatar/progress';
import { TRAILS } from '../avatar/trails';
import type { Shop } from './wardrobe';
import { ITEMS, loadItemModels } from './catalog';
import { objectImage } from '../world/trophy';
import { speedo } from '../ui/speedo';
import { invIcon } from './invIcons';
import { PAPERS_PRICE, GRINDER_PRICE } from './dealer';
import { tickWater } from '../world/water';
import { playSample, wireUiSounds } from '../audio/samples';
import { patchCloudShadows } from '../world/sky';
import { createSmoke, type SmokePres } from './smoke';
import { createMail } from './mail';
import { SWATCH, sanitizeLook, lookKey, randomLook, loadLocalLook, saveLocalLook } from '../avatar/outfit';
import { platform, resolveNames, type Platform } from '../platform';
import { Sfx } from '../fx';
import { snapSun } from '../world/course';
import { createVlt } from './vlt';
import { loadPhysics, PhysWorld, Flop, rapier, grp, G_STATIC, G_RAG, G_VEH } from '../physics/ragdoll';

const $ = (id: string) => document.getElementById(id)!;
const esc = (t: string) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const LOT_ORDER = [7, 2, 4, 5, 1, 3, 6, 8];

/** Presence each lobby client publishes (absolute state; newcomers get it as-is). */
interface LPres {
  v: 2;
  x: number;
  z: number;
  y?: number;
  yaw: number;
  spd: number;
  o: Outfit;
  say?: string;
  sayAt?: number;
  q?: number;
  go?: { id: string; at: number; m: string[] } | null;
  g?: string;
  ed?: boolean;
  rg?: Rg;
  car?: VehState | null;
  dr?: 1;
  bj?: BJPres;
  /** the lounge machine this player is sitting at (0–3) */
  vm?: number;
  sm?: SmokePres;
  /** cart radio, while the cart is out with it on (driven or parked): [band, volume] */
  rd?: [number, number];
  /** best go-kart lap, seconds */
  kb?: number;
  /** mini putt in progress: hole, strokes, ball x and z in centimetres */
  mp?: [number, number, number, number];
  /** a gesture: which (0 wave, 1 point, 2 thumbs up, 3 cheer) and a counter that goes up with each new one */
  ge?: [number, number];
  gw?: { o: string; k: string; at: number; amt?: number };
  hd?: HeldPres;
}
/** ragdoll event: when, start velocity, impulse (on `at`) — every client replays it on that player's body */
interface Rg {
  t: number;
  v: number[];
  i: number[];
  at: string;
  k: string;
}
interface Remote {
  peer: string;
  by: string;
  golfer: Golfer;
  key: string;
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  tyaw: number;
  spd: number;
  ty: number;
  y: number;
  gy: number;
  aspd: number;
  phase: number;
  tag: HTMLDivElement;
  bub: HTMLDivElement;
  pres: LPres | null;
  sayAt: number;
  rgT?: number;
  flop?: Flop | null;
  cart?: Vehicle | null;
  hitCD?: number;
}

export interface LobbyEnv {
  renderer: THREE.WebGLRenderer;
  startGolf(o: { matchId: string; group: boolean; look: Outfit; order?: string[] }): void;
}

const FOUNTAIN_AT = new THREE.Vector3(0, 1, 0);
/** What the keys do in each situation in town, for the controls panel (ui/controls.ts). */
const TOWN_KEYS: Record<string, [string, ControlRow[]]> = {
  putt: [
    'Mini putt',
    [
      [['A', 'D'], 'Aim (Shift: fine)'],
      ['mouse:right', 'Drag to aim'],
      ['Space', 'Hold to charge, let go to putt', true],
      ['R', 'Back to the tee (one stroke)'],
      ['Esc', 'Leave the course'],
    ],
  ],
  range: [
    'Driving range',
    [
      [['Q', 'E'], 'Change club'],
      [['A', 'D'], 'Aim (Shift: fine)'],
      ['Space', 'Hold to charge, let go to hit', true],
      ['Esc', 'Leave the range'],
    ],
  ],
  walk: [
    'On foot',
    [
      [['W', 'A', 'S', 'D'], 'Move'],
      ['Shift', 'Sprint'],
      ['Space', 'Jump'],
      ['mouse:move', 'Look around (click first)'],
      ['E', 'Use what’s in front of you', true],
      ['Enter', 'Chat'],
      ['Q', 'Emotes'],
      ['Tab', 'Menu: map, stash, trophies…'],
    ],
  ],
  drive: [
    'Driving',
    [
      [['W', 'S'], 'Drive / reverse'],
      [['A', 'D'], 'Steer'],
      ['Space', 'Brake · hold in a turn to drift'],
      ['Shift', 'Floor it'],
      ['E', 'Hop out', true],
      ['R', 'Radio on / off'],
      [['1', '…', '0'], 'Radio stations'],
      [['−', '='], 'Radio volume'],
    ],
  ],
  build: [
    'Build Mode',
    [
      ['mouse:left', 'Place · pick up an item', true],
      [['Q', 'E'], 'Rotate'],
      ['G', 'Grid on / off'],
      ['X', 'Remove'],
      [['Ctrl', 'Z'], 'Undo'],
      ['mouse:right', 'Drag to turn the camera'],
      ['mouse:wheel', 'Zoom'],
      [['W', 'A', 'S', 'D'], 'Pan'],
      ['B', 'Done', true],
    ],
  ],
  bj: [
    'Blackjack',
    [
      [['1', '–', '5'], 'Pick a chip'],
      ['Space', 'Deal · bet again', true],
      ['H', 'Hit'],
      ['S', 'Stand'],
      ['D', 'Double'],
      ['P', 'Split'],
      ['V', 'Change view'],
      ['Shift', 'Lean in'],
      ['Esc', 'Leave (between hands)'],
    ],
  ],
  vlt: [
    'Slot machine',
    [
      ['Space', 'Pull the lever', true],
      [['A', 'D'], 'Bet down / up'],
      ['M', 'Max bet'],
      ['V', 'Change view'],
      ['E', 'Stand up'],
    ],
  ],
  vltp: [
    'Video poker',
    [
      ['Space', 'Deal · draw', true],
      [['1', '–', '5'], 'Keep / release a card'],
      [['A', 'D'], 'Bet down / up'],
      ['M', 'Max bet'],
      ['V', 'Change view'],
      ['E', 'Stand up'],
    ],
  ],
  chat: [
    'Chat',
    [
      ['Enter', 'Send', true],
      ['Esc', 'Cancel'],
    ],
  ],
  stash: [
    'Inventory',
    [
      ['mouse:left', 'Roll · light · put away', true],
      ['Esc', 'Close'],
    ],
  ],
  panel: [
    'Menu',
    [
      ['mouse:left', 'Choose', true],
      ['Esc', 'Close'],
    ],
  ],
};
export function createLobby(env: LobbyEnv) {
  const renderer = env.renderer,
    canvas = renderer.domElement;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();
  const { light, colliders, plots, gacha, fountain } = buildLobby(scene);
  const fun = buildFunLand(scene, colliders);
  const west = buildWestSide(scene, colliders);
  // Shaders are otherwise built the first time something comes into view, which shows up as a hitch the first time
  // you turn to face it (very noticeable in a kart). Build them all up front, and again once the late models are in.
  for (const ms of [1500, 9000]) setTimeout(() => void renderer.compileAsync?.(scene, camera)?.catch(() => {}), ms);
  gacha.setEnv(renderer);
  // grass on the bare ground between the streets and lots (not on roads, sidewalks, the plaza or the lot pads)
  const grass = new Grass({
    radius: 48,
    height: () => 0,
    kind: (x, z) => {
      const f = funSurface(x, z);
      if (f) return f === 'grass' ? 'rough' : null;
      if (groundY(x, z) !== 0 || Math.abs(x) > BOUND + 30 || Math.abs(z) > BOUND + 30) return null;
      for (const c of [-14, 14]) if (Math.abs(x - c) < 3.0 || Math.abs(z - c) < 3.0) return null; // streets
      return Math.abs(x) > BOUND - 2 || Math.abs(z) > BOUND - 2 ? 'heavy' : 'rough';
    },
  });
  scene.add(grass.group);
  // ragdoll physics: loaded in the background; the static world mirrors the walk colliders (with real heights)
  let pw: PhysWorld | null = null;
  // (fun = Fun Land's fences, barriers, stands and posts; wall = its buildings: carts and karts hit them too)
  const H: Record<string, number> = {
    gacha: 1.6,
    shop: 2.5,
    board: 2.8,
    bj: 0.95,
    bench: 0.5,
    palm: 7,
    fence: 1.6,
    rv: 2.9,
    sign: 2.1,
    fun: 1.1,
    wall: 2.6,
  };
  loadPhysics()
    .then(() => {
      const w = new PhysWorld();
      w.box(0, -0.5, 0, 300, 0.5, 300);
      w.box(0, 0.05, 0, 9.5, 0.05, 9.5);
      // kerbs and lot pads are solid too, so a cart's wheels climb them instead of sinking through
      for (const [v, off, from, to] of SIDEWALKS) {
        const mid = (from + to) / 2,
          half = (to - from) / 2;
        w.box(v ? off : mid, 0.06, v ? mid : off, v ? 0.6 : half, 0.06, v ? half : 0.6);
      }
      for (const l of LOTS) w.box(l.cx, 0.03, l.cz, HALF, 0.03, HALF, l.yaw);
      // fountain: a real basin you can tumble into (rim wall, shallow floor under the water, the column and its bowl)
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        w.box(Math.sin(a) * 3.0, 0.4, Math.cos(a) * 3.0, 0.4, 0.3, 0.42, a);
      }
      w.cylinder(0, 0.12, 0, 0.12, 2.8);
      w.cylinder(0, 1.15, 0, 1.15, 0.4);
      w.cylinder(0, 1.3, 0, 0.1, 1.4);
      w.cylinder(0, 2.2, 0, 0.1, 0.78);
      for (const c of colliders)
        if (H[c.tag])
          w.box(
            (c.x0 + c.x1) / 2,
            H[c.tag] / 2,
            (c.z0 + c.z1) / 2,
            Math.max(0.05, (c.x1 - c.x0) / 2),
            H[c.tag] / 2,
            Math.max(0.05, (c.z1 - c.z0) / 2),
          );
      for (const [x, z, hx, hz] of [
        [0, BOUND + 0.5, BOUND + 1, 0.5],
        [0, -BOUND - 0.5, BOUND + 1, 0.5],
        // the west edge has one gate into the West Side (south-west, at z = gateZ); the district has its own outer walls
        [-BOUND - 0.5, (WEST.gateZ - WEST.gateHW - BOUND) / 2, 0.5, (WEST.gateZ - WEST.gateHW + BOUND) / 2],
        [-BOUND - 0.5, (WEST.gateZ + WEST.gateHW + BOUND) / 2, 0.5, (BOUND - WEST.gateZ - WEST.gateHW) / 2],
        // the street up the rise is walled either side; the district on top has walls all round, open only at the street
        [(WEST.x1 - BOUND) / 2, WEST.gateZ - WEST.rampHW - 0.5, (-BOUND - WEST.x1) / 2, 0.5],
        [(WEST.x1 - BOUND) / 2, WEST.gateZ + WEST.rampHW + 0.5, (-BOUND - WEST.x1) / 2, 0.5],
        [WEST.x1 + 0.5, (WEST.z0 + WEST.gateZ - WEST.rampHW) / 2, 0.5, (WEST.gateZ - WEST.rampHW - WEST.z0) / 2],
        [WEST.x1 + 0.5, (WEST.z1 + WEST.gateZ + WEST.rampHW) / 2, 0.5, (WEST.z1 - WEST.gateZ - WEST.rampHW) / 2],
        [(WEST.x0 + WEST.x1) / 2, WEST.z0 - 0.5, (WEST.x1 - WEST.x0) / 2 + 1, 0.5],
        [(WEST.x0 + WEST.x1) / 2, WEST.z1 + 0.5, (WEST.x1 - WEST.x0) / 2 + 1, 0.5],
        [WEST.x0 - 0.5, (WEST.z0 + WEST.z1) / 2, 0.5, (WEST.z1 - WEST.z0) / 2 + 1],
        // the east edge has one gate into Fun Land (north-east, at z = -gateZ); the park has its own outer walls
        [BOUND + 0.5, (FUN.z - FUN.gateZ + FUN.gateHW) / 2, 0.5, (FUN.z + FUN.gateZ - FUN.gateHW) / 2],
        [BOUND + 0.5, -(FUN.z + FUN.gateZ + FUN.gateHW) / 2, 0.5, (FUN.z - FUN.gateZ - FUN.gateHW) / 2],
        [(BOUND + FUN.x1) / 2, FUN.z + 0.5, (FUN.x1 - BOUND) / 2 + 1, 0.5],
        [(BOUND + FUN.x1) / 2, -FUN.z - 0.5, (FUN.x1 - BOUND) / 2 + 1, 0.5],
        [FUN.x1 + 0.5, 0, 0.5, FUN.z + 1],
      ])
        w.box(x, 9, z, hx, 9, hz); // the edge of the world (carts)
      {
        // the rise the West Side stands on, for carts and ragdolls: the street's slope and the flat top
        const hills = westRiseMesh();
        const R = rapier();
        if (R)
          w.world.createCollider(
            R.ColliderDesc.trimesh(hills.verts, hills.indices)
              .setCollisionGroups(grp(G_STATIC, G_RAG | G_VEH))
              .setFriction(0.8),
          );
      }
      pw = w;
    })
    .catch(e => console.warn('physics unavailable', e));
  {
    // tighter shadow box than the course (the lobby is small): crisper shadows, less bias so they meet the walls they come from
    const sc = light.sun.shadow.camera as THREE.OrthographicCamera;
    Object.assign(sc, { left: -30, right: 30, top: 30, bottom: -30 });
    sc.updateProjectionMatrix();
    light.sun.shadow.normalBias = 0.012;
    light.sun.shadow.bias = -0.00025;
  }
  let active = false,
    pf: Platform | null = null,
    look: Outfit = loadLocalLook() || sanitizeLook(null),
    me: Golfer = new Golfer(look);
  scene.add(me.root);

  // ---------------- player state ----------------
  const P = {
    x: 0,
    z: 5.5,
    y: 0,
    vy: 0,
    vx: 0,
    vz: 0,
    air: 0,
    yaw: Math.PI,
    spd: 0,
    phase: 0,
    camYaw: 0,
    camPitch: 0.28,
    camDist: 4.6,
    lastLook: -9,
    fov: 55,
    turnS: 0,
    gy: 0,
    aspd: 0,
    gw: undefined as undefined | { o: string; k: string; at: number; amt?: number },
    mode: 'walk' as
      'walk' | 'wardrobe' | 'modal' | 'chat' | 'gacha' | 'bj' | 'vlt' | 'grow' | 'dealer' | 'mail' | 'build' | 'drive' | 'stash' | 'putt' | 'range',
    q: 0,
    go: null as LPres['go'],
    say: '',
    sayAt: 0,
    prevYaw: Math.PI,
  };
  const keys: Record<string, boolean> = {};
  let MY: Plot | null = null,
    claimedAt = 0;
  const plotDocs = new Map<string, any>();
  // your golf cart: lives in your garage; out on the streets once you take it (see "your cart" below)
  const _cv = new THREE.Vector3(),
    _q1 = new THREE.Quaternion(),
    _q2 = new THREE.Quaternion(),
    UP = new THREE.Vector3(0, 1, 0);
  const inCartBox = (c: Vehicle, x: number, z: number, r = 0) => {
    const l = c.root.worldToLocal(_cv.set(x, c.root.position.y + 0.5, z));
    return Math.abs(l.x) < 1.25 + r && Math.abs(l.z) < 0.7 + r && l.y > -1.5 && l.y < 2;
  };
  function cartAt(x: number, z: number, r: number) {
    if (cart.car && P.mode !== 'drive' && inCartBox(cart.car, x, z, r)) return true;
    for (const q of remotes.values()) if (q.cart && inCartBox(q.cart, x, z, r)) return true;
    for (const c of life.cars()) if (inCartBox(c, x, z, r)) return true; // the town's own traffic
    return false;
  }

  function freeSpot() {
    for (let i = 0; i < 40 && blocked(P.x, P.z, 0.5); i++) {
      const a = i * 2.4,
        r = 0.6 + i * 0.25;
      P.x = Math.max(-8, Math.min(8, P.x + Math.cos(a) * r));
      P.z = Math.max(-8, Math.min(8, P.z + Math.sin(a) * r));
    }
  }
  function blocked(x: number, z: number, r = 0.35) {
    return !!hitAt(x, z, r) || cartAt(x, z, r);
  }
  function hitAt(x: number, z: number, r = 0.35): Collider | null {
    if (!inWorld(x, z)) return { x0: 0, x1: 0, z0: 0, z1: 0, tag: 'edge' };
    return (
      colliders.find((c: Collider) =>
        c.r ? Math.hypot(x - (c.x0 + c.x1) / 2, z - (c.z0 + c.z1) / 2) < c.r + r : x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r,
      ) ?? null
    );
  }
  /** Nearest clear spot (spiral out), for getting up somewhere sensible. */
  function clearSpot(x: number, z: number) {
    for (let i = 0; i < 60 && blocked(x, z, 0.45); i++) {
      const a = i * 2.4,
        r = 0.3 + i * 0.12;
      x += Math.cos(a) * r * 0.5;
      z += Math.sin(a) * r * 0.5;
    }
    return inWorld(x, z) ? [x, z] : [clamp(x, -BOUND + 1, BOUND - 1), clamp(z, -BOUND + 1, BOUND - 1)];
  }

  // ---------------- input ----------------
  addEventListener('keydown', e => {
    if (!active) return;
    if (P.mode === 'chat') {
      if (e.code === 'Escape') closeChat(false);
      return;
    }
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (P.mode === 'stash') {
      smoke.key(e, true);
      return;
    }
    if (P.mode === 'build') {
      build.key(e);
      return;
    }
    if (P.mode === 'drive') {
      if (!e.repeat) radioKey(e);
      if (e.code === 'KeyE') {
        if (cart.stuck) flipCart();
        else hopOut();
      }
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'Enter') {
        e.preventDefault();
        openChat();
      }
      return;
    }
    if (P.mode === 'bj') {
      bjGame.key(e);
      return;
    }
    if (P.mode === 'vlt') {
      vlt.key(e);
      return;
    }
    if (P.mode === 'grow') {
      garden.key(e);
      return;
    }
    if (P.mode === 'dealer') {
      dealer.key(e, true);
      return;
    }
    if (P.mode === 'mail') {
      mail.key(e);
      return;
    }
    if (P.mode === 'modal' && modalKeys && e.code !== 'Escape') {
      e.preventDefault();
      if (!e.repeat) modalKeys(e);
      return;
    }
    if (e.code === 'Escape') {
      if (P.mode === 'wardrobe') closeWardrobe(false);
      else if (P.mode === 'modal') closeModal();
      else if (P.mode === 'gacha') closeGacha();
      else if (P.mode === 'walk' || (P.mode as string) === 'drive') options.open(); // nothing else is open: the options menu
      return;
    }
    if (P.mode === 'gacha') {
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        gachaNext();
      }
      return;
    }
    if (P.mode !== 'walk') return;
    if (e.code === 'KeyF') {
      goLimp('flop');
      return;
    }
    if (flop) return; // no actions while on the floor
    if (e.code === 'KeyE') {
      const st = garden.station(P.x, P.z);
      if (st) {
        garden.useStation(st);
        return;
      }
      if (garden.held() && !e.repeat && garden.pourBegin(P.x, P.z)) return;
      if (garden.isPouring()) return;
      if (!cartInteract()) interact();
    }
    if (e.code === 'KeyG') garden.putAway();
    {
      const sk = smoke.walkKey(e, true);
      if (sk === 'open') {
        if (document.pointerLockElement) document.exitPointerLock();
        P.mode = 'stash';
        P.vx = P.vz = 0;
        for (const k in keys) keys[k] = false;
        return;
      }
      if (sk) return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      openMenu();
      return;
    }
    if (e.code === 'KeyQ' && P.mode === 'walk' && !flop) {
      openEmotes();
      return;
    }
    if (e.code === 'KeyM') {
      openMap();
      return;
    }

    if (e.code === 'KeyB') tryBuild();
    if (e.code === 'Enter') {
      e.preventDefault();
      if (document.pointerLockElement) document.exitPointerLock();
      openChat();
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (P.air <= 0 && P.y <= 0.001) {
        P.vy = 4.3;
        P.air = 0.01;
      }
    }
    if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
  });
  addEventListener('keyup', e => {
    keys[e.code] = false;
    if (P.mode === 'stash') smoke.key(e, false);
    else smoke.walkKey(e, false);
    if (P.mode === 'dealer') dealer.key(e, false);
    if (e.code === 'KeyE') garden.pourEnd();
  });
  // mouse-look: click to lock the pointer (Esc releases); dragging works too where pointer lock isn't allowed
  let drag: { x: number; y: number } | null = null;
  const mouseLook = (dx: number, dy: number) => {
    P.camYaw -= dx * 0.0042 * opts.look;
    P.camPitch = clamp(P.camPitch + dy * 0.003 * opts.look, -0.25, 1.15);
    P.lastLook = clock;
  };
  const locked = () => document.pointerLockElement === canvas;
  canvas.addEventListener('pointerdown', e => {
    if (!active || P.mode !== 'walk') return;
    if (!locked()) {
      try {
        const r: any = canvas.requestPointerLock();
        r?.catch?.(() => {});
      } catch {}
    }
    drag = { x: e.clientX, y: e.clientY };
  });
  addEventListener('pointermove', e => {
    if (
      !active ||
      P.mode === 'wardrobe' ||
      P.mode === 'gacha' ||
      P.mode === 'bj' ||
      P.mode === 'vlt' ||
      P.mode === 'grow' ||
      P.mode === 'dealer' ||
      P.mode === 'mail'
    )
      return;
    if (locked()) mouseLook(e.movementX, e.movementY);
    else if (drag) {
      mouseLook(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    }
  });
  addEventListener('pointerup', () => {
    drag = null;
  });
  canvas.addEventListener(
    'wheel',
    e => {
      if (!active || (P.mode !== 'walk' && P.mode !== 'drive')) return;
      P.camDist = clamp(P.camDist + e.deltaY * 0.005, 2.4, 11);
    },
    { passive: true },
  );

  // ---------------- interactions ----------------
  const SPOTS = [
    { id: 'tee', x: 0, z: -6.3, r: 2.6, label: 'View tee times' },
    { id: 'shop', x: -5.8, z: 0, r: 2.4, label: 'Pro shop (moved to the West Side)' },
    { id: 'gacha', x: -83.8 + WEST_OFF.x, z: 6.9, r: 1.5, label: 'Birdie Ball machine' },
    { id: 'dealer', x: DEALER_POS.x - 0.3, z: DEALER_POS.z + 0.9, r: 2.1, label: 'Sell to the Street Dealer' },
    ...fun.spots,
    ...west.spots,
  ];
  function nearest() {
    let best: { id: string; label: string; plot?: Plot } | null = null,
      bd = 1e9;
    for (const s of SPOTS) {
      const d = Math.hypot(P.x - s.x, P.z - s.z);
      if (d < s.r && d < bd) {
        bd = d;
        best = s;
      }
    }
    {
      const st = garden.station(P.x, P.z);
      if (st) {
        bd = 0.2;
        best = { id: 'station', label: garden.stationLabel(st), extra: garden.held() ? ' · <kbd>G</kbd> put away' : '' } as any;
      }
    }
    {
      const pl = bd > 0.5 ? garden.pourLabel(P.x, P.z) : null;
      if (pl) {
        bd = 0.5;
        best = { id: 'pour', label: pl, extra: ' · <kbd>G</kbd> put away' } as any;
      }
    }
    {
      const gr = garden.nearest(P.x, P.z);
      if (gr && bd > 0.95) {
        bd = 0.95;
        best = { id: 'grow', label: garden.labelFor(gr), ref: gr } as any;
      }
    }
    for (let i = 0; i < 5; i++) {
      const w = bjGame.seatWorld(i),
        d = Math.hypot(P.x - w.x, P.z - w.z);
      if (d < 0.85 && d < bd) {
        const o = bjGame.seatOwner(i);
        bd = d;
        best = { id: o ? 'bjtaken' : 'bjseat', seat: i, label: o ? `${pf?.names.get(o) || 'Someone'} is sitting here` : 'Sit · Min bet $10' } as any;
      }
    }
    if (MY) {
      const [x, z] = toWorld(MY, 3, HALF - 0.4),
        d = Math.hypot(P.x - x, P.z - z),
        n = mail.unread();
      if (d < 1.5 && d < bd) {
        bd = d;
        best = { id: 'mail', label: n ? `Check your mail · ${n} new` : 'Check your mail' };
      }
    }
    if (MY) {
      const [x, z] = toWorld(MY, 1.1, -HALF + 3.9),
        d = Math.hypot(P.x - x, P.z - z);
      if (d < 2.2 && d < bd) {
        bd = d;
        best = { id: 'rv', label: 'Your RV · ball collection' };
      }
    }
    for (const p of plots) {
      const [x, z] = toWorld(p, -3.4, HALF + 1.2),
        d = Math.hypot(P.x - x, P.z - z);
      if (d < 2 && d < bd) {
        bd = d;
        best = { id: 'sign', label: p === MY ? 'Your lot' : p.owner ? `${p.ownerName}'s lot` : `Lot ${p.lot} · for rent`, plot: p };
      }
    }
    return best;
  }
  function interact() {
    const n = nearest();
    if (!n) return;
    if (n.id === 'tee') tee.open();
    else if (n.id === 'shop') toast('The pro shop has moved to the West Side: clothes, a barber, tattoos and golf gear are all up the hill.', 4200);
    else if (n.id === 'store:pro') void openProShop();
    else if (n.id === 'store:home') void openFurniture();
    else if (n.id === 'store:auto') void openAuto();
    else if (n.id === 'pawn') void openPawn();
    else if (n.id.startsWith('store:')) void openWardrobe(n.id.slice(6) as Shop);
    else if (n.id === 'gacha') openGacha();
    else if (n.id === 'rv') openCollection();
    else if (n.id === 'bjseat') openBJ((n as any).seat);
    else if (n.id === 'grow') openPanel('grow', () => garden.open((n as any).ref as PlanterRef));
    else if (n.id === 'dealer') openPanel('dealer', () => dealer.open());
    else if (n.id === 'putt') putt.start();
    else if (n.id === 'range') range.start();
    else if (n.id === 'karts') cart.rent(fun.kartSpawn[0], fun.kartSpawn[1], fun.kartSpawn[2]);
    else if (n.id.startsWith('fun:') || n.id.startsWith('west:')) toast((n as any).say || n.label);
    else if (n.id === 'growshop') openGrowShop();
    else if (n.id === 'club') openClubhouse();
    else if (n.id.startsWith('vlt:')) openVlt(+n.id.slice(4));
    else if (n.id === 'mail') openPanel('mail', () => mail.open());
    else if (n.id === 'bjtaken') toast('That seat is taken. Try another one.');
    else if (n.id === 'sign' && n.plot)
      toast(
        n.plot === MY
          ? `Lot ${n.plot.lot} is yours. Press B while you're on it to build and decorate.`
          : n.plot.owner
            ? `Lot ${n.plot.lot} belongs to ${esc(n.plot.ownerName)}.`
            : `Lot ${n.plot.lot} is free. New players get one automatically.`,
      );
  }

  // ---------------- toast / prompt / modal ----------------
  let toastTimer = 0;
  function toast(html: string, ms = 3000) {
    const t = $('ltoast');
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms) as any;
  }
  function setPrompt(html: string) {
    const p = $('lprompt');
    if ((p as any)._h !== html) {
      (p as any)._h = html;
      p.innerHTML = html;
      p.style.opacity = html ? '1' : '0';
    }
  }
  /** Keys for whatever the modal is showing (a slot machine, the emote picker), and its clean-up. */
  let modalKeys: ((e: KeyboardEvent) => void) | null = null,
    modalClosed: (() => void) | null = null;
  function openModal(title: string, html: string) {
    modalClosed?.();
    modalKeys = modalClosed = null;
    playSample('open', 0.4);
    if (document.pointerLockElement) document.exitPointerLock();
    P.mode = 'modal';
    $('lmodal').classList.remove('hidden');
    $('lmodal').innerHTML = `<div class="card"><button class="x" id="lm-x">✕</button><h2>${title}</h2><div id="lm-body">${html}</div></div>`;
    $('lm-x').onclick = closeModal;
  }
  function closeModal() {
    if (!$('lmodal').classList.contains('hidden')) playSample('close', 0.35);
    $('lmodal').classList.add('hidden');
    if (P.mode === 'modal') P.mode = 'walk';
    modalClosed?.();
    modalKeys = modalClosed = null;
    tee.closed();
  }

  // ---------------- the Birdie Ball machine: walk up, the camera moves in close, and the machine does the rest ----------------
  // insert a Birdie Dollar → turn the handle → a capsule drops into the tray and opens. Your collection lives in your RV.
  type GStep = 'coin' | 'busy' | 'turn' | 'reveal';
  let gOff = 0;
  let gStep: GStep = 'coin',
    gGot: string | null = null,
    gPending: string | null = null;
  const gCam = new THREE.Vector3(),
    gLook = new THREE.Vector3();
  const setBall = (id: string) => {
    look = { ...look, ball: id };
    saveLocalLook(look);
    sendPres(true);
    if (pf?.db && pf.canWrite)
      pf.db
        .doc(`data/users/${pf.uid}/look`)
        .set({ look, at: Date.now() })
        .catch(() => {});
  };
  // ---------------- blackjack ----------------
  const bjCam = new THREE.Vector3(),
    bjLook = new THREE.Vector3();
  const bjGame = createBlackjack(scene.getObjectByName('bjTable') as THREE.Group, {
    toast: h => toast(h, 2200),
    onClose: () => {
      if (P.mode === 'bj') {
        P.mode = 'walk';
        camEase = 0.8;
      }
      sendPres(true);
    },
    sendPres: () => sendPres(true),
    me: () => pf?.uid || 'me',
    nameOf: uid => pf?.names.get(uid) || 'Golfer',
    myGolfer: () => me,
  });
  // the lounge's slot machines and video poker: sit down and play in first person (lobby/vlt.ts)
  const vlt = createVlt({
    toast: h => toast(h, 2200),
    onClose: () => {
      if (P.mode === 'vlt') {
        P.mode = 'walk';
        camEase = 0.8;
      }
      me.root.visible = true;
      sendPres(true);
    },
    sendPres: () => sendPres(true),
    myGolfer: () => me,
  });
  function openVlt(i: number) {
    if (P.mode !== 'walk' || flop) return;
    if (vlt.isTaken(i)) {
      toast('Someone is on that machine.');
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
    P.mode = 'vlt';
    P.vx = P.vz = 0;
    for (const k in keys) keys[k] = false;
    garden.putAway();
    void vlt.sit(i);
  }
  function openBJ(seat: number) {
    if (!bjGame.sit(seat)) return;
    if (document.pointerLockElement) document.exitPointerLock();
    P.mode = 'bj';
    P.vx = P.vz = 0;
    for (const k in keys) keys[k] = false;
    const w = bjGame.seatWorld(seat),
      t = scene.getObjectByName('bjTable')!.position;
    P.x = w.x;
    P.z = w.z;
    P.yaw = Math.atan2(t.x - w.x, t.z - w.z); // stand at your seat, facing the dealer
    bjGame.camTargets(bjCam, bjLook);
  }
  // ---------------- growing + the Street Dealer ----------------
  function openPanel(m: 'grow' | 'dealer' | 'mail', f: () => void) {
    if (document.pointerLockElement) document.exitPointerLock();
    P.mode = m;
    P.vx = P.vz = 0;
    for (const k in keys) keys[k] = false;
    f();
  }
  const panelClosed = () => {
    if (P.mode === 'grow' || P.mode === 'dealer' || P.mode === 'mail' || P.mode === 'stash') P.mode = 'walk';
  };
  const mail = createMail({ toast: (h, ms) => toast(h, ms), onClose: panelClosed, setFlag: () => {}, setBadge: () => renderWallet() });
  let gardenT = 0;
  /** My lot's record (layout + garden) has ONE writer: changes merge into the local copy and the whole record is
   *  written a moment later. While a write is on its way, the echo of an older write is ignored, so it can't undo
   *  a newer change (placing two items quickly used to be able to lose the second). */
  let plotSaveT = 0,
    myPlotDirtyUntil = 0;
  function saveMyPlot(patch: Record<string, unknown>, loud = false) {
    if (!pf?.db || !pf.canWrite) return;
    const uid = pf.uid;
    plotDocs.set(uid, { ...(plotDocs.get(uid) || {}), ...patch });
    myPlotDirtyUntil = performance.now() + 5000;
    clearTimeout(plotSaveT);
    plotSaveT = setTimeout(() => {
      pf!.db
        .doc('plots/' + uid)
        .set(plotDocs.get(uid))
        .catch(() => {
          if (loud) toast("Couldn't save your lot. Try again in a moment.");
        });
    }, 400) as any;
  }
  const gardenClean = new WeakMap<object, Record<string, any>>(); /* other players' gardens are validated once per record, not every frame */
  const garden = createGarden({
    plots,
    me: () => pf?.uid || 'me',
    myPlot: () => MY,
    layoutOf: uid => layoutOf(uid),
    gardenOf: uid => {
      const raw = plotDocs.get(uid)?.garden;
      if (!raw || typeof raw !== 'object') return undefined;
      let c = gardenClean.get(raw);
      if (!c) {
        c = cleanGarden(raw);
        gardenClean.set(raw, c);
      }
      return c;
    },
    save(g) {
      if (!MY) return;
      saveMyPlot({ garden: g });
    },
    sendWater(owner, k, amt) {
      P.gw = { o: owner, k, at: Date.now(), amt: +amt.toFixed(3) };
      sendPres(true);
    },
    scene,
    sendPres: () => sendPres(true),
    myGolfer: () => me,
    myPos: () => ({ x: P.x, z: P.z, yaw: P.yaw }),
    nameOf: uid => pf?.names.get(uid) || 'a neighbour',
    toast: (h, ms) => toast(h, ms),
    onClose: panelClosed,
  });
  const staff = createAttendants(scene, [
    ...fun.attendants,
    // the pawnbroker behind his counter (lobby/westside.ts, Lucky Pawn)
    {
      x: -120.8 + WEST_OFF.x,
      z: -2.2,
      yaw: 0,
      look: { shirt: '#3d3226', top: 'button', pants: '#2a2a2e', hairStyle: 'bald', stubble: true, glasses: 'round', chain: true, watch: true },
    },
  ]);
  // ---------------- the cart radio: ten bands of shipped music on a shared clock (audio/radio.ts)
  const { radio, RS } = cartRadio,
    radioSrc: RadioSource[] = [],
    radioKey = (e: KeyboardEvent) => cartRadio.key(e, toast);
  function radioFrame(dt: number) {
    const driving = P.mode === 'drive' && !!cart.car;
    if (driving && RS.on) radioSrc.push({ id: 'me', band: RS.band, vol: RS.vol, mine: true, dist: 0, pan: 0 });
    else if (cart.car && RS.on) {
      // parked with the radio left on: it plays on from the cart, and you hear it as you walk near
      const cp = cart.car.root.position,
        dx = cp.x - camera.position.x,
        dz = cp.z - camera.position.z,
        e = camera.matrixWorld.elements;
      radioSrc.push({
        id: 'me',
        band: RS.band,
        vol: RS.vol,
        mine: false,
        own: true,
        dist: Math.hypot(cp.x - P.x, cp.z - P.z),
        pan: (dx * e[0] + dz * e[2]) / (Math.hypot(dx, dz) + 4),
      });
    }
    cartRadio.frame(dt, radioSrc, driving);
    radioSrc.length = 0;
  }
  const dealer = createDealer(scene, { toast: (h, ms) => toast(h, ms), onClose: panelClosed });
  const smoke = createSmoke({
    scene,
    renderer,
    me: () => pf?.uid || 'me',
    myGolfer: () => me,
    myYaw: () => P.yaw,
    canAct: () => P.mode !== 'drive' && P.mode !== 'bj' && P.mode !== 'vlt' && !flop,
    free: () => P.mode === 'walk',
    toast: (h, ms) => toast(h, ms),
    nameOf: uid => pf?.names.get(uid) || 'Golfer',
    onClose: panelClosed,
    trophyThumb: t => trophyPic(t.seed, t.n, '', 96),
    wearing: () => wardrobe.worn(),
    seedCloset: () => wardrobe.seed(),
    wear: key => void wardrobe.wear(key),
    trophyDetail: t => {
      const tp = (v: number) => (v === 0 ? 'E' : v > 0 ? '+' + v : '−' + -v);
      return `${t.n === 9 ? 'Championship' : 'Mini cup'} · ${tp(t.toPar)} (${t.strokes})${t.field > 1 ? ` · beat ${t.field - 1}` : ' · solo'} · ${new Date(t.at).toLocaleDateString()}. Put it on display in Build Mode (the Trophies tab).${
        t.board?.length
          ? `<table class="tboard">${t.board.map((r, i) => `<tr${r.n === t.who ? ' class="me"' : ''}><td>${i + 1}</td><td>${esc(r.n)}</td><td>${r.s}</td><td>${tp(r.p)}</td></tr>`).join('')}</table>`
          : ''
      }`;
    },
    putAwayOthers: () => garden.putAway(),
    nearestPeer(x, z, maxD) {
      let best: { uid: string; d: number } | null = null;
      for (const r of remotes.values()) {
        if (r.pres?.g || !r.golfer.root.visible) continue;
        const d = Math.hypot(r.x - x, r.z - z);
        if (d < maxD && (!best || d < best.d)) best = { uid: r.by, d };
      }
      return best;
    },
  });
  colliders.push({ x0: DEALER_POS.x - 0.3, x1: DEALER_POS.x + 0.95, z0: DEALER_POS.z - 0.3, z1: DEALER_POS.z + 0.75, tag: 'dealer' });

  // wallet: cash and Birdie Dollars, top left
  const wallet = document.createElement('div');
  wallet.className = 'pill wallet';
  document.getElementById('lhud')?.appendChild(wallet);
  const renderWallet = () => {
    const p = progress(),
      n = mail.unread();
    wallet.innerHTML = `<div class="lbl">Cash</div><div class="v">$${p.cash.toLocaleString('en-US')}<span class="bdc">${p.bd} BD</span>${n ? `<span class="mailc" title="Mail at your lot's mailbox">✉ ${n}</span>` : ''}</div>`;
  };
  onProgress(renderWallet);
  loadProgress().then(renderWallet);

  async function openGacha() {
    if (document.pointerLockElement) document.exitPointerLock();
    P.mode = 'gacha';
    P.vx = P.vz = 0;
    for (const k in keys) keys[k] = false;
    P.x = -5.05;
    P.z = 3.55;
    P.yaw = -Math.PI / 2; // step up behind the camera, facing the machine
    gacha.closeUp(gCam, gLook);
    gacha.reset();
    gStep = 'coin';
    gGot = null;
    $('lgacha').classList.remove('hidden');
    document.body.classList.add('gacha-on');
    renderGachaUI('Loading…');
    await loadProgress();
    renderGachaUI();
  }
  function closeGacha() {
    if (gStep === 'busy') return;
    P.mode = 'walk';
    camEase = 0.8;
    gacha.hideCapsule();
    gacha.reset();
    $('lgacha').classList.add('hidden');
    document.body.classList.remove('gacha-on');
  }
  function renderGachaUI(msg?: string) {
    const pr = progress(),
      left = BALLS.length - pr.owned.length,
      b = gGot ? BALL.get(gGot) : null;
    const main =
      gStep === 'coin'
        ? left
          ? pr.bd >= 1
            ? 'Insert a Birdie Dollar'
            : 'No Birdie Dollars'
          : 'Collection complete!'
        : gStep === 'turn'
          ? 'Turn the handle ⟳'
          : gStep === 'reveal'
            ? 'Play this ball'
            : '…';
    const can = gStep === 'turn' || gStep === 'reveal' || (gStep === 'coin' && left > 0 && pr.bd >= 1);
    const tip =
      msg ||
      (gStep === 'coin'
        ? pr.bd >= 1
          ? ''
          : 'Birdie a hole to earn one (eagle 2, ace or albatross 3).'
        : gStep === 'turn'
          ? 'Coin in. Give it a crank.'
          : '');
    $('lgacha').innerHTML =
      `${b && gStep === 'reveal' ? `<div class="gr" style="--rc:${RARITY_COLOR[b.rarity]}"><div class="gr-r">${b.rarity.toUpperCase()} · ${esc(b.set)}${pr.owned.length ? ` · ${pr.owned.length} of ${BALLS.length}` : ''}</div><div class="gr-n">${esc(b.name)}</div></div>` : ''}
      <div class="gbar"><div class="gcoin"><i></i><b>${pr.bd}</b><span>Birdie Dollar${pr.bd === 1 ? '' : 's'}</span></div>
      <button id="gx-main" class="primary" ${can ? '' : 'disabled'}>${main}</button>
      ${gStep === 'reveal' ? `<button id="gx-again" ${pr.bd >= 1 && left ? '' : 'disabled'}>Another</button>` : ''}
      <button id="gx-leave" ${gStep === 'busy' ? 'disabled' : ''}>Leave <kbd>Esc</kbd></button></div>
      ${tip ? `<div class="gtip">${tip}</div>` : ''}`;
    ($('gx-main') as HTMLButtonElement).onclick = gachaNext;
    ($('gx-leave') as HTMLButtonElement).onclick = closeGacha;
    const ag = document.getElementById('gx-again') as HTMLButtonElement | null;
    if (ag)
      ag.onclick = () => {
        gacha.hideCapsule();
        gacha.reset();
        gStep = 'coin';
        gGot = null;
        renderGachaUI();
        gachaNext();
      };
  }
  async function gachaNext() {
    if (gStep === 'busy') return;
    if (gStep === 'coin') {
      const pr = progress();
      if (pr.bd < 1 || pr.owned.length >= BALLS.length) return;
      gStep = 'busy';
      renderGachaUI();
      gPending = await spin(); // the dollar is spent here; the ball is decided now and revealed by the machine
      if (!gPending) {
        gStep = 'coin';
        renderGachaUI('Something went wrong. Your Birdie Dollar is safe.');
        return;
      }
      sfx.step(0.4);
      await gacha.insertCoin();
      sfx.land(0.25);
      gStep = 'turn';
      renderGachaUI();
      return;
    }
    if (gStep === 'turn' && gPending) {
      gStep = 'busy';
      renderGachaUI();
      for (let i = 0; i < 6; i++) setTimeout(() => sfx.step(0.7), i * 170);
      await gacha.turn();
      setTimeout(() => sfx.land(0.5), 300);
      setTimeout(() => sfx.land(0.3), 560);
      await gacha.dispense(gPending, CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)]);
      sfx.bonk(0.5);
      gGot = gPending;
      gPending = null;
      gStep = 'reveal';
      renderGachaUI();
      return;
    }
    if (gStep === 'reveal' && gGot) {
      setBall(gGot);
      toast(`Now playing the <b>${esc(BALL.get(gGot)!.name)}</b> ball.`, 1800);
      closeGacha();
    }
  }
  // ---------------- your RV: the ball collection (pick the one you play) ----------------
  async function openCollection() {
    openModal('Ball collection', '<div id="coll-body"><p class="muted">Loading…</p></div>');
    await loadProgress();
    renderCollection();
  }
  addEventListener('ballskins', () => renderCollection()); // art sheets arrive after the page: redraw the previews
  function renderCollection() {
    const body = document.getElementById('coll-body');
    if (!body) return;
    const pr = progress(),
      mine = look.ball || DEFAULT_BALL;
    const sets = [...new Set(BALLS.map(b => b.set))];
    body.innerHTML = `<div class="gacha-top"><div class="bd"><b>${pr.bd}</b> Birdie Dollar${pr.bd === 1 ? '' : 's'}</div><div class="muted">${pr.owned.length} of ${BALLS.length} collected · spin for more at the plaza machine</div></div>
      ${sets
        .map(
          set =>
            `<h3>${set}</h3><div class="gacha-grid">${BALLS.filter(b => b.set === set)
              .map(b => {
                const own = pr.owned.includes(b.id);
                return `<button class="gball${own ? '' : ' locked'}${b.id === mine ? ' on' : ''}" data-ball="${b.id}" title="${own ? esc(b.name) + ' · ' + b.rarity : '???'}" style="--rc:${RARITY_COLOR[b.rarity]}"><span data-prev="${own ? b.id : ''}"></span><em>${own ? esc(b.name) : '?'}</em></button>`;
              })
              .join('')}</div>`,
        )
        .join('')}`;
    body.querySelectorAll<HTMLElement>('[data-prev]').forEach(el => {
      const id = el.dataset.prev;
      if (id) el.appendChild(ballPreview(id, 54));
    });
    body.querySelectorAll<HTMLButtonElement>('button.gball').forEach(
      b =>
        (b.onclick = () => {
          const id = b.dataset.ball!;
          if (!progress().owned.includes(id)) return;
          setBall(id);
          toast(`Now playing the <b>${esc(BALL.get(id)!.name)}</b> ball.`, 1800);
          renderCollection();
        }),
    );
  }

  // ---------------- chat ----------------
  const chatLog: { who: string; text: string; at: number }[] = [];
  function addChat(who: string, text: string) {
    chatLog.push({ who, text, at: Date.now() });
    if (chatLog.length > 6) chatLog.shift();
    $('lchat').innerHTML = chatLog.map(c => `<div><b>${esc(c.who)}</b> ${esc(c.text)}</div>`).join('');
  }
  function openChat() {
    if (!pf?.room) {
      toast('Chat works on the published page, with other players here.');
      return;
    }
    P.mode = 'chat';
    for (const k in keys) keys[k] = false;
    const box = $('lchatin') as HTMLInputElement;
    box.parentElement!.classList.add('show');
    box.value = '';
    box.focus();
  }
  function closeChat(send: boolean) {
    const box = $('lchatin') as HTMLInputElement,
      t = box.value.trim().slice(0, 120);
    box.blur();
    box.parentElement!.classList.remove('show');
    P.mode = 'walk';
    if (send && t) {
      P.say = t;
      P.sayAt = Date.now();
      addChat('You', t);
      myBubble(t);
      sendPres(true);
    }
  }
  ($('lchatin') as HTMLInputElement).addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      closeChat(true);
    }
    if (e.key === 'Escape') closeChat(false);
  });
  const tags = $('ltags');
  const myTag = document.createElement('div');
  myTag.className = 'bubble';
  myTag.style.display = 'none';
  tags.appendChild(myTag);
  let myBubT = 0;
  function myBubble(t: string) {
    myTag.textContent = t;
    myBubT = 5;
  }

  // ---------------- wardrobe ----------------
  addEventListener('ghbody', () => rebuildMe()); // a body type finished loading: wear it
  function rebuildMe() {
    const pos = me.root.position.clone(),
      rot = me.root.rotation.y;
    me.dispose();
    me = new Golfer(look);
    me.root.position.copy(pos);
    me.root.rotation.y = rot;
    scene.add(me.root);
  }
  const wardrobe = createWardrobe({
    P,
    look: () => look,
    setLook(o) {
      look = o;
      rebuildMe();
    },
    saveLook() {
      saveLocalLook(look);
      sendPres(true);
      if (pf?.db && pf.canWrite)
        pf.db
          .doc(`data/users/${pf.uid}/look`)
          .set({ look, at: Date.now() })
          .catch(() => {});
    },
    blocked: (x, z, r) => blocked(x, z, r),
    clearKeys() {
      for (const k in keys) keys[k] = false;
    },
    easeCamera(s) {
      camEase = s;
    },
    toast: h => toast(h),
  });
  const openWardrobe = wardrobe.open,
    closeWardrobe = wardrobe.close;

  // ---------------- tee times (solo / group) ----------------
  const tee = createTeeBoard({
    uid: () => pf?.uid || 'me',
    online: () => !!pf?.room,
    nameOf: (uid, fb = 'Golfer') => pf?.names.get(uid) || fb,
    q: () => P.q || 0,
    setQ(at) {
      P.q = at;
      sendPres(true);
    },
    setGo(go) {
      P.go = go;
      sendPres(true);
    },
    peers: () => [...remotes.values()].map(r => ({ by: r.by, q: r.pres?.q, away: !!r.pres?.g, go: r.pres?.go })),
    openModal,
    closeModal: () => closeModal(),
    toast: (h, ms) => toast(h, ms),
    start(matchId, group, order) {
      smoke.reset();
      P.q = 0;
      P.go = null;
      sendPres(true);
      env.startGolf({ matchId, group, look, order });
    },
  });
  const { trophyPic } = tee;

  // ---------------- Build Mode (B on your own lot) ----------------
  const LAYOUT_LS = 'gh.lot.v1';
  function layoutOf(uid: string | null): Placed[] {
    if (!uid) return STARTER;
    if (pf?.db) {
      const d = plotDocs.get(uid);
      return cleanLayout(d?.items) ?? STARTER;
    }
    try {
      return cleanLayout(JSON.parse(localStorage.getItem(LAYOUT_LS) || 'null')) ?? STARTER;
    } catch {
      return STARTER;
    }
  }
  let saveT = 0;
  const build = createBuild({
    scene,
    camera,
    canvas,
    colliders,
    keys,
    plot: () => MY,
    color: () => MY?.color || '#c8452f',
    layout: () => layoutOf(MY?.owner || null),
    trophies: async () => (await loadProgress()).trophies,
    save(items) {
      try {
        localStorage.setItem(LAYOUT_LS, JSON.stringify(items));
      } catch {}
      saveMyPlot({ items }, true);
    },
    toast: s => toast(s),
    hasPlants: p => garden.hasPlants(p),
    onExit() {
      P.mode = 'walk';
      camEase = 0.8;
      for (const k in keys) keys[k] = false;
    },
  });
  /** Lot coordinates of a world point (x right, z toward the plaza). */
  function lotLocal(p: Plot, x: number, z: number) {
    const dx = x - p.cx,
      dz = z - p.cz,
      c = Math.cos(p.yaw),
      s = Math.sin(p.yaw);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }
  function showControls() {
    if (smoke.isRolling()) {
      const [t, rows] = smoke.rollControls();
      controls.set('roll', t, rows);
      return;
    }
    const m = P.mode === 'vlt' && vlt.kind() === 'poker' ? 'vltp' : P.mode;
    let [title, rows] = TOWN_KEYS[m] || TOWN_KEYS.panel;
    if (m === 'walk') {
      rows = rows.slice();
      if (smoke.holding()) rows.splice(4, 0, ['R', 'Hold to take a puff', true], ['H', 'Pass it to whoever’s nearest']);
      if (onMyLot()) rows.splice(5, 0, ['B', 'Build Mode', true]);
    }
    controls.set(m + (smoke.holding() ? 'j' : '') + (m === 'walk' && onMyLot() ? 'L' : ''), title, rows);
  }
  const onMyLot = () => {
    if (!MY) return false;
    const l = lotLocal(MY, P.x, P.z);
    return Math.abs(l.x) < HALF + 0.5 && l.z > -HALF && l.z < HALF + 2;
  };
  async function tryBuild() {
    if (!MY) {
      toast('You need a lot to build on.');
      return;
    }
    if (!onMyLot()) {
      toast(`Walk onto your lot (Lot ${MY.lot}) and press B to build.`);
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
    P.mode = 'build';
    P.vx = P.vz = 0;
    for (const k in keys) keys[k] = false;
    if (!(await build.enter())) P.mode = 'walk';
  }

  // ---------------- your cart (from your garage): lobby/cart.ts ----------------
  let puttFade = 0;
  wireUiSounds();
  // gestures (1–4 on foot): the right arm waves, points or gives a thumbs up for a couple of seconds; 4 is the cheer
  const GEST: GestureKind[] = ['wave', 'point', 'thumb'];
  let gest: { i: number; t0: number; n: number } | null = null;
  const gestSeen = new Map<string, { n: number; i: number; t0: number }>();
  function gestureOn(g: Golfer, i: number, el: number) {
    const dur = i === 1 ? 2 : 2.4;
    if (el < dur) g.gesture(GEST[i], Math.max(0, Math.min(1, el / 0.22, (dur - el) / 0.3)), el);
  }
  const _eul = new THREE.Euler();
  let rivalT = 0;
  const batcher = createStaticBatcher(scene, { onBatch: m => patchCloudShadows(m) });
  (window as any).__batch = batcher;
  let cullT = 0;
  const _cb = new THREE.Box3(),
    _cs = new THREE.Sphere();
  const putt = createPutt({ scene, camera, pw: () => pw, course: () => fun.puttCourse(), ballSkin: () => look.ball, P, toast });
  const range = createRange({ scene, camera, ballSkin: () => look.ball, P, toast, info: () => fun.range });
  const cart = createLobbyCart({
    scene,
    plots,
    colliders,
    P,
    pw: () => pw,
    myPlot: () => MY,
    me: () => me,
    clock: () => clock,
    layoutOf: uid => layoutOf(uid),
    hitAt: (x, z, r) => hitAt(x, z, r),
    lotGroup: lot => lotGroup(lot),
    cartOut: owner => [...remotes.values()].some(r => r.by === owner && !!r.pres?.car),
    clearKeys() {
      for (const k in keys) keys[k] = false;
    },
    sendPres: () => sendPres(true),
    toast: (h, ms) => toast(h, ms),
    thud: () => sfx.land(0.5),
  });
  const { garageOf, hopOut, flip: flipCart, interact: cartInteract, prompt: cartPrompt, ride, syncDecoPhysics, syncParked } = cart;
  /** Knocked flat by someone's cart. */
  function knockMe(v: THREE.Vector3) {
    if (!pw || flop || P.mode !== 'walk') return;
    rg = {
      t: Date.now(),
      v: [v.x * 0.9, 2.5, v.z * 0.9].map(n => +n.toFixed(2)),
      i: [v.x * 8, 10, v.z * 8].map(n => +n.toFixed(2)),
      at: 'Hips',
      k: 'bonk',
    };
    flop = startFlop(me, rg);
    splashed = false;
    P.vx = P.vz = P.vy = 0;
    P.y = 0;
    P.air = 0;
    sendPres(true);
    sfx.bonk(1);
    toast('Run over by a golf cart!', 1500);
  }
  // ---------------- camera vs buildings: pull the camera in rather than look through a roof or a wall ----------------
  const CAM_H: Record<string, number> = { rv: 3.0, shop: 2.7, board: 2.8, gacha: 1.7 };
  let camBlocks: THREE.Box3[] = [],
    camBlockT = 0;
  const _ray = new THREE.Ray(),
    _hit = new THREE.Vector3();
  function camClamp(look: THREE.Vector3, cam: THREE.Vector3, dt: number) {
    camBlockT -= dt;
    if (camBlockT <= 0) {
      camBlockT = 0.5;
      camBlocks = colliders
        .filter(c => CAM_H[c.tag])
        .map(c => new THREE.Box3(new THREE.Vector3(c.x0, 0, c.z0), new THREE.Vector3(c.x1, CAM_H[c.tag], c.z1)));
      for (const p of plots) {
        const it = layoutOf(p.owner).find(i => i.k === 'garage');
        if (!it) continue; // a garage, roof and all
        const c = Math.abs(Math.cos(it.r)),
          s2 = Math.abs(Math.sin(it.r)),
          hw = (3.6 * c + 4.5 * s2) / 2,
          hd = (3.6 * s2 + 4.5 * c) / 2,
          [x, z] = toWorld(p, it.x, it.z);
        const ry = Math.abs(Math.cos(p.yaw)) > 0.5 ? [hw, hd] : [hd, hw];
        camBlocks.push(new THREE.Box3(new THREE.Vector3(x - ry[0], 0, z - ry[1]), new THREE.Vector3(x + ry[0], 2.8, z + ry[1])));
      }
    }
    const d = cam.distanceTo(look);
    if (d < 0.5) return;
    _ray.origin.copy(look);
    _ray.direction.copy(cam).sub(look).normalize();
    let best = d;
    for (const b of camBlocks) {
      if (b.containsPoint(look)) continue;
      if (_ray.intersectBox(b, _hit)) {
        const t = _hit.distanceTo(look);
        if (t < best) best = t;
      }
    }
    if (best < d) cam.copy(look).addScaledVector(_ray.direction, Math.max(0.6, best - 0.3));
  }

  function openInventory(pick = '') {
    if (P.mode !== 'walk') return;
    if (document.pointerLockElement) document.exitPointerLock();
    P.mode = 'stash';
    P.vx = P.vz = 0;
    for (const k in keys) keys[k] = false;
    void smoke.openStash(pick);
  }
  // what's standing on my own lot takes no inventory slot; gear placed before it was carried counts as owned
  setInterval(() => {
    if (!active) return;
    const ks = layoutOf(MY?.owner || null).map(i => i.k),
      n: Record<string, number> = {};
    setPlaced(ks);
    for (const k of ks) if (!k.startsWith('trophy:')) n[k] = (n[k] || 0) + 1; // whatever stands on the lot is owned
    if (Object.keys(n).length) void ownAtLeast(n);
  }, 1500);
  // ---------------- the menu (Tab): everything that isn't worth a line of its own in the controls panel ----------------
  function openMenu() {
    const onLot = onMyLot(),
      items: [string, string, string, () => void][] = [
        ['map', 'Town map', 'M', openMap],
        ['inv', 'Inventory', 'I', () => openInventory()],
        ...(onLot
          ? ([
              ['build', 'Build Mode', 'B', tryBuild],
              ['mirror', 'Mirror: build and skin', '', () => void openWardrobe('mirror')],
            ] as [string, string, string, () => void][])
          : []),
        ['options', 'Options', 'Esc', () => options.open()],
      ];
    openModal(
      'Menu',
      `<div class="menugrid">${items.map(([id, label, key]) => `<button data-m="${id}"><span>${label}</span><kbd>${key}</kbd></button>`).join('')}</div>
       <p class="muted" style="margin-top:10px">Each has its own key too, shown beside it. Emotes are on <kbd>Q</kbd>.</p>`,
    );
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-m]')
      .forEach(
        b =>
          (b.onclick = () => {
            const it = items.find(i => i[0] === b.dataset.m)!;
            closeModal();
            it[3]();
          }),
      );
  }
  // ---------------- the town map (M) ----------------
  function openMap() {
    const c = document.createElement('canvas'),
      S = 3.1, // pixels per metre
      X0 = -156,
      Z0 = -62,
      W = 336,
      Hh = 124;
    c.width = Math.round(W * S);
    c.height = Math.round(Hh * S);
    const x = c.getContext('2d')!,
      px = (wx: number) => (wx - X0) * S,
      pz = (wz: number) => (wz - Z0) * S,
      rect = (x0: number, z0: number, x1: number, z1: number, fill: string) => {
        x.fillStyle = fill;
        x.fillRect(px(x0), pz(z0), (x1 - x0) * S, (z1 - z0) * S);
      },
      label = (t: string, wx: number, wz: number, size = 15, col = '#fff7e0') => {
        x.font = `800 ${size}px "Barlow Condensed", Inter, sans-serif`;
        x.textAlign = 'center';
        x.lineJoin = 'round';
        x.lineWidth = 4;
        x.strokeStyle = 'rgba(20,14,8,.85)';
        x.strokeText(t, px(wx), pz(wz));
        x.fillStyle = col;
        x.fillText(t, px(wx), pz(wz));
      };
    rect(X0, Z0, X0 + W, Z0 + Hh, '#6f7a45'); // meadow
    rect(-BOUND, -BOUND, BOUND, BOUND, '#7f8a52'); // the town
    rect(BOUND, -FUN.z, FUN.x1, FUN.z, '#86905a'); // Fun Land
    rect(WEST.x0, WEST.z0, WEST.x1, WEST.z1, '#86905a'); // the West Side, up its rise
    rect(WEST.x1, 8, -BOUND, 20, '#86905a');
    // streets
    for (const s of [-14, 14]) {
      rect(-BOUND, s - 3, BOUND, s + 3, '#55524c');
      rect(s - 3, -BOUND, s + 3, BOUND, '#55524c');
    }
    rect(BOUND, -17, 104, -10.5, '#55524c');
    rect(-140, 10.5, -BOUND, 17.5, '#55524c');
    rect(-124, 20, -78, 35, '#4c4a45');
    rect(-9.5, -9.5, 9.5, 9.5, '#c9bca4'); // plaza
    for (const l of LOTS) rect(l.cx - HALF, l.cz - HALF, l.cx + HALF, l.cz + HALF, '#a79a7c');
    if (MY) rect(MY.cx - HALF, MY.cz - HALF, MY.cx + HALF, MY.cz + HALF, '#e2b23a');
    // places
    rect(54, -4, 64, 4, '#c8452f');
    rect(73.5, -47.6, 104, -17.4, '#2f8a5a');
    rect(76, 13, 81, 45, '#3a5a6a');
    rect(81, 13, 172, 45, '#7c9a45');
    x.strokeStyle = '#3a3835';
    x.lineWidth = 7 * S * 0.5;
    x.beginPath();
    x.roundRect(px(109), pz(-43), (166 - 109) * S, 35 * S, 20);
    x.stroke();
    rect(-92, -5, -76, 8, '#ece6d8');
    rect(-110, -6, -96, 8, '#5a3a30');
    rect(-128, -4, -114, 8, '#4f7a4a');
    x.fillStyle = '#d8d2c4';
    x.beginPath();
    x.arc(px(-136), pz(-1), 2.8 * S, 0, 7);
    x.fill();
    label('PLAZA', 0, 1.5, 16);
    label('tee times · pro shop', 0, 7, 11, '#f1e6c8');
    label('▲ TO THE COURSE', 0, -BOUND - 5, 14, '#cfe8b0');
    label('FUN LAND', 110, 6, 20, '#ffd27a');
    label('Birdie Burger', 59, -6.5, 12);
    label('Mini putt', 89, -31, 13);
    label('Go-karts', 138, -22, 13);
    label('Driving range', 122, 30, 13);
    label('WEST SIDE', -101, 29.5, 20, '#ffd27a');
    label('Clubhouse', -79, -7, 13);
    label('Lounge', -103, -11.5, 13);
    label('Grow Supply', -128, -7, 13);
    label('Dealer', -112, 9.6, 11, '#f1e6c8');
    if (MY) label('YOUR LOT', MY.cx, MY.cz + HALF + 4.5, 12, '#ffe9a8');
    // you
    x.fillStyle = '#ff5a4a';
    x.strokeStyle = '#fff';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(px(clamp(P.x, X0 + 3, X0 + W - 3)), pz(clamp(P.z, Z0 + 3, Z0 + Hh - 3)), 7, 0, 7);
    x.fill();
    x.stroke();
    openModal(
      'Town map',
      `<img src="${c.toDataURL('image/jpeg', 0.9)}" alt="" style="width:100%;border-radius:12px;display:block"><p class="muted" style="margin-top:8px">The red dot is you. North is up.</p>`,
    );
    $('lmodal').querySelector('.card')?.classList.add('mapcard');
  }
  // ---------------- emotes (Q) ----------------
  function openEmotes() {
    const list: [string, () => void][] = [
      ['Wave', () => doGesture(0)],
      ['Point', () => doGesture(1)],
      ['Thumbs up', () => doGesture(2)],
      ['Cheer', () => doGesture(3)],
      ['Flop over', () => goLimp('flop')],
    ];
    openModal(
      'Emotes',
      `<div class="menugrid">${list.map(([l], i) => `<button data-e="${i}"><span>${l}</span><kbd>${i + 1}</kbd></button>`).join('')}</div>`,
    );
    const pick = (i: number) => {
      if (!list[i]) return;
      closeModal();
      list[i][1]();
    };
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-e]')
      .forEach(b => (b.onclick = () => pick(+b.dataset.e!)));
    modalKeys = e => {
      if (e.code === 'KeyQ') closeModal();
      else pick(+e.key - 1);
    };
  }
  function doGesture(gi: number) {
    if (flop || P.mode !== 'walk') return;
    gest = { i: gi, t0: clock, n: (gest?.n || 0) + 1 };
    if (gi === 3) me.playOnce('cheer');
  }
  // ---------------- the clubhouse (West Side): tee times and the trophy case ----------------
  function openClubhouse() {
    openModal(
      'Golden Hills Clubhouse',
      `<p class="muted">"Welcome in. Tee sheet's on the desk, silverware's wherever you left it."</p>
       <div class="menugrid"><button data-c="tee"><span>Tee times</span></button><button data-c="tro"><span>Your trophies</span></button></div>`,
    );
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-c]')
      .forEach(
        b =>
          (b.onclick = () => {
            closeModal();
            if (b.dataset.c === 'tee') tee.open();
            else openInventory('trophy');
          }),
      );
  }
  // ---------------- Grow Supply (West Side): the shop counter ----------------
  /** A shop counter: goods as cards with a picture, what they do, the price and how many you have. */
  interface Good {
    id: string;
    icon: string;
    name: string;
    desc: string;
    price: number;
    have: string;
    sold?: boolean;
    group: string;
  }
  async function openShop(title: string, keeper: string, goods: (pr: Awaited<ReturnType<typeof loadProgress>>) => Good[], note = '') {
    const pr = await loadProgress(),
      money = (n: number) => '$' + Math.round(n).toLocaleString('en-US'),
      list = goods(pr),
      groups = [...new Set(list.map(g => g.group))];
    openModal(
      title,
      `<div class="shop"><div class="shophead"><p class="muted">${keeper}</p><div class="shopcash">Cash <b>${money(pr.cash)}</b></div></div>
       ${groups.length > 4 ? `<div class="aisles" style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 2px">${groups.map((gr, i) => `<button class="chip" data-aisle="${i}">${gr}</button>`).join('')}</div>` : ''}
       ${groups
         .map(
           (gr, gi) =>
             `<h3 data-aisle-h="${gi}">${gr}</h3><div class="goods">${list
               .filter(g => g.group === gr)
               .map(
                 g => `<div class="good"><div class="gi">${g.icon}</div><div class="gt"><b>${g.name}</b><p>${g.desc}</p><em>${g.have}</em></div>
                 <button data-buy="${g.id}" ${g.sold || pr.cash < g.price ? 'disabled' : ''}>${g.sold ? 'Owned' : money(g.price)}</button></div>`,
               )
               .join('')}</div>`,
         )
         .join('')}
       ${note ? `<p class="muted" style="margin-top:10px">${note}</p>` : ''}</div>`,
    );
    $('lmodal').querySelector('.card')?.classList.add('wide');
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-aisle]')
      .forEach(
        b =>
          (b.onclick = () =>
            $('lmodal').querySelector(`[data-aisle-h="${b.dataset.aisle}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })),
      );
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-buy]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const g = list.find(x => x.id === b.dataset.buy)!,
              r = await buyItem(g.id, g.price);
            playSample(r === 'ok' ? 'confirm' : 'error', 0.5);
            if (r !== 'ok')
              toast(
                r === 'full' ? 'Your inventory is full (32 slots).' : r === 'have' ? 'You already have one.' : "You can't afford that right now.",
              );
            else {
              const sc = $('lmodal').querySelector('.card')?.scrollTop || 0;
              await openShop(title, keeper, goods, note);
              const c = $('lmodal').querySelector('.card');
              if (c) c.scrollTop = sc;
            }
          }),
      );
  }
  /** The pro shop (West Side): ball trails for now. Club skins and club effects are to come. */
  async function openProShop() {
    const pr = await loadProgress(),
      money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
    openModal(
      'Pro Shop',
      `<div class="shop"><div class="shophead"><p class="muted">"Everything for the golfer who has everything. Trails today; club skins and effects are on order."</p><div class="shopcash">Cash <b>${money(pr.cash)}</b></div></div>
       <h3>Ball trails</h3><div class="goods">${TRAILS.map(t => {
         const own = !t.id || pr.trails.includes(t.id),
           on = pr.trail === t.id;
         return `<div class="good"><div class="gi"><span class="trail" style="background:${t.color === 'rainbow' ? 'linear-gradient(90deg,#ff4f4f,#ffd24a,#9cff3a,#8fe3ff,#ff4fc3)' : t.color}"></span></div><div class="gt"><b>${t.name}</b><p>${t.desc}</p><em>${on ? 'In use' : own ? 'Owned' : ''}</em></div>
           <button data-trail="${t.id}" ${on || (!own && pr.cash < t.price) ? 'disabled' : ''}>${on ? 'In use' : own ? 'Use' : money(t.price)}</button></div>`;
       }).join('')}</div>
       <p class="muted" style="margin-top:10px">A trail is the line your ball draws through the air on every course. Others don't see yours yet.</p></div>`,
    );
    $('lmodal').querySelector('.card')?.classList.add('wide');
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-trail]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const t = TRAILS.find(x => x.id === b.dataset.trail)!,
              ok = await setTrail(t.id, t.price);
            playSample(ok ? 'confirm' : 'error', 0.5);
            if (ok) void openProShop();
            else toast("You can't afford that right now.");
          }),
      );
  }
  /** Homestead Furniture (West Side): everything for your lot. Bought pieces go to the lot's storage (Build Mode). */
  /** What the pawnbroker pays for a trophy: more for a championship, a bigger field and a score under par, and then
   *  his mood about that particular cup (fixed by the trophy, so it can't be re-rolled). */
  const pawnOffer = (t: { seed: number; n: number; toPar: number; field: number }) => {
    const big = t.n === 9,
      base = (big ? 6000 : 2000) * (1 + 0.25 * Math.max(0, Math.min(3, (t.field || 1) - 1))),
      under = Math.max(0, -t.toPar) * (big ? 250 : 150),
      mood = 0.88 + ((t.seed >>> 0) % 25) / 100;
    return Math.max(500, Math.round(((base + under) * mood) / 50) * 50);
  };
  /** Lucky Pawn (West Side): sell trophies from your case for cash. Gone for good; not while one stands on your lot. */
  async function openPawn(armed = '') {
    const pr = await loadProgress(),
      money = (n: number) => '$' + Math.round(n).toLocaleString('en-US'),
      tp = (n: number) => (n === 0 ? 'even par' : n > 0 ? `+${n}` : `${n}`),
      list = [...pr.trophies].sort((a, b) => pawnOffer(b) - pawnOffer(a));
    openModal(
      'Lucky Pawn',
      `<div class="shop"><div class="shophead"><p class="muted">${
        list.length
          ? "\"Let's see what you've got. I pay cash, and I don't sell them back.\""
          : '"Nothing to sell? Go and win something. I\'ll be here."'
      }</p><div class="shopcash">Cash <b>${money(pr.cash)}</b></div></div>
       ${
         list.length
           ? `<h3>Your trophies</h3><div class="goods">${list
               .map(t => {
                 const out = isPlaced('trophy:' + t.id),
                   offer = pawnOffer(t);
                 return `<div class="good"><div class="gi"><img src="${trophyPic(t.seed, t.n, '', 96)}" alt=""></div><div class="gt"><b>${esc(t.title)}</b>
                   <p>${t.n === 9 ? 'Championship' : 'Mini cup'} · ${tp(t.toPar)}${t.field > 1 ? ` · beat ${t.field - 1}` : ''}</p><em>${out ? 'On your lot: take it down in Build Mode first' : ''}</em></div>
                   <button data-pawn="${esc(t.id)}" ${out ? 'disabled' : ''}>${armed === t.id ? `Sell for ${money(offer)}?` : money(offer)}</button></div>`;
               })
               .join('')}</div>`
           : ''
       }
       <p class="muted" style="margin-top:10px">A sold trophy is gone for good, on every device. Click a price once to be asked, again to sell.</p></div>`,
    );
    const card = $('lmodal').querySelector('.card');
    card?.classList.add('wide');
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-pawn]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const id = b.dataset.pawn!,
              t = pr.trophies.find(x => x.id === id),
              sc = card?.scrollTop || 0;
            if (!t) return;
            if (armed !== id) await openPawn(id);
            else {
              const ok = await sellTrophy(id, pawnOffer(t));
              playSample(ok ? 'confirm' : 'error', 0.5);
              toast(ok ? `Sold: ${esc(t.title)} for ${money(pawnOffer(t))}.` : "He won't take that one.");
              await openPawn();
            }
            const c = $('lmodal').querySelector('.card');
            if (c) c.scrollTop = sc;
          }),
      );
  }
  /** Wrench & Ride (West Side): buy a car, choose the one you drive, repaint it. Your car replaces the golf cart in town
   *  and on the course; it still comes out of your lot's garage. */
  const carPics = new Map<string, string>();
  async function openAuto() {
    await loadCarKit().catch(() => 0); // (the pictures are drawn from the models)
    const pr = await loadProgress(),
      money = (n: number) => '$' + Math.round(n).toLocaleString('en-US'),
      look = (id: string) => (pr.carLook[id] || ':').split(':') as [string, string],
      pic = (id: string) => {
        const k = id + (pr.carLook[id] || ''),
          spec = CAR.get(id)!;
        if (!carPics.has(k)) carPics.set(k, objectImage(carModel(spec, ...look(id)).root, 220));
        return carPics.get(k)!;
      },
      cur = CAR.get(pr.car),
      PAINT = 150,
      sw = (kind: 'paint' | 'rim', list: string[], on: string) =>
        list
          .map(
            c =>
              `<button class="swatch${c === on ? ' on' : ''}" data-${kind}="${c}" title="${c ? '#' + c : 'Factory finish'}" style="background:${c ? '#' + c : 'repeating-linear-gradient(45deg,#d8d2c2 0 5px,#8a867c 5px 10px)'}"></button>`,
          )
          .join('');
    openModal(
      'Wrench & Ride Auto',
      `<div class="shop"><div class="shophead"><p class="muted">"Whatever you pick drives out of your garage, here and up at the course."</p><div class="shopcash">Cash <b>${money(pr.cash)}</b></div></div>
       ${
         cur
           ? `<h3>Your ${cur.name}</h3><div class="carpaint"><img src="${pic(cur.id)}" alt=""><div>
               <p><b>Paint</b> <span class="muted">${money(PAINT)} a respray, factory finish free</span></p><div class="swatches">${sw('paint', CAR_PAINTS, look(cur.id)[0])}</div>
               <p><b>Rims</b> <span class="muted">${money(PAINT)}</span></p><div class="swatches">${sw('rim', CAR_RIMS, look(cur.id)[1] || CAR_RIMS[0])}</div></div></div>`
           : ''
       }
       <h3>On the lot</h3><div class="cars">
         <div class="carcard${pr.car ? '' : ' on'}"><img class="carpic" src="${carPics.get('cart') || (carPics.set('cart', objectImage(cartModel('#c8452f').root, 220)), carPics.get('cart'))}" alt=""><b>Golf cart</b><p>The one that came with the place.</p>
           <button data-car="" ${pr.car ? '' : 'disabled'}>${pr.car ? 'Drive this' : 'Driving'}</button></div>
         ${CARS.map(c => {
           const own = pr.cars.includes(c.id),
             on = pr.car === c.id;
           return `<div class="carcard${on ? ' on' : ''}"><img class="carpic" src="${pic(c.id)}" alt=""><b>${c.name}</b><p>${c.blurb}</p>
             <button data-car="${c.id}" ${on || (!own && pr.cash < c.price) ? 'disabled' : ''}>${on ? 'Driving' : own ? 'Drive this' : money(c.price)}</button></div>`;
         }).join('')}</div>
       <p class="muted" style="margin-top:10px">Your car comes out of the cart garage on your lot (<kbd>E</kbd> at the garage) and waits behind the tee on the course.</p></div>`,
    );
    const card = $('lmodal').querySelector('.card');
    card?.classList.add('wide');
    const again = async () => {
      const sc = card?.scrollTop || 0;
      await openAuto();
      const c = $('lmodal').querySelector('.card');
      if (c) c.scrollTop = sc;
    };
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-car]')
      .forEach(
        b =>
          (b.onclick = async () => {
            const id = b.dataset.car || '',
              ok = await setCar(id, CAR.get(id)?.price || 0);
            playSample(ok ? 'confirm' : 'error', 0.5);
            if (!ok) toast("You can't afford that right now.");
            else toast(id ? `${CAR.get(id)!.name}: it's in your garage.` : 'Back to the golf cart.');
            await again();
          }),
      );
    const respray = async (paint: string, rim: string) => {
      if (!cur) return;
      const [p0, r0] = look(cur.id),
        free = (paint === p0 && rim === r0) || (!paint && rim === r0),
        ok = await paintCar(cur.id, paint, rim, free ? 0 : PAINT);
      playSample(ok ? 'confirm' : 'error', 0.5);
      if (!ok) toast("You can't afford that right now.");
      await again();
    };
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-paint]')
      .forEach(b => (b.onclick = () => respray(b.dataset.paint || '', look(cur!.id)[1])));
    $('lmodal')
      .querySelectorAll<HTMLButtonElement>('[data-rim]')
      .forEach(b => (b.onclick = () => respray(look(cur!.id)[0], b.dataset.rim || '')));
  }
  /** Which aisle of the furniture store a piece is in (by what it is called; the first match wins). */
  const AISLES: [string, RegExp][] = [
    ['For the cart', /garage/i],
    ['Floors, fences and screens', /rug|deck|stepping|gravel|fence|screen|putting green/i],
    ['Plants', /plant|palm|cactus|agave|fern|succulent|planter/i],
    ['Lighting', /lamp|lights|torch|lantern|neon/i],
    ['Seating', /chair|bench|sofa|stool|booth|hammock/i],
    ['Tables and desks', /table|desk/i],
    ['Bedroom and storage', /bed|wardrobe|cupboard|bookcase|shelves|coat|crate|box|basket/i],
    ['Kitchen and appliances', /fridge|stove|washing|grill|cooler|television|fish tank|fan|bin|propane/i],
    ['Yard fun', /pool|umbrella|fire pit|windmill|bird bath|flamingo|gnome|flag|statue|guitar|sign/i],
  ];
  const AISLE_ORDER = [
    'Seating',
    'Tables and desks',
    'Bedroom and storage',
    'Kitchen and appliances',
    'Lighting',
    'Plants',
    'Yard fun',
    'Floors, fences and screens',
    'Odds and ends',
    'For the cart',
  ];
  const aisle = (def: { name: string; cat: string }) =>
    def.cat === 'garage' ? 'For the cart' : AISLES.find(a => a[1].test(def.name))?.[0] || 'Odds and ends';
  const openFurniture = async () => {
    await loadItemModels().catch(() => 0); // (the pictures are drawn from the models)
    return openShop(
      'Homestead Furniture',
      '"Take your time. It all goes home with you: we deliver to your lot\'s storage."',
      pr =>
        ITEMS.filter(i => i.cat === 'furniture' || i.cat === 'decor' || i.cat === 'garage')
          .sort((a, b) => AISLE_ORDER.indexOf(aisle(a)) - AISLE_ORDER.indexOf(aisle(b)))
          .map(def => {
            const own = pr.gear[def.id] || 0;
            return {
              id: def.id,
              icon: `<img src="${thumb(def, '#c8452f')}" alt="">`,
              name: def.name,
              desc: def.cat === 'garage' ? 'Keeps your cart at home. One per lot.' : def.cat === 'furniture' ? 'Furniture' : 'Decoration',
              price: def.price,
              have: own ? `You own ${own}` : '',
              sold: !!def.max && own >= def.max,
              group: aisle(def),
            };
          }),
      "Bought pieces wait in your lot's storage. Press <kbd>B</kbd> on your own lot to place them; taking one off the lot puts it back in storage.",
    );
  };
  const openGrowShop = () =>
    openShop(
      'Grow Supply',
      '"Afternoon. Everything for the garden, and a few things for after."',
      pr => {
        const gear = (id: string, icon: string, desc: string): Good => {
          const def = ITEMS.find(i => i.id === id)!,
            own = pr.gear[id] || 0;
          return {
            id,
            icon,
            name: def.name.replace(/ \(.*/, ''),
            desc,
            price: def.price,
            have: own ? `You own ${own}` : '',
            group: 'For the garden',
          };
        };
        return [
          gear('growpot', invIcon('growpot'), 'One plant. Goes anywhere on your lot.'),
          gear('growbed', invIcon('growbed'), 'Three plants, and they grow a little faster.'),
          gear('sprinkler', invIcon('sprinkler'), 'Waters every plant within 2.6 m for you.'),
          {
            id: 'fert',
            icon: invIcon('fert'),
            name: 'Fertilizer',
            desc: 'Three doses. Hungry plants lose quality.',
            price: 25,
            have: pr.fert ? `${pr.fert} doses` : '',
            group: 'For the garden',
          },
          {
            id: 'papers',
            icon: invIcon('papers'),
            name: 'Rolling papers',
            desc: 'A pack of 20. One per joint.',
            price: PAPERS_PRICE,
            have: pr.papers ? `${pr.papers} left` : '',
            group: 'For after',
          },
          {
            id: 'grinder',
            icon: invIcon('grinder'),
            name: 'Grinder',
            desc: 'Quicker, cleaner grinding when you roll.',
            price: GRINDER_PRICE,
            have: '',
            sold: pr.grinder,
            group: 'For after',
          },
        ];
      },
      'Gear goes into your inventory (<kbd>I</kbd>). Place it in Build Mode on your own lot, under Grow. Seeds are bought when you plant.',
    );

  // ---------------- trophy case (T) ----------------
  async function openTrophies() {
    const pr = await loadProgress(),
      list = [...pr.trophies].sort((a, b) => b.at - a.at);
    const tp = (v: number) => (v === 0 ? 'E' : v > 0 ? '+' + v : '−' + -v);
    const items = list
      .map(
        t => `<div class="trophy"><img src="${trophyPic(t.seed, t.n, `${t.who} · ${tp(t.toPar)}`, 200)}" alt=""><div class="cupname">${esc(t.title)}</div>
      <div class="muted">${t.n === 9 ? 'Championship' : 'Mini cup'} · ${tp(t.toPar)} (${t.strokes})${t.field > 1 ? ` · beat ${t.field - 1}` : ' · solo'}<br>${new Date(t.at).toLocaleDateString()}</div>${
        t.board?.length
          ? `<table class="tboard">${t.board.map((r, i) => `<tr${r.n === t.who ? ' class="me"' : ''}><td>${i + 1}</td><td>${esc(r.n)}</td><td>${r.s}</td><td>${tp(r.p)}</td></tr>`).join('')}</table>`
          : ''
      }</div>`,
      )
      .join('');
    openModal(
      'Trophy case',
      list.length
        ? `<p class="muted">${list.length} cup${list.length > 1 ? 's' : ''} won. Once you can build on your lot, each one can go on display there.</p><div class="trophies">${items}</div>`
        : '<p class="muted">No trophies yet. Win a tournament from the tee times board (Mini cup or Championship) to take one home.</p>',
    );
    $('lmodal').querySelector('.card')?.classList.add('wide');
  }

  // ---------------- ragdoll ----------------
  let flop: Flop | null = null,
    rg: Rg | null = null,
    splashed = false;
  const fwd = () => new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  function startFlop(g: Golfer, e: Rg) {
    const stiffFall = e.k === 'flop' && Math.hypot(e.v[0], e.v[2]) < 1.2; // standing flop: falls like a plank, then goes limp
    return new Flop(pw!, g, {
      vel: new THREE.Vector3(e.v[0], e.v[1], e.v[2]),
      impulse: new THREE.Vector3(e.i[0], e.i[1], e.i[2]),
      at: e.at,
      tone: stiffFall ? 3 : e.k === 'bonk' ? 0.04 : e.k === 'trip' ? 0.6 : 0.8,
      toneT: stiffFall ? 0.9 : e.k === 'bonk' ? 0 : 0.5,
      rest: 0.1,
      onThud: v => sfx.thud(0.25 + 0.5 * v * (g === me ? 1 : 0.5)),
    });
  }
  /** Go limp. flop: F key (a dive if moving, else a topple); bonk: sprinted into something; trip: sprinted into the fountain rim. */
  function goLimp(kind: 'flop' | 'bonk' | 'trip') {
    if (!pw || flop || P.mode !== 'walk') return;
    const f = fwd(),
      sp = P.spd,
      v = [P.vx, Math.max(0, P.vy), P.vz];
    let i: THREE.Vector3,
      at = 'Spine1';
    if (kind === 'bonk') {
      i = f
        .clone()
        .multiplyScalar(-14 - sp * 3)
        .setY(4);
      at = 'Head';
      v[0] *= 0.15;
      v[2] *= 0.15;
      sfx.bonk(1);
    } else if (kind === 'trip') {
      i = f.clone().multiplyScalar(6).setY(9);
      at = 'Hips';
      v[1] = 1.5;
    } else if (sp > 1.2) {
      i = f
        .clone()
        .multiplyScalar(10 + sp * 3)
        .setY(12);
      v[1] = 1.2;
    } // dive
    else {
      const side = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw)).multiplyScalar((Math.random() - 0.5) * 8);
      i = f.clone().multiplyScalar(-16).add(side).setY(1);
    } // timber!
    rg = { t: Date.now(), v: v.map(x => +x.toFixed(2)), i: [+i.x.toFixed(2), +i.y.toFixed(2), +i.z.toFixed(2)], at, k: kind };
    flop = startFlop(me, rg);
    splashed = false;
    P.vx = P.vz = P.vy = 0;
    P.y = 0;
    P.air = 0;
    sendPres(true);
  }

  // ---------------- remote players ----------------
  const remotes = new Map<string, Remote>();
  // ---------------- ground life (world-feel.md): two strollers, birds that scatter, a stray cat ----------------
  const life = createTownLife(scene, () => pw); // walkers on every pavement, a few cars on the streets (lobby/townLife.ts)
  (window as any).__life = life;
  const strollers = createStrollers(scene, groundY, surfaceOf),
    scarers: Scarer[] = [];
  const catAt = (lot: number, lx: number, lz: number): [number, number, number] => {
    const p = plots[lot],
      w = toWorld(p, lx, lz);
    return [w[0], w[1], Math.atan2(-w[0], -w[1])];
  };
  const critters = createCritters(scene, {
    ground: groundY,
    open: (x, z) => !blocked(x, z, 0.15),
    birdSpots: [
      [5.5, 5.5, 2.2],
      [-5.5, -5.2, 2.2],
      [0, -19, 2.5],
      [19, 3, 2.5],
      [-3, 19, 2.5],
      [-19, -4, 2.5],
      [24, 24, 3],
      [-25, 23, 3],
    ],
    catSpots: [catAt(0, 6.1, 3.5), catAt(3, -6.1, 2.5), catAt(5, 6.1, 4), catAt(6, -6.1, 3), [-2.6, -6.6, 0.4], [4.6, 6.9, 3.4], [-8.6, 3.2, 1.6]],
  });
  function remoteFor(peer: string, by: string, o: Outfit) {
    let r = remotes.get(peer);
    const key = lookKey(o);
    if (r && r.key !== key) {
      const pos = r.golfer.root.position.clone();
      r.golfer.dispose();
      r.golfer = new Golfer(o);
      r.golfer.root.position.copy(pos);
      scene.add(r.golfer.root);
      r.key = key;
    }
    if (r) return r;
    const g = new Golfer(o);
    scene.add(g.root);
    const tag = document.createElement('div');
    tag.className = 'ntag';
    tags.appendChild(tag);
    const bub = document.createElement('div');
    bub.className = 'bubble';
    bub.style.display = 'none';
    tags.appendChild(bub);
    r = {
      peer,
      by,
      golfer: g,
      key,
      x: 0,
      z: 0,
      yaw: 0,
      tx: 0,
      tz: 0,
      tyaw: 0,
      spd: 0,
      ty: 0,
      y: 0,
      gy: 0,
      aspd: 0,
      phase: Math.random() * 6,
      tag,
      bub,
      pres: null,
      sayAt: 0,
    };
    remotes.set(peer, r);
    return r;
  }
  function dropRemote(peer: string) {
    const r = remotes.get(peer);
    if (!r) return;
    r.flop?.dispose();
    r.cart?.dispose();
    r.golfer.dispose();
    r.tag.remove();
    r.bub.remove();
    remotes.delete(peer);
  }
  let peerErrN = 0;
  const peerErr = (e: unknown) => {
    if (peerErrN++ < 5) console.warn('[peer]', e);
  };
  function onPeers(ch: any) {
    const live = new Set<string>(),
      bjPeers: { uid: string; bj?: BJPres }[] = [];
    for (const pe of ch.peers || []) {
      try {
        /* one player's bad data must not stop us seeing everyone else */
        if (pe.isMe || pe.sameTab || pe.kind === 'agent') continue;
        const pr = pe.presence as LPres;
        if (!pr || pr.v !== 2 || typeof pr.x !== 'number') continue;
        live.add(pe.peer);
        bjPeers.push({ uid: pe.by || pe.peer, bj: pr.bj });
        garden.visitorWater(pe.by || pe.peer, pr.gw);
        const first = !remotes.has(pe.peer),
          r = remoteFor(pe.peer, pe.by || pe.peer, sanitizeLook(pr.o));
        r.by = pe.by || r.by;
        r.pres = pr;
        r.tx = clamp(+pr.x || 0, -BOUND, FUN.x1);
        r.tz = clamp(+pr.z || 0, -FUN.z, 152);
        r.tyaw = +pr.yaw || 0;
        r.spd = clamp(+pr.spd || 0, 0, 7);
        r.ty = clamp(+(pr.y || 0), 0, 3);
        if (first) {
          r.x = r.tx;
          r.z = r.tz;
          r.yaw = r.tyaw;
          r.rgT = pr.rg?.t;
        }
        if (pr.rg && pr.rg.t !== r.rgT) {
          r.rgT = pr.rg.t;
          if (pw && !r.flop && Array.isArray(pr.rg.v) && Array.isArray(pr.rg.i)) {
            const e = pr.rg,
              f = (x: any) => clamp(+x || 0, -60, 60);
            r.golfer.root.position.set(r.tx, r.gy, r.tz);
            r.golfer.root.rotation.y = r.tyaw;
            r.golfer.root.updateMatrixWorld(true);
            r.flop = startFlop(r.golfer, {
              t: e.t,
              v: e.v.slice(0, 3).map(f),
              i: e.i.slice(0, 3).map(f),
              at: ['Head', 'Hips', 'Spine1'].includes(e.at) ? e.at : 'Spine1',
              k: String(e.k),
            });
            if (e.k === 'bonk') sfx.bonk(0.5);
          }
        }
        if (pr.say && pr.sayAt && pr.sayAt !== r.sayAt) {
          r.sayAt = pr.sayAt;
          if (!first || Math.abs(Date.now() - pr.sayAt) < 15000) {
            /* a new line while we're watching always shows, whatever their clock says */ const t = String(pr.say).slice(0, 120);
            r.bub.textContent = t;
            (r.bub as any)._t = 5;
            addChat(pf?.names.get(r.by) || 'Golfer', t);
          }
        }
      } catch (e) {
        peerErr(e);
      }
    }
    for (const k of [...remotes.keys()]) if (!live.has(k)) dropRemote(k);
    bjGame.peers(bjPeers);
    smoke.peers(
      (ch.peers || [])
        .filter((pe: any) => !pe.isMe && !pe.sameTab && pe.presence?.v === 2)
        .map((pe: any) => ({ uid: pe.by || pe.peer, sm: (pe.presence as LPres).sm })),
    );
    if (pf)
      resolveNames(
        pf,
        [...remotes.values()].map(r => r.by),
      ).then(updateTagsText);
    tee.checkGroupStart();
    tee.render();
    renderStatus();
  }
  function updateTagsText() {
    for (const r of remotes.values()) {
      const t = (pf?.names.get(r.by) || 'Golfer') + (r.pres?.g ? ' · on the course' : '');
      if (r.tag.textContent !== t) r.tag.textContent = t;
    }
    refreshPlots();
  }
  let lastPres = '',
    presT = 0;
  function sendPres(force = false) {
    if (!pf?.room || !active) return;
    const now = performance.now();
    if (!force && now - presT < 100) return;
    presT = now;
    const pr: LPres = {
      v: 2,
      x: +P.x.toFixed(2),
      z: +P.z.toFixed(2),
      y: P.y > 0.01 ? +P.y.toFixed(2) : undefined,
      yaw: +P.yaw.toFixed(2),
      spd: +P.spd.toFixed(2),
      o: look,
      say: P.say || undefined,
      sayAt: P.sayAt || undefined,
      q: P.q || undefined,
      go: P.go,
      ed: P.mode === 'wardrobe' || undefined,
      car: cart.car ? cart.car.state() : undefined,
      dr: P.mode === 'drive' ? 1 : undefined,
      kb: fun.bestLap() || undefined,
      mp: putt.pres(),
      ge: gest && clock - gest.t0 < 3 ? [gest.i, gest.n] : undefined,
      rd: cart.car && RS.on && radio.ready ? [RS.band, Math.round(RS.vol * 10) / 10] : undefined,
      bj: bjGame.pres(),
      vm: vlt.pres(),
      sm: smoke.pres(),
      hd: garden.pres(),
      gw: P.gw && Date.now() - P.gw.at < 60000 ? P.gw : undefined,
      rg: rg && Date.now() - rg.t < 6000 ? rg : undefined,
    };
    const j = JSON.stringify(pr);
    if (j === lastPres) return;
    lastPres = j;
    Promise.resolve(pf.room.presence(pr)).catch(() => {});
  }
  function renderStatus() {
    const n = remotes.size,
      inGolf = [...remotes.values()].filter(r => r.pres?.g).length,
      q = tee.queue().length;
    $('lstatus').innerHTML = !pf?.room
      ? '<i class="off"></i>Solo · open the published page to play with friends'
      : `<i></i>${n + 1} here${inGolf ? ` · ${inGolf} on the course` : ''}${q ? ` · ⛳ ${q} waiting for a tee time` : ''}${n ? '' : ' · share the link to invite friends'}`;
    $('llot').textContent = MY ? `Lot ${MY.lot} · yours` : pf?.db ? 'Visiting' : 'Lot 7 · yours (offline)';
  }

  // ---------------- lots (shared db) ----------------
  function refreshPlots() {
    const taken = new Map<number, { uid: string; at: number }>();
    for (const [uid, d] of plotDocs) {
      if (!d || !d.lot) continue;
      const c = taken.get(d.lot);
      if (!c || d.claimedAt < c.at || (d.claimedAt === c.at && uid < c.uid)) taken.set(d.lot, { uid, at: d.claimedAt || 0 });
    }
    if (pf?.db) {
      let myLot = [...taken.entries()].find(([, v]) => v.uid === pf!.uid)?.[0] || 0;
      if (!myLot && pf.canWrite && plotsReady) {
        myLot = LOT_ORDER.find(l => !taken.has(l)) || 0;
        if (myLot) {
          claimedAt = Date.now();
          taken.set(myLot, { uid: pf.uid, at: claimedAt });
          pf.db
            .doc('plots/' + pf.uid)
            .set({ lot: myLot, color: colorFor(pf.uid), claimedAt })
            .catch(() => {});
          toast(`Welcome to the neighbourhood! <b>Lot ${myLot}</b> is yours.`, 3500);
        }
      }
      MY = myLot ? plots[myLot - 1] : null;
    } else MY = plots[6];
    for (const p of plots) {
      const o = taken.get(p.lot),
        mine = p === MY;
      const owner = mine ? pf?.uid || 'me' : o?.uid || null,
        name = owner ? (mine ? 'You' : pf?.names.get(owner) || 'A golfer') : '',
        color = owner ? colorFor(owner) : '#8a8f86';
      if (p.owner !== owner || p.ownerName !== name) setPlotOwner(p, owner, name, color, mine);
      if (!(mine && build.on)) renderLot(p, layoutOf(owner), colliders, owner ? color : '#8a8f86'); // everyone's yard, as its owner left it
    }
    if (pf)
      resolveNames(
        pf,
        [...taken.values()].map(v => v.uid),
      ).then(() => {
        for (const p of plots)
          if (p.owner && p !== MY) {
            const nm = pf!.names.get(p.owner) || 'A golfer';
            if (nm !== p.ownerName) setPlotOwner(p, p.owner, nm, p.color, false);
          }
      });
    renderStatus();
  }
  let plotsReady = false;

  // ---------------- boot (platform) ----------------
  const ready = (async () => {
    pf = await platform();
    if (pf.db) {
      try {
        const s = await pf.db.doc(`data/users/${pf.uid}/look`).get();
        if (s.exists && s.data()?.look) {
          look = sanitizeLook(s.data().look);
          saveLocalLook(look);
          rebuildMe();
        } else if (!loadLocalLook()) {
          look = randomLook(pf.uid);
          rebuildMe();
        }
      } catch {}
      pf.db.collection('plots').onSnapshot(
        (snap: any) => {
          for (const d of snap.docs) {
            if (d.id === pf!.uid && plotDocs.has(d.id) && performance.now() < myPlotDirtyUntil) continue;
            plotDocs.set(d.id, d.data());
          }
          for (const c of snap.docChanges()) if (c.type === 'removed') plotDocs.delete(c.doc.id);
          if (!snap.metadata?.fromCache) plotsReady = true;
          refreshPlots();
        },
        () => {},
      );
    } else if (!loadLocalLook()) {
      look = randomLook(pf.uid);
      rebuildMe();
    }
    {
      let h = 0;
      for (const c of pf.uid) h = (h * 31 + c.charCodeAt(0)) | 0;
      const a = ((Math.abs(h) % 1000) / 1000) * Math.PI - Math.PI / 2;
      P.x = Math.sin(a) * 5.2;
      P.z = 4.6 + Math.cos(a) * 1.6;
      P.yaw = Math.PI + a * 0.3;
      P.camYaw = P.yaw - Math.PI;
      freeSpot();
    }
    if (pf.room) {
      pf.room.onPeers(onPeers, () => renderStatus());
      pf.room.onConnection?.(() => renderStatus());
    }
    refreshPlots();
    sendPres(true);
  })();

  // ---------------- frame ----------------
  let last = performance.now(),
    clock = 0,
    landT = 0,
    camEase = 0;
  const sfx = new Sfx();
  addEventListener('pointerdown', () => sfx.ensure());
  addEventListener('keydown', () => sfx.ensure());
  const camPos = new THREE.Vector3(0, 6, 14),
    camLook = new THREE.Vector3(),
    tmp = new THREE.Vector3(),
    _hp = new THREE.Vector3(),
    flopCam = new THREE.Vector3();
  function placeTag(el: HTMLElement, x: number, y: number, z: number, show: boolean) {
    tmp.set(x, y, z).project(camera);
    const vis = show && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    el.style.display = vis ? 'block' : 'none';
    if (vis) el.style.transform = `translate(-50%,-100%) translate(${((tmp.x + 1) / 2) * innerWidth}px,${((1 - tmp.y) / 2) * innerHeight}px)`;
  }
  function tick(now: number) {
    if (!active) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    // movement: camera-relative, jog by default, Shift sprint, Ctrl/Alt walk. Velocity eases toward the target fast
    // (snappy starts/stops), the body turns quickly to face where it's going, with a lean into turns.
    let ix = 0,
      iz = 0;
    if (P.mode === 'walk' && !flop) {
      if (keys.KeyW || keys.ArrowUp) iz += 1;
      if (keys.KeyS || keys.ArrowDown) iz -= 1;
      if (keys.KeyA || keys.ArrowLeft) ix += 1;
      if (keys.KeyD || keys.ArrowRight) ix -= 1;
    }
    const il = Math.hypot(ix, iz),
      sprint = keys.ShiftLeft || keys.ShiftRight,
      walkK = keys.ControlLeft || keys.ControlRight || keys.AltLeft || keys.AltRight;
    const target = il ? (sprint ? 6.0 : walkK ? 1.6 : 3.4) : 0,
      dir = Math.atan2(ix, iz) + P.camYaw;
    const tvx = il ? Math.sin(dir) * target : 0,
      tvz = il ? Math.cos(dir) * target : 0,
      grounded = P.air <= 0;
    const acc = grounded ? (il ? 9 : 13) : 1.5; // little air control
    P.vx += (tvx - P.vx) * (1 - Math.exp(-dt * acc));
    P.vz += (tvz - P.vz) * (1 - Math.exp(-dt * acc));
    P.spd = Math.hypot(P.vx, P.vz);
    if (P.spd > 0.15) {
      const a = Math.atan2(P.vx, P.vz);
      let d = a - P.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      P.yaw += clamp(d, -dt * 13, dt * 13) * (grounded ? 1 : 0.4);
    }
    if (P.spd > 0.01) {
      const sx = P.vx * dt,
        sz = P.vz * dt,
        stuck = blocked(P.x, P.z); // overlapping something already (bad spawn, moved prop): let them walk out
      // sprinting flat out into something: bonk (or over the fountain rim, into the water)
      const hit = !stuck && P.spd > 5.2 && P.air <= 0 ? hitAt(P.x + sx * 3, P.z + sz * 3) : null;
      if (hit && pw && !flop && (hit.tag !== 'fountain' || Math.hypot(P.x, P.z) > 3.0)) {
        const tx = (hit.x0 + hit.x1) / 2 - P.x,
          tz = (hit.z0 + hit.z1) / 2 - P.z;
        if (hit.r || hit.tag === 'edge' || P.vx * tx + P.vz * tz > 0) goLimp(hit.tag === 'fountain' ? 'trip' : 'bonk');
      }
      if (!flop) {
        if (stuck || !blocked(P.x + sx, P.z)) P.x += sx;
        else P.vx *= 0.2;
        if (stuck || !blocked(P.x, P.z + sz)) P.z += sz;
        else P.vz *= 0.2;
      }
    }
    // jump + gravity
    if (P.air > 0 || P.y > 0) {
      P.vy -= 15 * dt;
      P.y += P.vy * dt;
      P.air += dt;
      if (P.y <= 0) {
        P.y = 0;
        P.vy = 0;
        if (P.air > 0.05) {
          landT = 0.18;
          sfx.land(0.25);
        }
        P.air = 0;
      }
    }
    landT = Math.max(0, landT - dt);
    const turn = Math.atan2(Math.sin(P.yaw - P.prevYaw), Math.cos(P.yaw - P.prevYaw)) / Math.max(dt, 1e-3);
    P.prevYaw = P.yaw;
    P.turnS += (turn - P.turnS) * (1 - Math.exp(-dt * 5)); // filtered turn rate for the lean
    P.aspd += (P.spd - P.aspd) * (1 - Math.exp(-dt * 10)); // filtered speed for the gait blend
    P.gy += (groundY(P.x, P.z) - P.gy) * (1 - Math.exp(-dt * 18)); // step on/off kerbs smoothly
    // the stride lengthens with speed, so feet don't skate: phase advances by distance / stride
    const stride = stepLength(P.spd);
    const before = P.phase;
    if (grounded) P.phase += ((dt * P.spd) / stride) * Math.PI;
    if (grounded && P.spd > 0.5 && Math.floor(before / Math.PI) !== Math.floor(P.phase / Math.PI))
      ambience.step(surfaceOf(P.x, P.z), Math.min(1, P.spd / 6.4));
    speedo(P.mode === 'drive' && cart.car ? cart.car : null);
    if (cart.car) {
      // my cart: driven by me, or parked wherever I left it
      const driving = P.mode === 'drive' && !flop;
      const inp = driving
        ? {
            throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
            steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0),
            brake: !!keys.Space,
            boost: !!(keys.ShiftLeft || keys.ShiftRight),
          }
        : { throttle: 0, steer: 0, brake: true };
      const under = surfaceOf(cart.car.root.position.x, cart.car.root.position.z);
      cart.car.terrain = under === 'grass' ? 1 : under === 'gravel' ? 0.3 : 0; // (cars mind leaving the road; the golf cart doesn't)
      cart.car.drive(dt, inp);
      const sp = Math.abs(cart.car.speed()),
        cp = cart.car.root.position;
      if (P.mode === 'drive') {
        P.x = cp.x;
        P.z = cp.z;
        P.yaw = cartYaw(cart.car);
        P.spd = P.aspd = sp;
        P.vx = P.vz = 0;
        P.y = 0;
      }
      const up = _cv.set(0, 1, 0).applyQuaternion(cart.car.root.quaternion).y;
      cart.stuck = up < 0.45 && sp < 1.5 ? 'flip' : '';
      if (cp.y < -20) {
        const g = garageOf(MY);
        if (g) cart.car.placeAt(g.x, 0.3, g.z, g.yaw);
      }
      if (sp > 3.5 && pw)
        for (const r of remotes.values()) {
          // running people over
          if (r.flop || r.pres?.g || r.pres?.dr || (r.hitCD || 0) > clock || !inCartBox(cart.car, r.x, r.z, 0.2)) continue;
          const v = cart.car.velocity(new THREE.Vector3());
          r.hitCD = clock + 3;
          r.golfer.root.updateMatrixWorld(true);
          r.flop = startFlop(r.golfer, { t: Date.now(), v: [v.x * 0.9, 2.5, v.z * 0.9], i: [v.x * 8, 10, v.z * 8], at: 'Hips', k: 'bonk' });
          sfx.bonk(0.8);
          toast(`You ran over ${esc(pf?.names.get(r.by) || 'a golfer')}!`, 1500);
        }
      cart.car.contacts?.().forEach((c, i) => grass.press('car' + i, c.x, c.z, 0.35));
    }
    syncDecoPhysics(dt);
    syncParked();
    pw?.step(dt);
    const myPose = () =>
      P.mode === 'putt'
        ? me.update({ mode: 'putt', s: putt.swing(), club: 'putter', time: clock, showClub: true })
        : me.update({
            mode: 'walk',
            speed: P.spd,
            phase: P.phase,
            turn: clamp(P.turnS * 0.12, -1, 1) * Math.min(1, P.aspd / 3),
            air: P.air > 0 ? Math.min(1, P.air * 6) : 0,
            time: clock,
            s: 0,
            club: 'iron',
            showClub: false,
          });
    if (P.mode === 'putt') putt.stand(me.ballLocal);
    if (P.mode === 'drive' && cart.car && !flop) ride(me, cart.car);
    else if (flop?.state !== 'sim') {
      me.root.position.set(P.x, P.gy + P.y - landT * 0.12, P.z);
      me.root.rotation.set(0, P.yaw, 0);
    }
    if (P.mode === 'drive' && cart.car && !flop) {
      /* seated above */
    } else if (flop) {
      if (flop.state === 'sim' && !splashed) {
        const h = flop.hips(_hp);
        if (Math.hypot(h.x, h.z) < 2.85 && h.y < 0.95) {
          splashed = true;
          sfx.splash(0.8);
          toast('Splash!', 1200);
        }
      }
      const alive = flop.update(
        dt,
        (x, z, yaw) => {
          [P.x, P.z] = clearSpot(x, z);
          P.yaw = yaw;
          P.gy = groundY(P.x, P.z);
          me.root.position.set(P.x, P.gy, P.z);
          me.root.rotation.y = P.yaw;
          P.phase = 0;
          sendPres(true);
        },
        myPose,
      );
      if (!alive) flop = null;
    } else if (P.mode === 'bj' && bjGame.isOpen()) bjGame.seatGolfer(me, bjGame.mySeat(), clock);
    else if (P.mode === 'vlt' && vlt.isOpen()) vlt.seatMe(me, clock);
    else {
      myPose();
      if (gest && gest.i < 3 && P.mode === 'walk') gestureOn(me, gest.i, clock - gest.t0);
    }
    // remotes: ease toward their reported state, animate with their speed
    for (const r of remotes.values()) {
      const k = 1 - Math.exp(-dt * 8);
      r.x += (r.tx - r.x) * k;
      r.z += (r.tz - r.z) * k;
      let d = r.tyaw - r.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.yaw += d * k;
      const moving = Math.hypot(r.tx - r.x, r.tz - r.z) > 0.05 || r.spd > 0.1;
      r.aspd += ((moving ? Math.max(r.spd, 1.2) : 0) - r.aspd) * (1 - Math.exp(-dt * 6));
      const sp = r.aspd;
      const st = stepLength(sp);
      r.y += (r.ty - r.y) * Math.min(1, dt * 14);
      const stepWas = r.phase;
      if (r.y < 0.02) r.phase += ((dt * sp) / st) * Math.PI;
      const away = !!r.pres?.g;
      r.golfer.root.visible = !away;
      const rPose = () =>
        r.golfer.update({ mode: 'walk', speed: sp, phase: r.phase, air: r.y > 0.05 ? 1 : 0, time: clock, s: 0, club: 'iron', showClub: false });
      const cs = !away ? cleanVeh(r.pres?.car) : null; // their cart, if it's out
      if (cs && pw) {
        if (r.cart && r.cart.kind !== cs.k) {
          r.cart.dispose();
          r.cart = null;
        }
        if (!r.cart) r.cart = vehicleKind(cs.k).make(pw, scene, colorFor(r.by), false);
        r.cart.follow(cs, dt);
        r.cart.contacts?.().forEach((c, i) => grass.press(r.peer + 'c' + i, c.x, c.z, 0.35));
      } else if (r.cart) {
        r.cart.dispose();
        r.cart = null;
      }
      const riding = !!(r.pres?.dr && r.cart && !r.flop);
      {
        // their radio, heard from where their cart is
        const rd = r.pres?.rd;
        if (r.cart && Array.isArray(rd) && Number.isInteger(rd[0]) && rd[0] >= 0 && rd[0] < 10) {
          const cp = r.cart!.root.position,
            dx = cp.x - camera.position.x,
            dz = cp.z - camera.position.z,
            e = camera.matrixWorld.elements,
            dist = Math.hypot(cp.x - P.x, cp.z - P.z);
          radioSrc.push({
            id: r.peer,
            band: rd[0],
            vol: clamp(+rd[1] || 0, 0, 1),
            mine: false,
            dist,
            pan: (dx * e[0] + dz * e[2]) / (Math.hypot(dx, dz) + 4),
          });
        }
      }
      if (!away && !riding && sp > 0.5 && Math.floor(stepWas / Math.PI) !== Math.floor(r.phase / Math.PI))
        ambience.step(surfaceOf(r.x, r.z), Math.min(1, sp / 6.4), { pos: tmp.set(r.x, 0.1, r.z), cam: camera }); // their footsteps, from where they are
      if (r.cart && !riding && !flop && P.mode === 'walk' && Math.abs(r.cart.speed()) > 3.5 && inCartBox(r.cart, P.x, P.z, 0.2))
        knockMe(_hp.set(1, 0, 0).applyQuaternion(r.cart.root.quaternion).multiplyScalar(r.cart.speed()).clone());
      if (riding) {
        r.x = r.tx;
        r.z = r.tz;
        ride(r.golfer, r.cart!);
      } else if (r.flop?.state !== 'sim') {
        r.gy += (groundY(r.x, r.z) - r.gy) * (1 - Math.exp(-dt * 18));
        r.golfer.root.position.set(r.x, r.gy + r.y, r.z);
        r.golfer.root.rotation.set(0, r.yaw, 0);
      }
      if (r.flop) {
        if (
          !r.flop.update(
            dt,
            (x, z, yaw) => {
              r.x = x;
              r.z = z;
              r.yaw = yaw;
              r.gy = groundY(x, z);
              r.golfer.root.position.set(x, r.gy, z);
              r.golfer.root.rotation.y = yaw;
            },
            rPose,
          )
        )
          r.flop = null;
      } else if (!away && !riding) {
        const bs = r.pres?.bj?.s;
        if (typeof bs === 'number' && bs >= 0 && bs < 5) bjGame.seatGolfer(r.golfer, bs, clock);
        else if (typeof r.pres?.vm === 'number') vlt.seatGolfer(r.golfer, r.pres.vm, clock);
        else {
          rPose();
          // their gesture, timed from when we first saw it
          const ge = r.pres?.ge;
          if (Array.isArray(ge) && Number.isInteger(ge[0]) && ge[0] >= 0 && ge[0] <= 3) {
            let gs = gestSeen.get(r.peer);
            if (!gs || gs.n !== ge[1]) {
              gestSeen.set(r.peer, (gs = { n: +ge[1] || 0, i: ge[0], t0: clock }));
              if (ge[0] === 3) r.golfer.playOnce('cheer');
            }
            if (gs.i < 3) gestureOn(r.golfer, gs.i, clock - gs.t0);
          }
        }
      }
      const tp = r.flop?.state === 'sim' ? r.flop.hips(_hp) : null;
      placeTag(r.tag, tp ? tp.x : r.x, tp ? tp.y + 0.9 : 2.05, tp ? tp.z : r.z, !away);
      const bt = ((r.bub as any)._t || 0) - dt;
      (r.bub as any)._t = bt;
      placeTag(r.bub, r.x, 2.45, r.z, bt > 0 && !away);
    }
    myBubT -= dt;
    placeTag(myTag, P.x, 2.45, P.z, myBubT > 0);
    // camera: third person behind the golfer; the wardrobe swings round to the front
    // close-up: the projection is shifted so the machine sits left of centre, clear of the controls on the right
    const wantOff = P.mode === 'gacha' && innerWidth > 700 ? 0.17 : 0;
    gOff += (wantOff - gOff) * (1 - Math.exp(-dt * 5));
    if (gOff > 0.002) camera.setViewOffset(innerWidth, innerHeight, innerWidth * gOff, 0, innerWidth, innerHeight);
    else if (camera.view?.enabled) camera.clearViewOffset();
    if (P.mode === 'build') build.update(dt, camPos, camLook);
    else if (P.mode === 'bj' || P.mode === 'vlt') {
      if (P.mode === 'vlt') {
        vlt.camTargets(bjCam, bjLook);
        // on the way to your own eyes the camera passes through your head: you're drawn once it has arrived
        me.root.visible = vlt.fov() === 50 || camPos.distanceTo(bjCam) < 0.035;
      } else bjGame.camTargets(bjCam, bjLook);
      camPos.lerp(bjCam, 1 - Math.exp(-dt * 4));
      camLook.lerp(bjLook, 1 - Math.exp(-dt * 5));
      const wantFov = P.mode === 'vlt' ? vlt.fov() : 50;
      if (Math.abs(camera.fov - wantFov) > 0.05) {
        camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 4));
        camera.updateProjectionMatrix();
      }
    } else if (P.mode === 'gacha') {
      camPos.lerp(gCam, 1 - Math.exp(-dt * 4));
      camLook.lerp(gLook, 1 - Math.exp(-dt * 5));
      if (Math.abs(camera.fov - 50) > 0.05) {
        camera.fov += (50 - camera.fov) * (1 - Math.exp(-dt * 4));
        camera.updateProjectionMatrix();
      }
    } else if (P.mode === 'wardrobe') {
      const a = wardrobe.cam();
      tmp.set(P.x + Math.sin(a) * 2.9, P.gy + 1.3, P.z + Math.cos(a) * 2.9); // (the shops stand up on the West Side's rise)
      camPos.lerp(tmp, 1 - Math.exp(-dt * 5));
      camLook.lerp(new THREE.Vector3(P.x + Math.cos(a) * 0.75, P.gy + 1.05, P.z - Math.sin(a) * 0.75), 1 - Math.exp(-dt * 6)); // golfer sits left of the panel
    } else {
      // GTA-style chase camera: you aim it with the mouse; while you move and leave the mouse alone it swings back
      // in behind you. Slight over-the-shoulder offset, height follows jumps softly.
      if (P.spd > 1 && clock - P.lastLook > 1.2) {
        let d2 = P.yaw - P.camYaw;
        d2 = Math.atan2(Math.sin(d2), Math.cos(d2));
        P.camYaw += d2 * (1 - Math.exp(-dt * 1.4 * Math.min(1, P.spd / 3.7)));
      }
      const cy = P.camYaw,
        d = P.camDist * (1 + 0.12 * clamp((P.aspd - 3.7) / 2.7, 0, 1)),
        cp = Math.cos(P.camPitch),
        rx = Math.cos(cy),
        rz = -Math.sin(cy),
        sh = 0.42;
      const lim = flop?.state === 'sim' ? flop.hips(_hp) : null,
        ox = lim ? lim.x : P.x,
        oz = lim ? lim.z : P.z;
      const fy = lim ? Math.max(P.gy, lim.y - 0.9) : P.gy + P.y * 0.6;
      if (lim) {
        flopCam.lerp(_hp.set(ox, fy, oz), 1 - Math.exp(-dt * 6));
      } else flopCam.set(P.x, fy, P.z);
      const CX = lim ? flopCam.x : P.x,
        CZ = lim ? flopCam.z : P.z,
        FY = lim ? flopCam.y : fy;
      tmp.set(CX - Math.sin(cy) * d * cp + rx * -sh, FY + 1.55 + Math.sin(P.camPitch) * d, CZ - Math.cos(cy) * d * cp + rz * -sh);
      // The camera is locked rigidly to the player: any follow lag here makes the character shake on screen whenever
      // frame times vary. It only eases when coming back from the wardrobe view.
      const look2 = new THREE.Vector3(CX + rx * -sh, FY + 1.45, CZ + rz * -sh);
      camClamp(look2, tmp, dt);
      if (camEase > 0) {
        camEase -= dt;
        camPos.lerp(tmp, 1 - Math.exp(-dt * 8));
        camLook.lerp(look2, 1 - Math.exp(-dt * 8));
      } else {
        camPos.copy(tmp);
        camLook.copy(look2);
      }
      const wantFov = 55 + 6 * clamp((P.aspd - 3.7) / 2.7, 0, 1) + (P.mode === 'drive' ? DRIVE_FX.fov : 0);
      P.fov += (wantFov - P.fov) * (1 - Math.exp(-dt * 4));
      if (Math.abs(camera.fov - P.fov) > 0.02) {
        camera.fov = P.fov;
        camera.updateProjectionMatrix();
      }
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    smoke.remotes(
      [...remotes].map(([id, r]) => ({
        id,
        golfer: r.golfer,
        yaw: r.yaw,
        sm: r.pres?.sm,
        visible: r.golfer.root.visible && !r.pres?.g && !r.pres?.dr,
      })),
    );
    smoke.update(dt, camera);
    if (P.mode !== 'bj' && P.mode !== 'vlt') smoke.sway(camera);
    vlt.update(dt, clock);
    vlt.setTaken([...remotes.values()].map(r => (typeof r.pres?.vm === 'number' ? r.pres.vm : -1)));
    gacha.update(dt);
    bjGame.update(dt, camera);
    garden.update(dt);
    garden.remotes([...remotes].map(([id, r]) => ({ id, golfer: r.golfer, yaw: r.yaw, hd: r.pres?.hd })));
    if (MY?.mailFlag) {
      const up = mail.unread() > 0,
        want = up ? 0 : Math.PI / 2;
      MY.mailFlag.rotation.x += (want - MY.mailFlag.rotation.x) * Math.min(1, dt * 6);
    }
    dealer.update(dt, clock, camera);
    staff.update(clock, P.x, P.z);
    strollers.update(clock, camera);
    {
      // everyone the town's walkers and drivers should give way to: me (or my car), the other players, the van
      const mine =
          P.mode === 'drive' && cart.car
            ? { x: cart.car.root.position.x, z: cart.car.root.position.z, spd: Math.abs(cart.car.speed()) }
            : { x: P.x, z: P.z, spd: P.spd },
        vn = west.van();
      life.update(dt, clock, camera, [
        mine,
        ...[...remotes.values()].map(r => ({ x: r.x, z: r.z, spd: r.cart ? Math.abs(r.cart.speed()) : 0 })),
        { x: vn.x, z: vn.z, spd: vn.v },
      ]);
      // a town car that catches you on foot at speed knocks you down, the same as a player's would
      if (!flop && P.mode === 'walk')
        for (const c of life.cars())
          if (Math.abs(c.speed()) > 3.5 && inCartBox(c, P.x, P.z, 0.2)) {
            knockMe(_hp.set(1, 0, 0).applyQuaternion(c.root.quaternion).multiplyScalar(c.speed()).clone());
            break;
          }
    }
    {
      const car = P.mode === 'drive' && cart.car?.kind === 'kart' ? cart.car : null;
      fun.update(
        dt,
        clock,
        P.mode === 'drive' && cart.car ? cart.car.root.position : null,
        car ? _eul.setFromQuaternion(car.root.quaternion, 'YXZ').y : 0,
      );
      if ((rivalT -= dt) <= 0) {
        rivalT = 1;
        putt.setOthers(
          [...remotes.values()]
            .filter(r => !r.pres?.g && Array.isArray(r.pres?.mp) && r.pres!.mp!.length === 4 && r.pres!.mp!.every(v => Number.isFinite(v)))
            .slice(0, 6)
            .map(r => ({
              name: pf?.names.get(r.by) || 'Golfer',
              color: colorFor(r.by),
              mp: r.pres!.mp!.map(v => clamp(+v, -30000, 30000)) as [number, number, number, number],
            })),
        );
        fun.setRivals(
          [...remotes.values()]
            .filter(r => !r.pres?.g && +(r.pres?.kb || 0) > 0)
            .map(r => ({ name: pf?.names.get(r.by) || 'Golfer', t: +(r.pres?.kb || 0) })),
        );
      }
    }
    putt.update(dt);
    range.update(dt);
    // Draw distance. From Fun Land or the hills the whole town is in view at once: about 1,400 separate objects, each
    // drawn twice (once more for shadows). Small things can't be seen from that far, so each top-level object under
    // 12 m across stops being drawn once it's farther than 55 m plus three times its size
    // (a bench goes at about 58 m, a whole lot at about 85 m).
    radioFrame(dt);
    west.update(dt, [P, ...remotes.values(), ...life.movers()]);
    tickWater(clock);
    batcher.update(dt);
    if ((cullT -= dt) <= 0) {
      cullT = 0.25;
      const cp = camera.position;
      for (const o of scene.children) {
        if ((o as any).isMesh) continue; // loose meshes are left to the batcher
        const u = o.userData;
        if (u.cullR === undefined || (u.cullR === 0 && u.cullTry < 8)) {
          _cb.setFromObject(o);
          u.cullTry = (u.cullTry || 0) + 1;
          if (_cb.isEmpty()) u.cullR = 0;
          else {
            _cb.getBoundingSphere(_cs);
            u.cullR = _cs.radius > 12 || _cb.max.y > 16 || o.name === 'funland' || o.name === 'westrise' || o.name === 'lobbyTrees' ? -1 : _cs.radius;
            u.cullOff = _cs.center.clone().sub(o.position);
            if (u.cullR > 0) {
              // far away, the object reads as not visible whatever its own flag says; the flag itself is kept
              let own = o.visible;
              Object.defineProperty(o, 'visible', { get: () => own && !u.cullFar, set: (v: boolean) => void (own = v), configurable: true });
            }
          }
        }
        if (!(u.cullR > 0)) continue;
        const d = Math.hypot(o.position.x + u.cullOff.x - cp.x, o.position.z + u.cullOff.z - cp.z),
          far = d > 55 + u.cullR * 3 + (u.cullFar ? -6 : 0);
        u.cullFar = far;
      }
    }
    {
      // while putting, the park fence fades so it can't block the view (the golfer stays solid: the user's call)
      const on = P.mode === 'putt';
      puttFade += ((on ? 1 : 0) - puttFade) * Math.min(1, dt * 6);
      fun.fenceOpacity(1 - 0.88 * puttFade);
    }
    // wildlife: birds and the cat keep clear of anyone coming at them
    scarers.length = 0;
    scarers.push({ x: P.x, z: P.z, spd: P.mode === 'drive' && cart.car ? Math.abs(cart.car.speed()) : P.spd });
    for (const r of remotes.values()) scarers.push({ x: r.x, z: r.z, spd: r.cart ? Math.abs(r.cart.speed()) : r.aspd || 0 });
    for (const w of strollers.who) scarers.push({ x: w.x, z: w.z, spd: w.speed });
    critters.update(dt, camera, scarers);
    if (me.root.visible) grass.press('me', me.root.position.x, me.root.position.z, 0.5);
    for (const [id, r] of remotes) if (r.golfer.root.visible) grass.press(id, r.golfer.root.position.x, r.golfer.root.position.z, 0.5);
    grass.update(dt, camera.position);
    fountain.update(clock);
    showControls();
    light.sun.castShadow = opts.shadows;
    ambience.update(dt, {
      zone: 'town',
      cam: camera,
      fountain: FOUNTAIN_AT,
      cart:
        P.mode === 'drive' && cart.car
          ? {
              speed: cart.car.speed(),
              drift: cart.car.drifting?.() || 0,
              kart: cart.car.kind === 'kart',
              engine: cart.car.engine?.() || null,
              throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
            }
          : null,
      duck: P.mode === 'bj' || P.mode === 'stash' ? 0.5 : 0,
      carts: [...remotes.values()].filter(r => r.cart).map(r => ({ pos: r.cart!.root.position, speed: r.cart!.speed() })),
    });
    me.root.visible = P.mode !== 'gacha' && P.mode !== 'putt' && P.mode !== 'range'; // the close-up camera stands where the golfer is: hide them while using the machine
    snapSun(light.sun, light.SUN_DIR, camLook, 150);
    light.sky.position.copy(camera.position);
    light.sunDisc.position.copy(camera.position).addScaledVector(light.SUN_DIR, 1200);
    light.sunDisc.lookAt(camera.position);
    const n = P.mode === 'walk' ? nearest() : null;
    const cpr = !flop ? cartPrompt() : '';
    setPrompt(
      cpr || (n ? `<kbd>E</kbd> ${esc(n.label)}${(n as any).extra || ''}` : P.mode === 'walk' && !flop && onMyLot() ? '<kbd>B</kbd> Build Mode' : ''),
    );
    if (tee.isOpen()) tee.render();
    sendPres();
    renderer.render(scene, camera);
  }
  function start(o: { returning?: boolean } = {}) {
    options.context('In town', () => []);
    setTimeout(() => mail.check(), 2500);
    active = true;
    last = performance.now();
    document.body.classList.add('mode-lobby');
    resize();
    if (o.returning) {
      P.x = (Math.random() - 0.5) * 4;
      P.z = -5.2;
      P.yaw = 0;
      P.camYaw = 0;
      freeSpot();
      toast('Welcome back to Golden Hills.');
    }
    camPos.set(P.x, 6, P.z + 8);
    tee.reset();
    sendPres(true);
    renderStatus();
    (window as any).__lobby = {
      camera,
      renderer,
      scene,
      ballPreview,
      BALLS,
      smoke,
      build,
      tryBuild,
      P,
      openBJ,
      bjGame,
      sendPres,
      garden,
      dealer,
      plotDocs,
      refreshPlots,
      openPanel,
      remotes,
      goLimp,
      get MY() {
        return MY;
      },
      openCollection,
      get flop() {
        return flop;
      },
      get pw() {
        return pw;
      },
      plots,
      get me() {
        return me;
      },
      get look() {
        return look;
      },
      openWardrobe,
      openTee: tee.open,
      get pf() {
        return pf;
      },
    };
  }
  function stop() {
    if (vlt.isOpen()) vlt.leave();
    if (bjGame.isOpen()) {
      bjGame.leave(true);
      if (P.mode === 'bj') P.mode = 'walk';
    }
    if (P.mode === 'drive') {
      P.mode = 'walk';
      me.root.rotation.set(0, P.yaw, 0);
    }
    radio.stopAll(); // the cart radio stays in town
    if (range.active) range.stop();
    if (putt.active) putt.stop(); // and a mini putt round ends: its ball, aim line, meter and card all go
    cart.dispose(); // heading to the course: the cart goes home
    active = false;
    document.body.classList.remove('mode-lobby');
    closeModal();
    $('lward').classList.add('hidden');
    setPrompt('');
  }
  /** While in golf, tell the lobby so others see "on the course". */
  function setAway(matchId: string | null) {
    if (!pf?.room) return;
    const pr: any = JSON.parse(lastPres || '{}');
    pr.v = 2;
    pr.bj = undefined;
    pr.car = undefined;
    pr.dr = undefined;
    pr.g = matchId || undefined;
    pr.q = undefined;
    pr.go = undefined;
    pr.o = look;
    lastPres = JSON.stringify(pr);
    Promise.resolve(pf.room.presence(pr)).catch(() => {});
  }
  return {
    start,
    stop,
    tick,
    ready,
    setAway,
    get look() {
      return look;
    },
    get platform() {
      return pf;
    },
  };
}
