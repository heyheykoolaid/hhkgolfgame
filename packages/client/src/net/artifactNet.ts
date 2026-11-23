// Playtest networking for the published page: no game server. Each player simulates their OWN shot with the
// shared, deterministic simulateShot() and publishes {seed, input, start} in room presence; every other client
// re-runs the same simulation and gets the identical flight. Works solo when no room is available.
// (Trust: presence is not authority — fine for playtests; the Colyseus server path stays for launch.)
import { simulateShot, COURSE, mulberry32, cleanBetPres, type ShotInput, type ShotBroadcast, type BetPres } from '@gh/shared';
import type { GameNet, NetEvents, NetPlayer, Body } from './types';
/** Untrusted peer data → a well-formed Body (or nothing). */
function cleanBody(b: any): Body | undefined {
  if (!b || typeof b !== 'object' || !['walk', 'drive', 'addr'].includes(b.m)) return undefined;
  const n = (v: any, lo: number, hi: number) => {
    const x = +v;
    return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0;
  };
  const arr = (a: any, len: number, lo: number, hi: number) =>
    Array.isArray(a) && a.length >= len ? a.slice(0, len).map((x: any) => n(x, lo, hi)) : null;
  const v =
    b.v && typeof b.v === 'object' && typeof b.v.k === 'string'
      ? {
          k: String(b.v.k).slice(0, 16),
          p: arr(b.v.p, 3, -800, 800) || [0, -50, 0],
          q: arr(b.v.q, 4, -1, 1) || [0, 0, 0, 1],
          s: n(b.v.s, -40, 40),
          st: n(b.v.st, -1, 1),
        }
      : null;
  const rg =
    b.rg && typeof b.rg === 'object'
      ? {
          t: n(b.rg.t, 0, 1e14),
          v: arr(b.rg.v, 3, -40, 40) || [0, 0, 0],
          i: arr(b.rg.i, 3, -80, 80) || [0, 0, 0],
          at: ['Head', 'Hips', 'Spine1'].includes(b.rg.at) ? b.rg.at : 'Spine1',
        }
      : null;
  return { m: b.m, x: n(b.x, -800, 800), z: n(b.z, -800, 800), y: n(b.y, -50, 50), yaw: n(b.yaw, -1e3, 1e3), spd: n(b.spd, -40, 40), v, rg };
}
import type { Outfit } from '../characters/golfer';
import { sanitizeLook } from '../avatar/outfit';
import { platform, resolveNames } from '../platform';

const COLORS = ['#2f7a4b', '#e2574c', '#3f8fd2', '#e9b23a', '#7a5bd0', '#2eaa8a'];
const MAX_STROKES = 10;
interface ShotRef {
  k: number;
  seed: number;
  input: ShotInput;
  from: { x: number; z: number; teed: boolean };
  h?: number;
}
interface Pres {
  v: 1;
  o?: Outfit;
  n: string;
  c: string;
  ball: [number, number, number];
  st: number;
  done: boolean;
  busy: boolean;
  yaw: number;
  shot: ShotRef | null;
  b?: Body | null;
  h?: number;
  cd?: number[];
  sk?: number;
  ka?: number;
  pk?: boolean;
  bt?: BetPres | null;
}

function hashStr(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const num = (v: any, a: number, b: number, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.min(b, Math.max(a, v)) : d);

export class ArtifactNet implements GameNet {
  readonly sessionId = 'me';
  room: any = null;
  private live = false;
  private meP: NetPlayer;
  private peers = new Map<string, NetPlayer & { lastShot: number }>();
  private windV: { x: number; z: number };
  private myShot: ShotRef | null = null;
  private busyTimer = 0;
  private lastPres = '';
  private presT = 0;
  private left = false;
  private body: Body | null = null;
  constructor(
    private ev: NetEvents,
    private match: string,
    private look: Outfit,
  ) {
    const r = mulberry32(hashStr('wind:' + match)),
      a = r() * Math.PI * 2,
      s = r() * 5; // same wind for everyone in this match
    this.windV = { x: +(Math.sin(a) * s).toFixed(2), z: +(Math.cos(a) * s).toFixed(2) };
    this.meP = {
      look,
      uid: 'me',
      color: COLORS[hashStr(Math.random() + '') % COLORS.length],
      name: 'You',
      ballX: COURSE.tee.x,
      ballZ: -1,
      teed: true,
      strokes: 0,
      done: false,
      busy: false,
      x: 0,
      z: -1,
      yaw: 0,
      mode: 'address',
      h: 0,
      card: [],
      sk: 0,
      skAt: 0,
      picked: false,
    };
  }
  players() {
    const m = new Map<string, NetPlayer>([['me', this.meP]]);
    for (const [k, p] of this.peers) m.set(k, p);
    return m;
  }
  me() {
    return this.meP;
  }
  /** The match's wind, as strong as this course has it (Boulder Peak blows harder). */
  wind() {
    const g = COURSE.gust ?? 1;
    return g === 1 ? this.windV : { x: +(this.windV.x * g).toFixed(2), z: +(this.windV.z * g).toFixed(2) };
  }
  phase() {
    return 'playing';
  }
  isReady() {
    return true;
  }

  async connect(name: string, uid: string) {
    this.meP.name = name;
    this.meP.uid = uid;
    // each golfer gets their own spot across the tee box so a group isn't standing in one place
    this.teeSpot();
    this.ev.onStatus('solo · connecting…', true);
    const pf = await platform();
    this.pf = pf;
    const lobby = pf.room;
    if (!lobby || this.match === 'idle') {
      this.ev.onStatus(lobby ? '' : 'solo practice (no other players on this copy of the game)', true);
      return;
    }
    try {
      this.room = lobby.join ? await lobby.join('gh-golf-' + this.match) : lobby;
    } catch {
      this.room = lobby;
    }
    if (this.left) {
      try {
        this.room.leave?.();
      } catch {}
      return;
    }
    this.live = true;
    this.room.onPeers(
      (ch: any) => this.onPeers(ch),
      () => {
        this.live = false;
        this.ev.onStatus('connection lost — playing solo', false);
      },
    );
    this.ev.onStatus('', true);
    this.publish(true);
  }

  private onPeers(ch: any) {
    const live = new Set<string>();
    for (const pe of ch.peers || []) {
      try {
        /* one player's bad data must not stop us seeing everyone else */
        if (pe.isMe || pe.sameTab || pe.kind === 'agent') continue;
        const pr = pe.presence as Pres;
        if (!pr || pr.v !== 1 || !Array.isArray(pr.ball)) continue;
        live.add(pe.peer);
        let p = this.peers.get(pe.peer);
        if (!p) {
          p = {
            uid: pe.by || pe.peer,
            color: '#fff',
            name: 'Golfer',
            ballX: 0,
            ballZ: -1,
            teed: true,
            strokes: 0,
            done: false,
            busy: false,
            x: 0,
            z: -1,
            yaw: 0,
            mode: 'address',
            lastShot: -1,
          };
          this.peers.set(pe.peer, p);
        }
        p.color = /^#[0-9a-f]{6}$/i.test(pr.c) ? pr.c : p.color;
        p.look = sanitizeLook(pr.o);
        p.uid = pe.by || p.uid;
        const nm = this.pf?.names.get(p.uid);
        if (nm) p.name = nm;
        else {
          p.name = String(pr.n || 'Golfer').slice(0, 24);
          if (this.pf && pe.by) resolveNames(this.pf, [pe.by]);
        }
        p.yaw = num(pr.yaw, -1e3, 1e3);
        p.done = !!pr.done;
        p.busy = !!pr.busy;
        p.sk = Math.floor(num(pr.sk, 0, 9));
        p.skAt = Math.floor(num(pr.ka, 0, 999));
        p.picked = !!pr.pk;
        p.h = Math.floor(num(pr.h, 0, 17));
        p.card = Array.isArray(pr.cd) ? pr.cd.slice(0, 18).map(x => Math.floor(num(x, 0, 99))) : [];
        // a new shot from this peer → replay it locally (deterministic), then trust its reported rest position
        const s = pr.shot;
        if (s && typeof s.k === 'number' && s.k > p.lastShot && p.lastShot !== -2) {
          const first = p.lastShot === -1;
          p.lastShot = s.k;
          if (!first && Math.floor(num(s.h, 0, 17)) === (this.meP.h || 0)) {
            // only shots on the hole I'm playing
            try {
              const result = simulateShot(
                { ball: { x: num(s.from?.x, -450, 450), z: num(s.from?.z, -150, 750), teed: !!s.from?.teed }, wind: this.wind() },
                s.input,
                s.seed >>> 0,
              );
              const b: ShotBroadcast = { sessionId: pe.peer, strokeNumber: num(pr.st, 0, 99), result };
              this.ev.onShot(b);
            } catch {
              /* malformed — ignore */
            }
          }
        } else if (!s && p.lastShot === -1) p.lastShot = 0;
        p.strokes = num(pr.st, 0, 99);
        p.ballX = num(pr.ball[0], -450, 450);
        p.ballZ = num(pr.ball[1], -150, 750);
        p.teed = !!pr.ball[2];
        p.x = p.ballX;
        p.z = p.ballZ;
        p.body = cleanBody(pr.b);
        p.bt = cleanBetPres(pr.bt, p.uid);
      } catch {
        /* skip this peer this time */
      }
    }
    for (const k of [...this.peers.keys()]) if (!live.has(k)) this.peers.delete(k);
  }

  sendShot(input: ShotInput) {
    const p = this.meP;
    if (p.busy || p.done) {
      this.ev.onError(p.done ? 'done' : 'busy', p.done ? 'You already holed out.' : 'Wait for your last shot to finish.');
      return;
    }
    const from = { x: p.ballX, z: p.ballZ, teed: p.teed },
      seed = (Math.random() * 2 ** 31) >>> 0;
    const result = simulateShot({ ball: from, wind: this.wind() }, input, seed);
    p.strokes += 1 + result.penalty;
    p.ballX = result.end.x;
    p.ballZ = result.end.z;
    p.teed = result.end.teed;
    if (result.outcome === 'holed' || p.strokes >= MAX_STROKES) {
      p.done = true;
      p.card![p.h || 0] = p.strokes;
    }
    p.busy = true;
    clearTimeout(this.busyTimer);
    this.busyTimer = setTimeout(
      () => {
        p.busy = false;
        this.publish(true);
      },
      Math.min(30000, (result.frames[result.frames.length - 1][0] + 0.8) * 1000),
    ) as any;
    this.myShot = { k: (this.myShot?.k || 0) + 1, seed, input: result.input, from, h: p.h || 0 };
    this.publish(true);
    // deliver async, like a server round-trip would
    setTimeout(() => this.ev.onShot({ sessionId: 'me', strokeNumber: p.strokes, result }), 0);
  }
  /** Each golfer gets their own spot across the tee box, so a group isn't standing in one place. */
  private teeSpot() {
    const p = this.meP;
    p.ballX = COURSE.tee.x + ((hashStr(p.uid + this.match) % 4) - 1.5) * 1.7;
    p.ballZ = COURSE.tee.z - 1;
    p.x = p.ballX;
    p.z = p.ballZ;
    p.teed = true;
  }
  nextHole(h: number) {
    const p = this.meP;
    if (p.done) p.card![p.h || 0] = p.strokes;
    p.h = h;
    p.strokes = 0;
    p.done = false;
    p.busy = false;
    p.sk = 0;
    p.skAt = 0;
    p.picked = false;
    clearTimeout(this.busyTimer);
    this.teeSpot();
    this.body = null;
    for (const q of this.peers.values())
      if ((q.h || 0) !== h) {
        q.done = false;
        q.strokes = 0;
      } // until they catch up
    this.publish(true);
  }
  penalize(gs: number) {
    const p = this.meP;
    if (p.done || p.busy) return;
    p.strokes += 1;
    p.sk = (p.sk || 0) + 1;
    p.skAt = gs + 1;
    if (p.sk >= 3 || p.strokes >= MAX_STROKES) {
      p.done = true;
      p.picked = true;
      p.card![p.h || 0] = p.strokes;
    }
    this.publish(true);
  }
  private pf: any = null;
  private bets: BetPres | null = null;
  setBets(bt: BetPres | null) {
    this.bets = bt;
    this.publish(false);
  }
  online() {
    return this.live && !!this.room;
  }
  disconnect() {
    this.left = true;
    this.live = false;
    try {
      this.room?.leave?.();
    } catch {}
    this.room = null;
  }
  sendPos(_x: number, _z: number, yaw: number, mode: string) {
    this.meP.yaw = yaw;
    this.meP.mode = mode;
    this.publish(false);
  }
  sendBody(b: Body) {
    this.body = b;
    this.publish(false);
  }
  private publish(force: boolean) {
    if (!this.live || !this.room) return;
    const now = performance.now();
    if (!force && now - this.presT < 100) return;
    this.presT = now;
    const p = this.meP,
      pr: Pres = {
        v: 1,
        o: this.look,
        n: p.name,
        c: p.color,
        ball: [+p.ballX.toFixed(3), +p.ballZ.toFixed(3), p.teed ? 1 : 0] as any,
        st: p.strokes,
        done: p.done,
        busy: p.busy,
        yaw: +p.yaw.toFixed(2),
        shot: this.myShot,
        b: this.body,
        h: p.h || 0,
        cd: p.card,
        sk: p.sk || 0,
        ka: p.skAt || 0,
        pk: p.picked || undefined,
        bt: this.bets || undefined,
      };
    const j = JSON.stringify(pr);
    if (j === this.lastPres) return;
    this.lastPres = j;
    Promise.resolve(this.room.presence(pr)).catch(() => {});
  }
}
