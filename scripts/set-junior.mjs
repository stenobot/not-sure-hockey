/* Set a junior holder override that takes priority over user selections
   (unless the user has selected after the override was set).
   
   Usage:
     npm run set-junior "Name"    — set override to "Name"
     npm run set-junior --clear   — clear the override
*/
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const overrideFile = join(dataDir, 'junior-override.json');

const args = process.argv.slice(2);

if (!args.length) {
  console.error('Usage: npm run set-junior "<name>" or npm run set-junior --clear');
  process.exit(1);
}

try {
  mkdirSync(dataDir, { recursive: true });
  
  if (args[0] === '--clear') {
    const override = { name: null, setAt: new Date().toISOString() };
    writeFileSync(overrideFile, JSON.stringify(override, null, 2));
    console.log('[junior-override.json] cleared');
  } else {
    const name = args.join(' ').trim();
    if (!name) {
      console.error('Name cannot be empty');
      process.exit(1);
    }
    const override = { name, setAt: new Date().toISOString() };
    writeFileSync(overrideFile, JSON.stringify(override, null, 2));
    console.log(`[junior-override.json] set to "${name}"`);
  }
} catch (err) {
  console.error('Failed to write override:', err.message);
  process.exit(1);
}
