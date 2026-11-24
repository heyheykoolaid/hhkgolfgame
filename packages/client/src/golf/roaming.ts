// Getting around the course between shots (split out of golfMode.ts, Nov 15): walking to your ball, your own cart
// (driving it, crashing it, flipping it, hauling it out of a pond), running people over and being run over, and the
// prompt that says what E does. golfMode.ts owns the physics world, the avatars and the shot; this owns where you
// are (`W`) and your cart. Carts themselves are vehicles/vehicles.ts.
import * as THREE from 'three';
import { COURSE, heightAt, surfaceAt, clamp, treesNear, pondPd, WATER_Y, CART_SLOTS } from '@gh/shared';
import { myVehicleKind, insideVehicle, type Vehicle } from '../vehicles/vehicles';
import { hookWear, towIt } from '../vehicles/wear';
import { progress } from '../avatar/progress';
import { speedo } from '../ui/speedo';
import { Flop, type PhysWorld } from '../physics/ragdoll';
import type { GameNet } from '../net/types';
import { Skateboard, DECKS, type SkateWorld } from '../vehicles/skateboard';

export const cartYaw = (c: Vehicle) => {
  const f = new THREE.Vector3(1, 0, 0).applyQuaternion(c.root.quaternion);
  return Math.atan2(f.x, f.z);
};
export interface RoamHost {
  /** the round's state: phase, aim… (golfMode's S) */
  S: any;
  held: Set<string>;
  net(): GameNet;
  avatars: Map<string, any>;
  remoteCarts: Map<string, Vehicle>;
  scene: THREE.Scene;
  pw(): PhysWorld | null;
  uid(): string;
  clock(): number;
  /** tee-off order, for which parking slot is yours */
  order(): string[];
  colorFor(uid: string): string;
  myBall(): { x: number; z: number };
  toast(html: string, ms?: number): void;
  sfx: { land(v?: number): void; splash(v?: number): void; thud(v?: number): void; bonk(v?: number): void };
  flopMe(vel: THREE.Vector3, imp: THREE.Vector3, at?: string, tone?: number): void;
  el(id: string): HTMLElement;
  esc(s: string): string;
}

export function createRoaming(host: RoamHost) {
  const { S, held, avatars, remoteCarts, scene, toast, sfx, flopMe, myBall, colorFor, esc } = host,
    $ = host.el,
    net = {
      me: () => host.net().me(),
      players: () => host.net().players(),
      get sessionId() {
        return host.net().sessionId;
      },
    },
    turns = {
      get listOrder() {
        return host.order();
      },
    };
  const W = { x: 0, z: 0, gy: 0, yaw: 0, vx: 0, vz: 0, spd: 0, aspd: 0, phase: 0, camYaw: 0, camPitch: 0.32, lastLook: -9, prevSpd: 0 };
  let cart: Vehicle | null = null,
    cartSank = 0,
    cartSafe: { x: number; y: number; z: number; yaw: number } | null = null,
    safeT = 0,
    cartStuck: '' | 'flip' | 'water' = '';
  // ---- the skateboard (bought at the lobby's Pro Shop): K hops on and off while you're walking
  let skate: Skateboard | null = null,
    trickT = 0;
  const skWorld: SkateWorld = { ground: (x, z) => heightAt(x, z), blocked: (x, z) => walkBlocked(x, z), rails: [] };
  const deckId = () => {
    try {
      return localStorage.getItem('gh.deck') || 'natural';
    } catch {
      return 'natural';
    }
  };
  let trickPop: HTMLDivElement | null = null;
  function showTrick(html: string, big = false, ms = 1100) {
    if (!trickPop) {
      trickPop = document.createElement('div');
      trickPop.className = 'trickpop';
      document.body.appendChild(trickPop);
    }
    trickPop.innerHTML = html;
    trickPop.classList.toggle('big', big);
    trickPop.classList.add('show');
    trickT = ms / 1000;
  }
  function stepOff() {
    if (!skate) return;
    W.x = skate.x;
    W.z = skate.z;
    W.yaw = skate.yaw;
    W.vx = W.vz = W.spd = 0;
    scene.remove(skate.board);
    skate = null;
  }
  function toggleSkate() {
    if (skate) return stepOff();
    if (S.phase !== 'walk') return;
    if (!progress().items?.board) {
      toast('No skateboard yet: the Pro Shop in town sells them.', 2600);
      return;
    }
    skate = new Skateboard(deckId());
    scene.add(skate.board);
    skate.mount(W.x, W.z, W.yaw, W.spd, skWorld);
  }
  function spawnCart() {
    const pw = host.pw();
    if (!pw) return;
    cart?.dispose();
    const ord = [...new Set([...turns.listOrder, ...[...net.players().values()].map(p => p.uid).sort()])],
      i = Math.max(0, ord.indexOf(host.uid())),
      [x, z] = CART_SLOTS[i % CART_SLOTS.length];
    cart = myVehicleKind(progress()).make(pw, scene, colorFor(host.uid()), true); // your own car from the lobby, or the golf cart
    hookWear(cart, toast);
    cart.placeAt(x, heightAt(x, z) + 0.2, z, 0); // your own cart, in your parking slot behind the tee
  }
  /** Walk-blocking: tree trunks, ponds, carts. */
  function walkBlocked(x: number, z: number) {
    if (pondPd(x, z) < 0.95) return true;
    for (const t of treesNear(x, z)) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (0.3 * t.s + 0.35) ** 2) return true;
    for (const c of [cart, ...remoteCarts.values()]) {
      if (!c) continue;
      if (insideVehicle(c, x, z, 0.3)) return true;
    }
    return false;
  }
  function startWalking() {
    const a = avatars.get(net.sessionId);
    if (a) {
      W.x = a.root.position.x;
      W.z = a.root.position.z;
    }
    W.yaw = S.aimYaw;
    W.camYaw = S.aimYaw;
    W.vx = W.vz = 0;
    S.phase = 'walk';
  }
  function interact() {
    const me = net.me();
    if (!me) return;
    // flip / haul the cart out (from the driver's seat, or standing next to it)
    if (
      cart &&
      cartStuck &&
      (S.phase === 'drive' || (S.phase === 'walk' && Math.hypot(cart.root.position.x - W.x, cart.root.position.z - W.z) < 3.5))
    ) {
      const p = cart.root.position,
        y = cartYaw(cart);
      if (cartStuck === 'water' && cartSafe) cart.placeAt(cartSafe.x, cartSafe.y + 0.3, cartSafe.z, cartSafe.yaw);
      else cart.placeAt(p.x, heightAt(p.x, p.z) + 0.5, p.z, y);
      cartStuck = '';
      sfx.land(0.5);
      return;
    }
    if (S.phase === 'drive') {
      // hop out on the driver's side
      if (!cart) return;
      const p = cart.root.position,
        y = cartYaw(cart);
      const OUT = (cart.half?.[1] ?? 0.7) + 0.85; // (clear of the body, however wide it is)
      let x = p.x + Math.cos(y) * OUT,
        z = p.z - Math.sin(y) * OUT;
      if (walkBlocked(x, z)) {
        x = p.x - Math.cos(y) * OUT;
        z = p.z + Math.sin(y) * OUT;
      }
      W.x = x;
      W.z = z;
      W.yaw = y;
      W.vx = W.vz = 0;
      S.phase = 'walk';
      return;
    }
    if (S.phase !== 'walk') return;
    const b = myBall(),
      db = Math.hypot(b.x - W.x, b.z - W.z);
    if (db < 3.2 && !me.done) {
      S.phase = 'aim';
      S.autoFor = '';
      return;
    }
    if (cart && cart.root.position.distanceTo(new THREE.Vector3(W.x, cart.root.position.y, W.z)) < 2.8 && cart.speed() < 3) {
      S.phase = 'drive';
      W.camYaw = cartYaw(cart);
    }
  }
  function update(dt: number) {
    const pw = host.pw();
    const me = net.me(),
      meA = avatars.get(net.sessionId);
    const k = (c: string) => held.has(c);
    if ((trickT -= dt) <= 0) trickPop?.classList.remove('show');
    if (skate && (S.phase !== 'walk' || meA?.flop)) stepOff(); // (addressing the ball, or the cart: the board goes under your arm)
    // ---- on the board
    if (S.phase === 'walk' && skate) {
      const ev = skate.update(
        dt,
        {
          push: k('KeyW') || k('ArrowUp'),
          brake: k('KeyS') || k('ArrowDown'),
          steer: (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0),
          crouch: k('Space'),
          manual: k('ShiftLeft') || k('ShiftRight'),
        },
        skWorld,
      );
      const B = COURSE.bounds;
      skate.x = clamp(skate.x, B.x0 + 30, B.x1 - 30);
      skate.z = clamp(skate.z, B.z0 + 30, B.z1 - 30);
      W.x = skate.x;
      W.z = skate.z;
      W.yaw = skate.yaw;
      W.spd = Math.abs(skate.v);
      W.vx = Math.sin(skate.yaw) * skate.v;
      W.vz = Math.cos(skate.yaw) * skate.v;
      for (const e of ev) {
        if (e.kind === 'trick') showTrick(esc(e.name));
        else if (e.kind === 'combo') showTrick(`${esc(e.text)}<b>${e.pts.toLocaleString('en-US')}</b>`, true, 2400);
        else if (e.kind === 'bail') {
          const f = new THREE.Vector3(Math.sin(skate.yaw), 0, Math.cos(skate.yaw)),
            v = f.clone().multiplyScalar(Math.max(3, e.v));
          stepOff();
          flopMe(v, f.multiplyScalar(8 + e.v * 2).setY(9), 'Hips', 0.8);
          showTrick('Bail!');
          break;
        }
      }
    }
    // ---- on foot
    else if (S.phase === 'walk' && !meA?.flop) {
      let ix = 0,
        iz = 0;
      if (k('KeyW') || k('ArrowUp')) iz += 1;
      if (k('KeyS') || k('ArrowDown')) iz -= 1;
      if (k('KeyA') || k('ArrowLeft')) ix += 1;
      if (k('KeyD') || k('ArrowRight')) ix -= 1;
      const il = Math.hypot(ix, iz),
        target = il ? (k('ShiftLeft') || k('ShiftRight') ? 6.6 : 3.6) : 0,
        dir = Math.atan2(ix, iz) + W.camYaw;
      const acc = il ? 9 : 13;
      W.vx += ((il ? Math.sin(dir) * target : 0) - W.vx) * (1 - Math.exp(-dt * acc));
      W.vz += ((il ? Math.cos(dir) * target : 0) - W.vz) * (1 - Math.exp(-dt * acc));
      W.spd = Math.hypot(W.vx, W.vz);
      if (W.spd > 0.15) {
        let d = Math.atan2(W.vx, W.vz) - W.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        W.yaw += clamp(d, -dt * 13, dt * 13);
      }
      if (!walkBlocked(W.x + W.vx * dt, W.z)) W.x += W.vx * dt;
      else W.vx *= 0.2;
      if (!walkBlocked(W.x, W.z + W.vz * dt)) W.z += W.vz * dt;
      else W.vz *= 0.2;
      const B = COURSE.bounds;
      W.x = clamp(W.x, B.x0 + 30, B.x1 - 30);
      W.z = clamp(W.z, B.z0 + 30, B.z1 - 30);
    } else if (S.phase !== 'drive') W.spd = 0;
    W.gy = heightAt(W.x, W.z);
    // ---- the cart
    speedo(S.phase === 'drive' && cart ? cart : null);
    if (cart) {
      const driving = S.phase === 'drive';
      const inp = driving
        ? {
            throttle: (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0),
            steer: (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0),
            brake: k('Space'),
            boost: k('ShiftLeft') || k('ShiftRight'),
          }
        : { throttle: 0, steer: 0, brake: true };
      const lie = surfaceAt(cart.root.position.x, cart.root.position.z);
      cart.terrain = lie === 'path' || lie === 'tee' ? 0 : lie === 'fairway' ? 0.35 : lie === 'green' ? 0.2 : lie === 'sand' ? 1.4 : 1; // (cars mind the rough; the golf cart doesn't)
      cart.drive(dt, inp);
      const sp = Math.abs(cart.speed()),
        cp = cart.root.position;
      if (driving) {
        W.x = cp.x;
        W.z = cp.z;
        W.yaw = cartYaw(cart);
        W.spd = sp;
      }
      // crash: only a real smash throws you out (a hard stop from near full speed, e.g. head-on into a tree)
      if (driving && W.prevSpd - sp > 9 && W.prevSpd > 11) {
        const v = new THREE.Vector3(Math.sin(W.yaw), 0, Math.cos(W.yaw)).multiplyScalar(W.prevSpd * 0.8).setY(3);
        flopMe(v, v.clone().multiplyScalar(6), 'Spine1');
        toast('Wipeout!', 1200);
      }
      W.prevSpd = driving ? sp : 0;
      // stuck (on its side/roof, or in a pond): no reset — press E to flip it back onto its wheels / pull it out
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cart.root.quaternion).y,
        wet = pondPd(cp.x, cp.z) < 1 && cp.y < WATER_Y + 0.25;
      const was = cartStuck;
      cartStuck = wet ? 'water' : up < 0.45 && sp < 1.5 ? 'flip' : '';
      if (cartStuck === 'water' && was !== 'water') {
        sfx.splash(0.6);
        if (cart.kind.startsWith('car:')) {
          // a car in the pond: the tow truck takes it to the impound lot (vehicles/wear.ts); you're left on the bank
          const c = cart;
          if (S.phase === 'drive') {
            S.phase = 'walk';
            if (cartSafe) {
              W.x = cartSafe.x;
              W.z = cartSafe.z;
            }
          }
          cart = null;
          cartStuck = '';
          void towIt(c).then(msg => msg && toast(msg, 6000));
          setTimeout(() => c.dispose(), 1500);
          return;
        }
        toast('Splash! Press E to haul the cart out.', 2000);
      }
      // remember the last spot where it was upright on dry ground (that's where a soaked cart gets hauled back to)
      safeT -= dt;
      if (!wet && up > 0.9 && safeT <= 0) {
        safeT = 0.5;
        if (!cartSafe || Math.hypot(cartSafe.x - cp.x, cartSafe.z - cp.z) > 1.5) cartSafe = { x: cp.x, y: cp.y, z: cp.z, yaw: cartYaw(cart) };
      }
      if (cp.y < -40) {
        if (!cartSank) cartSank = host.clock();
        else if (host.clock() - cartSank > 1.5) {
          cartSank = 0;
          spawnCart();
        }
      }
      // running people over
      if (sp > 3.5 && pw)
        for (const [id, a] of avatars) {
          if (id === net.sessionId || a.flop || !a.root.visible || a.hitCD > host.clock()) continue;
          const l = cart.root.worldToLocal(a.root.position.clone());
          if (Math.abs(l.x) < 1.45 && Math.abs(l.z) < 0.85 && l.y > -1 && l.y < 2) {
            const v = cart.velocity(new THREE.Vector3());
            a.hitCD = host.clock() + 3;
            a.root.updateMatrixWorld(true);
            a.flop = new Flop(pw, a.golfer, {
              vel: v.clone().multiplyScalar(0.9).setY(2.5),
              impulse: v.clone().multiplyScalar(8).setY(10),
              at: 'Hips',
              tone: 0.04,
              rest: 0.1,
              onThud: x => sfx.thud(0.2 + 0.4 * x),
            });
            sfx.bonk(0.8);
            toast(`You ran over ${esc(net.players().get(id)?.name || 'a golfer')}!`, 1500);
          }
        }
    }
    // someone else's cart running me over
    if (meA && !meA.flop && (S.phase === 'walk' || S.phase === 'aim'))
      for (const c of remoteCarts.values()) {
        if (Math.abs(c.speed()) < 3.5) continue;
        const l = c.root.worldToLocal(meA.root.position.clone());
        if (Math.abs(l.x) < 1.45 && Math.abs(l.z) < 0.85 && l.y > -1 && l.y < 2) {
          const f = new THREE.Vector3(1, 0, 0).applyQuaternion(c.root.quaternion).multiplyScalar(c.speed());
          if (S.phase === 'aim') startWalking();
          flopMe(f.clone().multiplyScalar(0.9).setY(2.5), f.clone().multiplyScalar(8).setY(10), 'Hips');
          sfx.bonk(1);
          toast('Run over by a golf cart!', 1500);
          break;
        }
      }
    // prompt
    let pr = '';
    if (S.phase === 'walk' && me) {
      const b = myBall(),
        db = me.done ? Infinity : Math.hypot(b.x - W.x, b.z - W.z); // (holed out: no ball to walk to, but the cart is still yours)
      const nearCart = cart && Math.hypot(cart.root.position.x - W.x, cart.root.position.z - W.z) < 3.5;
      pr =
        nearCart && cartStuck
          ? `<kbd>E</kbd> ${cartStuck === 'water' ? 'Haul the cart out of the water' : 'Flip the cart back over'}`
          : db < 3.2
            ? '<kbd>E</kbd> Address your ball'
            : cart && Math.hypot(cart.root.position.x - W.x, cart.root.position.z - W.z) < 2.8
              ? `<kbd>E</kbd> Drive the ${cart.kind === 'cart' ? 'cart' : cart.name.toLowerCase()}${me.done ? '' : ` · your ball is ${Math.round(db * 1.0936)} yd away`}`
              : me.done
                ? ''
                : `Your ball: ${Math.round(db * 1.0936)} yd`; // (the controls panel lists the keys)
    } else if (S.phase === 'drive' && cartStuck)
      pr = `<kbd>E</kbd> ${cartStuck === 'water' ? 'Haul the cart out of the water' : 'Flip the cart back over'}`;
    else if (S.phase === 'drive') pr = '';
    const el = $('gprompt');
    if (el.innerHTML !== pr) el.innerHTML = pr;
    el.style.display = pr ? '' : 'none';
    const roam = S.phase === 'walk' || S.phase === 'drive';
    $('clubcard').style.display = roam ? 'none' : '';
  }
  return {
    W,
    get skate() {
      return skate;
    },
    /** what other players need to draw your board: Skateboard.pres() and the deck */
    skatePres: () =>
      skate
        ? [
            ...skate.pres(),
            Math.max(
              0,
              DECKS.findIndex(d => d.id === deckId()),
            ),
          ]
        : undefined,
    toggleSkate,
    get cart() {
      return cart;
    },
    /** the hole changed: the old physics world (and the cart in it) is gone */
    dropCart() {
      cart?.dispose();
      cart = null;
    },
    spawnCart,
    walkBlocked,
    startWalking,
    interact,
    update,
  };
}
