// Writes data/teams.json — the manifest the frontend uses to build the team
// switcher (labels + default). Derived from the teams list in config.mjs so
// there is a single source of truth.

import { teams } from './lib/config.mjs';
import { writeJson } from './lib/parse.mjs';

const def = teams.find((t) => t.default) || teams[0];

const payload = {
  default: def.id,
  updated: new Date().toISOString(),
  teams: teams.map((t) => ({ id: t.id, name: t.name, division: t.division })),
};

await writeJson('teams.json', payload);
console.log(`Wrote teams.json (${teams.length} teams, default ${def.id}).`);
