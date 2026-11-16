// Your golf cart in town: out of your garage, driven around, parked again. This owns the cart itself; the lobby's
// frame drives it (input, crashes, running people over) and publishes its state. Other players' carts are plain
// vehicles the lobby keeps per remote player.
import * as THREE from 'three';
import { VEHICLES, cleanKind, myVehicleKind, type Vehicle, type VehState } from '../vehicles/vehicles';
import { progress } from '../avatar/progress';
import { toWorld, BOUND, type Plot, type Collider } from './world';
import type { Placed } from './build';
import type { Golfer } from '../characters/golfer';
import type { PhysWorld } from '../physics/ragdoll';

export interface CartHost {
  scene: THREE.Scene;
  plots: Plot[];
  colliders: Collider[];
  /** The lobby's player state. */
  P: {
    x: number;
    z: number;
    yaw: number;
    vx: number;
    vz: number;
    spd: number;
    aspd: number;
    mode: string;
    camYaw: number;
    camDist: number;
    lastLook: number;
  };
  pw(): PhysWorld | null;
  myPlot(): Plot | null;
  me(): Golfer;
  clock(): number;
  layoutOf(uid: string | null): Placed[];
  hitAt(x: number, z: number, r?: number): unknown;
  lotGroup(lot: number): THREE.Object3D | null | undefined;
  /** Is this player's cart out of their garage right now? */
  cartOut(owner: string): boolean;
  clearKeys(): void;
  sendPres(): void;
  toast(html: string, ms?: number): void;
  thud(): void;
}
const _cv = new THREE.Vector3(),
  _q1 = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  UP = new THREE.Vector3(0, 1, 0),
  clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Which way a cart is pointing. */
export const cartYaw = (c: Vehicle) => {
  const f = _cv.set(1, 0, 0).applyQuaternion(c.root.quaternion);
  return Math.atan2(f.x, f.z);
};
/** Another player's published cart state, made safe. */
export const cleanVeh = (v: any): VehState | null => {
  if (!v || typeof v !== 'object' || !Array.isArray(v.p) || !Array.isArray(v.q) || v.p.length < 3 || v.q.length < 4) return null;
  const n = (x: any, a: number) => clamp(+x || 0, -a, a);
  return {
    k: cleanKind(v.k),
    p: v.p.slice(0, 3).map((x: any) => n(x, BOUND + 160)),
    q: v.q.slice(0, 4).map((x: any) => n(x, 1)),
    s: n(v.s, 40),
    st: n(v.st, 1),
  };
};

export function createLobbyCart(host: CartHost) {
  const P = host.P;
  let car: Vehicle | null = null,
    carStuck = '';
  /** Where the cart parks in this lot's garage (world), facing out of the door; null without a garage. */
  function garageOf(p: Plot | null) {
    if (!p) return null;
    const it = host.layoutOf(p.owner).find(i => i.k === 'garage');
    if (!it) return null;
    const lx = it.x - 0.1 * Math.sin(it.r),
      lz = it.z - 0.1 * Math.cos(it.r),
      [x, z] = toWorld(p, lx, lz);
    return { x, z, yaw: p.yaw + it.r };
  }
  function takeCart() {
    const g = garageOf(host.myPlot());
    if (!g) {
      host.toast('Build a cart garage on your lot first (B → Garage).');
      return;
    }
    if (!host.pw()) {
      host.toast('One moment…');
      return;
    }
    const mine = myVehicleKind(progress());
    if (car && car.kind !== mine.kind) {
      car.dispose(); // a different car since last time (the auto shop): the old one goes
      car = null;
    }
    if (!car) {
      car = mine.make(host.pw()!, host.scene, host.myPlot()!.color, true);
      car.placeAt(g.x, 0.12, g.z, g.yaw);
    }
    enterCart();
  }
  /** Fun Land's kart stand: your cart appears there (it comes from your garage if it was out). */
  function rentCart(x: number, z: number, yaw: number) {
    if (!host.pw()) {
      host.toast('One moment…');
      return;
    }
    if (car && car.kind !== 'kart') {
      car.dispose(); // your golf cart goes home; the track lends you a kart
      car = null;
    }
    if (!car) car = VEHICLES.kart.make(host.pw()!, host.scene, host.myPlot()?.color || '#c8452f', true);
    car.placeAt(x, 0.12, z, yaw);
    carStuck = '';
    enterCart();
  }
  function enterCart() {
    if (!car) return;
    if (document.pointerLockElement) document.exitPointerLock();
    P.mode = 'drive';
    P.vx = P.vz = 0;
    host.clearKeys();
    P.camYaw = cartYaw(car);
    P.camDist = 6.4;
    P.lastLook = -9;
    host.sendPres();
  }
  function hopOut() {
    if (!car) return;
    const p = car.root.position,
      y = cartYaw(car),
      g = garageOf(host.myPlot());
    const OUT = (car.half?.[1] ?? 0.7) + 0.85; // (clear of the body, however wide it is)
    let x = p.x + Math.cos(y) * OUT,
      z = p.z - Math.sin(y) * OUT;
    if (host.hitAt(x, z, 0.35)) {
      x = p.x - Math.cos(y) * OUT;
      z = p.z + Math.sin(y) * OUT;
    }
    P.x = x;
    P.z = z;
    P.yaw = y;
    P.spd = P.aspd = 0;
    P.mode = 'walk';
    P.camDist = 4.6;
    host.me().root.rotation.set(0, y, 0);
    if (g && Math.hypot(p.x - g.x, p.z - g.z) < 1.8 && Math.abs(car.speed()) < 1.5) parkCart(false);
    host.sendPres();
  }
  function parkCart(say = true) {
    if (!car) return;
    const wasKart = car.kind === 'kart';
    car.dispose();
    car = null;
    carStuck = '';
    if (say) host.toast(wasKart ? 'Kart returned to the track.' : 'Your cart is back in the garage.');
    host.sendPres();
  }
  function flipCart() {
    if (!car) return;
    const p = car.root.position;
    car.placeAt(p.x, 0.6, p.z, cartYaw(car));
    carStuck = '';
    host.thud();
  }
  /** E near your cart or your garage. Returns true if it handled the key. */
  function cartInteract() {
    if (car && Math.hypot(car.root.position.x - P.x, car.root.position.z - P.z) < 3) {
      if (carStuck) {
        flipCart();
        return true;
      }
      if (Math.abs(car.speed()) < 3) {
        enterCart();
        return true;
      }
    }
    const g = garageOf(host.myPlot());
    if (g && Math.hypot(g.x - P.x, g.z - P.z) < 4.2) {
      if (car) parkCart();
      else takeCart();
      return true;
    }
    return false;
  }
  function cartPrompt() {
    if (P.mode === 'drive') return carStuck ? '<kbd>E</kbd> Flip the cart back over' : ''; // (the controls panel lists the driving keys)
    if (car && Math.hypot(car.root.position.x - P.x, car.root.position.z - P.z) < 3)
      return carStuck ? '<kbd>E</kbd> Flip the cart back over' : '<kbd>E</kbd> Drive your cart';
    const g = garageOf(host.myPlot());
    if (g && Math.hypot(g.x - P.x, g.z - P.z) < 4.2)
      return car ? '<kbd>E</kbd> Send your cart back to the garage' : '<kbd>E</kbd> Take your cart out';
    return '';
  }
  /** Seat a golfer in a cart, hands on the wheel. */
  function ride(g: Golfer, c: Vehicle) {
    c.root.updateMatrixWorld(true);
    c.seatParent.updateMatrixWorld(true);
    g.root.position.copy(c.seat).applyMatrix4(c.seatParent.matrixWorld);
    g.root.quaternion.copy(c.seatParent.getWorldQuaternion(_q1)).multiply(_q2.setFromAxisAngle(UP, c.riderYaw));
    const gr = c.grips?.(),
      w = (v: THREE.Vector3) => c.seatParent.localToWorld(v.clone());
    g.update({
      mode: 'sit',
      s: 0,
      club: 'iron',
      time: host.clock(),
      turn: -c.steering(),
      ik: gr ? { hands: [w(gr.hands[0]), w(gr.hands[1])], feet: [w(gr.feet[0]), w(gr.feet[1])] } : undefined,
    } as any);
  }
  // physics bodies for placed items (so carts bump into them), kept in step with the lots
  const decoBodies = new Map<Collider, any>();
  let decoT = 0;
  function syncDecoPhysics(dt: number) {
    decoT -= dt;
    const pw = host.pw();
    if (!pw || decoT > 0) return;
    decoT = 0.4;
    const live = new Set<Collider>();
    for (const c of host.colliders)
      if (c.tag === 'deco') {
        live.add(c);
        if (!decoBodies.has(c))
          decoBodies.set(
            c,
            pw.box((c.x0 + c.x1) / 2, 0.6, (c.z0 + c.z1) / 2, Math.max(0.05, (c.x1 - c.x0) / 2), 0.6, Math.max(0.05, (c.z1 - c.z0) / 2)),
          );
      }
    for (const [c, b] of decoBodies)
      if (!live.has(c)) {
        try {
          pw.world.removeCollider(b, false);
        } catch {}
        decoBodies.delete(c);
      }
  }
  /** The parked cart in each garage hides while its owner is out driving. */
  function syncParked() {
    for (const p of host.plots) {
      const g = host.lotGroup(p.lot);
      if (!g) continue;
      const out = p === host.myPlot() ? !!car : !!p.owner && host.cartOut(p.owner);
      if (!!g.userData.carOut !== out) {
        g.userData.carOut = out;
        g.traverse(o => {
          if (o.userData.parkedCart) o.visible = !out;
        });
      }
    }
  }

  return {
    get car() {
      return car;
    },
    get stuck() {
      return carStuck;
    },
    set stuck(v: string) {
      carStuck = v;
    },
    garageOf,
    take: takeCart,
    rent: rentCart,
    enter: enterCart,
    hopOut,
    park: parkCart,
    flip: flipCart,
    interact: cartInteract,
    prompt: cartPrompt,
    ride,
    syncDecoPhysics,
    syncParked,
    /** Leaving the lobby: the cart goes home without a word. */
    dispose() {
      if (car) {
        car.dispose();
        car = null;
        carStuck = '';
      }
    },
  };
}
