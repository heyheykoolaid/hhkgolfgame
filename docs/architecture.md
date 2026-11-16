# Architecture & Working Notes (written Nov 15 2026, after the code audit; updated the same day after the split and both world-feel passes)

A map of the code for whoever works on it next (any model, or a person): where things live, the rules that keep multiplayer honest without a server, the traps already hit, and how to check a change. Related: `networking.md`, `roadmap.md`.

## 1. Shape of the project
A monorepo at `game/` (TypeScript, Vite, Three.js r170, Rapier physics).

| Package | What it is |
|---|---|
| `packages/shared` | Pure game rules with no browser or Three.js code. Everything here is deterministic and unit-tested (61 tests). |
| `packages/client` | The game: one page, one renderer, two modes (the lobby town and a round of golf). |
| `packages/server` | A Colyseus server path kept for a future launch. The published page doesn't use it. |
| `tools/` | Asset builders (`mh/` for the MakeHuman golfer and mocap, `props/`) and `lint/swallowed.mjs`. |
| `docs/` | **Local copies of the project's design docs** (see "Editing the design docs" in §6). |

**Commands (from `game/`):**
- `npm run check`: the lint, a type check and all shared tests. Run it before every publish.
- `npm run format`: Prettier over all source (150 columns). **Run it before scripted edits too:** it re-wraps long lines, so a search-and-replace written against the unformatted text won't match afterwards.
- `npm run lint`: only the swallowed-comment check (§5).
- `npm -w @gh/client run build`: builds `packages/client/dist`, which is what gets published.

## 2. Shared rules (`packages/shared/src`)
| File | Rules |
|---|---|
| `course.ts`, `holegen.ts` | Terrain, surfaces and the random hole generator (a hole is fully described by its seed). |
| `physics.ts`, `swing.ts` | The shot simulation (including whether a ball drops in the cup) and the swing's timing windows. `simulateShot` is deterministic: same inputs, same flight. |
| `turns.ts` | Whose turn it is in a group round. |
| `tournament.ts` | Tournament ids, hole order, cup names. |
| `blackjack.ts`, `bjtable.ts` | Blackjack rules and the shared-table replay (`replayRound`, `hostStep`). |
| `grow.ts` | Plant growth, care and the dealer's prices. |
| `bets.ts` | Golf betting: locking and settling (`lockOffer`, `settle`). |

Each file that takes data from other players also exports its **cleaner**: `cleanBetPres`, `cleanTableHost`, `cleanSeatPres`, `cleanGarden`. See §4.

## 3. Client (`packages/client/src`)
`main.ts` creates the renderer and both modes, and runs the frame loop. The loop always schedules the next frame first and catches errors, so one bad frame can't freeze the game.

**The pattern everything follows:** a feature is `createThing(host)`. `host` is a small object of callbacks the feature needs from its owner (the player's state, a toast, "publish my presence"). The feature returns its own API (`update`, `key`, `pres`, `peers`…). The owner calls it; the feature never reaches into the owner's variables. To add a feature, copy the nearest module.

### Lobby (`lobby/`)
`lobby.ts` (about 3,100 lines on Nov 16; the next file to split) is the town's core, one closure (`createLobby`) with section banners (`// ---------------- name`): the player and input, the camera, other players, presence, lots, and the frame.

| Module | Feature |
|---|---|
| `world.ts` | The town itself: ground, streets, lots, plaza props, colliders. `groundY` gives the height underfoot and `surfaceOf` what it's made of (for footsteps). |
| `rv.ts` | The lot's travel trailer, built in code and merged by material. |
| `plaza.ts` | The pro shop hut, the tee board and the benches, built in code with two wood photos. Same footprints as the boxes they replaced. |
| `rollGame.ts` | The six-step rolling minigame (`rolling-minigame.md`). `smoke.ts` starts it and makes the joint it grades. |
| `strollers.ts` | Two townsfolk walking the sidewalk ring round the plaza. Their position comes from the wall clock, so nothing is sent. |
| `teeBoard.ts` | Tee times: hole or tournament choice, solo start, the group queue and host start. |
| `wardrobe.ts` | The wardrobe panel and its camera pose. (The lobby owns the golfer and the saved look.) |
| `cart.ts` | Your cart in town: garage, getting in and out, parking, flipping, prompts, seating a rider, the physics bodies for placed items. It owns the cart object; the lobby's frame drives it. |
| `build.ts`, `catalog.ts` | Build Mode and its items. |
| `blackjack.ts` | The table, the dealer, seats and first-person view. |
| `garden.ts` | Plants, the watering can and fertilizer. |
| `dealer.ts` | The Street Dealer: selling product, buying papers and a grinder. |
| `mail.ts` | The mailbox and letters. |
| `smoke.ts` | Rolling, smoking, passing, and the gnome. |
| `putt.ts` | The mini putt game. It reuses the course's swing meter (`ui/arcMeter.ts`) and timing (`windows`, `swingTempo`, `evaluateImpact` from shared). The ball is a frictionless Rapier ball in its own collision group (`G_PUTT`): flat felt is one slab, the tiles' triangle mesh supplies walls and bumps (flat and hidden faces are filtered out), and a per-step hook applies the felt's steady drag and keeps the spin matched. `window.__putt` shows its state and has `press()`. |
| `funland.ts` | Fun Land, east of town: the gates, Birdie Burger and its back yard, the mini putt layout (`PUTT_HOLES`: every tile, tee and cup), the driving range, the kart track (a closed curve, `TRACK_PTS`) and its lap timer. Kenney models come from `public/funland/kit.json` (`tools/funland/pack.py`) and are merged into one mesh per colour (`Baker`). `funSurface(x, z)` says what the ground is. **`world.ts` imports this file, so nothing at its top level may read a value from `world.ts`.** |
| `gachaMachine.ts` | The Birdie Ball machine model. |

| `roads.ts` | **The town's street plan (Nov 16).** Every flat street is one line in `STREETS` (centre line, width, pavement width). From that list: the asphalt and pavement meshes (no overlapping pieces), centre and stop lines, street-name blades, `streetAt` (what is underfoot), `paveY`, `PAVES` (kerbs for the physics), `SIDEWALKS` (where walkers go) and the map's streets. Add a street here, not by hand. It imports nothing from `world.ts`. |
| `westside.ts` | The West Side on its rise (`WEST_OFF`): the street and car park, the clubhouse, the water tower, the delivery van, and the `spots` you can press E at for both districts. It lends its building helpers to `shady.ts`. |
| `shady.ts` | **Shady Lane's four buildings** (the Lucky Lie Lounge, the alley, Grow Supply, Lucky Pawn), split out of `westside.ts` on Nov 16. They are laid out in the West Side's frame and stood at `SHADY_OFF`; the lane itself is in `roads.ts`. |
| `shops.ts` | The code-drawn shop row behind the West Side car park (Threads, The Clip Joint, Ink Spot, the Pro Shop, Homestead Furniture, Wrench & Ride). |
| `filler.ts`, `litter.ts` | Nobody's buildings from the buildings pack (placed by street front); litter as one merged mesh from a fixed seed. |
| `townLife.ts` | Two walkers on `SIDEWALKS` and three cars on laps along street centres (`ROUNDS`). Each player's own scenery, not synced. `plan()` returns the laps and the walk network for tests. |
| `vlt.ts`, `vltArt.ts` | The lounge's slot and video poker cabinets and their printed artwork (rules in `shared/src/vlt.ts`). |
| `fairground.ts`, `fountain.ts`, `range.ts`, `invIcons.ts`, `attendants.ts` | The code-built fairground, the plaza fountain, the driving range game, inventory pictures, booth attendants. |

Outside `lobby/`, added since the audit: **`vehicles/vehicles.ts`** now holds the cars (`CARS`, `carProfile`, the gearbox, `CAR_PARTS` and `partsTune`); a vehicle's kind travels as `car:<id>:<paint>:<rims>[:<parts>]` and anything received goes through `cleanKind`. **`world/propPacks.ts`** loads model packs (`loadProps`, `loadPiece`). **`golf/homeCourse.ts`** is the real-course list. **`avatar/progress.ts`** is every saved thing a player owns; all spending goes through its functions.

Still inside `lobby.ts`: chat, the Birdie Ball and ball-collection panels, the trophy case (each small), the ragdoll section, remote players and the frame.

### Golf (`golf/`)
`golfMode.ts` (about 2,250 lines) is the round's core, one closure (`createGolf`): hole loading, the swing, shot playback, walking and carts, the HUD, the end cards.

| Module | Feature |
|---|---|
| `turns.ts` | Whose turn it is, the shot clock and its penalty, the YOUR TURN banner. |
| `tournament.ts` | Scorecards, the leaderboard, who wins, and the card's HTML. Pure functions: `golfMode.ts` still owns the tournament itself (loading holes, moving on, the trophy). |
| `roaming.ts` | Getting around between shots: where you are (`W`), walking, your own cart (driving, crashing, flipping, hauling out of a pond), running people over, the E prompt. `golfMode.ts` reaches it as `roam` (`roam.cart`, `roam.interact()`, `roam.update(dt)`); `W` is the same object in both. |
| `cup.ts` | The ball dropping into the cup: a small local simulation for the eye. Whether it's holed is decided in `shared/physics.ts`. |
| `bets.ts` | The betting client. |

Still inside `golfMode.ts` (about 2,130 lines): **the frame loop** (`tick`, about 550 lines: shot playback, every avatar's pose, the camera, the HUD), the physics world and ragdolls, the putting line and slope arrows, and the swing state. The frame loop reads nearly everything, so splitting it further means first deciding what state each piece owns.

### Sound (`audio/`)
| Module | What it does |
|---|---|
| `ctx.ts` | **The game's one `AudioContext`** (`wakeAudio()` on a key press or click), a shared noise buffer, and the **volume controls**: connect game sounds to `sfxOut(c)` and ambience to `masterOut(c)`, never to `c.destination`, or the options menu's sliders won't reach them. `lobby/blackjack.ts` and `lobby/smoke.ts` still open their own contexts but play through `sfxOut`. |
| `ambience.ts` | The ambient bed, sparse one-shots, cart motors and footsteps. One instance (`ambience`). Each mode calls `ambience.update(dt, {zone, cam, fountain?, cart?, carts?, duck?})` from its frame. `ambience.step(surface, v, from?)` plays a footstep; pass `from: {pos, cam}` for somebody else's, and it's placed and faded by distance. `flutter` and `meow` are for the wildlife. If neither mode updates for a moment, the bed fades out by itself. |

All sounds are synthesized (noise through filters, oscillators, and a few buffers written sample by sample). See `world-feel.md` for what's in the mix.

### Everything else
| Folder | What's there |
|---|---|
| `net/` | `artifactNet.ts` (the published page's networking), `serverNet.ts` (the unused server path), `types.ts` (the `GameNet` interface both implement). |
| `avatar/` | `progress.ts` (the wallet and everything saved per player), `outfit.ts`, `colors.ts`, and `balls.ts` (102 ball skins: five sets drawn in code, three stamped from art sheets in `public/balls/`; see `ball-skins.md`). |
| `characters/` | The golfer: MakeHuman body, the skeleton, IK and every pose. `buildClub` in `golfer.ts` builds the clubs. |
| `world/` | Course scenery (`course.ts`, whose `buildLighting` is shared by both modes), trees and ground textures (`nature.ts`), grass, sky and clouds (`sky.ts`), wind (`wind.ts`), birds, the jet and the moon (`skylife.ts`), ground birds and the cat (`critters.ts`), the city, trophies. |
| `vehicles/`, `physics/` | The cart, and the Rapier world with ragdolls. |
| `ui/` | The swing meter (`arcMeter.ts`), minimap, the controls panel (`controls.ts`), the options menu and its saved settings (`options.ts`), the welcome card (`welcome.ts`) and all CSS (`hud.css`). See `ui-and-controls.md`. |

**Wind:** `world/wind.ts` holds two shared uniforms, `WIND.uWT` (time) and `WIND.uGust` (0–1). The ambience writes them every frame, so what's heard and what moves agree. `windSway(material, kind)` patches a material's vertex shader (`palm`, `frond`, `leaves`, `flag`, `string`); the grass shader reads `uGust` directly. Shadows don't sway (the depth pass isn't patched).

**The wardrobe pipeline:** `tools/mh/build.py` fits MakeHuman's outfits to the golfer and cuts them into garments (`Suit.take`): by connected piece, by texture colour (the blazer's shirt and tie), or by height (shorts are the jeans cut above the knee). Each garment records which body triangles it hides (`meta.hide`) and which skin to tuck in under its edges (`meta.tuck`); the whole body ships once and `bodyGeometry(worn)` in `characters/mhGolfer.ts` leaves out what the worn garments cover. Garment textures are grey and tinted by the material colour, and load the first time something wears them (`lazy`). Everything is in `golfer.json` (positions and uvs as 16-bit numbers; about 3.7 MB, 1.9 MB gzipped). Glasses, chain, watch and earring are small shapes fixed to one bone each (`glassesGeoms`, `blingGeoms`); face paint is stamped onto the skin texture with the same code that prints the tee (`stampArt`). The look's fields and their allowed values are in `characters/golfer.ts` (`TOPS`, `PANTS`, …) and checked in `avatar/outfit.ts` (`sanitizeLook`). Tattoos use the same stamp, from the front, the back or the side of a limb (`fromSide`), with art cut from `golfer/tattoos.png` (`tools/tattoo/build.py`); designs are listed in `TATTOOS` in `golfer.ts`. **Body types:** `MH_BODY=female|muscle|fmuscle python3 tools/mh/build.py` builds another body with its own joint positions (saved as that file's `bind`) and writes `golfer_<body>.json`; textures are shared. A `Golfer` wearing one keeps its own bind (`this.bind`), and the pose code reads joints through `BPOS`, which answers for the golfer being built or posed (`CUR`, set on entry to the constructor, `update` and `poseClip`). At run time `loadBody` fetches a body on demand and fires a `ghbody` window event; `lookKey` changes when a body becomes ready, which makes other players' golfers rebuild. To add a garment: add it in `build.py`, give it a part name, wear it in `buildBodyMH`, add the choice to the list and to `lobby/wardrobe.ts`.

**Cart drifting:** in `vehicles/vehicles.ts` (`stepFn`): brake + steer at speed starts a slide (rear side grip drops, yaw rate is held to a target), a charge builds, and releasing the brake boosts. `drifting()` returns 0–3 for smoke and sound.

**Table tops and roofs (Build Mode):** an item with `top: [height, width, depth]` in `catalog.ts` can carry small items; the RV's roof is a fixed top (`RV_ROOF` in `build.ts`). Heights aren't saved: `restY` works them out from the layout each time.

**Hills:** `lobby/hills.ts`. `hillY(x, z)` is the ground south of town (levelled across the road, blended back into the slope); `world.groundY` returns it there. `buildHills` returns the drawn triangles (ground plus road), which `lobby.ts` gives to Rapier as the carts' ground. Like `funland.ts`, it must not read `world.ts` while loading.

**The edge of the world:** `inWorld(x, z)` in `lobby/world.ts` (the town square, or Fun Land through its two gates). Walking uses it directly; carts have matching physics walls in `lobby.ts`. To grow the map again, change both.

**Level of detail (golfers):** `setLod` in `characters/golfer.ts`. A golfer's first mesh reads the camera's distance in `onBeforeRender` and swaps every part to a geometry that shares its vertices but has a shorter triangle list (`lowGeometry`, cached per part). `ui/perf.ts` is the F3 readout; `lodCount` there shows how many golfers are at each level.

**Vehicles:** `VEHICLES.cart` and `VEHICLES.kart` are the same class (`Cart` in `vehicles/vehicles.ts`) with a different model, seat and grip points; a vehicle's `kind` travels in its network state, so others see the right one.

**Measuring a frame:** `test/m0/perf.py` prints triangles, shadow casters and the biggest meshes from a viewpoint (`__lobby.renderer`, `__lobby.scene`). The test browser can't measure frame rate, only how much is drawn.

**Wildlife:** `createCritters(scene, host)` takes `ground`, `open` (may something stand here), `birdSpots` and optional `catSpots`. Each frame the owner passes a list of "scarers" (`{x, z, spd}` for the player, other players, carts, strollers).

**Photo textures:** `photoTex(texture, name)` in `world/nature.ts` swaps a drawn texture for a photo from `public/ground/` once it loads, so the drawn one is the fallback. `groundPhoto(name, colour)` gives a tiling photo texture for plain meshes; the lobby's `tile(mesh, metres)` lays it out in real metres.

**Settings:** `opts` in `ui/options.ts` (volumes, shadows, sharpness, look speed, controls panel). Read it directly each frame, or use `onOptions(fn)` to react to a change. Both modes set `light.sun.castShadow = opts.shadows` every frame.

**Keys:** Esc closes whatever is open; with nothing open it opens the options menu (both modes). While the menu or the welcome card is open they swallow key events before the game sees them.

**Things that tick themselves:** the clouds, the birds in the sky, the jet and the moon update from `onBeforeRender`, so the modes don't call them. They only run in the scene being drawn.

**Debug hooks** in the browser console:
- `window.__lobby`: lobby state, the camera, `ballPreview`, `BALLS` and every feature module.
- `window.__gh`: golf (`S`, `net`, `bets`, `T`, `dev.cam = [x,y,z, lookX,lookY,lookZ]` for a fixed screenshot camera, `cupTest()`…).
- `window.__sky`: cloud uniforms. `window.__skyLife.launch()`: send the birds and the jet up now.
- `window.__amb`: the ambience (`__amb.t` holds the countdowns to the next car, bird, dove and horn; set one to 0 to hear it now; `__amb.gust = __amb.gustTo = 1; __amb.gustT = 99` holds a gust).
- `window.__lobby.smoke.game`: the rolling game (`start(name, colour, size)`, `debug(step)` to jump to a step, `state()`, `pointer`).
- `window.__critters[0]` (town) and `[1]` (course): `birds`, `C` (the cat), `state`, `land()`.

## 4. Multiplayer without a server
The published page has no game server. It has two things from the platform:
- **Presence:** each player publishes one small state object; everyone in the room sees everyone's latest. There's a lobby room, plus a room per golf match.
- **A small database:** `plots/{uid}` (a lot's layout and garden, readable by all, writable by its owner) and `data/users/{uid}/…` (private progress and look).

Everything multiplayer follows from four rules.

1. **Publish facts about yourself; replay everything else.** A shot is published as its inputs and seed, and every client re-runs `simulateShot`. A blackjack round is the host's seed plus each seat's own actions, replayed by `replayRound`.
2. **One writer per decision.** When a decision must be the same for everyone, exactly one player publishes it and the rest copy it: the blackjack host runs the clock, a bet's proposer publishes its roster, one member publishes each bet result. Never let two clients each compute something that depends on *when* they saw a third player leave.
3. **Never trust another player's clock.** Computers' clocks differ. Judge freshness by when *you* first saw something change, not by a timestamp inside it. Known leftover: the blackjack countdown other players see comes from the host's clock, so it can read a few seconds off; only the display is affected.
4. **Clean everything that arrives.** Presence and other players' records can be malformed or hostile. Every field goes through a cleaner before use, each peer is handled inside its own `try`, and ids are re-derived, never trusted.

**Decoration is not synced.** Ambience, gusts, clouds, birds, the jet and the cat are each player's own. The strollers follow each player's own clock, so they agree to within a few seconds. Don't build anything that matters to play on any of them.

**What isn't protected:** a modified client can lie about its own score, wallet or plants. That's accepted for a friends-only game.

## 5. Traps already hit (and the guard for each)
- **A `//` comment swallowing code.** The code used to be written many statements to a line, and a `// note` added mid-line silently disabled everything after it. The audit found two live cases: **shadows had been switched off for the whole game**, and trees weren't marked as shared. Guards: all source is formatted one statement per line, and `npm run lint` fails if a comment contains code.
- **A stale echo undoing a newer change.** Writing a record and then receiving the echo of an *older* write used to roll the local copy back. A lot's record has one writer (`saveMyPlot` in `lobby.ts`) that ignores echoes while a write is on its way.
- **The wallet loading twice.** `loadProgress` is a single shared load. Between this browser's copy and the account's copy, the one saved most recently wins. Saves go to the account in the background, one at a time.
- **Presence blips.** A player can vanish from the room for a few seconds. Don't act on an instant absence: betting uses "seen in the last 4 s" for offers and a 15 s grace before treating someone as gone.
- **The page host won't serve `.bin` or `.glb` files.** Assets are JSON (geometry as base64), PNG or JPG.
- **A hidden tab doesn't run frames.** Anything that must keep going in the background (turn timeouts, betting, the blackjack host) runs on a timer, not in the frame loop.
- **Wall-clock numbers in small typed arrays.** Seconds since 1970 don't fit a `Float32Array` (the gnome's fire trail vanished because of it). Use `Float64Array` or times relative to a start.
- **Both modes build their own scene at start-up**, so anything created in `buildLighting`, or by both `createLobby` and `createGolf`, exists twice. A debug hook written as `window.x = thisInstance` ends up pointing at the scene that isn't on screen. Register instances in a list instead (see `__skyLife`, `__critters`). This was hit twice.
- **Swapping a texture's image for one of a different size** needs `texture.dispose()` first, or the graphics card keeps the old size (`photoTex` does this).
- **CC0 textures on GitHub are often stored with Git LFS.** The raw address returns a 130-byte pointer; fetch from `media.githubusercontent.com/media/…` instead.
- **A scripted edit that fails half-way writes nothing.** The edit scripts check each replacement and stop on the first miss, before saving. After one fails, re-check what was and wasn't applied before building.

- **Two modules that import each other** (`world.ts` ↔ `westside.ts`, `world.ts` ↔ `funland.ts`): a value read at the top level of one may not exist yet ("Cannot access before initialization" at start-up). Read the other module's values inside functions, or through a getter. `roads.ts` avoids the problem by importing nothing from `world.ts`.
- **The test browser runs about twenty times slow.** Anything that waits on the game clock (the static batcher folding meshes in, distance culling, a car driving a lap) has not happened yet when a test looks. Draw counts read there are far too high; test geometry directly instead (for example `__life.plan()` against `streetAt`).
- **A cap in `progress.ts`'s `clean` silently drops what is over it** on the next load. The owned-items cap was 80 with the catalog past 100 kinds; it is 400 now. Check the caps when a list grows.
- **The same player in two tabs:** each tab held its own copy of the save and the last to write won. A `storage` listener now makes a tab adopt a newer copy saved by another.

## 6. Checking a change
- `npm run check` first. Since Nov 16 it also fails on **unused imports and locals** (`--noUnusedLocals`); 62 were removed that day.
- **Automated browser tests** live outside the repo in `test/m0/*.py` (Playwright, software rendering, a mock of the platform in `test/mock_claude.js`). Two tabs in one browser context share a room. They're slow (about 1 frame a second), so tests drive the game through the debug hooks rather than real input, and set `window.__betSlow` to stretch betting timers.
  - `bets.py`: a two-player, three-hole tournament with bets. It exercises turns, tournament cards, hole changes and settlement, so it's the one to re-run after touching `golf/`. It takes about 15 minutes; run it alone.
  - `tee.py`: two players queue at the tee board and start a group round.
  - `split1.py`: the wardrobe (change and save a look) and the cart (garage, drive, hop out).
  - `lobshot.py name:lx,lz,yaw,pitch …`: screenshots of the town from spots on your lot.
  - `amb4.py`: **renders each sound offline and prints its level.** The test browser's live audio can't be measured reliably, so this builds a second `Ambience` on an `OfflineAudioContext`. It's the way to rebalance the mix without ears.
  - `feel3.py`: the cat bolting, birds taking off, and a calm-against-gust frame comparison for the wind.
  - `ballsheet.py`: a picture of every ball skin in the three art sets.
  - `roll2.py` / `roll3.py`: every step of the rolling game as pictures, and steps 1 and 3 played through the game's own pointer state (real mouse events stall in the slow browser).
  - `plaza.py`, `ui1.py`, `ui2.py`: the rebuilt plaza; the welcome card and options menu; the controls panel and "Leave the round" on the course.
  - `char.py name=query …`: the golfer turntable (needs `npx vite` running); `ty`, `tz`, `zoom`, `yaw`, `pitch` aim it, e.g. at a club head.
- **Run one browser test at a time**, and kill stray browsers and dev servers first (`pkill -f chrom`). With several running, the page crashes from lack of memory. The local file server on port 8790 also dies now and then; check it before blaming the game.
- **Formatting is provably safe:** the build is byte-identical before and after `npm run format`.
- **What the tests can't judge:** feel, frame rate, motion and how anything sounds. Those need a person playing.

**Editing the design docs.** The project's docs can only be replaced whole. `game/docs/` holds local copies of the ones edited most (`roadmap.md`, `world-feel.md`, `asset-audit.md`, `architecture.md`). Edit the local copy, then upload it with the Projects tool's `local_path`, instead of typing the whole doc out again. If a doc isn't there yet, read it from the project and save a copy first. The project is the source of truth if the two ever differ.

## 7. Audit and split record (Nov 15)
**Fixed in the audit**
- Shadows restored (they were disabled by a swallowed line). This changes the look everywhere and costs some frame rate.
- Trees are no longer disposed and rebuilt on every hole change.
- The game loop survives an error in a frame.
- Wallet: single load, newest-copy-wins between devices, background saves in order.
- Lot records: one writer; stale echoes ignored (fixes a lost item when placing two quickly).
- Other players' clocks no longer decide whether a round start, chat line, ragdoll, joint pass, exhale or gnome run is shown.
- Cleaners added for blackjack table and seat state, gardens and smoke state; each peer is isolated from the others' bad data.
- Blackjack debits and payouts are keyed by round and seed.

**Structure**
- All source formatted (11k dense lines became 26k normal ones; identical build).
- Split out of `lobby.ts`: `teeBoard.ts`, `wardrobe.ts`, `cart.ts`.
- Split out of `golfMode.ts`: `turns.ts`, `tournament.ts`, `cup.ts` (and `bets.ts` was built separate).
- Tests added for the cleaners (61 shared tests in all).

**Not done**
- The frame loop is still inside `golfMode.ts` (see §3). Walking and the cart moved to `golf/roaming.ts` later the same day; a hole loaded and the options menu worked afterwards, and the two-player tournament test was re-run.
- Chat, the Birdie Ball panels and the trophy case are still inside `lobby.ts`.
- No automated test covers Build Mode.
- The frame-rate cost of shadows hasn't been measured on a real graphics card.

## 8. World feel, assets and ball skins record (Nov 15)
**Added later the same day:** `lobby/rollGame.ts`, `lobby/plaza.ts`, `ui/controls.ts`, `ui/options.ts`, `ui/welcome.ts`, two wood photos. Checked by screenshots and scripted state, with no errors in town or on the course; **the full two-player tournament test was not re-run after these**.

**Added:** `audio/ctx.ts`, `audio/ambience.ts`, `world/skylife.ts`, `world/wind.ts`, `world/critters.ts`, `lobby/rv.ts`, `lobby/strollers.ts`, eight photos in `public/ground/`, three art sheets in `public/balls/`, rebuilt `buildClub`, 52 new ball skins.

**Checked**
- Every sound rendered offline and its level measured.
- Screenshots: the RV, the town's ground, a bunker, the birds, the jet, each club head, every new ball, the cat, ground birds, the strollers, calm against gust.
- The cat bolts and the birds take off when approached; frames differ about three times as much in a gust as in calm.
- The wardrobe and cart test, and the full two-player tournament with bets (pots still balance).

**Not checked**
- How any of it sounds or moves to a person.
- The cart in town only creeps in the test browser (forward and back both respond, a few centimetres in 15 s at about one frame a second). It was the same before these passes. A person should confirm it drives normally.
- Frame rate with eight detailed RVs casting shadows, two more skinned characters in town and the swaying foliage.
- The new balls in play (only their previews were looked at).

## 9. Review record (Nov 16)
After a day that added cars, the pawn shop, real-course rounds, town life, Shady Lane and the street plan.
- **Saves and money:** owned-items cap raised (above); two-tab saves adopt the newer copy; buying a car asks twice (it was one click for up to $40,000); Build Mode's leftover price code removed (placing has been free since storage came in).
- **Multiplayer:** a real-course match id had no random part, so two groups starting the same course together shared a round and every win was the same trophy. `courseIdFor` now takes a random tail (match ids may be 16 characters, were 12). Vehicle kinds and machine seats from other players were already checked on arrival.
- **Structure:** Shady Lane's buildings moved to `shady.ts`; 62 unused imports and locals removed, including the old trophy-case panel.
- **Frame cost:** the far groves were one lot of 324,000 triangles drawn wherever you looked; they are six wedges now (about 140,000 in a typical view). Real frame rate still needs a person with F3 on: see the slow-browser trap.
- **Stale words fixed:** the welcome card still described the plaza as having the pro shop, blackjack and the dealer.
- **Not done:** splitting `lobby.ts` (shops, the map and the menu are the obvious pieces); disposing a retired car's geometry; walkers and cars are still unsynced between players.
