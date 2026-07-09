// Local, credentialed scraper for the Division 6 team's BenchApp attendance.
// Reads the NEXT upcoming game's IN / OUT counts and writes them to
// data/<teamId>/attendance.json for the site's "Next Game" ticket.
//
// This is the ONLY scraper that needs credentials, so unlike the league
// scrapers it runs a real browser (Playwright + Firefox) with a persisted
// session. It is designed to look like an ordinary member checking their team:
//   - log in once (`npm run benchapp:login`), then reuse the saved session
//   - Firefox with consistent locale/timezone/viewport
//   - one gentle, sequential navigation; small randomized delays
//   - run only when there is an upcoming game
//   - on any block/challenge, abort and KEEP the last-good JSON
//
// SECURITY: credentials + session are gitignored and local only. The committed
// output holds aggregate counts only (no names / PII).

import { firefox } from 'playwright';
import { access, readFile } from 'node:fs/promises';
import readline from 'node:readline';
import { teams } from './lib/config.mjs';
import { writeJson, nowIso } from './lib/parse.mjs';
import {
  SESSION_FILE,
  ensureSessionDir,
  BROWSER_CONTEXT,
  loadCredentials,
  humanDelay,
} from './lib/benchapp.mjs';

const LOGIN_MODE = process.argv.includes('--login');
const DEBUG = process.argv.includes('--debug') || !!process.env.BENCHAPP_DEBUG;
// Run with a visible browser by default: headless Firefox trips Cloudflare's
// "Just a moment…" challenge, whereas a real window + the saved session passes
// silently. Set BENCHAPP_HEADLESS=1 to force headless (may get challenged).
const HEADED = LOGIN_MODE || !process.env.BENCHAPP_HEADLESS;

const LOGIN_URL = 'https://www.benchapp.com/';

const fileExists = (p) => access(p).then(() => true).catch(() => false);

// Load the league schedule and find the next upcoming game.
async function getNextGameFromSchedule(teamId) {
  try {
    const scheduleJson = await readFile(`data/${teamId}/schedule.json`, 'utf8');
    const schedule = JSON.parse(scheduleJson);
    const now = new Date();
    const pacificNow = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const pParts = Object.fromEntries(pacificNow.formatToParts(now).map((x) => [x.type, x.value]));
    const pacificNowStr = `${pParts.year}-${pParts.month}-${pParts.day}T${pParts.hour}:${pParts.minute}`;
    
    const nextGame = (schedule.games || []).find((g) => !g.result && g.datetime >= pacificNowStr);
    if (nextGame) {
      return { date: nextGame.date, opponent: nextGame.opponent, datetime: nextGame.datetime };
    }
  } catch (e) {
    console.log(`[benchapp] could not load schedule: ${e.message}`);
  }
  return null;
}


// BenchApp's authenticated markup isn't publicly visible, so the parsers below
// (findNextGame / parseAttendance) are tuned against the live logged-in view and
// have heuristic fallbacks. With --debug they dump a screenshot + HTML to
// scripts/.benchapp-debug-*.{png,html} to make tuning easy.

// Detect a REAL Cloudflare/verification interstitial — not just any page that
// happens to reference Cloudflare (the authenticated app does, via CDN/tokens).
// Check the title and known challenge containers instead of scanning all HTML.
async function isChallenge(page) {
  const title = (await page.title().catch(() => '')).toLowerCase();
  if (/just a moment|attention required|checking your browser|access denied/.test(title)) {
    return true;
  }
  const sel = '#challenge-form, #cf-challenge-running, #challenge-running, .cf-browser-verification, #cf-please-wait';
  return (await page.locator(sel).count().catch(() => 0)) > 0;
}

// Cloudflare's JS challenge usually clears itself in a few seconds (especially
// headed). Poll until the challenge is gone, or give up after maxMs.
async function waitOutChallenge(page, maxMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (!(await isChallenge(page))) return true;
    await page.waitForTimeout(2500);
  }
  return !(await isChallenge(page));
}

// Read the displayed game's date from the deep-link detail page. The page lands
// on the next upcoming game and shows an uppercase header like "SUN, JUN 28"
// followed by "5:35 PM - 6:50 PM". Returns { date, datetime, label } or null.
async function getDisplayedGame(page) {
  return page.evaluate(() => {
    const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
    const leaves = Array.from(document.querySelectorAll('div,span,h1,h2,h3,h4,p'))
      .filter((d) => d.children.length === 0);

    const hdr = leaves.find((d) => /^[A-Z]{3},\s*[A-Z]{3}\s+\d{1,2}$/.test(d.textContent.trim()));
    if (!hdr) return null;
    const m = hdr.textContent.trim().match(/^([A-Z]{3}),\s*([A-Z]{3})\s+(\d{1,2})$/);
    const mon = m && MON[m[2]];
    if (!mon) return null;
    const day = String(+m[3]).padStart(2, '0');

    // Infer the year (header has none): current year, +1 if it lands far in the
    // past (handles a Dec→Jan season rollover).
    const now = new Date();
    let year = now.getFullYear();
    let date = `${year}-${mon}-${day}`;
    if (now - new Date(`${date}T00:00`) > 1000 * 60 * 60 * 24 * 60) {
      year += 1;
      date = `${year}-${mon}-${day}`;
    }

    let datetime = `${date}T00:00`;
    const timeLeaf = leaves.find((d) => /^\d{1,2}:\d{2}\s*(AM|PM)\s*-/i.test(d.textContent.trim()));
    const tm = timeLeaf && timeLeaf.textContent.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (tm) {
      let h = +tm[1];
      const ap = tm[3].toUpperCase();
      if (ap === 'PM' && h !== 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      datetime = `${date}T${String(h).padStart(2, '0')}:${tm[2]}`;
    }
    return { date, datetime, label: hdr.textContent.trim() };
  });
}

// Check if a game date is in the past (in Pacific time).
function isGamePast(gameDate) {
  if (!gameDate) return false;
  const now = new Date();
  const pacificNow = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const pParts = Object.fromEntries(pacificNow.formatToParts(now).map((x) => [x.type, x.value]));
  const pacificNowStr = `${pParts.year}-${pParts.month}-${pParts.day}T${pParts.hour}:${pParts.minute}`;
  return gameDate < pacificNowStr;
}

// Navigate to the next upcoming game if the current one is in the past.
// Tries keyboard navigation and clicking schedule links to find a future game.
async function advanceToNextGame(page) {
  // First, try keyboard navigation (arrow right)
  console.log('[benchapp] trying arrow key navigation to find next game…');
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      await page.press('body', 'ArrowRight').catch(() => {});
      await humanDelay(500, 1000);
      const game = await getDisplayedGame(page);
      if (game) {
        console.log(`[benchapp] after arrow key ${attempt + 1}: found game ${game.date}`);
        if (!isGamePast(game.datetime)) {
          console.log(`[benchapp] game ${game.date} is upcoming; using this one.`);
          return true;
        }
      }
    } catch (e) {
      console.log(`[benchapp] arrow key attempt ${attempt + 1} failed: ${e.message}`);
      break;
    }
  }
  
  // Fall back to clicking schedule links to find a future game
  console.log('[benchapp] trying to click schedule links to find next game…');
  const scheduleLinks = await page.locator('a[href*="/schedule/"]').all();
  if (scheduleLinks.length > 0) {
    console.log(`[benchapp] found ${scheduleLinks.length} schedule links`);
    for (let i = 0; i < Math.min(scheduleLinks.length, 15); i++) {
      try {
        await scheduleLinks[i].click().catch(() => {});
        await humanDelay(600, 1200);
        const game = await getDisplayedGame(page);
        if (game) {
          console.log(`[benchapp] clicked schedule link ${i + 1}: found game ${game.date}`);
          if (!isGamePast(game.datetime)) {
            console.log(`[benchapp] game ${game.date} is upcoming; using this one.`);
            return true;
          }
        }
      } catch (e) {
        console.log(`[benchapp] error clicking schedule link ${i + 1}: ${e.message}`);
      }
    }
  }
  
  console.log('[benchapp] could not find or navigate to a future game.');
  return false;
}

// Parse the next game's IN / OUT counts from the deep-link game page. BenchApp
// shows an "In N / Out N / Unknown N" summary where each is a label div followed
// by a number div; we key off the visible "In"/"Out" label text (the CSS classes
// are obfuscated). Returns { in, out } with null when a side can't be found.
async function parseAttendance(page) {
  return page.evaluate(() => {
    const result = { in: null, out: null };
    const leaves = Array.from(document.querySelectorAll('div')).filter((d) => d.children.length === 0);
    for (const [key, label] of [['in', 'In'], ['out', 'Out']]) {
      const el = leaves.find((d) => d.textContent.trim() === label);
      if (!el || !el.parentElement) continue;
      // The label's container reads e.g. "In3" — pull the number after the label.
      const combined = el.parentElement.textContent.replace(/\s+/g, '');
      const m = combined.match(new RegExp('^' + label + '(\\d+)'));
      if (m) { result[key] = parseInt(m[1], 10); continue; }
      const sib = el.nextElementSibling;
      if (sib) {
        const n = parseInt(sib.textContent.trim(), 10);
        if (!Number.isNaN(n)) result[key] = n;
      }
    }
    return result;
  });
}

async function dumpDebug(page, tag) {
  if (!DEBUG) return;
  try {
    await page.screenshot({ path: `scripts/.benchapp-debug-${tag}.png`, fullPage: true });
    const html = await page.content();
    await (await import('node:fs/promises')).writeFile(`scripts/.benchapp-debug-${tag}.html`, html, 'utf8');
    console.warn(`[benchapp] wrote debug artifacts for "${tag}".`);
  } catch (e) {
    console.warn('[benchapp] debug dump failed:', e.message);
  }
}

async function attemptLogin(page, creds) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await humanDelay();
  // Open the login form if it's behind a "Log In" control.
  const loginTrigger = page.locator('a:has-text("Log In"), button:has-text("Log In")').first();
  if (await loginTrigger.count()) { await loginTrigger.click().catch(() => {}); await humanDelay(); }

  const email = page.locator('input[type="email"], input[name*="email" i], input[name="username"]').first();
  const pass = page.locator('input[type="password"]').first();
  if (!(await email.count()) || !(await pass.count())) {
    await dumpDebug(page, 'login-form');
    throw new Error('Login form not found (BenchApp markup may have changed).');
  }
  await email.fill(creds.email);
  await humanDelay(200, 600);
  await pass.fill(creds.password);
  await humanDelay(200, 600);
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.locator('button[type="submit"], button:has-text("Log In"), input[type="submit"]').first().click().catch(() => {}),
  ]);
  await humanDelay(800, 1500);
}

// Resolve once the user presses Enter in the terminal.
function waitForEnter(promptMsg) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptMsg, () => { rl.close(); resolve(); });
  });
}

async function runLogin(team) {
  await ensureSessionDir();
  const browser = await firefox.launch({ headless: false });
  const context = await browser.newContext(BROWSER_CONTEXT);
  const page = await context.newPage();
  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // Reveal the login form so it's obvious where to sign in.
    const trigger = page.locator('a:has-text("Log In"), button:has-text("Log In")').first();
    if (await trigger.count()) await trigger.click().catch(() => {});

    console.log('\n[benchapp] A Firefox window is open. Log in to BenchApp there ' +
      '(complete any verification).');
    await waitForEnter('[benchapp] When you are logged in, come back here and press Enter… ');

    // Trust the login you just completed; save based on cookies (the schedule
    // deep link is a client-routed SPA and can't be used to verify directly).
    const cookies = await context.cookies();
    const session = cookies.filter((c) => /benchapp/i.test(c.domain) && c.value && c.value.length > 8);
    if (!session.length) {
      console.warn('[benchapp] no BenchApp cookies found — it does not look like ' +
        'login completed. Session NOT saved; run `npm run benchapp:login` again.');
      return;
    }
    await context.storageState({ path: SESSION_FILE });
    console.log(`[benchapp] login captured (${session.length} BenchApp cookies); ` +
      'session saved to .benchapp-session/state.json.');
  } finally {
    await browser.close();
  }
}

async function run() {
  const team = teams.find((t) => t.benchApp);
  if (!team) {
    console.log('[benchapp] no team has a benchApp config; nothing to do.');
    return;
  }

  if (LOGIN_MODE) {
    await runLogin(team);
    return;
  }

  if (!(await fileExists(SESSION_FILE))) {
    console.warn('[benchapp] no saved session; run `npm run benchapp:login` once. ' +
      'Skipping; keeping last-good data.');
    return;
  }

  const creds = await loadCredentials();
  const browser = await firefox.launch({ headless: !HEADED });
  const context = await browser.newContext({ storageState: SESSION_FILE, ...BROWSER_CONTEXT });
  const page = await context.newPage();

  try {
    // Load the app shell first, then navigate to the schedule list page.
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await humanDelay();
    await page.goto(team.benchApp.scheduleUrl, { waitUntil: 'networkidle' });
    await humanDelay();

    if (await isChallenge(page)) {
      console.log('[benchapp] Cloudflare challenge shown; waiting for it to clear…');
      if (!(await waitOutChallenge(page))) {
        await dumpDebug(page, 'challenge');
        console.warn('[benchapp] challenge did not clear; aborting and keeping last-good data. ' +
          '(Try again, or run headed — it now runs headed by default.)');
        return;
      }
      await humanDelay();
    }

    // Expired-session detection: a visible password field means a login wall.
    if (await page.locator('input[type="password"]').count()) {
      if (!creds) {
        console.warn('[benchapp] saved session expired; run `npm run benchapp:login` again. Keeping last-good data.');
        return;
      }
      console.log('[benchapp] saved session expired; logging in…');
      await attemptLogin(page, creds);
      await page.goto(team.benchApp.scheduleUrl, { waitUntil: 'networkidle' });
      await humanDelay();
      if (await page.locator('input[type="password"]').count()) {
        await dumpDebug(page, 'login-failed');
        console.warn('[benchapp] still not logged in after attempt; keeping last-good data.');
        return;
      }
      await context.storageState({ path: SESSION_FILE });
    }

    // Let the SPA finish rendering the schedule list before interacting with it.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    if (DEBUG) {
      await dumpDebug(page, 'schedule-list');
    }

    // Identify which game is the next upcoming one from the local league schedule.
    const nextUpcoming = await getNextGameFromSchedule(team.id);
    if (!nextUpcoming) {
      console.warn('[benchapp] no upcoming games found in league schedule. Keeping last-good data.');
      return;
    }
    console.log(`[benchapp] next upcoming game: ${nextUpcoming.opponent} on ${nextUpcoming.date}`);

    // Click on the game in BenchApp's schedule list that matches our upcoming game.
    // This will navigate to a deep-link URL like /schedule/{SCHEDULE_ID}?teamId=...
    // which displays the game details including IN/OUT counts.
    console.log('[benchapp] looking for matching game in schedule list…');
    const gameLinks = await page.locator('a[href*="/schedule/"]').all();
    if (gameLinks.length === 0) {
      console.warn('[benchapp] no game links found in schedule list. Keeping last-good data.');
      return;
    }

    // Try to find and click the game link that matches the next upcoming game date.
    // Extract the date from each link's text and find the match.
    let foundMatch = false;
    for (let i = 0; i < gameLinks.length; i++) {
      const linkText = await gameLinks[i].textContent().catch(() => '');
      // Check if this link's text contains the opponent name or date
      if (linkText.includes(nextUpcoming.opponent) || linkText.includes(nextUpcoming.date.split('-').slice(1).join('/'))) {
        console.log(`[benchapp] found matching game at index ${i}; clicking…`);
        await gameLinks[i].click().catch(() => {});
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      // Fallback: if we couldn't match by text, click the first game link
      // (BenchApp's schedule list is usually sorted, so first is next upcoming)
      console.log('[benchapp] could not match by opponent/date; clicking first game link…');
      await gameLinks[0].click().catch(() => {});
    }

    await humanDelay(1000, 2000);

    // Wait for the game detail page to load
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    if (DEBUG) {
      await dumpDebug(page, 'schedule');
    }

    // Parse the game details and IN/OUT counts from this page
    const game = await getDisplayedGame(page);
    const { in: inCount, out: outCount } = await parseAttendance(page);

    if (!game || (inCount == null && outCount == null)) {
      await dumpDebug(page, 'attendance');
      console.warn('[benchapp] could not read game date or IN/OUT for the upcoming game. Keeping last-good data.');
      return;
    }

    console.log(`[benchapp] found game ${game.date} with ${inCount ?? '?'} IN / ${outCount ?? '?'} OUT`);

    const payload = {
      team: team.name,
      teamId: team.id,
      gameId: null,
      date: game.date,
      datetime: game.datetime,
      in: inCount,
      out: outCount,
      source: page.url(),
      updated: nowIso(),
    };

    await writeJson(
      `${team.id}/attendance.json`,
      payload,
      (d) => d.in == null && d.out == null
    );
    console.log(`[benchapp] ${team.id} next game ${game.date}: ${inCount ?? '?'} IN / ${outCount ?? '?'} OUT.`);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  // Never hard-fail the broader fetch:all pipeline on a BenchApp hiccup.
  console.warn('[benchapp] error; keeping last-good data:', err.message);
  process.exitCode = 0;
});
