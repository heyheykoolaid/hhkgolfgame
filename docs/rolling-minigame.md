# The Rolling Minigame (reworked Nov 15 2026)

How rolling a joint plays. Code: `client/src/lobby/rollGame.ts` (the game) and `client/src/lobby/smoke.ts` (the stash and the joint it makes). The wider feature is in `grind-roll-smoke.md`; this doc replaces that doc's description of the minigame.

## Why it was reworked
The user's verdict on the first version: it felt cheap and nothing like a cooking minigame; the UI was weak; the mechanics weren't sound or satisfying; the nuggets were far too small and vanished quickly; it wasn't clear what tool was dispensing them, when it should simply be pinched fingertips.

## What it is now
Six steps on a rolling tray. Each is done with the mouse the way you'd do it with your fingers, each has a time limit shown as a bar, and each earns a bronze, silver or gold medal. The medals show along the top as you go.

| # | Step | What you do | What's scored |
|---|---|---|---|
| 1 | **Break it up** | Three big buds. Click one to pinch it in half ("Snap!"), click the halves to crumble them. With a grinder: drag each bud in, then draw circles to twist the lid. | Speed. By hand tops out at a low gold; the grinder scores higher. |
| 2 | **Paper** | Drag a paper from the pack onto the dashed outline, then run a fingertip along the dashed line to crease it. | How close the paper lands, and how well the crease follows the line. |
| 3 | **Sprinkle** | **Press and hold** on the dish to take a pinch. It stays between your fingertips for as long as you hold the button. Carry it over the paper and **let go** to drop it. One pinch fills one gauge. Crumbs **stay where they land**; off the paper they stay on the tray as spill; let go over the dish to put the pinch back. Six gauges under the paper go amber → green → red. | Every sixth of the paper in the green; spill costs points. |
| 4 | **Tuck & roll** | Hold the button and rub up and down, in time with a bobbing marker. The paper curls as you go. | How steady the rhythm is, and how close to the marker's tempo. |
| 5 | **Lick & seal** | One stroke along the gum strip. A gauge shows your speed: too slow is soggy (blue, drips), too fast is dry (grey), the middle is just right (green). The strip is coloured as you go. | The share of the strip licked at the right speed. |
| 6 | **Twist it** | Circle the open tip twice to wind it shut, then click the joint three times to tap it down. | Speed. |

- **The result:** the average of the six scores gives **Clean** (0.74 and up), **Decent** (0.48 and up) or **Messy**. A finale shows the joint, the six medals and the verdict.
- **Running out of time** on a step scores it low (or, for sprinkling, scores what's on the paper) and moves on.
- **Esc** gives up; nothing is used up unless the joint is finished.
- **Keys work too** for every step (Space is the mouse button; W/A/S/D move the fingers when sprinkling; W/S alternate to roll), but they score a little lower on some steps. The controls panel shows the keys for the current step.

## Look and feel
- A cream sticker card with a red step badge and a marker-pen title, to match the swing meter.
- Chunky outlined drawing: big buds with orange hairs and frost, and hands shown as **fingertips only** (the last joint, fading out toward the hand): two that pinch, one for creasing, two thumbs for rolling. A tongue for sealing; in that step the real mouse pointer shows, since there's no hand on screen.
- Pop-up words ("Snap!", "Crumble!", "Pinch!", "Dead on!"), a small shake on a gold, and the existing rustle and blip sounds.
- A title card introduces each step, and dashed marching arrows and rings show where to start.

## Numbers worth knowing (all in `rollGame.ts`)
- Time limits: 16, 16, 30, 14, 12, 12 seconds.
- Buds are 64 px across on a 960 × 600 canvas; crumbs are 9–15 px.
- Sprinkling: a pinch is exactly what one sixth of the paper wants (4 crumbs for a Skinny, 5 for a Regular, 6 for a Fatty), dropped in one go within about 2 cm either side of the fingertips; 50 crumbs in the dish; green is 80%–140%.
- Rolling: 10 strokes, target 0.42 s apart.
- Licking: the green band is 170–380 px a second.

## Changed after the first playtest (Nov 15)
The user called the game "great work" and asked for three changes, all made: fingertips instead of long fingers; hold-to-carry sprinkling, because sweeping made it too easy to overfill in the wrong places; and a visible pointer when licking.

## Not checked
- **Nobody has played it at full speed.** The test browser runs at about one frame a second, so every step was checked by setting its state and by driving the game's own pointer, not by real mouse play. Step 1 and step 3 were played through that way and scored as expected. Timings, the green bands and the grade thresholds are reasoned guesses and likely need tuning.
- Touch screens (it uses pointer events, so it should work, but it's untried).
- The marker-pen font couldn't load in the test browser, so the title's look is unconfirmed.
