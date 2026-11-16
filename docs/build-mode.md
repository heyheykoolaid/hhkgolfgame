# RV Lot Build Mode — Design + UI (added Nov 14 2026; v1 live Nov 14; storage model Nov 16)

Each player owns an RV lot: a defined rectangular pad with their RV/trailer as the centrepiece. Personal, customizable and clearly bordered. Related: `lobby-design.md`, `street-dealer-economy.md`, `roadmap.md`.

## How it works today (Nov 16)
This section is the truth; where the older sections below disagree, this wins.
- **Build Mode places what you own. It does not sell anything and no money changes hands in it.** Everything except trophies is owned by count (`progress.gear`). The catalog lists only what you own and shows "X of N in storage". Placing takes one from storage; **removing puts it back in storage** (no refunds, because nothing was charged).
- **Where things are bought:** furniture, decoration and the cart garage at **Homestead Furniture** (West Side shop row), sorted into ten aisles; grow pots, beds, sprinklers and fertilizer at **Grow Supply** (Shady Lane). Whatever already stood on a lot when storage came in counts as owned.
- **Only grow gear takes inventory slots** (it is carried). Furniture waits in the lot's own storage and takes none.
- **Trophies** come from your wins and can each be placed once. A trophy standing on your lot can't be sold at Lucky Pawn until it is taken down.
- **Tabs:** Furniture, Decoration, Grow, Trophies, Garage. An empty tab says where to buy.
- **Small things stand on tops:** the picnic table, café table, crate, cooler and folding stool, and the roofs of the RV and the cart garage (no grid up there). Pick the table up and what was on it drops to the ground.
- **String lights** only block at their two posts.
- **The cart garage** is where your vehicle lives: E takes it out. If you drive a car from Wrench & Ride, the garage shows that car (scaled down if it is too long for the roof).
- **The catalog is past 100 kinds of thing:** 19 Poly Haven models, the hand-built pieces, 28 pieces lifted from model packs (`pk()` in `catalog.ts`: house interior, the bar, shelves), and grow gear.
- **Limit:** 100 placed items per lot.
- **Look:** dark glass panels like every other menu. Key hints are in the controls card, not on the bars.
- **Code:** `lobby/build.ts` (mode, placement, saving, drawing every lot), `lobby/catalog.ts` (items and pack items), `world/props.ts` and `world/propPacks.ts` (models on demand), `avatar/progress.ts` (`gear`, `ownAtLeast`, `setPlaced`).

## Decisions
1. **B enters Build Mode** on your own lot (F stays the ragdoll flop). (Nov 14)
2. **No Night Preview.** Golden hour everywhere; grow lights and string lights just glow softly. (Nov 14)
3. ~~Prices are shown in Build Mode and charged when placing, with full refunds.~~ **Replaced Nov 16: shops sell, Build Mode places from storage.**
4. **Detailed CC0 models (Poly Haven) where they exist**, hand-built pieces for the gaps, and pieces from CC BY model packs with credit (`credits.md`). Sketchfab "Standard" license packs are not shipped.
5. **Lots stay 14 × 14 m.**

## 1. RV lot structure
- **A fixed RV / trailer** (the player's home base). Later: unlockable RV shells or exterior skins.
- **A buildable yard** around the RV.
- **Clear lot boundaries** (chain-link fence on three sides, open toward the street).
- **A mailbox and a lot sign** at the front.
- **Later:** power and water hooks that some grow equipment must snap to.

## 2. Entering Build Mode
- On your own lot: **B** (or Tab → Build Mode). Only the owner can.
- The camera becomes an orbit camera over the lot; the Build UI appears; a grid shows the buildable area; street palms next to the lot hide while you build.
- Other players can't interact with your objects (they can still walk by and look).

## 3. Mechanics
### Placement rules
- **Grid-based** (0.5 m), with a free-placement toggle (15° rotation with the grid off).
- Objects have **footprints**; they can't overlap each other, the RV, its door, the awning posts, the mailbox or the sign. Rugs, decks, paths, gravel and the putting green are floor items other things can stand on.
- A ghost follows the pointer: **green** = fine, **red** = not here, with a short red tip saying why.
- Click a placed item to pick it up and move it.

### Later
- Power and water hooks, items that need power.
- RV exterior customization (colour or wrap, awning, roof rack, solar panels).
- Wall and RV-side attachments (lights, signs, cameras).
- Quick Copy, saved loadouts, an "as visitors see it" view.

## 4. Layout
```
┌──────────────────────────────────────────────────────────────┐
│ [× Done]            Lot 7 · Build Mode            Cash $5,000 │
├───────────────────┬──────────────────────────────────────────┤
│ Furniture  Decor  │                                          │
│ Grow  Trophies    │            the lot (orbit camera)        │
│ Garage            │                                          │
│ Search…           │                                          │
│ items you own,    │                                          │
│ "X of N in        │                                          │
│  storage"         │                                          │
├───────────────────┴──────────────────────────────────────────┤
│ 2 / 100 items placed      [Rotate] [Grid: on] [Remove] [Undo] │
└──────────────────────────────────────────────────────────────┘
```

**Controls (as built)**
| Input | Action |
|---|---|
| B | Enter Build Mode (on your own lot) / leave it |
| Right-drag | Orbit camera |
| WASD | Pan the camera |
| Scroll | Zoom |
| Left click | Place the item in hand, or pick up a placed item to move it |
| Q/E | Rotate (90°, or 15° with the grid off); also rotates a hovered placed item in place |
| G | Grid snap on/off |
| X / Delete | Remove the hovered or held item (back to storage) |
| Ctrl+Z | Undo |
| Esc | Drop what's in hand; again to leave (auto-saves) |

## 5. Saving and sharing
- Layouts are stored as `items: [{k, x, z, r, t?}]` (lot coordinates) in the shared `plots/{owner}` record, plus this browser, so every visitor sees every lot as its owner left it. The record has one writer (`saveMyPlot`), which ignores the echo of an older write.
- Placed solid items block walking and are physics bodies for carts and cars; the garage blocks only its walls, so you can walk in.
- New lots start with a lawn chair and a cooler.

## Detailed CC0 models (Poly Haven), in the game since Nov 14
19 models, CC0 (thanked in the credits):

| Catalog item | Poly Haven id | Category |
|---|---|---|
| Wooden picnic table | `wooden_picnic_table` | Furniture |
| Café table + 2 chairs | `outdoor_table_chair_set_01` | Furniture |
| Plastic patio chair | `plastic_monobloc_chair_01` | Furniture |
| Painted wooden bench | `painted_wooden_bench` | Furniture |
| Painted porch sofa | `painted_wooden_sofa` | Furniture |
| Folding stool | `folding_wooden_stool` | Furniture |
| Stone fire pit | `stone_fire_pit` | Furniture |
| Garden gnome | `garden_gnome` | Decoration |
| Concrete cat statue | `concrete_cat_statue` | Decoration |
| Planter box | `planter_box_01` | Decoration |
| Clay planter pot | `planter_pot_clay` | Decoration |
| Potted succulent | `potted_plant_04` | Decoration |
| Wooden lantern | `wooden_lantern_01` | Decoration |
| Chalkboard sign | `standing_chalkboard_01` | Decoration |
| Watering can | `watering_can_metal_01` | Decoration |
| Propane tank | `propane_tank` | Decoration |
| Old tyre | `old_tyre` | Decoration |
| Metal trash cans | `metal_trash_can` | Decoration |
| Wooden crate | `wooden_crate_01` | Decoration |

**How they got in.** The workspace can't reach polyhaven.com, so the models were found by GitHub code search for their exact Poly Haven file names (`<id>_1k.gltf`) in public repos that include them. `/home/claude/tools/phfetch.py` downloads each one with its .bin and textures, rejecting Git LFS pointers and repos whose textures were recompressed. Spot checks against Poly Haven's published md5 checksums matched for the picnic table, table set and fire pit.

**Packing** (`tools/props/pack.mjs`): meshes over 9k triangles are simplified to about 9k; textures become 512 px JPEG (the lantern's glass keeps its alpha PNG); the origin is set at the bottom centre; each model goes out as one GLB stored base64 in `public/props/<id>.json`, because the page host won't serve binary model files. `props/manifest.json` holds the footprints. The lobby loads only the models that lots actually use.

**More Poly Haven candidates** (same pipeline): `planter_box_02/03`, `small_lpg_tank`, `plastic_jerrycan` / `metal_jerrycan`, `wooden_crate_02`, `plastic_crate_01-03`, `Barrel_01/02`, `wooden_barrels_01`, `garden_hose_wall_mounted_01`, `security_light`, `wooden_stool_01`, `modular_street_seating` (25k, would be simplified). **Too heavy for the web:** the big plant scans, `modular_chainlink_fence`, `flood_lights`.
