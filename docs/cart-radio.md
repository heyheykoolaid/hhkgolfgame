# Cart Radio (designed Nov 14 2026 as live internet radio; built Nov 15 as shipped playlists)

The stereo in your golf cart, go-kart or car. It works like a rolling boombox: other players hear it from where the vehicle is. Related: `world-feel.md` (audio landscape), `roadmap.md`.

## Live stations (Nov 24)
On Cloudflare, each band plays live internet stations (`audio/stations.ts`, listed in the roadmap's Nov 24 entry), falling back to the shipped tracks below when none play or on the artifact page. The decisions above stand: everyone near a cart hears it, nothing ducks.

## How it works today (Nov 16)
This section is the truth; the original design below is kept for what is still to build.
- **It does not play live internet radio.** The published page can only play sound from the game's own files (tested Nov 15: the host blocks outside streams). So each of the ten bands is a **playlist of four public-domain tracks shipped with the game** (40 tracks, about 50 MB, from the SoundSafari CC0 collection: FreePD and Free Music Archive; `public/radio/`, listed in `radio.json`).
- **Everyone hears the same song at the same moment:** each band runs on the wall clock, so nothing but `{band, on, volume}` is shared between players.
- **Keys, while driving (town and course):** **R** on/off, **1–0** pick a band, **− / =** volume. A small stereo display shows the band and the track.
- **It keeps playing from a parked vehicle** and is heard by distance, yours and other players': capped, and fading out by about 34 m.
- **Options menu:** "Cart radio" and "Other carts' radios" volume sliders.
- **It never ducks** for swings or anything else (decision 3).
- **Not on the course yet:** other players' radios (you hear only your own there).
- **Code:** `audio/radio.ts` (the bands and playback), `audio/cartRadio.ts` (the keys, the display and the shared state, used by town and course).

**The ten bands as shipped**
| # | Tag | What it plays |
|---|---|---|
| 1 | TIKI FM | Exotica & island lounge |
| 2 | YACHT | Smooth & easy |
| 3 | HANG TEN | Surf & twang (Ghost Surf Rock was dropped as "awful"; Beach Babes took its place) |
| 4 | ITALO | Synths & neon |
| 5 | CITY POP | Funk-pop & city nights |
| 6 | OUTLAW | Banjos & honky-tonk |
| 7 | DUB | Reggae & dub |
| 8 | SPACE | Drifting ambient |
| 9 | BIG BAND | Hot jazz off the gramophone |
| 0 | THE STATIC | Weird & wonderful |

Tracks were picked by title and artist, not by ear. Tell Claude which ones don't fit.

## Decisions (Nov 14, still standing)
1. **Ten genres, deliberately eccentric.**
2. **Driver and passengers both control the radio** (once vehicles carry passengers; today they seat one).
3. **The radio plays on the golf course too, including turn-based rounds, and never ducks during swings.** Players who want it quieter use the options menu.
4. (Nov 15) **Shipped playlists instead of live streams**, because the host blocks outside audio.

## Still to build
- **The zoomed faceplate:** press interact at the dashboard and the camera eases in until a car-stereo faceplate fills the view (display, Tune / Seek, volume, presets, power). Today the radio is keys and a small display only.
- **Presets** saved with the player's progress.
- **Other players' radios on the course.**
- **More tracks per band** (four each gets repetitive), chosen by ear.
- **Passenger control**, when vehicles seat more than one.
- **Car stereos that differ by car** (a tinny pickup speaker, a land yacht's warm one): an idea, not asked for.

## If the game ever moves to a host that allows outside audio
The original plan could come back. Its rules, for the record:
- A maintained list of direct stream URLs, two or three vetted stations per band (SomaFM, community and college stations, the Radio Browser directory filtered by tag). No player-entered URLs.
- Each stream must be `https://`, send CORS headers (needed to route it through Web Audio for positional sound and the volume cap; without them the browser outputs silence), stay up, and suit a mixed lobby.
- Each listener's own browser opens the stream; nothing is relayed between players, so they would be a few seconds apart.
- Failures show "Reconnecting…" or "Station unavailable", then try the next station in the band.
- Browsers only allow audio after a click or key press; joining the game already takes one.
- Playing a public station's stream in your own browser is ordinary listening; prefer stations that allow embedding.
