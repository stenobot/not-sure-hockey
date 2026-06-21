# Not Sure Hockey Club

The website for the **Not Sure** hockey team in the [Kraken Hockey League](https://krakenhockeyleague.com/team/13343/schedule).

```
GitHub Action (every 6h / manual / on push)
  → Node scripts fetch league pages + iCal
  → parse into data/*.json
  → commit JSON back to the repo
        ↓ (push triggers Pages deploy)
GitHub Pages serves index.html, which fetches data/*.json and renders it
```

Fetching server‑side in the Action (rather than from the browser) avoids CORS
issues with the league site and keeps the page fast.

### Data sources (team `13343`)

| Data | Source |
|------|--------|
| Schedule & results | `https://krakenhockeyleague.com/team/13343/schedule` |
| Standings | `https://krakenhockeyleague.com/standings` (division auto‑detected) |
| Calendar subscribe | `webcal://krakenhockeyleague.com/ical/13343` |

## Project layout

```
index.html              Single-page site (hero, schedule, standings)
CNAME                   Custom domain (notsurehockey.com)
assets/
  css/styles.css        Theme (background #F8B53C, accent #B72B39)
  js/render.js          Fetches data/*.json and renders each section
  img/logo.svg          Team wordmark crest (hero)
  img/star.svg          Star mark (nav + favicon)
data/                   Generated JSON (committed by the Action)
  schedule.json  standings.json
scripts/
  fetch-schedule.mjs    Schedule/results scraper
  fetch-standings.mjs   Standings scraper
  serve.mjs             Local static preview server
  lib/                  Shared config + fetch/parse helpers
.github/workflows/
  update-data.yml       Scheduled data refresh + commit
  deploy.yml            Deploy to GitHub Pages
```