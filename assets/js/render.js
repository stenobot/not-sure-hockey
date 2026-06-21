/* =========================================================
   Not Sure Hockey — data loading & rendering
   ========================================================= */

const TEAMS_MANIFEST = 'data/teams.json';
const STORAGE_KEY = 'nshc-team';
const teamData = (id, file) => `data/${id}/${file}.json`;

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------- helpers ---------- */
async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

const el = (sel, root = document) => root.querySelector(sel);
const escape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Current time in America/Los_Angeles as a comparable "YYYY-MM-DDTHH:MM" string.
function pacificNowStr() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`;
}

function isPast(game, now) {
  if (game.result) return true;
  if (game.datetime) return game.datetime < now;
  return false;
}

function dayCountdown(datetime, now) {
  if (!datetime) return null;
  const d1 = new Date(now + ':00');
  const d2 = new Date(datetime + ':00');
  const days = Math.round((d2 - d1) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function fmtUpdated(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso)) + ' PT';
  } catch { return '—'; }
}

/* ---------- hero ---------- */
function renderHero(schedule, standings) {
  const now = pacificNowStr();
  const ours = (standings.standings || []).find((r) => r.isOurTeam);

  // Record (prefer official standings; fall back to counting results).
  let w = 0, l = 0, t = 0;
  if (ours) { w = ours.w ?? 0; l = ours.l ?? 0; t = ours.t ?? 0; }
  else {
    for (const g of schedule.games || []) {
      if (g.result === 'W') w++; else if (g.result === 'L') l++; else if (g.result === 'T') t++;
    }
  }
  const setStat = (k, v) => { const n = el(`[data-stat="${k}"]`); if (n) n.textContent = v; };
  setStat('w', w); setStat('l', l); setStat('t', t);
  setStat('rank', ours && ours.rank ? `#${ours.rank}` : '—');

  el('#hero-division').textContent = standings.division || 'Division';

  // Next game ticket.
  const next = (schedule.games || []).find((g) => !isPast(g, now));
  const body = el('#next-game .ticket__body');
  if (!next) {
    body.innerHTML = '<p class="ticket__empty">No upcoming games scheduled. Season&rsquo;s a wrap! 🏒</p>';
    return;
  }
  const count = dayCountdown(next.datetime, now);
  body.innerHTML = `
    <div class="ticket__matchup">
      <span class="ticket__ha">${escape(next.homeAway === 'HOME' ? 'vs' : '@')}</span>
      <span class="ticket__opp">${escape(next.opponent || 'TBD')}</span>
    </div>
    <p class="ticket__when">${escape(next.dateLabel || '')}${next.time ? ' · ' + escape(next.time) : ''}</p>
    <p class="ticket__where">${escape(next.arena || '')}</p>
    ${count ? `<span class="ticket__count">${escape(count)}</span>` : ''}`;
}

/* ---------- schedule ---------- */
function gameCard(g, opts = {}) {
  const dm = (g.date || '').split('-');
  const mon = dm.length === 3 ? MONTH_ABBR[parseInt(dm[1], 10) - 1] : '';
  const day = dm.length === 3 ? parseInt(dm[2], 10) : '';
  const ha = g.homeAway === 'HOME' ? 'vs' : '@';

  let right = '';
  if (g.result) {
    const cls = g.result === 'W' ? 'badge--w' : g.result === 'L' ? 'badge--l' : 'badge--t';
    const scoreTxt = (g.teamScore != null && g.oppScore != null) ? `${g.teamScore}&ndash;${g.oppScore}` : escape(g.score || '');
    right = `
      <span class="game__score">${scoreTxt}</span>
      <span class="badge ${cls}">${escape(g.result)}</span>`;
  } else {
    right = `<span class="badge badge--soon">${escape(g.time || 'TBD')}</span>`;
  }
  const link = g.gameUrl
    ? `<a class="game__link" href="${escape(g.gameUrl)}" target="_blank" rel="noopener">${escape(g.status || 'Details')} &rsaquo;</a>`
    : '';

  return `
    <li class="game${opts.next ? ' game--next' : ''}">
      <div class="game__date">
        <div class="game__mon">${escape(mon)}</div>
        <div class="game__day">${escape(day)}</div>
      </div>
      <div class="game__main">
        <div class="game__ha">${escape(ha)}</div>
        <div class="game__opp">${escape(g.opponent || 'TBD')}</div>
        <div class="game__meta">${escape(g.time || '')}${g.arena ? ' · ' + escape(g.arena) : ''}</div>
      </div>
      <div class="game__right">${right}${link}</div>
    </li>`;
}

function renderSchedule(schedule) {
  const now = pacificNowStr();
  const games = schedule.games || [];
  const upcoming = games.filter((g) => !isPast(g, now));
  const results = games.filter((g) => isPast(g, now)).reverse();

  const upList = el('#upcoming-list');
  upList.innerHTML = upcoming.length
    ? upcoming.map((g, i) => gameCard(g, { next: i === 0 })).join('')
    : '<li class="empty-note">No upcoming games — season complete.</li>';

  const resList = el('#results-list');
  resList.innerHTML = results.length
    ? results.map((g) => gameCard(g)).join('')
    : '<li class="empty-note">No results yet — puck drops soon.</li>';

  el('#schedule-sub').textContent = schedule.season || '';
}

/* ---------- standings ---------- */
function renderStandings(standings, season) {
  const rows = standings.standings || [];
  el('#standings-division').textContent = standings.division || 'Division';
  el('#standings-sub').textContent = season || '';
  const body = el('#standings-body');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty-note">Standings not available.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((r) => `
    <tr class="${r.isOurTeam ? 'is-ours' : ''}">
      <td class="st-rank ta-c">${escape(r.rank ?? '')}</td>
      <td class="st-team">${escape(r.team || '')}</td>
      <td class="ta-c">${escape(r.gp ?? '')}</td>
      <td class="ta-c">${escape(r.w ?? '')}</td>
      <td class="ta-c">${escape(r.l ?? '')}</td>
      <td class="ta-c">${escape(r.t ?? '')}</td>
      <td class="st-pts ta-c">${escape(r.pts ?? '')}</td>
      <td class="ta-c hide-sm">${escape(r.gf ?? '')}</td>
      <td class="ta-c hide-sm">${escape(r.ga ?? '')}</td>
    </tr>`).join('');
}

/* ---------- team switching ---------- */
async function loadTeam(teamId) {
  const [schedule, standings] = await Promise.all([
    loadJson(teamData(teamId, 'schedule')).catch(() => ({ games: [] })),
    loadJson(teamData(teamId, 'standings')).catch(() => ({ standings: [], division: null })),
  ]);

  renderHero(schedule, standings);
  renderSchedule(schedule);
  renderStandings(standings, schedule.season);

  const updated = [schedule.updated, standings.updated]
    .filter(Boolean).sort().pop();
  el('#last-updated').textContent = fmtUpdated(updated);
}

function buildTeamSwitcher(manifest, currentId, onChange) {
  const select = el('#team-select');
  if (!select) return;
  select.innerHTML = (manifest.teams || [])
    .map((t) => `<option value="${escape(t.id)}"${t.id === currentId ? ' selected' : ''}>${escape((t.division || t.name).toUpperCase())}</option>`)
    .join('');
  select.addEventListener('change', () => onChange(select.value));
}

/* ---------- boot ---------- */
async function boot() {
  const manifest = await loadJson(TEAMS_MANIFEST).catch(() => null);
  const teams = (manifest && manifest.teams) || [];
  const validId = (id) => teams.some((t) => t.id === id);

  const stored = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
  const fallback = (manifest && manifest.default) || (teams[0] && teams[0].id);
  let currentId = validId(stored) ? stored : fallback;

  const switchTo = (id) => {
    if (!validId(id)) return;
    currentId = id;
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
    loadTeam(id);
  };

  if (manifest) buildTeamSwitcher(manifest, currentId, switchTo);

  if (currentId) {
    try { localStorage.setItem(STORAGE_KEY, currentId); } catch { /* ignore */ }
    await loadTeam(currentId);
  }
}

document.addEventListener('DOMContentLoaded', boot);
