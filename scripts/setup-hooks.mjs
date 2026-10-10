// Points git at the committed hooks in .githooks/ (runs on `npm install`). Does nothing outside a git checkout, e.g. in CI tarballs.
import { execSync } from 'node:child_process';

try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore' });
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
  console.log('git hooks enabled (.githooks/pre-commit runs lint and unit tests)');
} catch {
  // not a git checkout, or git is missing: nothing to set up
}
