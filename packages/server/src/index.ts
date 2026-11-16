import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GolfRoom } from './rooms/GolfRoom';
import { LobbyRoom } from './rooms/LobbyRoom';
import { ROOMS } from '@gh/shared';

const port = Number(process.env.PORT) || 2567;
const server = new Server({ transport: new WebSocketTransport() });
server.define(ROOMS.lobby, LobbyRoom);
server.define(ROOMS.golf, GolfRoom).filterBy(['matchId']); // one GolfRoom per tee-time group
server.listen(port).then(() => console.log(`Golden Hills server on ws://localhost:${port}`));
