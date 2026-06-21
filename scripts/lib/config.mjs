// Shared configuration for the Not Sure Hockey data scrapers.

export const config = {
  teamId: '13343',
  teamName: 'Not Sure',
  baseUrl: 'https://krakenhockeyleague.com',
  // A normal browser User-Agent. The league site returns minimal/blocked
  // content to generic clients, so we identify as a browser.
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export function teamUrl(suffix) {
  return `${config.baseUrl}/team/${config.teamId}/${suffix}`;
}
