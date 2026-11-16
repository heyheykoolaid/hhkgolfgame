# Multiplayer Blackjack in the Lobby (built at the plaza table; brought up to date Nov 15 2026)

Blackjack is one of the main money sinks and social activities in the lobby. It should feel easy to join, readable at a glance, and satisfying whether you're playing seriously or just gambling away drug money between golf rounds. Related: `street-dealer-economy.md` (cash), `lobby-design.md` (Blackjack Lounge), `world-feel.md`, `roadmap.md`.

## Built (as of Nov 15)
**Where and who:** the plaza table, under the umbrella: a hand-built half-moon table with **5 seats and stools**, five betting circles on the felt, a chip tray, a discard holder and a card shoe. A **dealer NPC** stands behind it.

**Sitting and leaving**
- Walk up to a seat and you see **"Sit · Min bet $10"**, or "NAME is sitting here" if it's taken. Press E to sit.
- You **sit on the stool** in a seated pose with your hands on the rail, and other players see you there.
- **Esc** leaves the table. You can't leave in the middle of your own hand.
- Heading off to golf takes you out of your seat automatically.

**A round**
- **Betting (10 s):** chip buttons (or keys 1–5), Clear, and **Ready** (Space).
  - Your bet carries over to the next hand.
  - "Sitting out" means you don't play that hand.
  - The hand deals early once everyone with a bet is Ready.
- **Dealing:** two cards each, seat by seat, plus the dealer's up card and hole card. Cards fly out of the shoe in the real deal order, and the dealer's hands follow them.
- **Turns:** clockwise from the dealer's left (seat 1 → 5).
  - The active player gets a **YOUR TURN** banner with a **20 s** countdown, red in the last 5 s. Everyone else sees **"Waiting for NAME"**.
  - The active seat's label glows gold, and **the dealer turns to face that player**.
  - Running out of time **stands** the hand.
- **Dealer and payout:** the hole card flips and the dealer draws to 17. Each hand gets a WIN / LOSE / PUSH / BUST / BLACKJACK tag. Winnings stack up beside the bet, and your cash updates once the cards land.
- **Next hand:** about 4.5 s later (longer if the dealer drew), the next betting phase starts.

**The dealer NPC**
- His hands follow the cards as he deals, flips and collects.
- He shuffles when the shoe is reshuffled.
- Between cards he faces whoever's turn it is.

**On screen**
- Every seat shows its name and bet (or "Open seat"), plus each hand's total.
- **Camera:** **first person** from your own head, looking down at your cards (drag to look around, Shift to lean in), or over the shoulder showing the whole table. Toggle with **V**.
- **The card shoe** sits in the dealer's corner so it doesn't hide the first seat's chips.
- **Controls panel:** the keys are listed down the right-hand side while you're seated (`ui-and-controls.md`).

**Rules and safeguards**
- **Rules:** the house rules from `shared/src/blackjack.ts`: 6-deck shoe reshuffled at 75%, dealer stands on all 17s, blackjack pays 3:2, double on any two cards (also after a split), one split, split aces get one card. No insurance and no side bets.
- **Limits:** $10 to $5,000.
- **AFK:** timing out on 3 hands in a row takes you out of your seat.
- **Sound:** card and chip sounds follow the Game sounds volume in the options menu.

**How it works (no server)** — `shared/src/bjtable.ts`, unit-tested:
- **The host:** the seated player with the lowest uid. Their client runs the round clock (`hostStep`): betting → play → done → betting.
- **What the host publishes:** the round number, phase, end time, a random seed, the participants and their bets, and any timeouts, all in its lobby presence. It also ticks on a timer, so a host whose tab is in the background doesn't freeze the table.
- **What each player publishes:** their seat, bet, actions this round (`h` `s` `d` `p`) and Ready flag, also in presence.
- **Replaying the round:** every client deals the same shoe from the seed (each card carries its draw order as an id) and replays everyone's actions in seat order (`replayRound`). So all screens show the same cards, and the dealer's play needs no one to run it.
- **Host hand-over:** if the host leaves, the next lowest uid takes over from the last state it saw.
- **Cash:** each client moves only its own player's cash.
  - The stake comes off when the round deals.
  - Doubles and splits are paid when pressed.
  - The payout is credited after the cards land. Debits and payouts are keyed by round and seed, so a replay can't pay twice.
- **Bad data:** what other players publish is cleaned before use (`cleanSeatPres`, `cleanTableHost`).
- **Known leftover:** the countdown other players see comes from the host's clock, so it can read a few seconds off. Only the display is affected.
- **Tested** with two browser tabs. Both clients agreed on every round, phase, active seat and timeout, through several hands.

**Timer history:** the decision timer started at 15 s, went to 30 s on Nov 14 at the user's request, and to **20 s** on Nov 15.

**Not yet:**
- a "Spectating" indicator;
- Quick Play hints;
- the hand-history log;
- a rebuy window (out of cash = you can only sit out);
- the Lounge with several tables;
- insurance, surrender and side bets;
- the other four seats' first-person views haven't been checked by a person.

## Decisions (Nov 14)
1. **Two camera options:** a third-person / over-the-shoulder view that shows the whole table, and first person.
2. **No insurance.**
3. **Side bets later** (Perfect Pairs, 21+3), not in the first multiplayer version.
4. **Table limits stay at today's $10–$5,000.** Every table uses the same limits for now (no Low / Medium / High tiers yet).
5. **No NPC players** at the tables for now. (A dealer NPC was added the same day.)

## 1. Location & table setup
- Blackjack lives in the **Blackjack Lounge**, a distinct indoor (or semi-indoor) space just off the Central Plaza.
- **Multiple tables** (recommended start: 4–6).
- Each table seats **1–5 players + the dealer**.
- All tables use **$10–$5,000** for now (decision 4). Different minimums per table (Low / Medium / High) can come later.
- Players walk up to any open seat and sit down. No matchmaking queue.
- Empty seats are clearly marked. Occupied seats show the player's character and a small name/bet indicator.

## 2. Joining a table
- Walk up to an empty seat → prompt: **"Sit – Min Bet $10"**.
- Confirm, and the character sits down with a short animation.
- Once seated, the player stays at that table until they leave (or are removed for being AFK too long).
- Players can still look around, emote and chat while seated.
- **"Leave Table"** is always available.

## 3. Table flow (core loop)
Continuous, fast-paced multiplayer rounds rather than private matches.
1. **Betting phase (8–12 s).** All seated players place or adjust bets, with a visible timer. Players who don't act keep their previous bet (or sit out the hand if they have no bet).
2. **Dealing.** Cards are dealt visibly to all players and the dealer. Animations are clear and not too slow.
3. **Player turns.** Play goes clockwise from the dealer's left. Only the active player can Hit / Stand / Double / Split. Others see everything and can emote or talk, but can't act until their turn.
4. **Dealer reveal & resolution.** The dealer plays out by standard rules. Wins, losses and pushes resolve instantly, with clear feedback and cash updates.
5. **Short pause (3–5 s)** to celebrate or complain, then the next betting phase starts automatically.

This keeps the table moving and avoids downtime.

## 4. Player actions (standard rules)
- Hit, Stand, Double Down (on the first two cards), Split (when offered).
- **No insurance** (decision 2).
- **Side bets later** (decision 3): Perfect Pairs and 21+3, clearly separated from the main bet when they arrive.

## 5. Betting & money
- All bets use the same cash earned from the Street Dealer.
- Players can only bet what they currently have.
- Minimum and maximum bets are enforced per table ($10–$5,000 everywhere for now).
- Each player's chip stack or cash total is always visible on the table.
- Normal payouts: 3:2 on blackjack, 1:1 on regular wins.
- Instant cash updates with satisfying feedback: chip animations plus floating +$ / −$ text.

## 6. Turn clarity & pacing
- The active player's seat and cards are highlighted.
- A large **YOUR TURN** indicator for the active player; everyone else sees **"Waiting for [Name]"**.
- A soft per-turn timer (built at 20 s). When it runs out, the hand automatically stands.
- Optional **"Quick Play"** preference that highlights the recommended action (basic strategy assist).

## 7. Social & lobby feel
- Players at the table can emote, use voice chat or text chat.
- **Spectators** can stand around and watch; a small "Spectating" indicator lets players know they have an audience.
- The lounge feels alive: ambient casino audio and other tables running in the background. No NPC players for now (decision 5).
- Players bounce between blackjack, their RV lot, the dealer and golf, so tables support easy drop-in / drop-out.

## 8. AFK & table management
- A player inactive for several full hands gets a warning, then is removed so the seat opens.
- A player who runs out of money gets a short window to rebuy, or moves to spectator status.
- No table hosts: the game manages everything automatically.

## 9. UI layout (while seated)
- Your cards (large and clear) and the dealer's cards.
- Other players' cards (smaller, arranged around the table view).
- Current bet and remaining cash.
- Action buttons (Hit / Stand / Double / Split) only on your turn.
- Betting controls during the betting phase.
- Table minimum / maximum.
- Optional small log of recent hands.

**Camera (decision 1):** two options, switchable while seated:
- **Third-person / over-the-shoulder:** shows the whole table while keeping your own cards readable.
- **First person.**
