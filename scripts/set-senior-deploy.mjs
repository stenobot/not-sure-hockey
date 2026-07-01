/* Set senior override, commit, and push to main.

   Usage:
     npm run set-senior:deploy Andy
     npm run set-senior:deploy Blair
*/
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const rosterFile = join(dataDir, '13343', 'roster.json');
const overrideFile = join(dataDir, 'senior-override.json');

const args = process.argv.slice(2);

if (!args.length) {
  console.error('Usage: npm run set-senior:deploy <first-name>');
  console.error('Example: npm run set-senior:deploy Andy');
  process.exit(1);
}

function levenshtein(a, b) {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  const matrix = [];

  for (let i = 0; i <= bb.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= aa.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bb.length; i++) {
    for (let j = 1; j <= aa.length; j++) {
      if (bb.charAt(i - 1) === aa.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[bb.length][aa.length];
}

try {
  const rosterData = JSON.parse(readFileSync(rosterFile, 'utf8'));
  const firstNameInput = args.join(' ').toLowerCase();

  const allNames = rosterData.players
    .map(p => p.name)
    .filter(Boolean);

  // First try exact first-name match
  let matches = allNames.filter(name => {
    const firstName = name.split(' ')[0].toLowerCase();
    return firstName === firstNameInput;
  });

  // If no exact match, try fuzzy match on first names
  if (!matches.length) {
    const scored = allNames.map(name => {
      const firstName = name.split(' ')[0];
      const distance = levenshtein(firstName, firstNameInput);
      return { name, distance };
    });
    scored.sort((a, b) => a.distance - b.distance);
    const bestScore = scored[0]?.distance || Infinity;
    matches = scored
      .filter(s => s.distance <= bestScore + 1)
      .map(s => s.name);
  }

  if (!matches.length) {
    console.error(`No roster member found matching "${args[0]}"`);
    console.error('Available names:', allNames.join(', '));
    process.exit(1);
  }

  if (matches.length > 1) {
    console.error(
      `Ambiguous match for "${args[0]}": ${matches.join(', ')}`
    );
    process.exit(1);
  }

  const fullName = matches[0];
  console.log(`✓ Matched "${args[0]}" to "${fullName}"`);

  // Write override
  mkdirSync(dataDir, { recursive: true });
  const override = { name: fullName, setAt: new Date().toISOString() };
  writeFileSync(overrideFile, JSON.stringify(override, null, 2));
  console.log(`✓ Override set to "${fullName}"`);

  // Stage, commit, push
  try {
    execSync('git add data/senior-override.json', { cwd: join(__dirname, '..'), stdio: 'pipe' });
    console.log('✓ Staged override');

    execSync('git commit -m "Set senior tracker override" -m "Holder: ' + fullName + '" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"', {
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    console.log('✓ Committed');

    execSync('git push', { cwd: join(__dirname, '..'), stdio: 'pipe' });
    console.log('✓ Pushed to main — deployment triggered');
  } catch (gitErr) {
    if (gitErr.message.includes('nothing to commit')) {
      console.log('✓ No changes (override already set to this name)');
    } else if (gitErr.message.includes('rejected')) {
      console.error('✗ Push rejected — branch may be behind. Run: git pull --rebase && git push');
      process.exit(1);
    } else {
      throw gitErr;
    }
  }

} catch (err) {
  console.error('✗ Failed:', err.message);
  process.exit(1);
}
