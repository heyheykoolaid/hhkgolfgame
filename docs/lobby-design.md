# Lobby Design (design, partly built — added Nov 14 2026; Fun Land added Nov 15)

A practical design for the multiplayer lobby that supports growing, selling to the Street Dealer, blackjack, golf and plot customization. Related: `street-dealer-economy.md`, `build-mode.md`, `multiplayer-turns.md`, `roadmap.md`, `art-direction.md`, `world-feel.md`.

## Decisions
1. **Golden hour stays** (Nov 14). The lobby keeps the art bible's warm late-afternoon light, like the rest of Golden Hills. No night-time lobby. (Neon and dim lighting, where wanted, are local touches inside Dealer Alley and the Blackjack Lounge, not the world's lighting.)
2. **Plots stay RV lots, at their current size** (Nov 14). Each player's property is an RV lot; the RV itself is the "small indoor area". The lot footprint doesn't change; Build Mode items (garage, planters, decor) are sized to fit it.
3. **A bigger town is fine** (Nov 14). "Walk anywhere in under a minute" is relaxed, so the town can grow with new zones. Each lot gets a **buildable garage for the player's golf cart**, which is where cart customization lives (paint, parts, accessories), instead of the clubhouse.
4. **Carts drive around town** (Nov 14). Your cart isn't limited to the course: it parks in your garage and you can drive it anywhere in the lobby. **The same cart comes with you onto the course** (see `multiplayer-turns.md`). Other vehicle types can be bought later.
5. **A driving range and a mini golf course** (Nov 14).
6. **Fun Land** (Nov 15, the user): when the town is rearranged, add **a little theme park called Fun Land** that holds the **mini putt**, the **driving range** and a **go-kart track**. The range and mini golf from decision 5 move inside it.

## Overall layout concept
The lobby is an open-world social hub: big enough to feel alive, small enough that walking stays pleasant (driving your cart makes it quicker). Shape: a rough rectangle or loose circle with a clear central spine.

```
        [ FUN LAND: mini putt · driving range · go-kart track ]      [Golf Course]
                             \                                       /
[Player Plots] ------------------- [Central Plaza] ------------------- [Player Plots]
                                          |
                               [Dealer Alley + Shops]
                                          |
                                  [Blackjack Lounge]
```

The town now has open meadow and tree groves all round it, out to the city on the horizon, so there's room for Fun Land beside the road to the course.

**Streets (Nov 16, `lobby/roads.ts`):** the town is a set of loops, with no street ending at a wall. Four streets box the plaza (Palm St and Gold St north–south, North St and South St east–west). All four run into **Fairway Loop**, a ring road just inside the town's edge behind the lots. Fairway Loop's west and east sides carry on north and turn into the two ends of **Shady Lane**; the **gate road** joins the loop to the middle of the lane under the Golden Hills Golf arch, and the road to the first tee leaves the lane opposite it. South St runs on west up the rise to the West Side (which ends in a turning circle) and North St east into Fun Land. New streets should be added to `STREETS` in that file so they join the plan, rather than drawn by hand.

## Key zones

### 1. Central Plaza (social heart)
- Open area with benches, signs, a big black-market style board and some ambient NPCs.
- Players naturally pass through it between plots, the dealer and activities.
- A good place for emotes, hanging out and seeing who's online.
- Optional: a small stage or event spot for future seasonal content.

### 2. Player Plots — RV lots (the core loop area)
- Arranged in a ring, or two loose rows, around the outside of the plaza.
- Each plot is a clearly bordered rectangular **RV lot** (current size): the RV (indoor space) plus yard.
- Plots are claimable; empty plots show a "Claim Plot" prompt.
- Once claimed, the owner enters **Build Mode** to place:
  - Grow beds / tents / indoor grow setups (the raised grow planter — see `street-dealer-economy.md`)
  - **A garage for the golf cart** (cart customization happens here)
  - Furniture & decorations
  - Lighting, fences, security cameras
  - A personal stash box
  - Optional market stall (if player selling is ever added)
- Plots feel private but are visible from the paths, so other players can see cool builds.
- Owned plots get a subtle nameplate or coloured border.

### 3. Dealer Alley (selling hub)
- A slightly seedy side street or back alley branching off the Central Plaza.
- The Street Dealer stands in a fixed, easy-to-find spot (by a dumpster or shuttered shop, under a buzzing light that reads even in daylight).
- Easy to find, never blocked, close enough to the plots that the walk feels short but intentional.
- Ambient details: other shady NPCs, an occasional police car driving by in the distance, graffiti, an "Open" sign.
- Feels a little riskier than the clean plaza: tighter, shadier (literally — buildings block the low sun), more run-down.

### 4. Blackjack Lounge
- Attached to, or just off, the Central Plaza: an indoor space you walk into.
- Inside: dim lighting, green felt tables, a bit of neon, classic casino audio. (Indoors is the one place neon fits the golden-hour world.)
- Multiple tables with different minimum bets, so both new and rich players have a place.
- Clear sightlines (big windows / open doors) so people walking by can see the action (social proof + FOMO).
- A cashier or ATM-style machine nearby for quick access to money.

### 5. Golf Area
- One side of the lobby opens onto the golf course.
- **Clubhouse** with: golf club / ball shop; betting board / tournament signup. (Cart customization moved to the player's own garage.)
- The course is visible from parts of the lobby, so players see others playing.
- Paths (and cart roads) from the plaza lead naturally toward the clubhouse.

### 6. Fun Land (added Nov 15)
**Built so far (Nov 15):** the park is east of town, through two gates at the ends of the east-west streets. In it: Birdie Burger (closed for now) with the **Street Dealer out the back by the washrooms and staff door**, the go-kart track with a kart stand and lap timer, the nine mini putt holes (laid out, not playable yet) and the driving range bays (built, not usable yet). The plaza no longer has the dealer.

A small, slightly tatty roadside theme park on the edge of town: the place to mess about between rounds. It fits the Tony Hawk / San Andreas "playground" spirit: chunky, readable attractions and Golden Hills humour on the signs.

- **The gate:** a big arched FUN LAND sign with bulbs, a ticket booth (free entry, or a small cash fee as a sink), bunting and flags that move in the wind.
- **Layout:** one loop path from the gate past the three attractions and back, with benches, bins, a snack stand and room for a couple of extras later (see below).

**6a. Mini putt**
- A putting-only course: 9 short holes with classic obstacles (windmill, loop, ramps, bridges, a castle, water).
- Uses the putting physics and the putter only; quick rounds for 1–4 players.
- A mini-golf windmill already exists as a Build Mode decoration; the course can share the look.
- Could hand out its own small trophies (mini cups) for the trophy case.

**6b. Driving range**
- A row of hitting bays (mats, ball buckets, dividers) facing an open range with distance flags and target greens.
- **Casual "everyone at once" mode:** no turns, no score — walk up to any free bay and hit. Good for warming up, trying clubs and spin, and hanging out between rounds.
- Possible extras: target challenges (land it on the 150-yard green), a longest-drive board, Birdie Dollar mini-rewards, a ball-picker cart driving around the range (an obvious target).

**6c. Go-kart track**
- A short, twisty circuit with tyre walls, kerbs, a start gantry and a lap board.
- **Karts:** small, fast and low, built on the vehicles framework the golf cart uses. The cart's kart-style **drift and boost** (built Nov 15) is the handling to start from.
- **Modes:** hot laps on your own with a best-time board; races for 2–6 with a countdown and positions.
- **Questions to settle when it's built:** whether your own golf cart is allowed on the track; whether races can carry cash bets like golf does; whether karts bump or pass through each other.

**Later, if it earns its place:** an arcade tent, a prize booth that takes tickets won on the three attractions, a wrestling ring (from `ideas-backlog.md`).

### 7. Shops & progression
Placed along the main paths so they're convenient:
- **Grow Supply Store:** seeds, fertilizer, lights, tents, security. (Decision elsewhere: it goes near the golf course.)
- **Character Customization:** clothes, accessories. (The pro shop's wardrobe does this today.)
- **Furniture & Decor:** for plot building (including garage parts).
- **Golf Pro Shop:** clubs, balls, carts (and later other vehicle types), outfits.
- Cart parts/paint are bought from a catalog in the garage (or at the Pro Shop) and applied in the garage.

Clustering the shops near the plaza and Dealer Alley keeps the economy loop tight: harvest → sell → buy upgrades → back to the plot.

## Movement & feel
- Wide, clear footpaths and cart-width roads so you never feel lost.
- Slight elevation changes and landmarks (a big sign, a water tower, a unique tree, Fun Land's arch) so players orient quickly.
- No fast travel needed: the town is walkable, and your cart is the quick way around.
- Ambient life: a few looping NPCs, distant golf claps, music from the blackjack lounge, occasional dealer voice lines.

## Plot design notes
- Lots stay their current size. Fit inside: the RV, a **cart garage**, grow planters and decoration space. Planters and the garage are sized for the existing footprint; plant slots grow by upgrading planters (bigger/denser) rather than by more ground.
- Clear boundaries so it's obvious where your property ends.
- Build Mode is simple: grid or free placement with snap, undo, and a clean catalog.
- Other players can walk up to the edge of your plot and see your setup (for showing off and any future player trading).

## Visual & audio tone
- **Golden hour**, as everywhere in Golden Hills (see `art-direction.md`): warm low sun, long shadows, sun-faded signage. Grow lights glow softly from plots and RVs as small accents.
- A mix of tidy suburban and a slightly gritty underbelly (Dealer Alley).
- Audio: laid-back ambience in the plaza, more industrial/rough in Dealer Alley, upbeat in the Blackjack Lounge, fairground noise in Fun Land, peaceful on the golf course.

---

## Fit with the current build (Nov 15)
What exists now: a plaza with the tee board, a rebuilt pro shop (the wardrobe), the Birdie Ball machine, a fountain, a five-seat blackjack table with a dealer, and the Street Dealer; **8 RV lots** claimed per player with **Build Mode** and a **cart garage**; **carts drivable around town**; two strollers, ground birds and a cat; walking, chat, presence; golf via the tee board. Around the town: meadow and groves out to the city skyline.

| This doc | Today | Gap / plan |
|---|---|---|
| Central Plaza | Built, with rebuilt wooden buildings and two strollers | Add the black-market board, an event spot, more townsfolk |
| RV lots + Build Mode | Built (v1), with grow gear and items on table tops and roofs | Power/water hooks later |
| Cart garage + town driving | Built, with drifting | Cart customization UI |
| Dealer Alley | The Street Dealer stands on the plaza | New zone off the plaza |
| Blackjack Lounge | One five-seat table on the plaza | A walk-in lounge with several tables |
| Golf Area + Clubhouse | Golf via the tee board | Clubhouse with shop + betting board |
| **Fun Land** | — | New zone: gate, loop path, three attractions |
| – Mini putt | — (a windmill decoration exists) | Putting-only course |
| – Driving range | — | Casual "everyone at once" mode |
| – Go-kart track | — (cart drift and boost exist) | Karts, a circuit, hot laps and races |
| Shops cluster | Pro shop wardrobe + Birdie Ball machine; the dealer sells papers and a grinder | Grow Supply, Furniture & Decor stores |
