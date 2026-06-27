# Copilot instructions — Not Sure Hockey

Static GitHub Pages site for two "Not Sure" teams in the Kraken Hockey League.
Node scripts scrape the league site into committed JSON; `index.html` + vanilla
JS render it client-side. There is **no build step and no framework** — do not
introduce a bundler, TypeScript, or a frontend framework.

## Commands

- `npm run fetch:all` — full data refresh: builds `data/teams.json`, then scrapes
  schedule, standings, team-leader stats (all teams), and BenchApp next-game
  attendance (Div 6 only). Requires `cheerio`; the attendance step also needs
  `playwright` + Chrome and credentials, but **no-ops gracefully** without them.
- `npm run build:teams` / `npm run fetch:schedule` / `npm run fetch:standings` /
  `npm run fetch:stats` / `npm run fetch:attendance` — run an individual stage. To
  refresh **one** data type, run that single script.
- `npm run benchapp:login` — one-time interactive BenchApp login that saves a
  reusable session (see "BenchApp attendance" in the README).
- `npm run serve` — static preview server at http://localhost:8765.
- There is **no test or lint suite**. Validate scraper changes by running the
  relevant `fetch:*` script and inspecting the regenerated `data/**/*.json`.

## Architecture

```
config.mjs (teams list) ─► scrapers fetch league HTML ─► parse w/ cheerio
   ─► data/<teamId>/{schedule,standings,stats}.json + data/teams.json manifest
   ─► (Div 6) BenchApp login via Playwright/Firefox ─► data/<teamId>/attendance.json
   ─► committed to repo ─► push triggers deploy.yml (Pages)
   ─► index.html + assets/js/render.js fetch the selected team's JSON, render
```

- **`scripts/lib/config.mjs` is the single source of truth** for which teams the
  site covers. Adding/removing a team is a one-line edit here; `build-teams.mjs`
  derives `data/teams.json` from it, and the scrapers iterate `teams`. A team may
  carry an optional `benchApp` block (only Div 6 `13343` has one).
- **`scripts/lib/parse.mjs`** holds all shared scraper plumbing: `fetchText`
  (browser-headed fetch with retry/backoff on 403/429/5xx), `fetchDom` (cheerio),
  `clean`/`num` text helpers, `runScraper` (uniform error-exit wrapper), and
  `writeJson`.
- **`scripts/fetch-attendance.mjs` + `scripts/lib/benchapp.mjs`** are the only
  **credentialed** scraper: a local Playwright/Firefox login (persisted session)
  that writes IN/OUT counts. Credentials + session are gitignored, local-only,
  never shipped to the public site; the committed JSON has counts only (no PII).
- **`assets/js/render.js`** is coupled to the DOM in `index.html` by element IDs
  and `data-stat` attributes (e.g. `#next-game`, `#standings-body`,
  `[data-stat="w"]`). Changing markup and renderer must stay in sync. The Next
  Game ticket's IN/OUT line is matched to the upcoming game **by date** (the count
  comes from a different source than the league schedule).

## Conventions

- Scrapers are ES modules (`.mjs`, `"type": "module"`), Node 20, using the
  **native `fetch`** — no axios/node-fetch.
- **`writeJson(file, data, isEmpty)` keeps the last-good file** when a scrape
  yields empty data, so a failed/blocked fetch never overwrites good JSON with
  empties. Pass an `isEmpty` predicate (e.g. `(d) => !d.games?.length`) for any
  new scraped output.
- Standings scraping fetches the league-wide `/standings` page once and
  **auto-detects each team's division table** by finding the table linking to
  that team — keep this team-agnostic so division/season changes don't break it.
- Each JSON payload includes `team`, `teamId`, `source` (scraped URL), and
  `updated` (ISO via `nowIso()`); preserve these fields when adding output.
- **Time is Pacific (America/Los_Angeles).** Scrapers emit local `YYYY-MM-DDTHH:MM`
  datetimes; `render.js` compares against `pacificNowStr()`. Don't switch to UTC
  or `Date.parse` of these strings without accounting for the timezone.
- All dynamic strings in `render.js` go through `escape()` before insertion into
  `innerHTML`. Keep using it for any new rendered field.

## Data refresh / deploy

- **Scrapers must run from a residential network.** The league site (Cloudflare)
  returns HTTP 403 to GitHub-hosted runner IPs, so `update-data.yml` is
  `workflow_dispatch`-only and the scheduled trigger is disabled. Refresh locally
  with `npm run fetch:all`, then commit/push.
- Commit a data refresh as **`data/` only** — never sweep unrelated code/design
  changes into a "refresh league data" commit.
- The **`scrape-data` skill** automates this exact flow (run `fetch:all`,
  stage `data/`, commit "Refresh league data", push to trigger the deploy).
  Invoking it is the user's approval to commit/push the data refresh for that
  run; it still keeps the commit limited to `data/`.
- `deploy.yml` uploads the whole repo as the Pages artifact (no build); any push
  to `main` redeploys the live site.
