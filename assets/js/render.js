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
function renderHero(schedule, standings, attendance) {
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
  // BenchApp IN/OUT, only when it matches the game shown (matched by date,
  // since the count comes from a different source than the league schedule).
  let rsvp = '';
  const benchAppMatches = attendance && attendance.date && next.date &&
    attendance.date === next.date;
  if (benchAppMatches && (attendance.in != null || attendance.out != null)) {
    rsvp = `
      <p class="ticket__rsvp">
        <span class="rsvp rsvp--in"><span class="rsvp__num">${escape(attendance.in ?? 0)}</span> IN</span>
        <span class="rsvp rsvp--out"><span class="rsvp__num">${escape(attendance.out ?? 0)}</span> OUT</span>
      </p>`;
  }

  // Source links: KHL game page, and the BenchApp schedule (Div 6 only).
  const links = [];
  if (next.gameUrl) {
    links.push(`<a href="${escape(next.gameUrl)}" target="_blank" rel="noopener">KHL</a>`);
  }
  if (attendance && attendance.source) {
    links.push(`<a href="${escape(attendance.source)}" target="_blank" rel="noopener">BenchApp</a>`);
  }
  const linksHtml = links.length ? `<p class="ticket__links">${links.join('')}</p>` : '';

  body.innerHTML = `
    <div class="ticket__matchup">
      <span class="ticket__ha">${escape(next.homeAway === 'HOME' ? 'vs' : '@')}</span>
      <span class="ticket__opp">${escape(next.opponent || 'TBD')}</span>
    </div>
    <p class="ticket__when">${escape(next.dateLabel || '')}${next.time ? ' · ' + escape(next.time) : ''}</p>
    <p class="ticket__where">${escape(next.arena || '')}</p>
    ${rsvp}
    ${count ? `<span class="ticket__count">${escape(count)}</span>` : ''}
    ${linksHtml}`;
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

/* ---------- team leaders / stats ---------- */
function statCard(cat) {
  const leaders = (cat.leaders || []).map((p, i) => `
    <li class="leader${i === 0 ? ' leader--top' : ''}">
      ${p.number ? `<span class="leader__num">#${escape(p.number)}</span>` : '<span class="leader__num"></span>'}
      <span class="leader__name">${escape(p.name || '')}</span>
      <span class="leader__val">${escape(p.value ?? '')}</span>
    </li>`).join('');
  return `
    <div class="stat-card">
      <h3 class="stat-card__title">${escape(cat.label || '')}</h3>
      <ol class="leader-list">${leaders || '<li class="leader leader--empty">—</li>'}</ol>
    </div>`;
}

function renderStats(stats, season) {
  const cats = (stats.categories || []).filter((c) => (c.leaders || []).length);
  el('#stats-sub').textContent = stats.season || season || '';
  const grid = el('#stats-grid');
  if (!grid) return;
  grid.innerHTML = cats.length
    ? cats.map(statCard).join('')
    : '<p class="empty-note">Stats not available yet.</p>';
}

/* ---------- team switching ---------- */
async function loadTeam(teamId) {
  const [schedule, standings, stats, attendance] = await Promise.all([
    loadJson(teamData(teamId, 'schedule')).catch(() => ({ games: [] })),
    loadJson(teamData(teamId, 'standings')).catch(() => ({ standings: [], division: null })),
    loadJson(teamData(teamId, 'stats')).catch(() => ({ categories: [] })),
    loadJson(teamData(teamId, 'attendance')).catch(() => null),
  ]);

  renderHero(schedule, standings, attendance);
  renderSchedule(schedule);
  renderStandings(standings, schedule.season);
  renderStats(stats, schedule.season);
  updateCalendarLinks(teamId);

  const updated = [schedule.updated, standings.updated, stats.updated]
    .filter(Boolean).sort().pop();
  el('#last-updated').textContent = fmtUpdated(updated);
}

// Point the calendar subscribe links at the currently selected team.
function updateCalendarLinks(teamId) {
  const href = `webcal://krakenhockeyleague.com/ical/${teamId}`;
  for (const sel of ['#cal-btn', '#cal-btn-menu']) {
    const node = el(sel);
    if (node) node.setAttribute('href', href);
  }
}

function buildTeamSwitcher(manifest, currentId, onChange) {
  const select = el('#team-select');
  if (!select) return;
  select.innerHTML = (manifest.teams || [])
    .map((t) => `<option value="${escape(t.id)}"${t.id === currentId ? ' selected' : ''}>${escape((t.division || t.name).toUpperCase())}</option>`)
    .join('');
  select.addEventListener('change', () => onChange(select.value));
}

/* ---------- overflow menu ---------- */
function initMenu() {
  const toggle = el('#menu-toggle');
  const panel = el('#menu-panel');
  if (!toggle || !panel) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  panel.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !e.target.closest('.menu')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); }
  });
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
  initMenu();

  if (currentId) {
    try { localStorage.setItem(STORAGE_KEY, currentId); } catch { /* ignore */ }
    await loadTeam(currentId);
  }
}

document.addEventListener('DOMContentLoaded', boot);
