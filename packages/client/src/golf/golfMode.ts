// Golf mode: the hole, the 3-tap swing, shot playback for everyone in the match, scorecard → back to the lobby.
// The app creates it once and calls start()/stop()/tick(); it shares the renderer with the lobby.
import { courseAt } from './homeCourse';
import { trailColor } from '../avatar/trails';
import { cartRadio } from '../audio/cartRadio';
import * as THREE from 'three';
import { playSample } from '../audio/samples';
import { tickWater } from '../world/water';
import {
  COURSE,
  CLUBS,
  heightAt,
  surfaceAt,
  classify,
  clamp,
  yd,
  FT_PER_M,
  PUTT_FT,
  MAX_POWER,
  swingTempo,
  windows,
  evaluateImpact,
  shotSetup,
  lieSlope,
  slopeFx,
  simulateShot,
  useHole,
  seedFromMatch,
  gradAt,
  greenEd,
  TREES,
  type ShotBroadcast,
  type ShotInput,
} from '@gh/shared';
import { ambience, type Surface } from '../audio/ambience';
import { windSway } from '../world/wind';
import { controls, type ControlRow } from '../ui/controls';
import { options, opts } from '../ui/options';
import { createCritters, type Scarer } from '../world/critters';
import { buildLighting, buildTerrain, buildVegetation, buildDressing, buildFence, snapSun, setBackdrop } from '../world/course';
import { locale, localeName, localeFromMatch } from '../world/locale';
import { Golfer, type ClubKind } from '../characters/golfer';
import { ArcMeter, METER_OVERRUN, type ArcFrame } from '../ui/arcMeter';
import { Minimap, type MiniBall } from '../ui/minimap';
import { Sfx, Bursts, Ribbon, Tracer } from '../fx';
import { ServerNet } from '../net/serverNet';
import { ArtifactNet } from '../net/artifactNet';
import type { GameNet, NetPlayer } from '../net/types';
import type { Outfit } from '../characters/golfer';
import { sanitizeLook } from '../avatar/outfit';
import { ballMaterial, DEFAULT_BALL } from '../avatar/balls';
import { awardHole, awardTrophy, progress, addCash } from '../avatar/progress';
import { createBets } from './bets';
import { createTurns } from './turns';
import { createRoaming, cartYaw } from './roaming';
import { cupStart, cupStep, CUP_DEPTH, CUP_PIN_R, type CupSim } from './cup';
import { trackCards, tourStandings, tourWaiting, tourWinners, tourCardHTML, toParText, type Tour } from './tournament';
import { CUP_HOLE_R } from '../world/nature';
import { parseTournament, tournamentHoles, cupFor, holeIdea, teeOrderFor } from '@gh/shared';
import { colorFor } from '../avatar/colors';
import { TrophyView } from '../world/trophy';
import { loadPhysics, physicsReady, PhysWorld, Flop } from '../physics/ragdoll';
import { vehicleKind, cleanKind, DRIVE_FX, type Vehicle } from '../vehicles/vehicles';
import { Grass, type GrassKind } from '../world/grass';
import { stepLength } from '../characters/golfer';

const $ = (id: string) => document.getElementById(id)!;
let devCam: number[] | null = null;
export interface GolfStart {
  matchId: string;
  look: Outfit;
  name: string;
  uid: string;
  group: boolean;
  order?: string[];
}
export interface GolfEnv {
  renderer: THREE.WebGLRenderer;
  onExit(): void;
}
const _stepAt = new THREE.Vector3();
/** What the keys do at each point in a shot, for the controls panel (ui/controls.ts). */
const COURSE_KEYS: Record<string, [string, ControlRow[]]> = {
  aim: [
    'Lining up',
    [
      [['A', 'D'], 'Aim'],
      [['Q', 'E'], 'Change club'],
      [['W', 'S'], 'Power'],
      ['Space', 'Start the swing', true],
      ['Shift', 'Hold: view from above'],
      ['M', 'Map'],
      ['B', 'Bets'],
    ],
  ],
  putt: [
    'Putting',
    [
      [['A', 'D'], 'Aim'],
      [['Q', 'E'], 'Putt range'],
      [['W', 'S'], 'Power'],
      ['Space', 'Start the stroke', true],
      ['Shift', 'Hold: view from above'],
    ],
  ],
  swing: [
    'Swinging',
    [
      ['Space', 'Hit! As the star crosses the green', true],
      ['mouse:left', 'Same as Space'],
    ],
  ],
  flight: ['Ball in the air', [['M', 'Map']]],
  wait: [
    'Not your turn',
    [
      ['B', 'Bets'],
      ['M', 'Map'],
    ],
  ],
  walk: [
    'On foot',
    [
      [['W', 'A', 'S', 'D'], 'Move'],
      ['Shift', 'Run'],
      ['E', 'Address the ball · get in the cart', true],
      ['T', 'Address your ball from anywhere'],
      ['M', 'Map'],
      ['B', 'Bets'],
    ],
  ],
  drive: [
    'Driving',
    [
      [['W', 'S'], 'Drive / reverse'],
      [['A', 'D'], 'Steer'],
      ['Space', 'Brake · hold in a turn to drift'],
      ['Shift', 'Floor it'],
      ['G', 'Horn'],
      ['T', 'Address your ball from anywhere'],
      ['R', 'Radio on / off'],
      [['1', '…', '0'], 'Radio stations'],
      [['−', '='], 'Radio volume'],
      ['E', 'Hop out', true],
    ],
  ],
};
/** Course surfaces → footstep sounds. */
const STEP_ON: Record<string, Surface> = { green: 'green', fringe: 'green', bunker: 'sand', path: 'gravel', hardpan: 'gravel', rock: 'concrete' };
export function createGolf(env: GolfEnv) {
  const renderer = env.renderer,
    canvas = renderer.domElement;
  let active = false,
    cur: GolfStart = { matchId: 'solo', look: sanitizeLook(null), name: 'You', uid: 'me', group: false };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 3000);
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const light = buildLighting(scene);
  buildDressing(scene);
  // real grass near the camera, by surface (the turf texture takes over further out)
  const GRASS_OF: Record<string, GrassKind> = { rough: 'rough', heavy: 'heavy', ob: 'heavy', fringe: 'fringe', fairway: 'fairway', tee: 'tee' };
  const grass = new Grass({ kind: (x, z) => GRASS_OF[classify(x, z).s] ?? null, height: heightAt });
  // birds on the fairway ahead and by the green; they take off when someone walks or drives at them (world/critters.ts)
  const scarers: Scarer[] = [],
    critters = createCritters(scene, {
      ground: heightAt,
      open: (x, z) => ['fairway', 'rough', 'fringe', 'tee'].includes(classify(x, z).s),
      get birdSpots() {
        const b = myBall(),
          p = COURSE.pin,
          d = Math.hypot(p.x - b.x, p.z - b.z) || 1,
          ux = (p.x - b.x) / d,
          uz = (p.z - b.z) / d,
          out: [number, number, number][] = [];
        for (const [along, side] of [
          [18, 7],
          [30, -8],
          [45, 5],
        ])
          if (along < d - 12) out.push([b.x + ux * along - uz * side, b.z + uz * along + ux * side, 3]);
        out.push([p.x - uz * 13, p.z + ux * 13, 3], [p.x + uz * 14, p.z - ux * 14, 3]);
        return out;
      },
    });
  scene.add(grass.group);

  // ---------------- the hole: everything that depends on the layout lives in one group, rebuilt when the hole changes
  let holeGroup: THREE.Group | null = null,
    holeSeed = -1;
  function disposeTree(o: THREE.Object3D) {
    o.traverse(c => {
      const m = c as THREE.Mesh;
      if (!m.isMesh && !(c as any).isLine) return;
      if (m.userData.shared) return;
      m.geometry?.dispose();
      const ms = Array.isArray(m.material) ? m.material : [m.material];
      for (const x of ms) {
        (x as any)?.map?.dispose?.();
        x?.dispose?.();
      }
    });
  }
  let holeLoc = '';
  function loadHole(seed: number) {
    useHole(seed, locale.id); // always: the lobby's tee board may have previewed another hole since
    if (seed === holeSeed && holeLoc === locale.id && holeGroup) return;
    holeSeed = seed;
    holeLoc = locale.id;
    setBackdrop(scene);
    grass.setTint(locale.id === 'peak' ? '#8fd0a4' : '#ffffff'); // alpine grass is a cooler, deeper green
    grass.reset();
    if (holeGroup) {
      scene.remove(holeGroup);
      disposeTree(holeGroup);
    }
    const g = (holeGroup = new THREE.Group());
    scene.add(g);
    buildTerrain(g);
    buildVegetation(g);
    buildFence(g);
    buildFlag(g);
    buildSlopeField();
    minimap.setHole();
    $('h-num').textContent = COURSE.number ? String(COURSE.number) : 'R';
    $('h-name').textContent =
      `${locale.id === 'hills' ? '' : localeName() + ' · '}${COURSE.name} · Par ${COURSE.par}${COURSE.code ? ' · ' + COURSE.code : ''}`;
    // (the hole's tip is no longer flashed up at the tee: the user found it in the way)
  }
  // pin + flag
  function buildFlag(scene: THREE.Object3D) {
    const p = COURSE.pin,
      y = heightAt(p.x, p.z);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: '#eee', transparent: true }),
    );
    pole.position.set(p.x, y + 1.2, p.z);
    pole.castShadow = true;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.45, 12, 4),
      windSway(new THREE.MeshStandardMaterial({ color: '#e2574c', side: THREE.DoubleSide, transparent: true }), 'flag'),
    );
    flag.position.set(p.x + 0.36, y + 2.15, p.z);
    // a real cup: the green's shader cuts the hole (nature.ts), and this sits in it: a ring of soil, a white liner, a floor
    const cup = new THREE.Group(),
      R = CUP_HOLE_R,
      inside = (c: string, e: string) =>
        new THREE.MeshStandardMaterial({ color: c, side: THREE.BackSide, roughness: 0.8, emissive: e, emissiveIntensity: 0.6 });
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.025, 28, 1, true), inside('#4a3a26', '#1c150d'));
    soil.position.y = -0.0125;
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(R, R, CUP_DEPTH - 0.025, 28, 1, true), inside('#e8e4d8', '#55524a'));
    liner.position.y = -0.025 - (CUP_DEPTH - 0.025) / 2;
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(R, 28).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#9a968c', roughness: 0.8, emissive: '#2e2c28', emissiveIntensity: 0.6 }),
    );
    floor.position.y = -CUP_DEPTH;
    cup.add(soil, liner, floor);
    cup.position.set(p.x, y, p.z);
    // the pin's thin lower end stands in the middle of the cup
    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(CUP_PIN_R, CUP_PIN_R, CUP_DEPTH + 0.16, 8),
      new THREE.MeshStandardMaterial({ color: '#ddd', metalness: 0.5, roughness: 0.4, transparent: true }),
    );
    ferrule.position.set(p.x, y - CUP_DEPTH + (CUP_DEPTH + 0.16) / 2, p.z);
    scene.add(ferrule);
    scene.add(pole, flag, cup);
    flagParts = [pole, flag, ferrule];
    flagA = 1;
  }
  /** The pin is "pulled" (fades out) while you're close to the hole, so it never hides the cup or your line. */
  let flagParts: THREE.Mesh[] = [],
    flagA = 1;
  /** Dev hooks for screenshots (window.__gh.dev): a fixed camera, and keep a holed ball lying in the cup. */
  const dev: { cam: number[] | null; holdCup: boolean } = { cam: null, holdCup: false };
  function updateFlag(dt: number) {
    if (!flagParts.length) return;
    const b = myBall(),
      a = avatars.get(net.sessionId),
      p = COURSE.pin,
      roam = S.phase === 'walk' || S.phase === 'drive';
    const d = Math.min(
      roam ? 1e9 : Math.hypot(b.x - p.x, b.z - p.z),
      a ? Math.hypot(a.root.position.x - p.x, a.root.position.z - p.z) : 1e9,
      Math.hypot(camera.position.x - p.x, camera.position.z - p.z),
    );
    const want = clamp((d - 7) / 6, 0, 1);
    flagA += (want - flagA) * Math.min(1, dt * 5);
    for (const m of flagParts) {
      (m.material as THREE.MeshStandardMaterial).opacity = flagA;
      m.visible = flagA > 0.02;
      m.castShadow = m === flagParts[0] && flagA > 0.5;
    }
  }

  // ---------------- players ----------------
  /** Follow-through: fast release that decelerates into a slight over-rotation (s ≈ 3.1), then settles back into the held finish. */
  const followCurve = (t: number) => (t < 0.75 ? 1.1 * (1 - (1 - t / 0.75) ** 2.6) : 1.1 - 0.1 * easeInOut(Math.min(1, (t - 0.75) / 0.9)));
  const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  interface Avatar {
    beam?: THREE.Mesh;
    teeSeen?: boolean;
    doneSeen?: boolean;
    cup?: CupSim | null;
    flop?: Flop | null;
    wx: number;
    wz: number;
    wy: number;
    wyaw: number;
    wspd: number;
    wphase: number;
    rgT: number;
    hitCD: number;
    ret: number;
    pending: ShotBroadcast | null;
    pendT: number;
    swT0: number;
    q: number;
    hitStop: number;
    tImp: number;
    root: THREE.Object3D;
    golfer: Golfer;
    ball: THREE.Mesh;
    play: ShotBroadcast | null;
    t0: number;
    ballPos: THREE.Vector3;
    color: string;
    s: number;
    club: ClubKind;
    power: number;
  }
  const avatars = new Map<string, Avatar>();
  /** how far a resting ball settles down into the grass (visual only) */
  function lieSink(x: number, z: number) {
    const k = classify(x, z).s;
    return k === 'heavy' || k === 'ob' ? BALL_R * 0.75 : k === 'rough' ? BALL_R * 0.45 : k === 'fringe' ? BALL_R * 0.12 : 0;
  }
  const BALL_R = 0.0214,
    ballGeo = new THREE.SphereGeometry(BALL_R, 16, 12); // true size; grows only when far from the camera
  function ensureAvatar(id: string, color: string, look?: Outfit) {
    let a = avatars.get(id);
    if (a) return a;
    const golfer = new Golfer(look ? sanitizeLook(look) : sanitizeLook(null));
    const root = golfer.root;
    scene.add(root);
    const skin = (look ? sanitizeLook(look) : null)?.ball || DEFAULT_BALL,
      ball = new THREE.Mesh(ballGeo, ballMaterial(skin, color));
    ball.castShadow = true;
    ball.userData.skin = skin;
    scene.add(ball);
    a = {
      wx: NaN,
      wz: 0,
      wy: 0,
      wyaw: 0,
      wspd: 0,
      wphase: 0,
      rgT: 0,
      hitCD: 0,
      root,
      golfer,
      ball,
      play: null,
      t0: 0,
      ballPos: new THREE.Vector3(),
      color,
      s: 0,
      club: 'iron',
      power: 0.6,
      tImp: 0,
      pending: null,
      pendT: 0,
      swT0: 0,
      q: 0,
      hitStop: 0,
      ret: 0,
    };
    avatars.set(id, a);
    return a;
  }
  function dropAvatar(id: string) {
    const a = avatars.get(id);
    if (!a) return;
    if (a.beam) {
      scene.remove(a.beam);
      (a.beam.material as THREE.Material).dispose();
    }
    a.flop?.dispose();
    remoteCarts.get(id)?.dispose();
    remoteCarts.delete(id);
    a.golfer.dispose();
    scene.remove(a.ball);
    avatars.delete(id);
  }
  const lookOf = (id: string, p?: NetPlayer) => (id === net.sessionId ? cur.look : p?.look);

  // ---------------- net ----------------
  let toastT = 0;
  function toast(s: string, ms = 1600) {
    const t = $('toast');
    t.textContent = s;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), ms) as any;
  }
  // Published page (no ?server=) → peer playtest mode; dev server / ?server= → authoritative Colyseus server.
  const useServer =
    !!(import.meta as any).env?.VITE_SERVER_URL || new URLSearchParams(location.search).has('server') || (import.meta as any).env?.DEV;
  const events = {
    onShot(b: ShotBroadcast) {
      const pl = net.players().get(b.sessionId),
        a = ensureAvatar(b.sessionId, pl?.color || '#fff', lookOf(b.sessionId, pl));
      // the ball does not move yet: it leaves when this golfer's club actually reaches it (see the impact check in tick)
      a.pending = b;
      a.pendT = performance.now() / 1000;
      if (b.sessionId === net.sessionId) {
        S.phase = 'watch';
        S.watchShot = b;
      } else {
        a.swT0 = a.pendT;
        a.q = 0;
        a.tImp = 0;
      }
    },
    onError(_c: string, m: string) {
      toast(m);
      if (S.phase === 'sent') S.phase = 'aim';
    },
    onStatus(text: string, ok: boolean) {
      const n = $('net');
      n.textContent = text;
      n.style.color = ok ? '' : '#ffb27a';
    },
  };
  let net: GameNet = new ArtifactNet(events, 'idle', cur.look);

  // ---------------- local swing state ----------------
  type Phase = 'aim' | 'power' | 'acc' | 'follow' | 'sent' | 'watch' | 'walk' | 'drive';
  const S = {
    phase: 'aim' as Phase,
    club: 0,
    aimYaw: 0,
    puttRange: 1,
    t: 0,
    power: 0,
    p0: 0,
    m: 0,
    u: 0,
    tempo: swingTempo(1),
    win: { p: 0.1, g: 0.3 },
    followT: 0,
    watchShot: null as ShotBroadcast | null,
    lastKey: '',
    autoFor: '',
    target: 1,
    targetFor: '', // target: the power you've dialled in with W/S (the swing stops there by itself)
  };
  function showControls() {
    if (!$('golfcard').classList.contains('hidden')) return controls.clear();
    const ph = S.phase;
    const k =
      ph === 'aim'
        ? turns.on && !turns.mine()
          ? 'wait'
          : isPutt()
            ? 'putt'
            : 'aim'
        : ph === 'power' || ph === 'acc'
          ? 'swing'
          : ph === 'walk' || ph === 'drive'
            ? ph
            : 'flight';
    controls.set('g' + k, COURSE_KEYS[k][0], COURSE_KEYS[k][1]);
  }
  function myBall() {
    const me = net.me();
    return me ? { x: me.ballX, z: me.ballZ, teed: me.teed } : { x: COURSE.tee.x, z: COURSE.tee.z, teed: true };
  }
  function lieOf(b = myBall()) {
    return b.teed ? 'tee' : surfaceAt(b.x, b.z);
  }
  /** the slope under the ball for the current aim (same maths as the shot simulation) */
  function slopeOf(b = myBall()) {
    const lie = lieOf(b),
      putt = !!(CLUBS[S.club] as any).putter;
    return lie === 'tee' || lie === 'green' || putt ? slopeFx({ up: 0, side: 0 }, true) : slopeFx(lieSlope(b.x, b.z, S.aimYaw), false);
  }
  function toPin(b = myBall()) {
    return Math.hypot(COURSE.pin.x - b.x, COURSE.pin.z - b.z);
  }
  function isPutt() {
    return !!(CLUBS[S.club] as any).putter;
  }
  function carryOf(i: number, b = myBall()) {
    const c = CLUBS[i] as any;
    if (c.putter) return PUTT_FT[S.puttRange] / FT_PER_M;
    return shotSetup(c, lieOf(b)).carryMean;
  }
  /** Auto-pick club + aim whenever our ball comes to rest somewhere new (Mario Golf style). */
  function autoSetup() {
    const b = myBall(),
      key = `${b.x.toFixed(2)},${b.z.toFixed(2)}`;
    if (key === S.autoFor) return;
    S.autoFor = key;
    const d = toPin(b),
      lie = lieOf(b);
    if (lie === 'green' || (lie === 'fringe' && d < 12)) {
      S.club = CLUBS.length - 1;
      S.puttRange = PUTT_FT.findIndex(f => f / FT_PER_M >= d * 1.6);
      if (S.puttRange < 0) S.puttRange = PUTT_FT.length - 1;
    } else {
      let best = lie === 'tee' ? 0 : 1;
      for (let i = CLUBS.length - 2; i >= (lie === 'tee' ? 0 : 1); i--) {
        if (carryOf(i, b) >= d * 0.98) {
          best = i;
          break;
        }
      }
      S.club = best;
    } // the shortest club that gets there: room to go long
    S.aimYaw = Math.atan2(COURSE.pin.x - b.x, COURSE.pin.z - b.z);
    if (!isPutt() && d > CLUBS[0].carry * 1.05) {
      // long hole: aim down the dogleg's centreline, not straight at the pin
      const c = carryOf(S.club, b);
      let bx = b.x,
        bz = b.z,
        bestD = 1e9;
      for (const [x, z] of COURSE.center) {
        const dd = Math.abs(Math.hypot(x - b.x, z - b.z) - c);
        if (dd < bestD) {
          bestD = dd;
          bx = x;
          bz = z;
        }
      }
      S.aimYaw = Math.atan2(bx - b.x, bz - b.z);
    }
  }
  /** Roughly how far the dialled-in shot carries (a pure strike, before wind): what the meter's big number shows. */
  function shotDist() {
    const p = S.phase === 'acc' || S.phase === 'follow' ? S.p0 : S.target;
    return isPutt() ? carryOf(S.club) * p : carryOf(S.club) * p * (slopeOf()?.dist ?? 1);
  }
  function needPower() {
    const d = toPin(),
      c = carryOf(S.club);
    return clamp(d / c, 0, MAX_POWER);
  }

  function press() {
    sfx.ensure();
    if (endShown) return;
    if (S.phase === 'aim') {
      if (net.me()?.busy || net.me()?.done || !net.isReady()) return;
      if (!turns.mine()) {
        const w = turns.turn.id ? net.players().get(turns.turn.id) : null;
        toast(
          turns.turn.phase === 'flight' ? 'Wait for the ball to stop.' : `Not your turn yet: waiting for ${esc(w?.name || 'another golfer')}.`,
          1600,
        );
        return;
      }
      if (net.me()?.strokes === 0 && bets.blocking()) {
        toast('Bets are open: answer first (Y / N)', 1400);
        return;
      }
      S.phase = 'power';
      S.t = 0;
      S.tempo = swingTempo(1, isPutt());
      return;
    }
    if (S.phase === 'power') return; // the backswing finishes by itself at your dialled power
    if (S.phase === 'acc') {
      const tm = S.tempo;
      S.u = (S.t - tm.hang - tm.down) * tm.rate;
      if (S.u < -1.4) return;
      fire();
    }
  }
  /** Swing time (0 = perfect impact) at the first press, for the shot as it's dialled in now: the meter's run-up. */
  function swingU0() {
    const aim = S.phase === 'aim',
      tm = aim ? swingTempo(1, isPutt()) : S.tempo,
      size = Math.min(1, aim || S.phase === 'power' ? S.target : S.p0);
    return -(tm.up * (0.5 + 0.5 * size) + tm.hang + tm.down) * tm.rate;
  }
  function lock() {
    S.p0 = Math.max(0.03, S.power);
    S.phase = 'acc';
    S.t = 0;
    S.m = S.p0;
    S.u = -(S.tempo.hang + S.tempo.down) * S.tempo.rate;
    S.win = windows(S.p0, CLUBS[S.club], lieOf(), undefined, slopeOf());
    if (!isPutt()) sfx.swoosh(S.tempo.hang, S.tempo.down, Math.min(1, S.p0));
  }
  function fire() {
    S.phase = 'follow';
    S.followT = 0;
    {
      // call the strike the instant it's made (the ball itself leaves a moment later)
      const im = evaluateImpact(S.u, S.win, isPutt());
      lastStrike = { grade: im.grade, late: im.dev > 0 };
      playSample(im.grade === 'perfect' ? 'confirm' : im.grade === 'good' ? 'select' : 'back', im.grade === 'perfect' ? 0.55 : 0.4);
    }
    const shot: ShotInput = { club: S.club, power: S.p0, u: S.u, aimYaw: S.aimYaw, puttRange: S.puttRange, spin: { top: 0, back: 0, side: 0 } };
    net.sendShot(shot);
  }
  addEventListener('keydown', e => {
    if (!active || e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.code === 'Escape') {
      if (endShown) return;
      options.open(); // the options menu, which on the course also offers "Leave the round"
      return;
    }
    if (!endShown && bets.key(e)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      press();
      return;
    }
    if (e.code === 'KeyM') {
      $('minimap').classList.toggle('hidden');
      return;
    }
    if (S.phase === 'walk' || S.phase === 'drive') {
      if (e.code === 'KeyE') roam.interact();
      if (e.code === 'KeyF' && S.phase === 'walk') {
        const f = new THREE.Vector3(Math.sin(W.yaw), 0, Math.cos(W.yaw));
        flopMe(
          new THREE.Vector3(W.vx, 0, W.vz),
          W.spd > 1.2 ? f.multiplyScalar(10 + W.spd * 3).setY(12) : f.multiplyScalar(-16).setY(1),
          'Spine1',
          W.spd > 1.2 ? 0.8 : 3,
        );
      }
      if (S.phase === 'drive' && !e.repeat && cartRadio.key(e, toast)) return;
      if (e.code === 'KeyT') {
        const b = myBall();
        W.x = b.x - Math.sin(S.aimYaw) * 1.5;
        W.z = b.z - Math.cos(S.aimYaw) * 1.5;
        S.phase = 'aim';
        S.autoFor = '';
      } // address the ball from wherever you are
      return;
    }
    if (S.phase !== 'aim') return;
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      const d =
        e.code === 'KeyQ'
          ? -1
          : 1; /* one ladder through every club: driver (tee only) … wedge, then the putter's ranges, longest first. Auto-pick only suggests. */
      const P = CLUBS.length - 1,
        ladder: [number, number][] = [];
      for (let i = lieOf() === 'tee' ? 0 : 1; i < P; i++) ladder.push([i, S.puttRange]);
      for (let r = PUTT_FT.length - 1; r >= 0; r--) ladder.push([P, r]);
      let at = ladder.findIndex(([c, r]) => c === S.club && (c !== P || r === S.puttRange));
      if (at < 0) at = 0;
      const [c, r] = ladder[clamp(at + d, 0, ladder.length - 1)];
      S.club = c;
      if (c === P) S.puttRange = r;
    }
    if (e.code === 'KeyP') S.club = isPutt() ? CLUBS.length - 2 : CLUBS.length - 1;
  });
  const held = new Set<string>();
  addEventListener('keydown', e => held.add(e.code));
  addEventListener('keyup', e => held.delete(e.code));
  // Coming back to the game: the click that refocuses the page must not swing, and a swing left half-done when the
  // page lost focus is called off (its meter kept running while you were away).
  let pageFocused = document.hasFocus(),
    focusAt = 0;
  addEventListener('focus', e => {
    pageFocused = true;
    focusAt = e.timeStamp;
  }); // event timestamps: when it happened, not when it was handled
  const away = () => {
    pageFocused = false;
    held.clear();
    if (S.phase === 'power' || S.phase === 'acc') {
      S.phase = 'aim';
      S.t = 0;
      toast('Swing called off', 1200);
    }
  };
  addEventListener('blur', away);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) away();
  });
  canvas.addEventListener('pointerdown', e => {
    if (!active || endShown || e.button !== 0) return;
    if (!pageFocused || e.timeStamp - focusAt < 350) {
      pageFocused = true;
      return;
    }
    if (S.phase === 'walk' || S.phase === 'drive') {
      try {
        (canvas as any).requestPointerLock?.();
      } catch {}
      return;
    }
    press();
  });
  addEventListener('mousemove', e => {
    if (!active || document.pointerLockElement !== canvas) return;
    W.camYaw -= e.movementX * 0.0025;
    W.camPitch = clamp(W.camPitch + e.movementY * 0.002, -0.1, 1.1);
    W.lastLook = clock;
  });

  // ---------------- aim preview ----------------
  const aimDots = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.12, 6, 4),
    new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.8 }),
    28,
  );
  scene.add(aimDots);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 1.7, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  scene.add(ring);
  // the cup, marked for the overhead view (Shift): a red ring and dot that draw over everything, so the hole is easy to find
  const pinMark = new THREE.Group();
  {
    const mm = (c: string) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthTest: false, depthWrite: false, fog: false });
    const a = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 36).rotateX(-Math.PI / 2), mm('#ff4a3a')),
      b = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.9, 36).rotateX(-Math.PI / 2), mm('#ffffff')),
      c = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16).rotateX(-Math.PI / 2), mm('#ff4a3a'));
    for (const m of [a, b, c]) m.renderOrder = 6;
    pinMark.add(a, b, c);
  }
  pinMark.visible = false;
  scene.add(pinMark);
  ring.renderOrder = 5;
  // ---- putting line: the real predicted roll (slope + break) as thin dashes laid on the green, with a small cup-sized
  // ring where the ball would stop. Uses the shared physics at the power the pin needs.
  const PUTT_DASHES = 90;
  const puttDash = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, fog: false }),
    PUTT_DASHES,
  );
  puttDash.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PUTT_DASHES * 3), 3);
  puttDash.frustumCulled = false;
  puttDash.renderOrder = 2;
  scene.add(puttDash);
  const puttEnd = new THREE.Mesh(
    new THREE.RingGeometry(0.09, 0.115, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.95, depthWrite: false, fog: false }),
  );
  puttEnd.renderOrder = 2;
  scene.add(puttEnd);
  let puttKey = '',
    puttPath: THREE.Vector3[] = [];
  // ---------------- green-reading arrows: a field of chevrons drifting downhill, coloured by how steep it is ----------------
  // (white/blue = barely breaks, yellow = noticeable, orange/red = strong). Rebuilt per hole; animated while putting.
  const SLOPE_MAX = 900;
  const softArrow = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.filter = 'blur(3px)';
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(32, 8);
    g.lineTo(54, 50);
    g.lineTo(32, 38);
    g.lineTo(10, 50);
    g.closePath();
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const slopeArrows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2).rotateY(Math.PI),
    new THREE.MeshBasicMaterial({
      map: softArrow,
      color: '#ffffff',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    }),
    SLOPE_MAX,
  );
  slopeArrows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SLOPE_MAX * 3), 3);
  slopeArrows.frustumCulled = false;
  slopeArrows.renderOrder = 1;
  slopeArrows.visible = false;
  scene.add(slopeArrows);
  let slopeCells: { x: number; z: number; dx: number; dz: number; pct: number; ph: number; col: THREE.Color }[] = [],
    slopeT = 0,
    slopeA = 0;
  function buildSlopeField() {
    const g = COURSE.green,
      cells: typeof slopeCells = [],
      STEP = 1.1;
    for (let z = g.z - g.rz * 1.15; z <= g.z + g.rz * 1.15; z += STEP)
      for (let x = g.x - g.rx * 1.15, row = Math.round(z / STEP); x <= g.x + g.rx * 1.15; x += STEP) {
        const px = x + (row & 1 ? STEP / 2 : 0);
        if (greenEd(px, z) > 1.12) continue;
        const [gx, gz] = gradAt(px, z),
          m = Math.hypot(gx, gz),
          pct = m * 100;
        if (pct < 0.25) continue;
        const col = new THREE.Color(pct < 1 ? '#cfe6ff' : pct < 2 ? '#8fd0ff' : pct < 3 ? '#ffe066' : pct < 4.5 ? '#ffa040' : '#ff5a3c');
        cells.push({ x: px, z, dx: -gx / m, dz: -gz / m, pct, ph: (Math.sin(px * 12.9898 + z * 78.233) * 43758.5453) % 1, col });
        if (cells.length >= SLOPE_MAX) break;
      }
    slopeCells = cells;
    slopeArrows.count = cells.length;
  }
  const _sm = new THREE.Matrix4(),
    _sq = new THREE.Quaternion(),
    _sp = new THREE.Vector3(),
    _ss = new THREE.Vector3(),
    _sc = new THREE.Color(),
    _up = new THREE.Vector3(0, 1, 0);
  function updateSlopeArrows(show: boolean, dt: number) {
    slopeA += ((show ? 1 : 0) - slopeA) * (1 - Math.exp(-dt * 6));
    slopeArrows.visible = slopeA > 0.02 && slopeCells.length > 0;
    if (!slopeArrows.visible) return;
    slopeT += dt;
    slopeCells.forEach((c, i) => {
      // each chevron drifts ~0.9 m downhill (faster on steeper ground), fading in and out so the field seems to flow
      const f = (slopeT * (0.25 + c.pct * 0.12) + c.ph + 1) % 1,
        d = (f - 0.5) * 0.8,
        x = c.x + c.dx * d,
        z = c.z + c.dz * d;
      _sp.set(x, heightAt(x, z) + 0.018, z);
      _sq.setFromAxisAngle(_up, Math.atan2(c.dx, c.dz));
      const k = 0.85 + Math.min(1, c.pct / 4) * 0.5;
      _ss.set(k, 1, k);
      slopeArrows.setMatrixAt(i, _sm.compose(_sp, _sq, _ss));
      const a = Math.sin(f * Math.PI) * slopeA * (0.35 + Math.min(1, c.pct / 3) * 0.5) * 0.55;
      slopeArrows.setColorAt(i, _sc.copy(c.col).multiplyScalar(a));
    });
    slopeArrows.instanceMatrix.needsUpdate = true;
    if (slopeArrows.instanceColor) slopeArrows.instanceColor.needsUpdate = true;
  }
  let lastAimT = 0;
  function updatePuttLine(show: boolean) {
    if (!show) {
      puttDash.visible = puttEnd.visible = false;
      return;
    }
    const b = myBall();
    if (S.phase === 'aim') {
      // recompute only while aiming; it stays put during the stroke
      const input = { club: S.club, power: S.target, u: 0, aimYaw: S.aimYaw, puttRange: S.puttRange, spin: { top: 0, back: 0, side: 0 } };
      const key = [b.x.toFixed(3), b.z.toFixed(3), input.power.toFixed(3), input.aimYaw.toFixed(4), S.puttRange].join('|');
      if (key !== puttKey) {
        puttKey = key;
        const r = simulateShot({ ball: { x: b.x, z: b.z, teed: false }, wind: net.wind() }, input, 1);
        // resample the frames by distance so dashes are evenly spaced however fast the ball is rolling
        const pts = r.frames.map(f => new THREE.Vector3(f[1], 0, f[3])),
          out: THREE.Vector3[] = [];
        let acc = 0,
          need = 0.06;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1],
            c = pts[i],
            L = a.distanceTo(c);
          while (acc + L >= need) {
            const t = (need - acc) / L;
            out.push(a.clone().lerp(c, t));
            need += 0.3;
          }
          acc += L;
        }
        out.push(pts[pts.length - 1].clone());
        puttPath = out;
      }
    }
    const n = Math.min(PUTT_DASHES, puttPath.length - 1),
      m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      sc = new THREE.Vector3(),
      col = new THREE.Color(),
      up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < PUTT_DASHES; i++) {
      if (i >= n) {
        m4.makeScale(0, 0, 0);
        puttDash.setMatrixAt(i, m4);
        continue;
      }
      const a = puttPath[i],
        c = puttPath[i + 1],
        dir = c.clone().sub(a),
        len = Math.min(0.17, dir.length() * 0.55);
      const p = a.clone().addScaledVector(dir.normalize(), len / 2);
      p.y = heightAt(p.x, p.z) + 0.012;
      q.setFromAxisAngle(up, Math.atan2(dir.x, dir.z));
      sc.set(0.028, 1, len);
      m4.compose(p, q, sc);
      puttDash.setMatrixAt(i, m4);
      const f = i / Math.max(1, n - 1);
      col.setRGB(1, 1 - 0.18 * f, 1 - 0.55 * f);
      puttDash.setColorAt(i, col); // white → warm toward the end
    }
    puttDash.count = PUTT_DASHES;
    puttDash.instanceMatrix.needsUpdate = true;
    if (puttDash.instanceColor) puttDash.instanceColor.needsUpdate = true;
    (puttDash.material as THREE.MeshBasicMaterial).opacity = S.phase === 'aim' ? 0.85 : 0.5;
    const e = puttPath[puttPath.length - 1];
    if (e) {
      puttEnd.position.set(e.x, heightAt(e.x, e.z) + 0.013, e.z);
    }
    puttDash.visible = puttEnd.visible = puttPath.length > 1;
  }
  /** Shift held while addressing the ball (not mid-swing): overhead view of the landing spot. */
  const birdsEye = () => active && S.phase === 'aim' && (held.has('ShiftLeft') || held.has('ShiftRight')) && !!net.me() && !net.me()!.done;
  let wasBirds = false;
  function updateAim() {
    // The ring is where a perfect (pure) strike lands: while aiming it sits at the pin (or the club's full carry); once you
    // start the swing it follows the power you build, and stays on the power you locked in.
    const swinging = S.phase === 'power' || S.phase === 'acc' || S.phase === 'follow',
      pw = S.phase === 'power' ? S.power : S.p0,
      sd = slopeOf()?.dist ?? 1;
    const b = myBall(),
      c = isPutt() ? carryOf(S.club) : carryOf(S.club) * (swinging ? pw : S.target) * sd,
      sx = Math.sin(S.aimYaw),
      sz = Math.cos(S.aimYaw);
    const putt = isPutt(),
      apex = putt ? 0 : c * (0.12 + (CLUBS[S.club] as any).launch / 200);
    const m = new THREE.Matrix4(),
      y0 = heightAt(b.x, b.z);
    for (let i = 0; i < 28; i++) {
      const f = (i + 1) / 28,
        x = b.x + sx * c * f,
        z = b.z + sz * c * f;
      const y = (putt ? heightAt(x, z) : y0 + (heightAt(x, z) - y0) * f) + 0.1 + apex * 4 * f * (1 - f);
      m.makeTranslation(x, y, z);
      aimDots.setMatrixAt(i, m);
    }
    aimDots.instanceMatrix.needsUpdate = true;
    const tx = b.x + sx * c,
      tz = b.z + sz * c;
    ring.position.set(tx, heightAt(tx, tz) + 0.06, tz);
    const show = S.phase === 'aim' || S.phase === 'power' || S.phase === 'acc';
    aimDots.visible = ring.visible = show && !putt;
    updatePuttLine(show && putt && !!net.me() && !net.me()!.done);
    updateSlopeArrows(show && putt && !!net.me() && !net.me()!.done && (S.phase === 'aim' || S.phase === 'power'), Math.min(0.05, clock - lastAimT));
    lastAimT = clock;
  }

  // ---------------- HUD ----------------
  const minimap = new Minimap($('minimap') as HTMLCanvasElement);
  const meter = new ArcMeter($('arcmeter') as unknown as SVGSVGElement);
  let boardHTML = '';
  function updateHUD() {
    const me = net.me(),
      c = CLUBS[S.club] as any;
    $('h-stroke').textContent = me ? (me.done ? `Holed · ${me.strokes}` : `Stroke ${me.strokes + 1}`) : 'Stroke 1';
    $('h-pin').textContent = `${yd(toPin())} yd`;
    const w = net.wind(),
      ws = Math.hypot(w.x, w.z),
      rel = Math.atan2(w.x, w.z) - S.aimYaw,
      arrows = '↑↗→↘↓↙←↖',
      ai = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
    $('h-wind').textContent = ws < 0.3 ? 'Calm' : `${arrows[ai]} ${(ws * 2.237).toFixed(0)} mph`;
    $('h-club').textContent = c.putter ? `P · ${PUTT_FT[S.puttRange]}ft` : c.short;
    {
      const sl = c.putter ? '' : slopeOf().label;
      $('h-carry').textContent = c.putter ? `${lieOf()}` : `${yd(carryOf(S.club) * slopeOf().dist)} yd · ${lieOf()}${sl ? ' · ' + sl : ''}`;
    }
    const rows = T
      ? standings()
          .map(r => {
            const p = net.players().get(r.id),
              live = p && (r.me || (p.h ?? T!.h) === T!.h) && !p.done ? p.strokes : 0;
            return `<div class="row${turns.on && turns.turn.id === r.id ? ' turn' : ''}"><i style="background:${r.color}"></i>${esc(r.name)}<span class="thru">${r.thru >= T!.n ? 'F' : live ? `· ${live}` : r.thru ? `thru ${r.thru}` : ''}</span><b>${tp(r.toPar)}</b></div>`;
          })
          .join('')
      : [...net.players()]
          .map(
            ([id, p]) =>
              `<div class="row${turns.on && turns.turn.id === id ? ' turn' : ''}"><i style="background:${p.color}"></i>${id === net.sessionId ? 'You' : esc(p.name)}<b>${p.done ? '✓ ' : ''}${p.strokes}</b></div>`,
          )
          .join('');
    const html = T
      ? `<div class="lbl">${esc(T.cup.title)}</div><div class="lbl sub">Hole ${T.h + 1} of ${T.n}</div>${rows}<button id="g-leave" class="mini">Leave</button>`
      : `<div class="lbl">${cur.group ? 'Group round' : 'Solo round'} · ${esc(COURSE.name)}</div>${rows}<button id="g-leave" class="mini">Leave</button>`;
    if (html !== boardHTML) {
      boardHTML = html;
      $('board').innerHTML = html;
      const lb = document.getElementById('g-leave');
      if (lb) lb.onclick = () => showEnd(true);
    }
  }

  // ---------------- frame loop ----------------
  const camPos = new THREE.Vector3(0, 4, -8),
    camLook = new THREE.Vector3(),
    v3 = new THREE.Vector3();
  function framePos(b: ShotBroadcast, t: number, out: THREE.Vector3) {
    const f = b.result.frames;
    if (t >= f[f.length - 1][0]) {
      const l = f[f.length - 1];
      return { done: true, p: out.set(l[1], l[2], l[3]) };
    }
    let i = 1;
    while (i < f.length - 1 && f[i][0] < t) i++;
    const a = f[i - 1],
      c = f[i],
      k = clamp((t - a[0]) / Math.max(1e-4, c[0] - a[0]), 0, 1);
    return { done: false, p: out.set(a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k, a[3] + (c[3] - a[3]) * k) };
  }
  const sfx = new Sfx(),
    bursts = new Bursts(scene),
    ribbon = new Ribbon(scene),
    tracer = new Tracer(scene);
  // ---------------- ragdolls: a ball in flight that passes through another golfer knocks them flat ----------------
  // Every client replays the same deterministic flights, so every client sees the same bonk without any messages.
  let pw: PhysWorld | null = null,
    pwHole = -1;
  loadPhysics().catch(() => {});
  // ---------------- getting around: on foot or by cart (vehicles are an open set: see vehicles.ts) ----------------
  let myRg: { t: number; v: number[]; i: number[]; at: string } | null = null;
  const remoteCarts = new Map<string, Vehicle>();
  // walking, your cart and the E prompt live in golf/roaming.ts
  const roam = createRoaming({
      S,
      held,
      net: () => net,
      avatars,
      remoteCarts,
      scene,
      pw: () => pw,
      uid: () => cur.uid,
      clock: () => clock,
      order: () => turns.listOrder,
      colorFor: u => colorFor(u),
      myBall: () => myBall(),
      toast: (h, ms) => toast(h, ms),
      sfx,
      flopMe: (v, i, at, tone) => flopMe(v, i, at, tone),
      el: id => $(id),
      esc: t => esc(t),
    }),
    W = roam.W;
  /** Physics for the current hole: the whole terrain as a trimesh, a post for every tree, your cart by the tee. */
  function ensurePhys() {
    if (!physicsReady() || pwHole === holeSeed) return;
    roam.dropCart();
    for (const c of remoteCarts.values()) c.dispose();
    remoteCarts.clear();
    for (const a of avatars.values()) {
      a.flop?.dispose();
      a.flop = null;
    }
    pw?.free();
    pw = new PhysWorld();
    pwHole = holeSeed;
    const B = COURSE.bounds;
    pw.terrain(heightAt, B.x0 + 15, B.x1 - 15, B.z0 + 15, B.z1 - 15, 2);
    for (const t of TREES) pw.cylinder(t.x, t.y + 3, t.z, 3, 0.3 * t.s);
    roam.spawnCart();
  }
  /** Knock my own golfer flat (cart hit, crash, F to flop) and tell everyone. */
  function flopMe(vel: THREE.Vector3, imp: THREE.Vector3, at = 'Spine1', tone = 0.04) {
    const a = avatars.get(net.sessionId);
    if (!a || !pw || a.flop) return;
    if (S.phase === 'drive') S.phase = 'walk';
    if (S.phase !== 'walk') return;
    a.root.position.set(W.x, W.gy, W.z);
    a.root.updateMatrixWorld(true);
    a.flop = new Flop(pw, a.golfer, { vel, impulse: imp, at, tone, toneT: tone > 1 ? 0.8 : 0, rest: 0.1, onThud: v => sfx.thud(0.3 + 0.5 * v) });
    myRg = { t: Date.now(), v: [vel.x, vel.y, vel.z].map(n => +n.toFixed(2)), i: [imp.x, imp.y, imp.z].map(n => +n.toFixed(2)), at };
  }
  const _bv = new THREE.Vector3(),
    _bp = new THREE.Vector3(),
    _ax = new THREE.Vector3();
  function knockDown(b: Avatar, dir: THREE.Vector3, head: boolean, who?: string, whom?: string) {
    if (!pw || b.flop) return;
    const d = dir.clone().setY(0).normalize();
    b.root.updateMatrixWorld(true);
    b.flop = new Flop(pw, b.golfer, {
      vel: new THREE.Vector3(),
      impulse: d.multiplyScalar(head ? 26 : 34).setY(head ? 3 : 6),
      at: head ? 'Head' : 'Spine1',
      tone: 0.04,
      toneT: 0,
      rest: 0.1,
      onThud: v => sfx.thud(0.2 + 0.4 * v),
    });
    sfx.bonk(1);
    camKick = Math.max(camKick, 0.02);
    toast(whom === 'You' ? `BONK! ${who} got you` : `BONK! ${who === 'You' ? 'You' : who} beaned ${whom}`, 1800);
  }
  /** Does this flight hit any other golfer between t0 and t1? (capsule from the shins to the head) */
  function ballHits(a: Avatar, aid: string, t0: number, t1: number) {
    if (!a.play || (a.play as any)._bonk || t1 - t0 <= 0) return;
    const players = net.players();
    for (const [bid, b] of avatars) {
      if (b === a || b.flop || !b.root.visible) continue;
      const base = b.root.position;
      for (let k = 1; k <= 4; k++) {
        // sub-segments of this frame's flight, closest approach to the golfer's vertical axis
        framePos(a.play, t0 + ((t1 - t0) * (k - 1)) / 4, _bv);
        framePos(a.play, t0 + ((t1 - t0) * k) / 4, _bp);
        const sx = _bp.x - _bv.x,
          sz = _bp.z - _bv.z,
          L2 = sx * sx + sz * sz,
          u = L2 > 1e-8 ? clamp(((base.x - _bv.x) * sx + (base.z - _bv.z) * sz) / L2, 0, 1) : 1;
        const hx = _bv.x + sx * u,
          hz = _bv.z + sz * u,
          hy = _bv.y + (_bp.y - _bv.y) * u - base.y,
          r = hy > 1.45 ? 0.17 : 0.24;
        if (hy < 0.15 || hy > 1.82 || (hx - base.x) ** 2 + (hz - base.z) ** 2 > r * r) continue;
        const y = hy;
        _ax.subVectors(_bp, _bv);
        (a.play as any)._bonk = 1;
        const nm = (id: string) => (id === net.sessionId ? 'You' : players.get(id)?.name || 'A golfer');
        knockDown(b, _ax, y > 1.45, nm(aid), nm(bid));
        return;
      }
    }
  }
  let camKick = 0,
    fovPunch = 0;
  const _h = new THREE.Vector3(),
    _sh = new THREE.Vector3(),
    _prevHead = new THREE.Vector3();
  /** The moment of truth: start the ball, freeze a beat, kick the camera, throw turf, play the strike. */
  function strike(a: Avatar, mine: boolean) {
    const b = a.pending!,
      res = b.result,
      nowS = performance.now() / 1000,
      putt = a.club === 'putter',
      pw = Math.min(1, res.input.power);
    a.play = b;
    a.cup = null;
    a.pending = null;
    a.t0 = nowS;
    a.tImp = 0;
    a.hitStop = putt ? 0 : 0.035 + 0.035 * pw;
    const f0 = res.frames[0],
      at = new THREE.Vector3(f0[1], heightAt(f0[1], f0[3]), f0[3]),
      dir = new THREE.Vector3(Math.sin(res.input.aimYaw), 0, Math.cos(res.input.aimYaw));
    sfx.impact(a.club, pw, res.impact.q, mine ? 1 : 0.45);
    if (!putt) {
      if (res.lie === 'bunker') bursts.emit(at, dir, ['#e6d3a6', '#d6c196', '#f0e2bd'], 46, 5 + 4 * pw, 4.5, 2.2);
      else if (res.lie === 'tee') bursts.emit(at, dir, ['#f1ece0', '#c9a36a'], 5, 4, 3.2, 1.5);
      else
        bursts.emit(
          at,
          dir,
          res.lie === 'hardpan' || res.lie === 'path' ? ['#b39a72', '#8f7a58'] : ['#6f8a40', '#5d7436', '#7a5c3a', '#86a24c'],
          Math.round(8 + 20 * pw + 14 * res.impact.q),
          3 + 4 * pw,
          3.4,
          1.6,
        );
    }
    if (mine) {
      camKick = putt ? 0 : 0.012 + 0.028 * pw;
      fovPunch = putt ? 0 : 0.6 + 1.4 * pw;
      tracer.reset();
      const g = res.impact.grade;
      toast(g === 'perfect' ? (putt ? 'Pure roll' : 'PERFECT!') : res.impact.label, 1100);
    }
  }
  let teeOff = false;
  let lastStrike: { grade: 'perfect' | 'good' | 'miss'; late: boolean } | null = null;
  const EVENT_TOAST: Record<string, string> = { holed: 'IN THE HOLE!', water: 'Splash! +1', ob: 'Out of bounds +1', tree: 'Timber!' };
  /** Holed out (or picked up): Birdie Dollars for birdies and better. */
  function finishHole() {
    const me = net.me();
    if (!me) return;
    awardHole(T ? `${cur.matchId}:${T.h}` : cur.matchId, me.strokes, COURSE.par).then(won => {
      if (won > 0) {
        toast(`${won === 1 ? 'Birdie!' : won === 2 ? 'Eagle!' : 'Incredible!'} +${won} Birdie Dollar${won > 1 ? 's' : ''}`, 3200);
        sfx.bonk(0.4);
      }
    });
  }
  /** On-foot movement (GTA-style, camera-relative), driving, crashes and cart hits. */
  let last = performance.now(),
    clock = 0;
  function tick(now: number) {
    if (!active) return;
    const rdt = Math.min(0.25, Math.max(0, (now - last) / 1000)),
      dt = Math.min(0.05, rdt);
    last = now;
    clock += dt; // rdt: real time, so swing timing never depends on frame rate
    ensurePhys();
    const players = net.players();
    for (const id of [...avatars.keys()]) if (!players.has(id)) dropAvatar(id);
    if (T) trackCards(T, players, net.sessionId);
    for (const [id, p] of players) {
      const a = ensureAvatar(id, p.color, lookOf(id, p)),
        nowS = performance.now() / 1000;
      if (T && id !== net.sessionId && (p.h ?? T.h) !== T.h) {
        // tournament: they're on another hole (ahead, or still finishing one)
        a.root.visible = false;
        a.ball.visible = false;
        if (remoteCarts.has(id)) {
          remoteCarts.get(id)!.dispose();
          remoteCarts.delete(id);
        }
        continue;
      }
      if (a.play) {
        {
          const pl = a.play as any,
            tn = nowS - a.t0;
          ballHits(a, id, pl._ht ?? 0, tn);
          pl._ht = tn;
        } // everything flown since last frame
        const r = framePos(a.play, nowS - a.t0, a.ballPos);
        let dropping = false;
        if (a.play.result.outcome === 'holed') {
          const fr = a.play.result.frames;
          if (nowS - a.t0 >= fr[Math.max(0, fr.length - 2)][0]) {
            if (!a.cup) {
              a.cup = cupStart(a.play);
              if (id === net.sessionId) setTimeout(() => playSample('sunk', 0.55), 700);
            }
            dropping = cupStep(a.cup, dt, a.ballPos, (hard, v) => sfx.cup(hard, v), id === net.sessionId ? 0.7 : 0.3) || dev.holdCup;
          }
        }
        for (const ev of a.play.result.events)
          if (ev.t <= nowS - a.t0 && !(ev as any)._shown) {
            (ev as any)._shown = 1;
            if (ev.type === 'land') sfx.land(id === net.sessionId ? 0.5 : 0.2);
            if (id === net.sessionId && EVENT_TOAST[ev.type]) toast(EVENT_TOAST[ev.type]);
          }
        if (id === net.sessionId) tracer.add(a.ballPos);
        if (r.done && !dropping) {
          a.cup = null;
          if (id === net.sessionId) {
            const res = a.play.result;
            if (res.outcome === 'rest') toast(`${yd(res.total)} yd · ${res.restSurface}`, 1200);
            S.watchShot = null;
            if (net.me()?.done) {
              S.phase = 'aim';
              finishHole();
            } else roam.startWalking();
          }
          a.play = null;
        }
      } else if (a.pending) {
        const f = a.pending.result.frames[0];
        a.ballPos.set(f[1], f[2], f[3]);
      } else a.ballPos.set(p.ballX, heightAt(p.ballX, p.ballZ) + (p.teed ? 0.045 : BALL_R - lieSink(p.ballX, p.ballZ)), p.ballZ);
      a.ball.position.copy(a.ballPos);
      a.ball.visible = !(p.done && !a.play);
      {
        // whose turn: a soft light beam over their ball, in their colour
        const on = turns.on && turns.turn.id === id && id !== net.sessionId && !a.play && !a.pending && !p.done;
        if (on && !a.beam) {
          a.beam = new THREE.Mesh(
            BEAM_GEO,
            new THREE.MeshBasicMaterial({
              color: p.color,
              transparent: true,
              opacity: 0.3,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              side: THREE.DoubleSide,
            }),
          );
          a.beam.renderOrder = 3;
          scene.add(a.beam);
        }
        if (a.beam) {
          a.beam.visible = on;
          if (on) {
            a.beam.position.set(a.ballPos.x, a.ballPos.y + 7, a.ballPos.z);
            (a.beam.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.12 * Math.sin(clock * 4);
          }
        }
      }
      a.ball.scale.setScalar(a.cup ? 1 : Math.max(1, (camera.position.distanceTo(a.ballPos) * 0.0022) / BALL_R)); /* true size in the cup */
      // golfers stand at address beside their ball (lobby walking comes in M1)
      const yaw = id === net.sessionId ? S.aimYaw : p.yaw,
        f0 = (a.play || a.pending)?.result.frames[0],
        bx = f0 ? f0[1] : p.ballX,
        bz = f0 ? f0[3] : p.ballZ;
      a.root.rotation.set(0, yaw - Math.PI / 2, 0);
      // one-shot moments everyone sees: teeing up at the start of the hole; on holing out, taking the ball out of the
      // cup, and a cheer for a birdie or better
      if (p.teed && p.strokes === 0 && !a.teeSeen && !a.play && !a.pending) {
        a.teeSeen = true;
        a.golfer.playOnce('teeup');
      }
      if (p.done && !a.play && !a.pending && !a.doneSeen) {
        a.doneSeen = true;
        a.golfer.playOnce('pickup', ...(p.strokes < COURSE.par ? ['cheer'] : []));
      }
      if (!p.done) a.doneSeen = false;
      a.root.visible = !p.done || a.golfer.busy() || (id === net.sessionId ? false : !!p.body && p.body.m !== 'addr');
      // ---- on foot / in a cart (not standing over the ball)
      const mineR = id === net.sessionId,
        body = mineR ? null : p.body;
      if (!mineR && body?.rg && body.rg.t !== a.rgT) {
        const first = !a.rgT;
        a.rgT = body.rg.t;
        if (!first && pw && !a.flop) {
          a.root.updateMatrixWorld(true);
          a.flop = new Flop(pw, a.golfer, {
            vel: new THREE.Vector3(...body.rg.v),
            impulse: new THREE.Vector3(...body.rg.i),
            at: body.rg.at,
            tone: 0.04,
            rest: 0.1,
            onThud: v => sfx.thud(0.15 + 0.3 * v),
          });
        }
      }
      if (!mineR) {
        // their cart, parked or driven
        if (body?.v && pw) {
          let c = remoteCarts.get(id);
          const vk = cleanKind(body.v.k);
          if (c && c.kind !== vk) {
            c.dispose();
            c = undefined;
          }
          if (!c) {
            c = vehicleKind(vk).make(pw, scene, colorFor(p.uid), false);
            remoteCarts.set(id, c);
          }
          c?.follow(body.v, dt);
        } else if (remoteCarts.has(id)) {
          remoteCarts.get(id)!.dispose();
          remoteCarts.delete(id);
        }
      }
      const mode = mineR ? (S.phase === 'walk' ? 'walk' : S.phase === 'drive' ? 'drive' : 'addr') : body?.m || 'addr';
      if ((mode === 'walk' || mode === 'drive') && !a.pending && !(a.play && !mineR && a.tImp < 1.2)) {
        const car = mineR ? roam.cart : remoteCarts.get(id);
        if (!mineR && body) {
          if (isNaN(a.wx)) {
            a.wx = body.x;
            a.wz = body.z;
            a.wyaw = body.yaw;
          }
          const k = 1 - Math.exp(-dt * 8);
          a.wx += (body.x - a.wx) * k;
          a.wz += (body.z - a.wz) * k;
          let dy = body.yaw - a.wyaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          a.wyaw += dy * k;
          a.wspd = body.spd;
        }
        if (mineR) {
          a.wx = W.x;
          a.wz = W.z;
          a.wyaw = W.yaw;
          a.wspd = W.spd;
        }
        const stepBefore = a.wphase;
        a.wphase += ((dt * a.wspd) / stepLength(a.wspd)) * Math.PI;
        if (a.wspd > 0.5 && Math.floor(stepBefore / Math.PI) !== Math.floor(a.wphase / Math.PI)) {
          if (mineR) S.phase === 'walk' && ambience.step(STEP_ON[surfaceAt(W.x, W.z)] || 'grass', Math.min(1, a.wspd / 6.4));
          else if (a.root.visible && body?.m === 'walk')
            ambience.step(STEP_ON[surfaceAt(a.wx, a.wz)] || 'grass', Math.min(1, a.wspd / 6.4), {
              pos: _stepAt.set(a.wx, a.root.position.y, a.wz),
              cam: camera,
            });
        }
        const ridePose = () => {
          const gr = car?.grips?.(),
            w = (v: THREE.Vector3) => car!.seatParent.localToWorld(v.clone());
          a.golfer.update({
            mode: 'sit',
            s: 0,
            club: a.club,
            time: clock,
            turn: car ? -car.steering() : 0,
            ik: gr ? { hands: [w(gr.hands[0]), w(gr.hands[1])], feet: [w(gr.feet[0]), w(gr.feet[1])] } : undefined,
          });
        };
        const walkPose = () => a.golfer.update({ mode: 'walk', speed: a.wspd, phase: a.wphase, s: 0, club: a.club, time: clock, showClub: false });
        const seatIt = () => {
          if (!car) return;
          car.seatParent.updateMatrixWorld(true);
          a.root.position.copy(car.seat).applyMatrix4(car.seatParent.matrixWorld);
          a.root.quaternion
            .copy(car.seatParent.getWorldQuaternion(new THREE.Quaternion()))
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.riderYaw));
        };
        if (mode === 'drive' && car && !a.flop) {
          car.root.updateMatrixWorld(true);
          seatIt();
          ridePose();
        } else if (!a.flop || a.flop.state === 'rise') {
          a.root.position.set(a.wx, heightAt(a.wx, a.wz), a.wz);
          a.root.rotation.set(0, a.wyaw, 0);
        }
        if (a.flop) {
          if (
            !a.flop.update(
              dt,
              (x, z, yw) => {
                if (mineR) {
                  W.x = x;
                  W.z = z;
                  W.yaw = yw;
                }
                a.wx = x;
                a.wz = z;
                a.wyaw = yw;
                a.root.position.set(x, heightAt(x, z), z);
                a.root.rotation.set(0, yw, 0);
              },
              walkPose,
            )
          )
            a.flop = null;
        } else if (mode !== 'drive') walkPose();
        a.ball.visible = !p.done;
        continue;
      }
      // body: my own golfer follows the meter; other players play a full swing when their shot arrives
      const mineA = id === net.sessionId,
        tm = S.tempo;
      let sA = a.s,
        sB = a.s,
        bw = 0;
      // downswing pose from progress q (0 top → 1 impact): the backswing run in reverse cross-fades into the downswing
      // keys over the first part, so the change of direction is smooth and a ¾ backswing gets a ¾ downswing
      const down = () => {
        const A = a.club === 'putter' ? 1 : Math.min(1, a.power),
          p = A * (1 - a.q);
        sA = p;
        sB = 2 - p;
        bw = a.club === 'putter' ? 1 : easeInOut(clamp(a.q / 0.4, 0, 1));
        a.s = a.club === 'putter' ? 2 - p : sA + (sB - sA) * bw;
        if (a.club === 'putter') sA = sB = a.s;
      };
      // back to address: cross-fade straight from the held finish instead of running the swing backwards
      const settle = () => {
        a.q = 0;
        if (a.s <= 0.001) {
          a.s = 0;
          a.ret = 0;
          sA = sB = 0;
          return;
        }
        a.ret += dt * 2.4;
        sA = a.s;
        sB = 0;
        bw = easeInOut(Math.min(1, a.ret));
        if (a.ret >= 1) {
          a.s = 0;
          a.ret = 0;
          sA = sB = 0;
          bw = 0;
        }
      };
      const through = () => {
        if (a.hitStop > 0) {
          a.hitStop -= dt;
          a.s = 2;
        } else {
          a.tImp += dt;
          a.s = 2 + followCurve(a.tImp);
        }
        sA = sB = a.s;
        bw = 0;
      };
      if (mineA) {
        a.club = Golfer.clubKindFor(CLUBS[S.club] as any);
        a.power = S.phase === 'power' ? S.power : S.p0;
        if (S.phase === 'aim' && !a.play && !a.pending) settle();
        else if (S.phase === 'power') {
          a.ret = 0;
          a.s = Math.min(1, S.power);
          a.q = 0;
          a.tImp = 0;
          sA = sB = a.s;
        } else if (S.phase === 'acc') {
          a.q = clamp(1 - S.m / Math.max(0.03, S.p0), 0, 1) * (S.t > tm.hang ? 1 : 0);
          down();
        } else if (a.q < 1) {
          a.q = Math.min(1, a.q + (dt / tm.down) * 1.6);
          down();
        } // clicked early: finish the downswing
        else through();
      } else if (a.swT0) {
        // other players: quick backswing, then the same downswing; their ball leaves at their impact
        const src = (a.pending || a.play)?.result;
        if (src) {
          const c = CLUBS.find(c => c.name === src.club) as any;
          if (c) a.club = Golfer.clubKindFor(c);
          a.power = src.input.power;
        }
        const t = nowS - a.swT0,
          up = 0.5,
          hang = 0.06,
          dn = 0.3,
          A = a.club === 'putter' ? 1 : Math.min(1, a.power);
        a.ret = 0;
        if (t < up) {
          a.s = easeInOut(t / up) * A;
          sA = sB = a.s;
        } else if (t < up + hang) {
          a.s = A;
          sA = sB = a.s;
        } else if (a.q < 1) {
          a.q = Math.min(1, Math.pow((t - up - hang) / dn, 1.6));
          down();
        } else through();
        if (!a.play && !a.pending && a.q >= 1 && a.tImp > 1.2) a.swT0 = 0;
      } else settle();
      // impact: the club has reached the ball (or the result arrived a touch late) → the ball goes now
      if (a.pending && (a.q >= 1 || nowS - a.pendT > 1.6)) {
        a.q = 1;
        strike(a, mineA);
        a.s = sA = sB = 2;
        bw = 0;
      }
      const pose = () =>
        a.golfer.update({ mode: a.club === 'putter' ? 'putt' : 'swing', s: sA, s2: sB, blend: bw, club: a.club, time: clock, power: a.power });
      if (a.flop) {
        if (!a.flop.update(dt, () => {}, pose)) a.flop = null;
        continue;
      } // knocked flat: physics owns the body until they're back up
      pose();
      // stand so the ball sits where this club wants it (golfer faces 90° right of the aim line)
      const bl = a.golfer.ballLocal,
        ry = yaw - Math.PI / 2,
        c = Math.cos(ry),
        sn = Math.sin(ry);
      const gx = bx - (bl.x * c + bl.z * sn),
        gz = bz - (-bl.x * sn + bl.z * c);
      a.root.position.set(gx, heightAt(gx, gz), gz);
      if (mineA) {
        // clubhead ribbon while the head is moving fast
        a.root.updateMatrixWorld(true);
        a.golfer.clubPoint(1, _h);
        a.golfer.clubPoint(0.72, _sh);
        const sp = _h.distanceTo(_prevHead) / Math.max(dt, 1e-3);
        _prevHead.copy(_h);
        const on = a.club !== 'putter' && sp > 6 && sp < 400 && a.s > 1.05 && a.s < 2.7 && a.hitStop <= 0;
        ribbon.push(on ? _h : null, on ? _sh : null, clamp((sp - 6) / 18, 0.2, 1));
        if (!a.play) tracer.fade(dt);
      }
    }
    roam.update(dt);
    tracer.setColor(trailColor(progress().trail, clock));
    {
      // the cart radio: at the wheel, or heard from where the cart is parked
      const cp = roam.cart?.root.position;
      cartRadio.own(
        dt,
        S.phase === 'drive' && !!roam.cart,
        cp ? { x: cp.x, z: cp.z } : null,
        S.phase === 'walk' || S.phase === 'drive' ? W : myBall(),
        camera,
      );
    }
    // tread the grass: cart wheels lay tracks, golfers trample where they stand and walk
    for (const [id, c] of [['me', roam.cart], ...remoteCarts] as [string, Vehicle | null][])
      c?.contacts?.().forEach((p, i) => p.y - heightAt(p.x, p.z) < 0.25 && grass.press(id + 'w' + i, p.x, p.z, 0.42));
    for (const [id, a] of avatars) if (a.root.visible) grass.press(id + 'f', a.root.position.x, a.root.position.z, 0.5);
    grass.update(dt, camera.position);
    scarers.length = 0;
    scarers.push({ x: W.x, z: W.z, spd: W.spd });
    for (const [id, a] of avatars)
      if (id !== net.sessionId && a.root.visible) scarers.push({ x: a.root.position.x, z: a.root.position.z, spd: a.wspd || 0 });
    for (const c of remoteCarts.values()) scarers.push({ x: c.root.position.x, z: c.root.position.z, spd: Math.abs(c.speed()) });
    critters.update(dt, camera, scarers);
    showControls();
    light.sun.castShadow = opts.shadows;
    ambience.update(dt, {
      carts: [...remoteCarts.values()].map(c => ({ pos: c.root.position, speed: c.speed() })),
      zone: 'course',
      cam: camera,
      cart:
        S.phase === 'drive' && roam.cart
          ? {
              speed: roam.cart.speed(),
              drift: roam.cart.drifting?.() || 0,
              engine: roam.cart.engine?.() || null,
              throttle: (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0),
            }
          : null,
    });
    pw?.step(dt);
    bursts.update(dt, heightAt);
    const me = net.me();
    if (me && S.phase === 'aim' && !me.busy) {
      autoSetup();
      {
        const k = `${S.autoFor}|${S.club}|${S.puttRange}`;
        if (k !== S.targetFor) {
          S.targetFor = k;
          S.target = clamp(needPower(), 0.1, 1);
        }
      }
      const pw = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      if (pw) S.target = clamp(S.target + pw * dt * (birdsEye() ? 0.12 : 0.3), 0.05, 1); // 100% is the club's full swing   // dial the shot: W/S or ↑/↓
      const aimRate = (isPutt() ? 0.35 : 0.7) * (birdsEye() ? 0.3 : 1); // the overhead view magnifies small turns: go slower
      if (held.has('KeyA') || held.has('ArrowLeft')) S.aimYaw += dt * aimRate;
      if (held.has('KeyD') || held.has('ArrowRight')) S.aimYaw -= dt * aimRate;
    }
    if (me) net.sendPos(me.ballX, me.ballZ, S.aimYaw, S.phase === 'aim' ? 'address' : 'swing');
    if (me)
      net.sendBody?.({
        m: S.phase === 'walk' ? 'walk' : S.phase === 'drive' ? 'drive' : 'addr',
        x: +W.x.toFixed(2),
        z: +W.z.toFixed(2),
        yaw: +W.yaw.toFixed(2),
        spd: +W.spd.toFixed(1),
        v: roam.cart ? roam.cart.state() : null,
        rg: myRg && Date.now() - myRg.t < 6000 ? myRg : null,
      });
    // swing timing — identical maths to the prototype so the feel carries over
    const tm = S.tempo;
    if (S.phase === 'power') {
      // up to the top, a beat, then back down; reaching the bottom without a click cancels the swing
      S.t += rdt;
      const T = tm.up * (0.5 + 0.5 * Math.min(1, S.target)),
        s = Math.min(1, S.t / T); // part 1: the backswing rises to your dialled power
      S.power = S.target * (s < 0.5 ? 2 * s * s : 1 - 2 * (1 - s) * (1 - s));
      if (s >= 1) {
        S.power = S.target;
        lock();
      } // part 2 (timing) starts by itself at the top
    } else if (S.phase === 'acc') {
      S.t += rdt;
      const s = Math.max(0, S.t - tm.hang) / tm.down;
      S.m = S.p0 * (1 - Math.pow(s, tm.ex));
      S.u = (S.t - tm.hang - tm.down) * tm.rate;
      if (S.u >= -swingU0() * METER_OVERRUN) {
        /* the marker ran off the end of the meter */
        S.phase = 'aim';
        S.t = 0;
        S.u = 0;
        toast('Swing called off: no second press', 1400);
      }
    } /* no hit press = no shot */
    else if (S.phase === 'follow') {
      S.followT += dt;
      if (S.followT > 6) S.phase = 'aim';
    }
    if (teeOff && S.phase === 'aim' && net.me() && avatars.get(net.sessionId)) {
      // a new hole starts with you standing by your ball on the tee, not already over it: E (or T) addresses it
      teeOff = false;
      autoSetup();
      const b = myBall(),
        fx = Math.sin(S.aimYaw),
        fz = Math.cos(S.aimYaw);
      W.x = b.x - fx * 2.4 - fz * 1.3;
      W.z = b.z - fz * 2.4 + fx * 1.3;
      W.yaw = W.camYaw = S.aimYaw;
      W.vx = W.vz = 0;
      S.phase = 'walk';
    }
    turns.update();
    updateAim();
    updateFlag(dt);
    updateHUD();
    turns.renderUI();
    // minimap: predicted flight at the power the pin needs, every ball, live flight trails
    const canPreview = !!me && S.phase === 'aim' && !me.busy && !me.done;
    minimap.setPreview(
      canPreview ? myBall() : null,
      canPreview ? { club: S.club, power: S.target, u: 0, aimYaw: S.aimYaw, puttRange: S.puttRange, spin: { top: 0, back: 0, side: 0 } } : null,
      net.wind(),
    );
    const mb: MiniBall[] = [];
    for (const [id, p] of players) {
      const a = avatars.get(id);
      if (!a || (p.done && !a.play) || (T && id !== net.sessionId && (p.h ?? T.h) !== T.h)) continue;
      const tNow = performance.now() / 1000 - a.t0;
      mb.push({
        x: a.ballPos.x,
        z: a.ballPos.z,
        color: p.color,
        me: id === net.sessionId,
        trail: a.play ? a.play.result.frames.filter(f => f[0] <= tNow) : undefined,
      });
    }
    minimap.draw(dt, mb, !!net.me()?.teed && S.phase === 'aim'); // the hole's two lines, until you tee off
    // camera: behind the ball at address, chase the ball while our shot plays
    const mine = avatars.get(net.sessionId),
      b = myBall();
    const hold =
      mine && (mine.pending || (mine.play && mine.tImp < (mine.club === 'putter' ? 0 : 0.42))) ? (mine.pending || mine.play)!.result.frames[0] : null;
    if (hold) {
      b.x = hold[1];
      b.z = hold[3];
    }
    if (S.phase === 'walk' || S.phase === 'drive') {
      const a = avatars.get(net.sessionId),
        lim = a?.flop?.state === 'sim' ? a.flop.hips(new THREE.Vector3()) : null;
      const tx = lim ? lim.x : S.phase === 'drive' && roam.cart ? roam.cart.root.position.x : W.x,
        tz = lim ? lim.z : S.phase === 'drive' && roam.cart ? roam.cart.root.position.z : W.z;
      const ty = lim ? lim.y - 0.8 : S.phase === 'drive' && roam.cart ? roam.cart.root.position.y : heightAt(W.x, W.z);
      if (S.phase === 'drive' && roam.cart && clock - W.lastLook > 1.0) {
        let d = cartYaw(roam.cart) - W.camYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        W.camYaw += d * (1 - Math.exp(-dt * 2.5));
      } else if (S.phase === 'walk' && W.spd > 1 && clock - W.lastLook > 1.2) {
        let d = W.yaw - W.camYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        W.camYaw += d * (1 - Math.exp(-dt * 1.4));
      }
      const dist = S.phase === 'drive' ? 6.2 : 4.6,
        cp = Math.cos(W.camPitch);
      v3.set(tx - Math.sin(W.camYaw) * dist * cp, ty + 1.6 + Math.sin(W.camPitch) * dist, tz - Math.cos(W.camYaw) * dist * cp);
      v3.y = Math.max(v3.y, heightAt(v3.x, v3.z) + 0.6);
      camLook.lerp(new THREE.Vector3(tx, ty + 1.4, tz), 1 - Math.exp(-dt * 10));
    } else if (mine?.play && !hold) {
      const bp = mine.ballPos;
      v3.set(bp.x - Math.sin(S.aimYaw) * 14, Math.max(bp.y, heightAt(bp.x, bp.z)) + 5, bp.z - Math.cos(S.aimYaw) * 14);
      camLook.lerp(bp, 1 - Math.exp(-dt * 6));
    } else if (birdsEye()) {
      // hold Shift while aiming: look straight down on where the ball will land (A/D still aim)
      const putt = isPutt(),
        sx = Math.sin(S.aimYaw),
        sz = Math.cos(S.aimYaw);
      const tx = putt ? (b.x + COURSE.pin.x) / 2 : ring.position.x,
        tz = putt ? (b.z + COURSE.pin.z) / 2 : ring.position.z,
        ty = heightAt(tx, tz);
      const h = putt ? clamp(toPin() * 1.3, 6, 22) : clamp(carryOf(S.club) * 0.6, 22, 120);
      v3.set(tx - sx * h * 0.18, ty + h, tz - sz * h * 0.18); // a touch behind, so up on screen = the aim direction
      camLook.lerp(new THREE.Vector3(tx, ty, tz), 1 - Math.exp(-dt * 9));
    } else {
      // over the shoulder: behind the ball, nudged toward the golfer so they fill the lower-left third
      const putt = isPutt(),
        by = heightAt(b.x, b.z),
        back = putt ? 2.9 : 4.6,
        sx = Math.sin(S.aimYaw),
        sz = Math.cos(S.aimYaw),
        side = putt ? 0.12 : 0.55; // left of the aim line = golfer side
      v3.set(b.x - sx * back + sz * side, by + (putt ? 1.75 : 1.7), b.z - sz * back - sx * side);
      // putting: look down the line at the putt itself (the hole, or a bit past it on long putts)
      const ahead = putt ? clamp(toPin() * 0.75, 2.5, 12) : 22;
      camLook.lerp(new THREE.Vector3(b.x + sx * ahead, by + (putt ? 0 : 1.2), b.z + sz * ahead), 1 - Math.exp(-dt * 6));
    }
    const be = birdsEye();
    ring.scale.setScalar(be ? clamp(carryOf(S.club) / 60, 1, 3) : 1);
    // from above, the ring draws over the ground (on a slope the turf used to cut it into an arc), and the cup is marked
    (ring.material as THREE.Material).depthTest = !be;
    pinMark.visible = be;
    if (be) {
      pinMark.position.set(COURSE.pin.x, heightAt(COURSE.pin.x, COURSE.pin.z) + 0.08, COURSE.pin.z);
      pinMark.scale.setScalar((isPutt() ? clamp(toPin() / 14, 0.35, 1) : clamp(carryOf(S.club) / 60, 1, 3)) * (1 + 0.12 * Math.sin(clock * 5)));
    }
    camPos.lerp(v3, 1 - Math.exp(-dt * (S.phase === 'walk' || S.phase === 'drive' ? 9 : be || wasBirds ? 7 : 4)));
    wasBirds = be || (wasBirds && camPos.distanceTo(v3) > 1);
    camera.position.copy(camPos);
    if (camKick > 0.001) {
      camera.position.x += (Math.random() - 0.5) * camKick;
      camera.position.y += (Math.random() - 0.5) * camKick;
      camKick *= Math.exp(-dt * 14);
    }
    camera.lookAt(camLook);
    // lens: creeps in as power builds, punches out at impact
    const wantFov =
      52 -
      (S.phase === 'power' || S.phase === 'acc' ? 3 * Math.min(1, S.phase === 'power' ? S.power : S.p0) : 0) +
      fovPunch +
      (S.phase === 'drive' ? DRIVE_FX.fov : 0);
    fovPunch *= Math.exp(-dt * 7);
    if (Math.abs(camera.fov - wantFov) > 0.01) {
      camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 10));
      camera.updateProjectionMatrix();
    }
    snapSun(light.sun, light.SUN_DIR, camLook, 150);
    light.sky.position.copy(camera.position);
    light.sunDisc.position.copy(camera.position).addScaledVector(light.SUN_DIR, 1200);
    light.sunDisc.lookAt(camera.position);
    // meter anchored to our golfer on screen
    const root = mine?.root;
    let feetX = innerWidth / 2,
      feetY = innerHeight * 0.7,
      hpx = 200;
    if (root) {
      const f = root.position.clone().project(camera),
        h = root.position
          .clone()
          .add(new THREE.Vector3(0, 1.8, 0))
          .project(camera);
      feetX = ((f.x + 1) / 2) * innerWidth;
      feetY = ((1 - f.y) / 2) * innerHeight;
      hpx = Math.abs(feetY - ((1 - h.y) / 2) * innerHeight);
    }
    const u0 = swingU0(),
      af: ArcFrame = {
        phase: S.phase === 'power' ? 'power' : S.phase === 'acc' ? 'acc' : S.phase === 'follow' ? 'follow' : 'idle',
        u: S.phase === 'aim' ? u0 : S.phase === 'power' ? u0 + S.t * S.tempo.rate : S.u,
        u0,
        win: S.phase === 'aim' || S.phase === 'power' ? windows(S.target, CLUBS[S.club], lieOf(), undefined, slopeOf()) : S.win,
        scale: S.phase === 'aim' || S.phase === 'power' ? S.target : S.p0,
        line1: isPutt() ? `${Math.round(shotDist() * FT_PER_M)} FT PUTT` : `${yd(shotDist())} YD SHOT`,
        line2: isPutt() ? `${Math.round(toPin() * FT_PER_M)} FT TO PIN` : `${yd(toPin())} YD TO PIN`,
        feetX,
        feetY,
        hpx,
        putt: isPutt(),
        time: clock,
        ball: cur.look?.ball || 'classic',
        grade: S.phase === 'follow' ? lastStrike?.grade : undefined,
        late: lastStrike?.late,
      };
    meter.update(
      af,
      dt,
      !!me && !me.done && !birdsEye() && (S.phase === 'aim' || S.phase === 'power' || S.phase === 'acc' || (S.phase === 'follow' && S.followT < 0.6)),
    );
    // round over: my ball is in (or I gave up) and nothing is still flying
    if (me && me.done && !mine?.play && !mine?.pending && !endShown) {
      endT += dt;
      if (endT > 1.4 && !mine?.golfer.busy()) showEnd(false);
    } else if (!me?.done) endT = 0; // the end card waits for the pick-up / cheer
    if (endShown) renderEnd();
    if (dev.cam) {
      camera.position.set(dev.cam[0], dev.cam[1], dev.cam[2]);
      camera.lookAt(dev.cam[3], dev.cam[4], dev.cam[5]);
    } /* dev: a fixed camera for screenshots */
    if (devCam) {
      // dev: hold the camera somewhere for a look (window.__gh.look)
      camera.position.set(devCam[0], devCam[1], devCam[2]);
      camera.lookAt(devCam[3], devCam[4], devCam[5]);
    }
    tickWater(performance.now() / 1000);
    renderer.render(scene, camera);
  }

  // ---------------- start / stop / scorecard ----------------
  const esc = (t: string) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  let endShown = false,
    endT = 0,
    endHTML = '';
  const scoreName = (n: number) => {
    const d = n - COURSE.par;
    return n === 1
      ? 'Hole in one!'
      : d <= -3
        ? 'Albatross'
        : d === -2
          ? 'Eagle'
          : d === -1
            ? 'Birdie'
            : d === 0
              ? 'Par'
              : d === 1
                ? 'Bogey'
                : d === 2
                  ? 'Double bogey'
                  : `+${d}`;
  };
  function showEnd(quitting: boolean) {
    endShown = true;
    endHTML = '';
    $('golfcard').classList.toggle('tour', !!T && !quitting);
    (renderEnd as any).quitting = quitting;
    $('golfcard').classList.remove('hidden');
    renderEnd();
  }
  function renderEnd() {
    const me = net.me(),
      quitting = (renderEnd as any).quitting && !(me?.done && !T);
    if (T && !quitting) return renderTour();
    const rows = [...net.players()].map(([id, p]) => ({ id, p })).sort((a, b) => (a.p.done ? a.p.strokes : 99) - (b.p.done ? b.p.strokes : 99));
    const list = rows
      .map(
        ({ id, p }, i) =>
          `<div class="row"><b>${p.done ? i + 1 : '–'}</b><i style="background:${p.color}"></i><span>${id === net.sessionId ? 'You' : esc(p.name)}</span><em>${p.done ? `${p.strokes} · ${scoreName(p.strokes)}` : `on the course · ${p.strokes}`}</em></div>`,
      )
      .join('');
    const head = quitting
      ? (T
          ? `<h2>Leave the tournament?</h2><p class="muted">You'll be out of ${esc(T.cup.title)}.</p>`
          : '<h2>Leave the round?</h2><p class="muted">Your score won\'t count.</p>') +
        (bets.atRisk() ? `<p class="warn">You'll forfeit ${money(bets.atRisk())} in open bets.</p>` : '')
      : `<h2>${me ? scoreName(me.strokes) : 'Round over'}</h2><p class="muted">${me ? `${me.strokes} strokes · par ${COURSE.par}${COURSE.code ? ` · hole code <b>${COURSE.code}</b>` : ''}` : ''}</p>`;
    const btns = quitting
      ? '<button id="gc-stay">Keep playing</button><button id="gc-lobby" class="primary">Back to the lobby</button>'
      : `<button id="gc-lobby" class="primary">${bets.atRisk() ? `Leave and forfeit ${money(bets.atRisk())}` : 'Back to the lobby'}</button>`;
    const html = `${head}<div class="standings">${list}</div>${quitting ? '' : bets.cardHTML()}<div class="btns">${btns}</div>`;
    if (html === endHTML) return;
    endHTML = html;
    $('golfcard').innerHTML = html;
    const lb = document.getElementById('gc-lobby');
    if (lb) lb.onclick = () => env.onExit();
    const st = document.getElementById('gc-stay');
    if (st)
      st.onclick = () => {
        endShown = false;
        $('golfcard').classList.add('hidden');
      };
  }
  // ---------------- tournaments: a mini cup (3 holes) or a championship (9). Cards and standings: golf/tournament.ts
  let T: Tour | null = null;
  const tp = toParText;
  const standings = () => tourStandings(T!, net.players());
  function loadTourHole(i: number) {
    const t = T!;
    loadHole(t.holes[i]);
    COURSE.number = i + 1;
    $('h-num').textContent = String(i + 1);
    $('h-name').textContent = `${t.cup.title} · Hole ${i + 1} of ${t.n} · Par ${COURSE.par}`;
  }
  function nextTourHole() {
    const t = T!;
    if (t.h >= t.n - 1) return;
    const uidOf = (id: string) => (id === net.sessionId ? cur.uid : net.players().get(id)?.uid || id);
    t.teeOrder = teeOrderFor(
      turns.listOrder,
      t.teeOrder,
      new Map(
        standings()
          .filter(r => r.thru)
          .map(r => [uidOf(r.id), r.toPar]),
      ),
    ); // last place tees off first
    t.h++;
    t.allDoneAt = 0;
    turns.reset();
    loadTourHole(t.h);
    net.nextHole?.(t.h);
    Object.assign(S, { phase: 'aim', club: 0, aimYaw: 0, puttRange: 1, t: 0, power: 0, p0: 0, m: 0, u: 0, followT: 0, watchShot: null, autoFor: '' });
    teeOff = true;
    for (const a of avatars.values()) {
      a.play = null;
      a.pending = null;
      a.teeSeen = false;
      a.doneSeen = false;
      a.wx = NaN;
    }
    endShown = false;
    endT = 0;
    endHTML = '';
    $('golfcard').classList.add('hidden');
    boardHTML = '';
    tracer.reset();
    toast(`Hole ${t.h + 1} of ${t.n} · Par ${COURSE.par}`, 2200);
  }
  function renderTour() {
    const t = T!,
      last = t.h === t.n - 1,
      wait = tourWaiting(t, net.players(), net.sessionId),
      rows = standings(),
      now = performance.now();
    if (wait.length) t.allDoneAt = 0;
    else if (!t.allDoneAt) t.allDoneAt = now;
    if (!last && t.allDoneAt && now - t.allDoneAt > 6000) {
      nextTourHole();
      return;
    }
    const s = net.me()?.strokes || 0,
      card = tourCardHTML(t, rows, {
        wait,
        secsLeft: 6 - Math.floor((now - t.allDoneAt) / 1000),
        strokes: s,
        par: COURSE.par,
        scoreName: scoreName(s),
        myName: cur.name,
        extra: bets.cardHTML(),
      });
    if (card.final) {
      const { done, iWon } = tourWinners(t, rows);
      if (iWon && !t.awarded) {
        t.awarded = true;
        const me = rows.find(r => r.me)!;
        awardTrophy({
          id: cur.matchId.slice(0, 24),
          seed: t.seed,
          n: t.n,
          title: t.cup.title,
          at: Date.now(),
          strokes: me.st,
          toPar: me.toPar,
          field: done.length,
          who: cur.name,
          // the final scoreboard goes on the trophy: everyone who finished, best first
          board: [...done].sort((a, b) => a.st - b.st).map(r => ({ n: r.me ? cur.name : r.name || '?', s: r.st, p: r.toPar })),
        }).then(ok => {
          if (ok) {
            toast('🏆 Trophy added to your case!', 3000);
            playSample('trophy', 0.6);
            sfx.bonk(0.5);
          }
        });
      }
    }
    const html = card.html;
    if (html !== endHTML) {
      endHTML = html;
      $('golfcard').innerHTML = html;
      $('golfcard').classList.add('tour');
      const b = (id: string) => document.getElementById(id);
      if (b('gc-lobby')) b('gc-lobby')!.onclick = () => env.onExit();
      if (b('gc-quit'))
        b('gc-quit')!.onclick = () => {
          if (bets.atRisk()) {
            (renderEnd as any).quitting = true;
            endHTML = '';
            renderEnd();
          } else env.onExit();
        };
      if (b('gc-next')) b('gc-next')!.onclick = () => nextTourHole();
      const cv = b('gc-trophy') as HTMLCanvasElement | null;
      if (cv && t.canvas !== cv) {
        t.view?.dispose();
        t.view = new TrophyView(cv, t.seed, t.n, t.sub || '');
        t.canvas = cv;
      }
    }
    t.view?.update(clock);
  }

  // ---------------- turns (group rounds): golf/turns.ts ----------------
  const BEAM_GEO = new THREE.CylinderGeometry(0.16, 0.16, 14, 12, 1, true);
  const turns = createTurns({
    active: () => active,
    group: () => cur.group,
    endShown: () => endShown,
    sessionId: () => net.sessionId,
    uid: () => cur.uid,
    players: () => net.players(),
    me: () => net.me(),
    elsewhere: (_id, p) => !!T && (p.h ?? T.h) !== T.h,
    playingBack: id => {
      const a = avatars.get(id);
      return !!a?.play || !!a?.pending;
    },
    pin: () => COURSE.pin,
    teeOrder: () => T?.teeOrder || null,
    hole: () => T?.h ?? 0,
    clockHeld: () => bets.blocking(),
    midShot: () => ['power', 'acc', 'follow', 'sent', 'watch'].includes(S.phase),
    penalize: gs => net.penalize?.(gs),
    toast: (t, ms) => toast(t, ms),
    chime: v => sfx.bonk(v),
  });

  // ---------------- betting (design/golf-betting.md; rules in shared/src/bets.ts) ----------------
  const _betP = new THREE.Vector3();
  const bets = createBets({
    uid: () => cur.uid,
    seats: () =>
      [...net.players()].map(([id, p]) => {
        const mine = id === net.sessionId;
        return { id, uid: mine ? cur.uid : p.uid, name: mine ? cur.name : p.name, color: p.color, me: mine, p };
      }),
    on: () => active && cur.group && !turns.casual && !!net.setBets && !!net.online?.(),
    hole: () => T?.h ?? 0,
    holes: () => T?.n ?? 1,
    par: () => COURSE.par,
    tour: () => !!T,
    pin: () => COURSE.pin,
    onGreen: (x, z) => surfaceAt(x, z) === 'green',
    turnUid: () => {
      if (!turns.on || !turns.turn.id || turns.turn.phase === 'flight' || turns.turn.phase === 'done') return null;
      return turns.turn.id === net.sessionId ? cur.uid : net.players().get(turns.turn.id)?.uid || null;
    },
    publish: bt => net.setBets?.(bt),
    cash: () => progress().cash,
    addCash: d => {
      addCash(d);
    },
    toast: (t, ms) => toast(t, ms),
    chime: good => sfx.bonk(good ? 0.3 : 0.12),
    screenOf: id => {
      const a = avatars.get(id);
      if (!a) return null;
      _betP.copy(a.root.position);
      _betP.y += 2.2;
      _betP.project(camera);
      return _betP.z < 1 ? { x: ((_betP.x + 1) / 2) * innerWidth, y: ((1 - _betP.y) / 2) * innerHeight } : null;
    },
  });
  const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  function start(o: GolfStart) {
    options.context('On the course', () => (endShown ? [] : [{ label: 'Leave the round', danger: true, run: () => showEnd(true) }]));
    cur = o;
    for (const id of [...avatars.keys()]) dropAvatar(id);
    bets.reset();
    // every player in the match derives the same hole (or the same tournament) from the match id
    T?.view?.dispose();
    T = null;
    locale.id = localeFromMatch(o.matchId);
    turns.begin(/^c/.test(o.matchId), o.order || []);
    const mid = turns.casual ? o.matchId.slice(1) : o.matchId; // 'c…' = casual (everyone at once)
    const tour = parseTournament(mid);
    if (tour) {
      const holes = tournamentHoles(tour.seed, tour.n, tour.card); // (a real course's card sets the pars and where the hard holes fall)
      T = {
        teeOrder: turns.listOrder.slice(),
        n: tour.n,
        seed: tour.seed,
        code: tour.code,
        holes,
        pars: holes.map(x => holeIdea(x).par),
        h: 0,
        cup: {
          ...cupFor(tour.seed, tour.n),
          ...(tour.course != null ? { title: tour.n === 9 ? 'The Home Course Championship' : 'The Home Course Cup' } : {}),
        },
        cards: new Map(),
        who: new Map(),
        allDoneAt: 0,
        awarded: false,
        view: null,
        canvas: null,
      };
      if (tour.course != null) {
        // the real course's name arrives with the course list (fetched once); the cup takes its name
        const mine = T;
        void courseAt(tour.course).then(c => {
          if (c && T === mine) mine.cup.title = `The ${c.name.replace(/^The /i, '')} ${tour.n === 9 ? 'Championship' : 'Cup'}`;
        });
      }
      loadTourHole(0);
    } else loadHole(seedFromMatch(mid));
    Object.assign(S, { phase: 'aim', club: 0, aimYaw: 0, puttRange: 1, t: 0, power: 0, p0: 0, m: 0, u: 0, followT: 0, watchShot: null, autoFor: '' });
    teeOff = true;
    endShown = false;
    endT = 0;
    $('golfcard').classList.add('hidden');
    boardHTML = '';
    net = useServer ? new ServerNet(events, o.matchId, o.look) : new ArtifactNet(events, o.matchId, o.look);
    net.connect(o.name, o.uid);
    active = true;
    last = performance.now();
    document.body.classList.add('mode-golf');
    resize();
    (window as any).__gh = {
      dev,
      look(v: number[] | null) {
        devCam = v;
      },
      /** Dev: roll a ball at the hole from `from` metres at `speed` and trace the drop (x, y, z every 50 ms). */
      cupTest(from = 0.2, speed = 1.2, off = 0.01) {
        const c: CupSim = { x: -from, y: BALL_R, z: off, vx: speed, vy: 0, vz: 0, t: 0, in: false, knock: 0, floored: false, still: 0 },
          out: number[][] = [],
          v = new THREE.Vector3();
        let go = true;
        while (go && out.length < 60) {
          go = cupStep(c, 0.05, v, () => {}, 0);
          out.push([+c.x.toFixed(3), +c.y.toFixed(3), +c.z.toFixed(3)]);
        }
        return out;
      },
      bets,
      nextTourHole,
      get T() {
        return T;
      },
      ring,
      grass,
      S,
      W,
      net,
      press,
      avatars,
      interact: () => roam.interact(),
      remoteCarts,
      get cart() {
        return roam.cart;
      },
      get pw() {
        return pw;
      },
      get pinX() {
        return COURSE.pin.x;
      },
      get pinZ() {
        return COURSE.pin.z;
      },
      knockDown: (id: string) => {
        const b = avatars.get(id);
        if (b) knockDown(b, new THREE.Vector3(1, 0, 0.3), true, 'Test', 'You');
      },
    };
  }
  function stop() {
    turns.hideUI();
    active = false;
    T?.view?.dispose();
    T = null;
    net.disconnect?.();
    for (const id of [...avatars.keys()]) dropAvatar(id);
    document.body.classList.remove('mode-golf');
    $('golfcard').classList.add('hidden');
  }
  return {
    start,
    stop,
    tick,
    get active() {
      return active;
    },
  };
}
