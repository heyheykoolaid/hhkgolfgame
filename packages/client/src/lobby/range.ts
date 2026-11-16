// The driving range (Fun Land). Step up to a bay, pick a club, aim, hold to charge and let go: the ball flies down the
// field with a tracer, the board tells you the carry and the total, and landing in a target ring scores. A session is
// ten balls; your best ten-ball score is kept in this browser. Other players don't see your shots yet.
import * as THREE from 'three';
import { ballMaterial, DEFAULT_BALL } from '../avatar/balls';
import { wakeAudio, sfxOut } from '../audio/ctx';
import { playSample } from '../audio/samples';

export interface RangeHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ballSkin(): string | undefined;
  P: { x: number; z: number; mode: string; vx: number; vz: number };
  toast(html: string, ms?: number): void;
  /** the range: where the bays are and the target rings (from funland.ts) */
  info(): { x: number; z0: number; z1: number; bays: number; targets: { x: number; z: number; r: number; pts: number }[] };
}
const YD = 1.0936,
  BALLS = 10,
  SWEEP = 1.1,
  // launch speed at full power (m/s), loft, how much it runs after landing
  CLUBS = [
    { name: 'Driver', v: 71, loft: 13, run: 0.55 },
    { name: '3 wood', v: 64, loft: 16, run: 0.5 },
    { name: '5 iron', v: 54, loft: 24, run: 0.4 },
    { name: '7 iron', v: 47, loft: 31, run: 0.32 },
    { name: '9 iron', v: 41, loft: 40, run: 0.22 },
    { name: 'Wedge', v: 34, loft: 50, run: 0.12 },
  ];

export function createRange(host: RangeHost) {
  const P = host.P,
    ball = new THREE.Mesh(new THREE.SphereGeometry(0.0214, 20, 14), ballMaterial(DEFAULT_BALL)),
    TR = 90,
    trailPos = new Float32Array(TR * 3),
    trailGeo = new THREE.BufferGeometry(),
    aimGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
    aim = new THREE.Line(aimGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.85 }));
  trail.frustumCulled = aim.frustumCulled = false;
  ball.castShadow = true;
  ball.visible = trail.visible = aim.visible = false;
  host.scene.add(ball, trail, aim);
  const hud = document.createElement('div');
  hud.style.cssText =
    'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:12;display:none;padding:9px 18px;border-radius:14px;background:rgba(22,16,10,.84);border:1px solid rgba(255,232,190,.2);color:#f6ecd8;font:800 19px "Barlow Condensed",Inter,sans-serif;letter-spacing:.04em;text-align:center;pointer-events:none;min-width:270px';
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:12;display:none;width:300px;height:26px;border-radius:13px;background:rgba(22,16,10,.84);border:2px solid rgba(255,232,190,.55);overflow:hidden;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.4)';
  bar.innerHTML =
    '<div style="position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#7ad06a,#ffd94a 55%,#ff7a3a 85%,#e2382c)"></div><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:800 14px \\"Barlow Condensed\\",Inter,sans-serif;letter-spacing:.05em;text-shadow:0 1px 2px #000"></div>';
  document.body.append(hud, bar);
  const barFill = bar.children[0] as HTMLElement,
    barText = bar.children[1] as HTMLElement;

  const S = {
    on: false,
    phase: 'aim' as 'aim' | 'power' | 'fly' | 'roll' | 'done',
    club: 0,
    yaw: 0, // radians off straight down the range (+ = left, toward -z… see dir())
    pow: 0,
    t: 0,
    left: BALLS,
    score: 0,
    said: '',
    tee: new THREE.Vector3(),
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    carry: 0,
    n: 0,
    cam: new THREE.Vector3(),
    look: new THREE.Vector3(),
    wait: 0,
  };
  const held = new Set<string>();
  const dir = () => new THREE.Vector3(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
  function thwack(hard: number) {
    const c = wakeAudio();
    if (!c) return;
    const o = c.createOscillator(),
      g = c.createGain(),
      t = c.currentTime;
    o.type = 'triangle';
    o.frequency.setValueAtTime(900 + hard * 700, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.07);
    g.gain.setValueAtTime(0.25 + hard * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g).connect(sfxOut(c));
    o.start(t);
    o.stop(t + 0.1);
  }
  function teeUp() {
    S.phase = 'aim';
    S.pos.copy(S.tee);
    S.vel.set(0, 0, 0);
    S.n = 0;
    ball.position.copy(S.tee);
    trail.visible = false;
  }
  function start() {
    const R = host.info(),
      bw = (R.z1 - R.z0) / R.bays,
      bay = Math.min(R.bays - 1, Math.max(0, Math.floor((P.z - R.z0) / bw)));
    if (document.pointerLockElement) document.exitPointerLock();
    ball.material = ballMaterial(host.ballSkin() || DEFAULT_BALL);
    S.tee.set(R.x, 0.085, R.z0 + (bay + 0.5) * bw);
    S.on = true;
    S.left = BALLS;
    S.score = 0;
    S.yaw = 0;
    S.said = 'Ten balls. Land them in the rings.';
    P.mode = 'range';
    P.vx = P.vz = 0;
    held.clear();
    ball.visible = true;
    hud.style.display = 'block';
    teeUp();
    S.cam.copy(host.camera.position);
    S.look.copy(S.tee);
    addEventListener('keydown', onDown, true);
    addEventListener('keyup', onUp, true);
  }
  function stop(say = '') {
    S.on = false;
    ball.visible = trail.visible = aim.visible = false;
    hud.style.display = bar.style.display = 'none';
    if (P.mode === 'range') P.mode = 'walk';
    removeEventListener('keydown', onDown, true);
    removeEventListener('keyup', onUp, true);
    if (say) host.toast(say, 6000);
  }
  function hit() {
    if (S.phase !== 'power') return;
    const c = CLUBS[S.club],
      v = c.v * (0.35 + 0.65 * S.pow),
      loft = (c.loft * Math.PI) / 180,
      d = dir();
    S.vel.set(d.x * Math.cos(loft) * v, Math.sin(loft) * v, d.z * Math.cos(loft) * v);
    S.phase = 'fly';
    S.t = 0;
    S.carry = 0;
    S.left--;
    S.n = 0;
    trail.visible = true;
    thwack(S.pow);
  }
  function landed() {
    // the first bounce is the carry: that's what the rings score
    const R = host.info();
    S.carry = Math.hypot(S.pos.x - S.tee.x, S.pos.z - S.tee.z);
    let pts = Math.round((S.carry * YD) / 10);
    S.said = '';
    for (const t of R.targets)
      if (Math.hypot(S.pos.x - t.x, S.pos.z - t.z) < t.r) {
        pts += t.pts;
        S.said = `In the ring! +${t.pts}`;
        playSample('win', 0.5);
      }
    S.score += pts;
  }
  function onDown(e: KeyboardEvent) {
    if (!S.on || (e.target as HTMLElement)?.tagName === 'INPUT' || e.code === 'KeyC') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.code === 'Escape') return stop('You left the driving range.');
    held.add(e.code);
    if (S.phase === 'aim' && !e.repeat) {
      if (e.code === 'KeyQ') S.club = (S.club + CLUBS.length - 1) % CLUBS.length;
      if (e.code === 'KeyE') S.club = (S.club + 1) % CLUBS.length;
      if (e.code === 'KeyQ' || e.code === 'KeyE') playSample('tick', 0.5);
      if (e.code === 'Space') {
        S.phase = 'power';
        S.t = 0;
      }
    }
  }
  function onUp(e: KeyboardEvent) {
    if (!S.on) return;
    e.stopImmediatePropagation();
    held.delete(e.code);
    if (e.code === 'Space') hit();
  }

  return {
    get active() {
      return S.on;
    },
    start,
    stop,
    update(dt: number) {
      if (!S.on) return;
      S.t += dt;
      const turn = (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0) - (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0);
      if (S.phase === 'aim' || S.phase === 'power') S.yaw = Math.max(-0.5, Math.min(0.5, S.yaw + turn * dt * (held.has('ShiftLeft') ? 0.08 : 0.3)));
      if (S.phase === 'power') {
        const k = (S.t / SWEEP) % 2;
        S.pow = Math.max(0.03, k < 1 ? k : 2 - k);
      }
      if (S.phase === 'fly' || S.phase === 'roll') {
        // small steps: gravity, air drag, and on the ground a bounce that dies into a roll
        let left = Math.min(dt, 0.05);
        while (left > 1e-5) {
          const h = Math.min(left, 1 / 240);
          left -= h;
          const sp = S.vel.length();
          if (S.phase === 'fly') {
            S.vel.addScaledVector(S.vel, -0.0021 * sp * h);
            S.vel.y -= 9.81 * h;
            S.pos.addScaledVector(S.vel, h);
            if (S.pos.y <= 0.03 && S.vel.y < 0) {
              S.pos.y = 0.03;
              if (!S.carry) landed();
              const run = CLUBS[S.club].run;
              if (-S.vel.y < 2.2) {
                S.vel.y = 0;
                S.phase = 'roll';
              } else S.vel.y *= -0.32;
              S.vel.x *= 0.45 + run * 0.5;
              S.vel.z *= 0.45 + run * 0.5;
            }
          } else {
            const hs = Math.hypot(S.vel.x, S.vel.z),
              k = hs > 1e-4 ? Math.max(0, hs - 3.2 * h) / hs : 0;
            S.vel.x *= k;
            S.vel.z *= k;
            S.pos.addScaledVector(S.vel, h);
            if (hs < 0.08) {
              S.phase = 'done';
              S.wait = 1.6;
              const total = Math.hypot(S.pos.x - S.tee.x, S.pos.z - S.tee.z);
              S.said = `${S.said ? S.said + ' · ' : ''}Carry ${Math.round(S.carry * YD)} yd · total ${Math.round(total * YD)} yd`;
              break;
            }
          }
        }
        ball.position.copy(S.pos);
        if (S.n < TR && (S.n === 0 || S.t > S.n * 0.06)) {
          trailPos.set([S.pos.x, S.pos.y, S.pos.z], S.n * 3);
          S.n++;
        }
        for (let i = S.n; i < TR; i++) trailPos.set([S.pos.x, S.pos.y, S.pos.z], i * 3);
        trailGeo.attributes.position.needsUpdate = true;
      }
      if (S.phase === 'done' && (S.wait -= dt) <= 0) {
        if (S.left > 0) teeUp();
        else {
          let best = 0;
          try {
            best = +(localStorage.getItem('gh.rangeBest') || 0) || 0;
            if (S.score > best) localStorage.setItem('gh.rangeBest', String(S.score));
          } catch {}
          if (S.score > best) playSample('best', 0.5);
          stop(
            `<b>${S.score} points</b> from ten balls${S.score > best ? (best ? ` · a new best (was ${best})` : ' · your first score on the board') : ` · your best is ${best}`}.`,
          );
          return;
        }
      }
      // the aim line, and the camera: behind the tee while you line up, then chasing the ball from behind and above
      const d = dir();
      aim.visible = S.phase === 'aim' || S.phase === 'power';
      if (aim.visible) {
        const pa = aimGeo.attributes.position as THREE.BufferAttribute;
        pa.setXYZ(0, S.tee.x, 0.06, S.tee.z);
        pa.setXYZ(1, S.tee.x + d.x * 30, 0.06, S.tee.z + d.z * 30);
        pa.needsUpdate = true;
      }
      const flying = S.phase === 'fly' || S.phase === 'roll' || S.phase === 'done',
        want = flying
          ? new THREE.Vector3(S.pos.x - d.x * (9 + S.pos.y * 0.5), Math.max(2.4, S.pos.y * 0.75 + 2.6), S.pos.z - d.z * (9 + S.pos.y * 0.5))
          : new THREE.Vector3(S.tee.x - d.x * 3.4, 1.75, S.tee.z - d.z * 3.4),
        tgt = flying ? S.pos : new THREE.Vector3(S.tee.x + d.x * 14, 1.1, S.tee.z + d.z * 14);
      S.cam.lerp(want, 1 - Math.exp(-dt * (flying ? 2.2 : 6)));
      S.look.lerp(tgt, 1 - Math.exp(-dt * 7));
      host.camera.position.copy(S.cam);
      host.camera.lookAt(S.look);
      const showBar = S.phase === 'aim' || S.phase === 'power';
      bar.style.display = showBar ? 'block' : 'none';
      if (showBar) {
        barFill.style.width = (S.phase === 'power' ? S.pow * 100 : 0).toFixed(1) + '%';
        barText.textContent = S.phase === 'power' ? `${Math.round(S.pow * 100)}%` : 'Hold Space, let go to hit';
      }
      hud.innerHTML = `${CLUBS[S.club].name} &nbsp;·&nbsp; BALL ${Math.min(BALLS, BALLS - S.left + (showBar ? 1 : 0))} <span style="opacity:.6">of ${BALLS}</span> &nbsp;·&nbsp; ${S.score} PTS${S.said ? `<div style="font-size:15px;color:#ffd27a;margin-top:2px">${S.said}</div>` : ''}`;
    },
  };
}
