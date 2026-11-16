// Client ⇄ server message contract. Keep this file the single source of truth for names and shapes.
import type { ShotInput, ShotResult } from './swing';

export const ROOMS = { lobby: 'lobby', golf: 'golf' } as const;

/** client → GolfRoom */
export type C2S =
  | { type: 'shot'; shot: ShotInput } // server simulates, then broadcasts 'shotResult'
  | { type: 'pos'; x: number; z: number; yaw: number; mode: string } // walking/cart position for others to see
  | { type: 'ready' }; // finished watching playback; next shot allowed

/** GolfRoom → clients */
export interface ShotBroadcast {
  sessionId: string;
  strokeNumber: number;
  result: ShotResult;
}
export const MSG = { shot: 'shot', pos: 'pos', shotResult: 'shotResult', error: 'error' } as const;
