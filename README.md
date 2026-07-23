# LAMO JO's B-Team

Companion app for **Lamorinda B (18-LAMORINDA B)** at the **2026 National Junior Olympics · Session 2 · 14U Men Classic (14BX)**, July 23–26 in Orange County — a bracket explorer (`index.html`) plus a player stat tracker (`stats.html`).

## Bracket explorer (`index.html`)

All 48 teams and all 60 Day-1 games are modeled from the published NJO schedule (14U_Men_Classic tab). Click the winner of each game and the app resolves downstream matchups — Lamorinda's path is highlighted, and a callout shows which Day-2 upper/lower-bracket group each outcome leads to, including the other teams that land there.

- **Day 1 structure**: each group of four plays a mini-bracket (opener → winners/losers games → 2-3 crossovers). Winners feed eight Day-2 "upper" groups, losers eight "lower" groups.
- **Beckman HS 1 caveat**: the sheet's Beckman section (groups I/G/H — Lamorinda's pool is G) wasn't fully visible when this was built; its pairings/times are inferred from the W-to/L-to game routing on the other venues, which run their groups in a rotated order. Lamorinda's 9:30 AM opener (game #15) is confirmed; the I/H time pairs are inferred — verify against the sheet.
- **All four days modeled**: Day-1 group mini-brackets → Day-2 Silver/Bronze group round robins (standings by wins then goal difference, computed automatically from scores) → Day 3–4 placement brackets down to both championships. Day 2–4 structure is mirrored from the published 14B tab (identical format); venues show TBD until the 14BX rows publish and then self-correct from the live feed.
- **Live scores & schedule** (`api/schedule.js`): a serverless function tries, in order — the Google Sheet's 14U_Men_Classic tab (CSV export, then gviz), the Kahuna Events live-results page (HTML, same column layout), and the most recent manually pasted schedule (stored in Redis). The explorer overlays whichever works on load, every 5 minutes, and on tab focus — finished games lock with a FINAL badge and score, and matchup/time/venue/routing values override the static model. The status pill names the active source; `?debug=1` on the endpoint shows per-source failure details.
- **Manual score update**: a paste box at the bottom of the explorer accepts a Select-All copy of the sheet tab or the Kahuna page (TSV/CSV/HTML all parse). Games apply immediately on that device, and with the Redis store connected the paste is shared to every device automatically.
- **Shareable scenarios** via URL hash (`Copy share link`), and a venues rail with Google Maps links. Real results always overlay shared scenarios — share links only carry hypothetical picks.

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
