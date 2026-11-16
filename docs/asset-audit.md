# World Asset Audit & CC0 Sources (Nov 14 2026; updated Nov 15 after the world-assets and ball-skin work)

What's still built in code, what real CC0 assets exist, and the plan. From Claude's workspace only GitHub can be downloaded from directly. Wikimedia Commons and Openclipart can be opened in a browser and images saved from the screen, which is how the paintings and landmark shapes were fetched. Poly Haven, ambientCG, Kenney, Quaternius, OpenGameArt, itch.io and Freesound can't be reached; the user can download from those and attach the files. Related: `world-feel.md`, `ball-skins.md`, `art-direction.md`, `roadmap.md`.

## What's real vs code-built today
- **Real assets:**
  - the MakeHuman golfer (CC0) and its mocap, and now the wardrobe cut from MakeHuman's CC0 "system assets" pack: outfits `male_casualsuit02/03/05/06`, `male_elegantsuit01`, `male_worksuit01`, shoes `01`–`06`, `fedora01`, and ten hairstyles. Unused so far from that pack: the four female outfits, `male_casualsuit01/04`, `fedora_cocked`;
  - **tattoo art** (Nov 15): 18 Openclipart designs (CC0) on `public/golfer/tattoos.png`; ids and how to add more are in `tools/tattoo/README.md`;
  - **Fun Land models** (Nov 15): 48 pieces from Kenney's Mini Golf Kit, Racing Kit and Food Kit (CC0), from the GitHub mirror `ETdoFresh/kenney.nl`, which also has Kenney's furniture, nature, car, castle and holiday kits as models;
  - 19 Poly Haven furniture props;
  - Kenney's casino cards, chips and sounds;
  - the sky photo;
  - Poly Haven brick and stone facades for the city;
  - Poly Haven ground and bark photos (below);
  - **ball art** (Nov 15): Kenney's animal faces, public-domain paintings and Openclipart landmark silhouettes. See `ball-skins.md`.
- **Still code-built:**
  - tree shapes and leaves (live oaks, fan palms); their bark is a photo;
  - the RV (rebuilt Nov 15, below) and all plaza buildings;
  - the course's turf (fairway, rough and green are a drawn grass texture tinted per surface);
  - the cart;
  - golf clubs (rebuilt Nov 15, below);
  - birds, the jet, the moon, the cat (`world-feel.md`); the two strollers reuse the golfer;
  - all sounds except the casino's (synthesized; see `world-feel.md`).

## Done (Nov 15): ground and bark photos
Eight Poly Haven textures (CC0), fetched from the GitHub mirror `olaals/datasets-rgb-pose-estimation`, colour-matched to the old drawn textures so the look doesn't jump, evened out so the tiling shows less, and stored at 512 px in `public/ground/` (about 700 KB in total).

| File | Poly Haven source | Used for |
|---|---|---|
| `sand.jpg` | `coast_sand_03` | bunkers |
| `dirt.jpg` | `forest_ground_04` | cart paths and hardpan |
| `asphalt.jpg` | `terrain_red_01`, greyed | the town's roads |
| `pavers.jpg` | `t_concrete_wall_002` | the plaza and sidewalks |
| `gravel.jpg` | `rock_ground` | the lots' pads |
| `meadow.jpg` | `aerial_grass_rock` | the open ground around town, and the weed patches on lots |
| `bark.jpg` | `bark_brown_02` | oak trunks and limbs |
| `palmbark.jpg` | `palm_tree_bark` | palm trunks |

- The drawn textures are still in the code as the fallback: each photo swaps in when it loads (`photoTex` in `world/nature.ts`).
- **The mirror has no real asphalt or lawn photo.** The road is a dark gravel photo with the colour taken out, which reads as asphalt. The course's turf stays drawn: it's tinted per surface by the terrain shader, and no photo on the mirror fits.
- **Tiling in bunkers and on paths:** sand and dirt are sampled at two scales, turned against each other, so the repeat doesn't line up into a grid. Checked only by building; a look from above on a real course would confirm it.

## Done (Nov 15): the RV, rebuilt in code
No usable CC0 camper model exists, so the box was replaced with a proper travel trailer (`client/src/lobby/rv.ts`).
- **Body:** a rounded aluminium shell, a belt rail, a broad owner-colour stripe with a pinstripe above it.
- **Door side:** three framed windows with tied-back curtains and sunset glare, a door with its own window, handle, grab bar, fold-down step and a lit porch light.
- **Awning:** striped in the owner's colour, on a roller with support arms.
- **Running gear:** tandem wheels with hubcaps in dark wells, corner stabiliser jacks, an A-frame hitch with a tongue jack and two propane bottles.
- **Tail and roof:** chrome bumper, tail lights, plate, a spare-tyre cover, a roof AC unit, a crank vent, a TV aerial and a rear ladder.
- Same size and position as the old one, so collisions and lot layouts are unchanged. Each RV is merged down to about ten draw calls.

## Done (Nov 15): golf clubs, rebuilt in code
No usable CC0 club models exist (`buildClub` in `characters/golfer.ts`).
- **All clubs:** a stepped steel shaft, a black ferrule, a tapered grip with a butt cap, and a hosel that follows the shaft.
- **Driver and woods:** a pear-shaped head with a flat bright face, score lines, a sole plate and a sight mark on the crown.
- **Irons and wedges:** a blade that's taller at the toe, leaning back by its loft, with a cavity back, a thicker sole and grooves.
- **Putter:** a blade with heel and toe weights, a face insert, a white sight line and an offset neck.

## Done (Nov 15): sky and ground life
Birds, a jet, a moon, ground birds, a cat and two strollers: see `world-feel.md` ("Built so far"). All drawn in code.

## Done (Nov 14): sky, drifting clouds, cloud shadows
- **Sky photo:** Poly Haven **"Belfast Sunset" pure sky** (CC0, 4k HDR, fetched from a GitHub mirror). It's warmed toward golden hour, tone-mapped and baked to `public/sky/belfast.jpg` (4096×1152, about 190 KB, elevation +90° to −11°). It sits on a dome rotated so the photo's sun lines up with the game's sun, and melts into the dusty haze at the horizon.
- **Sun lowered:** the game's sun moved to **12° elevation**, same direction as before, and is brighter (4.0) to compensate. The old sun disc is hidden, since the photo has its own sun.
- **Cast shadows (corrected Nov 15):** the long golden-hour shadows this was meant to give were not actually showing: shadow rendering had been switched off by a code slip. The Nov 15 audit turned it back on, so trees, palms, buildings and golfers now cast real shadows.
- **Drifting clouds:** a soft cloud layer at 240 m (`world/sky.ts`), drifting with the wind (about 7 m/s). The clouds glow gold on the sun side, with warm lavender undersides where they're thick, and thin out toward the horizon so the photo shows there.
- **Cloud shadows:** every lit material in both the lobby and the course dims its direct sunlight where a cloud sits between it and the sun. Ambient light is untouched, so shadows read as soft patches sliding across the ground. Clouds and shadows share one noise field, so a shadow is always under a cloud.
- **Dev hook:** `window.__sky` exposes the cloud uniforms, e.g. `__sky.uWind.value.set(150,40)` to speed them up.

## Done (Nov 14): the classic city (replaces the "pyramid" hills)
The cone hills and beige boxes on the horizon are gone. In their place is a pre-war city in golden-hour haze, aiming for downtown LA's historic core or Manhattan. The Kenney commercial set was looked at and rejected as too futuristic.
- **Facades are real photos:** six Poly Haven brick and stone textures (CC0, from the same GitHub mirror):
  - `red_brick_03`, `brown_brick_02`, `yellow_bricks`, `factory_brick`, `sandstone_blocks_04`, `white_sandstone_bricks`;
  - stored at 512 px in `public/city/`, about 430 KB in total.
- **Windows are drawn by shader** (`world/city.ts`) on top of the brick: dark frames and double-hung sashes, stone lintels and sills, glass that picks up the warm sky with a few windows lit amber, and wide shopfront glass on the ground floor. Each building is just four textured walls, and everything that shares a material is merged into one mesh, so the whole city costs about a dozen draw calls.
- **Skyline (lobby and every course):**
  - a downtown cluster of stepped art-deco towers with spires, toward the sunset so they're backlit;
  - a ring of brick and limestone towers all the way round.
- **Lobby (changed the same evening):** the first version put blocks of brick mid-rises, a brownstone row, water towers and fire escapes right outside the streets. That was too much city for an RV park, so the lobby now has **only the far skyline**, 240–380 m out and shorter (0.6×). Between the town and the city is open dry meadow with about 260 oaks and palms in groves, and a clear lane out of the gate. The mid-rise, brownstone, water-tower and fire-escape builders are still in `city.ts` (the `near` option), unused.
- **Courses:** the skyline is 1.5× taller and about 500 m out.
- **Long soft haze:** a city-only fog curve keeps the skyline a silhouette that never quite vanishes. A warm bounce term stops the shady side of a building going black.

## Where art can be fetched from
**GitHub (direct download)**
- Repo `olaals/datasets-rgb-pose-estimation`, folder `assets/textures/`, three sub-folders: `brick/`, `rock/` (ground, sand, gravel, rock) and `wood/` (planks and bark). 115 Poly Haven colour maps at 1k. Almost none have their normal or roughness maps alongside, so normal maps are worked out from the photo's brightness where needed (bark).
- The files are stored with Git LFS, so they must be fetched from `media.githubusercontent.com/media/<owner>/<repo>/main/<path>`; the usual raw address returns a small pointer file.
- **Unused but promising:** `coral_gravel`, `coast_sand_rocks_02`, `rocks_ground_05`, more brick (`castle_brick_02_white`, `church_bricks_03`, `large_red_bricks`), and about two dozen wood plank sets that would suit the tee board, benches, fences and the pro shop.
- **Not on this mirror:** asphalt, lawn or fairway grass, and plain concrete.
- **Trees (Quaternius Ultimate Stylized Nature, CC0):** low-poly and flat-shaded; cleaner than ours but more cartoony. Still needs a side-by-side look.
- **Other sky:** Poly Haven "Evening Road 01" pure sky, if Belfast doesn't land.
- **City kits:** KayKit City Builder Bits is CC0 on GitHub.

**Through a browser (saved from the screen, so limited to about 900 px)**
- **Wikimedia Commons:** public-domain paintings and photos. Use `commons.wikimedia.org/wiki/Special:FilePath/<file name>?width=500` (or 960); other widths are refused.
- **Openclipart:** CC0 clip art. Search at `openclipart.org/search/?query=…`, then open `openclipart.org/image/800px/<id>`.

**Only if the user downloads and attaches them**
- Kenney's packs (kenney.nl), OpenGameArt, itch.io packs, Freesound clips.

## Not available as CC0
- **RV / camper models, golf clubs:** none usable, so both are built in code (above).
- **Recorded ambience** (highway, crickets, birds, jets): nothing Claude can fetch, so the ambience is synthesized. If you download CC0 clips from Freesound (search "highway distant loop", "car pass by", "crickets night", "mourning dove"), they can replace the synthesized layers.

## Plan
1. ✅ Sky photo + drifting clouds + cloud shadows.
2. ✅ Classic brick city and art-deco skyline.
3. ✅ Real ground textures (sand, dirt, roads, pavers, gravel, meadow) and bark.
4. ✅ Birds and a jet with a contrail.
5. ✅ Highway, crickets, birds and wind ambience (synthesized).
6. ✅ RV rebuild.
7. ✅ Better golf clubs.
8. ✅ Real art on the ball skins (animals, paintings, landmarks).
9. Wood photos for the plaza's wooden things (tee board, benches, pro shop, power poles).
10. Rebuild the plaza buildings (pro shop, tee board) to the RV's standard.
11. Tree comparison: Quaternius vs ours. **Not done.**
