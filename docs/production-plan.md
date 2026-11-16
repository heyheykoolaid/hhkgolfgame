# From Prototype to Game — Production Plan v1.1 (Nov 11 2026)

The prototypes (Palm Street lobby + plots, Hole 1 golf, group play, rewards) have proven the loop and the feel. This plan covers moving to a real game: a proper codebase and server, rigged and animated characters, and a world built to the new visual target. Other systems (crops, blackjack, avatar depth, economy) get fleshed out once the vibe is in.

**Decided (Nov 11):** Three.js + TypeScript. **All roles in-house: Claude builds the art, rigs and animation in code, Chris art-directs** (the commission briefs in `design/commission-briefs.md` now serve as our own spec: art bible, budgets, file and clip contract). Code lives in the Claude session; a `.tgz` backup is sent at each milestone and a GitHub repo can come later. Every change is playtested through the published page (peer playtest mode, no server needed).

---

## 1. Visual target (from the reference frame)

**Mood:** late-afternoon Southern California. A warm amber sun is low on the horizon, with long soft shadows, dusty haze, and a peach-to-gold sky over hazy brown hills. This is the Tony Hawk / San Andreas lineage: lived-in, slightly run-down and sun-bleached, a little funny.

**World language (what's in the frame):**
- **The municipal golf course on the edge of town:** "Golden Hills Golf". It has a tired clubhouse with a faded sign, stucco walls, an AC unit, wooden steps and barred windows.
- Chain-link fences, wooden power poles with sagging wires, and tall skinny palms (Washingtonia) against the sky.
- A parking lot of '80s–'90s sedans and wagons with faded paint. Concrete apartment blocks and hills behind.
- **Props with wear:** a rusted, dented golf cart, wooden crates, patchy grass, dirt patches and divots.
- **Colour:** warm oranges and ochres in the light, desaturated olive greens on the grass, dusty blues on the cars, and near-black in the shadows. No neon in the base world; locations bring their own accents later.

**Characters:**
- Semi-realistic proportions (not chibi, not hyper-real).
- Streetwear: baggy cargos, hoodies, track jackets, oversized tees, flat-brim or backwards caps, skate shoes.
- Readable silhouettes at distance. Faces are simple but expressive (texture plus a few blend shapes).

**Rendering approach: "PS2-era, remastered".**
- Low-poly meshes with flat-to-soft shading.
- Hand-painted or photo-sourced but **simplified** textures (256–1024 px), with baked AO and dirt/edge-wear in the texture.
- A warm directional sun with cool hemisphere fill, distance fog that matches the sky, and a subtle bloom on the sun.
- A colour grade through a LUT (warm highlights, slightly lifted blacks), with a vignette and light film grain optional.

**Tri and texture budgets (60 fps on a mid laptop, browser-first):**
| Asset | Tris | Texture |
|---|---|---|
| Player character (incl. clothes) | 4k–8k | 1× 1024 atlas (+ normal optional) |
| NPC / background character | 2k–4k | 512 |
| Golf cart | 2k–3k | 512 |
| Car (parked) | 1.5k–3k | 512 shared atlas |
| Clubhouse | 3k–6k | 1024 atlas |
| Palm / prop | 200–1.5k | shared atlas |
| Whole visible scene | ≤ 600k | ≤ 64 MB GPU |
- Draw calls ≤ 300, with heavy instancing for trees, fences, poles and grass tufts.

## 2. Tech stack

Browser-first (matches the concept and keeps instant multiplayer links), on a real codebase:

| Layer | Choice | Why |
|---|---|---|
| Language/build | TypeScript + Vite | Fast iteration, typed modules, code splitting |
| Rendering | Three.js (r170), glTF 2.0 assets, KTX2 textures, meshopt compression | The prototype already runs on it; best web glTF/skinning support |
| Animation | Three.js `AnimationMixer` + a small animation-graph layer (blend trees, additive layers, IK for feet and hands) | Swing driven by the meter (see §4) |
| Physics | Rapier (WASM) for carts, characters and props; the custom ball physics from the prototype (deterministic, tested) | Real suspension and collisions; ball stays exact and server-replayable |
| Netcode | Colyseus 0.16 (Node) authoritative rooms: Lobby, Golf, BlackjackTable | Matches the design docs; the server simulates every shot |
| Data | Postgres (accounts, plots, inventory) + Redis (presence, matchmaking) | Standard and cheap |
| Hosting | Static client on a CDN; game servers on Fly.io or similar | Low ops |
| Tooling | Blender → glTF export presets, an in-browser level editor for placing props | A Blender-first content pipeline |

The prototype code is the reference implementation to port module by module: course/surface model, ball physics, swing timing, cart handling, lot claiming, presence, group flow and rewards.

## 3. Art pipeline

Art is made in-house (procedural modelling, canvas-painted textures with generated normal maps, code-keyed animation and IK). The art bible, budgets and review stages in **`design/commission-briefs.md`** are the spec we hold ourselves to.

**Character status (Nov 11):** first rigged golfer is in the game: a Mixamo-named skeleton (22 bones), skinned smooth-shaded body and streetwear (tee with back print, baggy cargos with pockets, skate shoes, backwards cap), a sculpted head with painted face, curled grip hands, and a swing driven by the meter (address → top → impact → finish) with two-bone IK keeping the hands on the club and feet planted. Target look: PS3 era.

1. **Characters**
   - One shared humanoid skeleton (Mixamo-compatible naming, so animations retarget), with modular body + outfit pieces (top, bottom, shoes, hat, hair) skinned to it. This doubles as the **avatar customisation** system later.
   - Built in Blender. Faces get a texture plus a handful of blend shapes (blink, smile, grimace, "oof").
2. **Animations**
   - Locomotion: idle ×3, walk, jog, run, start/stop, turn-in-place.
   - Golf: address, waggle, full swing (with `top` / `impact` / `finish` markers), chip, putt stroke, celebrate, frustrated, club twirl, picking the ball out of the cup.
   - Cart: enter, exit, sit idle, steer lean, bump reaction.
   - Social: wave, point, laugh, sit chair/bench/crate, lean on cart, plus blackjack sitting and gestures.
   - Golf swing and putt: custom mocap (Rokoko or Move.ai) cleaned in Blender, or hand-keyed. The swing is the signature move and worth doing properly.
3. **Environment kit for Golden Hills**
   - A modular fence/pole/wire kit, palms (3 variants), a clubhouse, a parking lot, car models with colour variants, cart (clean and rusty), crates, benches, bins, signage, and ground decals (dirt, divots, tyre marks).
   - Terrain: heightmap plus splat textures (fairway mow stripes, rough, sand, dirt, path). Grass tufts are instanced.
4. **In-game slots:** every asset has a slot in the client's asset manifest with a greybox stand-in. A delivered `.glb` at the agreed path replaces it with no code change, and every review happens in the running game.
5. **Export standards:** Y-up, metres, +Z forward, PBR metal/rough (mostly rough, metal only on clubs, cart and cars), a single material per character where possible, LOD0/LOD1 for anything over 2k tris, and colliders authored as simple boxes and capsules.

## 4. Signature feature: a swing animation driven by the meter

The rainbow meter and the character must feel like one thing:
- **Address:** the character settles into the stance and waggles while idle. Feet IK plants them on slopes, and the ball position follows the club choice.
- **Backswing:** the swing clip is scrubbed by the meter's power value, so 0% is address and 100% is the `top` marker. Overswing over-rotates (an additive pose).
- **Hang:** the top-of-swing pose holds for the 70 ms hang.
- **Downswing:** it plays at the meter's downswing tempo and is time-aligned so the `impact` marker lands exactly at the impact instant.
- **Result:** early or late blends in the pull/push finish variants, and a perfect strike holds the `finish` pose. Camera shake and hit-stop (a 40 ms freeze-frame) sell the "snap".
- Putting uses the same idea with a pendulum stroke.

## 5. First world: "Golden Hills" (replaces the green test course)

- **Lobby:** Palm Street becomes a sun-baked suburban block next to Golden Hills. It keeps the RV lots, adds the plaza as the clubhouse parking lot and patio, and puts the tee-time board on the clubhouse wall. NPC regulars lean on carts and sit on crates, as in the reference.
- **Course:** Hole 1 is rebuilt to the new look: the clubhouse and parking lot behind the tee, chain-link along the right side, power lines along the road, palms and hills on the horizon, and the pond becoming a muddy drainage pond.
- Later holes 2–9 extend the municipal course. Themed locations (kaiju downtown, the Moon, the castle) remain later destinations.

## 6. Milestones

**M0 — Foundation (code, no new art)** — *in progress*
- ✅ Monorepo: `packages/shared` (course data, ball physics, swing timing, `simulateShot`; 10 unit tests), `packages/server` (Colyseus golf + lobby rooms), `packages/client` (TS + Vite + Three r170).
- ✅ Authoritative shots: the client sends only the swing input; the server simulates with its own seed and broadcasts frames that every client plays back. Verified with two browser clients in the same match.
- ✅ Golden Hills Hole 1 greybox: golden-hour lighting and fog, olive turf, palms + oaks, clubhouse, parking lot with 90s cars, power lines, chain-link on the OB line, horizon hills.
- ✅ Arc swing meter ported, auto club/aim, HUD, scoreboard, asset manifest with greybox fallbacks.
- ⏳ Still to port: walking/cart between shots, minimap + shot preview, Palm Street lobby + plots, group flow (tee board, rejoin, return-together), rewards.
- ⏳ CI, preview deploys, dev telemetry overlay (fps, draw calls, tris).

**M1 — Vertical slice of the look**
- One hero character (modular outfit, rigged), with locomotion + full swing + putt + cart enter/exit/drive.
- The rusty cart with real suspension in Rapier.
- Golden Hills Hole 1 dressed to the reference: clubhouse, lot, fence, poles, palms, hills, and the lighting/LUT/fog pass.
- The meter-driven swing animation (§4). Target: a screenshot that sits next to the reference frame.

**M2 — Social slice:** Palm Street rebuilt in the new style, plus NPC regulars, plot editing with the new prop kit, trophies as 3D objects, and group rounds with everyone visible on the course.

**M3 — Depth:** avatar customisation (the outfit kit), holes 2–3, crops v2, blackjack table v1, accounts + persistence on Postgres.

## 7. Roles needed
- Character artist (modular outfits, 1 base body ×2 builds).
- Environment artist (Golden Hills kit).
- Animator / mocap cleanup (golf swing set + locomotion retarget).
- Tech artist (pipeline, shaders, LUT, LODs). This can be shared with engineering.
- Engineering: client/gameplay, netcode/server. The prototype code shortens this a lot.

## 8. Risks
- **Swing animation quality:** it's the signature move. It goes first in the commission order (blockout at R1).
- **Web performance with skinned characters:** cap visible skinned meshes (LOD and impostors for far NPCs) and use GPU skinning; measure from M0.
- **Rights:** work-for-hire with web distribution rights in every commission contract; any library mocap or Mixamo source listed.
- **Consistency across artists:** the shared art bible (§0 of the briefs) and in-engine reviews under game lighting.

## 9. Open decisions
1. GitHub repo for the monorepo (needed for CI and preview deploys).
2. Whether M1 targets desktop only first (recommended), with mobile after M2.
3. Hosting provider for the game server.
