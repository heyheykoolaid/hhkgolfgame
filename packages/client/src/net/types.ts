import type { ShotInput, ShotBroadcast } from '@gh/shared';
export interface NetPlayer {
  look?: import('../characters/golfer').Outfit;
  uid: string;
  color: string;
  name: string;
  ballX: number;
  ballZ: number;
  teed: boolean;
  strokes: number;
  done: boolean;
  busy: boolean;
  x: number;
  z: number;
  yaw: number;
  mode: string;
  body?: Body;
  h?: number;
  card?: number[];
  sk?: number;
  skAt?: number;
  picked?: boolean;
  bt?: import('@gh/shared').BetPres;
}
/** Where a golfer is when they're not standing over their ball: on foot or in a vehicle, plus any ragdoll event. */
export interface Body {
  m: 'walk' | 'drive' | 'addr';
  x: number;
  z: number;
  y?: number;
  yaw: number;
  spd: number;
  v?: import('../vehicles/vehicles').VehState | null;
  rg?: { t: number; v: number[]; i: number[]; at: string } | null;
  /** on a skateboard: Skateboard.pres() and the deck's index */
  sk?: number[];
}
export interface NetEvents {
  onShot(b: ShotBroadcast): void;
  onError(code: string, message: string): void;
  onStatus(text: string, ok: boolean): void;
}
/** What the game needs from a network backend (Colyseus server, or the published-page room). */
export interface GameNet {
  readonly sessionId: string;
  players(): Map<string, NetPlayer>;
  me(): NetPlayer | undefined;
  wind(): { x: number; z: number };
  phase(): string;
  isReady(): boolean;
  connect(name: string, uid: string): Promise<void>;
  sendShot(shot: ShotInput): void;
  sendPos(x: number, z: number, yaw: number, mode: string): void;
  sendBody?(b: Body): void;
  disconnect?(): void;
  /** Tournaments: move on to hole index h (the new hole is already loaded into COURSE). */
  nextHole?(h: number): void;
  /** Turn-based play: my shot timer ran out — a penalty stroke; the 3rd on a hole picks the ball up. gs = group strokes before it. */
  penalize?(gs: number): void;
  /** Betting (shared/src/bets.ts): publish my offers, answers, locked bets and results. */
  setBets?(bt: import('@gh/shared').BetPres | null): void;
  /** In a live room with other players reachable (false: solo, or the connection dropped). */
  online?(): boolean;
}
export function matchId() {
  return (
    location.hash
      .replace(/^#/, '')
      .replace(/[^\w-]/g, '')
      .slice(0, 32) || 'dev'
  );
}
