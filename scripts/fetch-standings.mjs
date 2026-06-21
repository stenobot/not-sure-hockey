// Scrapes the team's division standings into data/standings.json.
// Source: /standings (contains all divisions). We auto-detect the division
// table that contains our team, so this keeps working if the team changes
// divisions or season.

import { config } from './lib/config.mjs';
import { fetchDom, clean, num, writeJson, nowIso, runScraper } from './lib/parse.mjs';

const COLUMNS = [
  'rank', 'team', 'gp', 'w', 'l', 't', 'otl',
  'pts', 'ptsPct', 'gf', 'gfa', 'ga', 'gaa', 'pim',
];

async function main() {
  const url = `${config.baseUrl}/standings`;
  const $ = await fetchDom(url);

  // Walk headings and tables in document order. Track the most recent
  // division heading; the table that links to our team belongs to it.
  let $table = null;
  let division = null;
  let lastHeading = null;
  $('h1, h2, table').each((_, el) => {
    if ($table) return;
    if (el.tagName === 'table') {
      if ($(el).find(`a[href*="/team/${config.teamId}/"]`).length) {
        $table = $(el);
        division = lastHeading;
      }
    } else {
      const txt = clean($(el).text());
      if (txt) lastHeading = txt;
    }
  });

  if (!$table) {
    await writeJson('standings.json', { team: config.teamName, division: null, updated: nowIso(), standings: [] }, () => true);
    console.warn('Could not find a standings table containing the team.');
    return;
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
      isOurTeam: teamId === config.teamId,
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

  const payload = {
    team: config.teamName,
    teamId: config.teamId,
    division,
    source: url,
    updated: nowIso(),
    standings,
  };

  await writeJson(
    'standings.json',
    payload,
    (d) => !d.standings || d.standings.length === 0
  );
  console.log(`Parsed ${standings.length} standings rows for ${division}.`);
}

runScraper(main);
