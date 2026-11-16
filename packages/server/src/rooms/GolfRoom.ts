// Authoritative golf match: clients send swing *inputs*; the server simulates every shot with the shared
// physics, updates strokes/ball position, and broadcasts the full result for deterministic playback.
import { Room, Client } from '@colyseus/core';
import { simulateShot, sanitize, useHole, seedFromMatch, MSG, type ShotInput, type ShotBroadcast } from '@gh/shared';
import { GolfState, Golfer } from '../state';

const COLORS = ['#2f7a4b', '#e2574c', '#3f8fd2', '#e9b23a', '#7a5bd0', '#2eaa8a'];
const MAX_STROKES = 10;

export class GolfRoom extends Room<GolfState> {
  maxClients = 4;
  private seed = (Math.random() * 2 ** 31) | 0;

  onCreate(options: { wind?: { x: number; z: number }; matchId?: string } = {}) {
    this.setState(new GolfState());
    useHole(seedFromMatch(String(options.matchId || '')));   // dev server: one process, the most recent room's hole is the active one
    const ang = Math.random() * Math.PI * 2, spd = Math.random() * 5;
    this.state.windX = options.wind?.x ?? +(Math.sin(ang) * spd).toFixed(2);
    this.state.windZ = options.wind?.z ?? +(Math.cos(ang) * spd).toFixed(2);
    this.onMessage(MSG.shot, (client, msg: { shot: ShotInput }) => this.onShot(client, msg?.shot));
    this.onMessage(MSG.pos, (client, m: any) => {
      const p = this.state.players.get(client.sessionId); if (!p || !m) return;
      if ([m.x, m.z, m.yaw].every(v => typeof v === 'number' && isFinite(v))) { p.x = m.x; p.z = m.z; p.yaw = m.yaw; }
      if (typeof m.mode === 'string' && m.mode.length < 12) p.mode = m.mode;
    });
  }

  onJoin(client: Client, options: { uid?: string; name?: string; look?: string } = {}) {
    const p = new Golfer();
    p.uid = String(options.uid || client.sessionId).slice(0, 64);
    p.name = String(options.name || 'Golfer').slice(0, 24);
    p.look = typeof options.look === 'string' ? options.look.slice(0, 400) : '';
    p.color = COLORS[this.state.players.size % COLORS.length];
    p.ballX = ((this.state.players.size % 4) - 1.5) * 1.7; // own spot across the tee box
    this.state.players.set(client.sessionId, p);
  }

  onLeave(client: Client) { this.state.players.delete(client.sessionId); }

  private onShot(client: Client, raw: ShotInput) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !raw) return;
    if (p.done) return client.send(MSG.error, { code: 'done', message: 'You already holed out.' });
    if (p.busy) return client.send(MSG.error, { code: 'busy', message: 'Wait for your last shot to finish.' });
    const shot = sanitize(raw);
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    const result = simulateShot({ ball: { x: p.ballX, z: p.ballZ, teed: p.teed }, wind: { x: this.state.windX, z: this.state.windZ } }, shot, this.seed);
    p.strokes += 1 + result.penalty;
    p.ballX = result.end.x; p.ballZ = result.end.z; p.teed = result.end.teed;
    if (result.outcome === 'holed' || p.strokes >= MAX_STROKES) p.done = true;
    // block the next shot until playback is over (last frame time + a short beat)
    const ms = Math.min(30000, (result.frames[result.frames.length - 1][0] + 0.8) * 1000);
    p.busy = true; this.clock.setTimeout(() => { p.busy = false; }, ms);
    const msg: ShotBroadcast = { sessionId: client.sessionId, strokeNumber: p.strokes, result };
    this.broadcast(MSG.shotResult, msg);
    if ([...this.state.players.values()].every(x => x.done)) this.state.phase = 'finished';
  }
}
