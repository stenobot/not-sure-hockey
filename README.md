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
| Calendar subscribe | `webcal://krakenhockeyleague.com/ical/<teamId>` |

Teams are configured in `scripts/lib/config.mjs` — adding another is a one‑line change there.

## Project layout

```
index.html              Single-page site (hero, schedule, standings) + team switcher
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
scripts/
  build-teams.mjs       Writes data/teams.json from config
  fetch-schedule.mjs    Schedule/results scraper (all teams)
  fetch-standings.mjs   Standings scraper (all teams)
  serve.mjs             Local static preview server
  lib/                  Shared config (teams list) + fetch/parse helpers
.github/workflows/
  update-data.yml       Manual data refresh + commit (see "Keeping data fresh")
  deploy.yml            Deploy to GitHub Pages
```

## Keeping data fresh

The data scrapers must run from a **residential network**. The Kraken Hockey
League site is behind Cloudflare, which returns **HTTP 403** to GitHub-hosted
Actions runners (datacenter IPs) regardless of headers/User-Agent — so the
refresh can't run on the default GitHub runners. Choose one of:

**A. Manual (simplest).** From a normal machine/network:
```bash
npm run fetch:all
git commit -am "Refresh league data" && git push
```
Pushing triggers the Pages deploy, so the live site updates.

**B. Local scheduled task.** Run the two commands above on a schedule (e.g.
Windows Task Scheduler or cron) on an always-on home machine.

**C. Self-hosted runner.** Register a [self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners)
on an always-on home machine, change `runs-on:` in `update-data.yml` to
`self-hosted`, and re-add a `schedule:` trigger. Then it runs automatically from
your residential IP.

> The static site (`deploy.yml`) deploys fine on GitHub-hosted runners — only the
> scrapers need a residential IP.