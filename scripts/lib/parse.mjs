// Shared helpers for fetching and parsing league pages.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { config } from './config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(__dirname, '..', '..', 'data');

// Full browser-like headers help get past lighter bot protection.
const BROWSER_HEADERS = {
  'User-Agent': config.userAgent,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  Referer: `${config.baseUrl}/`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch a URL as text with browser-like headers and a few retries/backoff.
export async function fetchText(url, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' });
      if (res.ok) return res.text();
      lastErr = new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
      // Only retry on transient/blocking statuses.
      if (![403, 429, 500, 502, 503, 504].includes(res.status)) break;
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) await sleep(1000 * (i + 1) + Math.random() * 500);
  }
  throw lastErr;
}

// Fetch a URL and load it into cheerio.
export async function fetchDom(url) {
  const html = await fetchText(url);
  return cheerio.load(html);
}

// Collapse whitespace and trim.
export function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

// Parse text to a number; null if blank, or the original string if non-numeric.
export function num(text) {
  const t = clean(text);
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? t : n;
}

// Run a scraper's async main() with consistent error handling.
export function runScraper(fn) {
  fn().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Write a JSON file, but keep the last-good copy if the new payload looks empty.
// `isEmpty` decides whether the freshly scraped data should be rejected.
export async function writeJson(filename, data, isEmpty) {
  const path = resolve(DATA_DIR, filename);
  if (typeof isEmpty === 'function' && isEmpty(data)) {
    try {
      await readFile(path, 'utf8');
      console.warn(
        `[${filename}] scrape produced empty data; keeping previous file.`
      );
      return false;
    } catch {
      // No previous file: fall through and write the (empty) result.
    }
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`[${filename}] wrote ${path}`);
  return true;
}

export function nowIso() {
  return new Date().toISOString();
}
