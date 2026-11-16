# World Feel & Ambient Details (design added Nov 14 2026; two passes built Nov 15)

Concrete details that make the lobby feel like a real, lived-in place instead of a clean multiplayer hub. **Tone:** trailer-park-meets-golf-course with a soft criminal undercurrent. Related: `lobby-design.md` (zones), `art-direction.md`, `asset-audit.md`, `cart-radio.md`.

## Built so far (Nov 15)
Everything here is in both the lobby and the course unless it says otherwise. Apart from the two strollers, none of it is synced between players: each player hears and sees their own.

**Sound** (`client/src/audio/ambience.ts`). All of it is synthesized in the browser; there are no sound files (see `asset-audit.md` for why).
- **Always there:** a low city hum, a highway far off, light wind that gusts, and evening crickets (two near voices and a far trill).
- **Now and then:**
  - a car or truck passing on the highway every 20–65 seconds: an engine note and tyre roar sweeping across and dropping in pitch;
  - **the city, far off:** a siren every few minutes, a car horn or two, a bus letting off its air brakes, a dog barking a few streets over (rarer and fainter on the course);
  - small birds chirping every 20–50 seconds, and a mourning dove every one to three minutes;
  - a freight train's horn, miles away, every four to eight minutes.
- **Tied to what you see:**
  - a flock overhead calls as it passes, from the side it's on;
  - the jet has a soft roar that follows it across;
  - the plaza fountain splashes, louder as you walk up to it (lobby);
  - birds on the ground take off with a flutter of wings and alarm cheeps;
  - the cat meows now and then, and yelps when startled (lobby).
- **Movement, yours and other people's:**
  - **footsteps change with the ground:** plaza and sidewalk concrete, road asphalt, lot gravel and meadow grass in town; grass, green, sand and cart-path gravel on the course;
  - **other players' footsteps** come from where they are, fading with distance; so do the strollers';
  - **your cart** has an electric whine that rises with speed, and tyre noise; **the nearest other cart** is heard from its direction.
- **The mix differs by place:** the town has more highway and crickets; the course has more wind and birds.
- **A speaker button** (bottom right) turns the ambience off and on, and remembers the choice. Footsteps, golf and casino sounds stay on.
- The ambience dips while you're at the blackjack table or rolling.
- **Tuning (Nov 15):** the first mix was "a bit busy", so everything occasional was made rarer and the crickets quieter. After a playtest: the passing car was filtered noise alone and sounded like **a wave breaking**, so it now has an engine; the town's wind was halved; and city sounds were added, since the town sits on the edge of a city.

**Wind you can see** (`client/src/world/wind.ts`). The gusts you hear are the gusts that move things.
- Palms lean and rock from the ground up, and their fronds flutter.
- Oak crowns shiver.
- Grass bends further and leans downwind.
- The flag on the green ripples in a gust and hangs limp when it's still.
- String lights on lots swing between their posts.
- Not moved yet: the shadows of trees (they stay still), the RV awnings, the chain-link fences.

**Sky life** (`client/src/world/skylife.ts`)
- **Birds:** up to three small flocks at a time cross the sky in a loose V, 50–190 m away, flapping and sometimes gliding, dark against the sunset.
- **A jet:** every couple of minutes an airliner crosses high up with red, green and white strobe lights, trailing a contrail that widens and fades over about a minute.
- **A pale moon** is up in the east, opposite the sun.

**Ground life** (`client/src/world/critters.ts`, `client/src/lobby/strollers.ts`)
- **Birds on the ground:** four to seven small brown birds land somewhere near, hop and peck, and take off together when someone comes close: about 2 m if you creep, 4 m at a walk, 9 m if you sprint or drive at them. They fly away from whatever scared them and land somewhere else half a minute later. In town they use the plaza, the streets and the meadow; on the course, the fairway ahead and beside the green.
- **A stray cat** (lobby): an orange tabby sits at one of seven spots (by lot fences, the tee board, a bench, the pro shop), watching the nearest person. Come within about 3 m and it bolts to the hiding place farthest from you.
- **Two strollers** (lobby): a retiree in a loud shirt and a neighbour in a purple top walk the sidewalk round the plaza in opposite directions, for ever. Their position comes from the clock, so everyone sees them in nearly the same place. You walk through them; they don't react. Birds and the cat treat them like players.

**Already there before these passes:** the sunset sky photo, drifting clouds and their shadows, long cast shadows, the city skyline.

**Not checked by a person yet**
- The sound levels were measured, not listened to. Whether the mix is right, and whether the crickets, dove and cat read as what they are, needs ears.
- The wind was checked by comparing frames (things move about three times as much in a gust) and one side-by-side picture. How it looks in motion needs eyes.
- The cat's run and the birds' take-off were confirmed to trigger, not watched at full frame rate.

## Still to do from this doc
- **More positional sound:** music leaking from RVs, a vending machine hum, Dealer Alley's bass, distant clapping on the course.
- **More ground life:** someone walking a dog, a groundskeeper and NPC carts on the course, a car passing the gate, NPCs that react (glance over, step aside).
- **Zone flavour** (§4) and the **rare moments** (§6).
- **Sky extras:** heat lightning on the horizon, gnats in the sunbeams, a first star.
- **Recorded sounds:** if you download CC0 clips (see `asset-audit.md`), they can replace the synthesized highway, crickets and birds one layer at a time.

---

## Decision (Nov 14)
**Golden hour stays** for the lobby and the course. The original notes asked for a perpetual late dusk / early night. Everything below is adapted to golden hour:
- Lights, neon and bugs become softer accents, glowing more in shaded spots (Dealer Alley, under awnings, inside tents).
- Night-only details are swapped for evening equivalents (see §1 and the notes in §2–§3).

## 1. Sky & atmosphere (golden hour)
- **Time of day:** a perpetual golden hour, low warm sun and long shadows, as in the build today.
- **Gradients:** warm orange and gold near the horizon, softening to a dusty blue overhead.
- **Clouds:** slow-moving clouds that occasionally drift across the sun, so their shadows sweep over the town and the course. *(Built.)*
- **Haze:** very light haze in low areas (especially near Dealer Alley and between RV lots), so the low sun and any lit signs bloom nicely.
- **Life in the sky:** occasional distant heat shimmer or a faint flash of heat lightning on the far horizon (no thunder).
- **Moon:** a pale moon already up in the eastern sky. A first faint star or two is optional. *(The moon is built.)*

## 2. Audio landscape (layered)
**Base layer (always present)** *(built)*
- Early-evening crickets and cicadas, low and steady.
- Soft wind through trees and chain-link fences.
- Distant highway hum: a constant low rumble that rises and falls as "traffic" passes.

**Mid layer (positional)**
- Occasional cars passing on the unseen highway or access road (Doppler as they go by). *(Built.)*
- **Golf course:** distant polite clapping, a ball being struck, a cart motor whining. *(Other carts are built.)*
- **Dealer Alley:** muffled bass from a car stereo, occasional laughter, a lighter flicking, a bottle clinking.
- **RV lots:** different music leaking from RV windows or Bluetooth speakers (players choose their own lot music later; the cart radio is in `cart-radio.md`).
- **Plaza:** quiet chatter, footsteps on concrete, a vending machine humming. *(The fountain and footsteps are built.)*

**High / sparse layer**
- A few evening birds (mourning doves, swifts, a distant nighthawk) calling now and then. *(Built: dove, small birds.)*
- An occasional plane or helicopter far above. *(Built: the jet.)*
- A train horn in the far distance every few minutes. *(Built.)*
- Soft radio chatter or police-scanner bleed near Dealer Alley (flavour only).

The mix shifts naturally as the player moves between zones, so each area has its own identity.

## 3. Ambient life & movement
**Sky**
- Small flocks of birds occasionally crossing in the distance, dark against the sunset. *(Built.)*
- A rare low-flying plane with blinking lights. *(Built, as a high jet with a contrail.)*
- Gnats and bugs swarming in the low sunbeams and around grow lights and neon signs.

**Ground level**
- A few looping NPCs on predictable paths: someone walking a dog, a guy pushing a shopping cart, a groundskeeper on the golf course. *(Built: two strollers round the plaza.)*
- NPC golf carts on the course at a leisurely pace.
- An occasional car that drives past the lobby entrance and keeps going.
- Stray cats on fences or under RVs that scatter when players get close. *(Built: one cat.)*
- Moths and small insects orbiting lights.

**Reactive details**
- Sprinting or driving a cart fast near birds on the ground makes them take off. *(Built.)*
- Loud moments (a bad golf shot onto a cart path, a big sale at the dealer) make nearby NPCs glance over for a second.
- Grow lights on player lots attract more insects and have a soft audible buzz.

## 4. Zone-specific flavour
**RV lots**
- Lots feel lived-in: plastic chairs, coolers, string lights, a half-finished project, a grill still smoking.
- Wind chimes or metal ornaments clinking on some lots.
- A distant sprinkler or a buzzing grow light sells the fantasy.
- Ready plants get a very subtle sparkle or gentle pulse so they read from a distance without being garish.

**Dealer Alley** (the shadiest spot in town, so its lights read even at golden hour)
- A flickering fluorescent tube or single bare bulb.
- Wet patches on the ground reflecting neon and the orange sky.
- Graffiti that slowly changes over days/weeks (or at least feels hand-placed).
- A metal door that occasionally opens and closes with a heavy clang.
- A soft red glow from a hidden window or sign.

**Golf course**
- Perfectly kept grass that looks almost too clean compared with the rest of the lobby.
- Flags gently moving in the wind. *(Built.)*
- Stylized dew glinting in the low sun in low spots.
- Sprinklers turning on in distant fairways with a soft rhythmic sound.
- Ball washers and trash cans that look placed by a real grounds crew.

**Central plaza**
- Warm string lights or neon: the most inviting area.
- A couple of benches with NPCs sitting and occasionally checking their phones.
- A vending machine or two that players can actually use (small flavour purchases).
- Sparse but present litter (cigarette butts near the dealer path, a crumpled energy drink can).

## 5. Small "game feel" touches
- Footsteps change with the surface: gravel on lots, concrete in the plaza, soft grass on the course, metal grate near the dealer. *(Built, except the grate.)*
- Cart tires: a distinct electric whine plus a soft gravel crunch. *(Built: the whine and tyre noise; it doesn't change with the surface yet.)*
- Harvesting a plant: a light particle effect and a satisfying soft "snip / bag" sound.
- A big sale at the dealer triggers a slightly longer voice line and a quick glance from nearby NPCs.
- Wind occasionally picks up for a few seconds, moving flags, string lights and tree leaves together. *(Built.)*

## 6. Optional dynamic moments (use sparingly)
- A police car slowly rolls through the far edge of the lobby with its lights off, then leaves.
- A group of NPCs briefly argues near the dealer, then disperses.
- A streetlight flickers and dies for 30 seconds before coming back.
- A distant dog barks for a short while, then stops.

These should be rare enough to feel like part of a living place, not scripted events on a timer.
