// Shared configuration for the Not Sure Hockey data scrapers.

// The teams this site covers. `default: true` marks the team shown on first visit.
// `benchApp` (optional) configures the local, credentialed attendance scraper —
// only teams that have a BenchApp account set it.
export const teams = [
  {
    id: '13343',
    name: 'Not Sure',
    division: 'Division 6D',
    default: true,
    benchApp: {
      scheduleUrl:
        'https://www.benchapp.com/schedule/3455757?teamId=885515&seasonId=514831',
      teamId: '885515',
      seasonId: '514831',
    },
  },
  { id: '9572', name: 'Not Sure', division: 'Division 5A' },
];

export const config = {
  baseUrl: 'https://krakenhockeyleague.com',
  // A normal browser User-Agent. The league site returns minimal/blocked
  // content to generic clients, so we identify as a browser.
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

export function teamUrl(teamId, suffix) {
  return `${config.baseUrl}/team/${teamId}/${suffix}`;
}
