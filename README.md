# Lamorinda B · SDCC 14U Boys A Scenario Explorer

An interactive what-if explorer for **Lamorinda B** at the 2026 San Diego County Cup, 14U Boys A division (May 1–3, 2026).

Click the winner of each game and the app computes Lamorinda's path through pool play, the Saturday crossover, and the Sunday bracket — all the way to a final placement.

## Player Stat Tracker (`stats.html`)

A companion app for tracking per-player stats game by game — a digital version of the paper stat sheet (shots, goals, assists, blocks, steals, exclusions drawn/committed, turnovers, plus goalie saves and goals against).

- **Games tab** — create a game (opponent, date, location, season, final score, notes), pick the roster for that game, then tap cells in the tally table to count stats live. A "fix a mistake" mode subtracts instead.
- **Per-game rosters** — players can be added to or removed from any single game (guests included) without touching their history.
- **Players tab** — add/edit players; *removing* a player only deactivates them: they disappear from new-game rosters but every stat they recorded stays in the database and they can be re-activated any time.
- **Player pages** — season filter, headline tiles (goals, assists, shooting %, save rate), per-game chart, totals / per-game / rolling last-5 averages, full game log, and a **Share** button (native share sheet on mobile, clipboard fallback) that sends a text summary of the player's stats.
- **Data & backup tab** — team name + current season settings, cloud sync, JSON export/import, and a "sync link" that carries the whole database in the URL for moving data between devices.

Storage is local-first: stats live in `localStorage` so tallying works instantly (and offline, poolside). With cloud sync connected, every change is also pushed to the cloud a moment later and pulled on startup, so one stats database follows you across devices.

### Cloud sync setup (one time, ~2 minutes)

The sync backend is a single serverless function (`api/sync.js`) that stores each team's stats as one JSON record in Redis. To activate it:

1. In the [Vercel dashboard](https://vercel.com), open the **sd-2026** project → **Storage** tab → **Create Database** → choose **Upstash for Redis** (free tier is plenty) → connect it to the project. This injects the `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars the function looks for (Upstash's own `UPSTASH_REDIS_REST_*` names work too).
2. Redeploy the project (Deployments → ⋯ → Redeploy) so the function picks up the env vars.
3. In the app: **Data & backup → Cloud sync** — pick a team code (e.g. `lamo`) and a passcode, hit **Connect**. The first device to connect claims the code and sets the passcode; every other device connects with the same pair.

Notes: the passcode is set on first save and verified (SHA-256 hash) on every request; sync is last-write-wins per whole database (fine for one scorekeeper at a time — simultaneous editing on two devices can overwrite each other); the JSON export/sync-link remain as an offline fallback and never contain the passcode.

## Features

- **All 36 teams modeled** across the three pools that affect Lamorinda (G, B, J) and the routing into Saturday's O / S / W crossover pools.
- **Three-way tie handling** — when a pool ends with everyone at 1–1, a manual seeding picker appears (the tournament breaks this with goal differential, which the app does not track).
- **Sunday bracket walk** — clicks through semifinals, championship, and 3rd / 5th / 7th / 9th / 11th / 13th / 15th place games depending on the path.
- **Shareable scenarios** — every click updates the URL hash, so the "Copy share link" button hands you a URL that loads exactly the scenario you set up.
- **Schedule link** — header button opens the full tournament schedule (Google Sheet).

## Local development

This is a single static HTML file with no build step.

```bash
# Just open index.html in a browser, or serve it:
python3 -m http.server 8080
# → http://localhost:8080
```

## Deploy to Vercel

Vercel auto-detects this as a static site — no config needed.

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import this GitHub repository
3. Leave all framework / build settings on their defaults (Vercel will pick "Other" / static)
4. Click **Deploy**

You'll get a `*.vercel.app` URL within ~30 seconds.

## Editing scenarios / teams

All tournament data is at the top of the `<script>` block in `index.html`:

- `POOLS` — pool team rosters and game numbers
- `GAMES` — pool play game metadata (time, location, matchup)
- `SAT_CROSSOVER` — Saturday pool routing by Pool G finish
- `SUNDAY_PATHS` — Sunday bracket trees keyed by Saturday pool + finish

To swap to a different team, change `LAM` and update `POOLS.G` / the relevant pool routing.
