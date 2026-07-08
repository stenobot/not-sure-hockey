// Scrapes each team's "Team Leaders" section from /team/<teamId>/home into
// data/<teamId>/stats.json. Each category (Goals, Assists, Points, GAA, GA,
// Save%) lists the top players as { number, name, value }.

import { teams, config } from './lib/config.mjs';
import { fetchDom, clean, num, writeJson, nowIso, runScraper } from './lib/parse.mjs';

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

// PPG (points per game) isn't a "Team Leaders" category on the team home page —
// it's derived from the per-player table on /team/<id>/stats (PTS / GP). Fetch
// that page, compute PPG for each skater, and return the top leaders. Sorted by
// PPG desc, ties broken by fewer games then more points.
async function ppgLeadersFor(team) {
  const url = `${config.baseUrl}/team/${team.id}/stats`;
  const $ = await fetchDom(url);

  // The skater table is the one whose header row includes both "Player" and "PTS".
  let $table = null;
  $('table').each((_, table) => {
    if ($table) return;
    const headers = $(table)
      .find('tr').first().find('td, th')
      .map((__, c) => clean($(c).text())).get();
    if (headers.includes('Player') && headers.includes('PTS')) $table = $(table);
  });
  if (!$table || !$table.length) return [];

  const headers = $table
    .find('tr').first().find('td, th')
    .map((_, c) => clean($(c).text())).get();
  const iGp = headers.indexOf('GP');
  const iPts = headers.indexOf('PTS');
  const iName = headers.indexOf('Player');
  if (iGp < 0 || iPts < 0 || iName < 0) return [];

  const players = [];
  $table.find('tr').each((i, tr) => {
    if (i === 0) return; // header row
    const cells = $(tr).find('td, th').map((_, c) => clean($(c).text())).get();
    if (cells.length < headers.length) return;
    const name = cells[iName];
    if (!name) return;
    const gp = Number(num(cells[iGp])) || 0;
    const pts = Number(num(cells[iPts])) || 0;
    if (gp <= 0) return; // no games played -> no PPG
    players.push({
      number: (cells[0] || '').replace(/^#/, '') || null,
      name,
      ppg: pts / gp,
      gp,
      pts,
    });
  });

  players.sort((a, b) => b.ppg - a.ppg || a.gp - b.gp || b.pts - a.pts);
  return players.slice(0, MAX_LEADERS).map((p) => ({
    number: p.number,
    name: p.name,
    value: p.ppg.toFixed(2),
  }));
}

async function scrapeTeam(team) {
  const url = `${config.baseUrl}/team/${team.id}/home`;
  const $ = await fetchDom(url);

  const categories = CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    leaders: leadersFor($, label),
  }));

  // PPG comes from the per-player stats page, not the home-page Team Leaders.
  const ppgCat = categories.find((c) => c.key === 'ppg');
  if (ppgCat) {
    try {
      ppgCat.leaders = await ppgLeadersFor(team);
    } catch (err) {
      console.warn(`[${team.id}] PPG leaders unavailable: ${err.message}`);
    }
  }

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
