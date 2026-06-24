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
| Next-game IN/OUT | **BenchApp** (private; Division 6 only — see "BenchApp attendance" below) |
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
  <teamId>/attendance.json   Next-game IN/OUT counts (BenchApp; Div 6 only)
scripts/
  build-teams.mjs       Writes data/teams.json from config
  fetch-schedule.mjs    Schedule/results scraper (all teams)
  fetch-standings.mjs   Standings scraper (all teams)
  fetch-stats.mjs       Team Leaders scraper (all teams)
  fetch-attendance.mjs  BenchApp IN/OUT scraper (credentialed, local only)
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

## BenchApp attendance (Division 6 only)

The Next Game ticket shows the upcoming game's **IN / OUT** counts for the
Division 6 team, scraped from the team's private **BenchApp** account. Because
that data requires a login, `fetch-attendance.mjs` runs a real browser
(Playwright + **Firefox**, your default browser) **locally**. You sign in once;
it saves the login as a Playwright **storageState** file and reuses that on
later runs — credentials never leave your machine and the committed
`attendance.json` holds only aggregate counts (no names).

One-time setup:

1. `npm install` (pulls in Playwright), then install the browser once:
   `npx playwright install firefox`.
2. Run `npm run benchapp:login` — a Firefox window opens. Sign in and complete any
   verification. It waits until it confirms you're logged in (up to 4 min), then
   saves the session to `.benchapp-session/state.json` (gitignored). The window
   then closes on its own.
3. *(Optional)* For unattended re-login when the session expires, provide
   credentials as env vars (`BENCHAPP_EMAIL`, `BENCHAPP_PASSWORD`) or by copying
   `.benchapp.local.example.json` → `.benchapp.local.json` (both gitignored).
   Without them, just re-run `npm run benchapp:login` when the session expires.

After that, `npm run fetch:attendance` (included in `fetch:all`) reuses the saved
session. It opens a **visible Firefox window** by default — headless Firefox trips
BenchApp's Cloudflare challenge, while a real window + the saved session passes
silently (set `BENCHAPP_HEADLESS=1` to force headless). If the session is
missing/expired or a challenge doesn't clear, the scraper **warns and keeps the
last-good** `attendance.json` rather than failing, so a BenchApp hiccup never
blocks a normal data deploy. Use `--debug` to dump a screenshot + HTML when
tuning selectors.