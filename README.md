# Golden Hills (M0)

Browser multiplayer golf: Three.js + TypeScript client, authoritative Colyseus server, shared game logic.

```
packages/shared   course, ball physics, swing → shot pipeline (simulateShot), protocol types. Unit tested.
packages/server   Colyseus rooms: golf (authoritative shots, 4 players, filterBy matchId), lobby (positions/chat)
packages/client   Vite app: Golden Hills hole 1, arc swing meter, server playback, HUD, asset manifest
```

## Run

```bash
npm install
npm test                 # shared logic tests
npm run dev:server       # ws://localhost:2567
npm run dev:client       # http://localhost:5173/#<matchId>
```

Open the same `#matchId` in two tabs to play together. Override the server with `VITE_SERVER_URL` or `?server=ws://host:2567`.

Controls: **Space** / click = start backswing → lock power → hit in the white zone. **A/D** aim, **Q/E** club (putt range on the green), **P** toggle putter. Club and aim are auto-picked each time your ball stops.

## Art

Every model has a slot in `packages/client/src/assets.ts`. Drop the commissioned `.glb` into `packages/client/public/assets/<path>` and it replaces the greybox automatically. File names, clip names and budgets: see `design/commission-briefs.md` in the project.

## How a shot works

1. Client runs the meter locally (tempo from `swingTempo`, windows from `windows`) and sends `{club, power, u, aimYaw, spin, puttRange}`.
2. Server sanitizes it, runs `simulateShot` with its own seed, updates strokes/ball, and broadcasts the frames.
3. Every client plays the same frames back, so all players see the same shot.

## Playtest build (published page)

`npm -w @gh/client run build` → `packages/client/dist`. Without `?server=` the client runs in **peer playtest mode**:
each player simulates their own shot with the shared deterministic `simulateShot` and shares `{seed, input, start}`
through the page's room presence; everyone else replays it exactly. Same `#matchId` = same match and wind.
Published at https://claude.ai/artifact/RhHqHXzngvqitaTa8Ujdhu (slug c7fb73b8-b673-4dbb-a168-c57706a32734, capability `room`).
