// Scrapes each team's Schedule & Results table into data/<teamId>/schedule.json.
// Primary source: the team schedule HTML table (clean columns incl. score/result).

import { teams, config, teamUrl } from './lib/config.mjs';
import { fetchDom, clean, num, writeJson, nowIso, runScraper } from './lib/parse.mjs';

const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

// Convert "10:15 PM" -> "22:15".
function to24h(time) {
  const m = clean(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function parseScore(raw, result) {
  const m = clean(raw).match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return { teamScore: null, oppScore: null };
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const r = (result || '').toUpperCase();
  // The score is listed winner-first, so use the result to assign sides.
  if (r === 'W') return { teamScore: hi, oppScore: lo };
  if (r === 'L') return { teamScore: lo, oppScore: hi };
  return { teamScore: a, oppScore: b }; // tie or unknown
}

async function scrapeTeam(team) {
  const url = teamUrl(team.id, 'schedule');
  const $ = await fetchDom(url);

  const games = [];
  let curMonth = null;
  let curYear = null;

  // Walk headings and tables in document order so each table inherits the
  // most recent "Month YYYY" heading (the table rows omit the year).
  $('h1, table.display').each((_, el) => {
    const $el = $(el);
    if (el.tagName === 'h1') {
      const m = clean($el.text()).match(/^([A-Z][a-z]+)\s+(\d{4})$/);
      if (m) {
        curMonth = m[1];
        curYear = m[2];
      }
      return;
    }

    $el.find('tbody > tr').each((__, tr) => {
      const tds = $(tr).find('> td');
      if (tds.length < 9) return;

      const gameNum = clean($(tds[0]).text());
      const dateLabel = clean($(tds[1]).text()); // "Mon, May 11"
      const time = clean($(tds[2]).text());
      const arenaLabel = clean($(tds[3]).text());
      const arenaHref = $(tds[3]).find('a').attr('href') || null;
      const homeAway = clean($(tds[4]).text()).toUpperCase();
      const opponent = clean($(tds[5]).text());
      const opponentHref = $(tds[5]).find('a').attr('href') || null;
      const resultBadge = clean($(tds[6]).text()) || null;
      const scoreRaw = clean($(tds[7]).text());
      const statusLabel = clean($(tds[8]).text());
      const statusHref = $(tds[8]).find('a').attr('href') || null;

      // Build an ISO-like local (Pacific) datetime string for sorting/display.
      const dm = dateLabel.match(/([A-Z][a-z]{2})\s+(\d{1,2})$/);
      let date = null;
      let datetime = null;
      if (dm && MONTHS[dm[1]] && curYear) {
        const day = dm[2].padStart(2, '0');
        date = `${curYear}-${MONTHS[dm[1]]}-${day}`;
        const t = to24h(time);
        datetime = t ? `${date}T${t}` : `${date}T00:00`;
      }

      const { teamScore, oppScore } = parseScore(scoreRaw, resultBadge);
      const gameIdMatch = (statusHref || '').match(/\/game\/(\d+)\//);

      games.push({
        num: num(gameNum),
        date,
        dateLabel,
        time,
        datetime,
        arena: arenaLabel,
        arenaUrl: arenaHref ? config.baseUrl + arenaHref : null,
        homeAway,
        opponent,
        opponentUrl: opponentHref ? config.baseUrl + opponentHref : null,
        result: resultBadge,
        score: scoreRaw || null,
        teamScore,
        oppScore,
        status: statusLabel || null,
        gameId: gameIdMatch ? gameIdMatch[1] : null,
        gameUrl: statusHref ? config.baseUrl + statusHref : null,
      });
    });
  });

  // Sort chronologically by datetime when available.
  games.sort((a, b) => (a.datetime || '').localeCompare(b.datetime || ''));

  // Current season: the label on the season dropdown toggle (#btnGroupDrop1).
  // Fallback: the toggle button preceding the dropdown of this team's
  // per-season schedule links.
  let season = clean($('#btnGroupDrop1').first().text()) || null;
  if (!season) {
    const $seasonLink = $(`a[href*="/team/${team.id}/schedule/?season="]`).first();
    if ($seasonLink.length) {
      season = clean($seasonLink.closest('ul').prev().text()) || null;
    }
  }

  const payload = {
    team: team.name,
    teamId: team.id,
    season,
    source: url,
    updated: nowIso(),
    games,
  };

  await writeJson(`${team.id}/schedule.json`, payload, (d) => !d.games || d.games.length === 0);
  console.log(`[${team.id}] ${games.length} games. Season: ${season || 'unknown'}.`);
}

runScraper(async () => {
  for (const team of teams) await scrapeTeam(team);
});
