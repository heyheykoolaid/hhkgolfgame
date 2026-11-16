// Replicated room state (Colyseus schema). Only what other clients need to *see* lives here;
// shot results travel as one-off messages so playback is exact.
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

export class Golfer extends Schema {
  uid = ''; color = '#2f7a4b'; name = ''; look = '';
  ballX = 0; ballZ = -1; teed = true;        // where this player's ball lies now
  strokes = 0; done = false; busy = false;   // busy = a shot is playing back
  x = 0; z = 0; yaw = 0; mode = 'walk';      // avatar position for others
}
defineTypes(Golfer, {
  uid: 'string', color: 'string', name: 'string', look: 'string',
  ballX: 'number', ballZ: 'number', teed: 'boolean',
  strokes: 'number', done: 'boolean', busy: 'boolean',
  x: 'number', z: 'number', yaw: 'number', mode: 'string',
});

export class GolfState extends Schema {
  hole = 'golden-hills-1'; windX = 0; windZ = 0; phase = 'playing';
  players = new MapSchema<Golfer>();
}
defineTypes(GolfState, { hole: 'string', windX: 'number', windZ: 'number', phase: 'string', players: { map: Golfer } });

export class Walker extends Schema { uid = ''; color = '#2f7a4b'; x = 0; z = 0; yaw = 0; mode = 'walk'; say = ''; sayAt = 0; }
defineTypes(Walker, { uid: 'string', color: 'string', x: 'number', z: 'number', yaw: 'number', mode: 'string', say: 'string', sayAt: 'number' });
export class LobbyState extends Schema { players = new MapSchema<Walker>(); }
defineTypes(LobbyState, { players: { map: Walker } });
