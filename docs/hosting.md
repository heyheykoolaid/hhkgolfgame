# Hosting Golden Hills on Cloudflare (added Nov 23 2026)

The game can run in two places from the same code:

- **The Claude artifact page** (as before): multiplayer, saves and names come from the page's own runtime.
- **Cloudflare**, from the GitHub repo: a small Worker (`packages/worker`) serves the game's files and provides the same three things itself. Players pick a name on their first visit.

The game decides at start-up (`client/src/platform.ts`): on the artifact page it uses the page's runtime; otherwise, if `/api/hello` answers, it uses the Worker (`client/src/net/cloud.ts`); otherwise it is solo play with saves in the browser.

## Accounts
- **No passwords.** On a first visit the name card asks what everyone should call you. The server makes an account and hands the browser a secret token, which it keeps (`localStorage gh_token`). Only the token's SHA-256 is stored on the server.
- **Names are unique** (ignoring capitals), 1 to 20 characters. Change yours in Options → Account.
- **Another computer:** Options → Account → Copy your *account code*, then on the other computer choose "I already have an account code" on the name card and paste it. Same player, same lot, wallet and clothes.
- **Whoever has the code is you.** Lose it (clear the browser) without a copy and the account can't be recovered. Fine for friends; not for strangers.

## What the server stores and enforces
- `plots/<uid>`: your lot (layout, garden, lot number). Everyone can read it; only you can write it. Changes are pushed to everyone watching.
- `data/users/<uid>/<name>`: your look and your progress (wallet, items, cars, trophies). Only you can read or write it.
- Documents are JSON objects of at most 512 KB. Nothing else can be written.
- **Presence rooms:** `lobby`, and one per golf match (`gh-golf-<match>`). Each player publishes one object (24 KB at most); the room passes it to everyone else. A room sleeps when nobody is talking (Cloudflare's "hibernation") and asks everyone to publish again after waking.
- **Not protected** (same as on the artifact page): a modified browser can lie about its own wallet, score or plants.

## Will it stay free?
Cloudflare's free plan, as of Nov 2026: Durable Objects get 100,000 requests a day, and incoming WebSocket messages count 20 to a request, so about 2 million presence messages a day. Duration is 13,000 GB-s a day, roughly 28 hours of one room being awake. Serving the game's files is free and unlimited.
- The game publishes presence about 10 times a second while you move. Four friends playing three hours is about 430,000 messages (about 22,000 requests), and a lobby and a golf room awake for those hours is about 6 room-hours. Well inside.
- If you outgrow it, the paid plan is $5 a month and the numbers above become monthly allowances with cheap overage.
- On the free plan, going over a limit makes that day's further requests fail until midnight UTC; nothing is charged.

## Putting it online (once)
1. **Make a free Cloudflare account** at dash.cloudflare.com, and open **Workers & Pages** once: it asks you to pick your `workers.dev` subdomain. Note your **Account ID** (shown on that page).
2. **Make an API token:** your profile (top right) → **API Tokens** → **Create Token** → use the **Edit Cloudflare Workers** template → Continue → Create. Copy it (it is shown once).
3. **Give both to GitHub:** the repo `heyheykoolaid/hhkgolfgame` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**: `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (the ID).
4. **Deploy:** the repo's **Actions** tab → **Deploy to Cloudflare** → **Run workflow**. From then on every push to `main` deploys by itself (`.github/workflows/deploy.yml`: install, `npm run check`, build, `wrangler deploy`).
5. The game is at **`https://golden-hills.<your-subdomain>.workers.dev`**. A domain of your own can be attached later under the Worker's **Settings → Domains & Routes**.

Or from a computer with Node: `npm ci`, `npm -w @gh/client run build`, then `cd packages/worker && npx wrangler login && npx wrangler deploy`.

## Running it locally
`npm -w @gh/client run build`, then `cd packages/worker && npx wrangler dev`. It serves at `http://127.0.0.1:8787` with its own local storage under `packages/worker/.wrangler/` (not committed).

## Not carried over
Saves on the artifact page stay there: a player starts fresh on Cloudflare (new name, $5,000, an empty lot). An import could be added later.

## Things the move makes possible (not done)
- The cart radio could play live internet radio again (the artifact page blocked outside audio).
- Models could ship as ordinary binary files (`.glb`) instead of base64 inside JSON, which would cut the download.
- Real sign-in (Google, Discord) instead of account codes, if strangers ever play.
