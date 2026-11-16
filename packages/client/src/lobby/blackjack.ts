// Blackjack at the plaza table: the table model, and the game you play there (house rules in shared/src/blackjack.ts).
// Cards and chips are Kenney's Boardgame Pack, sounds are Kenney's Casino Audio (both CC0), packed into
// public/casino/{cards.png, chips.png, sfx.json}. Cash comes from avatar/progress (addCash).
//
// Table frame (local): the dealer's straight edge is at z = -0.45, the felt curves out toward the player at +z.
// The player stands at z ≈ 1.2. The lobby places the table so the player side faces the plaza.
import { sfxOut } from '../audio/ctx';
import * as THREE from 'three';
import {
  handValue,
  isBlackjack,
  rankOf,
  suitOf,
  replayRound,
  seatOptions,
  hostStep,
  cardId,
  cleanSeatPres,
  cleanTableHost,
  BJ_MIN,
  BJ_MAX,
  BJ_SEATS,
  type TableHost,
  type SeatPres,
  type RoundView,
} from '@gh/shared';
import { progress, addCash, loadProgress } from '../avatar/progress';
import { Golfer } from '../characters/golfer';
import { sanitizeLook } from '../avatar/outfit';

const BASE = (import.meta as any).env?.BASE_URL ?? './';
const FELT_Y = 0.875,
  EDGE_Z = -0.45,
  RX = 1.3,
  RZ = 1.22,
  SHOE_X = 1.06,
  SHOE_Z = -0.36; // felt: half-ellipse from the dealer edge
const tex = new THREE.TextureLoader();
/** Seat i (0 = first base, the dealer's left, at +x; play goes clockwise to seat 4 at -x) at distance r from the dealer. */
export const SEAT_ANG = [1.12, 0.56, 0, -0.56, -1.12],
  CIRCLE_R = 0.9,
  CARDS_R = 0.64,
  STAND_R = 1.62,
  SIT_R = 1.58,
  STOOL_H = 0.74;
export function seatSpot(i: number, r: number) {
  const a = SEAT_ANG[i];
  return new THREE.Vector3(Math.sin(a) * r * (RX / 1.3), FELT_Y, EDGE_Z + Math.cos(a) * r * (RZ / 1.3) + (r > 1.4 ? 0.05 : 0));
}
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------- the table ----------------------------------------
function dShape(grow = 0) {
  const s = new THREE.Shape(),
    a = RX + grow,
    b = RZ + grow,
    z0 = EDGE_Z - grow * 0.6;
  s.moveTo(-a, -z0); // shape space (x, -z)
  for (let i = 0; i <= 48; i++) {
    const t = Math.PI * (i / 48);
    s.lineTo(-Math.cos(t) * a, -(EDGE_Z + Math.sin(t) * b));
  }
  s.lineTo(a, -z0);
  s.lineTo(-a, -z0);
  return s;
}
function feltTexture() {
  const W = 1024,
    H = 512,
    c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const px = (x: number) => ((x + 1.4) / 2.8) * W,
    py = (z: number) => ((z + 0.5) / 1.35) * H,
    S = W / 2.8;
  g.fillStyle = '#1d6b3c';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  } // felt nap
  const gold = '#e8c874',
    cx = px(0),
    cy = py(EDGE_Z);
  g.strokeStyle = gold;
  g.lineWidth = 3;
  const arcText = (txt: string, r: number, size: number, spread: number) => {
    g.font = `700 ${size}px Georgia, serif`;
    g.fillStyle = gold;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = txt.length;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * spread;
      g.save();
      g.translate(cx + Math.sin(a) * r * S, cy + Math.cos(a) * r * S);
      g.rotate(-a);
      g.fillText(txt[i], 0, 0);
      g.restore();
    }
  };
  g.beginPath();
  g.arc(cx, cy, 0.44 * S, 0.12 * Math.PI, 0.88 * Math.PI);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, 0.66 * S, 0.1 * Math.PI, 0.9 * Math.PI);
  g.stroke();
  arcText('BLACKJACK PAYS 3 TO 2', 0.5, 19, 1.2);
  arcText('DEALER MUST STAND ON ALL 17s', 0.6, 13, 1.0);
  for (let i = 0; i < 5; i++) {
    // five betting circles, one per seat
    const c = seatSpot(i, CIRCLE_R);
    g.beginPath();
    g.arc(px(c.x), py(c.z), 0.085 * S, 0, Math.PI * 2);
    g.lineWidth = 3;
    g.stroke();
    g.beginPath();
    g.arc(px(c.x), py(c.z), 0.07 * S, 0, Math.PI * 2);
    g.lineWidth = 1.5;
    g.stroke();
  }
  g.font = '700 26px Georgia, serif';
  g.fillStyle = 'rgba(232,200,116,.85)';
  g.textAlign = 'center';
  g.fillText('GOLDEN HILLS', px(0), py(-0.33));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function planarUV(geo: THREE.BufferGeometry) {
  const p = geo.attributes.position,
    uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + 1.4) / 2.8;
    uv[i * 2 + 1] = 1 - (p.getZ(i) + 0.5) / 1.35;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** The plaza's blackjack table, under its umbrella, with two stools. Thick wooden apron, padded rail, real legs. */
export function blackjackTable(umbrella = true) {
  const g = new THREE.Group();
  g.name = 'bjTable';
  const wood = new THREE.MeshStandardMaterial({ color: '#5b3a22', roughness: 0.55 }),
    darkWood = new THREE.MeshStandardMaterial({ color: '#3d2716', roughness: 0.6 });
  const leather = new THREE.MeshStandardMaterial({ color: '#2b1b14', roughness: 0.42 }),
    brass = new THREE.MeshStandardMaterial({ color: '#c9a45a', metalness: 0.85, roughness: 0.3 });
  const add = (m: THREE.Mesh, cast = true) => {
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // apron: the table's thick wooden body under the felt
  const ap = new THREE.ExtrudeGeometry(dShape(0.07), {
    depth: 0.15,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 48,
  });
  ap.rotateX(-Math.PI / 2);
  ap.translate(0, FELT_Y - 0.175, 0);
  add(new THREE.Mesh(ap, wood));
  const felt = planarUV(new THREE.ShapeGeometry(dShape(0), 48).rotateX(-Math.PI / 2));
  felt.translate(0, FELT_Y + 0.002, 0);
  add(new THREE.Mesh(felt, new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 })), false);
  // padded rail around the curve
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = Math.PI * (i / 40);
    pts.push(new THREE.Vector3(-Math.cos(t) * (RX + 0.05), FELT_Y + 0.03, EDGE_Z + Math.sin(t) * (RZ + 0.05)));
  }
  add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.06, 10), leather));
  for (const s of [-1, 1]) {
    const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), leather));
    cap.position.set(s * (RX + 0.05), FELT_Y + 0.03, EDGE_Z);
  }
  // dealer side: a raised wooden lip, the chip tray, the card shoe and the discard holder
  const lip = add(new THREE.Mesh(new THREE.BoxGeometry(2 * RX + 0.2, 0.06, 0.1), darkWood));
  lip.position.set(0, FELT_Y + 0.02, EDGE_Z - 0.06);
  const tray = add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.035, 0.13), darkWood));
  tray.position.set(0, FELT_Y + 0.018, EDGE_Z + 0.08);
  const shoe = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.2), new THREE.MeshStandardMaterial({ color: '#6a1f1f', roughness: 0.5 })));
  shoe.position.set(SHOE_X, FELT_Y + 0.04, SHOE_Z);
  shoe.rotation.y = -0.2; /* in the dealer's corner, clear of the first seat's cards and chips */
  const disc = add(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.08, 0.16),
      new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.3, transparent: true, opacity: 0.7 }),
    ),
  );
  disc.position.set(-SHOE_X, FELT_Y + 0.04, SHOE_Z);
  disc.rotation.y = 0.2;
  // legs: four square legs into the apron, joined by stretchers near the floor
  const LEG_TOP = FELT_Y - 0.17,
    legs: [number, number][] = [
      [-0.95, -0.28],
      [0.95, -0.28],
      [-0.6, 0.45],
      [0.6, 0.45],
    ];
  for (const [x, z] of legs) {
    const l = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, LEG_TOP, 0.09), darkWood));
    l.position.set(x, LEG_TOP / 2, z);
    const f = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 10), brass));
    f.position.set(x, 0.015, z);
  }
  const bar = (a: [number, number], b: [number, number], y: number) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      L = Math.hypot(dx, dz);
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, L), darkWood));
    m.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    m.rotation.y = Math.atan2(dx, dz);
  };
  bar(legs[0], legs[2], 0.2);
  bar(legs[1], legs[3], 0.2);
  bar(legs[0], legs[1], 0.2);
  bar(legs[2], legs[3], 0.62);
  // patio umbrella behind the dealer
  const um = new THREE.Mesh(new THREE.ConeGeometry(2.4, 0.7, 10), new THREE.MeshStandardMaterial({ color: '#e9b23a', roughness: 0.8 }));
  um.position.set(0, 3.05, -0.1);
  um.castShadow = true;
  if (umbrella) g.add(um);
  if (umbrella) {
    const PX = -1.7,
      PZ = -0.95,
      up = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.0, 6), new THREE.MeshStandardMaterial({ color: '#ddd', roughness: 0.4 })));
    up.position.set(PX, 1.5, PZ);
    const ub = add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 14), darkWood));
    ub.position.set(PX, 0.04, PZ);
    const a = new THREE.Vector3(PX, 2.85, PZ),
      b = new THREE.Vector3(0, 2.85, -0.1),
      arm = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(b), 6), new THREE.MeshStandardMaterial({ color: '#ddd' })));
    arm.position.copy(a).add(b).multiplyScalar(0.5);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }
  for (let i = 0; i < 5; i++) {
    // a bar stool at every seat
    const st = new THREE.Group(),
      seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.09, 18), new THREE.MeshStandardMaterial({ color: '#8a2a22', roughness: 0.45 }));
    seat.position.y = STOOL_H - 0.045;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, STOOL_H - 0.09, 8), brass);
    pole.position.y = (STOOL_H - 0.09) / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 20), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 18), darkWood);
    base.position.y = 0.015;
    for (const m of [seat, pole, ring, base]) {
      m.castShadow = true;
      st.add(m);
    }
    st.position.copy(seatSpot(i, SIT_R)).setY(0);
    g.add(st);
  }
  // chips in the dealer's tray
  for (let i = 0; i < 5; i++)
    for (let k = 0; k < 2; k++) {
      const s = chipStack([[1000, 500, 100, 25, 10][i]], 8 + ((i * 3 + k) % 5));
      s.position.set(-0.3 + i * 0.15, FELT_Y + 0.004, EDGE_Z + 0.05 + k * 0.06);
      g.add(s);
    }
  return g;
}

// ---------------------------------------------------------------- cards & chips ------------------------------------
let cardTex: THREE.Texture | null = null;
const cardsTexture = () => {
  if (!cardTex) {
    cardTex = tex.load(BASE + 'casino/cards.png');
    cardTex.colorSpace = THREE.SRGBColorSpace;
    cardTex.anisotropy = 8;
  }
  return cardTex;
};
const CW = 0.115,
  CH = 0.158;
function cardMesh(c: number) {
  const g = new THREE.Group(),
    mat = new THREE.MeshStandardMaterial({ map: cardsTexture(), roughness: 0.55, alphaTest: 0.35 });
  const face = (col: number, row: number, down: boolean) => {
    const p = new THREE.PlaneGeometry(CW, CH);
    p.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
    const u0 = col / 14,
      u1 = (col + 1) / 14,
      v1 = 1 - row / 4,
      v0 = 1 - (row + 1) / 4,
      uv = p.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    const m = new THREE.Mesh(p, mat);
    m.castShadow = true;
    m.position.y = down ? -0.0005 : 0.0005;
    return m;
  };
  const inner = new THREE.Group();
  inner.add(face(rankOf(c), suitOf(c), false), face(13, 0, true));
  g.add(inner);
  g.userData.flip = inner;
  return g;
}
const CHIP = { 1000: 0, 500: 2, 100: 4, 25: 3, 10: 1 } as Record<number, number>;
const CHIP_SIDE = ['#e9e6dc', '#c0392b', '#2e5fb8', '#2e8a4b', '#222222'];
const chipMats = new Map<number, THREE.Material[]>();
let chipTex: THREE.Texture | null = null;
function chipMat(d: number) {
  let m = chipMats.get(d);
  if (m) return m;
  if (!chipTex) {
    chipTex = tex.load(BASE + 'casino/chips.png');
    chipTex.colorSpace = THREE.SRGBColorSpace;
  }
  const i = CHIP[d],
    t = chipTex.clone();
  t.repeat.set(64 / 320, 64 / 102);
  t.offset.set((i * 64) / 320, 1 - 64 / 102);
  t.needsUpdate = true;
  const top = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }),
    side = new THREE.MeshStandardMaterial({ color: CHIP_SIDE[i], roughness: 0.5 });
  m = [side, top, top];
  chipMats.set(d, m);
  return m;
}
const CHIP_GEO = new THREE.CylinderGeometry(0.03, 0.03, 0.0085, 20);
const DENOMS = [1000, 500, 100, 25, 10];
const breakdown = (amt: number) => {
  const out: number[] = [];
  for (const d of DENOMS)
    while (amt >= d && out.length < 30) {
      out.push(d);
      amt -= d;
    }
  return out;
};
/** A stack of chips, biggest at the bottom. `d` is either one denomination repeated n times, or a list of chips. */
function chipStack(d: number[], n?: number) {
  const g = new THREE.Group(),
    list = n ? Array(n).fill(d[0]) : d;
  list.forEach((v, i) => {
    const m = new THREE.Mesh(CHIP_GEO, chipMat(v));
    m.position.y = 0.0045 + i * 0.0086;
    m.rotation.y = i * 1.3;
    m.castShadow = true;
    g.add(m);
  });
  return g;
}

// ---------------------------------------------------------------- sound -------------------------------------------
class Sounds {
  private ctx: AudioContext | null = null;
  private bufs = new Map<string, AudioBuffer>();
  private loading = false;
  async load() {
    if (this.loading) return;
    this.loading = true;
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const j = await (await fetch(BASE + 'casino/sfx.json')).json();
      await Promise.all(
        Object.entries(j).map(async ([k, b64]) => {
          const bin = Uint8Array.from(atob(b64 as string), ch => ch.charCodeAt(0));
          try {
            this.bufs.set(k, await this.ctx!.decodeAudioData(bin.buffer));
          } catch {}
        }),
      );
    } catch {}
  }
  play(prefix: string, vol = 0.6) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const opts = [...this.bufs.keys()].filter(k => k.startsWith(prefix));
    if (!opts.length) return;
    const s = ctx.createBufferSource(),
      g = ctx.createGain();
    s.buffer = this.bufs.get(opts[Math.floor(Math.random() * opts.length)])!;
    s.playbackRate.value = 0.95 + Math.random() * 0.1;
    g.gain.value = vol;
    s.connect(g).connect(sfxOut(ctx));
    s.start();
  }
}

// ---------------------------------------------------------------- the game (multi-seat) -------------------------
// design/blackjack-multiplayer.md. Rounds run on the shared rules in shared/src/bjtable.ts: the host (lowest uid seated)
// publishes the round clock and seed, everyone publishes their seat, bet and actions, every client replays the same round.
export type BJPres = SeatPres & { h?: TableHost };
interface Shown {
  id: number;
  mesh: THREE.Group;
  up: boolean;
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromY: number;
  toY: number;
  t0: number;
  dur: number;
  flipFrom: number;
  flipTo: number;
}
const OUT_LABEL: Record<string, string> = { blackjack: 'BLACKJACK', win: 'WIN', push: 'PUSH', lose: 'LOSE', bust: 'BUST' };
const handText = (cards: number[], bj: boolean) => {
  if (bj) return 'Blackjack!';
  const v = handValue(cards);
  return v.soft && v.total < 21 ? `${v.total - 10}/${v.total}` : String(v.total);
};

export interface BJHost {
  toast(html: string): void;
  onClose(): void;
  sendPres(): void;
  me(): string;
  nameOf(uid: string): string;
  myGolfer(): Golfer;
}

export function createBlackjack(table: THREE.Group, host: BJHost) {
  const sfx = new Sounds();
  let mySeat = -1,
    myBet = 50,
    myActs = '',
    myRound = -1,
    readyFor = 0,
    cam: 'over' | 'first' = 'first',
    lookYaw = 0,
    lookPitch = 0,
    peek = false;
  let T: TableHost | null = null,
    clock = 0,
    busyUntil = 0,
    feltRound = -1,
    debited = '',
    credited = '',
    msg = '',
    timeouts = 0;
  const turnKey = { k: '' },
    others = new Map<string, BJPres>(),
    shown = new Map<number, Shown>(),
    tags = new Map<string, HTMLElement>(),
    snd: [number, string, number][] = [];
  let betStacks: THREE.Group[] = [],
    stackKey = '',
    uiKey = '',
    lastRV: RoundView | null = null;
  const layer = new THREE.Group();
  table.add(layer);
  const SHOE = new THREE.Vector3(SHOE_X, FELT_Y + 0.09, SHOE_Z);

  // ---- the dealer: stands opposite the players; his hands follow each card out of the shoe, and shuffle between hands
  const dealer = new Golfer(
    sanitizeLook({
      skin: '#c99a72',
      hair: '#2a1c12',
      shirt: '#f3f0e8',
      print: '#1d1d1f',
      pants: '#1d1d1f',
      shoes: '#1d1d1f',
      sole: '#1d1d1f',
      cap: '#1d1d1f',
      capStyle: 'none',
      stubble: false,
      ball: 'white',
    } as any),
  );
  dealer.root.position.set(0, 0, -0.98);
  table.add(dealer.root);
  const dHand = { L: new THREE.Vector3(-0.22, FELT_Y + 0.04, -0.42), R: new THREE.Vector3(0.22, FELT_Y + 0.04, -0.42) };
  let shuffleUntil = 0,
    lastPh = '',
    dYaw = 0;
  function dealerTick() {
    let L = new THREE.Vector3(-0.22, FELT_Y + 0.04, -0.42),
      Rt = new THREE.Vector3(0.22, FELT_Y + 0.04, -0.42),
      k = 6;
    if (clock < shuffleUntil) {
      const w = Math.sin(clock * 9) * 0.04;
      L = new THREE.Vector3(-0.1 + w, FELT_Y + 0.1, -0.3);
      Rt = new THREE.Vector3(0.1 + w, FELT_Y + 0.1 - w * 0.5, -0.3);
    }
    for (const sh of shown.values()) {
      // a card in the air: the right hand carries it, the left rests on the shoe
      if (clock >= sh.t0 - 0.2 && clock <= sh.t0 + sh.dur) {
        Rt = clock < sh.t0 ? SHOE.clone().add(new THREE.Vector3(-0.05, 0.02, 0.05)) : sh.mesh.position.clone().add(new THREE.Vector3(0, 0.03, -0.04));
        L = new THREE.Vector3(0.62, FELT_Y + 0.06, -0.32);
        k = 16;
        break;
      }
    }
    dHand.L.lerp(L, 1 - Math.exp(-k * 0.016));
    dHand.R.lerp(Rt, 1 - Math.exp(-k * 0.016));
    /* face whoever's turn it is (between cards); otherwise square to the table */
    let want = 0;
    const act = T?.ph === 'play' && lastRV && !lastRV.done ? lastRV.activeSeat : -1;
    if (act >= 0 && k < 16) {
      const sp = seatSpot(act, SIT_R);
      want = Math.max(-0.75, Math.min(0.75, Math.atan2(sp.x, sp.z + 0.98)));
    }
    dYaw += (want - dYaw) * (1 - Math.exp(-3 * 0.016));
    dealer.root.rotation.y = dYaw;
    const foot = (sx: number) =>
      new THREE.Vector3(sx * Math.cos(dYaw) + 0.02 * Math.sin(dYaw), 0, -0.98 + 0.02 * Math.cos(dYaw) - sx * Math.sin(dYaw));
    table.updateMatrixWorld();
    const w = (v: THREE.Vector3) => table.localToWorld(v.clone());
    dealer.update({
      mode: 'stand',
      s: 0,
      club: 'iron',
      time: clock,
      turn: 0,
      ik: { hands: [w(dHand.L), w(dHand.R)], feet: [w(foot(-0.13)), w(foot(0.13))] },
    } as any);
  }
  /** Seat a golfer (you, or another player) on the stool at a seat, hands resting on the rail. */
  function seatGolfer(g: Golfer, seat: number, t: number) {
    table.updateMatrixWorld();
    const w = (v: THREE.Vector3) => table.localToWorld(v.clone()),
      a = SEAT_ANG[seat],
      tx = Math.cos(a),
      tz = -Math.sin(a);
    const at = w(seatSpot(seat, SIT_R)),
      face = w(new THREE.Vector3(0, FELT_Y, EDGE_Z)),
      rail = seatSpot(seat, 1.27),
      foot = seatSpot(seat, SIT_R - 0.2);
    g.root.position.set(at.x, 0, at.z);
    g.root.rotation.set(0, Math.atan2(face.x - at.x, face.z - at.z), 0);
    const hands: [THREE.Vector3, THREE.Vector3] = [
      w(rail.clone().add(new THREE.Vector3(tx * 0.17, 0.07, tz * 0.17))),
      w(rail.clone().add(new THREE.Vector3(-tx * 0.17, 0.07, -tz * 0.17))),
    ];
    const feet: [THREE.Vector3, THREE.Vector3] = [
      w(
        foot
          .clone()
          .setY(0.3)
          .add(new THREE.Vector3(tx * 0.12, 0, tz * 0.12)),
      ),
      w(
        foot
          .clone()
          .setY(0.3)
          .add(new THREE.Vector3(-tx * 0.12, 0, -tz * 0.12)),
      ),
    ];
    if (g.root.userData.hipOff === undefined) {
      g.update({ mode: 'sit', s: 0, club: 'iron', time: t, turn: 0 } as any);
      const hb = (g as any).by?.Hips as THREE.Bone | undefined;
      g.root.userData.hipOff = hb ? hb.getWorldPosition(new THREE.Vector3()).y - g.root.position.y : 0.95;
    }
    g.root.position.y = w(new THREE.Vector3()).y + STOOL_H + 0.06 - g.root.userData.hipOff; // the table may sit on a raised floor
    g.update({ mode: 'sit', s: 0, club: 'iron', time: t, turn: 0, ik: { hands, feet } } as any);
  }
  // looking around while seated: drag the mouse (a little), hold Shift to lean in and peek at your cards
  addEventListener('pointermove', e => {
    if (mySeat < 0 || cam !== 'first' || !(e.buttons & 1)) return;
    lookYaw = Math.max(-0.7, Math.min(0.7, lookYaw - e.movementX * 0.004));
    lookPitch = Math.max(-0.45, Math.min(0.35, lookPitch - e.movementY * 0.004));
  });
  addEventListener('keydown', e => {
    if (mySeat >= 0 && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) peek = true;
  });
  addEventListener('keyup', e => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') peek = false;
  });

  // ---- who sits where (a seat claimed twice goes to the lower uid)
  function seatedMap() {
    const m = new Map<number, { uid: string; p: SeatPres }>(),
      me = host.me();
    const all: [string, SeatPres][] = [...others.entries()].filter(([, p]) => p && p.s >= 0 && p.s < BJ_SEATS);
    if (mySeat >= 0) all.push([me, myPres()]);
    for (const [uid, p] of all) {
      const cur = m.get(p.s);
      if (!cur || uid < cur.uid) m.set(p.s, { uid, p });
    }
    return m;
  }
  const myPres = (): SeatPres => ({ s: mySeat, b: myBet, r: myRound, a: myActs, k: readyFor || undefined });
  const actsFor = (h: TableHost) => {
    const a: Record<number, string> = {};
    for (const [s, x] of seatedMap()) if (x.p.r === h.r) a[s] = x.p.a;
    if (mySeat >= 0 && myRound === h.r) a[mySeat] = myActs;
    return a;
  };
  const amHost = () => {
    const m = seatedMap();
    if (mySeat < 0 || !m.size) return false;
    return [...m.values()].every(x => x.uid >= host.me());
  };
  const inRound = (h: TableHost | null) => !!h && h.ph !== 'bet' && h.p.some(x => x[1] === host.me() && x[0] === mySeat);

  // ---- UI
  const ui = document.createElement('div');
  ui.id = 'lbj';
  ui.className = 'hidden';
  (document.getElementById('lobbyui') || document.body).appendChild(ui);
  const tagLayer = document.createElement('div');
  tagLayer.id = 'lbjtags';
  ui.appendChild(tagLayer);
  const ban = document.createElement('div');
  ban.id = 'bjban';
  ui.appendChild(ban);
  const panel = document.createElement('div');
  panel.className = 'bjp';
  ui.appendChild(panel);
  const chipBtn = (d: number) =>
    `<button class="chip" data-chip="${d}" style="background-image:url(${BASE}casino/chips.png);background-position:${-CHIP[d] * 52}px 0" title="${money(d)}"><b>${d >= 1000 ? d / 1000 + 'K' : d}</b></button>`;
  function render(rv: RoundView | null) {
    const cash = progress().cash,
      busy = clock < busyUntil,
      ph = T?.ph || 'bet',
      mine = inRound(T),
      opts = T && ph === 'play' && !busy && rv?.activeSeat === mySeat ? seatOptions(T, actsFor(T), mySeat) : null;
    const key = [
      cash,
      myBet,
      ph,
      busy,
      msg,
      !!opts && JSON.stringify(opts && { ...opts, hand: opts.hand.bet }),
      readyFor === (T?.r ?? 0) + 1,
      mine,
      cam,
      mySeat,
    ].join('|');
    if (key === uiKey) return;
    uiKey = key;
    let h = `<div class="bjtop"><span>Cash <b>${money(cash)}</b></span><span>Your bet <b>${money(myBet)}</b></span><span class="lim">${money(BJ_MIN)}–${money(BJ_MAX)} · seat ${mySeat + 1}</span><button data-a="cam" class="sm">${cam === 'over' ? 'Over shoulder' : 'First person · drag to look, Shift to lean in'} <kbd>V</kbd></button></div>`;
    if (msg && ph !== 'play') h += `<div class="bjmsg">${msg}</div>`;
    if (opts) {
      h += `<div class="bjrow">
        <button data-a="h" ${opts.hit ? '' : 'disabled'}>Hit <kbd>H</kbd></button>
        <button data-a="s">Stand <kbd>S</kbd></button>
        <button data-a="d" ${opts.double && cash >= opts.hand.bet ? '' : 'disabled'}>Double <kbd>D</kbd></button>
        <button data-a="p" ${opts.split && cash >= opts.hand.bet ? '' : 'disabled'}>Split <kbd>P</kbd></button></div>`;
    } else if (ph === 'bet') {
      const ready = readyFor === (T?.r ?? 0) + 1;
      h += `<div class="bjrow chips">${[10, 25, 100, 500, 1000].map(chipBtn).join('')}</div>
        <div class="bjrow"><button data-a="clear" ${myBet ? '' : 'disabled'}>${myBet ? 'Clear' : 'Sitting out'}</button>
        <button data-a="ready" class="primary" ${myBet >= BJ_MIN && myBet <= cash && !ready ? '' : 'disabled'}>${ready ? 'Ready ✓' : 'Ready'} <kbd>Space</kbd></button>
        <button data-a="leave">Leave table <kbd>Esc</kbd></button></div>`;
    } else h += `<div class="bjrow"><button data-a="leave" ${mine && ph === 'play' ? 'disabled' : ''}>Leave table <kbd>Esc</kbd></button></div>`;
    if (ph === 'bet' && cash < BJ_MIN)
      h += `<div class="bjmsg dim">You're out of cash. More ways to earn it are on the way (the Street Dealer).</div>`;
    panel.innerHTML = h;
    panel.querySelectorAll<HTMLButtonElement>('button[data-chip]').forEach(b => (b.onclick = () => addChip(+b.dataset.chip!)));
    panel.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach(b => (b.onclick = () => act(b.dataset.a!)));
  }

  // ---- actions
  function addChip(d: number) {
    if (T?.ph !== 'bet' && T) return;
    const cash = progress().cash;
    if (myBet + d > Math.min(BJ_MAX, cash)) {
      host.toast(myBet + d > BJ_MAX ? `Table maximum is ${money(BJ_MAX)}.` : 'Not enough cash for that chip.');
      return;
    }
    myBet += d;
    readyFor = 0;
    sfx.play('chipLay', 0.7);
    host.sendPres();
  }
  async function act(a: string) {
    if (a === 'cam') {
      cam = cam === 'over' ? 'first' : 'over';
      uiKey = '';
      return;
    }
    if (a === 'leave') return leave();
    if (a === 'clear') {
      if (T?.ph === 'bet' || !T) {
        myBet = 0;
        readyFor = 0;
        host.sendPres();
      }
      return;
    }
    if (a === 'ready') {
      if ((T?.ph === 'bet' || !T) && myBet >= BJ_MIN && myBet <= progress().cash) {
        readyFor = (T?.r ?? 0) + 1;
        sfx.play('chipsStack', 0.5);
        host.sendPres();
      }
      return;
    }
    if (!T || T.ph !== 'play' || clock < busyUntil) return;
    const o = seatOptions(T, actsFor(T), mySeat);
    if (!o) return;
    if ((a === 'd' && !o.double) || (a === 'p' && !o.split) || (a === 'h' && !o.hit)) return;
    if (a === 'd' || a === 'p') {
      if (!(await addCash(-o.hand.bet))) {
        host.toast('Not enough cash.');
        return;
      }
      sfx.play('chipsStack', 0.6);
    }
    if (myRound !== T.r) {
      myRound = T.r;
      myActs = '';
    }
    myActs += a;
    timeouts = 0;
    host.sendPres();
  }
  function sit(i: number) {
    const m = seatedMap();
    if (m.has(i) && m.get(i)!.uid !== host.me()) {
      host.toast('That seat is taken.');
      return false;
    }
    mySeat = i;
    myActs = '';
    myRound = -1;
    readyFor = 0;
    msg = '';
    timeouts = 0;
    uiKey = '';
    if (myBet > progress().cash) myBet = 0;
    ui.classList.remove('hidden');
    document.body.classList.add('bj-on');
    sfx.load();
    loadProgress();
    sfx.play('cardShuffle', 0.4);
    host.sendPres();
    return true;
  }
  function leave(force = false) {
    if (mySeat < 0) return;
    if (!force && T?.ph === 'play' && inRound(T) && lastRV && !lastRV.done && !lastRV.seats.find(s => s.seat === mySeat)?.done) {
      host.toast('Finish your hand first.');
      return;
    }
    mySeat = -1;
    readyFor = 0;
    ui.classList.add('hidden');
    document.body.classList.remove('bj-on');
    for (const t of tags.values()) t.remove();
    tags.clear();
    host.sendPres();
    if (!force) host.onClose();
  }
  function key(e: KeyboardEvent) {
    const k = e.code;
    if (['Space', 'Enter'].includes(k)) e.preventDefault();
    if (k === 'Escape') return leave();
    if (k === 'KeyV') return act('cam');
    if (k === 'Space' || k === 'Enter') return act(T?.ph === 'play' ? 's' : 'ready');
    if (k === 'KeyH') act('h');
    else if (k === 'KeyS') act('s');
    else if (k === 'KeyD') act('d');
    else if (k === 'KeyP') act('p');
    else if (k === 'Backspace') act('clear');
    else if (/^Digit[1-5]$/.test(k)) addChip([10, 25, 100, 500, 1000][+k.slice(5) - 1]);
  }

  // ---- the felt: cards and chips
  function placeOf(rv: RoundView) {
    const out: { id: number; card: number; up: boolean; pos: THREE.Vector3; rot: number }[] = [];
    rv.dealer.forEach((c, k) =>
      out.push({
        id: cardId(c),
        card: c,
        up: k === 0 || rv.holeUp,
        pos: new THREE.Vector3(-0.07 + k * 0.13, FELT_Y + 0.003 + k * 0.0004, -0.13),
        rot: 0,
      }),
    );
    for (const sv of rv.seats) {
      const a = SEAT_ANG[sv.seat],
        base = seatSpot(sv.seat, CARDS_R),
        n = sv.hands.length,
        tx = Math.cos(a),
        tz = -Math.sin(a),
        rx = -Math.sin(a),
        rz = -Math.cos(a);
      sv.hands.forEach((hd, hi) => {
        const off = n === 1 ? 0 : hi === 0 ? -0.1 : 0.1;
        hd.cards.forEach((c, k) => {
          const lx = off - 0.03 + k * 0.035,
            lz = k * 0.03; // fan toward the dealer
          out.push({
            id: cardId(c),
            card: c,
            up: true,
            pos: new THREE.Vector3(base.x + tx * lx + rx * lz, FELT_Y + 0.003 + k * 0.0008, base.z + tz * lx + rz * lz),
            rot: a,
          });
        });
      });
    }
    return out.sort((x, y) => x.id - y.id);
  }
  function syncCards(rv: RoundView) {
    let t = Math.max(clock, busyUntil);
    for (const w of placeOf(rv)) {
      const s = shown.get(w.id);
      if (!s) {
        const m = cardMesh(w.card);
        m.position.copy(SHOE);
        m.rotation.y = w.rot;
        m.userData.flip.rotation.z = Math.PI;
        layer.add(m);
        shown.set(w.id, {
          id: w.id,
          mesh: m,
          up: w.up,
          from: SHOE.clone(),
          to: w.pos,
          fromY: 0,
          toY: w.rot,
          t0: t,
          dur: 0.32,
          flipFrom: Math.PI,
          flipTo: w.up ? 0 : Math.PI,
        });
        snd.push([t, 'cardSlide', 0.5]);
        t += 0.3;
      } else if (s.up !== w.up || !s.to.equals(w.pos)) {
        const flip = s.up !== w.up;
        s.from = s.mesh.position.clone();
        s.to = w.pos;
        s.fromY = s.mesh.rotation.y;
        s.toY = w.rot;
        s.flipFrom = s.mesh.userData.flip.rotation.z;
        s.flipTo = w.up ? 0 : Math.PI;
        s.up = w.up;
        s.t0 = t;
        s.dur = 0.3;
        if (flip) {
          snd.push([t, 'cardPlace', 0.6]);
          t += 0.45;
        }
      }
    }
    busyUntil = Math.max(busyUntil, t);
  }
  function clearFelt() {
    for (const s of shown.values()) layer.remove(s.mesh);
    shown.clear();
    for (const s of betStacks) layer.remove(s);
    betStacks = [];
    stackKey = '';
  }
  function syncChips(rv: RoundView | null, landed: boolean) {
    const m = seatedMap(),
      list: [number, number, number][] = []; // seat, stake, winnings
    if (T?.ph === 'bet')
      for (const [s, x] of m) {
        if (x.p.b > 0) list.push([s, x.p.b, 0]);
      }
    else if (rv)
      for (const sv of rv.seats) {
        const stake = sv.hands.reduce((a, h) => a + h.bet, 0),
          pay = rv.done && landed ? sv.results.reduce((a, r) => a + r.payout, 0) : -1;
        list.push([sv.seat, pay === 0 ? 0 : stake, pay > stake ? pay - stake : 0]);
      }
    const k = JSON.stringify(list);
    if (k === stackKey) return;
    stackKey = k;
    for (const s of betStacks) layer.remove(s);
    betStacks = [];
    for (const [seat, stake, win] of list) {
      const c = seatSpot(seat, CIRCLE_R),
        a = SEAT_ANG[seat];
      if (stake) {
        const st = chipStack(breakdown(stake));
        st.position.set(c.x, FELT_Y + 0.003, c.z);
        layer.add(st);
        betStacks.push(st);
      }
      if (win) {
        const st = chipStack(breakdown(win));
        st.position.set(c.x + Math.cos(a) * 0.075, FELT_Y + 0.003, c.z - Math.sin(a) * 0.075);
        layer.add(st);
        betStacks.push(st);
      }
    }
  }

  // ---- lobby hooks
  function peers(list: { uid: string; bj?: BJPres }[]) {
    others.clear();
    for (const x of list) {
      const sp = cleanSeatPres(x.bj);
      if (sp) others.set(x.uid, { ...sp, h: cleanTableHost((x.bj as any).h) || undefined });
    }
    if (!amHost()) {
      // follow the host's clock (the lowest uid seated)
      const m = seatedMap(),
        hostUid = [...m.values()].map(x => x.uid).sort()[0],
        hp = hostUid ? others.get(hostUid)?.h : undefined;
      if (hp && typeof hp.r === 'number') T = hp;
    }
  }
  function pres(): BJPres | undefined {
    if (mySeat < 0) return undefined;
    return amHost() && T ? { ...myPres(), h: T } : myPres();
  }
  /** Where the camera goes while seated: over your shoulder (the whole table), or first person. */
  function camTargets(camV: THREE.Vector3, look: THREE.Vector3) {
    table.updateMatrixWorld();
    const i = Math.max(0, mySeat),
      a = SEAT_ANG[i];
    if (cam === 'over') {
      const p = seatSpot(i, 2.7);
      camV.set(p.x * 0.8, 2.45, p.z + 0.15);
      look.set(0, FELT_Y - 0.1, 0.1);
      camV.applyMatrix4(table.matrixWorld);
      look.applyMatrix4(table.matrixWorld);
      return;
    }
    // first person: from your eyes, looking across the felt at the dealer; drag to glance around, Shift to lean in
    const head = (host.myGolfer() as any).by?.Head as THREE.Bone | undefined,
      eye = head ? head.getWorldPosition(new THREE.Vector3()) : seatSpot(i, SIT_R).setY(1.35).applyMatrix4(table.matrixWorld);
    const toDealer = new THREE.Vector3(0, FELT_Y, -0.6).applyMatrix4(table.matrixWorld).sub(eye).setY(0).normalize(),
      yaw = Math.atan2(toDealer.x, toDealer.z) + lookYaw;
    const pitch = -0.62 + lookPitch - (peek ? 0.3 : 0),
      fwd = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camV
      .copy(eye)
      .addScaledVector(toDealer, 0.16 + (peek ? 0.14 : 0))
      .add(new THREE.Vector3(0, 0.05 - (peek ? 0.06 : 0), 0));
    look.copy(camV).add(fwd);
    void a;
  }
  const seatWorld = (i: number) => {
    table.updateMatrixWorld();
    return seatSpot(i, STAND_R).setY(0).applyMatrix4(table.matrixWorld);
  };
  const seatOwner = (i: number) => {
    const x = seatedMap().get(i);
    return x ? x.uid : null;
  };

  const _v = new THREE.Vector3();
  function update(dt: number, camera: THREE.Camera) {
    clock += dt;
    if (T && T.ph !== lastPh) {
      if (T.ph === 'bet') {
        shuffleUntil = clock + 1.6;
      }
      lastPh = T.ph;
    }
    dealerTick();
    for (let i = snd.length - 1; i >= 0; i--)
      if (clock >= snd[i][0]) {
        sfx.play(snd[i][1], snd[i][2]);
        snd.splice(i, 1);
      }
    for (const s of shown.values()) {
      const k = Math.min(1, Math.max(0, (clock - s.t0) / s.dur));
      if (k <= 0) continue;
      const e = 1 - Math.pow(1 - k, 3);
      s.mesh.position.lerpVectors(s.from, s.to, e);
      s.mesh.position.y += Math.sin(Math.PI * k) * 0.06;
      s.mesh.rotation.y = s.fromY + (s.toY - s.fromY) * e;
      s.mesh.userData.flip.rotation.z = s.flipFrom + (s.flipTo - s.flipFrom) * e;
    }
    if (mySeat < 0) {
      if (shown.size && !others.size) {
        clearFelt();
        T = null;
      }
    }
    // the host runs the clock
    if (mySeat >= 0 && amHost()) {
      const n = hostStep(T, seatedMap(), Date.now(), Math.random, turnKey);
      if (n !== T) {
        T = n;
        host.sendPres();
      }
    }
    const rv = T && T.ph !== 'bet' && T.p.length ? replayRound(T, actsFor(T)) : null;
    lastRV = rv;
    if (T && T.r !== feltRound && T.ph !== 'bet') {
      clearFelt();
      feltRound = T.r;
      msg = '';
    }
    if (T?.ph === 'bet' && feltRound >= 0 && shown.size && clock >= busyUntil) {
      clearFelt();
      feltRound = -1;
    }
    if (rv) syncCards(rv);
    const landed = clock >= busyUntil;
    syncChips(rv, landed);
    // my money: stake when the round starts, payout once the cards have landed
    if (T && rv && inRound(T)) {
      const me = rv.seats.find(s => s.seat === mySeat)!;
      const rk = `${T.r}:${T.seed}`; /* round number + its random seed: unique even after the table empties and the count restarts */
      if (debited !== rk) {
        debited = rk;
        addCash(-me.bet);
        if (myRound !== T.r) {
          myRound = T.r;
          myActs = '';
        }
        readyFor = 0;
      }
      if (rv.done && landed && credited !== rk) {
        credited = rk;
        const pay = me.results.reduce((a, r) => a + r.payout, 0),
          stake = me.hands.reduce((a, h) => a + h.bet, 0),
          net = pay - stake;
        if (pay > 0) {
          addCash(pay);
          sfx.play('chipsHandle', 0.7);
        }
        if (T.to[mySeat] !== undefined) {
          if (++timeouts >= 3) {
            host.toast('You were away for three hands, so you left the table.');
            leave(true);
            host.onClose();
            return;
          }
        }
        msg = `${me.results.map(r => OUT_LABEL[r.outcome]).join(' · ')}${net ? ` <b class="${net > 0 ? 'up' : 'down'}">${net > 0 ? '+' : '−'}${money(Math.abs(net))}</b>` : ''}`;
        if (myBet > progress().cash) myBet = 0;
      }
    }
    if (mySeat < 0) return;
    render(rv);
    // banner: betting clock / whose turn
    const left = T ? Math.max(0, Math.ceil((T.e - Date.now()) / 1000)) : 0;
    let bh = '';
    if (!T || T.ph === 'bet') bh = `<span class="w">Place your bets</span><span class="t">${T ? left + 's' : '…'}</span>`;
    else if (T.ph === 'play' && rv && !rv.done && landed) {
      const who = rv.activeSeat === mySeat;
      bh = who
        ? `<b class="you">YOUR TURN</b><span class="t ${left <= 5 ? 'late' : ''}">${left}s</span>`
        : `<span class="w">Waiting for <i>${esc(host.nameOf(rv.seats.find(s => s.seat === rv.activeSeat)?.uid || ''))}</i></span><span class="t">${left}s</span>`;
    } else if (rv?.done) bh = `<span class="w">Dealer ${landed ? handValue(rv.dealer).total : 'plays'}…</span>`;
    if ((ban as any)._h !== bh) {
      (ban as any)._h = bh;
      ban.innerHTML = bh;
      ban.style.display = bh ? '' : 'none';
    }
    // floating labels: seats, hands, dealer
    const lab: [string, THREE.Vector3, string, string][] = [],
      ready = (c: number) => {
        const s = shown.get(cardId(c));
        return !!s && clock >= s.t0 + s.dur;
      };
    const m = seatedMap();
    for (let i = 0; i < BJ_SEATS; i++) {
      const x = m.get(i),
        pos = seatSpot(i, CIRCLE_R + 0.2),
        b = T?.ph === 'bet' ? x?.p.b : rv?.seats.find(s => s.seat === i)?.bet;
      lab.push([
        's' + i,
        pos,
        x ? `${x.uid === host.me() ? 'You' : host.nameOf(x.uid)}${b ? ' · ' + money(b) : ''}` : 'Open seat',
        `seat${x ? '' : ' open'}${x?.uid === host.me() ? ' me' : ''}${rv && !rv.done && rv.activeSeat === i ? ' on' : ''}`,
      ]);
    }
    if (rv) {
      const vis = rv.dealer.filter((c, k) => ready(c) && (k === 0 || rv.holeUp));
      if (vis.length) lab.push(['d', new THREE.Vector3(0, FELT_Y, -0.33), `Dealer ${handValue(vis).total}${rv.holeUp ? '' : ' + ?'}`, 'hand']);
      for (const sv of rv.seats)
        sv.hands.forEach((hd, hi) => {
          const cs = hd.cards.filter(ready);
          if (!cs.length) return;
          const p = seatSpot(sv.seat, CARDS_R - 0.16),
            a = SEAT_ANG[sv.seat],
            off = sv.hands.length === 1 ? 0 : hi === 0 ? -0.1 : 0.1;
          const r = rv.done && landed ? sv.results[hi] : null;
          lab.push([
            `h${sv.seat}_${hi}`,
            p.add(new THREE.Vector3(Math.cos(a) * off, 0, -Math.sin(a) * off)),
            r ? `${OUT_LABEL[r.outcome]}` : handText(cs, isBlackjack(hd) && cs.length === 2),
            `hand${r ? ' ' + r.outcome : ''}`,
          ]);
        });
    }
    const seen = new Set<string>();
    table.updateMatrixWorld();
    for (const [id, p, text, cls] of lab) {
      _v.copy(p).applyMatrix4(table.matrixWorld).project(camera);
      if (_v.z > 1) continue;
      seen.add(id);
      let el = tags.get(id);
      if (!el) {
        el = document.createElement('div');
        tagLayer.appendChild(el);
        tags.set(id, el);
      }
      if (el.textContent !== text) el.textContent = text;
      const c = 'bjtag ' + cls;
      if (el.className !== c) el.className = c;
      el.style.transform = `translate(${(((_v.x + 1) / 2) * innerWidth).toFixed(0)}px,${(((1 - _v.y) / 2) * innerHeight).toFixed(0)}px) translate(-50%,-50%)`;
    }
    for (const [id, el] of tags)
      if (!seen.has(id)) {
        el.remove();
        tags.delete(id);
      }
  }
  setInterval(() => {
    if (mySeat >= 0 && amHost()) {
      const n = hostStep(T, seatedMap(), Date.now(), Math.random, turnKey);
      if (n !== T) {
        T = n;
        host.sendPres();
      }
    }
  }, 400); // keeps the table moving even when the host's tab is in the background
  return {
    seatGolfer,
    mySeat: () => mySeat,
    sit,
    leave,
    key,
    update,
    camTargets,
    seatWorld,
    seatOwner,
    peers,
    pres,
    isOpen: () => mySeat >= 0,
    seatsTaken: () => seatedMap(),
    debug: () => ({
      T,
      mySeat,
      myActs,
      myRound,
      host: amHost(),
      rv: lastRV && { active: lastRV.activeSeat, done: lastRV.done, dealer: lastRV.dealer.length },
    }),
  };
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
