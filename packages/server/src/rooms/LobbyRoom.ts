// Neighbourhood presence: positions, modes and chat lines (validated, rate-limited server-side).
import { Room, Client } from '@colyseus/core';
import { LobbyState, Walker } from '../state';

export class LobbyRoom extends Room<LobbyState> {
  maxClients = 64;
  private lastSay = new Map<string, number>();
  onCreate() {
    this.setState(new LobbyState());
    this.onMessage('pos', (client, m: any) => {
      const p = this.state.players.get(client.sessionId); if (!p || !m) return;
      if ([m.x, m.z, m.yaw].every(v => typeof v === 'number' && isFinite(v))) { p.x = Math.max(-60, Math.min(60, m.x)); p.z = Math.max(-60, Math.min(60, m.z)); p.yaw = m.yaw; }
      if (typeof m.mode === 'string' && m.mode.length < 12) p.mode = m.mode;
    });
    this.onMessage('say', (client, m: any) => {
      const p = this.state.players.get(client.sessionId); if (!p || typeof m?.text !== 'string') return;
      const now = Date.now(); if (now - (this.lastSay.get(client.sessionId) || 0) < 800) return;
      this.lastSay.set(client.sessionId, now);
      p.say = m.text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120); p.sayAt = now;
    });
  }
  onJoin(client: Client, o: { uid?: string; color?: string } = {}) {
    const w = new Walker(); w.uid = String(o.uid || client.sessionId).slice(0, 64);
    w.color = /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color! : '#2f7a4b';
    this.state.players.set(client.sessionId, w);
  }
  onLeave(client: Client) { this.state.players.delete(client.sessionId); this.lastSay.delete(client.sessionId); }
}
