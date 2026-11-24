// Lot games: cornhole and horseshoes, played at a set someone has put on their lot (catalog.ts), and the jukebox.
// A toss game is four throws from your end at the far end: A/D aim, hold Space for power, let go to throw.
//   · cornhole: a bag through the hole is 3, one left lying on the board is 1
//   · horseshoes: a ringer (round the stake) is 3, one within half a metre of it is 1
// Your best four-throw score at each is kept in this browser. Other players don't see your throws.
import * as THREE from 'three';
import { playSample } from '../audio/samples';

export type TossKind = 'cornhole' | 'horseshoes';
export interface TossHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  P: { x: number; z: number; mode: string; vx: number; vz: number };
  toast(html: string, ms?: number): void;
  ground(x: number, z: number): number;
}
/** The jukebox's ten bands (the cart radio's, in the same order). */
export const BAND_TAGS = ['TIKI FM', 'YACHT', 'HANG TEN', 'ITALO', 'CITY POP', 'OUTLAW', 'DUB', 'SPACE', 'BIG BAND', 'THE STATIC'];

const THROWS = 4,
  SWEEP = 1.15;

export function createLotGames(host: TossHost) {
  const P = host.P,
    hud = document.createElement('div'),
    bar = document.createElement('div');
  hud.style.cssText =
    'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:12;display:none;padding:9px 18px;border-radius:14px;background:rgba(22,16,10,.84);border:1px solid rgba(255,232,190,.2);color:#f6ecd8;font:800 19px "Barlow Condensed",Inter,sans-serif;letter-spacing:.04em;text-align:center;pointer-events:none;min-width:250px';
  bar.style.cssText =
    'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:12;display:none;width:300px;height:26px;border-radius:13px;background:rgba(22,16,10,.84);border:2px solid rgba(255,232,190,.55);overflow:hidden;pointer-events:none';
  bar.innerHTML =
    '<div style="position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#7ad06a,#ffd94a 55%,#ff7a3a 85%,#e2382c)"></div><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:800 14px Inter,sans-serif;text-shadow:0 1px 2px #000"></div>';
  document.body.append(hud, bar);
  const fill = bar.children[0] as HTMLElement,
    label = bar.children[1] as HTMLElement;
  const aimGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
    aim = new THREE.Line(aimGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
  aim.frustumCulled = false;
  aim.visible = false;
  host.scene.add(aim);
  const S = {
    on: false,
    kind: 'cornhole' as TossKind,
    phase: 'aim' as 'aim' | 'power' | 'fly' | 'slide' | 'done',
    from: new THREE.Vector3(), // where you throw from
    target: new THREE.Vector3(), // the far board's hole, or the far stake
    board: null as THREE.Object3D | null, // the far cornhole board
    yaw: 0,
    pow: 0,
    t: 0,
    left: THROWS,
    score: 0,
    said: '',
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    cam: new THREE.Vector3(),
    look: new THREE.Vector3(),
    wait: 0,
    v0: 7,
    thing: null as THREE.Mesh | null,
  };
  const things: THREE.Mesh[] = [];
  const held = new Set<string>();
  const baseDir = new THREE.Vector3(),
    _v = new THREE.Vector3();
  const dir = () => _v.copy(baseDir).applyAxisAngle(new THREE.Vector3(0, 1, 0), S.yaw);
  function makeThing() {
    const m =
      S.kind === 'cornhole'
        ? new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.15), new THREE.MeshStandardMaterial({ color: '#c8452f', roughness: 0.9 }))
        : new THREE.Mesh(
            new THREE.TorusGeometry(0.085, 0.014, 6, 16, Math.PI * 1.6),
            new THREE.MeshStandardMaterial({ color: '#6a6a70', roughness: 0.5, metalness: 0.6 }),
          );
    m.castShadow = true;
    host.scene.add(m);
    things.push(m);
    return m;
  }
  function ready() {
    S.phase = 'aim';
    S.thing = makeThing();
    S.pos.copy(S.from);
    S.thing.position.copy(S.from);
  }
  /** Start at a set: `ends` are its two ends in the world, `tagged` the item's object (boards, holes and stakes). */
  function start(kind: TossKind, item: THREE.Object3D) {
    const ends: THREE.Vector3[] = [];
    let near = -1,
      far = 1;
    item.updateMatrixWorld(true);
    const d = kind === 'cornhole' ? 2.65 : 3.1;
    for (const sz of [-1, 1]) ends.push(item.localToWorld(new THREE.Vector3(0, 0, sz * d)));
    if (Math.hypot(P.x - ends[1].x, P.z - ends[1].z) < Math.hypot(P.x - ends[0].x, P.z - ends[0].z)) {
      near = 1;
      far = -1;
    }
    const a = ends[(near + 1) / 2],
      b = ends[(far + 1) / 2];
    baseDir.set(b.x - a.x, 0, b.z - a.z).normalize();
    S.kind = kind;
    S.from.set(a.x - baseDir.x * 0.8, host.ground(a.x, a.z) + 1.0, a.z - baseDir.z * 0.8);
    S.board = null;
    item.traverse(o => {
      if (kind === 'cornhole' && o.userData.hole === far) o.getWorldPosition(S.target);
      if (kind === 'cornhole' && o.userData.board === far) S.board = o;
      if (kind === 'horseshoes' && o.userData.stake === far) o.getWorldPosition(S.target);
    });
    if (kind === 'horseshoes') S.target.y = host.ground(S.target.x, S.target.z);
    // the throw that lands on the target at full… well, at about two thirds of the bar
    // (aimed a little short of the hole: a bag landing on the board slides on about that far)
    const ang = kind === 'cornhole' ? 0.6 : 0.45,
      D = Math.hypot(S.target.x - S.from.x, S.target.z - S.from.z) - (kind === 'cornhole' ? 0.4 : 0.15),
      dy = S.target.y - S.from.y;
    S.v0 = Math.sqrt((9.81 * D * D) / (2 * Math.cos(ang) ** 2 * (D * Math.tan(ang) - dy)));
    if (document.pointerLockElement) document.exitPointerLock();
    S.on = true;
    S.left = THROWS;
    S.score = 0;
    S.yaw = 0;
    S.said = kind === 'cornhole' ? 'Through the hole: 3 · on the board: 1' : 'Ringer: 3 · within half a metre: 1';
    P.mode = 'toss';
    P.vx = P.vz = 0;
    held.clear();
    hud.style.display = 'block';
    S.cam.copy(host.camera.position);
    S.look.copy(S.target);
    ready();
    addEventListener('keydown', onDown, true);
    addEventListener('keyup', onUp, true);
  }
  function stop(say = '') {
    S.on = false;
    aim.visible = false;
    hud.style.display = bar.style.display = 'none';
    for (const t of things.splice(0)) {
      host.scene.remove(t);
      t.geometry.dispose();
    }
    if (P.mode === 'toss') P.mode = 'walk';
    removeEventListener('keydown', onDown, true);
    removeEventListener('keyup', onUp, true);
    if (say) host.toast(say, 5000);
  }
  function toss() {
    if (S.phase !== 'power') return;
    const ang = S.kind === 'cornhole' ? 0.6 : 0.45,
      v = S.v0 * (0.55 + 0.9 * S.pow),
      d = dir();
    S.vel.set(d.x * Math.cos(ang) * v, Math.sin(ang) * v, d.z * Math.cos(ang) * v);
    S.phase = 'fly';
    S.t = 0;
    S.left--;
    playSample('tick', 0.5);
  }
  /** Height of the far board's top under (x, z), or null if not over it. */
  function boardTop(x: number, z: number) {
    if (!S.board) return null;
    const l = S.board.worldToLocal(new THREE.Vector3(x, 0, z));
    if (Math.abs(l.x) > 0.3 || Math.abs(l.z) > 0.6) return null;
    return S.board.localToWorld(new THREE.Vector3(l.x, 0.02, l.z)).y;
  }
  function settle() {
    // score where it came to rest
    let pts = 0;
    const dh = Math.hypot(S.pos.x - S.target.x, S.pos.z - S.target.z);
    if (S.kind === 'cornhole') {
      if (dh < 0.085) {
        pts = 3;
        S.said = 'In the hole! +3';
        S.thing!.visible = false;
      } else if (boardTop(S.pos.x, S.pos.z) !== null) {
        pts = 1;
        S.said = 'On the board. +1';
      } else S.said = dh < 1.5 ? 'Just off.' : 'Nowhere near.';
    } else {
      if (dh < 0.11) {
        pts = 3;
        S.said = 'RINGER! +3';
        S.thing!.position.set(S.target.x, S.target.y + 0.03, S.target.z);
      } else if (dh < 0.5) {
        pts = 1;
        S.said = 'Close counts. +1';
      } else S.said = 'No points.';
    }
    if (pts === 3) playSample('win', 0.5);
    S.score += pts;
    S.phase = 'done';
    S.wait = 1.4;
  }
  function onDown(e: KeyboardEvent) {
    if (!S.on || (e.target as HTMLElement)?.tagName === 'INPUT' || e.code === 'KeyC') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.code === 'Escape') return stop('You put the ' + (S.kind === 'cornhole' ? 'bags' : 'horseshoes') + ' down.');
    held.add(e.code);
    if (S.phase === 'aim' && e.code === 'Space' && !e.repeat) {
      S.phase = 'power';
      S.t = 0;
    }
  }
  function onUp(e: KeyboardEvent) {
    if (!S.on) return;
    e.stopImmediatePropagation();
    held.delete(e.code);
    if (e.code === 'Space') toss();
  }
  return {
    get active() {
      return S.on;
    },
    /** (tests) throw now at power p */
    testThrow(p: number) {
      if (S.phase !== 'aim') return;
      S.phase = 'power';
      S.pow = p;
      toss();
    },
    start,
    stop,
    update(dt: number) {
      if (!S.on) return;
      S.t += dt;
      const turn = (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0) - (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0);
      if (S.phase === 'aim' || S.phase === 'power') S.yaw = Math.max(-0.35, Math.min(0.35, S.yaw + turn * dt * (held.has('ShiftLeft') ? 0.05 : 0.2)));
      if (S.phase === 'power') {
        const k = (S.t / SWEEP) % 2;
        S.pow = Math.max(0.02, k < 1 ? k : 2 - k);
      }
      const t = S.thing!;
      if (S.phase === 'fly') {
        let left = Math.min(dt, 0.05);
        while (left > 1e-5 && S.phase === 'fly') {
          const h = Math.min(left, 1 / 240);
          left -= h;
          S.vel.y -= 9.81 * h;
          S.pos.addScaledVector(S.vel, h);
          const top = S.kind === 'cornhole' ? boardTop(S.pos.x, S.pos.z) : null,
            floor = top ?? host.ground(S.pos.x, S.pos.z) + (S.kind === 'cornhole' ? 0.02 : 0.03);
          if (S.pos.y <= floor && S.vel.y < 0) {
            S.pos.y = floor;
            S.vel.y = 0;
            // a bag on a board slides on a little; on grass it stops; a horseshoe skids in the sand
            const keep = top !== null ? 0.28 : S.kind === 'cornhole' ? 0.05 : 0.12;
            S.vel.x *= keep;
            S.vel.z *= keep;
            S.phase = 'slide';
            playSample('tick', 0.35);
          }
        }
        t.rotation.y += dt * 9;
      }
      if (S.phase === 'slide') {
        const hs = Math.hypot(S.vel.x, S.vel.z),
          k = hs > 1e-4 ? Math.max(0, hs - 2.2 * dt) / hs : 0;
        S.vel.x *= k;
        S.vel.z *= k;
        S.pos.x += S.vel.x * dt;
        S.pos.z += S.vel.z * dt;
        const top = S.kind === 'cornhole' ? boardTop(S.pos.x, S.pos.z) : null;
        S.pos.y = top ?? host.ground(S.pos.x, S.pos.z) + 0.02;
        // through the hole while sliding over it
        if (S.kind === 'cornhole' && Math.hypot(S.pos.x - S.target.x, S.pos.z - S.target.z) < 0.085) {
          S.vel.set(0, 0, 0);
          S.pos.copy(S.target);
        }
        if (hs < 0.05) settle();
      }
      t.position.copy(S.pos);
      if (S.phase === 'done' && (S.wait -= dt) <= 0) {
        if (S.left > 0) ready();
        else {
          const key = 'gh.toss.' + S.kind;
          let best = 0;
          try {
            best = +(localStorage.getItem(key) || 0) || 0;
            if (S.score > best) localStorage.setItem(key, String(S.score));
          } catch {}
          if (S.score > best) playSample('best', 0.5);
          stop(
            `<b>${S.score} points</b> from four${S.score > best ? (best ? ` · a new best (was ${best})` : ' · your first score') : ` · your best is ${best}`}.`,
          );
          return;
        }
      }
      // aim line along the ground, and the camera behind your shoulder (following the throw)
      const d = dir();
      aim.visible = S.phase === 'aim' || S.phase === 'power';
      if (aim.visible) {
        const pa = aimGeo.attributes.position as THREE.BufferAttribute,
          gy = host.ground(S.from.x, S.from.z) + 0.05;
        pa.setXYZ(0, S.from.x, gy, S.from.z);
        pa.setXYZ(1, S.from.x + d.x * 6, gy, S.from.z + d.z * 6);
        pa.needsUpdate = true;
      }
      const want = new THREE.Vector3(S.from.x - d.x * 2.6, S.from.y + 0.9, S.from.z - d.z * 2.6),
        tgt = S.phase === 'aim' || S.phase === 'power' ? S.target : S.pos;
      S.cam.lerp(want, 1 - Math.exp(-dt * 5));
      S.look.lerp(tgt, 1 - Math.exp(-dt * 6));
      host.camera.position.copy(S.cam);
      host.camera.lookAt(S.look);
      const showBar = S.phase === 'aim' || S.phase === 'power';
      bar.style.display = showBar ? 'block' : 'none';
      if (showBar) {
        fill.style.width = (S.phase === 'power' ? S.pow * 100 : 0).toFixed(1) + '%';
        label.textContent = S.phase === 'power' ? `${Math.round(S.pow * 100)}%` : 'Hold Space, let go to throw';
      }
      hud.innerHTML = `${S.kind === 'cornhole' ? 'CORNHOLE' : 'HORSESHOES'} &nbsp;·&nbsp; THROW ${Math.min(THROWS, THROWS - S.left + (showBar ? 1 : 0))} <span style="opacity:.6">of ${THROWS}</span> &nbsp;·&nbsp; ${S.score} PTS${S.said ? `<div style="font-size:15px;color:#ffd27a;margin-top:2px">${S.said}</div>` : ''}`;
    },
  };
}
