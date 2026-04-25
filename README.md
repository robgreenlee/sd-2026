# Lamorinda B · SDCC 14U Boys A Scenario Explorer

An interactive what-if explorer for **Lamorinda B** at the 2026 San Diego County Cup, 14U Boys A division (May 1–3, 2026).

Click the winner of each game and the app computes Lamorinda's path through pool play, the Saturday crossover, and the Sunday bracket — all the way to a final placement.

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
