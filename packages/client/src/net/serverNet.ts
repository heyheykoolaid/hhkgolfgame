// Connection to the authoritative game server. The client never simulates a shot for real:
// it sends the swing input, and plays back whatever the server broadcasts (for itself and for others).
import { Client, type Room } from 'colyseus.js';
import { ROOMS, MSG, COURSE, matchIdFor, type ShotInput, type ShotBroadcast } from '@gh/shared';

import { type GameNet, type NetEvents, type NetPlayer } from './types';
import type { Outfit } from '../characters/golfer';
import { sanitizeLook } from '../avatar/outfit';

function serverUrl() {
  const env = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:2567`;
}

export class ServerNet implements GameNet {
  room: Room | null = null;
  constructor(
    private ev: NetEvents,
    private match = 'dev',
    private look?: Outfit,
  ) {}
  disconnect() {
    const r = this.room;
    this.room = null;
    this.closing = true;
    try {
      r?.leave();
    } catch {}
  }
  private closing = false;
  get sessionId() {
    return this.room?.sessionId || '';
  }
  isReady() {
    return !!this.room;
  }
  players(): Map<string, NetPlayer> {
    const m = new Map<string, NetPlayer>();
    (this.room?.state as any)?.players?.forEach((p: any, k: string) => {
      let look;
      try {
        look = p.look ? sanitizeLook(JSON.parse(p.look)) : undefined;
      } catch {}
      m.set(k, Object.assign(Object.create(p), { look }));
    });
    return m;
  }
  me(): NetPlayer | undefined {
    return this.players().get(this.sessionId);
  }
  wind() {
    const s = this.room?.state as any;
    return { x: s?.windX || 0, z: s?.windZ || 0 };
  }
  phase(): string {
    return (this.room?.state as any)?.phase || 'connecting';
  }

  async connect(name: string, uid: string) {
    this.who = [name, uid];
    const url = serverUrl();
    this.ev.onStatus('connecting…', false);
    const client = new Client(url);
    for (let attempt = 0; ; attempt++) {
      try {
        this.room = await client.joinOrCreate(ROOMS.golf, { matchId: this.match, name, uid, look: JSON.stringify(this.look || {}) });
        break;
      } catch (e: any) {
        this.ev.onStatus(`can't reach server (${url}) — retrying`, false);
        await new Promise(r => setTimeout(r, Math.min(8000, 1000 * 2 ** attempt)));
      }
    }
    const room = this.room!;
    room.onMessage(MSG.shotResult, (b: ShotBroadcast) => this.ev.onShot(b));
    room.onMessage(MSG.error, (e: any) => this.ev.onError(e?.code || 'error', e?.message || ''));
    room.onLeave(() => {
      if (this.closing) return;
      this.ev.onStatus('disconnected — reconnecting', false);
      this.room = null;
      setTimeout(() => this.connect(name, uid), 1500);
    });
    this.ev.onStatus(`match ${this.match}`, true);
  }
  sendShot(shot: ShotInput) {
    this.room?.send(MSG.shot, { shot });
  }
  private who: [string, string] = ['', ''];
  /** Tournaments: the server runs one hole per match, so each hole is a fresh match carrying that hole's code. */
  nextHole(h: number) {
    const base = this.match.replace(/[^0-9a-z]/g, '').slice(-4);
    this.disconnect();
    this.closing = false;
    this.match = matchIdFor(COURSE.seed || 0, base + h);
    this.connect(...this.who);
  }
  private lastPos = 0;
  sendPos(x: number, z: number, yaw: number, mode: string) {
    const now = performance.now();
    if (!this.room || now - this.lastPos < 100) return;
    this.lastPos = now;
    this.room.send(MSG.pos, { x, z, yaw, mode });
  }
}
