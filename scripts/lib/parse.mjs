// Shared helpers for fetching and parsing league pages.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { config } from './config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(__dirname, '..', '..', 'data');

// Fetch a URL as text, using a browser User-Agent.
export async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': config.userAgent, Accept: 'text/html,*/*' },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
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
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`[${filename}] wrote ${path}`);
  return true;
}

export function nowIso() {
  return new Date().toISOString();
}
