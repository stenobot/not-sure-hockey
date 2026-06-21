# Not Sure Hockey Club

The website for the **Not Sure** hockey team in the [Kraken Hockey League](https://krakenhockeyleague.com/team/13343/schedule).

A static, single‑page site (HTML/CSS/JS) hosted on **GitHub Pages** at
[notsurehockey.com](https://notsurehockey.com). Schedule, results and
standings are pulled automatically from the league site by a scheduled GitHub
Action — no manual updates required.

## How it works

The league publishes our team's data publicly, so we don't need any database
access. A GitHub Action fetches and parses it into JSON, and the page renders
those JSON files in the browser.

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

## Running locally

Requires Node 18+.

```bash
npm install          # install cheerio
npm run fetch:all    # refresh data/*.json from the league site
npm run serve        # preview at http://localhost:8765
```

Individual scrapers: `npm run fetch:schedule`, `npm run fetch:standings`.

If a scrape returns no data (e.g. the league site is briefly down), the previous
`data/*.json` is kept so the site never goes blank.

## Deployment

`deploy.yml` publishes the repo to GitHub Pages on every push to `main` using the
official Pages Actions. Enable it once under **Settings → Pages → Build and
deployment → Source: GitHub Actions**.

### Custom domain (notsurehockey.com)

The `CNAME` file already points the site at `notsurehockey.com`. To finish setup,
add these DNS records at your domain registrar:

| Type | Host | Value |
|------|------|-------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `stenobot.github.io.` |

Then in **Settings → Pages**, set the custom domain to `notsurehockey.com` and
enable **Enforce HTTPS**. (See
[GitHub's docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
for the latest IPs.)

## Roadmap

The site is intentionally single‑page to start. The render logic is split into
per‑section functions so it can grow into dedicated sub‑pages (schedule,
standings) later without a rewrite.

---

*Unofficial fan site. Data © Kraken Hockey League.*
