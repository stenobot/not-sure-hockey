// Local, credentialed scraper for the Division 6 team's BenchApp roster.
// Reads every member (Players, Goalies and Spares) and writes their names to
// data/<teamId>/roster.json, which the public "Junior tracker" page renders.
//
// Like fetch-attendance.mjs this is a credentialed Playwright/Firefox scraper
// that reuses the saved session. It is the ONLY scraper besides attendance that
// needs login.
//
// NOTE ON NAMES: unlike attendance.json (counts only), roster.json intentionally
// contains member names because the Junior tracker is built around the team's
// roster. This is a deliberate, team-approved exception to the "no names in
// committed data" rule. On any block/challenge/expired session it aborts and
// KEEPS the last-good roster.json.

import { firefox } from 'playwright';
import { access } from 'node:fs/promises';
import { teams } from './lib/config.mjs';
import { writeJson, nowIso } from './lib/parse.mjs';
import {
  SESSION_FILE,
  BROWSER_CONTEXT,
  loadCredentials,
  humanDelay,
} from './lib/benchapp.mjs';

const DEBUG = process.argv.includes('--debug') || !!process.env.BENCHAPP_DEBUG;
const HEADED = !process.env.BENCHAPP_HEADLESS;
const LOGIN_URL = 'https://www.benchapp.com/';

const fileExists = (p) => access(p).then(() => true).catch(() => false);

async function isChallenge(page) {
  const title = (await page.title().catch(() => '')).toLowerCase();
  if (/just a moment|attention required|checking your browser|access denied/.test(title)) {
    return true;
  }
  const sel = '#challenge-form, #cf-challenge-running, #challenge-running, .cf-browser-verification, #cf-please-wait';
  return (await page.locator(sel).count().catch(() => 0)) > 0;
}

async function waitOutChallenge(page, maxMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (!(await isChallenge(page))) return true;
    await page.waitForTimeout(2500);
  }
  return !(await isChallenge(page));
}

// Parse the roster table. Names live in leaf divs carrying the `text-[15px]`
// utility class (stat cells use `text-[13px]`, the avatar initials use
// `text-xs`, and the "Manager" subtitle uses `text-muted-foreground`, so this
// class reliably isolates the member name). Section headers are leaf divs with
// the exact text "Players" / "Goalies" / "Spares"; we walk the document in
// order, tracking the current section, and only record names once a section has
// begun (this skips the logged-in user's name in the top bar).
async function parseRoster(page) {
  return page.evaluate(() => {
    const SECTIONS = { Players: 'players', Goalies: 'goalies', Spares: 'spares' };
    const out = [];
    let section = null;
    const divs = document.querySelectorAll('div');
    for (const el of divs) {
      if (el.childElementCount !== 0) continue;
      const text = el.textContent.trim();
      if (!text) continue;
      if (SECTIONS[text]) { section = SECTIONS[text]; continue; }
      if (!section) continue;
      if (!/(^|\s)text-\[15px\](\s|$)/.test(el.className)) continue;
      out.push({ name: text, group: section });
    }
    // De-dupe by name+group while preserving order.
    const seen = new Set();
    return out.filter((p) => {
      const k = p.group + '|' + p.name;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });
}

async function dumpDebug(page, tag) {
  if (!DEBUG) return;
  try {
    await page.screenshot({ path: `scripts/.benchapp-debug-${tag}.png`, fullPage: true });
    await (await import('node:fs/promises')).writeFile(
      `scripts/.benchapp-debug-${tag}.html`, await page.content(), 'utf8');
    console.warn(`[benchapp] wrote debug artifacts for "${tag}".`);
  } catch (e) {
    console.warn('[benchapp] debug dump failed:', e.message);
  }
}

async function run() {
  const team = teams.find((t) => t.benchApp && t.benchApp.rosterUrl);
  if (!team) {
    console.log('[benchapp] no team has a benchApp roster config; nothing to do.');
    return;
  }

  if (!(await fileExists(SESSION_FILE))) {
    console.warn('[benchapp] no saved session; run `npm run benchapp:login` once. ' +
      'Skipping; keeping last-good roster.');
    return;
  }

  const creds = await loadCredentials();
  const browser = await firefox.launch({ headless: !HEADED });
  const context = await browser.newContext({ storageState: SESSION_FILE, ...BROWSER_CONTEXT });
  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await humanDelay();
    await page.goto(team.benchApp.rosterUrl, { waitUntil: 'networkidle' });
    await humanDelay();

    if (await isChallenge(page)) {
      console.log('[benchapp] Cloudflare challenge shown; waiting for it to clear…');
      if (!(await waitOutChallenge(page))) {
        await dumpDebug(page, 'roster-challenge');
        console.warn('[benchapp] challenge did not clear; keeping last-good roster.');
        return;
      }
      await humanDelay();
    }

    if (await page.locator('input[type="password"]').count()) {
      console.warn('[benchapp] saved session expired; run `npm run benchapp:login` again. ' +
        'Keeping last-good roster.');
      return;
    }

    // Let the SPA finish rendering the roster table before reading it.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(8000);

    const players = await parseRoster(page);
    if (!players.length) {
      await dumpDebug(page, 'roster');
      console.warn('[benchapp] could not read any roster names ' +
        '(run with --debug and inspect scripts/.benchapp-debug-roster.html). Keeping last-good roster.');
      return;
    }

    const payload = {
      team: team.name,
      teamId: team.id,
      players,
      source: team.benchApp.rosterUrl,
      updated: nowIso(),
    };

    await writeJson(`${team.id}/roster.json`, payload, (d) => !d.players || !d.players.length);
    const byGroup = players.reduce((m, p) => ((m[p.group] = (m[p.group] || 0) + 1), m), {});
    console.log(`[benchapp] ${team.id} roster: ${players.length} people ` +
      `(${Object.entries(byGroup).map(([g, n]) => `${n} ${g}`).join(', ')}).`);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  // Never hard-fail the broader fetch:all pipeline on a BenchApp hiccup.
  console.warn('[benchapp] roster error; keeping last-good data:', err.message);
  process.exitCode = 0;
});
