# UI: Controls Panel, Options, Welcome, and the Review (Nov 15 2026)

What the first UI pass added and changed, and what the review found but left. Code: `client/src/ui/controls.ts`, `ui/options.ts`, `ui/welcome.ts`, styles in `ui/hud.css`. Related: `architecture.md`, `roadmap.md`.

## The user's asks (Nov 15)
- "A better context-sensitive UI for controls along the side of the screen with clear and easy to read text."
- "Do a large review of the game's UI, simplify where possible, and create flow. There should be an options menu."

## Controls panel
A card down the right-hand side that always shows what the keys and mouse do **right now**.
- **Where it shows:** on foot in town, driving, Build Mode, the blackjack table, chat, the stash, each step of rolling, and on the course: lining up, putting, swinging, ball in the air, not your turn, on foot, driving.
- **It changes with the situation:** "Build Mode" appears only on your own lot; "Hold to puff" and "Pass it" appear only with a joint in hand; the rolling rows change inside a step (for example from "Click the dish for a pinch" to "Hold over the paper to sprinkle").
- **How it reads:** big labels (15 px, bold), cream keycaps, a small mouse picture for mouse actions, the most important action in green.
- **Folding it away:** the "Controls" tab at its top folds it; the options menu can turn it off altogether.
- **On the course it sits low** on the right so it never covers the swing meter.
- It replaced the old one-line hint at the bottom of the town screen and the tiny key list on the club card.
- **For developers:** whoever owns the situation calls `controls.set(id, title, rows)` every frame; the panel only redraws when something changed. The town's lists are `TOWN_KEYS` in `lobby.ts`; the course's are `COURSE_KEYS` in `golfMode.ts`; rolling's come from `rollGame.controls()`.

## Options menu
**Esc** or the gear in the bottom-right corner. Settings are remembered in the browser.
- **Sound:** Everything, Ambience, Game sounds (three sliders). All sound now goes through shared volume controls (`audio/ctx.ts`: `sfxOut`, `masterOut`), including blackjack and the smoking sounds, which used to bypass everything.
- **Picture:** Shadows on or off (the most expensive thing drawn); Sharpness soft, normal or sharp.
- **Controls:** mouse look speed (town); the controls panel on or off.
- **On the course:** a "Leave the round" button.
- While it's open, keys don't reach the game.

## Welcome card
Shown once, on a first visit: what the game is, where to play golf, your lot, the plaza, the controls panel, and Esc for options.

## What else changed in this pass
- **Esc is the same everywhere:** it closes whatever is open; with nothing open it brings up the options menu. On the course it used to leave the round at once.
- **The speaker button is gone;** ambience volume in the options menu replaces it (an old "off" choice is carried over).
- **The "who's here" pill** is shorter.

## Review: what's still inconsistent (not done)
1. **Three visual styles.** The dark glass pills and panels (HUD, tee board, stash), the cream sticker cards (swing meter, rolling game, welcome) and the blackjack table's own bar. Pick one for panels and one for "game moments", and restyle the stash, dealer, mailbox and trophy case to match.
2. **Panels each have their own header, close button and footer hints.** A shared panel shell (title, close, one place for key hints) would make them feel like one game, and their footer hints could go now that the controls panel exists.
3. **Build Mode and blackjack keep their own on-screen key bars** as well as the controls panel. One of the two should go.
4. **The town's on-foot list is long** (ten rows). The rarely used ones (wardrobe, trophies, flop) could move behind a "More" row.
5. **Prompts ("E …") and toasts** appear in different places and sizes in town and on the course.
6. **The course HUD:** the group board, the Bets bar and the controls panel all stack on the right; on a narrow window they crowd the swing meter. The panel hides under 820 px wide.
7. **Touch screens** have no on-screen controls at all.
8. **Mouse look speed** applies in town only; the course's camera doesn't use it yet.
9. **No way to rebind keys.**

## Not checked
- Sliders were tested by setting them from a script and checking they save; nobody has listened to the volumes change.
- Sharpness "Sharp" on a high-density screen (frame rate).
- The welcome card and options menu were looked at in one window size (1280 × 760).


## Nov 15 additions

- **Drifting:** in a cart, Space is the brake; held while steering at speed it starts a drift, and letting go gives a boost.
- **Wardrobe:** now five tabs (Body, Hair & hat, Top, Legs & feet, Extras). Rows that don't apply are hidden (no jacket row with overalls, no paint colour without paint). While it's open the controls card moves to the bottom left so it doesn't cover the panel.
- **The tee tip toast is gone** from the start of each hole.
