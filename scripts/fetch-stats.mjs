// Scrapes each team's "Team Leaders" section from /team/<teamId>/home into
// data/<teamId>/stats.json. Each category (Goals, Assists, Points, GAA, GA,
// Save%) lists the top players as { number, name, value }.

import { teams, config } from './lib/config.mjs';
import { fetchDom, clean, writeJson, nowIso, runScraper } from './lib/parse.mjs';

// League category label -> stable key for the frontend. Order is preserved in
// the output (skater categories first, then goalie categories).
const CATEGORIES = [
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'points', label: 'Points' },
  { key: 'ppg', label: 'PPG' },
  { key: 'gaa', label: 'GAA' },
  { key: 'ga', label: 'GA' },
  { key: 'savePct', label: 'Save%' },
];

const MAX_LEADERS = 3;

// From an "Team Leaders" category heading, climb to the nearest ancestor that
// contains a table and read its rows ([#number, name, value]).
function leadersFor($, label) {
  let $heading = null;
  $('h2').each((_, el) => {
    if (!$heading && clean($(el).text()) === label) $heading = $(el);
  });
  if (!$heading) return [];

  let $container = $heading;
  let $table = null;
  for (let up = 0; up < 4 && !($table && $table.length); up++) {
    $container = $container.parent();
    $table = $container.find('table').first();
  }
  if (!$table || !$table.length) return [];

  const leaders = [];
  $table.find('tr').each((_, tr) => {
    if (leaders.length >= MAX_LEADERS) return;
    const cells = $(tr).find('td, th').map((__, td) => clean($(td).text())).get();
    if (cells.length < 3) return;
    const name = cells[1];
    const value = cells[cells.length - 1];
    if (!name) return;
    leaders.push({
      number: cells[0].replace(/^#/, '') || null,
      name,
      value: value || null,
    });
  });
  return leaders;
}

async function scrapeTeam(team) {
  const url = `${config.baseUrl}/team/${team.id}/home`;
  const $ = await fetchDom(url);

  const categories = CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    leaders: leadersFor($, label),
  }));

  const season = clean($('#btnGroupDrop1').first().text()) || null;

  const payload = {
    team: team.name,
    teamId: team.id,
    season,
    source: url,
    updated: nowIso(),
    categories,
  };

  await writeJson(
    `${team.id}/stats.json`,
    payload,
    (d) => !d.categories || d.categories.every((c) => c.leaders.length === 0)
  );
  const filled = categories.filter((c) => c.leaders.length).length;
  console.log(`[${team.id}] team leaders: ${filled}/${categories.length} categories.`);
}

runScraper(async () => {
  for (const team of teams) await scrapeTeam(team);
});
