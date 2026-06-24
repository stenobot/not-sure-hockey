// Helpers for the local, credentialed BenchApp attendance scraper.
//
// SECURITY: credentials and the persisted browser session live ONLY on the
// local machine. They are gitignored and must never be committed or shipped to
// the public site. The committed output (attendance.json) holds aggregate
// counts only — no names.

import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// Saved login session (cookies + localStorage) so we log in once and reuse it.
// We use a Playwright storageState file rather than a persistent browser
// profile: persistent Firefox profiles get locked / refuse to start headless,
// whereas a storageState file loads cleanly into a fresh context every run.
export const SESSION_DIR = resolve(REPO_ROOT, '.benchapp-session');
export const SESSION_FILE = resolve(SESSION_DIR, 'state.json');
const CREDS_FILE = resolve(REPO_ROOT, '.benchapp.local.json');

export async function ensureSessionDir() {
  await mkdir(SESSION_DIR, { recursive: true });
}

// A normal desktop browser fingerprint for the residential machine. Keeping
// locale/timezone consistent with a Seattle-area member avoids looking odd.
// Runs Playwright's Firefox (the user's default browser).
export const BROWSER_CONTEXT = {
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  viewport: { width: 1280, height: 900 },
};

// Load credentials from env vars first, then a gitignored local JSON file.
// Returns null when none are configured (callers should skip gracefully).
export async function loadCredentials() {
  const fromEnv = {
    email: process.env.BENCHAPP_EMAIL,
    password: process.env.BENCHAPP_PASSWORD,
  };
  if (fromEnv.email && fromEnv.password) return fromEnv;

  try {
    const raw = JSON.parse(await readFile(CREDS_FILE, 'utf8'));
    if (raw.email && raw.password) return { email: raw.email, password: raw.password };
  } catch {
    // No local creds file.
  }
  return null;
}

// Small randomized delay to keep interactions gentle / human-like.
export const humanDelay = (min = 400, max = 1100) =>
  new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
