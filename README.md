# Not Sure Hockey Club

The website for the **Not Sure** hockey teams in the [Kraken Hockey League](https://krakenhockeyleague.com).
The site covers two teams and lets visitors switch between them from the nav header:

- **Division 6D** — team `13343` ("Not Sure 6") — default
- **Division 5A** — team `9572` ("Not Sure 5")

The chosen team is remembered in the browser (`localStorage`) and restored on the next visit.

```
GitHub Action (every 6h / manual / on push)
  → Node scripts fetch league pages (for every team)
  → parse into data/<teamId>/*.json (+ data/teams.json manifest)
  → commit JSON back to the repo
        ↓ (push triggers Pages deploy)
GitHub Pages serves index.html, which fetches the selected team's JSON and renders it
```

Fetching server‑side in the Action (rather than from the browser) avoids CORS
issues with the league site and keeps the page fast.

### Data sources (per team)

| Data | Source |
|------|--------|
| Schedule & results | `https://krakenhockeyleague.com/team/<teamId>/schedule` |
| Standings | `https://krakenhockeyleague.com/standings` (division auto‑detected per team) |
| Team leaders | `https://krakenhockeyleague.com/team/<teamId>/home` (Team Leaders section) |
| Calendar subscribe | `webcal://krakenhockeyleague.com/ical/<teamId>` |

Teams are configured in `scripts/lib/config.mjs` — adding another is a one‑line change there.

## Project layout

```
index.html              Single-page site (hero, schedule, standings, team leaders) + team switcher
CNAME                   Custom domain (notsurehockey.com)
assets/
  css/styles.css        Theme (background #F8B53C, accent #B72B39)
  js/render.js          Loads data/teams.json + the selected team's JSON and renders
  img/logo.svg          Team wordmark crest (hero)
  img/star.svg          Star mark (nav + favicon)
data/                   Generated JSON (committed by the Action)
  teams.json            Manifest: default team + switcher labels
  <teamId>/schedule.json
  <teamId>/standings.json
  <teamId>/stats.json
scripts/
  build-teams.mjs       Writes data/teams.json from config
  fetch-schedule.mjs    Schedule/results scraper (all teams)
  fetch-standings.mjs   Standings scraper (all teams)
  fetch-stats.mjs       Team Leaders scraper (all teams)
  serve.mjs             Local static preview server
  lib/                  Shared config (teams list) + fetch/parse helpers
.github/workflows/
  update-data.yml       Manual data refresh + commit (see "Keeping data fresh")
  deploy.yml            Deploy to GitHub Pages
```

## Keeping data fresh

League data is scraped locally and committed (`npm run fetch:all`, then commit
`data/` and push — pushing redeploys the site). The scrapers must run from a
**residential network**: the league site is behind Cloudflare, which returns
**HTTP 403** to GitHub-hosted runners, so the refresh can't run on the default
runners. The static site (`deploy.yml`) deploys fine on GitHub-hosted runners.

> Contributor/Copilot setup, conventions, and the full refresh/deploy flow are
> documented in [`.github/copilot-instructions.md`](.github/copilot-instructions.md).