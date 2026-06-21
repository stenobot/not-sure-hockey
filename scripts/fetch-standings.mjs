// Scrapes each team's division standings into data/<teamId>/standings.json.
// Source: /standings (contains all divisions, fetched once). For each team we
// auto-detect the division table that contains it, so this keeps working if a
// team changes divisions or season.

import { teams, config } from './lib/config.mjs';
import { fetchDom, clean, num, writeJson, nowIso, runScraper } from './lib/parse.mjs';

const COLUMNS = [
  'rank', 'team', 'gp', 'w', 'l', 't', 'otl',
  'pts', 'ptsPct', 'gf', 'gfa', 'ga', 'gaa', 'pim',
];

function scrapeTeam($, team, url) {
  // Walk headings and tables in document order. Track the most recent
  // division heading; the table that links to this team belongs to it.
  let $table = null;
  let division = null;
  let lastHeading = null;
  $('h1, h2, table').each((_, el) => {
    if ($table) return;
    if (el.tagName === 'table') {
      if ($(el).find(`a[href*="/team/${team.id}/"]`).length) {
        $table = $(el);
        division = lastHeading;
      }
    } else {
      const txt = clean($(el).text());
      if (txt) lastHeading = txt;
    }
  });

  if (!$table) {
    console.warn(`[${team.id}] no standings table found for team.`);
    return { team: team.name, teamId: team.id, division: null, source: url, updated: nowIso(), standings: [] };
  }

  const standings = [];
  $table.find('tbody tr').each((_, tr) => {
    const cells = $(tr).children('td, th');
    if (cells.length < COLUMNS.length) return;

    const link = $(cells[1]).find('a');
    const href = link.attr('href') || '';
    const teamIdMatch = href.match(/\/team\/(\d+)\//);
    const teamId = teamIdMatch ? teamIdMatch[1] : null;

    const row = {
      teamId,
      teamUrl: href ? config.baseUrl + href : null,
      isOurTeam: teamId === team.id,
    };
    COLUMNS.forEach((key, i) => {
      if (key === 'team') {
        row.team = clean(link.text()) || clean($(cells[i]).text());
      } else {
        row[key] = num($(cells[i]).text());
      }
    });
    standings.push(row);
  });

  standings.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  return { team: team.name, teamId: team.id, division, source: url, updated: nowIso(), standings };
}

runScraper(async () => {
  const url = `${config.baseUrl}/standings`;
  const $ = await fetchDom(url); // fetch the league-wide standings page once
  for (const team of teams) {
    const payload = scrapeTeam($, team, url);
    await writeJson(
      `${team.id}/standings.json`,
      payload,
      (d) => !d.standings || d.standings.length === 0
    );
    console.log(`[${team.id}] ${payload.standings.length} rows for ${payload.division}.`);
  }
});
